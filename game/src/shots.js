// Shot/deterministic capture support for Solara Keys.
// Supports ?shot=start|play|drive|wanted&seed=N and sets window.__shotReady when drawn.

export function getShotParams() {
  const p = new URLSearchParams(window.location.search);
  const shot = p.get('shot');
  const seedRaw = p.get('seed');
  const seed = seedRaw != null ? Number(seedRaw) : 1;
  const valid = ['start', 'play', 'drive', 'wanted'].includes(shot) ? shot : null;
  return {
    shot: valid,
    seed: Number.isFinite(seed) && seed > 0 ? Math.floor(seed) : 1,
    active: !!valid,
  };
}

export function markShotReady(extra = {}) {
  // set after a frame has been drawn
  window.__shotReady = { ready: true, ...extra, at: Date.now() };
}
