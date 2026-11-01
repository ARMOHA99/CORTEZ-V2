/**
 * CORTEZ — شريط «الآن في الدوام» الحيّ
 * يقرأ /api/public/on-duty ويتحدّث عند أي حدث دوام من الـ socket.
 */

import { get } from './api.js';
import { state } from './state.js';
import { esc, duration } from './ui.js';

const REFRESH_MS = 45000;

let bar = null;
let data = { count: 0, items: [], member: false };
let timer = null;
let expanded = false;

function render() {
  if (!bar) return;
  const active = data.items.filter((item) => item.status === 'active');
  const paused = data.items.length - active.length;

  if (!data.count) {
    bar.classList.add('is-empty');
    bar.innerHTML = '<span class="od-dot"></span><span class="od-label">لا أحد في الدوام الآن</span>';
    return;
  }

  bar.classList.remove('is-empty');
  const names = data.items
    .slice(0, expanded ? 12 : 3)
    .map((item) => {
      const label = item.name || `عضو ${item.initial || ''}`.trim();
      const tone = item.status === 'paused' ? 'is-paused' : '';
      return `<span class="od-chip ${tone}" title="${esc(label)}">
        <span class="od-initial">${esc(item.initial || 'ع')}</span>
        <span class="od-name">${esc(label)}</span>
        <span class="od-time">${esc(duration(item.liveMinutes || 0))}</span>
      </span>`;
    })
    .join('');

  bar.innerHTML = `
    <span class="od-dot"></span>
    <button type="button" class="od-toggle" aria-expanded="${expanded ? 'true' : 'false'}">
      <strong>${data.count}</strong> في الدوام
      ${paused ? `<small>• ${paused} استراحة</small>` : ''}
    </button>
    <div class="od-list">${names}</div>
    ${data.items.length > 3 ? '<button type="button" class="od-more" aria-label="المزيد">⋯</button>' : ''}
  `;

  const toggle = bar.querySelector('.od-toggle');
  if (toggle) {
    toggle.addEventListener('click', () => {
      expanded = !expanded;
      render();
    });
  }
  const more = bar.querySelector('.od-more');
  if (more) {
    more.addEventListener('click', () => {
      expanded = true;
      render();
    });
  }
}

async function refresh() {
  try {
    const payload = await get('/api/public/on-duty');
    data = {
      count: Number(payload.count) || 0,
      items: Array.isArray(payload.items) ? payload.items : [],
      member: Boolean(payload.member)
    };
    render();
  } catch (error) {
    /* الشريط عنصر تجميلي: يفشل بهدوء */
  }
}

function schedule() {
  if (timer) clearInterval(timer);
  timer = setInterval(refresh, REFRESH_MS);
}

export function initOnDuty() {
  if (bar) return;
  if (state.route && state.route.startsWith('#/p/')) return;
  bar = document.createElement('div');
  bar.id = 'on-duty-bar';
  bar.className = 'on-duty-bar';
  bar.innerHTML = '<span class="od-dot"></span><span class="od-label">جارٍ التحقق…</span>';
  document.body.appendChild(bar);

  refresh();
  schedule();

  window.addEventListener('cortez:duty:live', () => refresh());
  window.addEventListener('cortez:refresh:dashboard', () => refresh());
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refresh();
  });
}
