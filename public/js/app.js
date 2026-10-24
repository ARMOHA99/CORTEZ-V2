/**
 * CORTEZ — نقطة الدخول والتوجيه
 */
import { api, get, post, setCsrf } from './core/api.js';
import { state, applyMe, reset, emit } from './core/state.js';
import { toast, countUp, installTilt } from './core/ui.js';
import { initSound } from './core/sound.js';
import { initShell, renderNav, renderUserChip, setActiveNav } from './core/shell.js';
import { initSocket } from './core/socket.js';

const routes = {};
let currentView = null;
let bootDone = false;

export function registerRoute(hash, loader) {
  routes[hash] = loader;
}

export function navigate(hash) {
  if (!hash.startsWith('#')) hash = '#' + hash;
  if (location.hash === hash) {
    loadRoute(hash);
    return;
  }
  location.hash = hash;
}

function getHash() {
  return location.hash || '#/dashboard';
}

async function loadPublicConfig() {
  try {
    const data = await get('/api/public/config');
    state.config = data;
    if (data.csrfToken) setCsrf(data.csrfToken);
    const metaCsrf = document.querySelector('meta[name="csrf-token"]');
    if (metaCsrf && data.csrfToken) metaCsrf.content = data.csrfToken;
    const metaRel = document.querySelector('meta[name="release"]');
    if (metaRel && data.release) metaRel.content = data.release;
    state.release = data.release || '';
    applyPublic(data);
  } catch (error) {
    console.error('[App] public config:', error);
  }
}

function applyPublic(cfg) {
  const org = cfg.org || {};
  document.querySelectorAll('.org-name').forEach((el) => { el.textContent = org.name || 'كورتاس'; });
  const desc = document.getElementById('hero-desc');
  if (desc && org.description) desc.textContent = org.description;
  const motto = document.getElementById('landing-motto');
  if (motto && org.motto) motto.textContent = org.motto;
  const year = document.getElementById('landing-year');
  if (year) year.textContent = cfg.year || new Date().getFullYear();
  const invite = document.getElementById('discord-invite');
  if (invite && cfg.discord && cfg.discord.inviteUrl) invite.href = cfg.discord.inviteUrl;
  else if (invite && cfg.links && cfg.links.discordInvite) invite.href = cfg.links.discordInvite;
  const loginBtn = document.getElementById('login-btn');
  if (loginBtn && !cfg.discordConfigured) loginBtn.classList.add('disabled');
  // dev login
  const devWrap = document.getElementById('dev-login');
  const devBtns = document.getElementById('dev-login-btns');
  if (cfg.devLogin && devWrap && devBtns && !cfg.authenticated) {
    devWrap.classList.remove('hidden');
    const ranks = ['owner', 'operations', 'business', 'member', 'store', 'guest'];
    const labels = { owner: 'مالك', operations: 'عمليات', business: 'أعمال', member: 'عضو', store: 'متجر', guest: 'زائر' };
    devBtns.innerHTML = ranks.map((r) => `<button class="btn btn-ghost btn-sm" data-dev="${r}">${labels[r]}</button>`).join('');
    devBtns.querySelectorAll('[data-dev]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          const res = await post('/auth/dev', { rankKey: btn.dataset.dev });
          if (res && res.ok) window.location.href = res.redirect || '/#/dashboard';
        } catch (e) { toast(e.message, 'danger'); }
      });
    });
  }
  // landing stats
  loadLandingStats();
}

async function loadLandingStats() {
  try {
    const data = await get('/api/public/stats');
    document.querySelectorAll('[data-stat]').forEach((el) => {
      const key = el.dataset.stat;
      if (data[key] !== undefined) el.textContent = data[key];
    });
  } catch (e) { /* ignore */ }
}

function showLanding() {
  document.getElementById('boot-screen').classList.add('hidden');
  document.getElementById('app').classList.add('hidden');
  document.getElementById('pact-gate').classList.add('hidden');
  document.getElementById('landing').classList.remove('hidden');
}

function showApp() {
  document.getElementById('boot-screen').classList.add('hidden');
  document.getElementById('landing').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
}

function showPact() {
  document.getElementById('pact-gate').classList.remove('hidden');
}

function hidePact() {
  document.getElementById('pact-gate').classList.add('hidden');
}

async function initPact() {
  const gate = document.getElementById('pact-gate');
  const text = document.getElementById('pact-text');
  const title = document.getElementById('pact-title');
  const sub = document.getElementById('pact-subtitle');
  const ver = document.getElementById('pact-version');
  const hold = document.getElementById('pact-hold');
  const btn = document.getElementById('pact-sign-btn');
  const stamp = document.getElementById('pact-stamp');
  if (!gate || !hold) return;
  try {
    const data = await get('/api/me/pact');
    if (!data.required) { hidePact(); return; }
    if (data.pact) {
      if (title) title.textContent = data.pact.title || 'عقد الدم';
      if (sub) sub.textContent = data.pact.subtitle || '';
      if (ver) ver.textContent = 'V' + (data.pact.version || 1);
      if (text) text.textContent = data.pact.text || '';
    }
    showPact();
    let timer = null;
    let progress = 0;
    const fill = hold.querySelector('.fingerprint-fill');
    const duration = 3000;
    function start() {
      hold.classList.add('charging');
      progress = 0;
      const startTime = Date.now();
      timer = setInterval(() => {
        progress = Math.min(1, (Date.now() - startTime) / duration);
        if (fill) fill.style.transform = `scaleY(${progress})`;
        if (progress >= 1) {
          clearInterval(timer);
          timer = null;
          complete();
        }
      }, 16);
    }
    function stop() {
      if (timer) { clearInterval(timer); timer = null; }
      hold.classList.remove('charging');
      if (fill) fill.style.transform = 'scaleY(0)';
    }
    async function complete() {
      stop();
      hold.classList.add('signed');
      if (stamp) stamp.classList.add('show');
      try {
        const res = await post('/api/me/pact/sign', {});
        if (res && res.ok) {
          setTimeout(() => { hidePact(); showApp(); initApp(); }, 900);
        }
      } catch (e) {
        toast(e.message, 'danger');
        hold.classList.remove('signed');
        if (stamp) stamp.classList.remove('show');
      }
    }
    hold.addEventListener('pointerdown', (e) => { e.preventDefault(); start(); });
    hold.addEventListener('pointerup', stop);
    hold.addEventListener('pointerleave', stop);
    hold.addEventListener('pointercancel', stop);
  } catch (e) {
    hidePact();
  }
}

async function boot() {
  initSound();
  await loadPublicConfig();
  const params = new URLSearchParams(location.search);
  if (params.get('error')) {
    const err = document.getElementById('landing-error');
    if (err) { err.textContent = 'فشل تسجيل الدخول: ' + params.get('error'); err.classList.remove('hidden'); }
  }
  try {
    const me = await get('/api/me');
    applyMe(me);
    state.booted = true;
    showApp();
    initShell();
    await initPact();
    if (!state.pact || !state.pact.required) {
      initApp();
    }
    loadViews();
  } catch (e) {
    state.booted = true;
    showLanding();
  }
  setTimeout(() => document.getElementById('boot-screen').classList.add('hidden'), 400);
}

function initApp() {
  renderNav();
  renderUserChip();
  initSocket();
  window.addEventListener('hashchange', onHashChange);
  onHashChange();
}

function onHashChange() {
  const hash = getHash();
  state.route = hash;
  setActiveNav(hash);
  loadRoute(hash);
}

async function loadRoute(hash) {
  const viewEl = document.getElementById('view');
  if (!viewEl) return;
  viewEl.innerHTML = '<div class="view-loading"><div class="loader-ring"></div></div>';
  // simple routing
  const map = {
    '#/dashboard': () => import('./views/dashboard.js'),
    '#/duty': () => import('./views/duty.js'),
    '#/attendance': () => import('./views/attendance.js'),
    '#/operations': () => import('./views/operations.js'),
    '#/treasury': () => import('./views/treasury.js'),
    '#/store-internal': () => import('./views/store.js'),
    '#/orders': () => import('./views/orders.js'),
    '#/members': () => import('./views/members.js'),
    '#/leaderboard': () => import('./views/leaderboard.js'),
    '#/votes': () => import('./views/votes.js'),
    '#/tickets': () => import('./views/tickets.js'),
    '#/discipline': () => import('./views/discipline.js'),
    '#/pacts': () => import('./views/pacts.js'),
    '#/announcements': () => import('./views/announcements.js'),
    '#/admin': () => import('./views/admin.js'),
    '#/profile': () => import('./views/profile.js'),
    '#/shop': () => import('./views/public-shop.js'),
    '#/track': () => import('./views/public-track.js')
  };
  // public routes
  if (hash === '#/shop' || hash === '#/track') {
    document.getElementById('app').classList.add('hidden');
    document.getElementById('landing').classList.add('hidden');
    document.getElementById('public-root').classList.remove('hidden');
    const mod = await (map[hash] ? map[hash]() : Promise.resolve({ render: () => {} }));
    if (mod.render) mod.render(document.getElementById('public-root'));
    return;
  }
  document.getElementById('public-root').classList.add('hidden');
  if (!state.authenticated) {
    navigate('#/dashboard');
    return;
  }
  const loader = map[hash] || map['#/dashboard'];
  try {
    const mod = await loader();
    viewEl.innerHTML = '';
    if (mod.render) {
      mod.render(viewEl);
      setTimeout(() => { countUp(viewEl); installTilt(viewEl); }, 50);
    }
    const title = document.getElementById('page-title');
    const kicker = document.getElementById('page-kicker');
    if (mod.meta) { if (title) title.textContent = mod.meta.title || ''; if (kicker) kicker.textContent = mod.meta.kicker || 'CORTEZ'; }
  } catch (e) {
    viewEl.innerHTML = '<div class="card"><h3>خطأ</h3><p class="muted">' + e.message + '</p></div>';
  }
}

function loadViews() {
  // Preload common views
}

window.addEventListener('cortez:unauthorized', () => {
  reset();
  window.location.href = '/';
});

boot();
