// city.js — seeded procedural city: roads, buildings, landmarks, palms,
// beach + sea + pier, zones. Pure function of the seed.
import { makeRng, clamp, pick, pushCircleOutOfRect } from './util.js';

export const WORLD = 3600;
export const ROAD_W = 120;
export const V_ROADS = [300, 900, 1500, 2100, 2700];
export const H_ROADS = [300, 900, 1500, 2100, 2700, 3300];
export const SAND_X = 3100;   // sand starts here
export const SEA_X = 3440;    // open water starts here
export const PIER = { x: 3300, y: 1770, w: 260, h: 60 };

export const LANDMARKS = [
  { id: 'hideout',  name: "Dice's Hideout",        cx: 450,  cy: 450,  w: 150, h: 110, color: '#7a5c3e' },
  { id: 'diner',    name: 'Sunset Diner',          cx: 1050, cy: 450,  w: 170, h: 110, color: '#b0586a' },
  { id: 'bank',     name: 'Solmar National Bank',  cx: 2250, cy: 450,  w: 200, h: 140, color: '#5a6b8a' },
  { id: 'sbpd',     name: 'SBPD Headquarters',     cx: 2850, cy: 450,  w: 190, h: 130, color: '#3f5a78' },
  { id: 'hospital', name: 'Solmar General',        cx: 450,  cy: 1050, w: 200, h: 140, color: '#e8e4da' },
  { id: 'garage',   name: "Vera's Garage",         cx: 1650, cy: 1050, w: 190, h: 130, color: '#6a7a5a' },
  { id: 'autospa',  name: 'Sunset Auto Spa',       cx: 1050, cy: 1650, w: 170, h: 120, color: '#4a90a8' },
  { id: 'docks',    name: 'East Harbour Docks',    cx: 2850, cy: 2850, w: 220, h: 150, color: '#8a7a5a' },
  { id: 'pier',     name: 'Solmar Pier',           cx: 3430, cy: 1800, w: 0,   h: 0,   color: '#a8825a' },
];

const ROOF_COLORS = ['#8a4a3a', '#5a6b7a', '#7a7a5a', '#6a5a7a', '#9a8a6a', '#4a6a5a'];
const WALL_COLORS = ['#c8b8a0', '#b8c0c8', '#d0c0b0', '#a8b8a0', '#c0b0a8'];

export function buildCity(seed) {
  const rng = makeRng(seed);
  const buildings = [];
  const palms = [];

  // Landmark buildings (solid, collidable) — except the pier (walkable deck).
  const landmarkById = {};
  for (const lm of LANDMARKS) {
    landmarkById[lm.id] = { ...lm };
    if (lm.w > 0) {
      buildings.push({
        x: lm.cx - lm.w / 2, y: lm.cy - lm.h / 2, w: lm.w, h: lm.h,
        color: lm.color, roof: '#3a3a42', landmark: lm.id, name: lm.name,
      });
    }
  }

  // Block buildings: each block between adjacent roads gets 1-3 buildings.
  const vEdges = [0, ...V_ROADS, SAND_X];
  const hEdges = [0, ...H_ROADS, WORLD];
  for (let bi = 0; bi < vEdges.length - 1; bi++) {
    for (let bj = 0; bj < hEdges.length - 1; bj++) {
      const bx0 = vEdges[bi] + ROAD_W / 2 + 24;
      const bx1 = vEdges[bi + 1] - ROAD_W / 2 - 24;
      const by0 = hEdges[bj] + ROAD_W / 2 + 24;
      const by1 = hEdges[bj + 1] - ROAD_W / 2 - 24;
      if (bx1 - bx0 < 90 || by1 - by0 < 90) continue;
      // Skip blocks that contain a landmark building.
      const cx = (bx0 + bx1) / 2, cy = (by0 + by1) / 2;
      if (LANDMARKS.some((lm) => lm.w > 0 && Math.abs(lm.cx - cx) < 260 && Math.abs(lm.cy - cy) < 260)) continue;
      const n = 1 + Math.floor(rng() * 3);
      for (let k = 0; k < n; k++) {
        const w = 80 + rng() * 130;
        const h = 80 + rng() * 130;
        const x = bx0 + rng() * Math.max(1, bx1 - bx0 - w);
        const y = by0 + rng() * Math.max(1, by1 - by0 - h);
        const rect = { x, y, w, h, color: pick(rng, WALL_COLORS), roof: pick(rng, ROOF_COLORS) };
        if (buildings.some((b) => rectsOverlap(rect, b, 18))) continue;
        buildings.push(rect);
      }
      // A few palms per block.
      const np = Math.floor(rng() * 3);
      for (let k = 0; k < np; k++) {
        palms.push({ x: bx0 + rng() * (bx1 - bx0), y: by0 + rng() * (by1 - by0) });
      }
    }
  }
  // Palm row along the beach.
  for (let y = 120; y < WORLD; y += 90 + rng() * 120) {
    palms.push({ x: 3160 + rng() * 120, y });
  }

  return { seed, buildings, palms, landmarkById };
}

function rectsOverlap(a, b, pad) {
  return a.x - pad < b.x + b.w && a.x + a.w + pad > b.x &&
         a.y - pad < b.y + b.h && a.y + a.h + pad > b.y;
}

export function zoneAt(x, y) {
  if (x > SAND_X) return 'PALMA BEACH';
  if (y > 2700) return x > 1500 ? 'EAST HARBOUR' : 'SOUTH DOCKS';
  if (x >= 1200 && x <= 2400 && y <= 1500) return 'DOWNTOWN';
  if (x < 1200) return 'OLD TOWN';
  if (y < 900) return 'NORTHSIDE';
  return 'SOLMAR BAY';
}

export function isWater(city, x, y) {
  if (x < SEA_X) return false;
  // The pier deck is walkable.
  return !(x >= PIER.x && x <= PIER.x + PIER.w && y >= PIER.y && y <= PIER.y + PIER.h);
}

export function onRoad(x, y) {
  for (const rx of V_ROADS) if (Math.abs(x - rx) <= ROAD_W / 2) return true;
  for (const ry of H_ROADS) if (Math.abs(y - ry) <= ROAD_W / 2) return true;
  return false;
}

export function nearestRoadPoint(city, x, y) {
  let best = null, bd = Infinity;
  for (const rx of V_ROADS) {
    const d = Math.abs(x - rx);
    if (d < bd) { bd = d; best = { x: rx, y: clamp(y, 60, WORLD - 60) }; }
  }
  for (const ry of H_ROADS) {
    const d = Math.abs(y - ry);
    if (d < bd) { bd = d; best = { x: clamp(x, 60, WORLD - 60), y: ry }; }
  }
  return best;
}

// Push a circle out of buildings, water and the world edge.
export function collideCircle(city, x, y, r) {
  let hit = false;
  x = clamp(x, r, WORLD - r);
  y = clamp(y, r, WORLD - r);
  if (isWater(city, x, y)) {
    // Push back west out of the sea (or off the pier sides).
    if (y < PIER.y || y > PIER.y + PIER.h) { x = SEA_X - r; hit = true; }
    else if (x > PIER.x + PIER.w) { x = PIER.x + PIER.w - r; hit = true; }
  }
  for (const b of city.buildings) {
    if (x + r < b.x || x - r > b.x + b.w || y + r < b.y || y - r > b.y + b.h) continue;
    const p = pushCircleOutOfRect(x, y, r, b);
    if (p.hit) { x = p.x; y = p.y; hit = true; }
  }
  return { x, y, hit };
}
