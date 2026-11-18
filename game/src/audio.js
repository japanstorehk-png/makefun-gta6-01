// Original Web Audio: an engine drone pitched by speed, gunshots, sirens, explosions
// and small UI blips. Everything is synthesised on the fly — no audio files — and the
// context is only created after the first user gesture, the way browsers require.
// Solara Keys note: the master gain sits at 0.42 so sirens stay audible over the
// engine without clipping, and muting only zeroes the master, never the sources.

export function createAudio() {
  let ac = null;
  let master = null;
  let engine = null;
  let engineGain = null;
  let siren = null;
  let sirenGain = null;
  let noiseBuf = null;
  let muted = false;

  function ensure() {
    if (!ac) {
      try {
        const Ctx = window.AudioContext ?? window.webkitAudioContext;
        if (!Ctx) return;
        ac = new Ctx();
        master = ac.createGain();
        master.gain.value = muted ? 0 : 0.42;
        master.connect(ac.destination);
        noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
        const data = noiseBuf.getChannelData(0);
        for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
        buildEngine();
        buildSiren();
      } catch {
        ac = null;
        return;
      }
    }
    if (ac.state === 'suspended') ac.resume().catch(() => {});
  }

  function buildEngine() {
    engine = ac.createOscillator();
    engine.type = 'sawtooth';
    engine.frequency.value = 55;
    const sub = ac.createOscillator();
    sub.type = 'square';
    sub.frequency.value = 27;
    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 520;
    engineGain = ac.createGain();
    engineGain.gain.value = 0;
    engine.connect(filter);
    sub.connect(filter);
    filter.connect(engineGain);
    engineGain.connect(master);
    engine.start();
    sub.start();
  }

  function buildSiren() {
    siren = ac.createOscillator();
    siren.type = 'triangle';
    siren.frequency.value = 720;
    const lfo = ac.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 3.2;
    const lfoGain = ac.createGain();
    lfoGain.gain.value = 190;
    lfo.connect(lfoGain);
    lfoGain.connect(siren.frequency);
    sirenGain = ac.createGain();
    sirenGain.gain.value = 0;
    siren.connect(sirenGain);
    sirenGain.connect(master);
    siren.start();
    lfo.start();
  }

  function burst(duration, filterType, frequency, volume, decay) {
    if (!ac) return;
    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    const f = ac.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = frequency;
    const g = ac.createGain();
    g.gain.setValueAtTime(volume, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + decay);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start();
    src.stop(ac.currentTime + Math.max(duration, decay));
  }

  function tone(type, from, to, duration, volume) {
    if (!ac) return;
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(from, ac.currentTime);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, to), ac.currentTime + duration);
    const g = ac.createGain();
    g.gain.setValueAtTime(volume, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
    o.connect(g);
    g.connect(master);
    o.start();
    o.stop(ac.currentTime + duration);
  }

  function play(name) {
    if (!ac || muted) return;
    switch (name) {
      case 'gun': burst(0.12, 'bandpass', 1600, 0.5, 0.13); tone('square', 210, 60, 0.08, 0.18); break;
      case 'melee': burst(0.1, 'bandpass', 700, 0.2, 0.12); break;
      case 'thud': tone('sine', 120, 55, 0.1, 0.3); break;
      case 'crash': burst(0.16, 'lowpass', 800, 0.45, 0.18); break;
      case 'explode': burst(0.6, 'lowpass', 380, 0.9, 0.8); tone('sine', 90, 30, 0.7, 0.5); break;
      case 'pickup': tone('sine', 880, 1320, 0.12, 0.25); break;
      case 'blip': tone('square', 520, 560, 0.07, 0.15); break;
      case 'star': tone('triangle', 420, 210, 0.3, 0.3); break;
      case 'honk': tone('square', 370, 366, 0.28, 0.22); tone('square', 466, 462, 0.28, 0.16); break;
      case 'enter': tone('square', 300, 380, 0.08, 0.14); break;
      case 'exit': tone('square', 380, 300, 0.08, 0.14); break;
      case 'wasted': tone('sine', 200, 60, 1.4, 0.4); burst(0.5, 'lowpass', 500, 0.4, 0.9); break;
      default: break;
    }
  }

  /** Per-frame ambience: engine pitch by car speed, siren volume by cop distance. */
  function update(world, screen) {
    if (!ac) return;
    const driving = screen === 'play' && world.player && world.player.inCar && !world.wasted;
    if (driving) {
      const speed = Math.hypot(world.player.inCar.vx, world.player.inCar.vy);
      engine.frequency.value = 48 + speed * 0.24;
      engineGain.gain.value = 0.1;
    } else engineGain.gain.value = 0;
    let nearest = Infinity;
    for (const car of world.cars) {
      if (car.kind !== 'police' || car.wreck) continue;
      nearest = Math.min(nearest, Math.hypot(car.x - world.player.x, car.y - world.player.y));
    }
    if (screen === 'play' && world.wanted > 0 && Number.isFinite(nearest) && !muted) {
      sirenGain.gain.value = Math.max(0, 0.09 * (1 - nearest / 1100));
    } else sirenGain.gain.value = 0;
  }

  function toggleMute() {
    muted = !muted;
    if (master) master.gain.value = muted ? 0 : 0.42;
    return muted;
  }

  return { ensure, play, update, toggleMute, isMuted: () => muted };
}
