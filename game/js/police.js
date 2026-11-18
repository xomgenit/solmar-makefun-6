// police.js — the wanted system (0-5 stars). Foot cops chase on foot,
// cruisers pursue by road. Heat cools when the player is unseen: cops search
// the last seen position and give up past 1300px; new units only spawn while
// the player is seen (except 3s after fresh heat).
import { dist, clamp, angleDiff } from './util.js';
import { WORLD, nearestRoadPoint, collideCircle } from './city.js';
import { spawnEnemy, shoot } from './combat.js';
import { createCar, driveCar, MODELS } from './vehicles.js';

const SEE_FOOT = 780;
const SEE_CAR = 880;
const GIVE_UP = 1300;
const CRUISER_DESPAWN = 1900;

export function createPolice(game) {
  const pol = {
    freshUntil: 0,
    lastSeen: { x: 0, y: 0 },
    lastSeenAt: -999,
    coolTimer: 0,
    spawnCd: 0,
  };

  function footCops() { return game.enemies.filter((e) => e.type === 'cop'); }
  function cruisers() { return game.cars.filter((c) => c.role === 'cruiser'); }

  function isSeen() {
    if (game.time < pol.freshUntil) return true;
    const px = game.player.x, py = game.player.y;
    for (const c of footCops()) if (dist(c.x, c.y, px, py) < SEE_FOOT) return true;
    for (const c of cruisers()) if (dist(c.x, c.y, px, py) < SEE_CAR) return true;
    return false;
  }

  function addWanted(n) {
    if (game.state !== 'playing') return;
    const before = game.wanted;
    game.wanted = clamp(game.wanted + n, 0, 5);
    if (game.wanted > before) {
      pol.freshUntil = game.time + 3;
      pol.lastSeen = { x: game.player.x, y: game.player.y };
      pol.lastSeenAt = game.time;
      pol.coolTimer = 0;
      game.audio.sfx.blip();
    }
  }

  function clearWanted() {
    game.wanted = 0;
    for (const c of footCops()) {
      const i = game.enemies.indexOf(c);
      if (i !== -1) game.enemies.splice(i, 1);
    }
    game.cars = game.cars.filter((c) => c.role !== 'cruiser');
  }

  // Absolute set (debug hooks / tests): simulates fresh heat so a response spawns.
  function setWanted(n) {
    game.wanted = clamp(n, 0, 5);
    if (game.wanted > 0) {
      pol.freshUntil = game.time + 3;
      pol.lastSeen = { x: game.player.x, y: game.player.y };
      pol.lastSeenAt = game.time;
      pol.coolTimer = 0;
    } else {
      clearWanted();
    }
  }

  function spawnFootCop() {
    const px = game.player.x, py = game.player.y;
    const a = Math.random() * Math.PI * 2;
    const r = 320 + Math.random() * 220;
    const x = clamp(px + Math.cos(a) * r, 40, WORLD - 40);
    const y = clamp(py + Math.sin(a) * r, 40, WORLD - 40);
    const p = nearestRoadPoint(game.city, x, y);
    spawnEnemy(game, p.x, p.y, 'cop');
  }

  function spawnCruiser() {
    const px = game.player.x, py = game.player.y;
    const a = Math.random() * Math.PI * 2;
    const r = 420 + Math.random() * 260;
    const p = nearestRoadPoint(game.city,
      clamp(px + Math.cos(a) * r, 60, WORLD - 60),
      clamp(py + Math.sin(a) * r, 60, WORLD - 60));
    const car = createCar(p.x, p.y, Math.atan2(py - p.y, px - p.x), 'cruiser', 'cruiser');
    car.ai = { stuckT: 0, reverseT: 0 };
    game.cars.push(car);
  }

  function update(dt) {
    pol.spawnCd -= dt;
    const px = game.player.x, py = game.player.y;
    const driving = !!game.player.car;

    if (game.wanted > 0) {
      const seen = isSeen();
      if (seen) {
        pol.lastSeen = { x: px, y: py };
        pol.lastSeenAt = game.time;
        pol.coolTimer = 0;
      } else if (game.time - pol.lastSeenAt > 8) {
        // Unseen for 8s: cool one star every 4s.
        pol.coolTimer += dt;
        if (pol.coolTimer >= 4) {
          pol.coolTimer = 0;
          game.wanted = Math.max(0, game.wanted - 1);
          if (game.wanted === 0) clearWanted();
        }
      }

      // Spawn the response: only while seen, or during the 3s fresh-heat window.
      if ((seen || game.time < pol.freshUntil) && pol.spawnCd <= 0 && game.wanted > 0) {
        pol.spawnCd = 0.8;
        const want = Math.min(game.wanted, 3);
        if (driving) {
          if (cruisers().length < want) spawnCruiser();
        } else if (footCops().length < want) {
          spawnFootCop();
        }
      }
    }

    // --- Foot cop AI ---
    for (const cop of [...footCops()]) {
      const dPlayer = dist(cop.x, cop.y, px, py);
      const seen = dPlayer < SEE_FOOT || game.time < pol.freshUntil;
      // Despawn when far away and unseen.
      if (dPlayer > GIVE_UP && !seen) {
        const i = game.enemies.indexOf(cop);
        if (i !== -1) game.enemies.splice(i, 1);
        continue;
      }
      const tx = seen ? px : pol.lastSeen.x;
      const ty = seen ? py : pol.lastSeen.y;
      const dTarget = dist(cop.x, cop.y, tx, ty);
      if (dTarget > 26) {
        cop.angle = Math.atan2(ty - cop.y, tx - cop.x);
        const nx = cop.x + Math.cos(cop.angle) * cop.speed * dt;
        const ny = cop.y + Math.sin(cop.angle) * cop.speed * dt;
        const col = collideCircle(game.city, nx, ny, 12);
        // Slide along walls: if blocked, try the perpendicular.
        if (col.hit) {
          const alt = cop.angle + Math.PI / 2;
          const ax = cop.x + Math.cos(alt) * cop.speed * dt * 0.7;
          const ay = cop.y + Math.sin(alt) * cop.speed * dt * 0.7;
          const col2 = collideCircle(game.city, ax, ay, 12);
          cop.x = col2.x; cop.y = col2.y;
        } else { cop.x = col.x; cop.y = col.y; }
      }
      // Shoot when close and the player is on foot and seen.
      cop.shootCd -= dt;
      if (seen && !driving && dPlayer < 300 && dPlayer > 30 && cop.shootCd <= 0) {
        cop.shootCd = 0.9 + Math.random() * 0.6;
        shoot(game, cop.x, cop.y, Math.atan2(py - cop.y, px - cop.x) + (Math.random() - 0.5) * 0.22,
          { fromPlayer: false, damage: 30, shooter: cop });
      }
      // Bust: standing next to the player on foot.
      if (!driving && dPlayer < 42) {
        cop.bustTimer += dt;
        if (cop.bustTimer > 1.1) { game.onBusted(); return; }
      } else {
        cop.bustTimer = 0;
      }
    }

    // --- Cruiser AI ---
    for (const car of [...cruisers()]) {
      const dPlayer = dist(car.x, car.y, px, py);
      if (dPlayer > CRUISER_DESPAWN || game.wanted === 0) {
        const i = game.cars.indexOf(car);
        if (i !== -1) game.cars.splice(i, 1);
        continue;
      }
      if (car.wrecked) { car.vx *= 0.9; car.vy *= 0.9; car.x += car.vx * dt; car.y += car.vy * dt; continue; }
      const ai = car.ai || (car.ai = { stuckT: 0, reverseT: 0 });
      const seen = dPlayer < SEE_CAR || game.time < pol.freshUntil;
      const tx = seen ? px : pol.lastSeen.x;
      const ty = seen ? py : pol.lastSeen.y;
      const wantAngle = Math.atan2(ty - car.y, tx - car.x);
      const steer = clamp(angleDiff(car.angle, wantAngle) * 2.4, -1, 1);

      // Stuck recovery: barely moving for 2s -> reverse for 1s.
      if (Math.abs(car.speed) < 25 && dPlayer > 60) ai.stuckT += dt;
      else ai.stuckT = 0;
      if (ai.stuckT > 2) { ai.reverseT = 1; ai.stuckT = 0; }

      if (ai.reverseT > 0) {
        ai.reverseT -= dt;
        driveCar(game, car, { throttle: -1, steer: -steer, handbrake: false }, dt);
      } else {
        driveCar(game, car, { throttle: 1, steer, handbrake: false }, dt);
      }

      // Ramming: shove the player's car on contact.
      const pc = game.player.car;
      if (pc && dPlayer < 62) {
        const ux = (pc.x - car.x) / Math.max(1, dPlayer);
        const uy = (pc.y - car.y) / Math.max(1, dPlayer);
        pc.vx += ux * 90 * dt * 8;
        pc.vy += uy * 90 * dt * 8;
      }
      // Siren audio flag for main.js.
      game.sirenActive = true;
    }
    if (cruisers().length === 0) game.sirenActive = false;
  }

  return { addWanted, clearWanted, setWanted, update, isSeen };
}
