// Minimal synth audio for Solara Keys (WebAudio, no network/assets).

let ctx = null;
let enabled = true;

function ensure() {
  if (!enabled) return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function beep(freq = 440, dur = 0.08, type = 'sine', gain = 0.04, slide = 0) {
  const c = ensure();
  if (!c) return;
  const t = c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.linearRampToValueAtTime(Math.max(40, freq + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export const audio = {
  unlock() { ensure(); },
  setEnabled(v) { enabled = !!v; },
  click() { beep(520, 0.05, 'square', 0.02, -80); },
  start() { beep(440, 0.12, 'triangle', 0.04, 220); },
  enter() { beep(300, 0.08, 'sine', 0.03, 120); },
  exit() { beep(420, 0.08, 'sine', 0.03, -120); },
  shot() { beep(180, 0.06, 'square', 0.03, -60); },
  melee() { beep(120, 0.07, 'sawtooth', 0.03, 40); },
  hit() { beep(90, 0.12, 'sawtooth', 0.04, -30); },
  sirenUp() { beep(520, 0.18, 'sawtooth', 0.02, 180); },
  mission() { beep(660, 0.18, 'triangle', 0.04, 220); },
  cash() { beep(880, 0.12, 'sine', 0.04, 120); },
  wasted() { beep(220, 0.5, 'sawtooth', 0.05, -140); },
};
