let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

function playTone(
  frequency: number,
  duration: number,
  type: OscillatorType = "square",
  gainVal = 0.3,
  attackTime = 0.01,
  decayTime = 0.1,
  sustainLevel = 0.0,
) {
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();

  osc.connect(gainNode);
  gainNode.connect(ctx.destination);

  osc.type = type;
  osc.frequency.setValueAtTime(frequency, ctx.currentTime);

  gainNode.gain.setValueAtTime(0, ctx.currentTime);
  gainNode.gain.linearRampToValueAtTime(gainVal, ctx.currentTime + attackTime);
  gainNode.gain.linearRampToValueAtTime(gainVal * sustainLevel, ctx.currentTime + attackTime + decayTime);
  gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration + 0.05);
}

function playNoise(duration: number, gainVal = 0.2, filterFreq = 2000) {
  const ctx = getCtx();
  const bufferSize = ctx.sampleRate * duration;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = filterFreq;
  filter.Q.value = 0.5;

  const gainNode = ctx.createGain();
  gainNode.gain.setValueAtTime(gainVal, ctx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

  source.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(ctx.destination);
  source.start();
  source.stop(ctx.currentTime + duration);
}

export const Audio = {
  punchHit() {
    playNoise(0.08, 0.4, 800);
    playTone(120, 0.06, "square", 0.15, 0.005, 0.06);
  },

  punchMiss() {
    playTone(300, 0.05, "sawtooth", 0.05, 0.005, 0.05);
    playTone(200, 0.04, "sawtooth", 0.03, 0.005, 0.04);
  },

  block() {
    playNoise(0.06, 0.25, 400);
    playTone(80, 0.08, "square", 0.2, 0.01, 0.07);
  },

  combo(comboCount: number) {
    const freqs = [440, 550, 660, 880, 1100];
    const freq = freqs[Math.min(comboCount - 2, freqs.length - 1)];
    playTone(freq, 0.15, "square", 0.2, 0.01, 0.12, 0.3);
  },

  playerHit() {
    playNoise(0.1, 0.5, 600);
    playTone(100, 0.08, "square", 0.2, 0.005, 0.08);
  },

  ko() {
    const ctx = getCtx();
    const times = [0, 0.15, 0.3, 0.5];
    const freqs = [440, 330, 220, 110];
    times.forEach((t, i) => {
      setTimeout(() => {
        playTone(freqs[i], 0.2, "square", 0.3, 0.01, 0.15, 0.1);
      }, t * 1000);
    });
  },

  roundBell() {
    playTone(880, 0.8, "sine", 0.4, 0.01, 0.2, 0.5);
    playTone(1100, 0.6, "sine", 0.2, 0.05, 0.2, 0.4);
  },

  countdown() {
    playTone(660, 0.1, "square", 0.2, 0.01, 0.08);
  },

  countdownGo() {
    playTone(880, 0.05, "square", 0.3, 0.01, 0.04);
    setTimeout(() => playTone(1100, 0.15, "square", 0.3, 0.01, 0.12), 60);
  },

  dodge() {
    playTone(400, 0.04, "sine", 0.08, 0.005, 0.04);
  },

  resume() {
    getCtx();
  },
};
