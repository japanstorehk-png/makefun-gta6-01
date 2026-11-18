// Tiny procedural audio helper. Sounds are optional and generated with Web Audio;
// failures (e.g. autoplay restrictions) are ignored so the game stays playable.

let ctx = null;

function ensure() {
  if (ctx) return ctx;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  try {
    ctx = new Ctx();
  } catch {
    ctx = null;
  }
  return ctx;
}

export function unlockAudio() {
  const c = ensure();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}

function beep(freq, duration, type = 'square', gain = 0.03) {
  const c = ensure();
  if (!c) return;
  try {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.value = gain;
    osc.connect(g);
    g.connect(c.destination);
    const t = c.currentTime;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.start(t);
    osc.stop(t + duration);
  } catch {
    // ignore
  }
}

export const sfx = {
  shoot() { beep(520, 0.05, 'square', 0.02); },
  hit() { beep(140, 0.08, 'sawtooth', 0.03); },
  steal() { beep(260, 0.12, 'triangle', 0.03); },
  enter() { beep(320, 0.07, 'triangle', 0.02); },
  complete() { beep(660, 0.18, 'sine', 0.03); setTimeout(() => beep(880, 0.18, 'sine', 0.03), 120); },
  wasted() { beep(120, 0.3, 'sawtooth', 0.04); },
  wanted() { beep(440, 0.1, 'square', 0.02); },
};
