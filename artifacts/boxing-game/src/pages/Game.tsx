import { useEffect, useRef, useCallback, useState } from "react";
import type { GameState, Fighter, FighterState } from "../game/types";
import { ThreeGame } from "../three/ThreeGame";
import { tickAI } from "../game/ai";
import { Audio } from "../game/audio";
import { usePose } from "../hooks/usePose";
import CameraPanel from "../components/CameraPanel";

const ROUND_DURATION = 60_000;
const MAX_ROUNDS = 3;

function makeFighter(isPlayer: boolean): Fighter {
  return {
    hp: 100, maxHp: 100, state: "IDLE" as FighterState, stateTimer: 0,
    score: 0, isPlayer,
    x: isPlayer ? 200 : 600, y: 280,
    facingRight: isPlayer, hitFlash: 0, dodgeOffset: 0, punchArm: 0, blockArm: 0,
  };
}

function makeState(): GameState {
  return {
    player: makeFighter(true), ai: makeFighter(false),
    phase: "INTRO", roundTimer: ROUND_DURATION, roundTimerMax: ROUND_DURATION,
    combo: 0, maxCombo: 0, hitEffects: [], screenShake: 0,
    round: 1, maxRounds: MAX_ROUNDS, countdown: 3,
    aiState: "IDLE", aiStateTimer: 500, aiAttackCooldown: 1200, aiBlockTimer: 0,
  };
}

function HPBar({ hp, maxHp, name, flipped }: { hp: number; maxHp: number; name: string; flipped: boolean }) {
  const pct = Math.max(0, hp / maxHp);
  const color = pct > 0.55 ? "#44dd66" : pct > 0.28 ? "#ddaa22" : "#dd2222";
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: flipped ? "row-reverse" : "row", alignItems: "center", gap: 8 }}>
      <span style={{ color: "#fff", fontSize: 7, whiteSpace: "nowrap" }}>{name}</span>
      <div style={{ flex: 1, height: 14, background: "#111", border: "1px solid #333", borderRadius: 2, overflow: "hidden" }}>
        <div style={{
          height: "100%", background: color, width: `${pct * 100}%`,
          float: flipped ? "right" : "left",
          transition: "width 0.2s, background 0.3s",
          boxShadow: `0 0 8px ${color}88`,
        }} />
      </div>
      <span style={{ color, fontSize: 6, minWidth: 28, textAlign: "right" }}>{Math.round(pct * 100)}%</span>
    </div>
  );
}

export default function Game() {
  const threeCanvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const gameRef = useRef<ThreeGame | null>(null);
  const stateRef = useRef<GameState>(makeState());
  const lastFrameRef = useRef<number>(0);
  const rafRef = useRef<number>(0);
  const cdIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const gestureRef = useRef(usePose["gesture" as never] as unknown);
  const fpsCountRef = useRef({ frames: 0, last: 0, fps: 0 });
  const uiUpdateRef = useRef(0);

  const { gesture, poseReady, cameraError, skeletonLandmarks, rawLandmarks } = usePose(
    videoRef as React.RefObject<HTMLVideoElement | null>
  );

  const [webglError, setWebglError] = useState(false);
  const [uiState, setUiState] = useState({
    phase: "INTRO" as GameState["phase"],
    playerHp: 100, aiHp: 100, roundTimer: ROUND_DURATION,
    combo: 0, maxCombo: 0, round: 1, countdown: 3, fps: 0,
    playerScore: 0, aiScore: 0,
  });

  useEffect(() => { gestureRef.current = gesture; }, [gesture]);

  // Initialize Three.js
  useEffect(() => {
    const canvas = threeCanvasRef.current;
    if (!canvas) return;
    let game: ThreeGame;
    try {
      game = new ThreeGame(canvas);
    } catch {
      setWebglError(true);
      return;
    }
    gameRef.current = game;

    const ro = new ResizeObserver(() => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w && h) game.resize(w, h);
    });
    ro.observe(canvas.parentElement!);

    return () => {
      ro.disconnect();
      game.dispose();
    };
  }, []);

  const startRound = useCallback((state: GameState) => {
    state.phase = "COUNTDOWN";
    state.countdown = 3;
    state.player.state = "IDLE";
    state.ai.state = "IDLE";
    state.player.stateTimer = 0;
    state.ai.stateTimer = 0;
    Audio.roundBell();

    if (cdIntervalRef.current) clearInterval(cdIntervalRef.current);
    cdIntervalRef.current = setInterval(() => {
      const s = stateRef.current;
      s.countdown -= 1;
      if (s.countdown <= 0) {
        clearInterval(cdIntervalRef.current!);
        s.phase = "FIGHTING";
        s.roundTimer = ROUND_DURATION;
        Audio.countdownGo();
      } else {
        Audio.countdown();
      }
    }, 1000);
  }, []);

  const startGame = useCallback(() => {
    Audio.resume();
    const fresh = makeState();
    stateRef.current = fresh;
    startRound(fresh);
  }, [startRound]);

  const processGestures = useCallback((state: GameState, dt: number) => {
    const g = gestureRef.current as typeof gesture;
    const player = state.player;

    if (player.state === "KO") return;

    if (player.stateTimer > 0) {
      player.stateTimer -= dt;
      if (player.stateTimer <= 0) {
        player.state = "IDLE";
        player.punchArm = 0;
        player.blockArm = 0;
        player.dodgeOffset = 0;
      }
      if (player.hitFlash > 0) player.hitFlash--;
      return;
    }
    if (player.hitFlash > 0) player.hitFlash--;

    const tryPunch = (isPunch: boolean, type: FighterState, dmg: number, punchArm: number) => {
      if (!isPunch || player.state !== "IDLE") return;
      player.state = type;
      player.punchArm = punchArm;
      player.stateTimer = type === "JABBING" ? 280 : 330;

      const ai = state.ai;
      const aiBlocking = ai.state === "BLOCKING";
      const aiDodging  = ai.state === "DODGING_LEFT" || ai.state === "DODGING_RIGHT";
      const hit = !aiBlocking && !aiDodging && ai.state !== "HIT" && ai.state !== "KO";

      if (hit) {
        ai.hp = Math.max(0, ai.hp - dmg);
        state.combo++;
        state.maxCombo = Math.max(state.maxCombo, state.combo);
        player.score += dmg * state.combo;
        ai.hitFlash = type === "JABBING" ? 10 : 14;
        ai.state = ai.hp <= 0 ? "KO" : "HIT";
        ai.stateTimer = ai.hp <= 0 ? 9999 : 350;
        state.screenShake = type === "JABBING" ? 3 : 6;
        Audio.punchHit();
        if (state.combo >= 2) Audio.combo(state.combo);
        if (ai.hp <= 0) { Audio.ko(); state.screenShake = 10; }
        state.hitEffects.push({ x: ai.x, y: ai.y - 50, timer: 600, maxTimer: 600, type: type === "JABBING" ? "jab" : "cross", text: state.combo >= 2 ? `${state.combo}x ${type === "JABBING" ? "JAB" : "CROSS"}!` : type === "JABBING" ? "JAB!" : "CROSS!" });
        gameRef.current?.spawnHitParticles(2.3, 0, false);
      } else {
        Audio.punchMiss();
        if (aiBlocking) { Audio.block(); state.hitEffects.push({ x: ai.x, y: ai.y - 40, timer: 400, maxTimer: 400, type: "block", text: "BLOCKED!" }); }
        state.combo = 0;
      }
    };

    tryPunch(g.jabDetected, "JABBING", 8, 1);
    tryPunch(g.crossDetected, "CROSSING", 13, 2);

    if (!g.jabDetected && !g.crossDetected) {
      if (g.blocking && player.state === "IDLE") {
        player.state = "BLOCKING"; player.blockArm = 1; player.stateTimer = 220;
      } else if (g.dodgingLeft && player.state === "IDLE") {
        player.state = "DODGING_LEFT"; player.stateTimer = 260; Audio.dodge();
      } else if (g.dodgingRight && player.state === "IDLE") {
        player.state = "DODGING_RIGHT"; player.stateTimer = 260; Audio.dodge();
      }
    }
  }, [gesture]);

  const gameLoop = useCallback((ts: number) => {
    const dt = Math.min(ts - lastFrameRef.current, 50);
    lastFrameRef.current = ts;

    // FPS counter
    const fpsC = fpsCountRef.current;
    fpsC.frames++;
    if (ts - fpsC.last > 1000) {
      fpsC.fps = fpsC.frames;
      fpsC.frames = 0;
      fpsC.last = ts;
    }

    const state = stateRef.current;

    if (state.phase === "FIGHTING") {
      state.roundTimer -= dt;
      processGestures(state, dt);

      const aiUpdates = tickAI(state, dt);
      if (aiUpdates.player) state.player = { ...state.player, ...aiUpdates.player };
      if (aiUpdates.ai)     state.ai     = { ...state.ai, ...aiUpdates.ai };
      Object.assign(state, { ...aiUpdates, player: state.player, ai: state.ai });

      state.hitEffects = state.hitEffects
        .map(fx => ({ ...fx, timer: fx.timer - dt }))
        .filter(fx => fx.timer > 0);

      if (state.screenShake > 0) state.screenShake = Math.max(0, state.screenShake - dt * 0.14);

      const roundOver = state.ai.state === "KO" || state.player.state === "KO" || state.roundTimer <= 0;
      if (roundOver && state.phase === "FIGHTING") {
        if (state.round >= MAX_ROUNDS) {
          state.phase = "GAME_OVER";
        } else {
          state.phase = "ROUND_OVER";
          setTimeout(() => {
            state.round++;
            state.player = { ...makeFighter(true), score: state.player.score };
            state.ai     = { ...makeFighter(false), score: state.ai.score };
            startRound(state);
          }, 2800);
        }
        Audio.roundBell();
      }
    }

    if (gameRef.current) {
      gameRef.current.update(state, dt);
      gameRef.current.render();
    }

    // Throttle React re-renders to ~8fps — HUD doesn't need 60fps updates
    uiUpdateRef.current += dt;
    if (uiUpdateRef.current >= 125) {
      uiUpdateRef.current = 0;
      setUiState({
        phase: state.phase,
        playerHp: state.player.hp, aiHp: state.ai.hp,
        roundTimer: state.roundTimer, combo: state.combo,
        maxCombo: state.maxCombo, round: state.round,
        countdown: state.countdown, fps: fpsC.fps,
        playerScore: state.player.score, aiScore: state.ai.score,
      });
    }

    rafRef.current = requestAnimationFrame(gameLoop);
  }, [processGestures, startRound]);

  useEffect(() => {
    lastFrameRef.current = performance.now();
    rafRef.current = requestAnimationFrame(gameLoop);
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (cdIntervalRef.current) clearInterval(cdIntervalRef.current);
    };
  }, [gameLoop]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "Enter") {
        const p = stateRef.current.phase;
        if (p === "INTRO" || p === "GAME_OVER") startGame();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [startGame]);

  if (webglError) {
    return (
      <div style={{ display: "flex", width: "100%", height: "100%", alignItems: "center", justifyContent: "center", background: "#050a12", flexDirection: "column", gap: 24, padding: 40 }}>
        <div style={{ color: "#ffdd00", fontSize: 16, fontFamily: "'Press Start 2P', monospace", textAlign: "center" }}>SHADOWBOXER OS</div>
        <div style={{ color: "#ff4444", fontSize: 8, fontFamily: "'Press Start 2P', monospace", textAlign: "center", lineHeight: 2.2 }}>
          WEBGL NOT AVAILABLE IN PREVIEW<br/>
          <span style={{ color: "#888" }}>The 3D engine requires WebGL GPU support.</span>
        </div>
        <div style={{ color: "#00e5ff", fontSize: 7, fontFamily: "'Press Start 2P', monospace", textAlign: "center", lineHeight: 2.5, border: "1px solid #1a2d4a", padding: "20px 28px", borderRadius: 4 }}>
          ▶ OPEN IN YOUR BROWSER<br/>
          <span style={{ color: "#888" }}>Copy the preview URL and open in Chrome/Firefox</span><br/>
          <span style={{ color: "#888" }}>for the full 3D experience with webcam controls.</span>
        </div>
        <div style={{ color: "#444", fontSize: 6, fontFamily: "'Press Start 2P', monospace", textAlign: "center", lineHeight: 2.2 }}>
          FEATURES: Three.js 3D Arena · Low-Poly Fighters<br/>
          MediaPipe Pose Tracking · Skeleton Overlay<br/>
          Japanese Garden Environment · Hit Particles
        </div>
      </div>
    );
  }

  const secs = Math.ceil(uiState.roundTimer / 1000);
  const timerColor = secs <= 10 ? "#ff4444" : "#ffdd00";
  const playerWon  = uiState.phase === "GAME_OVER" && stateRef.current.ai.state === "KO";

  return (
    <div style={{ display: "flex", width: "100%", height: "100%", background: "#050a12", overflow: "hidden" }}>
      {/* Left: Camera Panel */}
      <CameraPanel
        videoRef={videoRef}
        gesture={gesture}
        gameState={stateRef.current}
        fps={uiState.fps}
        poseReady={poseReady}
        cameraError={cameraError}
        rawLandmarks={rawLandmarks}
      />

      {/* Right: Game Area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
        {/* Header */}
        <div style={{
          padding: "6px 16px", background: "#080e1a", borderBottom: "1px solid #1a2d4a",
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <span style={{ color: "#00e5ff", fontSize: 8, letterSpacing: 1 }}>SHADOWBOXER OS</span>
          <span style={{ color: "#333", fontSize: 7 }}>v1.0</span>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ color: "#888", fontSize: 6 }}>CAMERA: <span style={{ color: poseReady ? "#44ff88" : "#ff4444" }}>●</span></span>
            <span style={{ color: "#888", fontSize: 6 }}>BATTLE MODE</span>
            <span style={{ color: "#ffdd00", fontSize: 10 }}>TIME {String(Math.floor(secs / 60)).padStart(2,"0")}:{String(secs % 60).padStart(2,"0")}</span>
          </div>
        </div>

        {/* HUD Bar: Health + VS */}
        <div style={{
          padding: "8px 16px", background: "#080e1a", borderBottom: "1px solid #1a2d4a",
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <HPBar hp={uiState.playerHp} maxHp={100} name="YOU" flipped={false} />
          <div style={{ textAlign: "center", minWidth: 40 }}>
            <div style={{ color: "#666", fontSize: 9, fontWeight: "bold" }}>VS</div>
            <div style={{ color: "#888", fontSize: 6 }}>RND {uiState.round}/{MAX_ROUNDS}</div>
          </div>
          <HPBar hp={uiState.aiHp} maxHp={100} name="AI" flipped={true} />
        </div>

        {/* Three.js Canvas */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
          <canvas
            ref={threeCanvasRef}
            style={{ width: "100%", height: "100%", display: "block" }}
          />

          {/* Overlay: combo */}
          {uiState.combo >= 2 && uiState.phase === "FIGHTING" && (
            <div style={{
              position: "absolute", top: 16, left: 16, pointerEvents: "none",
              color: "#ffdd00", fontSize: 12, textShadow: "0 0 20px #ffdd0088",
              animation: "pulse 0.4s infinite alternate",
            }}>
              {uiState.combo}x COMBO!
            </div>
          )}

          {/* Score display */}
          <div style={{ position: "absolute", top: 16, right: 16, pointerEvents: "none", textAlign: "right" }}>
            <div style={{ color: "#ffdd00", fontSize: 8 }}>{uiState.playerScore} PTS</div>
          </div>

          {/* Phase overlays */}
          {uiState.phase === "INTRO" && (
            <div style={overlayStyle}>
              <div style={{ color: "#ffdd00", fontSize: 22, marginBottom: 16, textShadow: "0 0 30px #ffdd0066" }}>SHADOWBOXER OS</div>
              <div style={{ color: "#00e5ff", fontSize: 8, marginBottom: 24 }}>VISION AI FIGHT SYSTEM</div>
              <div style={{ color: "#888", fontSize: 6, lineHeight: 2.2, textAlign: "center" }}>
                ALLOW WEBCAM ACCESS TO PLAY<br/>
                JAB: EXTEND LEFT WRIST FAST<br/>
                CROSS: EXTEND RIGHT WRIST FAST<br/>
                BLOCK: RAISE BOTH WRISTS TO FACE<br/>
                DODGE: SHIFT SHOULDERS LEFT/RIGHT
              </div>
              <div
                onClick={startGame}
                style={{ marginTop: 24, color: "#ffdd00", fontSize: 9, cursor: "pointer", border: "1px solid #ffdd00", padding: "10px 20px", borderRadius: 2 }}
              >
                PRESS SPACE OR CLICK TO START
              </div>
            </div>
          )}

          {uiState.phase === "COUNTDOWN" && (
            <div style={overlayStyle}>
              <div style={{
                color: "#ffdd00", fontSize: uiState.countdown > 0 ? 80 : 48,
                textShadow: "0 0 40px #ffdd0088",
                animation: "pop 0.3s ease-out",
              }}>
                {uiState.countdown > 0 ? uiState.countdown : "FIGHT!"}
              </div>
            </div>
          )}

          {uiState.phase === "ROUND_OVER" && (
            <div style={overlayStyle}>
              <div style={{ color: "#ffdd00", fontSize: 48, textShadow: "0 0 40px #ff880088" }}>KO!</div>
              <div style={{ color: "#fff", fontSize: 10, marginTop: 16 }}>NEXT ROUND...</div>
            </div>
          )}

          {uiState.phase === "GAME_OVER" && (
            <div style={overlayStyle}>
              <div style={{ color: playerWon ? "#ffdd00" : "#ff4444", fontSize: 36, textShadow: "0 0 40px #88000088", marginBottom: 16 }}>
                {playerWon ? "YOU WIN!" : "GAME OVER"}
              </div>
              <div style={{ color: "#fff", fontSize: 9, lineHeight: 2.2 }}>
                SCORE: {uiState.playerScore}<br/>
                MAX COMBO: {uiState.maxCombo}x
              </div>
              <div
                onClick={startGame}
                style={{ marginTop: 20, color: "#ffdd00", fontSize: 8, cursor: "pointer", border: "1px solid #ffdd00", padding: "10px 20px", borderRadius: 2 }}
              >
                PLAY AGAIN
              </div>
            </div>
          )}
        </div>

        {/* Bottom Move Bar */}
        <div style={{
          padding: "8px 16px", background: "#080e1a", borderTop: "1px solid #1a2d4a",
          display: "flex", gap: 8,
        }}>
          {[
            { label: "MOVE LEFT / RIGHT", icon: "↔", desc: "Lean body", active: gesture.dodgingLeft || gesture.dodgingRight, color: "#ffdd00" },
            { label: "PUNCH", icon: "👊", desc: "Extend arm fast", active: gesture.jabDetected || gesture.crossDetected, color: "#ff4444" },
            { label: "BLOCK", icon: "🛡", desc: "Hands to face", active: gesture.blocking, color: "#44aaff" },
            { label: "DODGE", icon: "↔", desc: "Shift shoulders", active: gesture.dodgingLeft || gesture.dodgingRight, color: "#ffdd00" },
          ].map(({ label, icon, desc, active, color }) => (
            <div key={label} style={{
              flex: 1, background: active ? `${color}22` : "#0c1520",
              border: `1px solid ${active ? color : "#1a2d4a"}`,
              borderRadius: 4, padding: "6px 4px", textAlign: "center",
              transition: "all 0.15s",
            }}>
              <div style={{ fontSize: 18, marginBottom: 2 }}>{icon}</div>
              <div style={{ color: active ? color : "#666", fontSize: 6, marginBottom: 1 }}>{label}</div>
              <div style={{ color: "#444", fontSize: 5 }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes pulse { from { opacity: 1; } to { opacity: 0.6; } }
        @keyframes pop   { from { transform: scale(1.3); } to { transform: scale(1); } }
      `}</style>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "absolute", inset: 0,
  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
  background: "rgba(5,10,18,0.82)", backdropFilter: "blur(4px)",
};
