// people.js — pedestrians: walk sidewalks, flee gunfire and speeding cars,
// get knocked down (only player-caused knockdowns raise wanted).
import { clamp, dist, angleDiff } from './util.js';
import { WORLD, V_ROADS, H_ROADS, ROAD_W, collideCircle, onRoad } from './city.js';

const SHIRTS = ['#e74c3c', '#3498db', '#f1c40f', '#2ecc71', '#e67e22', '#9b59b6', '#1abc9c', '#ecf0f1'];

export function createPed(x, y) {
  return {
    x, y,
    angle: Math.random() * Math.PI * 2,
    speed: 55 + Math.random() * 40,
    state: 'walk', // 'walk' | 'flee' | 'down'
    stateT: 0,
    shirt: SHIRTS[Math.floor(Math.random() * SHIRTS.length)],
    heatCd: 0, // cooldown before this ped can raise wanted again
    wanderT: 1 + Math.random() * 3,
  };
}

export function scarePeds(game, x, y, radius) {
  for (const p of game.peds) {
    if (p.state === 'down') continue;
    if (dist(p.x, p.y, x, y) < radius) {
      p.state = 'flee';
      p.stateT = 2.5 + Math.random() * 2;
      p.angle = Math.atan2(p.y - y, p.x - x) + (Math.random() - 0.5) * 0.6;
    }
  }
}

export function knockDownPed(game, ped, byPlayer) {
  if (ped.state === 'down') return;
  ped.state = 'down';
  ped.stateT = 4 + Math.random() * 2;
  game.effects.burst(ped.x, ped.y, '#cc2222', 8);
  if (byPlayer && ped.heatCd <= 0) {
    ped.heatCd = 6;
    game.police.addWanted(1);
    game.hud.banner('PEDESTRIAN DOWN', 'Witnesses called the SBPD', '#e74c3c');
  }
}

export function updatePeds(game, dt) {
  const px = game.player.x, py = game.player.y;
  for (const p of game.peds) {
    p.heatCd = Math.max(0, p.heatCd - dt);
    if (p.state === 'down') {
      p.stateT -= dt;
      if (p.stateT <= 0) { p.state = 'walk'; p.stateT = 0; }
      continue;
    }
    if (p.state === 'flee') {
      p.stateT -= dt;
      if (p.stateT <= 0) p.state = 'walk';
    } else {
      // Wander: pick a new heading now and then; prefer staying near roads.
      p.wanderT -= dt;
      if (p.wanderT <= 0) {
        p.wanderT = 1.5 + Math.random() * 3;
        p.angle += (Math.random() - 0.5) * 1.6;
      }
    }
    const speed = p.state === 'flee' ? 300 : p.speed;
    const nx = p.x + Math.cos(p.angle) * speed * dt;
    const ny = p.y + Math.sin(p.angle) * speed * dt;
    const col = collideCircle(game.city, nx, ny, 10);
    if (col.hit) p.angle += Math.PI / 2 + (Math.random() - 0.5);
    p.x = clamp(col.x, 20, WORLD - 20);
    p.y = clamp(col.y, 20, WORLD - 20);

    // Run over by a fast car?
    for (const car of game.cars) {
      if (Math.abs(car.speed) < 150) continue;
      if (dist(p.x, p.y, car.x, car.y) < 26) {
        const byPlayer = game.player.car === car;
        knockDownPed(game, p, byPlayer);
        if (byPlayer) game.audio.sfx.crash();
        break;
      }
    }
    // Flee from a speeding car heading at them.
    if (p.state === 'walk') {
      for (const car of game.cars) {
        if (Math.abs(car.speed) < 300) continue;
        if (dist(p.x, p.y, car.x, car.y) < 120) {
          p.state = 'flee';
          p.stateT = 2;
          p.angle = Math.atan2(p.y - car.y, p.x - car.x);
          break;
        }
      }
    }
  }

  // Keep ~22 peds near the player; recycle distant ones.
  let count = 0;
  for (const p of game.peds) {
    if (dist(p.x, p.y, px, py) < 1400) count++;
    else {
      const a = Math.random() * Math.PI * 2;
      const r = 500 + Math.random() * 600;
      p.x = clamp(px + Math.cos(a) * r, 40, WORLD - 40);
      p.y = clamp(py + Math.sin(a) * r, 40, WORLD - 40);
      p.state = 'walk';
    }
  }
  while (game.peds.length < 22) {
    const a = Math.random() * Math.PI * 2;
    const r = 300 + Math.random() * 700;
    game.peds.push(createPed(
      clamp(px + Math.cos(a) * r, 40, WORLD - 40),
      clamp(py + Math.sin(a) * r, 40, WORLD - 40)));
  }
}

export function drawPed(ctx, p) {
  ctx.save();
  ctx.translate(p.x, p.y);
  if (p.state === 'down') {
    ctx.rotate(p.angle);
    ctx.fillStyle = p.shirt;
    ctx.beginPath();
    ctx.ellipse(0, 0, 12, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8b88a';
    ctx.beginPath();
    ctx.arc(13, 0, 4, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.rotate(p.angle);
    // Body + head (top-down).
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(1, 2, 8, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = p.shirt;
    ctx.beginPath();
    ctx.ellipse(0, 0, 8, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8b88a';
    ctx.beginPath();
    ctx.arc(4, 0, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
