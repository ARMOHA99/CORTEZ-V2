/**
 * CORTEZ — محرك الصوت (WebAudio) بدون أي ملفات خارجية
 */

let audioContext = null;
let master = null;
let muted = false;
let ambient = null;

const STORAGE_KEY = 'cortez.muted';

export function isMuted() {
  return muted;
}

function readPreference() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === null) return false;
    return stored === '1';
  } catch (error) {
    return false;
  }
}

function ensureContext() {
  if (muted) return null;
  if (!audioContext) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    try {
      audioContext = new Ctor();
      master = audioContext.createGain();
      master.gain.value = 0.85;
      master.connect(audioContext.destination);
    } catch (error) {
      return null;
    }
  }
  if (audioContext.state === 'suspended') audioContext.resume().catch(() => null);
  return audioContext;
}

function tone({ frequency = 220, duration = 0.12, type = 'sine', volume = 0.16, slideTo = null, delay = 0 }) {
  const ctx = ensureContext();
  if (!ctx) return;
  try {
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, frequency), start);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(start);
    osc.stop(start + duration + 0.04);
  } catch (error) {
    /* ignore */
  }
}

function noise({ duration = 0.18, volume = 0.12, delay = 0 } = {}) {
  const ctx = ensureContext();
  if (!ctx) return;
  try {
    const frames = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / frames) ** 2;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1700;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(ctx.currentTime + delay);
  } catch (error) {
    /* ignore */
  }
}

export function click() {
  tone({ frequency: 660, duration: 0.055, type: 'triangle', volume: 0.1 });
  tone({ frequency: 990, duration: 0.04, type: 'sine', volume: 0.04, delay: 0.02 });
}

export function hover() {
  tone({ frequency: 480, duration: 0.035, type: 'sine', volume: 0.03 });
}

export function success() {
  tone({ frequency: 523.25, duration: 0.14, type: 'sine', volume: 0.14 });
  tone({ frequency: 659.25, duration: 0.16, type: 'sine', volume: 0.13, delay: 0.1 });
  tone({ frequency: 783.99, duration: 0.22, type: 'sine', volume: 0.12, delay: 0.2 });
}

export function error() {
  tone({ frequency: 220, duration: 0.16, type: 'sawtooth', volume: 0.1 });
  tone({ frequency: 160, duration: 0.24, type: 'sawtooth', volume: 0.1, delay: 0.1 });
}

export function stamp() {
  noise({ duration: 0.24, volume: 0.22 });
  tone({ frequency: 92, duration: 0.28, type: 'sine', volume: 0.32, slideTo: 44 });
  tone({ frequency: 1400, duration: 0.04, type: 'square', volume: 0.06 });
}

export function notify() {
  tone({ frequency: 880, duration: 0.1, type: 'sine', volume: 0.1 });
  tone({ frequency: 1174.66, duration: 0.16, type: 'sine', volume: 0.08, delay: 0.09 });
}

/**
 * شحن مطوّل (لعقد الدم) — يعيد دالة إيقاف.
 */
export function charge(durationMs = 3000) {
  const ctx = ensureContext();
  if (!ctx) return { stop: () => {}, complete: () => {} };
  const start = ctx.currentTime;
  const seconds = Math.max(0.4, durationMs / 1000);
  let osc;
  let gain;
  try {
    osc = ctx.createOscillator();
    gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(70, start);
    osc.frequency.exponentialRampToValueAtTime(560, start + seconds);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(320, start);
    filter.frequency.exponentialRampToValueAtTime(2400, start + seconds);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.12, start + 0.2);
    gain.gain.setValueAtTime(0.12, start + Math.max(0.2, seconds - 0.25));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    osc.start(start);
    osc.stop(start + seconds + 0.05);
  } catch (error) {
    return { stop: () => {}, complete: () => {} };
  }

  let stopped = false;
  function stop() {
    if (stopped) return;
    stopped = true;
    try {
      const now = ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
      osc.stop(now + 0.1);
    } catch (error) {
      /* ignore */
    }
  }

  function complete() {
    if (stopped) return;
    stop();
    setTimeout(() => stamp(), 40);
  }

  return { stop, complete };
}

export function startAmbient() {
  if (muted || ambient) return;
  const ctx = ensureContext();
  if (!ctx) return;
  try {
    const oscA = ctx.createOscillator();
    const oscB = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    oscA.type = 'sine';
    oscB.type = 'sine';
    oscA.frequency.value = 55;
    oscB.frequency.value = 82.4;
    filter.type = 'lowpass';
    filter.frequency.value = 260;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.012, ctx.currentTime + 3);
    oscA.connect(filter);
    oscB.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    oscA.start();
    oscB.start();
    ambient = { oscA, oscB, gain };
  } catch (error) {
    ambient = null;
  }
}

export function stopAmbient() {
  if (!ambient) return;
  try {
    const ctx = audioContext;
    ambient.gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1);
    ambient.oscA.stop(ctx.currentTime + 1.1);
    ambient.oscB.stop(ctx.currentTime + 1.1);
  } catch (error) {
    /* ignore */
  }
  ambient = null;
}

export function setMuted(value) {
  muted = Boolean(value);
  try {
    localStorage.setItem(STORAGE_KEY, muted ? '1' : '0');
  } catch (error) {
    /* ignore */
  }
  if (muted) {
    stopAmbient();
    if (audioContext && audioContext.state === 'running') audioContext.suspend().catch(() => null);
  } else {
    ensureContext();
    startAmbient();
  }
  updateButton();
  return muted;
}

export function toggleMuted() {
  return setMuted(!muted);
}

function updateButton() {
  const button = document.getElementById('sound-fab');
  if (!button) return;
  button.classList.toggle('muted', muted);
  button.setAttribute('aria-label', muted ? 'تشغيل الصوت' : 'كتم الصوت');
  button.title = muted ? 'تشغيل الصوت' : 'كتم الصوت';
}

export function initSound() {
  muted = readPreference();
  updateButton();
  const fab = document.getElementById('sound-fab');
  if (fab) {
    fab.addEventListener('click', () => {
      setMuted(!muted);
      if (!muted) click();
    });
  }
  document.addEventListener(
    'pointerdown',
    (event) => {
      const target = event.target.closest('[data-sound], .btn, .tab, .chip, .side-link, a');
      if (!target) return;
      const kind = target.dataset.sound || 'click';
      if (kind === 'click') click();
    },
    { passive: true }
  );
  document.addEventListener(
    'pointerenter',
    (event) => {
      if (event.target.closest && event.target.closest('.btn, .product-card, .member-tile')) hover();
    },
    true
  );
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopAmbient();
    } else if (!muted) {
      startAmbient();
    }
  });
}
