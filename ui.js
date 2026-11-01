/**
 * CORTEZ — أدوات الواجهة المشتركة
 */
import { state, timezone, currency } from './state.js';

export function esc(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function attr(value) {
  return esc(value).replace(/`/g, '&#96;');
}

export function nl2br(value) {
  return esc(value).replace(/\n/g, '<br />');
}

export function cls(...values) {
  return values.filter(Boolean).join(' ');
}

const numberFormatter = new Intl.NumberFormat('en-US');
const dateFormatter = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  day: '2-digit',
  month: 'short',
  year: 'numeric'
});
const dateTimeFormatter = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
});
const timeFormatter = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
});

export function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? numberFormatter.format(Math.round(n)) : '0';
}

export function money(value, withCurrency = true) {
  const label = currency();
  return `${num(value)}${withCurrency ? ` <small>${esc(label)}</small>` : ''}`;
}

export function moneyText(value) {
  return `${num(value)} ${currency()}`;
}

export function hours(minutes, decimals = 1) {
  const value = Number(minutes) || 0;
  const result = Math.round((value / 60) * Math.pow(10, decimals)) / Math.pow(10, decimals);
  return numberFormatter.format(result);
}

export function duration(minutes) {
  const total = Math.max(0, Math.round(Number(minutes) || 0));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h <= 0) return `${m} د`;
  return `${h} س ${m} د`;
}

export function clock(minutes) {
  const total = Math.max(0, Math.round(Number(minutes) || 0));
  const h = String(Math.floor(total / 60)).padStart(2, '0');
  const m = String(total % 60).padStart(2, '0');
  return `${h}:${m}`;
}

export function date(value, withTime = false) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  try {
    return withTime ? dateTimeFormatter.format(d) : dateFormatter.format(d);
  } catch (error) {
    return d.toLocaleDateString('ar');
  }
}

export function time(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  try {
    return timeFormatter.format(d);
  } catch (error) {
    return d.toLocaleTimeString('ar');
  }
}

export function dateTime(value) {
  return `${date(value)} — ${time(value)}`;
}

export function timeAgo(value) {
  if (!value) return '—';
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '—';
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 45) return 'الآن';
  if (seconds < 3600) return `قبل ${Math.round(seconds / 60)} دقيقة`;
  if (seconds < 86400) return `قبل ${Math.round(seconds / 3600)} ساعة`;
  if (seconds < 604800) return `قبل ${Math.round(seconds / 86400)} يوم`;
  return date(value);
}

export function weekdayName(dayKey) {
  if (!dayKey) return '';
  const [y, m, d] = String(dayKey).split('-').map(Number);
  const dateObj = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat('ar-EG', { weekday: 'long' }).format(dateObj);
}

export function shortDate(dayKey) {
  if (!dayKey) return '';
  const [, m, d] = String(dayKey).split('-');
  return `${d}/${m}`;
}

export function addDays(dayKey, days) {
  const [y, m, d] = String(dayKey).split('-').map(Number);
  const dateObj = new Date(Date.UTC(y, m - 1, d));
  dateObj.setUTCDate(dateObj.getUTCDate() + days);
  return `${dateObj.getUTCFullYear()}-${String(dateObj.getUTCMonth() + 1).padStart(2, '0')}-${String(
    dateObj.getUTCDate()
  ).padStart(2, '0')}`;
}

export function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(
    2,
    '0'
  )}`;
}

export function avatarUrl(user) {
  if (!user) return '';
  if (user.avatarUrl) return user.avatarUrl;
  if (user.avatar && user.discordId) {
    const ext = String(user.avatar).startsWith('a_') ? 'gif' : 'png';
    return `https://cdn.discordapp.com/avatars/${user.discordId}/${user.avatar}.${ext}?size=128`;
  }
  return '';
}

export function initial(user) {
  const name = (user && (user.displayName || user.name || user.username)) || 'ك';
  return esc(String(name).trim().charAt(0) || 'ك');
}

export function avatar(user, size = '') {
  const url = avatarUrl(user);
  const style = size ? ` style="width:${size}px;height:${size}px"` : '';
  const inner = url
    ? `<img src="${attr(url)}" alt="" loading="lazy" />`
    : `<span>${initial(user)}</span>`;
  return `<span class="avatar"${style}>${inner}</span>`;
}

export function userCell(user, subtitle = '') {
  if (!user) return '<span class="muted">—</span>';
  const name = user.displayName || user.name || user.username || 'عضو';
  const sub = subtitle || user.rankName || '';
  return `<div class="user-cell">${avatar(user)}<div><strong>${esc(name)}</strong>${
    sub ? `<small>${esc(sub)}</small>` : ''
  }</div></div>`;
}

export function rankPill(rankName, color) {
  if (!rankName) return '';
  return `<span class="rank-pill" style="color:${attr(color || '#e63946')}">${esc(rankName)}</span>`;
}

export function badge(text, tone = '') {
  return `<span class="badge ${tone}">${esc(text)}</span>`;
}

export function statusBadge(status) {
  const map = {
    on: ['على الدوام', 'success'],
    break: ['استراحة', 'warning'],
    off: ['خارج الدوام', ''],
    pending: ['قيد الانتظار', 'warning'],
    accepted: ['مقبول', 'info'],
    completed: ['مكتمل', 'success'],
    cancelled: ['ملغى', 'danger'],
    approved: ['مقبول', 'success'],
    rejected: ['مرفوض', 'danger'],
    revoked: ['ملغى', 'danger'],
    open: ['مفتوح', 'success'],
    closed: ['مغلق', ''],
    vetoed: ['منقوض', 'danger'],
    active: ['نشط', 'success'],
    win: ['فوز', 'success'],
    loss: ['خسارة', 'danger'],
    income: ['إيداع', 'success'],
    expense: ['سحب', 'danger'],
    note: ['ملاحظة', 'info'],
    warning: ['تحذير', 'warning'],
    fine: ['غرامة', 'danger'],
    leave: ['إجازة', 'info'],
    promotion: ['ترقية', 'primary'],
    complaint: ['شكوى', 'warning']
  };
  const entry = map[status] || [status || '—', ''];
  return badge(entry[0], entry[1]);
}

export function kpi({ label, value, foot = '', icon = '◆', primary = false, valueHtml = '' }) {
  return `<div class="kpi ${primary ? 'primary' : ''}">
    <div class="kpi-label"><span class="ico">${esc(icon)}</span>${esc(label)}</div>
    <div class="kpi-value">${valueHtml || esc(value)}</div>
    ${foot ? `<div class="kpi-foot">${foot}</div>` : ''}
  </div>`;
}

export function emptyState(title, message = '', icon = '◇') {
  return `<div class="empty"><div class="em-ico">${esc(icon)}</div><strong>${esc(title)}</strong>${
    message ? `<p>${esc(message)}</p>` : ''
  }</div>`;
}

export function skeletonCards(count = 3, height = 120) {
  return `<div class="grid grid-3">${Array.from(
    { length: count },
    () => `<div class="skeleton" style="height:${height}px"></div>`
  ).join('')}</div>`;
}

export function skeletonTable(rows = 5) {
  return `<div class="card"><div class="skeleton skel-title"></div>${Array.from(
    { length: rows },
    () => '<div class="skeleton skel-line"></div>'
  ).join('')}</div>`;
}

export function debounce(fn, wait = 300) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

export function formData(form) {
  const data = {};
  for (const element of form.elements) {
    if (!element.name || element.disabled) continue;
    if (element.type === 'checkbox') {
      data[element.name] = element.checked;
    } else if (element.type === 'radio') {
      if (element.checked) data[element.name] = element.value;
    } else if (element.multiple) {
      data[element.name] = Array.from(element.selectedOptions).map((option) => option.value);
    } else {
      data[element.name] = element.value;
    }
  }
  return data;
}

/* ═══════════════════════════ Toasts ═══════════════════════════ */

export function toast(message, type = 'info', title = '') {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icons = { success: '✓', danger: '✕', warning: '!', info: 'i' };
  el.innerHTML = `<div class="t-ico">${icons[type] || 'i'}</div>
    <div class="t-copy">${title ? `<strong>${esc(title)}</strong>` : ''}<p>${esc(message)}</p></div>
    <button class="t-close" type="button" aria-label="إغلاق">✕</button>`;
  el.querySelector('.t-close').addEventListener('click', () => removeToast(el));
  root.appendChild(el);
  setTimeout(() => removeToast(el), type === 'danger' ? 7000 : 4500);
}

function removeToast(el) {
  if (!el || el.classList.contains('leaving')) return;
  el.classList.add('leaving');
  setTimeout(() => el.remove(), 320);
}

/* ═══════════════════════════ Modal ═══════════════════════════ */

let modalStack = 0;

export function openModal({ title = '', subtitle = '', body = '', size = '', footer = '', onMount, onClose } = {}) {
  const root = document.getElementById('modal-root');
  if (!root) return null;
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
  wrap.innerHTML = `<div class="modal-backdrop"></div>
    <div class="modal ${size}" role="dialog" aria-modal="true">
      <div class="modal-head">
        <div>${subtitle ? `<p class="eyebrow">${esc(subtitle)}</p>` : ''}<h3>${esc(title)}</h3></div>
        <button class="modal-close" type="button" aria-label="إغلاق">✕</button>
      </div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
    </div>`;
  root.appendChild(wrap);
  root.classList.add('open');
  document.body.classList.add('modal-open');
  modalStack += 1;

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    wrap.classList.add('closing');
    setTimeout(() => {
      wrap.remove();
      modalStack = Math.max(0, modalStack - 1);
      if (modalStack === 0) {
        root.classList.remove('open');
        document.body.classList.remove('modal-open');
      }
    }, 200);
    if (onClose) onClose();
  }

  wrap.querySelector('.modal-close').addEventListener('click', close);
  wrap.querySelector('.modal-backdrop').addEventListener('click', close);
  const api = { el: wrap, modal: wrap.querySelector('.modal'), bodyEl: wrap.querySelector('.modal-body'), close };
  if (onMount) onMount(api);
  const focusable = wrap.querySelector('input, select, textarea, button.btn-primary');
  if (focusable) setTimeout(() => focusable.focus(), 80);
  return api;
}

export function confirmDialog({ title = 'تأكيد', message = '', confirmText = 'تأكيد', cancelText = 'إلغاء', danger = false } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const modal = openModal({
      title,
      size: 'narrow',
      body: `<p class="muted" style="font-size:13px;line-height:1.9">${nl2br(message)}</p>`,
      footer: `<button class="btn btn-ghost" data-action="cancel" type="button">${esc(cancelText)}</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-action="ok" type="button">${esc(confirmText)}</button>`,
      onClose: () => {
        if (!settled) resolve(false);
      }
    });
    if (!modal) return resolve(false);
    modal.el.querySelector('[data-action="cancel"]').addEventListener('click', () => {
      settled = true;
      modal.close();
      resolve(false);
    });
    modal.el.querySelector('[data-action="ok"]').addEventListener('click', () => {
      settled = true;
      modal.close();
      resolve(true);
    });
  });
}

export function promptDialog({ title = 'إدخال', label = '', value = '', placeholder = '', confirmText = 'حفظ' } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const modal = openModal({
      title,
      size: 'narrow',
      body: `<div class="field"><label>${esc(label)}</label><input class="input" name="value" value="${attr(
        value
      )}" placeholder="${attr(placeholder)}" /></div>`,
      footer: `<button class="btn btn-ghost" data-action="cancel" type="button">إلغاء</button>
        <button class="btn btn-primary" data-action="ok" type="button">${esc(confirmText)}</button>`,
      onClose: () => {
        if (!settled) resolve(null);
      }
    });
    if (!modal) return resolve(null);
    const input = modal.el.querySelector('input[name="value"]');
    const submit = () => {
      settled = true;
      const result = input.value.trim();
      modal.close();
      resolve(result || null);
    };
    modal.el.querySelector('[data-action="cancel"]').addEventListener('click', () => {
      settled = true;
      modal.close();
      resolve(null);
    });
    modal.el.querySelector('[data-action="ok"]').addEventListener('click', submit);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        submit();
      }
    });
    setTimeout(() => input.focus(), 100);
  });
}

/* ═══════════════════════════ Effects ═══════════════════════════ */

export function countUp(root = document) {
  const elements = root.querySelectorAll('[data-count]');
  for (const el of elements) {
    if (el.dataset.counted === '1') continue;
    el.dataset.counted = '1';
    const target = Number(el.dataset.count) || 0;
    const suffix = el.dataset.suffix || '';
    const prefix = el.dataset.prefix || '';
    const start = performance.now();
    const durationMs = 900;
    const decimals = Number(el.dataset.decimals) || 0;
    const format = (value) =>
      prefix +
      Number(value).toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      }) +
      suffix;
    function frame(now) {
      const progress = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = format(target * eased);
      if (progress < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
}

export function installTilt(root = document) {
  const targets = root.querySelectorAll('.tilt');
  for (const target of targets) {
    if (target.dataset.tiltBound === '1') continue;
    target.dataset.tiltBound = '1';
    target.addEventListener('pointermove', (event) => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const rect = target.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      target.style.transform = `rotateY(${x * 9}deg) rotateX(${-y * 9}deg)`;
    });
    target.addEventListener('pointerleave', () => {
      target.style.transform = '';
    });
  }
}

export function progress(value, options = {}) {
  const percent = Math.max(0, Math.min(100, Number(value) || 0));
  const variant = options.thin ? 'thin' : options.thick ? 'thick' : '';
  return `<div class="progress ${variant}"><span data-progress="${percent}"></span></div>`;
}

export function animateProgress(root = document) {
  const bars = root.querySelectorAll('[data-progress]');
  for (const bar of bars) {
    const percent = bar.dataset.progress || '0';
    requestAnimationFrame(() => {
      bar.style.width = `${percent}%`;
    });
  }
}

export function pagination({ page = 1, pages = 1 } = {}) {
  if (pages <= 1) return '';
  return `<div class="pagination">
    <button type="button" data-page="${Math.max(1, page - 1)}" ${page <= 1 ? 'disabled' : ''}>السابق</button>
    <span class="muted tiny">صفحة ${page} من ${pages}</span>
    <button type="button" data-page="${Math.min(pages, page + 1)}" ${page >= pages ? 'disabled' : ''}>التالي</button>
  </div>`;
}

export function pageHeader({ kicker = 'CORTEZ', title = '', description = '', actions = '' }) {
  return `<div class="view-head">
    <div>
      <p class="eyebrow">${esc(kicker)}</p>
      <h1>${esc(title)}</h1>
      ${description ? `<p class="muted view-desc">${esc(description)}</p>` : ''}
    </div>
    ${actions ? `<div class="row view-actions">${actions}</div>` : ''}
  </div>`;
}

export function timeZoneLabel() {
  return state.config && state.config.system ? state.config.system.timezone : timezone();
}

export function safeImage(value, fallback = '') {
  if (!value) return fallback;
  const text = String(value);
  if (/^(https?:\/\/|\/uploads\/|data:image\/)/.test(text)) return text;
  return fallback;
}

export function lineItems(items = [], { priceLabel = true } = {}) {
  if (!Array.isArray(items) || !items.length) return '<span class="muted">لا أصناف</span>';
  return items
    .map(
      (item) =>
        `<span class="chip">${esc(item.name)} × ${num(item.qty)}${priceLabel && item.unitPrice !== undefined ? ` — ${moneyText(item.total || item.qty * item.unitPrice)}` : ''}</span>`
    )
    .join('');
}

export function guardElement(root, selector) {
  return root ? root.querySelector(selector) : null;
}

export function escapeId(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '');
}
