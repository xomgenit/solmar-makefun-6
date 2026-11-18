// combat.js — hitscan shooting + generic enemies (cops and Harbor Kings).
import { dist, clamp, pointInRect } from './util.js';
import { knockDownPed } from './people.js';
import { damageCar } from './vehicles.js';

export function spawnEnemy(game, x, y, type) {
  const e = {
    x, y, type, // 'cop' | 'king'
    hp: 100, angle: 0,
    shootCd: 0.5 + Math.random() * 0.8,
    bustTimer: 0, speed: type === 'cop' ? 235 : 0,
    stuckT: 0, lastX: x, lastY: y,
    killedByPlayer: false,
  };
  game.enemies.push(e);
  return e;
}

// Hitscan ray. `fromPlayer` decides whether collateral damage raises wanted.
export function shoot(game, x, y, angle, { fromPlayer = false, damage = 34, range = 720, shooter = null } = {}) {
  const dx = Math.cos(angle), dy = Math.sin(angle);
  let hitX = x + dx * range, hitY = y + dy * range;
  let hitKind = null, hitObj = null;
  const step = 14;
  const steps = Math.ceil(range / step);
  for (let i = 1; i <= steps; i++) {
    const px = x + dx * step * i, py = y + dy * step * i;
    // Buildings stop bullets.
    let blocked = false;
    for (const b of game.city.buildings) {
      if (pointInRect(px, py, b)) { blocked = true; break; }
    }
    if (blocked) { hitX = px; hitY = py; hitKind = 'wall'; break; }
    // Enemies (player shots only hit enemies; enemy shots only hit the player).
    if (fromPlayer) {
      for (const e of game.enemies) {
        if (e === shooter) continue;
        if (dist(px, py, e.x, e.y) < 16) { hitX = px; hitY = py; hitKind = 'enemy'; hitObj = e; break; }
      }
      if (hitKind) break;
      for (const p of game.peds) {
        if (p.state === 'down') continue;
        if (dist(px, py, p.x, p.y) < 12) { hitX = px; hitY = py; hitKind = 'ped'; hitObj = p; break; }
      }
      if (hitKind) break;
      for (const car of game.cars) {
        if (car === game.player.car) continue;
        if (dist(px, py, car.x, car.y) < 24) { hitX = px; hitY = py; hitKind = 'car'; hitObj = car; break; }
      }
      if (hitKind) break;
    } else {
      const pl = game.player;
      const inCar = !!pl.car;
      const tx = inCar ? pl.car.x : pl.x, ty = inCar ? pl.car.y : pl.y;
      const rr = inCar ? 24 : 14;
      if (dist(px, py, tx, ty) < rr) {
        hitX = px; hitY = py;
        hitKind = inCar ? 'playercar' : 'player';
        hitObj = inCar ? pl.car : pl;
        break;
      }
      // Cop bullets can hit peds — but that must NOT raise the player's wanted.
      for (const p of game.peds) {
        if (p.state === 'down') continue;
        if (dist(px, py, p.x, p.y) < 12) { hitX = px; hitY = py; hitKind = 'ped'; hitObj = p; break; }
      }
      if (hitKind) break;
    }
  }

  game.effects.tracer(x, y, hitX, hitY);
  game.effects.muzzle(x + dx * 18, y + dy * 18);
  game.audio.sfx.shoot();

  if (hitKind === 'enemy' && hitObj) {
    hitObj.hp -= damage;
    hitObj.killedByPlayer = fromPlayer;
    game.effects.blood(hitX, hitY, 6);
    if (hitObj.hp <= 0) killEnemy(game, hitObj);
  } else if (hitKind === 'ped' && hitObj) {
    knockDownPed(game, hitObj, fromPlayer);
  } else if (hitKind === 'car' && hitObj) {
    damageCar(game, hitObj, damage * 0.5);
    game.effects.sparks(hitX, hitY, 5);
  } else if (hitKind === 'player') {
    hurtPlayer(game, damage * 0.25);
  } else if (hitKind === 'playercar' && hitObj) {
    damageCar(game, hitObj, damage * 0.35);
    game.effects.sparks(hitX, hitY, 5);
  } else if (hitKind === 'wall') {
    game.effects.sparks(hitX, hitY, 3);
  }
  return { hitKind, hitX, hitY };
}

export function hurtPlayer(game, amount) {
  const p = game.player;
  if (game.state !== 'playing') return;
  p.hp = Math.max(0, p.hp - amount);
  p.lastHurt = game.time;
  game.effects.addShake(3);
  if (p.hp <= 0) game.onWasted();
}

export function killEnemy(game, e) {
  const i = game.enemies.indexOf(e);
  if (i !== -1) game.enemies.splice(i, 1);
  game.effects.burst(e.x, e.y, '#cc2222', 14);
  game.effects.blood(e.x, e.y, 10);
  if (e.type === 'cop') {
    if (e.killedByPlayer) game.police.addWanted(1);
  } else if (e.type === 'king') {
    game.stats.kingsDown = (game.stats.kingsDown || 0) + 1;
    game.missions.onEnemyDown(e);
  }
}

// Kings hold ground and shoot the player within 380px. Cop movement lives in
// police.js; this only runs king AI + generic bookkeeping.
export function updateEnemies(game, dt) {
  const pl = game.player;
  for (const e of game.enemies) {
    if (e.type !== 'king') continue;
    e.shootCd -= dt;
    const d = dist(e.x, e.y, pl.x, pl.y);
    if (d < 380 && game.state === 'playing') {
      e.angle = Math.atan2(pl.y - e.y, pl.x - e.x);
      if (e.shootCd <= 0) {
        e.shootCd = 0.9 + Math.random() * 0.7;
        shoot(game, e.x, e.y, e.angle + (Math.random() - 0.5) * 0.18,
          { fromPlayer: false, damage: 30, shooter: e });
      }
    }
  }
}

export function drawEnemy(ctx, e, time) {
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.rotate(e.angle);
  const isCop = e.type === 'cop';
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(1, 2, 9, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = isCop ? '#1a3a5a' : '#8a1a1a';
  ctx.beginPath();
  ctx.ellipse(0, 0, 9, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e8b88a';
  ctx.beginPath();
  ctx.arc(4, 0, 4, 0, Math.PI * 2);
  ctx.fill();
  // Gun.
  ctx.fillStyle = '#222';
  ctx.fillRect(8, -1, 9, 2);
  ctx.restore();
  // Health bar.
  if (e.hp < 100) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(e.x - 14, e.y - 22, 28, 5);
    ctx.fillStyle = isCop ? '#4a90d8' : '#e74c3c';
    ctx.fillRect(e.x - 13, e.y - 21, 26 * clamp(e.hp / 100, 0, 1), 3);
  }
}
