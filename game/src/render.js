// Rendering: world, entities, HUD and screen overlays for Solara Keys.
// Flat 2D canvas drawing with a camera that follows the player.

import {
  TITLE, CITY_NAME, FIXER_NAME, POLICE_NAME, PLACES,
  WORLD, VIEW, PALETTE, FONT, PLAYER, VEHICLE, HUD, CONTROLS_TEXT, SCREENS, WANTED,
} from './config.js';

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const camera = { x: 0, y: 0, scale: 1, offsetX: 0, offsetY: 0 };

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.floor(window.innerWidth * dpr);
    const h = Math.floor(window.innerHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w; canvas.height = h;
    }
    camera.scale = Math.min(w / VIEW.width, h / VIEW.height);
    camera.offsetX = (w - VIEW.width * camera.scale) / 2;
    camera.offsetY = (h - VIEW.height * camera.scale) / 2;
  }

  function setCameraOn(x, y) {
    camera.x = clamp(x - VIEW.width / 2, 0, Math.max(0, WORLD.width - VIEW.width));
    camera.y = clamp(y - VIEW.height / 2, 0, Math.max(0, WORLD.height - VIEW.height));
  }

  function screenToWorld(sx, sy) {
    const dpr = window.devicePixelRatio || 1;
    const px = sx * dpr;
    const py = sy * dpr;
    const vx = (px - camera.offsetX) / camera.scale;
    const vy = (py - camera.offsetY) / camera.scale;
    return { x: vx + camera.x, y: vy + camera.y };
  }

  function beginFrame() {
    resize();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PALETTE.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(camera.scale, 0, 0, camera.scale, camera.offsetX, camera.offsetY);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, VIEW.width, VIEW.height);
    ctx.clip();
  }

  function endFrame() {
    ctx.restore();
  }

  function drawRoads(city) {
    // grass/background inside view
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(camera.x - 20, camera.y - 20, VIEW.width + 40, VIEW.height + 40);

    // water
    ctx.fillStyle = PALETTE.water;
    for (const w of city.water) ctx.fillRect(w.x, w.y, w.w, w.h);
    // blocks
    ctx.fillStyle = PALETTE.block;
    for (const b of city.blocks) { ctx.fillRect(b.x, b.y, b.w, b.h); ctx.strokeStyle = PALETTE.blockEdge; ctx.strokeRect(b.x, b.y, b.w, b.h); }

    // roads
    ctx.lineCap = 'round';
    ctx.strokeStyle = PALETTE.road;
    ctx.lineWidth = city.roadHalf * 2;
    ctx.beginPath();
    for (const s of city.segments) {
      ctx.moveTo(s.ax, s.ay); ctx.lineTo(s.bx, s.by);
    }
    ctx.stroke();
    // center lines
    ctx.strokeStyle = PALETTE.roadLine;
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 10]);
    ctx.beginPath();
    for (const s of city.segments) {
      ctx.moveTo(s.ax, s.ay); ctx.lineTo(s.bx, s.by);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // intersections
    ctx.fillStyle = PALETTE.road;
    for (const n of city.nodes) {
      ctx.beginPath(); ctx.arc(n.x, n.y, city.roadHalf - 1, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawPlaces() {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const p of PLACES) {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = 0.35;
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 2;
      ctx.strokeRect(p.x, p.y, p.w, p.h);
      ctx.fillStyle = PALETTE.text;
      ctx.font = `bold 16px ${FONT}`;
      ctx.fillText(p.name, p.x + p.w / 2, p.y + p.h / 2);
    }
  }

  function drawVehicle(v, isPlayer = false) {
    ctx.save();
    ctx.translate(v.x, v.y);
    ctx.rotate(v.angle);
    const w = VEHICLE.width, h = VEHICLE.height;
    ctx.fillStyle = v.dead ? '#555' : (isPlayer ? PALETTE.carPlayer : v.color);
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(w * 0.05, -h / 2 + 3, w * 0.25, h - 6); // windshield
    ctx.fillStyle = '#111';
    // wheels hint
    ctx.fillRect(-w * 0.35, -h / 2 - 2, 8, 4);
    ctx.fillRect(-w * 0.35, h / 2 - 2, 8, 4);
    ctx.fillRect(w * 0.2, -h / 2 - 2, 8, 4);
    ctx.fillRect(w * 0.2, h / 2 - 2, 8, 4);
    if (v.type === 'police') {
      ctx.fillStyle = v.siren > 0.5 ? '#ef4444' : '#60a5fa';
      ctx.fillRect(-4, -h / 2, 4, 4);
      ctx.fillStyle = v.siren > 0.5 ? '#60a5fa' : '#ef4444';
      ctx.fillRect(0, -h / 2, 4, 4);
    }
    ctx.restore();
  }

  function drawPed(p) {
    if (p.dead) return;
    ctx.fillStyle = PALETTE.ped;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPlayer(pl) {
    if (!pl.alive) return;
    if (pl.inVehicleId) return; // drawn as vehicle
    ctx.save();
    ctx.translate(pl.x, pl.y);
    ctx.rotate(pl.angle);
    ctx.fillStyle = PALETTE.player;
    ctx.beginPath(); ctx.arc(0, 0, PLAYER.radius - 2, 0, Math.PI * 2); ctx.fill();
    // direction/gun hint
    ctx.strokeStyle = PALETTE.accent;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(PLAYER.radius + 6, 0); ctx.stroke();
    ctx.restore();
  }

  function drawBullets(bullets) {
    ctx.fillStyle = '#fde68a';
    for (const b of bullets) {
      ctx.beginPath(); ctx.arc(b.x, b.y, 2.5, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawMarker(x, y, color, label) {
    const t = (performance.now() / 300) % (Math.PI * 2);
    const bob = Math.sin(t) * 4;
    ctx.save();
    ctx.translate(x, y + bob);
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(8, -4); ctx.lineTo(-8, -4); ctx.closePath(); ctx.fill();
    ctx.restore();
    if (label) {
      ctx.fillStyle = PALETTE.text;
      ctx.font = `12px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(label, x, y - 24);
    }
  }

  function drawMissionMarker(worldObj) {
    const { state, city } = worldObj;
    const m = state.mission;
    if (state.screen !== SCREENS.PLAY) return;
    if (m.stage === 0) {
      const v = state.vehicles.find((vv) => vv.id === m.targetVehicleId);
      if (v) drawMarker(v.x, v.y - 10, '#f97316', 'Coupe');
    } else if (m.stage === 1 || m.stage === 3) {
      const p = city.placeById(m.targetPlaceId);
      if (p) drawMarker(p.x + p.w / 2, p.y - 10, '#4ade80', 'Deliver');
    } else if (m.stage === 2) {
      const p = city.placeById(m.pickupPlaceId);
      if (p) drawMarker(p.x + p.w / 2, p.y - 10, '#a78bfa', 'Case');
    } else if (m.stage >= 4 && m.sideJob && m.sideJob.active) {
      const pid = m.sideJob.hasPackage ? m.sideJob.dropId : m.sideJob.pickupId;
      const p = city.placeById(pid);
      if (p) drawMarker(p.x + p.w / 2, p.y - 10, '#38bdf8', m.sideJob.hasPackage ? 'Drop' : 'Pickup');
    }
  }

  function drawWorld(worldObj) {
    const { state, city } = worldObj;
    const focus = state.player;
    setCameraOn(focus.x, focus.y);
    ctx.save();
    ctx.translate(-camera.x, -camera.y);
    drawRoads(city);
    drawPlaces();
    // vehicles under player maybe, draw all then player on top if on foot
    const pv = worldObj.playerVehicle();
    for (const v of state.vehicles) {
      if (v.dead) continue;
      drawVehicle(v, pv && v.id === pv.id);
    }
    for (const p of state.peds) drawPed(p);
    drawBullets(state.bullets);
    drawPlayer(state.player);
    drawMissionMarker(worldObj);
    ctx.restore();
  }

  function drawMinimap(worldObj) {
    const { state, city } = worldObj;
    const size = HUD.minimapSize;
    const pad = HUD.minimapPad;
    const x = VIEW.width - size - pad;
    const y = pad;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(10, 15, 25, 0.75)';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.strokeRect(0, 0, size, size);
    const sx = size / WORLD.width;
    const sy = size / WORLD.height;
    // roads
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const s of city.segments) { ctx.moveTo(s.ax * sx, s.ay * sy); ctx.lineTo(s.bx * sx, s.by * sy); }
    ctx.stroke();
    // places
    for (const p of PLACES) { ctx.fillStyle = p.color; ctx.globalAlpha = 0.7; ctx.fillRect(p.x * sx, p.y * sy, p.w * sx, p.h * sy); }
    ctx.globalAlpha = 1;
    // police
    ctx.fillStyle = '#60a5fa';
    for (const v of state.vehicles) { if (v.type === 'police' && !v.dead) ctx.fillRect(v.x * sx - 2, v.y * sy - 2, 4, 4); }
    // player
    ctx.fillStyle = '#f2c94c';
    ctx.beginPath(); ctx.arc(state.player.x * sx, state.player.y * sy, 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawHUD(worldObj) {
    const { state } = worldObj;
    ctx.save();
    ctx.setTransform(camera.scale, 0, 0, camera.scale, camera.offsetX, camera.offsetY);

    // Objective panel
    ctx.fillStyle = PALETTE.panel;
    ctx.fillRect(16, 16, 520, 64);
    ctx.fillStyle = PALETTE.muted; ctx.font = `14px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(`Objective — ${FIXER_NAME}`, 26, 24);
    ctx.fillStyle = PALETTE.text; ctx.font = `18px ${FONT}`;
    wrapText(state.objective || '', 26, 44, 500, 20);

    // Money and health
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillStyle = PALETTE.money; ctx.font = `bold 22px ${FONT}`;
    ctx.fillText(`$${state.money}`, VIEW.width - HUD.minimapSize - HUD.minimapPad - 16, 16);
    // health bar
    const hbW = 200, hbH = 14, hbX = VIEW.width - HUD.minimapSize - HUD.minimapPad - 16 - hbW, hbY = 48;
    ctx.fillStyle = '#334155'; ctx.fillRect(hbX, hbY, hbW, hbH);
    const hp = clamp(state.player.health / PLAYER.maxHealth, 0, 1);
    ctx.fillStyle = hp > 0.35 ? '#22c55e' : '#ef4444';
    ctx.fillRect(hbX, hbY, hbW * hp, hbH);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.strokeRect(hbX, hbY, hbW, hbH);
    ctx.fillStyle = PALETTE.text; ctx.font = `12px ${FONT}`; ctx.textAlign = 'left';
    ctx.fillText('Health', hbX, hbY - 1);

    // Wanted stars
    ctx.textAlign = 'right'; ctx.font = `22px ${FONT}`;
    const starsY = 72;
    let starStr = '';
    for (let i = 0; i < WANTED.max; i++) starStr += i < state.wanted.stars ? '★' : '☆';
    ctx.fillStyle = state.wanted.stars > 0 ? PALETTE.star : PALETTE.muted;
    ctx.fillText(starStr, VIEW.width - HUD.minimapSize - HUD.minimapPad - 16, starsY);
    ctx.fillStyle = PALETTE.muted; ctx.font = `12px ${FONT}`;
    ctx.fillText(POLICE_NAME, VIEW.width - HUD.minimapSize - HUD.minimapPad - 16, starsY + 24);

    // message
    if (state.messageTimer > 0 && state.message) {
      ctx.textAlign = 'center'; ctx.font = `20px ${FONT}`;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      const mw = ctx.measureText(state.message).width + 30;
      ctx.fillRect(VIEW.width / 2 - mw / 2, VIEW.height - 70, mw, 34);
      ctx.fillStyle = PALETTE.text;
      ctx.fillText(state.message, VIEW.width / 2, VIEW.height - 46);
    }

    drawMinimap(worldObj);

    // location hint
    ctx.textAlign = 'left'; ctx.fillStyle = PALETTE.muted; ctx.font = `14px ${FONT}`;
    ctx.fillText(`${CITY_NAME}`, 16, VIEW.height - 24);

    ctx.restore();
  }

  function wrapText(text, x, y, maxWidth, lineHeight) {
    const words = String(text).split(' ');
    let line = '';
    let yy = y;
    for (let n = 0; n < words.length; n++) {
      const test = line ? line + ' ' + words[n] : words[n];
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, yy);
        line = words[n];
        yy += lineHeight;
      } else line = test;
    }
    if (line) ctx.fillText(line, x, yy);
  }

  function overlayBox(title, lines, prompt, accent = PALETTE.accent) {
    const w = 760, h = 360;
    const x = (VIEW.width - w) / 2, y = (VIEW.height - h) / 2;
    ctx.fillStyle = 'rgba(8, 12, 20, 0.72)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.fillStyle = PALETTE.panelSolid;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillStyle = accent; ctx.font = `bold 48px ${FONT}`;
    ctx.fillText(title, VIEW.width / 2, y + 28);
    ctx.fillStyle = PALETTE.text; ctx.font = `20px ${FONT}`;
    let yy = y + 100;
    for (const line of lines) {
      ctx.fillText(line, VIEW.width / 2, yy);
      yy += 30;
    }
    ctx.fillStyle = PALETTE.star; ctx.font = `22px ${FONT}`;
    ctx.fillText(prompt, VIEW.width / 2, y + h - 46);
  }

  function drawTitle(worldObj, hasSave) {
    const lines = [
      `An original open-world crime game in ${CITY_NAME}`,
      `Fixer: ${FIXER_NAME}  ·  Police: ${POLICE_NAME}`,
      '',
      ...CONTROLS_TEXT,
    ];
    if (hasSave) lines.push('', 'Saved game found — Enter to continue');
    overlayBox(TITLE, lines, hasSave ? 'Enter: Continue  ·  N: New Game' : 'Enter or Click: Play  ·  N: New Game');
    ctx.textAlign = 'center'; ctx.fillStyle = PALETTE.muted; ctx.font = `16px ${FONT}`;
    ctx.fillText('Opening job: steal a coupe at Hotel Azure and deliver it to Costa Marina.', VIEW.width / 2, VIEW.height - 120);
  }

  function drawPause() {
    overlayBox('Paused', ['The city waits in Costa Luna.', `Fixer on call: ${FIXER_NAME}`], 'Esc/P or Enter: Resume  ·  Progress saved');
  }

  function drawWasted(worldObj) {
    overlayBox('Wasted', [`You went down in ${CITY_NAME}.`, `Cash on hand: $${worldObj.state.money}`], 'Enter or Click: Restart', PALETTE.danger);
  }

  function drawComplete(worldObj) {
    const text = worldObj.state.message || 'Job complete.';
    overlayBox('Job Complete', [text, 'Keep working Costa Luna for cash and reputation.'], 'Back to the streets...', '#4ade80');
  }

  function draw(worldObj, hasSave = false) {
    beginFrame();
    const { state } = worldObj;
    if (state.screen === SCREENS.TITLE) {
      // draw a dim world backdrop behind title
      drawWorld(worldObj);
      ctx.save(); ctx.setTransform(camera.scale, 0, 0, camera.scale, camera.offsetX, camera.offsetY);
      drawTitle(worldObj, hasSave);
      ctx.restore();
    } else {
      drawWorld(worldObj);
      drawHUD(worldObj);
      ctx.save(); ctx.setTransform(camera.scale, 0, 0, camera.scale, camera.offsetX, camera.offsetY);
      if (state.screen === SCREENS.PAUSE) drawPause();
      else if (state.screen === SCREENS.WASTED) drawWasted(worldObj);
      else if (state.screen === SCREENS.COMPLETE) drawComplete(worldObj);
      ctx.restore();
    }
    endFrame();
  }

  return { draw, screenToWorld, resize };
}
