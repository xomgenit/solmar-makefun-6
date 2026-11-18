// main.js — orchestration: states, player control, camera, menus, save wiring,
// debug hooks. Single `game` object, reset in place — window.__solmar.game
// never goes stale across NEW GAME / CONTINUE.
import { clamp, dist } from './util.js';
import { buildCity, WORLD, zoneAt, collideCircle, nearestRoadPoint } from './city.js';
import { createCar, driveCar, collideCars, updateTraffic, spawnTrafficCar, spawnParkedCar } from './vehicles.js';
import { createPed, updatePeds, scarePeds } from './people.js';
import { shoot, updateEnemies, hurtPlayer, hasLineOfSight } from './combat.js';
import { createPolice } from './police.js';
import { createMissions } from './missions.js';
import { createHud } from './hud.js';
import { hasSave, saveGame, loadSave } from './save.js';
import { createInput } from './input.js';
import * as audioMod from './audio.js';
import * as effectsMod from './effects.js';
import { drawWorld } from './render.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let vw = window.innerWidth, vh = window.innerHeight;

function resize() {
  vw = window.innerWidth; vh = window.innerHeight;
  canvas.width = vw; canvas.height = vh;
}
window.addEventListener('resize', resize);
resize();

const params = new URLSearchParams(location.search);
const urlSeed = params.get('seed') ? parseInt(params.get('seed'), 10) : null;
const autostart = params.get('autostart') === '1';

// --- The single game object --------------------------------------------------
const game = {
  state: 'title', // 'title' | 'playing' | 'paused' | 'wasted' | 'busted'
  seed: urlSeed || 7,
  city: null,
  player: null,
  cars: [], peds: [], enemies: [],
  wanted: 0, cash: 0, time: 0,
  cam: { x: 0, y: 0 },
  objective: null, zoneName: '',
  stats: {},
  sirenActive: false,
  shotHeatCd: 0,
};

game.input = createInput(canvas);
game.hud = createHud();
game.audio = audioMod;

const fx = effectsMod.createEffects();
fx.burst = (x, y, c, n) => effectsMod.burst(fx, x, y, c, n);
fx.sparks = (x, y, n) => effectsMod.sparks(fx, x, y, n);
fx.smoke = (x, y, n) => effectsMod.smoke(fx, x, y, n);
fx.blood = (x, y, n) => effectsMod.blood(fx, x, y, n);
fx.tracer = (x1, y1, x2, y2) => effectsMod.tracer(fx, x1, y1, x2, y2);
fx.floater = (x, y, t, c) => effectsMod.floater(fx, x, y, t, c);
fx.skid = (x, y, a) => effectsMod.skid(fx, x, y, a);
fx.muzzle = (x, y) => effectsMod.muzzle(fx, x, y);
fx.addShake = (a) => effectsMod.addShake(fx, a);
game.effects = fx;

game.police = createPolice(game);
game.missions = createMissions(game);

game.saveNow = () => saveGame(game);
game.onWasted = () => {
  if (game.state !== 'playing') return;
  game.state = 'wasted';
  const fine = Math.min(100, game.cash);
  game.cash -= fine;
  document.getElementById('wasted-fine').textContent = `Hospital bill: $${fine}`;
  show('wasted-screen');
  game.hud.showHud(false);
  audioMod.sfx.wasted();
  audioMod.stopAllLoops();
  game.saveNow();
};
game.onBusted = () => {
  if (game.state !== 'playing') return;
  game.state = 'busted';
  const fine = Math.min(150, game.cash);
  game.cash -= fine;
  document.getElementById('busted-fine').textContent = `Bail: $${fine}`;
  show('busted-screen');
  game.hud.showHud(false);
  audioMod.sfx.wasted();
  audioMod.stopAllLoops();
  game.saveNow();
};

// --- Setup / reset (in place) -------------------------------------------------
function resetGame(seed) {
  game.seed = seed;
  game.city = buildCity(seed);
  game.cars = [];
  game.peds = [];
  game.enemies = [];
  game.wanted = 0;
  game.cash = 0;
  game.time = 0;
  game.stats = { earned: 0, missionsDone: 0, kingsDown: 0, completedMissions: [] };
  game.objective = null;
  game.shotHeatCd = 0;
  game.missions.reset(); // clear stashes / unlock / pier bonus for a fresh run
  fx.particles = []; fx.tracers = []; fx.floaters = []; fx.skids = []; fx.shake = 0;

  const hideout = game.city.landmarkById.hideout;
  game.player = {
    x: hideout.cx, y: hideout.cy + 130,
    angle: -Math.PI / 2, hp: 100, car: null,
    aim: 0, lastHurt: -999, fireCd: 0, speed: 0,
  };

  // The red sports car: parked in the eastbound lane by the hideout.
  game.cars.push(spawnParkedCar(game, 560, 330, 0, 'sports', '#e74c3c'));
  // More parked cars along the roads.
  const spots = [
    [930, 630, Math.PI / 2, 'sedan'], [1530, 330, 0, 'taxi'], [2130, 930, Math.PI / 2, 'van'],
    [330, 1530, 0, 'pickup'], [2730, 1530, Math.PI / 2, 'sedan'], [930, 2730, 0, 'sedan'],
    [1830, 2130, Math.PI / 2, 'taxi'], [3330 - 330, 2130, 0, 'pickup'], [630, 3330, 0, 'van'],
    [2430, 2730, Math.PI / 2, 'sedan'],
  ];
  for (const [x, y, a, m] of spots) game.cars.push(spawnParkedCar(game, x, y, a, m));
  // Traffic.
  for (let i = 0; i < 12; i++) game.cars.push(spawnTrafficCar(game));
  // Pedestrians near the player.
  for (let i = 0; i < 22; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 200 + Math.random() * 800;
    game.peds.push(createPed(
      clamp(game.player.x + Math.cos(a) * r, 40, WORLD - 40),
      clamp(game.player.y + Math.sin(a) * r, 40, WORLD - 40)));
  }
  game.cam.x = clamp(game.player.x - vw / 2, 0, Math.max(0, WORLD - vw));
  game.cam.y = clamp(game.player.y - vh / 2, 0, Math.max(0, WORLD - vh));
}

function startNewGame() {
  const seed = urlSeed !== null && !Number.isNaN(urlSeed) ? urlSeed : Math.floor(Math.random() * 100000);
  resetGame(seed);
  game.cash = 200; // Dice starts with $200 in his pocket
  enterPlaying();
  game.missions.start('first-wheels');
  game.hud.banner('SOLMAR BAY', "Danny 'Dice' Marlow is back in town", '#f1c40f');
}

function startContinue() {
  const data = loadSave();
  if (!data) return false;
  resetGame(data.seed);
  game.cash = data.cash || 0;
  game.player.hp = data.hp || 100;
  game.player.x = data.x;
  game.player.y = data.y;
  game.stats = data.stats || game.stats;
  game.time = data.time || 0;
  if (data.car) {
    const car = createCar(data.car.x, data.car.y, data.car.angle, data.car.model, 'player');
    car.hp = data.car.hp;
    game.cars.push(car);
    game.player.car = car;
    game.player.x = car.x; game.player.y = car.y;
  }
  game.cam.x = clamp(game.player.x - vw / 2, 0, Math.max(0, WORLD - vw));
  game.cam.y = clamp(game.player.y - vh / 2, 0, Math.max(0, WORLD - vh));
  enterPlaying();
  game.missions.restore(data.mission);
  game.hud.banner('WELCOME BACK', 'Your Solmar is exactly as you left it', '#2ecc71');
  return true;
}

function enterPlaying() {
  hide('title-screen'); hide('pause-menu'); hide('wasted-screen'); hide('busted-screen');
  game.state = 'playing';
  game.hud.showHud(true);
}

function quitToTitle() {
  game.state = 'title';
  game.hud.showHud(false);
  audioMod.stopAllLoops();
  hide('pause-menu'); hide('wasted-screen'); hide('busted-screen');
  refreshTitleButtons();
  show('title-screen');
}

// --- Overlays -----------------------------------------------------------------
function show(id) { const e = document.getElementById(id); if (e) e.style.display = 'flex'; }
function hide(id) { const e = document.getElementById(id); if (e) e.style.display = 'none'; }

function refreshTitleButtons() {
  const cont = document.getElementById('btn-continue');
  if (cont) cont.disabled = !hasSave();
}

// --- Player control -----------------------------------------------------------
function nearestStealableCar() {
  const p = game.player;
  let best = null, bd = 85;
  for (const car of game.cars) {
    if (car.role === 'cruiser' || car.wrecked) continue;
    const d = dist(p.x, p.y, car.x, car.y);
    if (d < bd) { bd = d; best = car; }
  }
  return best;
}

function updatePlayer(dt) {
  const p = game.player;
  const input = game.input;
  p.fireCd = Math.max(0, p.fireCd - dt);
  game.shotHeatCd = Math.max(0, game.shotHeatCd - dt);

  // Aim = mouse position in world space.
  const mx = game.cam.x + input.mouse.x;
  const my = game.cam.y + input.mouse.y;
  p.aim = Math.atan2(my - p.y, mx - p.x);

  const autospa = game.city.landmarkById.autospa;
  const hospital = game.city.landmarkById.hospital;
  const nearSpa = dist(p.x, p.y, autospa.cx, autospa.cy) < 190;
  const nearHospital = dist(p.x, p.y, hospital.cx, hospital.cy) < 190;

  if (p.car) {
    const car = p.car;
    p.x = car.x; p.y = car.y; p.angle = car.angle;
    const throttle = (input.down('KeyW') || input.down('ArrowUp') ? 1 : 0) +
      (input.down('KeyS') || input.down('ArrowDown') ? -1 : 0);
    const steer = (input.down('KeyD') || input.down('ArrowRight') ? 1 : 0) +
      (input.down('KeyA') || input.down('ArrowLeft') ? -1 : 0);
    const handbrake = input.down('Space');
    if (!car.wrecked) driveCar(game, car, { throttle, steer, handbrake }, dt);
    else { car.vx *= 0.9; car.vy *= 0.9; car.x += car.vx * dt; car.y += car.vy * dt; }
    p.x = car.x; p.y = car.y;
    p.speed = Math.abs(car.speed);

    if (input.wasPressed('KeyH')) audioMod.sfx.horn();

    // Exit / respray.
    if (nearSpa) {
      game.hud.setHint(`E — Respray & repair ($150)${game.wanted > 0 ? ' — clears wanted level' : ''}`);
      if (input.wasPressed('KeyE')) {
        if (game.cash >= 150) {
          game.cash -= 150;
          car.hp = 100; car.wrecked = false;
          game.police.clearWanted();
          game.hud.banner('RESPRAYED', 'Fresh paint. The SBPD lost your trail.', '#2ecc71');
          audioMod.sfx.heal();
        } else {
          game.hud.banner('NOT ENOUGH CASH', 'Respray costs $150', '#e74c3c');
        }
      }
    } else {
      game.hud.setHint('E — Exit car');
      if (input.wasPressed('KeyE')) {
        const side = { x: car.x - Math.sin(car.angle) * 34, y: car.y + Math.cos(car.angle) * 34 };
        const col = collideCircle(game.city, side.x, side.y, 14);
        p.x = col.x; p.y = col.y;
        p.car = null;
        car.role = 'parked';
        p.angle = car.angle;
      }
    }
  } else {
    // On foot.
    let mxv = 0, myv = 0;
    if (input.down('KeyW') || input.down('ArrowUp')) myv -= 1;
    if (input.down('KeyS') || input.down('ArrowDown')) myv += 1;
    if (input.down('KeyA') || input.down('ArrowLeft')) mxv -= 1;
    if (input.down('KeyD') || input.down('ArrowRight')) mxv += 1;
    const sprint = input.down('ShiftLeft') || input.down('ShiftRight');
    const speed = sprint ? 340 : 220;
    if (mxv !== 0 || myv !== 0) {
      const len = Math.hypot(mxv, myv);
      const nx = p.x + (mxv / len) * speed * dt;
      const ny = p.y + (myv / len) * speed * dt;
      const col = collideCircle(game.city, nx, ny, 14);
      p.x = col.x; p.y = col.y;
      p.speed = speed;
    } else {
      p.speed = 0;
    }
    p.angle = p.aim;

    // Shooting.
    if (input.mouse.down && p.fireCd <= 0) {
      p.fireCd = 0.13;
      shoot(game, p.x, p.y, p.aim, { fromPlayer: true, damage: 34 });
      scarePeds(game, p.x, p.y, 520);
      // Gunfire in front of the law draws heat.
      if (game.shotHeatCd <= 0) {
        const copNear = game.enemies.some((e) => e.type === 'cop' && dist(e.x, e.y, p.x, p.y) < 800) ||
          game.cars.some((c) => c.role === 'cruiser' && dist(c.x, c.y, p.x, p.y) < 900);
        if (copNear) { game.police.addWanted(1); game.shotHeatCd = 5; }
      }
    }

    // Contextual interaction.
    const car = nearestStealableCar();
    if (nearHospital && p.hp < 100) {
      game.hud.setHint('E — Get patched up ($100)');
      if (input.wasPressed('KeyE')) {
        if (game.cash >= 100) {
          game.cash -= 100;
          p.hp = 100;
          game.hud.banner('PATCHED UP', 'Solmar General fixed you up', '#2ecc71');
          audioMod.sfx.heal();
        } else game.hud.banner('NOT ENOUGH CASH', 'Treatment costs $100', '#e74c3c');
      }
    } else if (car) {
      game.hud.setHint('E — Steal car');
      if (input.wasPressed('KeyE')) {
        p.car = car;
        car.role = 'player';
        p.x = car.x; p.y = car.y;
        audioMod.sfx.click();
        // Seen theft raises heat: a cop or a crowd nearby notices.
        const witnessed = game.enemies.some((e) => e.type === 'cop' && dist(e.x, e.y, p.x, p.y) < 700) ||
          game.peds.some((pd) => pd.state !== 'down' && dist(pd.x, pd.y, p.x, p.y) < 220);
        if (witnessed) game.police.addWanted(1);
      }
    } else {
      game.hud.setHint('');
    }
  }

  // Slow health regen after 8s of calm.
  if (game.time - p.lastHurt > 8 && p.hp > 0 && p.hp < 100) {
    p.hp = Math.min(100, p.hp + 3 * dt);
  }
}

function updateCamera(dt) {
  const p = game.player;
  const tx = clamp(p.x - vw / 2, 0, Math.max(0, WORLD - vw));
  const ty = clamp(p.y - vh / 2, 0, Math.max(0, WORLD - vh));
  const k = Math.min(1, dt * 5);
  game.cam.x += (tx - game.cam.x) * k;
  game.cam.y += (ty - game.cam.y) * k;
}

// --- Main loop ------------------------------------------------------------------
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (game.state === 'title') {
    // Attract mode: slow pan over the city.
    game.time += dt;
    const t = game.time * 0.05;
    game.cam.x = clamp(1800 + Math.sin(t) * 900 - vw / 2, 0, Math.max(0, WORLD - vw));
    game.cam.y = clamp(1800 + Math.cos(t * 0.7) * 700 - vh / 2, 0, Math.max(0, WORLD - vh));
    updateTraffic(game, dt);
    updatePeds(game, dt);
    effectsMod.updateEffects(fx, dt);
  } else if (game.state === 'playing') {
    game.time += dt;
    if (game.input.wasPressed('Escape')) {
      game.state = 'paused';
      document.getElementById('pause-stats').textContent =
        `Cash $${game.cash.toLocaleString('en-US')}  ·  Missions done: ${game.stats.missionsDone || 0}  ·  Kings down: ${game.stats.kingsDown || 0}  ·  Time ${Math.floor(game.time / 60)}:${String(Math.floor(game.time % 60)).padStart(2, '0')}`;
      show('pause-menu');
      audioMod.stopAllLoops();
    } else {
      updatePlayer(dt);
      game.missions.update(dt);
      game.police.update(dt);
      updateTraffic(game, dt);
      updatePeds(game, dt);
      updateEnemies(game, dt);
      collideCars(game);
      effectsMod.updateEffects(fx, dt);
      updateCamera(dt);
      game.zoneName = zoneAt(game.player.x, game.player.y);
      audioMod.updateEngine(!!game.player.car, game.player.car ? Math.abs(game.player.car.speed) / 740 : 0);
      audioMod.updateSiren(game.sirenActive);
      game.hud.update(game, dt);
    }
  }

  ctx.clearRect(0, 0, vw, vh);
  if (game.city) drawWorld(game, ctx, game.cam, vw, vh);
  game.input.postUpdate();
  requestAnimationFrame(loop);
}

// --- Menu wiring ------------------------------------------------------------------
document.getElementById('btn-new').addEventListener('click', () => {
  audioMod.ensureAudio();
  audioMod.sfx.click();
  startNewGame();
});
document.getElementById('btn-continue').addEventListener('click', () => {
  audioMod.ensureAudio();
  audioMod.sfx.click();
  startContinue();
});
document.getElementById('btn-howto').addEventListener('click', () => {
  const p = document.getElementById('howto');
  p.style.display = p.style.display === 'block' ? 'none' : 'block';
});
document.getElementById('btn-resume').addEventListener('click', () => {
  hide('pause-menu');
  game.state = 'playing';
});
document.getElementById('btn-save').addEventListener('click', () => {
  if (game.saveNow()) game.hud.banner('GAME SAVED', 'Progress stored in this browser', '#2ecc71');
});
document.getElementById('btn-restart-mission').addEventListener('click', () => {
  hide('pause-menu');
  game.state = 'playing';
  game.missions.restartCurrent();
  game.hud.banner('MISSION RESTARTED', game.objective ? game.objective.title : '', '#f1c40f');
});
document.getElementById('btn-quit').addEventListener('click', () => {
  game.saveNow();
  quitToTitle();
});
function respawnAt(lmId) {
  const lm = game.city.landmarkById[lmId];
  const p = game.player;
  p.hp = 100;
  p.car = null;
  p.x = lm.cx; p.y = lm.cy + 130;
  p.lastHurt = game.time;
  game.police.clearWanted();
  game.cam.x = clamp(p.x - vw / 2, 0, Math.max(0, WORLD - vw));
  game.cam.y = clamp(p.y - vh / 2, 0, Math.max(0, WORLD - vh));
  enterPlaying();
}
document.getElementById('btn-respawn-wasted').addEventListener('click', () => respawnAt('hospital'));
document.getElementById('btn-respawn-busted').addEventListener('click', () => respawnAt('sbpd'));

// First user gesture unlocks audio.
window.addEventListener('pointerdown', () => audioMod.ensureAudio(), { once: true });
window.addEventListener('keydown', () => audioMod.ensureAudio(), { once: true });

// --- Debug hooks (tests + screenshots) ---------------------------------------------
window.__solmar = {
  game,
  teleport(x, y) {
    game.player.x = x; game.player.y = y;
    if (game.player.car) { game.player.car.x = x; game.player.car.y = y; game.player.car.vx = 0; game.player.car.vy = 0; }
    game.cam.x = clamp(x - vw / 2, 0, Math.max(0, WORLD - vw));
    game.cam.y = clamp(y - vh / 2, 0, Math.max(0, WORLD - vh));
  },
  setWanted(n) {
    game.wanted = clamp(n, 0, 5);
    game.police.setWanted(game.wanted);
  },
  giveCash(n) { game.cash += n; },
  zone() { return zoneAt(game.player.x, game.player.y); },
  los(x1, y1, x2, y2) { return hasLineOfSight(game, x1, y1, x2, y2); },
};

// --- Boot ---------------------------------------------------------------------------
resetGame(game.seed); // title screen shows a living city behind it
refreshTitleButtons();
if (autostart) {
  startNewGame();
} else {
  game.hud.showHud(false);
  show('title-screen');
}
requestAnimationFrame(loop);
