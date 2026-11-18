// missions.js — mission registry + state machine. THE HOOK FOR BUILDER 2:
// add story defs to MISSION_DEFS and chain them via `next`.
//
// Def shape:
//   { id, title, brief, reward, next,
//     start(game, ms), update(game, ms, dt) -> 'done'|'failed'|undefined,
//     onEnemyDown(game, ms, enemy) }
// Per-mission state lives in ms.state (fresh {} per start).
import { dist } from './util.js';

export const MISSION_DEFS = {
  'free-roam': {
    id: 'free-roam',
    title: 'FREE ROAM',
    brief: 'Solmar Bay is yours. Visit the Pier for a little walking-around money.',
    reward: 0,
    next: null,
    start(game, ms) {
      const pier = game.city.landmarkById.pier;
      if (!ms.state.paid) {
        game.missions.setObjective('Visit Solmar Pier', { x: pier.cx, y: pier.cy });
      } else {
        game.missions.setObjective('Free roam — Solmar Bay is yours', null);
      }
    },
    update(game, ms, dt) {
      if (ms.state.paid) return undefined;
      const pier = game.city.landmarkById.pier;
      if (dist(game.player.x, game.player.y, pier.cx, pier.cy) < 140) {
        ms.state.paid = true;
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
    current = null;
    if (def.reward > 0) {
      game.cash += def.reward;
      game.stats.earned = (game.stats.earned || 0) + def.reward;
      game.stats.missionsDone = (game.stats.missionsDone || 0) + 1;
      game.audio.sfx.cash();
    }
    (game.stats.completedMissions = game.stats.completedMissions || []).push(def.id);
    game.hud.banner('MISSION COMPLETE', def.title + (def.reward ? `  +$${def.reward}` : ''), '#2ecc71');
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

  function update(dt) {
    if (!current) return;
    const result = current.def.update(game, current, dt);
    if (result === 'done') completeCurrent();
    else if (result === 'failed') failCurrent();
  }

  function serialize() {
    if (!current) return { id: 'free-roam', state: {} };
    return { id: current.id, state: current.state };
  }

  function restore(data) {
    if (!data || !MISSION_DEFS[data.id]) { start('free-roam'); return; }
    start(data.id);
    if (current && data.state) Object.assign(current.state, data.state);
    // Re-run start so the objective reflects restored state.
    if (current) current.def.start(game, current);
  }

  return {
    start, completeCurrent, failCurrent, restartCurrent,
    setObjective, onEnemyDown, update, serialize, restore,
    list() { return Object.keys(MISSION_DEFS); },
    isComplete(id) { return (game.stats.completedMissions || []).includes(id); },
    get current() { return current; },
    get currentId() { return current ? current.id : null; },
  };
}
