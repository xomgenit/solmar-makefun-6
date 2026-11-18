// audio.js — WebAudio-synthesised sound only. No audio files, no network.
let ctx = null;
let engineOsc = null, engineGain = null;
let sirenOsc = null, sirenGain = null, sirenTimer = 0;

export function ensureAudio() {
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch { /* audio unavailable — game stays silent */ }
  return ctx;
}

function tone(freq, dur, type, vol, slideTo) {
  if (!ctx) return;
  try {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), ctx.currentTime + dur);
    g.gain.setValueAtTime(vol || 0.15, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + dur + 0.02);
  } catch { /* ignore */ }
}

function noise(dur, vol, freq) {
  if (!ctx) return;
  try {
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq || 1200;
    const g = ctx.createGain();
    g.gain.value = vol || 0.2;
    src.connect(f).connect(g).connect(ctx.destination);
    src.start();
  } catch { /* ignore */ }
}

export const sfx = {
  shoot() { noise(0.09, 0.22, 2400); tone(180, 0.08, 'square', 0.08, 60); },
  crash() { noise(0.18, 0.3, 700); tone(90, 0.15, 'sawtooth', 0.12, 40); },
  blip() { tone(880, 0.12, 'sine', 0.14); tone(1320, 0.1, 'sine', 0.1); },
  cash() { tone(1046, 0.1, 'sine', 0.15); setTimeout(() => tone(1568, 0.14, 'sine', 0.15), 90); },
  horn() { tone(370, 0.18, 'square', 0.1); tone(440, 0.18, 'square', 0.08); },
  wasted() { tone(220, 0.5, 'sawtooth', 0.15, 55); },
  click() { tone(660, 0.06, 'sine', 0.1); },
  heal() { tone(523, 0.12, 'sine', 0.12); setTimeout(() => tone(784, 0.16, 'sine', 0.12), 110); },
};

export function updateEngine(driving, speed01) {
  if (!ctx) return;
  try {
    if (driving) {
      if (!engineOsc) {
        engineOsc = ctx.createOscillator();
        engineGain = ctx.createGain();
        engineOsc.type = 'sawtooth';
        engineGain.gain.value = 0.045;
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass'; f.frequency.value = 500;
        engineOsc.connect(f).connect(engineGain).connect(ctx.destination);
        engineOsc.start();
      }
      engineOsc.frequency.setValueAtTime(55 + speed01 * 130, ctx.currentTime);
    } else if (engineOsc) {
      engineOsc.stop();
      engineOsc = null; engineGain = null;
    }
  } catch { /* ignore */ }
}

export function updateSiren(active) {
  if (!ctx) return;
  try {
    if (active) {
      if (!sirenOsc) {
        sirenOsc = ctx.createOscillator();
        sirenGain = ctx.createGain();
        sirenOsc.type = 'sine';
        sirenGain.gain.value = 0.03;
        sirenOsc.connect(sirenGain).connect(ctx.destination);
        sirenOsc.start();
      }
      sirenTimer += 1 / 60;
      sirenOsc.frequency.setValueAtTime(Math.floor(sirenTimer * 1.6) % 2 === 0 ? 750 : 950, ctx.currentTime);
    } else if (sirenOsc) {
      sirenOsc.stop();
      sirenOsc = null; sirenGain = null;
    }
  } catch { /* ignore */ }
}

export function stopAllLoops() {
  updateEngine(false, 0);
  updateSiren(false);
}
