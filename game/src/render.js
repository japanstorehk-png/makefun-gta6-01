// Rendering for Solara Keys: world, entities, HUD, and screens.
import {
  TITLE, CITY_NAME, FIXER_NAME, POLICE_NAME, PLACES, WORLD, VIEW,
  COLORS, FONT, PLAYER, WANTED,
} from './config.js';
import { collidesBuilding } from './city.js';

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  canvas.width = VIEW.width;
  canvas.height = VIEW.height;

  function resize() {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    // keep logical resolution fixed for simplicity and consistent shots
    canvas.width = VIEW.width;
    canvas.height = VIEW.height;
  }
  resize();
  window.addEventListener('resize', resize);

  return { ctx, canvas };
}

export function render(renderer, world) {
  const { ctx } = renderer;
  const w = VIEW.width, h = VIEW.height;
  ctx.clearRect(0, 0, w, h);

  drawWorld(ctx, world);
  drawEntities(ctx, world);
  drawHud(ctx, world);

  if (world.screen === 'title') drawTitle(ctx, world);
  else if (world.screen === 'paused') drawPause(ctx, world);
  else if (world.screen === 'wasted') drawWasted(ctx, world);
  else if (world.screen === 'jobcomplete') drawJobComplete(ctx, world);
}

function withCamera(ctx, world, fn) {
  ctx.save();
  ctx.translate(-Math.floor(world.camera.x), -Math.floor(world.camera.y));
  fn();
  ctx.restore();
}

function drawWorld(ctx, world) {
  const cam = world.camera;
  // background
  ctx.fillStyle = COLORS.grass;
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);

  withCamera(ctx, world, () => {
    // water accents (decorative)
    ctx.fillStyle = COLORS.water;
    ctx.globalAlpha = 0.25;
    ctx.fillRect(0, WORLD.height - 140, 520, 140);
    ctx.fillRect(0, 0, 120, 260);
    ctx.globalAlpha = 1;

    // roads
    ctx.lineCap = 'round';
    for (const s of world.city.roadSegs) {
      ctx.strokeStyle = COLORS.road;
      ctx.lineWidth = 88;
      ctx.beginPath(); ctx.moveTo(s.ax, s.ay); ctx.lineTo(s.bx, s.by); ctx.stroke();
    }
    for (const s of world.city.roadSegs) {
      ctx.strokeStyle = COLORS.roadLine;
      ctx.lineWidth = 2;
      ctx.setLineDash([16, 14]);
      ctx.beginPath(); ctx.moveTo(s.ax, s.ay); ctx.lineTo(s.bx, s.by); ctx.stroke();
      ctx.setLineDash([]);
    }
    // intersections pads
    for (const n of world.city.nodes) {
      ctx.fillStyle = COLORS.road;
      ctx.beginPath(); ctx.arc(n.x, n.y, 36, 0, Math.PI*2); ctx.fill();
    }

    // blocks/buildings
    for (const b of world.city.blocks) {
      drawBuilding(ctx, b.x, b.y, b.w, b.h, COLORS.building, null);
    }
    // named places
    for (const p of world.city.places) {
      drawBuilding(ctx, p.x, p.y, p.w, p.h, p.color, p.name);
    }

    // objective marker
    if (world.objectivePos) {
      const t = (world.time || 0) * 3;
      const r = 18 + Math.sin(t) * 4;
      ctx.strokeStyle = COLORS.accent;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(world.objectivePos.x, world.objectivePos.y, r, 0, Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(world.objectivePos.x, world.objectivePos.y - 34);
      ctx.lineTo(world.objectivePos.x - 8, world.objectivePos.y - 18);
      ctx.lineTo(world.objectivePos.x + 8, world.objectivePos.y - 18);
      ctx.closePath(); ctx.fillStyle = COLORS.accent; ctx.fill();
    }
  });
}

function drawBuilding(ctx, x, y, w, h, color, label) {
  ctx.fillStyle = color || COLORS.building;
  ctx.globalAlpha = label ? 0.9 : 0.85;
  ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = COLORS.buildingStroke;
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
  // windows
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  for (let ix = x + 10; ix < x + w - 8; ix += 22) {
    for (let iy = y + 10; iy < y + h - 8; iy += 20) {
      ctx.fillRect(ix, iy, 10, 8);
    }
  }
  if (label) {
    ctx.font = `bold 14px ${FONT}`;
    ctx.fillStyle = '#0b1220';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w/2, y + h/2);
  }
}

function drawEntities(ctx, world) {
  withCamera(ctx, world, () => {
    // cars (non-player first)
    for (const c of world.cars) drawCar(ctx, world, c);
    // peds
    for (const ped of world.peds) drawPed(ctx, ped);
    // cops on foot
    for (const cop of world.cops) if (!cop.inCarId) drawCop(ctx, cop);
    // player on foot
    if (!world.player.inCarId) drawPlayer(ctx, world.player);
    // bullets
    for (const b of world.bullets) {
      ctx.fillStyle = b.owner === 'cop' ? COLORS.enemyBullet : COLORS.bullet;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.owner === 'cop' ? 3 : 3.5, 0, Math.PI*2); ctx.fill();
    }
  });
}

function drawCar(ctx, world, car) {
  const isPlayer = world.player.inCarId === car.id;
  const isMission = car.missionTag && world.mission && (world.mission.targetCarId === car.id);
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  let color = car.color || COLORS.traffic[0];
  if (car.type === 'police') color = COLORS.copCar;
  if (isPlayer) color = COLORS.playerCar;
  if (isMission) color = COLORS.targetCar;
  const w = car.w, h = car.h;
  roundRect(ctx, -w/2, -h/2, w, h, 5, color, '#0b1220');
  // windshield
  ctx.fillStyle = 'rgba(220,240,255,0.7)';
  ctx.fillRect(2, -h/2 + 3, w/4, h - 6);
  // headlights
  ctx.fillStyle = '#fff6bf';
  ctx.fillRect(w/2 - 4, -h/2 + 2, 3, 4);
  ctx.fillRect(w/2 - 4, h/2 - 6, 3, 4);
  // siren
  if (car.type === 'police') {
    const t = (world.time * 10) % 2 < 1;
    ctx.fillStyle = t ? '#ff4d6d' : '#4dabf7';
    ctx.fillRect(-4, -3, 8, 6);
  }
  ctx.restore();

  if (isMission) {
    ctx.save();
    ctx.translate(car.x, car.y - 26);
    ctx.fillStyle = COLORS.accent;
    ctx.font = `bold 12px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('TARGET', 0, 0);
    ctx.restore();
  }
}

function drawPed(ctx, ped) {
  ctx.fillStyle = ped.flee > 0 ? COLORS.pedFlee : COLORS.ped;
  ctx.beginPath(); ctx.arc(ped.x, ped.y, 8, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = '#111'; ctx.lineWidth = 1.5; ctx.stroke();
}

function drawCop(ctx, cop) {
  ctx.fillStyle = COLORS.cop;
  ctx.beginPath(); ctx.arc(cop.x, cop.y, 9, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = '#081018'; ctx.lineWidth = 2; ctx.stroke();
}

function drawPlayer(ctx, p) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.angle);
  ctx.fillStyle = COLORS.player;
  ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = COLORS.playerStroke; ctx.lineWidth = 2; ctx.stroke();
  // direction/gun
  ctx.strokeStyle = '#222'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(2,0); ctx.lineTo(14,0); ctx.stroke();
  ctx.restore();
}

function roundRect(ctx, x,y,w,h,r, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
}

function drawHud(ctx, world) {
  const p = world.player;
  const pad = 14;
  // top-left panel: health, money, wanted
  panel(ctx, 12, 12, 360, 78);
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillStyle = COLORS.text; ctx.font = `bold 18px ${FONT}`;
  ctx.fillText(`${CITY_NAME}`, 24, 20);
  ctx.font = `14px ${FONT}`; ctx.fillStyle = COLORS.muted;
  ctx.fillText(`Fixer: ${FIXER_NAME}  |  ${POLICE_NAME}`, 24, 42);

  // money
  ctx.textAlign = 'right'; ctx.fillStyle = COLORS.success; ctx.font = `bold 20px ${FONT}`;
  ctx.fillText(`$${world.money}`, 360, 18);
  // stars
  drawStars(ctx, 360, 46, world.wanted);

  // health bar
  const hbX = 24, hbY = 64, hbW = 220, hbH = 12;
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(hbX, hbY, hbW, hbH);
  const hp = clamp(p.health / p.maxHealth, 0, 1);
  ctx.fillStyle = hp > 0.35 ? COLORS.success : COLORS.danger;
  ctx.fillRect(hbX, hbY, hbW * hp, hbH);
  ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.strokeRect(hbX, hbY, hbW, hbH);
  ctx.fillStyle = COLORS.text; ctx.font = `12px ${FONT}`; ctx.textAlign = 'left';
  ctx.fillText(`Health ${Math.ceil(p.health)}`, hbX + hbW + 8, hbY - 2);

  // objective panel
  panel(ctx, 12, VIEW.height - 78, 760, 66);
  ctx.textAlign = 'left'; ctx.fillStyle = COLORS.accent; ctx.font = `bold 14px ${FONT}`;
  ctx.fillText('OBJECTIVE', 24, VIEW.height - 66);
  ctx.fillStyle = COLORS.text; ctx.font = `16px ${FONT}`;
  wrapText(ctx, world.objective || '', 24, VIEW.height - 44, 730, 20);

  // message toast
  if (world.messageTimer > 0 && world.message) {
    ctx.font = `16px ${FONT}`;
    const msg = world.message;
    const mw = Math.min(900, ctx.measureText(msg).width + 30);
    panel(ctx, (VIEW.width - mw)/2, 100, mw, 34);
    ctx.textAlign = 'center'; ctx.fillStyle = COLORS.text;
    ctx.fillText(msg, VIEW.width/2, 110);
  }

  drawMinimap(ctx, world);
  drawControlsHint(ctx, world);
}

function drawStars(ctx, rightX, y, count) {
  ctx.textAlign = 'right';
  ctx.font = `18px ${FONT}`;
  let s = '';
  for (let i=0;i<WANTED.max;i++) s += i < count ? '★' : '☆';
  ctx.fillStyle = count > 0 ? COLORS.accent : COLORS.muted;
  ctx.fillText(s, rightX, y);
}

function drawMinimap(ctx, world) {
  const mw = 190, mh = 150, mx = VIEW.width - mw - 12, my = 12;
  ctx.save();
  panel(ctx, mx, my, mw, mh);
  ctx.beginPath(); ctx.rect(mx, my, mw, mh); ctx.clip();
  ctx.fillStyle = COLORS.minimapBg; ctx.fillRect(mx, my, mw, mh);
  const sx = mw / WORLD.width, sy = mh / WORLD.height;
  // roads
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1;
  ctx.beginPath();
  for (const s of world.city.roadSegs) {
    ctx.moveTo(mx + s.ax * sx, my + s.ay * sy);
    ctx.lineTo(mx + s.bx * sx, my + s.by * sy);
  }
  ctx.stroke();
  // places
  for (const p of world.city.places) {
    ctx.fillStyle = p.color;
    ctx.fillRect(mx + p.x * sx, my + p.y * sy, Math.max(3, p.w*sx), Math.max(3, p.h*sy));
  }
  // objective
  if (world.objectivePos) {
    ctx.fillStyle = COLORS.accent;
    ctx.beginPath(); ctx.arc(mx + world.objectivePos.x*sx, my + world.objectivePos.y*sy, 4, 0, Math.PI*2); ctx.fill();
  }
  // cops
  ctx.fillStyle = COLORS.cop;
  for (const c of world.cops) { ctx.fillRect(mx + c.x*sx - 2, my + c.y*sy - 2, 3, 3); }
  // player
  const p = world.player;
  ctx.fillStyle = COLORS.playerCar;
  ctx.beginPath(); ctx.arc(mx + p.x*sx, my + p.y*sy, 4, 0, Math.PI*2); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.strokeRect(mx,my,mw,mh);
}

function drawControlsHint(ctx, world) {
  if (world.screen !== 'playing') return;
  ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
  ctx.font = `12px ${FONT}`; ctx.fillStyle = 'rgba(238,243,251,0.7)';
  ctx.fillText('Esc/P pause  |  E enter/exit  |  F melee  |  Mouse shoot  |  Shift sprint', VIEW.width - 14, VIEW.height - 10);
}

function panel(ctx, x,y,w,h) {
  ctx.fillStyle = COLORS.hudBg;
  ctx.fillRect(x,y,w,h);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.strokeRect(x,y,w,h);
}

function wrapText(ctx, text, x, y, maxW, lh) {
  const words = String(text).split(' ');
  let line = '';
  for (let i=0;i<words.length;i++) {
    const test = line ? line + ' ' + words[i] : words[i];
    if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, x, y); line = words[i]; y += lh; }
    else line = test;
  }
  if (line) ctx.fillText(line, x, y);
}

function drawTitle(ctx, world) {
  overlay(ctx);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = COLORS.accent; ctx.font = `bold 72px ${FONT}`;
  ctx.fillText(TITLE, VIEW.width/2, 160);
  ctx.fillStyle = COLORS.text; ctx.font = `28px ${FONT}`;
  ctx.fillText(`${CITY_NAME} — an original open-world crime story`, VIEW.width/2, 215);
  ctx.font = `20px ${FONT}`; ctx.fillStyle = COLORS.muted;
  ctx.fillText(`Fixer ${FIXER_NAME} has jobs. Stay ahead of ${POLICE_NAME}.`, VIEW.width/2, 250);

  panel(ctx, VIEW.width/2 - 360, 290, 720, 260);
  ctx.textAlign = 'left'; ctx.fillStyle = COLORS.text; ctx.font = `18px ${FONT}`;
  const lines = [
    'Controls:',
    'WASD — Move / Drive',
    'Shift — Sprint (on foot)',
    'E — Enter / Exit / Steal car',
    'Space — Handbrake (in car)',
    'F — Melee attack',
    'Mouse — Aim and shoot pistol (on foot)',
    'Esc / P — Pause (saves game)',
    'Enter or Click — Start / Continue',
    'N — New game',
  ];
  let y = 312;
  for (const l of lines) { ctx.fillText(l, VIEW.width/2 - 330, y); y += 24; }

  ctx.textAlign = 'center'; ctx.fillStyle = COLORS.success; ctx.font = `bold 22px ${FONT}`;
  ctx.fillText('Press Enter or Click to Start', VIEW.width/2, 585);
  ctx.fillStyle = COLORS.muted; ctx.font = `16px ${FONT}`;
  ctx.fillText('Opening job: steal a coupe at Hotel Azure and deliver it.', VIEW.width/2, 620);
}

function drawPause(ctx, world) {
  overlay(ctx, 0.45);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = COLORS.text; ctx.font = `bold 54px ${FONT}`;
  ctx.fillText('Paused', VIEW.width/2, 260);
  ctx.font = `22px ${FONT}`; ctx.fillStyle = COLORS.muted;
  ctx.fillText('Game saved locally. Press Esc/P to resume.', VIEW.width/2, 320);
  ctx.fillText('Press N for a new game.', VIEW.width/2, 355);
}

function drawWasted(ctx, world) {
  overlay(ctx, 0.6);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = COLORS.danger; ctx.font = `bold 72px ${FONT}`;
  ctx.fillText('WASTED', VIEW.width/2, 280);
  ctx.fillStyle = COLORS.text; ctx.font = `24px ${FONT}`;
  ctx.fillText(`${FIXER_NAME}: Costa Luna bites back.`, VIEW.width/2, 340);
  ctx.font = `20px ${FONT}`; ctx.fillStyle = COLORS.muted;
  ctx.fillText('Press Enter or Click to restart. Press N for a new game.', VIEW.width/2, 390);
}

function drawJobComplete(ctx, world) {
  overlay(ctx, 0.25);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  panel(ctx, VIEW.width/2 - 320, 260, 640, 120);
  ctx.fillStyle = COLORS.success; ctx.font = `bold 46px ${FONT}`;
  ctx.fillText('JOB COMPLETE', VIEW.width/2, 300);
  ctx.fillStyle = COLORS.text; ctx.font = `20px ${FONT}`;
  const msg = world.message || 'Nice work.';
  ctx.fillText(msg, VIEW.width/2, 345);
}

function overlay(ctx, alpha = 0.55) {
  ctx.fillStyle = `rgba(8,12,18,${alpha})`;
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
}
