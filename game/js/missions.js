// missions.js — mission registry + state machine. Vera's job chain for
// Danny "Dice" Marlow, plus the free-roam fallback, hidden cash stashes,
// and the post-mission-3 sports-car unlock.
//
// Def shape:
//   { id, title, brief, reward, next,
//     start(game, ms), update(game, ms, dt) -> 'done'|'failed'|undefined,
//     onEnemyDown(game, ms, enemy) }
// Per-mission state lives in ms.state (fresh {} per start). Pay-once rule:
// rewards are paid ONLY by completeCurrent, which clears the current
// mission BEFORE paying — a mission can never pay twice, even if its
// completion zone is revisited. Stash + pier bonuses live in the missions
// closure (not per-start state) and are persisted in the save.
import { dist } from './util.js';
import { spawnEnemy } from './combat.js';
import { spawnParkedCar } from './vehicles.js';

// Hidden cash stashes: road-centre spots, always reachable (no building can
// ever sit on a road). $300 each, once each, in every mission + free roam.
export const STASHES = [
  { x: 900, y: 1500 },   // OLD TOWN crossroads, west of Sunset Auto Spa
  { x: 2100, y: 900 },   // DOWNTOWN crossroads, south of the bank
  { x: 2700, y: 2100 },  // EAST HARBOUR crossroads, north of the docks
];
export const STASH_REWARD = 300;
export const SPORTS_COLOR = '#f1c40f'; // gold prize sports car

function near(game, lmId, radius) {
  const lm = game.city.landmarkById[lmId];
  return dist(game.player.x, game.player.y, lm.cx, lm.cy) < radius;
}

function markerOf(game, lmId) {
  const lm = game.city.landmarkById[lmId];
  return { x: lm.cx, y: lm.cy };
}

export const MISSION_DEFS = {
  'first-wheels': {
    id: 'first-wheels',
    title: 'FIRST WHEELS',
    brief: 'Vera needs a car. Steal any set of wheels and bring it to her garage.',
    reward: 250,
    next: 'the-pickup',
    start(game, ms) {
      ms.state.stolen = false;
      const car = game.cars.find((c) => c.model === 'sports' && c.role === 'parked');
      game.missions.setObjective(
        'Steal a car — the red sports car by the hideout is unlocked (E)',
        car ? { x: car.x, y: car.y } : markerOf(game, 'hideout'));
    },
    update(game, ms) {
      if (!ms.state.stolen) {
        if (game.player.car) {
          ms.state.stolen = true;
          game.missions.setObjective("Nice wheels. Now bring it to Vera's Garage", markerOf(game, 'garage'));
          game.hud.banner('CAR STOLEN', "Get it to Vera's Garage", '#f1c40f');
        }
        return undefined;
      }
      // Must arrive IN the stolen car.
      if (game.player.car && near(game, 'garage', 200)) return 'done';
      return undefined;
    },
    onEnemyDown() {},
  },

  'the-pickup': {
    id: 'the-pickup',
    title: 'THE PICKUP',
    brief: 'A package is waiting at East Harbour Docks. Bring it to Vera at the diner.',
    reward: 400,
    next: 'hot-delivery',
    start(game, ms) {
      ms.state.hasPackage = false;
      game.missions.setObjective('Pick up the package at East Harbour Docks', markerOf(game, 'docks'));
    },
    update(game, ms) {
      if (!ms.state.hasPackage) {
        if (near(game, 'docks', 170)) {
          ms.state.hasPackage = true;
          game.missions.setObjective("Package secured. Deliver it to Vera's Diner", markerOf(game, 'diner'));
          game.hud.banner('PACKAGE SECURED', "Vera's waiting at the diner", '#f1c40f');
          game.audio.sfx.blip();
        }
        return undefined;
      }
      if (near(game, 'diner', 170)) return 'done';
      return undefined;
    },
    onEnemyDown() {},
  },

  'hot-delivery': {
    id: 'hot-delivery',
    title: 'HOT DELIVERY',
    brief: 'Ninety seconds to get this package to the Docks. Vera does not do late.',
    reward: 600,
    next: 'payback-pier',
    start(game, ms) {
      ms.state.timeLeft = 90;
      game.missions.setObjective('Deliver to East Harbour Docks — 90s', markerOf(game, 'docks'));
    },
    update(game, ms, dt) {
      ms.state.timeLeft -= dt;
      const t = Math.max(0, Math.ceil(ms.state.timeLeft));
      game.missions.setObjective(`Deliver to East Harbour Docks — ${t}s`, markerOf(game, 'docks'));
      if (near(game, 'docks', 170)) return 'done';
      if (ms.state.timeLeft <= 0) {
        // Timeout: restart in place, pay nothing, chain intact.
        game.hud.banner('TOO SLOW', 'Vera gives you one more shot — 90 seconds', '#e74c3c');
        game.missions.restartCurrent();
      }
      return undefined;
    },
    onEnemyDown() {},
  },

  'payback-pier': {
    id: 'payback-pier',
    title: 'PAYBACK AT THE PIER',
    brief: 'The Harbor Kings jumped Vera\'s courier. Four of them are on the pier. End it.',
    reward: 800,
    next: 'solmar-score',
    start(game, ms) {
      // Clear any kings left over from an earlier attempt, then wave 1.
      game.enemies = game.enemies.filter((e) => e.type !== 'king');
      ms.state.kills = 0;
      ms.state.wave = 1;
      spawnEnemy(game, 3360, 1790, 'king');
      spawnEnemy(game, 3500, 1810, 'king');
      game.missions.setObjective('Eliminate the Harbor Kings on the pier (4 left)', markerOf(game, 'pier'));
    },
    update() { return undefined; },
    onEnemyDown(game, ms) {
      ms.state.kills += 1;
      const left = 4 - ms.state.kills;
      if (ms.state.kills === 2 && ms.state.wave === 1) {
        // Wave 2 arrives the moment the first two fall.
        ms.state.wave = 2;
        spawnEnemy(game, 3420, 1810, 'king');
        spawnEnemy(game, 3540, 1790, 'king');
        game.hud.banner('REINFORCEMENTS', 'Two more Kings on the pier!', '#e74c3c');
        game.missions.setObjective('Eliminate the Harbor Kings on the pier (2 left)', markerOf(game, 'pier'));
      } else if (left <= 0) {
        game.missions.completeCurrent();
      } else {
        game.missions.setObjective(`Eliminate the Harbor Kings on the pier (${left} left)`, markerOf(game, 'pier'));
      }
    },
  },

  'solmar-score': {
    id: 'solmar-score',
    title: 'THE SOLMAR SCORE',
    brief: 'The big one: crack the vault at Solmar National Bank, then lose the heat.',
    reward: 1500,
    next: null,
    start(game, ms) {
      ms.state.progress = 0;
      ms.state.alarmed = false;
      game.missions.setObjective('Crack the vault — stay close to the bank (0%)', markerOf(game, 'bank'));
    },
    update(game, ms, dt) {
      if (!ms.state.alarmed) {
        if (near(game, 'bank', 200)) {
          ms.state.progress += dt;
          const pct = Math.min(100, Math.floor((ms.state.progress / 5) * 100));
          game.missions.setObjective(`Crack the vault — stay close to the bank (${pct}%)`, markerOf(game, 'bank'));
          if (ms.state.progress >= 5) {
            ms.state.alarmed = true;
            game.police.addWanted(2);
            game.hud.banner('ALARM!', 'Two stars. Lose the heat!', '#e74c3c');
            game.missions.setObjective('Lose the heat — stay unseen, or respray at Sunset Auto Spa', markerOf(game, 'autospa'));
          }
        } else if (ms.state.progress > 0) {
          // Stepping away breaks the crack — start over.
          ms.state.progress = 0;
          game.missions.setObjective('Crack the vault — stay close to the bank (0%)', markerOf(game, 'bank'));
        }
        return undefined;
      }
      // Escape phase: done the moment the heat is gone.
      if (game.wanted === 0) return 'done';
      return undefined;
    },
    onEnemyDown() {},
  },

  'free-roam': {
    id: 'free-roam',
    title: 'FREE ROAM',
    brief: 'Solmar Bay is yours. Visit the Pier for a little walking-around money.',
    reward: 0,
    next: null,
    start(game, ms) {
      // pierPaid lives on the missions object (persisted), NOT in per-start
      // state — otherwise CONTINUE at the pier would pay the $50 again.
      if (!game.missions.pierPaid) {
        game.missions.setObjective('Visit Solmar Pier', markerOf(game, 'pier'));
      } else {
        game.missions.setObjective('Free roam — Solmar Bay is yours', null);
      }
    },
    update(game, ms) {
      if (game.missions.pierPaid) return undefined;
      if (near(game, 'pier', 140)) {
        game.missions.pierPaid = true;
        game.cash += 50;
        game.stats.earned = (game.stats.earned || 0) + 50;
        game.effects.floater(game.player.x, game.player.y - 30, '+$50', '#2ecc71');
        game.audio.sfx.cash();
        game.hud.banner('PIER VISITED', '+$50 walking-around money', '#2ecc71');
        game.missions.setObjective('Free roam — Solmar Bay is yours', null);
        game.saveNow();
      }
      return undefined;
    },
    onEnemyDown() {},
  },
};

export function createMissions(game) {
  let current = null; // { id, def, state }
  // Closure state, persisted in the save (NOT per-start ms.state).
  let stashesTaken = []; // indices into STASHES
  let sportsUnlocked = false;
  let pierPaid = false;

  function start(id) {
    const def = MISSION_DEFS[id];
    if (!def) { console.warn('Unknown mission', id); return; }
    current = { id, def, state: {} };
    game.objective = { title: def.title, text: def.brief, marker: null };
    def.start(game, current);
  }

  // Clear state FIRST, then pay/banner/autosave/chain — otherwise a mission
  // that completes can pay its reward every frame.
  function completeCurrent() {
    if (!current) return;
    const def = current.def;
    const wasId = def.id;
    current = null;
    if (def.reward > 0) {
      game.cash += def.reward;
      game.stats.earned = (game.stats.earned || 0) + def.reward;
      game.stats.missionsDone = (game.stats.missionsDone || 0) + 1;
      game.audio.sfx.cash();
    }
    (game.stats.completedMissions = game.stats.completedMissions || []).push(def.id);
    // Sports-car unlock: finishing Hot Delivery earns the gold sports car,
    // parked at Vera's Garage.
    let sub = def.title + (def.reward ? `  +$${def.reward}` : '');
    if (wasId === 'hot-delivery') {
      unlockSportsCar();
      sub += '  — gold sports car at Vera\'s Garage!';
    }
    game.hud.banner('MISSION COMPLETE', sub, '#2ecc71');
    game.saveNow();
    if (def.next) start(def.next);
    else if (def.id !== 'free-roam') start('free-roam');
  }

  function failCurrent(reason) {
    if (!current) return;
    const def = current.def;
    current = null;
    game.hud.banner('MISSION FAILED', reason || def.title, '#e74c3c');
    start('free-roam');
  }

  function restartCurrent() {
    if (!current) return;
    start(current.id);
  }

  function setObjective(text, marker) {
    game.objective = {
      title: current ? current.def.title : 'FREE ROAM',
      text,
      marker: marker || null,
    };
  }

  function onEnemyDown(enemy) {
    if (!current || !current.def.onEnemyDown) return;
    current.def.onEnemyDown(game, current, enemy);
  }

  // The gold sports car, parked on the road by Vera's Garage. Spawned once
  // on unlock; re-spawned on CONTINUE if it is missing from the world.
  function prizeCarInWorld() {
    return game.cars.some((c) => c.model === 'sports' && c.color === SPORTS_COLOR);
  }
  function spawnPrizeCar() {
    if (prizeCarInWorld()) return;
    const car = spawnParkedCar(game, 1500, 1050, Math.PI / 2, 'sports', SPORTS_COLOR);
    car.isSportsPrize = true;
    game.cars.push(car);
  }
  function unlockSportsCar() {
    if (sportsUnlocked) return;
    sportsUnlocked = true;
    spawnPrizeCar();
    // The MISSION COMPLETE banner carries the unlock note (one banner only).
  }

  // Hidden stashes: live in every mission + free roam, pay once each.
  function checkStashes() {
    if (!game.player) return;
    for (let i = 0; i < STASHES.length; i++) {
      if (stashesTaken.includes(i)) continue;
      const s = STASHES[i];
      if (dist(game.player.x, game.player.y, s.x, s.y) < 70) {
        stashesTaken.push(i);
        game.cash += STASH_REWARD;
        game.stats.earned = (game.stats.earned || 0) + STASH_REWARD;
        game.effects.floater(game.player.x, game.player.y - 30, `+$${STASH_REWARD}`, '#2ecc71');
        game.audio.sfx.cash();
        game.hud.banner('CASH STASH', `+$${STASH_REWARD} hidden cash`, '#2ecc71');
        game.saveNow();
      }
    }
  }

  function update(dt) {
    checkStashes();
    if (!current) return;
    const result = current.def.update(game, current, dt);
    if (result === 'done') completeCurrent();
    else if (result === 'failed') failCurrent();
  }

  function reset() {
    current = null;
    stashesTaken = [];
    sportsUnlocked = false;
    pierPaid = false;
  }

  function serialize() {
    return {
      id: current ? current.id : 'free-roam',
      state: current ? current.state : {},
      stashesTaken: [...stashesTaken],
      sportsUnlocked,
      pierPaid,
    };
  }

  function restore(data) {
    if (data) {
      stashesTaken = Array.isArray(data.stashesTaken) ? [...data.stashesTaken] : [];
      sportsUnlocked = !!data.sportsUnlocked;
      pierPaid = !!data.pierPaid;
    }
    if (!data || !MISSION_DEFS[data.id]) { start('free-roam'); return; }
    start(data.id);
    if (current && data.state) Object.assign(current.state, data.state);
    // Re-run start so the objective reflects restored state.
    if (current) current.def.start(game, current);
    // Re-spawn the prize car if the unlock was earned and the car is gone.
    if (sportsUnlocked) spawnPrizeCar();
  }

  return {
    start, completeCurrent, failCurrent, restartCurrent,
    setObjective, onEnemyDown, update, serialize, restore, reset,
    isStashTaken(i) { return stashesTaken.includes(i); },
    list() { return Object.keys(MISSION_DEFS); },
    isComplete(id) { return (game.stats.completedMissions || []).includes(id); },
    get current() { return current; },
    get currentId() { return current ? current.id : null; },
    get stashesTaken() { return [...stashesTaken]; },
    get sportsUnlocked() { return sportsUnlocked; },
    get pierPaid() { return pierPaid; },
    set pierPaid(v) { pierPaid = !!v; },
  };
}
