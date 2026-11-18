// effects.js — particles, tracers, floaters, skid marks, screen shake.
export function createEffects() {
  return {
    particles: [], tracers: [], floaters: [], skids: [],
    shake: 0, shakeX: 0, shakeY: 0,
  };
}

function addParticle(fx, x, y, vx, vy, life, color, size) {
  if (fx.particles.length > 400) fx.particles.shift();
  fx.particles.push({ x, y, vx, vy, life, maxLife: life, color, size });
}

export function burst(fx, x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 60 + Math.random() * 220;
    addParticle(fx, x, y, Math.cos(a) * s, Math.sin(a) * s, 0.4 + Math.random() * 0.5, color, 2 + Math.random() * 3);
  }
}

export function sparks(fx, x, y, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 120 + Math.random() * 260;
    addParticle(fx, x, y, Math.cos(a) * s, Math.sin(a) * s, 0.2 + Math.random() * 0.25, '#ffd76a', 1.5 + Math.random() * 2);
  }
}

export function smoke(fx, x, y, n) {
  for (let i = 0; i < n; i++) {
    addParticle(fx, x + (Math.random() - 0.5) * 8, y + (Math.random() - 0.5) * 8,
      (Math.random() - 0.5) * 20, -20 - Math.random() * 30, 0.7 + Math.random() * 0.6, 'rgba(140,140,140,0.55)', 5 + Math.random() * 6);
  }
}

export function blood(fx, x, y, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 40 + Math.random() * 140;
    addParticle(fx, x, y, Math.cos(a) * s, Math.sin(a) * s, 0.3 + Math.random() * 0.3, '#a01010', 2 + Math.random() * 2);
  }
}

export function tracer(fx, x1, y1, x2, y2) {
  if (fx.tracers.length > 40) fx.tracers.shift();
  fx.tracers.push({ x1, y1, x2, y2, life: 0.09 });
}

export function floater(fx, x, y, text, color) {
  if (fx.floaters.length > 20) fx.floaters.shift();
  fx.floaters.push({ x, y, text, color: color || '#fff', life: 1.4 });
}

export function skid(fx, x, y, angle) {
  if (fx.skids.length > 300) fx.skids.shift();
  fx.skids.push({ x, y, angle, life: 6 });
}

export function muzzle(fx, x, y) {
  addParticle(fx, x, y, 0, 0, 0.06, '#ffdd55', 6);
}

export function addShake(fx, amount) {
  fx.shake = Math.min(14, fx.shake + amount);
}

export function updateEffects(fx, dt) {
  for (const p of fx.particles) {
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx *= 1 - 2.4 * dt; p.vy *= 1 - 2.4 * dt;
    p.life -= dt;
  }
  fx.particles = fx.particles.filter((p) => p.life > 0);
  for (const t of fx.tracers) t.life -= dt;
  fx.tracers = fx.tracers.filter((t) => t.life > 0);
  for (const f of fx.floaters) { f.y -= 34 * dt; f.life -= dt; }
  fx.floaters = fx.floaters.filter((f) => f.life > 0);
  for (const s of fx.skids) s.life -= dt;
  fx.skids = fx.skids.filter((s) => s.life > 0);
  if (fx.shake > 0) {
    fx.shakeX = (Math.random() - 0.5) * fx.shake;
    fx.shakeY = (Math.random() - 0.5) * fx.shake;
    fx.shake = Math.max(0, fx.shake - 30 * dt);
  } else { fx.shakeX = 0; fx.shakeY = 0; }
}

export function drawEffects(ctx, fx) {
  // Skid marks (under everything else).
  ctx.save();
  for (const s of fx.skids) {
    ctx.globalAlpha = Math.min(0.5, s.life * 0.2);
    ctx.fillStyle = '#111';
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.angle);
    ctx.fillRect(-7, -2, 14, 4);
    ctx.restore();
  }
  ctx.restore();
  // Tracers.
  for (const t of fx.tracers) {
    ctx.strokeStyle = 'rgba(255,220,120,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(t.x1, t.y1);
    ctx.lineTo(t.x2, t.y2);
    ctx.stroke();
  }
  // Particles.
  for (const p of fx.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // Floaters.
  ctx.font = 'bold 16px Arial, sans-serif';
  ctx.textAlign = 'center';
  for (const f of fx.floaters) {
    ctx.globalAlpha = Math.min(1, f.life);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}
