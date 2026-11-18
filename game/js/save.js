// save.js — localStorage persistence. Save stores the city seed so CONTINUE
// rebuilds the exact same city.
export const SAVE_KEY = 'solmar-save-v1';

export function hasSave() {
  try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; }
}

export function saveGame(game) {
  const p = game.player;
  const data = {
    v: 1,
    seed: game.seed,
    cash: game.cash,
    hp: Math.max(1, Math.round(p.hp)),
    x: Math.round(p.x),
    y: Math.round(p.y),
    car: p.car ? {
      model: p.car.model,
      x: Math.round(p.car.x), y: Math.round(p.car.y),
      angle: p.car.angle, hp: Math.round(p.car.hp),
    } : null,
    mission: game.missions.serialize(),
    stats: game.stats,
    time: Math.round(game.time),
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch { return false; }
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (d.v !== 1 || typeof d.seed !== 'number') return null;
    return d;
  } catch { return null; }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}
