// render.js — canvas world renderer.
import { WORLD, V_ROADS, H_ROADS, ROAD_W, SAND_X, SEA_X, PIER } from './city.js';
import { drawCar } from './vehicles.js';
import { drawPed } from './people.js';
import { drawEnemy } from './combat.js';
import { drawEffects } from './effects.js';

const ZONE_LABELS = [
  { x: 1800, y: 900, text: 'DOWNTOWN' },
  { x: 700, y: 2000, text: 'OLD TOWN' },
  { x: 3350, y: 900, text: 'PALMA BEACH' },
  { x: 2600, y: 3050, text: 'EAST HARBOUR' },
  { x: 1800, y: 180, text: 'NORTHSIDE' },
];

export function drawWorld(game, ctx, cam, vw, vh) {
  const fx = game.effects;
  const ox = fx.shakeX || 0, oy = fx.shakeY || 0;
  ctx.save();
  ctx.translate(-cam.x + ox, -cam.y + oy);

  const x0 = cam.x - 40, y0 = cam.y - 40, x1 = cam.x + vw + 40, y1 = cam.y + vh + 40;
  const visible = (x, y, r) => x + r > x0 && x - r < x1 && y + r > y0 && y - r < y1;

  // Ground: grass base, sand strip, sea.
  ctx.fillStyle = '#2e5d33';
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  ctx.fillStyle = '#d8c08a';
  ctx.fillRect(Math.max(x0, SAND_X), y0, x1 - Math.max(x0, SAND_X), y1 - y0);
  ctx.fillStyle = '#1a6a9a';
  ctx.fillRect(Math.max(x0, SEA_X), y0, x1 - Math.max(x0, SEA_X), y1 - y0);
  // Wave lines.
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 2;
  for (let y = Math.floor(y0 / 90) * 90; y < y1; y += 90) {
    ctx.beginPath();
    ctx.moveTo(SEA_X + 30, y);
    ctx.lineTo(Math.min(x1, SEA_X + 130), y);
    ctx.stroke();
  }

  // Roads.
  ctx.fillStyle = '#33333a';
  for (const rx of V_ROADS) {
    if (rx + ROAD_W / 2 < x0 || rx - ROAD_W / 2 > x1) continue;
    ctx.fillRect(rx - ROAD_W / 2, y0, ROAD_W, y1 - y0);
  }
  for (const ry of H_ROADS) {
    if (ry + ROAD_W / 2 < y0 || ry - ROAD_W / 2 > y1) continue;
    ctx.fillRect(x0, ry - ROAD_W / 2, x1 - x0, ROAD_W);
  }
  // Centre dashes.
  ctx.fillStyle = '#d8b93a';
  for (const rx of V_ROADS) {
    if (rx < x0 || rx > x1) continue;
    for (let y = Math.floor(y0 / 60) * 60; y < y1; y += 60) ctx.fillRect(rx - 2, y, 4, 30);
  }
  for (const ry of H_ROADS) {
    if (ry < y0 || ry > y1) continue;
    for (let x = Math.floor(x0 / 60) * 60; x < x1; x += 60) ctx.fillRect(x, ry - 2, 30, 4);
  }
  // Crosswalks at intersections.
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  for (const rx of V_ROADS) {
    for (const ry of H_ROADS) {
      if (!visible(rx, ry, 120)) continue;
      for (let i = -2; i <= 2; i++) {
        ctx.fillRect(rx - ROAD_W / 2 + 8, ry - ROAD_W / 2 + 30 + i * 12, 26, 6);
        ctx.fillRect(rx + ROAD_W / 2 - 34, ry - ROAD_W / 2 + 30 + i * 12, 26, 6);
      }
    }
  }

  // Sidewalk tint around blocks (subtle).
  ctx.fillStyle = 'rgba(200,200,190,0.10)';
  for (const rx of V_ROADS) ctx.fillRect(rx - ROAD_W / 2 - 14, y0, 14, y1 - y0), ctx.fillRect(rx + ROAD_W / 2, y0, 14, y1 - y0);

  // Pier deck.
  ctx.fillStyle = '#a8825a';
  ctx.fillRect(PIER.x, PIER.y, PIER.w, PIER.h);
  ctx.strokeStyle = '#7a5c3e';
  ctx.lineWidth = 2;
  for (let x = PIER.x; x < PIER.x + PIER.w; x += 20) {
    ctx.beginPath(); ctx.moveTo(x, PIER.y); ctx.lineTo(x, PIER.y + PIER.h); ctx.stroke();
  }

  // Buildings.
  for (const b of game.city.buildings) {
    if (!visible(b.x + b.w / 2, b.y + b.h / 2, Math.max(b.w, b.h))) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(b.x + 6, b.y + 8, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x + 8, b.y + 8, b.w - 16, b.h - 16);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(b.x + 8, b.y + 8, b.w - 16, 10);
    if (b.name) {
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.font = 'bold 15px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(b.name, b.x + b.w / 2, b.y - 8);
    }
  }

  // Palms.
  for (const p of game.city.palms) {
    if (!visible(p.x, p.y, 30)) continue;
    ctx.strokeStyle = '#7a5c3e';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + 3, p.y - 8); ctx.stroke();
    ctx.fillStyle = '#2a7a2a';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      ctx.beginPath();
      ctx.ellipse(p.x + Math.cos(a) * 7 + 3, p.y - 8 + Math.sin(a) * 7, 9, 4, a, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Zone labels.
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.font = 'bold 44px Arial, sans-serif';
  ctx.textAlign = 'center';
  for (const z of ZONE_LABELS) {
    if (visible(z.x, z.y, 200)) ctx.fillText(z.text, z.x, z.y);
  }

  // Mission beacon.
  if (game.objective && game.objective.marker) {
    const m = game.objective.marker;
    const pulse = 26 + Math.sin(game.time * 4) * 8;
    ctx.strokeStyle = 'rgba(241,196,15,0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(m.x, m.y, pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(241,196,15,0.25)';
    ctx.beginPath();
    ctx.arc(m.x, m.y, pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(241,196,15,0.12)';
    ctx.fillRect(m.x - 6, m.y - 400, 12, 400);
  }

  // Cars, peds, enemies.
  for (const car of game.cars) {
    if (visible(car.x, car.y, 60)) drawCar(ctx, car, game.time);
  }
  for (const p of game.peds) {
    if (visible(p.x, p.y, 30)) drawPed(ctx, p);
  }
  for (const e of game.enemies) {
    if (visible(e.x, e.y, 40)) drawEnemy(ctx, e, game.time);
  }

  // Player on foot.
  const pl = game.player;
  if (!pl.car) {
    ctx.save();
    ctx.translate(pl.x, pl.y);
    ctx.rotate(pl.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(1, 2, 10, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f5f0e6'; // Dice's white tee
    ctx.beginPath();
    ctx.ellipse(0, 0, 10, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8b88a';
    ctx.beginPath();
    ctx.arc(4, 0, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#222';
    ctx.fillRect(8, -1.5, 11, 3);
    ctx.restore();
    // Aim line (faint).
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pl.x + Math.cos(pl.angle) * 20, pl.y + Math.sin(pl.angle) * 20);
    ctx.lineTo(pl.x + Math.cos(pl.angle) * 60, pl.y + Math.sin(pl.angle) * 60);
    ctx.stroke();
  }

  drawEffects(ctx, fx);
  ctx.restore();
}
