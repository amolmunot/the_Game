import type { GameState, Fighter } from "./types";

const COLORS = {
  bg: "#0a0a0f",
  floor: "#1a0d05",
  floorLight: "#2a1508",
  rope1: "#cc3333",
  rope2: "#ddaa00",
  ropePost: "#886644",
  hpGood: "#22cc44",
  hpMid: "#ddaa00",
  hpLow: "#cc2222",
  hpBg: "#1a1a1a",
  hpBorder: "#444",
  playerBody: "#3388ff",
  playerSkin: "#ffcc88",
  playerGlove: "#ee3333",
  aiBody: "#cc3333",
  aiSkin: "#ffcc88",
  aiGlove: "#222288",
  textGold: "#ffdd00",
  textWhite: "#ffffff",
  textRed: "#ff4444",
  textGreen: "#44ff88",
  scanline: "rgba(0,0,0,0.15)",
  vignette: "radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.7) 100%)",
};

function drawPixelRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.floor(x), Math.floor(y), Math.floor(w), Math.floor(h));
}

function drawRing(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const floorY = H * 0.45;
  const floorH = H - floorY;

  for (let row = 0; row < floorH; row += 8) {
    const shade = row % 16 === 0 ? COLORS.floorLight : COLORS.floor;
    drawPixelRect(ctx, 0, floorY + row, W, 8, shade);
  }

  const ropeY1 = H * 0.12;
  const ropeY2 = H * 0.22;
  const ropeY3 = H * 0.32;
  const postW = 16;

  ctx.fillStyle = COLORS.ropePost;
  [[0, ropeY1 - 8, postW, H * 0.35], [W - postW, ropeY1 - 8, postW, H * 0.35]].forEach(
    ([px, py, pw, ph]) => drawPixelRect(ctx, px, py, pw, ph, COLORS.ropePost),
  );

  [ropeY1, ropeY2, ropeY3].forEach((ry, i) => {
    ctx.strokeStyle = i === 0 ? COLORS.rope1 : COLORS.rope2;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(postW, ry);
    ctx.lineTo(W - postW, ry);
    ctx.stroke();
  });

  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fillRect(0, floorY - 4, W, 4);
}

function drawFighter(
  ctx: CanvasRenderingContext2D,
  fighter: Fighter,
  isPlayer: boolean,
) {
  const { x, y, state, hitFlash, dodgeOffset, punchArm, blockArm } = fighter;
  const facing = isPlayer ? 1 : -1;
  const dx = dodgeOffset;

  const flash = hitFlash > 0 && hitFlash % 2 === 0;
  if (flash) {
    ctx.globalAlpha = 0.4;
  }

  const skinColor = COLORS.playerSkin;
  const bodyColor = isPlayer ? COLORS.playerBody : COLORS.aiBody;
  const gloveColor = isPlayer ? COLORS.playerGlove : COLORS.aiGlove;
  const shadowColor = isPlayer ? "#1155aa" : "#881111";

  const bobOffset = state === "IDLE" ? Math.sin(Date.now() * 0.004) * 2 : 0;
  const baseY = y + bobOffset;

  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.ellipse(x + dx, y + 52, 22, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  if (state === "KO") {
    ctx.save();
    ctx.translate(x + dx, baseY + 40);
    ctx.rotate(isPlayer ? -Math.PI / 2 : Math.PI / 2);
    drawPixelRect(ctx, -12, -20, 24, 40, bodyColor);
    drawPixelRect(ctx, -8, -28, 16, 16, skinColor);
    ctx.restore();
    ctx.globalAlpha = 1;
    return;
  }

  const hitOffset = state === "HIT" ? facing * -8 : 0;
  const blockRaise = blockArm > 0 ? -16 : 0;

  drawPixelRect(ctx, x + dx + hitOffset - 8, baseY - 20, 16, 28, bodyColor);

  drawPixelRect(ctx, x + dx + hitOffset - 6, baseY - 36, 12, 18, skinColor);

  if (punchArm === 1) {
    const ext = facing * 32;
    drawPixelRect(ctx, x + dx + hitOffset, baseY - 14, ext, 8, bodyColor);
    drawPixelRect(ctx, x + dx + hitOffset + ext - (facing > 0 ? 10 : 0), baseY - 18, 10, 16, gloveColor);
  } else if (punchArm === 2) {
    const ext = facing * 36;
    drawPixelRect(ctx, x + dx + hitOffset, baseY - 10, ext, 8, bodyColor);
    drawPixelRect(ctx, x + dx + hitOffset + ext - (facing > 0 ? 10 : 0), baseY - 16, 12, 18, gloveColor);
  } else if (blockArm > 0) {
    drawPixelRect(ctx, x + dx + hitOffset - facing * 22, baseY - 36 + blockRaise, 16, 10, bodyColor);
    drawPixelRect(ctx, x + dx + hitOffset + facing * 12, baseY - 36 + blockRaise, 16, 10, bodyColor);
    drawPixelRect(ctx, x + dx + hitOffset - facing * 24, baseY - 46 + blockRaise, 12, 16, gloveColor);
    drawPixelRect(ctx, x + dx + hitOffset + facing * 12, baseY - 46 + blockRaise, 12, 16, gloveColor);
  } else {
    drawPixelRect(ctx, x + dx + hitOffset - 22 * facing, baseY - 12, 10, 8, bodyColor);
    drawPixelRect(ctx, x + dx + hitOffset + 14 * facing, baseY - 12, 10, 8, bodyColor);
    drawPixelRect(ctx, x + dx + hitOffset - 24 * facing, baseY - 20, 10, 12, gloveColor);
    drawPixelRect(ctx, x + dx + hitOffset + 14 * facing, baseY - 20, 10, 12, gloveColor);
  }

  drawPixelRect(ctx, x + dx + hitOffset - 8, baseY + 8, 6, 20, shadowColor);
  drawPixelRect(ctx, x + dx + hitOffset + 2, baseY + 8, 6, 20, shadowColor);
  drawPixelRect(ctx, x + dx + hitOffset - 8, baseY + 22, 8, 10, shadowColor);
  drawPixelRect(ctx, x + dx + hitOffset + 2, baseY + 22, 8, 10, shadowColor);

  const eyeX = x + dx + hitOffset + (facing > 0 ? 2 : -4);
  drawPixelRect(ctx, eyeX, baseY - 32, 3, 3, "#000");
  drawPixelRect(ctx, eyeX + facing * 5, baseY - 32, 3, 3, "#000");

  if (state === "DODGING_LEFT") {
    ctx.save();
    ctx.translate(x + dx, baseY);
    ctx.rotate(-0.25);
    ctx.restore();
  } else if (state === "DODGING_RIGHT") {
    ctx.save();
    ctx.translate(x + dx, baseY);
    ctx.rotate(0.25);
    ctx.restore();
  }

  ctx.globalAlpha = 1;
}

function drawHPBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  hp: number,
  maxHp: number,
  flipped: boolean,
  label: string,
) {
  ctx.fillStyle = COLORS.hpBg;
  ctx.fillRect(x, y, w, h);

  const pct = hp / maxHp;
  const barW = Math.floor(w * pct);
  const color = pct > 0.6 ? COLORS.hpGood : pct > 0.3 ? COLORS.hpMid : COLORS.hpLow;
  ctx.fillStyle = color;
  if (flipped) {
    ctx.fillRect(x + w - barW, y, barW, h);
  } else {
    ctx.fillRect(x, y, barW, h);
  }

  ctx.strokeStyle = COLORS.hpBorder;
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);

  ctx.fillStyle = COLORS.textWhite;
  ctx.font = "bold 10px 'Press Start 2P', monospace";
  ctx.textAlign = flipped ? "right" : "left";
  const labelX = flipped ? x + w - 4 : x + 4;
  ctx.fillText(label, labelX, y - 4);
}

function drawHUD(ctx: CanvasRenderingContext2D, state: GameState, W: number) {
  const { player, ai, roundTimer, roundTimerMax, combo, round, maxRounds } = state;

  const barW = W * 0.35;
  const barH = 18;
  const barY = 14;

  drawHPBar(ctx, 16, barY, barW, barH, player.hp, player.maxHp, false, "YOU");
  drawHPBar(ctx, W - 16 - barW, barY, barW, barH, ai.hp, ai.maxHp, true, "BOT");

  const secs = Math.ceil(roundTimer / 1000);
  const timerStr = String(secs).padStart(2, "0");
  ctx.fillStyle = secs <= 10 && Date.now() % 800 < 400 ? COLORS.textRed : COLORS.textGold;
  ctx.font = "bold 16px 'Press Start 2P', monospace";
  ctx.textAlign = "center";
  ctx.fillText(timerStr, W / 2, barY + barH - 2);

  ctx.fillStyle = COLORS.textWhite;
  ctx.font = "8px 'Press Start 2P', monospace";
  ctx.textAlign = "center";
  ctx.fillText(`RND ${round}/${maxRounds}`, W / 2, barY + barH + 14);

  if (combo >= 2) {
    const comboAlpha = Math.min(1, combo * 0.15 + 0.5);
    ctx.globalAlpha = comboAlpha;
    ctx.fillStyle = COLORS.textGold;
    ctx.font = "bold 14px 'Press Start 2P', monospace";
    ctx.textAlign = "left";
    ctx.fillText(`${combo}x COMBO!`, 16, barY + barH + 28);
    ctx.globalAlpha = 1;
  }

  ctx.fillStyle = COLORS.textWhite;
  ctx.font = "8px 'Press Start 2P', monospace";
  ctx.textAlign = "left";
  ctx.fillText(`${player.score} PTS`, 16, barY + barH + 14);

  ctx.textAlign = "right";
  ctx.fillText(`${ai.score} PTS`, W - 16, barY + barH + 14);
}

function drawHitEffects(ctx: CanvasRenderingContext2D, state: GameState) {
  for (const fx of state.hitEffects) {
    const alpha = fx.timer / fx.maxTimer;
    ctx.globalAlpha = alpha;

    const scale = 1 + (1 - alpha) * 0.5;
    ctx.save();
    ctx.translate(fx.x, fx.y);
    ctx.scale(scale, scale);

    const colors: Record<string, string> = {
      jab: "#ffff00",
      cross: "#ff8800",
      block: "#88aaff",
      combo: "#ff00ff",
    };
    ctx.fillStyle = colors[fx.type] || "#ffffff";
    ctx.font = "bold 12px 'Press Start 2P', monospace";
    ctx.textAlign = "center";
    ctx.fillText(fx.text, 0, 0);

    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2 + (1 - alpha) * 3;
      const dist = (1 - alpha) * 20;
      const sx = Math.cos(angle) * dist;
      const sy = Math.sin(angle) * dist;
      ctx.fillStyle = colors[fx.type] || "#ffffff";
      ctx.fillRect(sx - 2, sy - 2, 4, 4);
    }

    ctx.restore();
    ctx.globalAlpha = 1;
  }
}

function drawPhaseOverlay(ctx: CanvasRenderingContext2D, state: GameState, W: number, H: number) {
  const { phase, countdown } = state;

  if (phase === "COUNTDOWN") {
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = COLORS.textGold;
    ctx.font = "bold 64px 'Press Start 2P', monospace";
    ctx.textAlign = "center";
    const txt = countdown > 0 ? String(countdown) : "FIGHT!";
    ctx.fillText(txt, W / 2, H / 2 + 20);
  } else if (phase === "ROUND_OVER") {
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = COLORS.textGold;
    ctx.font = "bold 36px 'Press Start 2P', monospace";
    ctx.textAlign = "center";
    ctx.fillText("KO!", W / 2, H / 2 - 20);
    ctx.fillStyle = COLORS.textWhite;
    ctx.font = "14px 'Press Start 2P', monospace";
    ctx.fillText("NEXT ROUND...", W / 2, H / 2 + 20);
  } else if (phase === "GAME_OVER") {
    ctx.fillStyle = "rgba(0,0,0,0.75)";
    ctx.fillRect(0, 0, W, H);
    const playerWon = state.ai.hp <= 0 || state.ai.state === "KO";
    ctx.fillStyle = playerWon ? COLORS.textGold : COLORS.textRed;
    ctx.font = "bold 32px 'Press Start 2P', monospace";
    ctx.textAlign = "center";
    ctx.fillText(playerWon ? "YOU WIN!" : "GAME OVER", W / 2, H / 2 - 30);
    ctx.fillStyle = COLORS.textWhite;
    ctx.font = "12px 'Press Start 2P', monospace";
    ctx.fillText(`SCORE: ${state.player.score}`, W / 2, H / 2 + 10);
    ctx.fillText(`MAX COMBO: ${state.maxCombo}x`, W / 2, H / 2 + 35);
    ctx.fillStyle = COLORS.textGold;
    ctx.font = "10px 'Press Start 2P', monospace";
    ctx.fillText("PRESS ANY KEY TO RESTART", W / 2, H / 2 + 70);
  } else if (phase === "INTRO") {
    ctx.fillStyle = "rgba(0,0,0,0.8)";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = COLORS.textGold;
    ctx.font = "bold 28px 'Press Start 2P', monospace";
    ctx.textAlign = "center";
    ctx.fillText("PUNCH-OUT!", W / 2, H / 2 - 60);
    ctx.fillStyle = COLORS.textWhite;
    ctx.font = "8px 'Press Start 2P', monospace";
    ctx.fillText("ALLOW WEBCAM ACCESS TO PLAY", W / 2, H / 2 - 20);
    ctx.fillText("JAB: EXTEND LEFT WRIST FAST", W / 2, H / 2 + 10);
    ctx.fillText("CROSS: EXTEND RIGHT WRIST FAST", W / 2, H / 2 + 28);
    ctx.fillText("BLOCK: RAISE BOTH WRISTS TO FACE", W / 2, H / 2 + 46);
    ctx.fillText("DODGE: SHIFT SHOULDERS LEFT/RIGHT", W / 2, H / 2 + 64);
    ctx.fillStyle = COLORS.textGold;
    ctx.font = "10px 'Press Start 2P', monospace";
    ctx.fillText("PRESS SPACE OR CLICK TO START", W / 2, H / 2 + 95);
  }
}

function drawScanlines(ctx: CanvasRenderingContext2D, W: number, H: number) {
  for (let y = 0; y < H; y += 3) {
    ctx.fillStyle = COLORS.scanline;
    ctx.fillRect(0, y, W, 1);
  }
}

function drawPoseGuide(
  ctx: CanvasRenderingContext2D,
  gesture: { jabDetected: boolean; crossDetected: boolean; blocking: boolean; dodgingLeft: boolean; dodgingRight: boolean } | null,
  W: number,
  H: number,
) {
  if (!gesture) return;
  const icons: string[] = [];
  if (gesture.jabDetected) icons.push("JAB!");
  if (gesture.crossDetected) icons.push("CROSS!");
  if (gesture.blocking) icons.push("BLOCK");
  if (gesture.dodgingLeft) icons.push("DODGE<");
  if (gesture.dodgingRight) icons.push("DODGE>");

  if (icons.length > 0) {
    ctx.fillStyle = "rgba(0,255,100,0.8)";
    ctx.font = "bold 11px 'Press Start 2P', monospace";
    ctx.textAlign = "right";
    ctx.fillText(icons.join(" "), W - 12, H - 12);
  }
}

export function render(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  W: number,
  H: number,
  shakeX: number,
  shakeY: number,
  gesture: { jabDetected: boolean; crossDetected: boolean; blocking: boolean; dodgingLeft: boolean; dodgingRight: boolean } | null,
) {
  ctx.save();
  if (shakeX !== 0 || shakeY !== 0) {
    ctx.translate(shakeX, shakeY);
  }

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(-shakeX, -shakeY, W + Math.abs(shakeX) * 2, H + Math.abs(shakeY) * 2);

  drawRing(ctx, W, H);
  drawFighter(ctx, state.ai, false);
  drawFighter(ctx, state.player, true);
  drawHitEffects(ctx, state);
  drawScanlines(ctx, W, H);

  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.8);
  vg.addColorStop(0, "transparent");
  vg.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  ctx.restore();

  drawHUD(ctx, state, W);
  drawPhaseOverlay(ctx, state, W, H);
  drawPoseGuide(ctx, gesture, W, H);
}
