// vehicles.js — car models, arcade driving physics, traffic, parked cars.
import { clamp, angleDiff, dist } from './util.js';
import { WORLD, V_ROADS, H_ROADS, ROAD_W, collideCircle, onRoad } from './city.js';

export const MODELS = {
  sedan:   { len: 46, w: 22, accel: 430, maxSpeed: 540, turn: 2.7, colors: ['#c0392b', '#2980b9', '#bdc3c7', '#2c3e50'] },
  sports:  { len: 48, w: 22, accel: 580, maxSpeed: 740, turn: 3.1, colors: ['#e74c3c', '#f1c40f', '#111111'] },
  taxi:    { len: 46, w: 22, accel: 420, maxSpeed: 520, turn: 2.7, colors: ['#f39c12'] },
  van:     { len: 54, w: 24, accel: 330, maxSpeed: 420, turn: 2.2, colors: ['#ecf0f1', '#7f8c8d'] },
  pickup:  { len: 50, w: 23, accel: 400, maxSpeed: 500, turn: 2.5, colors: ['#27ae60', '#8e44ad'] },
  cruiser: { len: 48, w: 22, accel: 540, maxSpeed: 700, turn: 3.0, colors: ['#1a2530'] },
};

let nextCarId = 1;

export function createCar(x, y, angle, model, role, color) {
  const m = MODELS[model] || MODELS.sedan;
  return {
    id: nextCarId++,
    x, y, angle, vx: 0, vy: 0, speed: 0,
    model, role, // 'player' | 'traffic' | 'parked' | 'cruiser'
    color: color || m.colors[Math.floor(Math.random() * m.colors.length)],
    hp: 100, wrecked: false, damageCd: 0,
    traffic: null, ai: null,
  };
}

// Arcade velocity-vector driving. `input`: {throttle -1..1, steer -1..1, handbrake}
export function driveCar(game, car, input, dt) {
  const m = MODELS[car.model];
  const fx = Math.cos(car.angle), fy = Math.sin(car.angle);
  // Forward speed along the heading.
  let fwd = car.vx * fx + car.vy * fy;
  let lat = -car.vx * fy + car.vy * fx;

  fwd += input.throttle * m.accel * dt;
  // Drag + rolling resistance.
  fwd -= fwd * 0.55 * dt;
  if (input.throttle === 0) fwd -= fwd * 0.6 * dt;
  if (input.handbrake) fwd -= fwd * 1.6 * dt;
  fwd = clamp(fwd, -200, m.maxSpeed);

  // Steering scales with speed; reversed when backing up.
  const steerAuthority = clamp(Math.abs(fwd) / 160, 0, 1);
  car.angle += input.steer * m.turn * steerAuthority * dt * (fwd < 0 ? -1 : 1);

  // Lateral grip: handbrake loosens it -> drift.
  const gripK = input.handbrake ? 1.4 : 9;
  lat *= Math.exp(-gripK * dt);

  const nfx = Math.cos(car.angle), nfy = Math.sin(car.angle);
  car.vx = nfx * fwd - nfy * lat;
  car.vy = nfy * fwd + nfx * lat;
  car.speed = fwd;

  const nx = car.x + car.vx * dt;
  const ny = car.y + car.vy * dt;
  const col = collideCircle(game.city, nx, ny, 20);
  if (col.hit && Math.abs(fwd) > 120) {
    damageCar(game, car, Math.min(22, Math.abs(fwd) * 0.03));
    car.vx *= -0.25; car.vy *= -0.25;
    car.speed *= -0.25;
    game.effects.sparks(car.x, car.y, 8);
    game.audio.sfx.crash();
  }
  car.x = col.x; car.y = col.y;

  // Skid marks while drifting or handbraking hard.
  if ((Math.abs(lat) > 130 || (input.handbrake && Math.abs(fwd) > 220)) && Math.abs(fwd) > 150) {
    game.effects.skid(car.x - nfx * 16, car.y - nfy * 16, car.angle);
    if (Math.random() < 0.4) game.effects.smoke(car.x - nfx * 18, car.y - nfy * 18, 1);
  }
  car.damageCd = Math.max(0, car.damageCd - dt);
}

export function damageCar(game, car, amount) {
  if (car.damageCd > 0 || car.wrecked) return;
  car.damageCd = 0.35;
  car.hp -= amount;
  if (car.hp <= 0) {
    car.hp = 0;
    car.wrecked = true;
    game.effects.burst(car.x, car.y, '#ff8800', 18);
    game.effects.smoke(car.x, car.y, 6);
  }
}

// Circle-pair collision between all cars (cheap O(n^2), n is small).
export function collideCars(game) {
  const cars = game.cars;
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const min = 40;
      if (d >= min || d < 0.01) continue;
      const ux = dx / d, uy = dy / d;
      // Parked cars have the handbrake on: they don't get shoved.
      const aParked = a.role === 'parked';
      const bParked = b.role === 'parked';
      if (aParked && !bParked) {
        b.x += ux * (min - d); b.y += uy * (min - d);
      } else if (bParked && !aParked) {
        a.x -= ux * (min - d); a.y -= uy * (min - d);
      } else {
        const push = (min - d) / 2;
        a.x -= ux * push; a.y -= uy * push;
        b.x += ux * push; b.y += uy * push;
      }
      const rel = Math.abs((a.vx - b.vx) * ux + (a.vy - b.vy) * uy);
      const imp = rel * 0.5;
      a.vx -= ux * imp; a.vy -= uy * imp;
      b.vx += ux * imp; b.vy += uy * imp;
      if (rel > 160) {
        damageCar(game, a, rel * 0.03);
        damageCar(game, b, rel * 0.03);
        game.effects.sparks((a.x + b.x) / 2, (a.y + b.y) / 2, 6);
        game.audio.sfx.crash();
      }
    }
  }
}

// --- Traffic (kinematic lane followers) -------------------------------------

function laneOffset(axis, dir) {
  // Right-hand traffic: offset +30 to the right of travel direction.
  if (axis === 'v') return dir > 0 ? 30 : -30; // moving south -> east lane
  return dir > 0 ? 30 : -30;                   // moving east -> south lane
}

export function spawnTrafficCar(game, nearX, nearY) {
  const axis = Math.random() < 0.5 ? 'v' : 'h';
  const roads = axis === 'v' ? V_ROADS : H_ROADS;
  const road = roads[Math.floor(Math.random() * roads.length)];
  const dir = Math.random() < 0.5 ? 1 : -1;
  const off = laneOffset(axis, dir);
  let x, y;
  if (nearX !== undefined) {
    // Spawn on a road 600-1100px from the reference point.
    const a = Math.random() * Math.PI * 2;
    const r = 600 + Math.random() * 500;
    const tx = clamp(nearX + Math.cos(a) * r, 120, WORLD - 120);
    const ty = clamp(nearY + Math.sin(a) * r, 120, WORLD - 120);
    if (axis === 'v') { x = road + off; y = ty; } else { x = tx; y = road + off; }
  } else {
    if (axis === 'v') { x = road + off; y = 100 + Math.random() * (WORLD - 200); }
    else { x = 100 + Math.random() * (WORLD - 200); y = road + off; }
  }
  const models = ['sedan', 'sedan', 'taxi', 'van', 'pickup'];
  const car = createCar(x, y, axis === 'v' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI),
    models[Math.floor(Math.random() * models.length)], 'traffic');
  car.traffic = { axis, road, dir, speed: 170 + Math.random() * 90, turnCd: 1 + Math.random() * 2 };
  return car;
}

export function spawnParkedCar(game, x, y, angle, model, color) {
  const car = createCar(x, y, angle, model || 'sedan', 'parked', color);
  return car;
}

function trafficTargetAngle(t) {
  if (t.axis === 'v') return t.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  return t.dir > 0 ? 0 : Math.PI;
}

export function updateTraffic(game, dt) {
  const px = game.player.x, py = game.player.y;
  for (const car of game.cars) {
    if (car.role !== 'traffic' || !car.traffic) continue;
    const t = car.traffic;
    if (car.wrecked) { car.vx = 0; car.vy = 0; continue; }

    // Recycle far cars near the player.
    if (dist(car.x, car.y, px, py) > 1500) {
      const fresh = spawnTrafficCar(game, px, py);
      Object.assign(car, fresh, { id: car.id, hp: 100, wrecked: false });
      continue;
    }

    // Obstacle ahead? Stop.
    const ahead = 78;
    const ax = car.x + Math.cos(car.angle) * ahead;
    const ay = car.y + Math.sin(car.angle) * ahead;
    let blocked = false;
    for (const o of game.cars) {
      if (o === car) continue;
      if (dist(ax, ay, o.x, o.y) < 34) { blocked = true; break; }
    }
    if (!blocked && dist(ax, ay, px, py) < 30 && !game.player.car) blocked = true;

    const speed = blocked ? 0 : t.speed;
    const targetAngle = trafficTargetAngle(t);
    car.angle += angleDiff(car.angle, targetAngle) * Math.min(1, dt * 6);
    car.vx = Math.cos(car.angle) * speed;
    car.vy = Math.sin(car.angle) * speed;
    car.speed = speed;
    car.x += car.vx * dt;
    car.y += car.vy * dt;

    // Snap back onto the lane (prevents drift off-road).
    const off = laneOffset(t.axis, t.dir);
    if (t.axis === 'v') car.x += (t.road + off - car.x) * Math.min(1, dt * 3);
    else car.y += (t.road + off - car.y) * Math.min(1, dt * 3);

    // Turn at intersections.
    t.turnCd -= dt;
    if (t.turnCd <= 0) {
      const cross = t.axis === 'v' ? H_ROADS : V_ROADS;
      const along = t.axis === 'v' ? car.y : car.x;
      for (const c of cross) {
        if (Math.abs(along - c) < 46) {
          if (Math.random() < 0.4) {
            const nAxis = t.axis === 'v' ? 'h' : 'v';
            const nDir = Math.random() < 0.5 ? 1 : -1;
            const nOff = laneOffset(nAxis, nDir);
            if (nAxis === 'v') { t.road = c; car.x = c + nOff; car.y = Math.round(car.y / 10) * 10; }
            else { t.road = c; car.y = c + nOff; car.x = Math.round(car.x / 10) * 10; }
            t.axis = nAxis; t.dir = nDir;
          }
          t.turnCd = 2 + Math.random() * 3;
          break;
        }
      }
      if (t.turnCd <= 0) t.turnCd = 0.5;
    }

    // Wrap around the world edge instead of driving off it.
    if (car.x < 60 || car.x > WORLD - 60 || car.y < 60 || car.y > WORLD - 60) {
      t.dir *= -1;
    }
  }
}

// --- Drawing -----------------------------------------------------------------

export function drawCar(ctx, car, time) {
  const m = MODELS[car.model];
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  const L = m.len, W = m.w;
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.roundRect(-L / 2 + 2, -W / 2 + 3, L, W, 7);
  ctx.fill();
  // Body.
  ctx.fillStyle = car.wrecked ? '#2a2a2a' : car.color;
  ctx.beginPath();
  ctx.roundRect(-L / 2, -W / 2, L, W, 7);
  ctx.fill();
  if (car.model === 'cruiser') {
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(-L / 2 + 6, -W / 2, 14, W);
    ctx.fillRect(L / 2 - 20, -W / 2, 14, W);
    // Flashing light bar.
    const phase = Math.floor(time * 6) % 2 === 0;
    ctx.fillStyle = phase ? '#ff2222' : '#2266ff';
    ctx.fillRect(-6, -W / 2 - 1, 12, 5);
    ctx.fillStyle = phase ? '#2266ff' : '#ff2222';
    ctx.fillRect(-6, W / 2 - 4, 12, 5);
  }
  if (car.model === 'taxi') {
    ctx.fillStyle = '#111';
    ctx.fillRect(-4, -3, 8, 6);
  }
  // Windshield + rear window.
  ctx.fillStyle = 'rgba(20,40,60,0.85)';
  ctx.fillRect(L / 2 - 16, -W / 2 + 4, 7, W - 8);
  ctx.fillRect(-L / 2 + 9, -W / 2 + 4, 7, W - 8);
  // Roof.
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(-6, -W / 2 + 4, 16, W - 8);
  // Headlights.
  ctx.fillStyle = '#fff8c0';
  ctx.fillRect(L / 2 - 2, -W / 2 + 2, 2, 5);
  ctx.fillRect(L / 2 - 2, W / 2 - 7, 2, 5);
  // Smoke when badly damaged.
  if (car.hp < 35 && !car.wrecked && Math.random() < 0.06) {
    ctx.fillStyle = 'rgba(120,120,120,0.5)';
    ctx.beginPath();
    ctx.arc(L / 2 - 6, 0, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
