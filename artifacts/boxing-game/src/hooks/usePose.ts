import { useEffect, useRef, useState, useCallback } from "react";
import type { PoseData, GestureState } from "../game/types";

const POSE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
const MEDIAPIPE_WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";

// Tuned thresholds
const PUNCH_SPEED_THRESHOLD = 0.14;   // normalized coords/sec — lower = more sensitive
const BLOCK_WRIST_Y_THRESHOLD = 0.20; // wrist must be within this of nose Y
const BLOCK_WRIST_X_THRESHOLD = 0.28; // wrist must be within this of nose X
const DODGE_THRESHOLD = 0.10;         // shoulder center offset from 0.5
const PUNCH_COOLDOWN_MS = 320;
const EMA_ALPHA = 0.40;               // smoothing: higher = more responsive, lower = smoother
const MIN_VISIBILITY = 0.45;          // skip landmark if confidence below this

// Skeleton connections (MediaPipe Pose indices)
const CONNECTIONS: [number, number][] = [
  [0, 11], [0, 12],           // nose to shoulders
  [11, 12],                   // shoulders
  [11, 13], [13, 15],         // left arm
  [12, 14], [14, 16],         // right arm
  [11, 23], [12, 24],         // torso sides
  [23, 24],                   // hips
  [23, 25], [25, 27],         // left leg
  [24, 26], [26, 28],         // right leg
];

// Color per landmark index
const LANDMARK_COLORS: Record<number, string> = {
  0:  "#ff69b4", // nose — pink
  11: "#00e5ff", // left shoulder — cyan
  12: "#00e5ff", // right shoulder — cyan
  13: "#00ff88", // left elbow — green
  14: "#00ff88", // right elbow — green
  15: "#ffee00", // left wrist — yellow
  16: "#ff8800", // right wrist — orange
  23: "#dd44ff", // left hip — purple
  24: "#dd44ff", // right hip — purple
  25: "#aaaaaa", // left knee — gray
  26: "#aaaaaa", // right knee — gray
  27: "#ffffff", // left ankle — white
  28: "#ffffff", // right ankle — white
};

interface RawLandmark { x: number; y: number; z: number; visibility: number; }

export type SkeletonLandmarks = { x: number; y: number; color: string; visible: boolean }[];

interface WristSample { x: number; y: number; t: number; }

export function usePose(videoRef: React.RefObject<HTMLVideoElement | null>) {
  const [poseReady, setPoseReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [gesture, setGesture] = useState<GestureState>({
    jabDetected: false, crossDetected: false,
    blocking: false, dodgingLeft: false, dodgingRight: false,
  });
  const [skeletonLandmarks, setSkeletonLandmarks] = useState<SkeletonLandmarks>([]);
  const [rawLandmarks, setRawLandmarks] = useState<number[][] | null>(null);

  const landmarkerRef = useRef<unknown>(null);
  const smoothedRef = useRef<RawLandmark[] | null>(null);
  const leftHistory = useRef<WristSample[]>([]);
  const rightHistory = useRef<WristSample[]>([]);
  const lastJabTime = useRef(0);
  const lastCrossTime = useRef(0);
  const blockFrames = useRef(0);
  const rafRef = useRef<number>(0);
  const activeRef = useRef(true);

  const initPose = useCallback(async () => {
    try {
      const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
      const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);
      const lm = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: POSE_MODEL_URL, delegate: "CPU" },
        runningMode: "VIDEO",
        numPoses: 1,
        minPoseDetectionConfidence: 0.45,
        minPosePresenceConfidence: 0.45,
        minTrackingConfidence: 0.45,
      });
      landmarkerRef.current = lm;
      setPoseReady(true);
    } catch (err) {
      console.error("Pose init failed:", err);
      setCameraError("Pose model failed to load. Check connection.");
    }
  }, []);

  const initCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err) {
      console.error("Camera error:", err);
      setCameraError("Camera access denied. Allow webcam to play.");
    }
  }, [videoRef]);

  useEffect(() => {
    activeRef.current = true;
    initPose();
    initCamera();
    return () => {
      activeRef.current = false;
      cancelAnimationFrame(rafRef.current);
      const v = videoRef.current;
      if (v?.srcObject) {
        (v.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  useEffect(() => {
    if (!poseReady || !landmarkerRef.current) return;
    let lastTs = -1;

    const tick = () => {
      if (!activeRef.current) return;
      const video = videoRef.current;
      if (!video || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      const now = performance.now();
      if (now === lastTs) { rafRef.current = requestAnimationFrame(tick); return; }
      lastTs = now;

      type Landmarker = {
        detectForVideo: (v: HTMLVideoElement, t: number) => {
          landmarks: RawLandmark[][];
        };
      };
      const lm = landmarkerRef.current as Landmarker;
      const result = lm.detectForVideo(video, now);

      if (result.landmarks?.length > 0) {
        const raw = result.landmarks[0];
        const smoothed = applyEMA(raw, smoothedRef.current);
        smoothedRef.current = smoothed;
        const gs = detectGestures(smoothed, now);
        setGesture(gs);
        setSkeletonLandmarks(buildSkeletonData(smoothed));
        // Export full landmark array for skeleton overlay drawing
        setRawLandmarks(smoothed.map(lm => [lm.x, lm.y, lm.z ?? 0, lm.visibility ?? 1]));
      } else {
        smoothedRef.current = null;
        setGesture({ jabDetected: false, crossDetected: false, blocking: false, dodgingLeft: false, dodgingRight: false });
        setSkeletonLandmarks([]);
        setRawLandmarks(null);
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [poseReady]);

  function applyEMA(raw: RawLandmark[], prev: RawLandmark[] | null): RawLandmark[] {
    if (!prev || prev.length !== raw.length) return raw;
    return raw.map((r, i) => {
      const p = prev[i];
      const vis = r.visibility ?? 1;
      if (vis < MIN_VISIBILITY) return p; // skip low-confidence, keep previous
      const a = EMA_ALPHA;
      return {
        x: a * r.x + (1 - a) * p.x,
        y: a * r.y + (1 - a) * p.y,
        z: a * r.z + (1 - a) * p.z,
        visibility: a * (r.visibility ?? 1) + (1 - a) * (p.visibility ?? 1),
      };
    });
  }

  function detectGestures(lms: RawLandmark[], now: number): GestureState {
    if (lms.length < 29) {
      return { jabDetected: false, crossDetected: false, blocking: false, dodgingLeft: false, dodgingRight: false };
    }

    const nose = lms[0];
    const lShoulder = lms[11], rShoulder = lms[12];
    const lWrist = lms[15], rWrist = lms[16];

    // Wrist velocity (punch detection)
    const WINDOW = 120;
    leftHistory.current.push({ x: lWrist.x, y: lWrist.y, t: now });
    rightHistory.current.push({ x: rWrist.x, y: rWrist.y, t: now });
    leftHistory.current = leftHistory.current.filter(p => now - p.t < WINDOW);
    rightHistory.current = rightHistory.current.filter(p => now - p.t < WINDOW);

    let jabDetected = false;
    let crossDetected = false;

    const computeSpeed = (hist: WristSample[]) => {
      if (hist.length < 3) return 0;
      const oldest = hist[0];
      const newest = hist[hist.length - 1];
      const dt = (newest.t - oldest.t) / 1000;
      if (dt < 0.01) return 0;
      const dx = newest.x - oldest.x;
      const dy = newest.y - oldest.y;
      return Math.sqrt(dx * dx + dy * dy) / dt;
    };

    const lSpeed = computeSpeed(leftHistory.current);
    const rSpeed = computeSpeed(rightHistory.current);

    if (lSpeed > PUNCH_SPEED_THRESHOLD && now - lastJabTime.current > PUNCH_COOLDOWN_MS) {
      jabDetected = true;
      lastJabTime.current = now;
      leftHistory.current = [];
    }
    if (rSpeed > PUNCH_SPEED_THRESHOLD && now - lastCrossTime.current > PUNCH_COOLDOWN_MS) {
      crossDetected = true;
      lastCrossTime.current = now;
      rightHistory.current = [];
    }

    // Block detection: both wrists near nose with hysteresis
    const lNearFace = Math.abs(lWrist.y - nose.y) < BLOCK_WRIST_Y_THRESHOLD &&
                      Math.abs(lWrist.x - nose.x) < BLOCK_WRIST_X_THRESHOLD;
    const rNearFace = Math.abs(rWrist.y - nose.y) < BLOCK_WRIST_Y_THRESHOLD &&
                      Math.abs(rWrist.x - nose.x) < BLOCK_WRIST_X_THRESHOLD;
    const bothNear = lNearFace && rNearFace;
    blockFrames.current = bothNear ? Math.min(6, blockFrames.current + 1) : Math.max(0, blockFrames.current - 1);
    const blocking = blockFrames.current >= 3;

    // Dodge: shoulder midpoint vs center (0.5)
    const midX = (lShoulder.x + rShoulder.x) / 2;
    const dodgingLeft  = midX < 0.5 - DODGE_THRESHOLD;
    const dodgingRight = midX > 0.5 + DODGE_THRESHOLD;

    return { jabDetected, crossDetected, blocking, dodgingLeft, dodgingRight };
  }

  function buildSkeletonData(lms: RawLandmark[]): SkeletonLandmarks {
    const KEY_INDICES = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
    return KEY_INDICES.map(i => ({
      x: lms[i]?.x ?? 0,
      y: lms[i]?.y ?? 0,
      color: LANDMARK_COLORS[i] ?? "#ffffff",
      visible: (lms[i]?.visibility ?? 0) > MIN_VISIBILITY,
    }));
  }

  return { gesture, poseReady, cameraError, skeletonLandmarks, rawLandmarks };
}

// Draw skeleton on canvas overlay
export function drawSkeleton(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  rawLandmarks: RawLandmark[],
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!rawLandmarks || rawLandmarks.length < 29) return;

  const W = canvas.width;
  const H = canvas.height;

  // Mirror x to match mirrored video
  const mx = (lm: RawLandmark) => (1 - lm.x) * W;
  const my = (lm: RawLandmark) => lm.y * H;

  // Draw connections
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  for (const [i, j] of CONNECTIONS) {
    const a = rawLandmarks[i], b = rawLandmarks[j];
    if (!a || !b) continue;
    const visA = a.visibility ?? 0, visB = b.visibility ?? 0;
    if (visA < MIN_VISIBILITY || visB < MIN_VISIBILITY) continue;
    const alpha = Math.min(visA, visB);
    ctx.strokeStyle = `rgba(0, 255, 150, ${alpha * 0.85})`;
    ctx.beginPath();
    ctx.moveTo(mx(a), my(a));
    ctx.lineTo(mx(b), my(b));
    ctx.stroke();
  }

  // Draw landmarks
  const KEY_INDICES = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
  for (const idx of KEY_INDICES) {
    const lm = rawLandmarks[idx];
    if (!lm) continue;
    const vis = lm.visibility ?? 0;
    if (vis < MIN_VISIBILITY) continue;
    const color = LANDMARK_COLORS[idx] ?? "#ffffff";
    const x = mx(lm), y = my(lm);
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.globalAlpha = vis;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

// Export for use in CameraPanel
export { CONNECTIONS, LANDMARK_COLORS, MIN_VISIBILITY };
