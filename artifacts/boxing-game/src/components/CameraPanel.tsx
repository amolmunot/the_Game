import { useEffect, useRef } from "react";
import type { GestureState, GameState } from "../game/types";
import { CONNECTIONS, LANDMARK_COLORS, MIN_VISIBILITY } from "../hooks/usePose";

interface Props {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  gesture: GestureState;
  gameState: GameState;
  fps: number;
  poseReady: boolean;
  cameraError: string | null;
  rawLandmarks: number[][] | null;
}

const LEGEND_ITEMS = [
  { color: "#ff69b4", label: "NOSE" },
  { color: "#00e5ff", label: "LEFT SHOULDER" },
  { color: "#00e5ff", label: "RIGHT SHOULDER" },
  { color: "#00ff88", label: "LEFT ELBOW" },
  { color: "#00ff88", label: "RIGHT ELBOW" },
  { color: "#ffee00", label: "LEFT WRIST" },
  { color: "#ff8800", label: "RIGHT WRIST" },
  { color: "#dd44ff", label: "LEFT HIP" },
  { color: "#dd44ff", label: "RIGHT HIP" },
  { color: "#aaaaaa", label: "LEFT KNEE" },
  { color: "#aaaaaa", label: "RIGHT KNEE" },
];

const KEY_INDICES = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];

export default function CameraPanel({
  videoRef, gesture, gameState, fps, poseReady, cameraError, rawLandmarks,
}: Props) {
  const overlayRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = overlayRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!rawLandmarks || rawLandmarks.length < 29) return;

    const W = canvas.width;
    const H = canvas.height;
    const mx = (x: number) => (1 - x) * W;
    const my = (y: number) => y * H;

    // Connections
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    for (const [i, j] of CONNECTIONS) {
      const a = rawLandmarks[i];
      const b = rawLandmarks[j];
      if (!a || !b) continue;
      const visA = a[3] ?? 1;
      const visB = b[3] ?? 1;
      if (visA < MIN_VISIBILITY || visB < MIN_VISIBILITY) continue;
      const alpha = Math.min(visA, visB);
      ctx.strokeStyle = `rgba(0,230,130,${(alpha * 0.9).toFixed(2)})`;
      ctx.beginPath();
      ctx.moveTo(mx(a[0]), my(a[1]));
      ctx.lineTo(mx(b[0]), my(b[1]));
      ctx.stroke();
    }

    // Landmark dots
    for (const idx of KEY_INDICES) {
      const lm = rawLandmarks[idx];
      if (!lm) continue;
      const vis = lm[3] ?? 1;
      if (vis < MIN_VISIBILITY) continue;
      const color = LANDMARK_COLORS[idx] ?? "#ffffff";
      ctx.globalAlpha = Math.max(0, Math.min(1, vis));
      ctx.beginPath();
      ctx.arc(mx(lm[0]), my(lm[1]), 5.5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.globalAlpha = Math.max(0, Math.min(1, vis * 0.6));
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }, [rawLandmarks]);

  const { player, ai, phase, combo } = gameState;

  const stateLabel =
    phase === "FIGHTING" ? (
      player.state === "BLOCKING" ? <span style={{ color: "#44aaff" }}>BLOCK</span> :
      player.state === "JABBING"  ? <span style={{ color: "#ff4444" }}>JAB</span> :
      player.state === "CROSSING" ? <span style={{ color: "#ff8800" }}>CROSS</span> :
      player.state === "DODGING_LEFT" || player.state === "DODGING_RIGHT" ? <span style={{ color: "#ffdd00" }}>DODGE</span> :
      player.state === "HIT" ? <span style={{ color: "#ff4444" }}>HIT</span> :
      player.state === "KO"  ? <span style={{ color: "#ff0000" }}>KO</span> :
      <span style={{ color: "#44ff88" }}>FIGHT</span>
    ) : <span style={{ color: "#888" }}>{phase}</span>;

  const punchLabel = gesture.jabDetected ? <span style={{ color: "#ff4444" }}>JAB</span>
    : gesture.crossDetected ? <span style={{ color: "#ff8800" }}>CROSS</span>
    : <span style={{ color: "#44ff88" }}>READY</span>;

  const blockLabel = gesture.blocking
    ? <span style={{ color: "#44aaff" }}>ACTIVE</span>
    : <span style={{ color: "#888" }}>INACTIVE</span>;

  return (
    <div style={{
      width: 340,
      minWidth: 280,
      background: "#080e1a",
      borderRight: "2px solid #1a2d4a",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      fontFamily: "'Press Start 2P', monospace",
    }}>
      {/* Camera Feed */}
      <div style={{ padding: "10px 12px 6px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: poseReady ? "#44ff88" : "#ff4444", boxShadow: poseReady ? "0 0 6px #44ff88" : "none" }} />
          <span style={{ color: "#00e5ff", fontSize: 8, letterSpacing: 1 }}>CAMERA FEED</span>
          {poseReady && <span style={{ color: "#44ff88", fontSize: 6, marginLeft: "auto" }}>● POSE ACTIVE</span>}
        </div>

        {/* Video + Overlay */}
        <div style={{ position: "relative", width: "100%", paddingTop: "75%", background: "#0a0f18", borderRadius: 4, overflow: "hidden", border: "1px solid #1a2d4a" }}>
          <video
            ref={videoRef}
            muted playsInline autoPlay
            style={{
              position: "absolute", inset: 0, width: "100%", height: "100%",
              objectFit: "cover", transform: "scaleX(-1)",
            }}
          />
          <canvas
            ref={overlayRef}
            width={320} height={240}
            style={{
              position: "absolute", inset: 0, width: "100%", height: "100%",
              pointerEvents: "none",
            }}
          />
          {cameraError && (
            <div style={{
              position: "absolute", inset: 0, display: "flex", alignItems: "center",
              justifyContent: "center", background: "rgba(0,0,0,0.7)", padding: 8,
            }}>
              <span style={{ color: "#ff4444", fontSize: 7, textAlign: "center", lineHeight: 1.8 }}>{cameraError}</span>
            </div>
          )}
          {!poseReady && !cameraError && (
            <div style={{
              position: "absolute", inset: 0, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 8,
            }}>
              <div style={{ color: "#ffdd00", fontSize: 7, textAlign: "center" }}>LOADING POSE MODEL...</div>
            </div>
          )}
        </div>
      </div>

      {/* Pose Landmarks Legend */}
      <div style={{ padding: "6px 12px", borderTop: "1px solid #1a2d4a" }}>
        <div style={{ color: "#00e5ff", fontSize: 7, marginBottom: 6, letterSpacing: 1 }}>POSE LANDMARKS</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px 8px" }}>
          {LEGEND_ITEMS.map(({ color, label }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }} />
              <span style={{ color: "#aaa", fontSize: 5.5, letterSpacing: 0.5 }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Status */}
      <div style={{ padding: "8px 12px", borderTop: "1px solid #1a2d4a" }}>
        <div style={{ color: "#00e5ff", fontSize: 7, marginBottom: 6, letterSpacing: 1 }}>STATUS</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 0", fontSize: 7 }}>
          {[
            ["STATE:",  stateLabel],
            ["SCORE:",  <span key="sc" style={{ color: "#ffdd00" }}>{player.score}</span>],
            ["PUNCH:",  punchLabel],
            ["COMBO:",  <span key="co" style={{ color: combo >= 2 ? "#ffdd00" : "#888" }}>{combo}x</span>],
            ["BLOCK:",  blockLabel],
            ["FPS:",    <span key="fp" style={{ color: fps > 25 ? "#44ff88" : "#ff4444" }}>{fps}</span>],
          ].map(([k, v], i) => (
            <div key={i as number} style={{ display: "flex", justifyContent: "space-between", paddingRight: i % 2 === 0 ? 10 : 0, color: "#666" }}>
              <span>{k}</span>
              <span>{v as React.ReactNode}</span>
            </div>
          ))}
        </div>
      </div>

      {/* How to Play */}
      <div style={{ padding: "8px 12px", borderTop: "1px solid #1a2d4a", flex: 1 }}>
        <div style={{ color: "#00e5ff", fontSize: 7, marginBottom: 8, letterSpacing: 1 }}>HOW TO PLAY</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {[
            { icon: "👊", color: "#ff4444", label: "PUNCH", desc: "Extend arm forward fast" },
            { icon: "🛡", color: "#44aaff", label: "BLOCK", desc: "Raise both hands to face" },
            { icon: "↔", color: "#ffdd00", label: "DODGE", desc: "Lean shoulders left/right" },
          ].map(({ icon, color, label, desc }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16, flexShrink: 0 }}>{icon}</span>
              <div>
                <div style={{ color, fontSize: 6, marginBottom: 2 }}>{label}</div>
                <div style={{ color: "#666", fontSize: 5.5 }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Move Indicators */}
      <div style={{ padding: "8px 12px", borderTop: "1px solid #1a2d4a", display: "flex", gap: 6 }}>
        {[
          { label: "JAB",   active: gesture.jabDetected,   icon: "👊" },
          { label: "CROSS", active: gesture.crossDetected,  icon: "👊" },
          { label: "BLOCK", active: gesture.blocking,       icon: "🛡" },
          { label: "DODGE", active: gesture.dodgingLeft || gesture.dodgingRight, icon: "↔" },
        ].map(({ label, active, icon }) => (
          <div key={label} style={{
            flex: 1, textAlign: "center", padding: "5px 2px",
            border: `1px solid ${active ? "#44ff88" : "#1a2d4a"}`,
            borderRadius: 4,
            background: active ? "rgba(68,255,136,0.12)" : "transparent",
            transition: "all 0.15s",
          }}>
            <div style={{ fontSize: 12 }}>{icon}</div>
            <div style={{ color: active ? "#44ff88" : "#444", fontSize: 5.5, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
