// The renderer: paints the whole game every frame. The city is drawn layer by layer
// (water, roads, blocks, buildings, props), then cars, people, bullets and particles,
// then the HUD — minimap, money, wanted stars, health, objective — and finally the
// screen furniture: title, pause, dialogue, toasts and the wasted overlay.
// Solara Keys note: the minimap is a 6% scale of the world, so the minimap rects and
// the real city share one coordinate system and never drift apart.

import { VIEW, WORLD, FONT, PALETTE as C, clamp, TAU } from './config.js';
import { ROADS_X, ROADS_Y, ROAD_HALF, WATER, SAND, DOCK_APRON, NORTH_SCRUB, HOTEL, GARAGE, WAREHOUSE } from './city.js';

const MAP_SCALE = 0.06;
const MAP_W = Math.round(WORLD.width * MAP_SCALE);
const MAP_H = Math.round(WORLD.height * MAP_SCALE);

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let mapBase = null;

  function draw(world, screen) {
    resize();
    const w = canvas.width / (window.devicePixelRatio || 1);
    const h = canvas.height / (window.devicePixelRatio || 1);
    const s = Math.min(w / VIEW.width, h / VIEW.height);
    const ox = (w - VIEW.width * s) / 2, oy = (h - VIEW.height * s) / 2;
    const dpr = window.devicePixelRatio || 1;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0d0f16';
    ctx.fillRect(0, 0, w, h);
    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, VIEW.width, VIEW.height);
    ctx.clip();

    drawScene(world, screen);
    if (screen === 'title') drawTitle(world);
    else drawHud(world, screen);
    drawVignette();
    ctx.restore();
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.floor(window.innerWidth * dpr));
    const h = Math.max(1, Math.floor(window.innerHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  }

  // -- the world -------------------------------------------------------------

  function drawScene(world, screen) {
    const shake = world.shake;
    const sx = (Math.random() - 0.5) * shake * 3;
    const sy = (Math.random() - 0.5) * shake * 3;
    ctx.save();
    ctx.translate(VIEW.width / 2 - world.cam.x + sx, VIEW.height / 2 - world.cam.y + sy);
    drawGround();
    drawBlocks(world);
    drawProps(world);
    drawBuildings(world);
    drawTrees(world);
    if (screen !== 'title') {
      drawMarker(world);
      drawPickups(world);
    }
    for (const car of world.cars) if (inView(world, car.x, car.y, 90)) drawCar(car, world);
    drawMara(world);
    for (const ped of world.peds) if (inView(world, ped.x, ped.y, 40)) drawPed(ped);
    if (screen !== 'title' && !world.player.inCar && !world.wasted) drawFoot(world.player, world);
    drawBullets(world);
    drawParticles(world);
    ctx.restore();
  }

  function inView(world, x, y, margin) {
    return Math.abs(x - world.cam.x) < VIEW.width / 2 + margin && Math.abs(y - world.cam.y) < VIEW.height / 2 + margin;
  }

  function drawGround() {
    ctx.fillStyle = '#20242e';
    ctx.fillRect(-200, -200, WORLD.width + 400, WORLD.height + 400);
    ctx.fillStyle = C.grassDark;
    ctx.fillRect(NORTH_SCRUB.x, NORTH_SCRUB.y, NORTH_SCRUB.w, NORTH_SCRUB.h);
    ctx.fillStyle = C.water;
    for (const r of WATER) ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = C.waterDeep;
    for (const r of WATER) ctx.fillRect(r.x, r.y + r.h * 0.55, r.w, r.h * 0.45);
    ctx.fillStyle = C.sand;
    for (const r of SAND) ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = C.concrete;
    ctx.fillRect(DOCK_APRON.x, DOCK_APRON.y, DOCK_APRON.w, DOCK_APRON.h);
    // Ocean Drive: the road that hugs the beach.
    ctx.fillStyle = C.road;
    for (const x of ROADS_X) ctx.fillRect(x - ROAD_HALF, 372, ROAD_HALF * 2, 2388 - 372);
    for (const y of ROADS_Y) ctx.fillRect(472, y - ROAD_HALF, WORLD.width - 472, ROAD_HALF * 2);
    // Centre lines.
    ctx.strokeStyle = C.roadLine;
    ctx.lineWidth = 3;
    ctx.setLineDash([26, 22]);
    ctx.beginPath();
    for (const x of ROADS_X) { ctx.moveTo(x, 372); ctx.lineTo(x, 2388); }
    for (const y of ROADS_Y) { ctx.moveTo(472, y); ctx.lineTo(WORLD.width, y); }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawBlocks(world) {
    for (const b of world.city.blocks) {      ctx.fillStyle = C.sidewalk;
      ctx.fillRect(b.x0 - 16, b.y0 - 16, b.x1 - b.x0 + 32, b.y1 - b.y0 + 32);
      ctx.fillStyle = b.kind === 'park' ? C.grass : b.kind === 'lot' ? C.lot : C.block;
      ctx.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
      if (b.kind === 'lot') {
        ctx.strokeStyle = 'rgba(240,240,244,0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        const x0 = b.x0 + 40, y0 = b.y0 + 60;
        for (let i = 0; i <= 6; i += 1) {
          ctx.moveTo(x0 + i * 60 - 22, y0 - 20); ctx.lineTo(x0 + i * 60 - 22, y0 + 30);
          ctx.moveTo(x0 + i * 60 - 22, y0 + 130); ctx.lineTo(x0 + i * 60 - 22, y0 + 180);
        }
        ctx.stroke();
      }
    }
  }

  function drawBuildings(world) {
    for (const b of world.city.colliders) {
      if (!b.color) continue;
      if (b.x > world.cam.x + VIEW.width / 2 + 60 || b.x + b.w < world.cam.x - VIEW.width / 2 - 60) continue;
      if (b.y > world.cam.y + VIEW.height / 2 + 60 || b.y + b.h < world.cam.y - VIEW.height / 2 - 60) continue;
      ctx.fillStyle = 'rgba(10, 12, 18, 0.32)';
      ctx.fillRect(b.x + 7, b.y + 9, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = b.shade ?? 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 3;
      ctx.strokeRect(b.x + 1.5, b.y + 1.5, b.w - 3, b.h - 3);
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.fillRect(b.x, b.y, b.w, 6);
      if (b.acs) {
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        for (const ac of b.acs) ctx.fillRect(b.x + ac.dx, b.y + ac.dy, ac.s, ac.s * 0.7);
      }
      if (b.tower) {
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillRect(b.x + 40, b.y + 36, b.w - 80, b.h - 72);
      }
      if (b.door) {
        ctx.fillStyle = 'rgba(30, 32, 40, 0.85)';
        ctx.fillRect(b.x + b.w / 2 - 60, b.y + b.h - 14, 120, 14);
        ctx.fillStyle = 'rgba(240,240,244,0.25)';
        ctx.fillRect(b.x + b.w / 2 - 60, b.y + b.h - 14, 120, 4);
      }
      if (b.name) {
        ctx.fillStyle = 'rgba(24, 26, 34, 0.75)';
        ctx.font = `bold ${Math.min(20, b.w / (b.name.length * 0.72))}px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(b.name, b.x + b.w / 2, b.y + b.h / 2);
      }
    }
  }

  function drawProps(world) {
    for (const p of world.city.props) {
      switch (p.type) {
        case 'pool': {
          ctx.fillStyle = '#2a7f96';
          rr(p.x - 6, p.y - 6, p.w + 12, p.h + 12, 12);
          ctx.fillStyle = C.pool;
          rr(p.x, p.y, p.w, p.h, 9);
          ctx.fillStyle = 'rgba(255,255,255,0.25)';
          ctx.fillRect(p.x + 12, p.y + 14, 40, 5);
          ctx.fillRect(p.x + 30, p.y + 46, 56, 5);
          break;
        }
        case 'sign': {
          ctx.fillStyle = C.gold;
          ctx.font = `bold 24px ${FONT}`;
          ctx.textAlign = 'left';
          ctx.fillText(p.text, p.x, p.y - 14);
          break;
        }
        case 'pond': {
          ctx.fillStyle = C.pond;
          ctx.beginPath();
          ctx.ellipse(p.x + p.w / 2, p.y + p.h / 2, p.w / 2, p.h / 2, 0, 0, TAU);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.2)';
          ctx.beginPath();
          ctx.ellipse(p.x + p.w / 2 - 24, p.y + p.h / 2 - 12, 34, 10, 0, 0, TAU);
          ctx.fill();
          break;
        }
        case 'path': {
          ctx.fillStyle = '#c9b98a';
          ctx.fillRect(p.x, p.y, p.w, p.h);
          break;
        }
        case 'bench': {
          ctx.fillStyle = '#7a5a3a';
          ctx.fillRect(p.x, p.y, p.w, p.h);
          break;
        }
        case 'stall': {
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x, p.y, p.w, p.h);
          ctx.fillStyle = 'rgba(255,255,255,0.4)';
          for (let i = 0; i < p.w; i += 18) ctx.fillRect(p.x + i, p.y, 8, p.h);
          break;
        }
        case 'crate': {
          ctx.fillStyle = '#a07848';
          ctx.fillRect(p.x, p.y, p.w, p.h);
          ctx.strokeStyle = '#6e4f2c';
          ctx.lineWidth = 2;
          ctx.strokeRect(p.x + 1, p.y + 1, p.w - 2, p.h - 2);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + p.w, p.y + p.h);
          ctx.moveTo(p.x + p.w, p.y); ctx.lineTo(p.x, p.y + p.h);
          ctx.stroke();
          break;
        }
        case 'drum': {
          ctx.fillStyle = '#4f6f8f';
          ctx.beginPath();
          ctx.arc(p.x + 9, p.y + 9, 9, 0, TAU);
          ctx.fill();
          ctx.fillStyle = '#38516b';
          ctx.beginPath();
          ctx.arc(p.x + 9, p.y + 9, 5, 0, TAU);
          ctx.fill();
          break;
        }
        case 'tyre': {
          ctx.fillStyle = '#22242a';
          ctx.beginPath();
          ctx.arc(p.x + 8, p.y + 8, 8, 0, TAU);
          ctx.fill();
          ctx.fillStyle = '#3a3d45';
          ctx.beginPath();
          ctx.arc(p.x + 8, p.y + 8, 4, 0, TAU);
          ctx.fill();
          break;
        }
        case 'pier': {
          ctx.fillStyle = '#8a6a44';
          ctx.fillRect(p.x, p.y, p.w, p.h);
          ctx.strokeStyle = 'rgba(40,30,18,0.6)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          for (let i = 0; i < p.w; i += 22) { ctx.moveTo(p.x + i, p.y); ctx.lineTo(p.x + i, p.y + p.h); }
          ctx.stroke();
          break;
        }
        case 'boat': {
          ctx.fillStyle = '#d8dce2';
          ctx.beginPath();
          ctx.ellipse(p.x + p.w / 2, p.y + p.h / 2, p.w / 2, p.h / 2, 0, 0, TAU);
          ctx.fill();
          ctx.fillStyle = '#c25a4a';
          ctx.fillRect(p.x + p.w / 2 - 8, p.y - 4, 16, p.h + 8);
          break;
        }
        default: break;
      }
    }
  }

  function drawTrees(world) {
    for (const t of world.city.trees) {
      if (!inView(world, t.x, t.y, 50)) continue;
      ctx.fillStyle = 'rgba(10,12,18,0.3)';
      ctx.beginPath();
      ctx.ellipse(t.x + 5, t.y + 7, t.r * 0.8, t.r * 0.5, 0, 0, TAU);
      ctx.fill();
      if (t.palm) {
        ctx.strokeStyle = '#8a6a44';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(t.x, t.y);
        ctx.quadraticCurveTo(t.x + 6, t.y - t.r * 0.8, t.x + 2, t.y - t.r * 1.3);
        ctx.stroke();
        ctx.strokeStyle = '#3f8a49';
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        for (let i = 0; i < 6; i += 1) {
          const a = (i / 6) * TAU;
          ctx.beginPath();
          ctx.moveTo(t.x + 2, t.y - t.r * 1.3);
          ctx.quadraticCurveTo(
            t.x + 2 + Math.cos(a) * t.r * 0.8, t.y - t.r * 1.3 + Math.sin(a) * t.r * 0.5,
            t.x + 2 + Math.cos(a) * t.r * 1.15, t.y - t.r * 1.3 + Math.sin(a) * t.r * 0.75 + 6,
          );
          ctx.stroke();
        }
        ctx.lineCap = 'butt';
      } else {
        ctx.fillStyle = '#3f8a49';
        ctx.beginPath();
        ctx.arc(t.x, t.y, t.r, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#57a35e';
        ctx.beginPath();
        ctx.arc(t.x - t.r * 0.25, t.y - t.r * 0.25, t.r * 0.65, 0, TAU);
        ctx.fill();
      }
    }
  }

  function drawMarker(world) {
    const m = world.marker;
    if (!m || world.wasted) return;
    if (!inView(world, m.x, m.y, 80)) return;
    const pulse = 1 + Math.sin(world.time * 4) * 0.18;
    ctx.strokeStyle = m.gated ? 'rgba(150,156,168,0.8)' : 'rgba(242,193,78,0.9)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(m.x, m.y, 26 * pulse, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = m.gated ? 'rgba(150,156,168,0.25)' : 'rgba(242,193,78,0.25)';
    ctx.beginPath();
    ctx.arc(m.x, m.y, 26 * pulse, 0, TAU);
    ctx.fill();
    const bob = Math.sin(world.time * 3.4) * 6;
    ctx.fillStyle = m.gated ? '#969ca8' : C.gold;
    ctx.beginPath();
    ctx.moveTo(m.x - 12, m.y - 52 + bob);
    ctx.lineTo(m.x + 12, m.y - 52 + bob);
    ctx.lineTo(m.x, m.y - 30 + bob);
    ctx.closePath();
    ctx.fill();
  }

  function drawPickups(world) {
    for (const pk of world.pickups) {
      if (!pk.active || !inView(world, pk.x, pk.y, 40)) continue;
      const pulse = 1 + Math.sin(world.time * 5 + pk.x) * 0.15;
      ctx.fillStyle = 'rgba(92, 191, 106, 0.9)';
      ctx.beginPath();
      ctx.arc(pk.x, pk.y, 9 * pulse, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#10321a';
      ctx.font = `bold 11px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('$', pk.x, pk.y + 1);
    }
  }

  function drawMara(world) {
    const x = GARAGE.x, y = GARAGE.y + 34;
    ctx.fillStyle = 'rgba(10,12,18,0.3)';
    ctx.beginPath();
    ctx.ellipse(x, y + 8, 10, 5, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#7a2438';
    ctx.fillRect(x - 7, y - 10, 14, 18);
    ctx.fillStyle = '#f0c8a0';
    ctx.beginPath();
    ctx.arc(x, y - 15, 6, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#2c2018';
    ctx.fillRect(x - 6, y - 22, 12, 5);
    if (dist2(world.player.x, world.player.y, x, y) < 300 * 300) {
      ctx.font = `bold 12px ${FONT}`;
      ctx.fillStyle = C.gold;
      ctx.textAlign = 'center';
      ctx.fillText('MARA QUILL', x, y - 30);
    }
  }

  function dist2(ax, ay, bx, by) {
    const dx = ax - bx, dy = ay - by;
    return dx * dx + dy * dy;
  }

  // -- actors ------------------------------------------------------------------

  function drawCar(car, world) {
    const police = car.kind === 'police';
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.fillStyle = 'rgba(10,12,18,0.32)';
    ctx.save();
    ctx.rotate(car.angle);
    rr(-28, -12, 56, 26, 8);
    ctx.fill();
    ctx.restore();
    ctx.rotate(car.angle);
    // Wheels
    ctx.fillStyle = '#181a20';
    for (const [wx, wy] of [[-17, -14], [17, -14], [-17, 10], [17, 10]]) ctx.fillRect(wx - 6, wy - 3, 13, 7);
    // Body
    const body = car.wreck ? '#2c2e34' : car.color;
    ctx.fillStyle = body;
    rr(-26, -13, 52, 26, 7);
    ctx.fill();
    ctx.strokeStyle = car.wreck ? '#191b20' : 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 2;
    rr(-26, -13, 52, 26, 7);
    ctx.stroke();
    if (!car.wreck) {
      // Cabin and windows
      ctx.fillStyle = 'rgba(22, 28, 38, 0.9)';
      rr(-12, -10, 22, 20, 4);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      rr(-9, -8, 16, 16, 3);
      ctx.fill();
      // Lights
      ctx.fillStyle = '#ffe9a8';
      ctx.fillRect(23, -10, 4, 5);
      ctx.fillRect(23, 5, 4, 5);
      ctx.fillStyle = '#e2574c';
      ctx.fillRect(-26, -10, 3, 5);
      ctx.fillRect(-26, 5, 3, 5);
      if (police) {
        ctx.fillStyle = '#2b62b0';
        ctx.fillRect(-26, -13, 52, 7);
        ctx.fillStyle = '#e8eaee';
        ctx.fillRect(-26, -4, 52, 3);
        const flash = Math.floor(world.time * 6) % 2 === 0;
        ctx.fillStyle = flash ? '#ff4a4a' : '#3a76ff';
        ctx.fillRect(-6, -11, 6, 5);
        ctx.fillStyle = flash ? '#3a76ff' : '#ff4a4a';
        ctx.fillRect(1, -11, 6, 5);
        if (car.siren) {
          ctx.globalAlpha = 0.35;
          ctx.fillStyle = flash ? '#ff4a4a' : '#3a76ff';
          ctx.beginPath();
          ctx.arc(0, 0, 42, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      } else if (car.kind === 'taxi') {
        ctx.fillStyle = '#22242a';
        ctx.fillRect(-7, -6, 14, 5);
        ctx.fillStyle = '#ffd94a';
        ctx.font = `bold 7px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText('TAXI', 0, -2);
      } else if (car.kind === 'special') {
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillRect(-26, -2, 52, 3);
      }
      if (car.hp < car.maxHp * 0.45) {
        ctx.fillStyle = 'rgba(30,30,34,0.5)';
        ctx.beginPath();
        ctx.arc(16, 0, 8, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawPed(ped) {
    const bob = Math.sin(ped.phase) * 1.6;
    ctx.save();
    ctx.translate(ped.x, ped.y);
    if (ped.state === 'dead') {
      ctx.fillStyle = 'rgba(140, 24, 30, 0.75)';
      ctx.beginPath();
      ctx.ellipse(0, 4, 14, 8, 0, 0, TAU);
      ctx.fill();
      ctx.rotate(ped.angle + Math.PI / 2);
      ctx.fillStyle = ped.shirt;
      ctx.fillRect(-5, -8, 10, 16);
      ctx.fillStyle = ped.skin;
      ctx.beginPath();
      ctx.arc(0, -12, 5, 0, TAU);
      ctx.fill();
      ctx.restore();
      return;
    }
    ctx.fillStyle = 'rgba(10,12,18,0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 6, 8, 4, 0, 0, TAU);
    ctx.fill();
    ctx.rotate(ped.angle);
    ctx.fillStyle = '#26292f';
    ctx.fillRect(-2 + bob, -6, 6, 3);
    ctx.fillRect(-2 - bob, 3, 6, 3);
    ctx.fillStyle = ped.shirt;
    rr(-6, -6, 13, 12, 4);
    ctx.fill();
    ctx.fillStyle = ped.skin;
    ctx.beginPath();
    ctx.arc(2, 0, 5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#241d16';
    ctx.beginPath();
    ctx.arc(0, 0, 4.6, Math.PI * 0.6, Math.PI * 1.4);
    ctx.fill();
    ctx.restore();
  }

  function drawFoot(p, world) {
    const bob = Math.sin(p.walkPhase) * 1.8;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = 'rgba(10,12,18,0.32)';
    ctx.beginPath();
    ctx.ellipse(0, 7, 9, 4.5, 0, 0, TAU);
    ctx.fill();
    if (p.swing > 0) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 40, p.aimA - 0.9 + (0.22 - p.swing) * 8, p.aimA + 0.9 + (0.22 - p.swing) * 8);
      ctx.stroke();
    } else if (world.time - p.lastHurt < 0.1) {
      // flinch, nothing to draw
    }
    ctx.rotate(p.aimA);
    ctx.fillStyle = '#1d2027';
    ctx.fillRect(-2 + bob, -7, 7, 4);
    ctx.fillRect(-2 - bob, 3, 7, 4);
    ctx.fillStyle = '#e8e4da';
    rr(-7, -7, 14, 14, 5);
    ctx.fill();
    ctx.fillStyle = '#2b7f9e';
    ctx.fillRect(-7, -2, 14, 4);
    ctx.fillStyle = '#f0c8a0';
    ctx.beginPath();
    ctx.arc(3, 0, 5.4, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#17303c';
    ctx.beginPath();
    ctx.arc(1, 0, 5.2, Math.PI * 0.55, Math.PI * 1.45);
    ctx.fill();
    ctx.fillStyle = '#2b7f9e';
    ctx.fillRect(-4, -7.5, 10, 3.5);
    ctx.restore();
    // Aim line
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(p.x + Math.cos(p.aimA) * 22, p.y + Math.sin(p.aimA) * 22);
    ctx.lineTo(p.x + Math.cos(p.aimA) * 110, p.y + Math.sin(p.aimA) * 110);
    ctx.stroke();
  }

  function drawBullets(world) {
    ctx.strokeStyle = '#ffd977';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (const b of world.bullets) {
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - b.vx * 0.018, b.y - b.vy * 0.018);
    }
    ctx.stroke();
  }

  function drawParticles(world) {
    for (const p of world.particles) {
      const a = clamp(p.life / 0.6, 0, 1);
      if (p.kind === 'spark') ctx.fillStyle = `rgba(255, 217, 119, ${a})`;
      else if (p.kind === 'smoke') ctx.fillStyle = `rgba(120, 122, 130, ${a * 0.4})`;
      else if (p.kind === 'blood') ctx.fillStyle = `rgba(163, 35, 42, ${a})`;
      else if (p.kind === 'fire') ctx.fillStyle = a > 0.5 ? `rgba(255, 136, 51, ${a})` : `rgba(255, 217, 119, ${a})`;
      else if (p.kind === 'tyre') ctx.fillStyle = `rgba(64, 64, 70, ${a * 0.6})`;
      else if (p.kind === 'ring') {
        ctx.strokeStyle = `rgba(255, 160, 60, ${a})`;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, TAU);
        ctx.stroke();
        continue;
      } else ctx.fillStyle = `rgba(200, 200, 205, ${a})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1, p.size), 0, TAU);
      ctx.fill();
    }
  }

  // -- HUD ---------------------------------------------------------------------

  function drawHud(world, screen) {
    drawMinimap(world);
    drawStatus(world);
    drawObjective(world);
    drawWeaponAndSpeed(world);
    if (world.toast) drawToast(world);
    if (world.banner) drawBanner(world);
    if (world.dialogue) drawDialogue(world);
    if (world.wasted) drawWasted(world);
  }

  function drawMinimap(world) {
    if (!mapBase) mapBase = buildMapBase(world);
    const px = 14, py = 14;
    ctx.fillStyle = C.panelLight;
    rr(px - 6, py - 6, MAP_W + 12, MAP_H + 24, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(242,193,78,0.55)';
    ctx.lineWidth = 2;
    rr(px - 6, py - 6, MAP_W + 12, MAP_H + 24, 10);
    ctx.stroke();
    ctx.drawImage(mapBase, px, py);
    const toMap = (x, y) => [px + x * MAP_SCALE, py + y * MAP_SCALE];
    // Cops
    ctx.fillStyle = '#ff5a4e';
    for (const car of world.cars) {
      if (car.kind !== 'police' || car.wreck) continue;
      const [mx, my] = toMap(car.x, car.y);
      ctx.fillRect(mx - 2.5, my - 2.5, 5, 5);
    }
    // Mission marker / gig
    if (world.marker) {
      const [mx, my] = toMap(world.marker.x, world.marker.y);
      const pulse = 3 + Math.sin(world.time * 5) * 1.5;
      ctx.fillStyle = world.marker.gated ? '#969ca8' : C.gold;
      ctx.beginPath();
      ctx.arc(mx, my, pulse + 1.5, 0, TAU);
      ctx.fill();
    }
    // Player
    const p = world.player;
    const actor = p.inCar ?? p;
    const [mx, my] = toMap(actor.x, actor.y);
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate((p.inCar ? p.inCar.angle : p.aimA) + Math.PI / 2);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4.5, 5);
    ctx.lineTo(-4.5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(230,232,238,0.8)';
    ctx.font = `bold 10px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('COSTA LUNA', px + 2, py + MAP_H + 12);
    ctx.textAlign = 'right';
    ctx.fillText(world.district, px + MAP_W - 2, py + MAP_H + 12);
  }

  function buildMapBase(world) {
    const off = document.createElement('canvas');
    off.width = MAP_W;
    off.height = MAP_H;
    const g = off.getContext('2d');
    g.fillStyle = '#1b1f29';
    g.fillRect(0, 0, MAP_W, MAP_H);
    g.fillStyle = '#164361';
    for (const r of WATER) g.fillRect(r.x * MAP_SCALE, r.y * MAP_SCALE, r.w * MAP_SCALE, r.h * MAP_SCALE);
    g.fillStyle = '#5c5340';
    for (const r of SAND) g.fillRect(r.x * MAP_SCALE, r.y * MAP_SCALE, r.w * MAP_SCALE, r.h * MAP_SCALE);
    g.fillStyle = '#3c414c';
    for (const y of ROADS_Y) g.fillRect(472 * MAP_SCALE, (y - ROAD_HALF) * MAP_SCALE, (WORLD.width - 472) * MAP_SCALE, ROAD_HALF * 2 * MAP_SCALE);
    for (const x of ROADS_X) g.fillRect((x - ROAD_HALF) * MAP_SCALE, 372 * MAP_SCALE, ROAD_HALF * 2 * MAP_SCALE, (2388 - 372) * MAP_SCALE);
    g.fillStyle = '#2a3140';
    for (const b of world.city.blocks) {
      g.fillStyle = b.kind === 'park' ? '#2e5a38' : '#2a3140';
      g.fillRect(b.x0 * MAP_SCALE, b.y0 * MAP_SCALE, (b.x1 - b.x0) * MAP_SCALE, (b.y1 - b.y0) * MAP_SCALE);
    }
    g.fillStyle = '#38404f';
    for (const b of world.city.colliders) {
      if (!b.color) continue;
      g.fillRect(b.x * MAP_SCALE, b.y * MAP_SCALE, Math.max(2, b.w * MAP_SCALE), Math.max(2, b.h * MAP_SCALE));
    }
    g.fillStyle = '#dfe3ea';
    g.font = `bold 9px ${FONT}`;
    g.textAlign = 'center';
    g.fillText('H', HOTEL.x * MAP_SCALE, HOTEL.y * MAP_SCALE + 3);
    g.fillText('Q', GARAGE.x * MAP_SCALE, GARAGE.y * MAP_SCALE + 3);
    g.fillText('W', WAREHOUSE.x * MAP_SCALE, WAREHOUSE.y * MAP_SCALE + 3);
    return off;
  }

  function drawStatus(world) {
    const p = world.player;
    // Money
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.font = `bold 30px ${FONT}`;
    ctx.fillStyle = 'rgba(10,12,16,0.6)';
    ctx.fillText(`$${world.money.toLocaleString('en-US')}`, VIEW.width - 14 + 2, 40 + 2);
    ctx.fillStyle = '#8fd694';
    ctx.fillText(`$${world.money.toLocaleString('en-US')}`, VIEW.width - 14, 40);
    // Wanted stars
    for (let i = 0; i < 5; i += 1) {
      const x = VIEW.width - 30 - (4 - i) * 30, y = 66;
      const filled = i < world.wanted;
      starPath(x, y, 11);
      if (filled) {
        ctx.fillStyle = '#ff5a4e';
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else {
        ctx.strokeStyle = 'rgba(230,232,238,0.35)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
    // Health
    const hw = 152;
    ctx.fillStyle = 'rgba(10,12,16,0.6)';
    rr(VIEW.width - 14 - hw, 82, hw, 12, 6);
    ctx.fill();
    const frac = clamp(p.health / 100, 0, 1);
    ctx.fillStyle = frac > 0.5 ? '#5cbf6a' : frac > 0.25 ? '#f2c14e' : '#ff5a4e';
    if (frac > 0) {
      rr(VIEW.width - 14 - hw + 2, 84, (hw - 4) * frac, 8, 4);
      ctx.fill();
    }
  }

  function starPath(cx, cy, r) {
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const rad = i % 2 === 0 ? r : r * 0.45;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  function drawObjective(world) {
    const text = world.objective ?? '';
    if (!text) return;
    ctx.font = `600 17px ${FONT}`;
    const tw = ctx.measureText(text).width;
    const w = tw + 118, x = (VIEW.width - w) / 2, y = VIEW.height - 58;
    ctx.fillStyle = C.panel;
    rr(x, y, w, 40, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(242,193,78,0.4)';
    ctx.lineWidth = 1.5;
    rr(x, y, w, 40, 10);
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = C.gold;
    ctx.font = `bold 11px ${FONT}`;
    ctx.fillText('OBJECTIVE', x + 16, y + 20);
    ctx.fillStyle = C.text;
    ctx.font = `600 17px ${FONT}`;
    ctx.fillText(text, x + 96, y + 21);
    if (world.prompt) {
      ctx.fillStyle = 'rgba(220,226,236,0.85)';
      ctx.font = `600 15px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(world.prompt, VIEW.width / 2, y - 14);
    }
  }

  function drawWeaponAndSpeed(world) {
    const p = world.player;
    // Weapon, bottom left
    ctx.fillStyle = C.panel;
    rr(16, VIEW.height - 64, 168, 46, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    rr(16, VIEW.height - 64, 168, 46, 10);
    ctx.stroke();
    ctx.save();
    ctx.translate(44, VIEW.height - 41);
    ctx.fillStyle = '#dfe3ea';
    ctx.fillRect(-10, -4, 20, 6);
    ctx.fillRect(4, -1, 5, 9);
    ctx.fillRect(-10, -7, 8, 4);
    ctx.restore();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = C.text;
    ctx.font = `bold 15px ${FONT}`;
    ctx.fillText('PISTOL', 68, VIEW.height - 46);
    ctx.fillStyle = C.muted;
    ctx.font = `12px ${FONT}`;
    ctx.fillText('LMB fire · F melee', 68, VIEW.height - 28);
    // Speed, bottom right
    if (p.inCar) {
      const kmh = Math.round(Math.hypot(p.inCar.vx, p.inCar.vy) * 0.45);
      ctx.fillStyle = C.panel;
      rr(VIEW.width - 132, VIEW.height - 64, 116, 46, 10);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      rr(VIEW.width - 132, VIEW.height - 64, 116, 46, 10);
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillStyle = C.text;
      ctx.font = `bold 24px ${FONT}`;
      ctx.fillText(`${kmh}`, VIEW.width - 74, VIEW.height - 46);
      ctx.fillStyle = C.muted;
      ctx.font = `12px ${FONT}`;
      ctx.fillText('km/h', VIEW.width - 74, VIEW.height - 26);
    }
  }

  function drawToast(world) {
    const t = world.toast;
    const alpha = t.t < 0.25 ? t.t / 0.25 : t.t > t.max - 0.5 ? Math.max(0, (t.max - t.t) / 0.5) : 1;
    ctx.globalAlpha = alpha;
    ctx.font = t.district ? `bold 34px ${FONT}` : `600 19px ${FONT}`;
    const tw = ctx.measureText(t.text).width;
    const w = tw + 56, x = (VIEW.width - w) / 2, y = 96;
    ctx.fillStyle = C.panel;
    rr(x, y, w, t.district ? 58 : 42, 10);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = t.district ? C.gold : C.text;
    ctx.fillText(t.text, VIEW.width / 2, y + (t.district ? 30 : 22));
    ctx.globalAlpha = 1;
  }

  function drawBanner(world) {
    const b = world.banner;
    const alpha = b.t < 0.3 ? b.t / 0.3 : b.t > 2.5 ? Math.max(0, (3.2 - b.t) / 0.7) : 1;
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 44px ${FONT}`;
    ctx.fillStyle = 'rgba(10,12,16,0.7)';
    ctx.fillText(b.title, VIEW.width / 2 + 3, 213);
    ctx.fillStyle = C.gold;
    ctx.fillText(b.title, VIEW.width / 2, 210);
    ctx.font = `600 18px ${FONT}`;
    ctx.fillStyle = C.text;
    ctx.fillText(b.sub, VIEW.width / 2, 248);
    ctx.globalAlpha = 1;
  }

  function wrapText(text, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }

  function drawDialogue(world) {
    const d = world.dialogue;
    const line = d.lines[Math.min(d.index, d.lines.length - 1)];
    const w = 860, x = (VIEW.width - w) / 2, y = VIEW.height - 196, h = 108;
    ctx.fillStyle = C.panelLight;
    rr(x, y, w, h, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(242,193,78,0.5)';
    ctx.lineWidth = 2;
    rr(x, y, w, h, 12);
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = C.gold;
    ctx.font = `bold 15px ${FONT}`;
    ctx.fillText(line.who, x + 24, y + 30);
    ctx.fillStyle = C.text;
    ctx.font = `500 18px ${FONT}`;
    const lines = wrapText(line.text, w - 220);
    for (let i = 0; i < Math.min(2, lines.length); i += 1) ctx.fillText(lines[i], x + 24, y + 58 + i * 24);
    ctx.textAlign = 'right';
    ctx.fillStyle = d.t > 1.2 && Math.floor(d.t * 2.5) % 2 === 0 ? C.muted : C.gold;
    ctx.font = `bold 14px ${FONT}`;
    ctx.fillText('ENTER ▸', x + w - 24, y + h - 20);
    ctx.textAlign = 'center';
    ctx.fillStyle = C.muted;
    ctx.font = `11px ${FONT}`;
    ctx.fillText(`${Math.min(d.index + 1, d.lines.length)} / ${d.lines.length}`, x + w / 2, y + h - 14);
  }

  function drawWasted(world) {
    const pulse = 0.5 + Math.sin(world.wastedT * 2.4) * 0.5;
    ctx.fillStyle = `rgba(120, 10, 14, ${0.28 + pulse * 0.14})`;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 86px ${FONT}`;
    ctx.fillStyle = 'rgba(10,10,12,0.75)';
    ctx.fillText('WASTED', VIEW.width / 2 + 4, VIEW.height / 2 + 4);
    ctx.fillStyle = '#e8e2d4';
    ctx.fillText('WASTED', VIEW.width / 2, VIEW.height / 2);
    if (world.wastedT > 1) {
      ctx.font = `600 19px ${FONT}`;
      ctx.fillStyle = C.text;
      ctx.fillText('ENTER — get back on your feet at Quill\'s Garage', VIEW.width / 2, VIEW.height / 2 + 64);
    }
  }

  // -- title screen ------------------------------------------------------------

  function drawTitle(world) {
    const g = ctx.createLinearGradient(0, 0, 0, VIEW.height);
    g.addColorStop(0, 'rgba(13, 16, 26, 0.62)');
    g.addColorStop(0.55, 'rgba(13, 16, 26, 0.78)');
    g.addColorStop(1, 'rgba(13, 16, 26, 0.94)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    // Setting sun
    const sun = ctx.createRadialGradient(640, 300, 10, 640, 300, 190);
    sun.addColorStop(0, 'rgba(255, 170, 80, 0.55)');
    sun.addColorStop(0.55, 'rgba(255, 130, 70, 0.22)');
    sun.addColorStop(1, 'rgba(255, 130, 70, 0)');
    ctx.fillStyle = sun;
    ctx.fillRect(430, 90, 420, 420);
    // Palm silhouettes
    palmSilhouette(150, 720, 1.35);
    palmSilhouette(1130, 720, 1.1);
    // Title
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = `800 100px ${FONT}`;
    const tg = ctx.createLinearGradient(0, 190, 0, 290);
    tg.addColorStop(0, '#ffe9b0');
    tg.addColorStop(0.55, '#f2c14e');
    tg.addColorStop(1, '#e2903c');
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillText('SOLARA KEYS', VIEW.width / 2 + 5, 285);
    ctx.fillStyle = tg;
    ctx.fillText('SOLARA KEYS', VIEW.width / 2, 280);
    ctx.font = `600 22px ${FONT}`;
    ctx.fillStyle = 'rgba(232, 236, 244, 0.92)';
    ctx.fillText('A  C O S T A   L U N A   S T O R Y', VIEW.width / 2, 326);
    // Menu
    const hasSave = !!world.hasSave;
    ctx.font = `bold 22px ${FONT}`;
    ctx.fillStyle = C.gold;
    ctx.fillText(hasSave ? 'ENTER or CLICK — continue' : 'ENTER or CLICK — start', VIEW.width / 2, 396);
    ctx.font = `600 16px ${FONT}`;
    ctx.fillStyle = 'rgba(220,226,236,0.85)';
    ctx.fillText('N — new game      M — mute', VIEW.width / 2, 430);
    // Controls
    const controls = [
      ['WASD', 'move / drive'], ['SHIFT', 'sprint'], ['E', 'enter · exit car'],
      ['SPACE', 'handbrake'], ['F', 'melee'], ['LMB', 'fire pistol'], ['ESC / P', 'pause'],
    ];
    ctx.font = `600 14px ${FONT}`;
    let cx = VIEW.width / 2 - 330, cy = 478;
    for (let i = 0; i < controls.length; i += 1) {
      const [k, v] = controls[i];
      ctx.textAlign = 'left';
      ctx.fillStyle = C.gold;
      ctx.fillText(k, cx, cy);
      ctx.fillStyle = 'rgba(200, 208, 220, 0.9)';
      ctx.fillText(v, cx + 62, cy);
      cx += 165;
      if (i === 3) { cx = VIEW.width / 2 - 330; cy += 28; }
    }
    ctx.textAlign = 'center';
    ctx.font = `12px ${FONT}`;
    ctx.fillStyle = 'rgba(160, 168, 182, 0.8)';
    ctx.fillText('An original open-world driving game — run jobs for Mara Quill and outrun the Luna PD.', VIEW.width / 2, VIEW.height - 28);
  }

  function palmSilhouette(x, baseY, scale) {
    ctx.strokeStyle = 'rgba(8, 10, 16, 0.85)';
    ctx.lineWidth = 10 * scale;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, baseY);
    ctx.quadraticCurveTo(x + 14 * scale, baseY - 90 * scale, x + 4 * scale, baseY - 150 * scale);
    ctx.stroke();
    ctx.lineWidth = 7 * scale;
    for (let i = 0; i < 7; i += 1) {
      const a = Math.PI + (i / 6) * Math.PI;
      ctx.beginPath();
      ctx.moveTo(x + 4 * scale, baseY - 150 * scale);
      ctx.quadraticCurveTo(
        x + 4 * scale + Math.cos(a) * 70 * scale, baseY - 150 * scale + Math.sin(a) * 34 * scale,
        x + 4 * scale + Math.cos(a) * 105 * scale, baseY - 150 * scale + Math.sin(a) * 30 * scale + 30 * scale,
      );
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
  }

  function drawVignette() {
    const v = ctx.createRadialGradient(VIEW.width / 2, VIEW.height / 2, VIEW.height * 0.42, VIEW.width / 2, VIEW.height / 2, VIEW.height * 0.86);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(4, 6, 12, 0.42)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  }

  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  return { draw };
}
