export type FighterState =
  | "IDLE"
  | "JABBING"
  | "CROSSING"
  | "BLOCKING"
  | "DODGING_LEFT"
  | "DODGING_RIGHT"
  | "HIT"
  | "KO";

export type GamePhase = "INTRO" | "COUNTDOWN" | "FIGHTING" | "ROUND_OVER" | "GAME_OVER";

export type AiState = "IDLE" | "ATTACKING" | "BLOCKING" | "STUNNED" | "RETREATING";

export interface Fighter {
  hp: number;
  maxHp: number;
  state: FighterState;
  stateTimer: number;
  score: number;
  isPlayer: boolean;
  x: number;
  y: number;
  facingRight: boolean;
  hitFlash: number;
  dodgeOffset: number;
  punchArm: number;
  blockArm: number;
}

export interface PoseLandmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export interface PoseData {
  nose: PoseLandmark;
  leftShoulder: PoseLandmark;
  rightShoulder: PoseLandmark;
  leftWrist: PoseLandmark;
  rightWrist: PoseLandmark;
  leftElbow: PoseLandmark;
  rightElbow: PoseLandmark;
}

export interface GestureState {
  jabDetected: boolean;
  crossDetected: boolean;
  blocking: boolean;
  dodgingLeft: boolean;
  dodgingRight: boolean;
}

export interface HitEffect {
  x: number;
  y: number;
  timer: number;
  maxTimer: number;
  type: "jab" | "cross" | "block" | "combo";
  text: string;
}

export interface GameState {
  player: Fighter;
  ai: Fighter;
  phase: GamePhase;
  roundTimer: number;
  roundTimerMax: number;
  combo: number;
  maxCombo: number;
  hitEffects: HitEffect[];
  screenShake: number;
  round: number;
  maxRounds: number;
  countdown: number;
  aiState: AiState;
  aiStateTimer: number;
  aiAttackCooldown: number;
  aiBlockTimer: number;
}
