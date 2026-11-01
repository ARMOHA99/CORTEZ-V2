/**
 * CORTEZ — لوحة الأوامر (Ctrl/Cmd + K)
 * تنقّل سريع لكل صفحة يملك العضو صلاحيتها، مع إجراءات فورية.
 */

import { can, state } from './state.js';
import { esc } from './ui.js';
import { openMemberCard } from './member-card.js';

const ROUTES = [
  { hash: '#/dashboard', label: 'الداشبورد', hint: 'نبض المنظمة', glyph: '▦', perm: 'dashboard:view' },
  { hash: '#/duty', label: 'دوامي', hint: 'بدء أو إنهاء الدوام', glyph: '◷' },
  { hash: '#/attendance', label: 'كشف الحضور', hint: 'ساعات الأسبوع', glyph: '▤', perm: 'attendance:view' },
  { hash: '#/operations', label: 'العمليات', hint: 'سجل العمليات والانتصارات', glyph: '⚔', perm: 'operations:view' },
  { hash: '#/treasury', label: 'الخزينة', hint: 'الدخل والمصروف', glyph: '◈', perm: 'treasury:view' },
  { hash: '#/items', label: 'المخزون', hint: 'المواد والأسلحة', glyph: '❖', perm: 'items:view' },
  { hash: '#/shop', label: 'المتجر', hint: 'المنتجات والطلبات', glyph: '⌂', perm: 'store:view' },
  { hash: '#/orders', label: 'الطلبات', hint: 'متابعة طلبات المتجر', glyph: '☰', perm: 'orders:view' },
  { hash: '#/members', label: 'الأعضاء', hint: 'قائمة العائلة', glyph: '☷', perm: 'members:view' },
  { hash: '#/leaderboard', label: 'المتصدّرون', hint: 'ترتيب الساعات', glyph: '♛', perm: 'leaderboard:view' },
  { hash: '#/votes', label: 'التصويتات', hint: 'قرارات العائلة', glyph: '✷', perm: 'votes:view' },
  { hash: '#/tickets', label: 'التذاكر', hint: 'طلبات الدعم', glyph: '✉', perm: 'tickets:view' },
  { hash: '#/discipline', label: 'الانضباط', hint: 'التحذيرات والغرامات', glyph: '⚠', perm: 'discipline:view' },
  { hash: '#/announcements', label: 'الإعلانات', hint: 'بيانات القيادة', glyph: '◉' },
  { hash: '#/pacts', label: 'عقود الدم', hint: 'الولاء الموقّع', glyph: '✍', perm: 'pacts:view' },
  { hash: '#/profile', label: 'ملفي الشخصي', hint: 'بطاقتي وأوسمتي', glyph: '◐' },
  { hash: '#/admin', label: 'الإدارة', hint: 'إعدادات المنظمة', glyph: '⚙', perm: 'system:admin' }
];

let overlay = null;
let input = null;
let listEl = null;
let items = [];
let active = 0;

function actions() {
  const extra = [
    {
      key: 'card',
      label: 'افتح بطاقتي',
      hint: 'بطاقة العضو ثلاثية الأبعاد',
      glyph: '◈',
      run: () => {
        const id = state.user && state.user._id ? state.user._id : '';
        if (id) openMemberCard(id);
      }
    },
    {
      key: 'top',
      label: 'أعلى الصفحة',
      hint: 'تمرير سريع للأعلى',
      glyph: '↑',
      run: () => window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  ];
  const routes = ROUTES.filter((route) => !route.perm || can(route.perm)).map((route) => ({
    ...route,
    key: route.hash,
    run: () => {
      location.hash = route.hash;
    }
  }));
  return [...routes, ...extra];
}

function score(item, query) {
  if (!query) return item.key.startsWith('#/') ? 1 : 0;
  const haystack = `${item.label} ${item.hint || ''} ${item.key}`.toLowerCase();
  const needle = query.toLowerCase().trim();
  if (!needle) return 1;
  if (haystack.includes(needle)) return 100 - haystack.indexOf(needle);
  /* تطابق حروف متفرقة: "دشم" تجد "الداشبورد" */
  let cursor = 0;
  for (const char of needle) {
    cursor = haystack.indexOf(char, cursor);
    if (cursor === -1) return 0;
    cursor += 1;
  }
  return 20;
}

function renderList() {
  if (!listEl) return;
  if (!items.length) {
    listEl.innerHTML = '<div class="cmdk-empty">لا نتائج مطابقة</div>';
    return;
  }
  listEl.innerHTML = items
    .map(
      (item, index) => `
      <button type="button" class="cmdk-item ${index === active ? 'is-active' : ''}" data-index="${index}">
        <span class="cmdk-glyph">${esc(item.glyph || '◆')}</span>
        <span class="cmdk-text">
          <strong>${esc(item.label)}</strong>
          <small>${esc(item.hint || '')}</small>
        </span>
        ${item.key.startsWith('#/') ? '<span class="cmdk-kind">صفحة</span>' : '<span class="cmdk-kind">إجراء</span>'}
      </button>`
    )
    .join('');
  const activeEl = listEl.querySelector('.is-active');
  if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
}

function filter() {
  const query = input ? input.value : '';
  items = actions()
    .map((item) => ({ item, points: score(item, query) }))
    .filter((entry) => entry.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, 9)
    .map((entry) => entry.item);
  active = 0;
  renderList();
}

function close() {
  if (!overlay) return;
  overlay.classList.remove('is-open');
  document.documentElement.classList.remove('cmdk-lock');
}

function open() {
  if (!overlay) return;
  overlay.classList.add('is-open');
  document.documentElement.classList.add('cmdk-lock');
  if (input) {
    input.value = '';
    input.focus();
  }
  filter();
}

function trigger(index) {
  const item = items[index];
  if (!item) return;
  close();
  setTimeout(() => {
    try {
      item.run();
    } catch (error) {
      console.error('[Palette]', error);
    }
  }, 10);
}

function build() {
  overlay = document.createElement('div');
  overlay.className = 'cmdk';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'لوحة الأوامر');
  overlay.innerHTML = `
    <div class="cmdk-panel">
      <div class="cmdk-search">
        <span class="cmdk-icon" aria-hidden="true">⌘</span>
        <input id="cmdk-input" type="text" autocomplete="off" spellcheck="false"
               placeholder="اكتب اسم صفحة أو إجراء… ثم Enter" aria-label="بحث" />
        <kbd class="cmdk-esc">ESC</kbd>
      </div>
      <div class="cmdk-list" id="cmdk-list"></div>
      <div class="cmdk-foot">
        <span><kbd>↑</kbd><kbd>↓</kbd> تنقّل</span>
        <span><kbd>↵</kbd> فتح</span>
        <span>Ctrl / ⌘ + K</span>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  input = overlay.querySelector('#cmdk-input');
  listEl = overlay.querySelector('#cmdk-list');

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
    const item = event.target.closest('.cmdk-item');
    if (item) trigger(Number(item.dataset.index));
  });

  input.addEventListener('input', filter);
}

export function initPalette() {
  if (overlay) return;
  build();
  document.addEventListener('keydown', (event) => {
    const isCombo = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k';
    if (isCombo) {
      event.preventDefault();
      overlay.classList.contains('is-open') ? close() : open();
      return;
    }
    if (!overlay.classList.contains('is-open')) {
      if (event.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '')) {
        event.preventDefault();
        open();
      }
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      active = Math.min(items.length - 1, active + 1);
      renderList();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      active = Math.max(0, active - 1);
      renderList();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      trigger(active);
    }
  });
}
