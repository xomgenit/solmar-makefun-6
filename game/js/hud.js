// hud.js — DOM HUD + round minimap.
import { clamp, dist } from './util.js';
import { WORLD, V_ROADS, H_ROADS, ROAD_W, SAND_X, SEA_X } from './city.js';

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const el = {
    hud: $('hud'), healthFill: $('health-fill'), healthText: $('health-text'),
    cash: $('cash'), stars: $('stars'), zone: $('zone'),
    minimap: $('minimap'), speed: $('speed'), speedometer: $('speedometer'),
    carHealth: $('car-health'), carHealthFill: $('car-health-fill'),
    objTitle: $('objective-title'), objText: $('objective-text'),
    hint: $('hint'), banner: $('banner'), bannerTitle: $('banner-title'),
    bannerSub: $('banner-sub'),
  };
  const mctx = el.minimap ? el.minimap.getContext('2d') : null;
  let bannerT = 0;

  function showHud(on) {
    if (el.hud) el.hud.style.display = on ? 'block' : 'none';
  }

  function banner(title, sub, color) {
    if (!el.banner) return;
    el.bannerTitle.textContent = title;
    el.bannerSub.textContent = sub || '';
    el.banner.style.borderColor = color || '#f1c40f';
    el.bannerTitle.style.color = color || '#f1c40f';
    el.banner.style.display = 'block';
    bannerT = 3.2;
  }

  function setHint(text) {
    if (!el.hint) return;
    if (text) { el.hint.textContent = text; el.hint.style.display = 'block'; }
    else el.hint.style.display = 'none';
  }

  function update(game, dt) {
    if (bannerT > 0) {
      bannerT -= dt;
      if (bannerT <= 0 && el.banner) el.banner.style.display = 'none';
    }
    if (!game || game.state !== 'playing') return;
    const p = game.player;
    if (el.healthFill) el.healthFill.style.width = clamp(p.hp, 0, 100) + '%';
    if (el.healthText) el.healthText.textContent = Math.ceil(p.hp);
    if (el.cash) el.cash.textContent = '$' + game.cash.toLocaleString('en-US');
    if (el.stars) {
      el.stars.textContent = '★'.repeat(game.wanted) + '☆'.repeat(5 - game.wanted);
      el.stars.style.color = game.wanted > 0 ? '#f1c40f' : 'rgba(255,255,255,0.35)';
    }
    if (el.zone) el.zone.textContent = game.zoneName || '';
    if (el.objTitle) el.objTitle.textContent = game.objective ? game.objective.title : '';
    if (el.objText) el.objText.textContent = game.objective ? game.objective.text : '';
    if (el.speedometer) {
      if (p.car) {
        el.speedometer.style.display = 'block';
        const kmh = Math.round(Math.abs(p.car.speed) * 0.45);
        if (el.speed) el.speed.textContent = kmh + ' km/h';
        if (el.carHealth) el.carHealth.style.display = 'block';
        if (el.carHealthFill) el.carHealthFill.style.width = clamp(p.car.hp, 0, 100) + '%';
      } else {
        el.speedometer.style.display = 'none';
        if (el.carHealth) el.carHealth.style.display = 'none';
      }
    }
    drawMinimap(game);
  }

  function drawMinimap(game) {
    if (!mctx) return;
    const S = 150, R = S / 2;
    const scale = S / WORLD;
    const px = game.player.x, py = game.player.y;
    mctx.save();
    mctx.beginPath();
    mctx.arc(R, R, R - 2, 0, Math.PI * 2);
    mctx.clip();
    // Background.
    mctx.fillStyle = '#16241a';
    mctx.fillRect(0, 0, S, S);
    // Sea + sand.
    mctx.fillStyle = '#d8c08a';
    mctx.fillRect(SAND_X * scale, 0, S, S);
    mctx.fillStyle = '#1a5a8a';
    mctx.fillRect(SEA_X * scale, 0, S, S);
    // Roads.
    mctx.strokeStyle = '#3a3a42';
    mctx.lineWidth = Math.max(2, ROAD_W * scale);
    for (const rx of V_ROADS) {
      mctx.beginPath(); mctx.moveTo(rx * scale, 0); mctx.lineTo(rx * scale, S); mctx.stroke();
    }
    for (const ry of H_ROADS) {
      mctx.beginPath(); mctx.moveTo(0, ry * scale); mctx.lineTo(S, ry * scale); mctx.stroke();
    }
    const blip = (x, y, color, r) => {
      mctx.fillStyle = color;
      mctx.beginPath();
      mctx.arc(x * scale, y * scale, r || 3, 0, Math.PI * 2);
      mctx.fill();
    };
    // Mission marker.
    if (game.objective && game.objective.marker) {
      const m = game.objective.marker;
      const pulse = 3 + Math.sin(game.time * 5) * 1.5;
      blip(m.x, m.y, '#f1c40f', pulse);
    }
    // Cops / cruisers.
    for (const e of game.enemies) if (e.type === 'cop') blip(e.x, e.y, '#4a90d8', 3);
    for (const c of game.cars) if (c.role === 'cruiser') blip(c.x, c.y, '#4a90d8', 3.5);
    // Kings.
    for (const e of game.enemies) if (e.type === 'king') blip(e.x, e.y, '#e74c3c', 3.5);
    // Player (white, with heading tick).
    mctx.fillStyle = '#fff';
    mctx.beginPath();
    mctx.arc(px * scale, py * scale, 4, 0, Math.PI * 2);
    mctx.fill();
    mctx.strokeStyle = '#fff';
    mctx.lineWidth = 2;
    mctx.beginPath();
    mctx.moveTo(px * scale, py * scale);
    mctx.lineTo(px * scale + Math.cos(game.player.angle) * 8, py * scale + Math.sin(game.player.angle) * 8);
    mctx.stroke();
    mctx.restore();
    // Ring.
    mctx.strokeStyle = 'rgba(255,255,255,0.55)';
    mctx.lineWidth = 2;
    mctx.beginPath();
    mctx.arc(R, R, R - 2, 0, Math.PI * 2);
    mctx.stroke();
  }

  return { showHud, banner, setHint, update, drawMinimap };
}
