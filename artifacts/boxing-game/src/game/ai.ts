import type { GameState, AiState, FighterState } from "./types";

const AI_REACTION_TIME = 800;
const AI_ATTACK_INTERVAL_MIN = 600;
const AI_ATTACK_INTERVAL_MAX = 2000;
const AI_BLOCK_DURATION_MIN = 400;
const AI_BLOCK_DURATION_MAX = 1200;
const AI_BLOCK_CHANCE = 0.45;
const AI_DODGE_CHANCE = 0.25;

export function tickAI(state: GameState, dt: number): Partial<GameState> {
  const ai = { ...state.ai };
  const player = state.player;
  let aiState = state.aiState;
  let aiStateTimer = state.aiStateTimer - dt;
  let aiAttackCooldown = state.aiAttackCooldown - dt;
  let aiBlockTimer = state.aiBlockTimer - dt;
  const hitEffects = [...state.hitEffects];

  if (ai.state === "KO") {
    return { ai, aiState, aiStateTimer, aiAttackCooldown, aiBlockTimer };
  }

  if (ai.stateTimer > 0) {
    ai.stateTimer -= dt;
    if (ai.stateTimer <= 0) {
      ai.state = "IDLE";
      ai.punchArm = 0;
      ai.blockArm = 0;
    }
  }

  const playerPunching =
    player.state === "JABBING" || player.state === "CROSSING";

  if (aiStateTimer <= 0) {
    const rand = Math.random();

    if (playerPunching && rand < AI_BLOCK_CHANCE && ai.state === "IDLE") {
      aiState = "BLOCKING";
      aiStateTimer = AI_BLOCK_DURATION_MIN + Math.random() * (AI_BLOCK_DURATION_MAX - AI_BLOCK_DURATION_MIN);
      ai.state = "BLOCKING";
      ai.blockArm = 1;
      ai.stateTimer = aiStateTimer;
    } else if (playerPunching && rand < AI_BLOCK_CHANCE + AI_DODGE_CHANCE && ai.state === "IDLE") {
      const dodgeDir = Math.random() < 0.5 ? "DODGING_LEFT" : "DODGING_RIGHT";
      aiState = "RETREATING";
      aiStateTimer = 300 + Math.random() * 200;
      ai.state = dodgeDir;
      ai.dodgeOffset = dodgeDir === "DODGING_LEFT" ? -18 : 18;
      ai.stateTimer = aiStateTimer;
    } else if (aiState === "IDLE" && aiAttackCooldown <= 0) {
      aiState = "ATTACKING";
      aiStateTimer = AI_REACTION_TIME;
    } else if (aiState === "ATTACKING" && ai.state === "IDLE") {
      const attackType: FighterState = Math.random() < 0.5 ? "JABBING" : "CROSSING";
      ai.state = attackType;
      ai.punchArm = attackType === "JABBING" ? 1 : 2;
      ai.stateTimer = 300;
      aiAttackCooldown = AI_ATTACK_INTERVAL_MIN + Math.random() * (AI_ATTACK_INTERVAL_MAX - AI_ATTACK_INTERVAL_MIN);
      aiState = "IDLE";
      aiStateTimer = 200;

      const playerBlocking = player.state === "BLOCKING";
      const playerDodging = player.state === "DODGING_LEFT" || player.state === "DODGING_RIGHT";

      if (!playerBlocking && !playerDodging && player.state !== "HIT") {
        const damage = attackType === "JABBING" ? 6 : 10;
        const newHp = Math.max(0, player.hp - damage);

        const updatedHitEffects = [
          ...hitEffects,
          {
            x: player.x,
            y: player.y - 40,
            timer: 600,
            maxTimer: 600,
            type: attackType === "JABBING" ? "jab" : ("cross" as "jab" | "cross"),
            text: attackType === "JABBING" ? "JAB!" : "CROSS!",
          },
        ];

        return {
          ai,
          player: {
            ...player,
            hp: newHp,
            state: newHp <= 0 ? "KO" : "HIT",
            stateTimer: newHp <= 0 ? 9999 : 400,
            hitFlash: 12,
          },
          hitEffects: updatedHitEffects,
          aiState,
          aiStateTimer,
          aiAttackCooldown,
          aiBlockTimer,
          screenShake: newHp <= 0 ? 20 : 8,
        };
      }
    } else if (aiState === "BLOCKING" || aiState === "RETREATING") {
      aiState = "IDLE";
      aiStateTimer = 300 + Math.random() * 400;
    } else {
      aiStateTimer = 100 + Math.random() * 300;
    }
  }

  if (ai.state === "DODGING_LEFT" || ai.state === "DODGING_RIGHT") {
    ai.dodgeOffset *= 0.85;
    if (Math.abs(ai.dodgeOffset) < 1) ai.dodgeOffset = 0;
  }

  if (ai.hitFlash > 0) ai.hitFlash--;

  return { ai, aiState, aiStateTimer, aiAttackCooldown, aiBlockTimer, hitEffects };
}
