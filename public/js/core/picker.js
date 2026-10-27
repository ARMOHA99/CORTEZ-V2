/**
 * CORTEZ — أداة اختيار حديثة: بحث ثم ضغطة واحدة للإضافة (بدون Ctrl)،
 * والمختار يظهر كشارات يمكن حذفها، ولكل أيتم عدّاد كمية (+ / −).
 */
import { esc, num } from './ui.js';

export function mountPicker(container, config) {
  const {
    options = [],
    selected = [],
    max = Infinity,
    withQty = false,
    placeholder = 'ابحث…',
    emptyText = 'لا نتائج',
    onChange = () => {}
  } = config;

  let items = selected.map((s) => ({ id: String(s.id), qty: Math.max(1, Number(s.qty) || 1) }));
  const byId = new Map(options.map((o) => [String(o.id), o]));

  container.classList.add('picker');
  container.innerHTML = `
    <div class="picker-selected" data-selected></div>
    <input class="adm-input picker-search" type="text" placeholder="${esc(placeholder)}" autocomplete="off" />
    <div class="picker-list hidden" data-list></div>`;
  const selectedEl = container.querySelector('[data-selected]');
  const input = container.querySelector('.picker-search');
  const list = container.querySelector('[data-list]');

  function emit() {
    onChange(items.map((i) => ({ id: i.id, qty: i.qty })));
  }

  function drawSelected() {
    if (!items.length) {
      selectedEl.innerHTML = '';
      return;
    }
    selectedEl.innerHTML = items.map((i, index) => {
      const o = byId.get(i.id) || { label: i.id };
      if (withQty) {
        return `<div class="picker-row">
          <div class="picker-row-name"><strong>${esc(o.label)}</strong>${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</div>
          <div class="picker-qty">
            <button type="button" class="picker-btn" data-dec="${index}" aria-label="إنقاص">−</button>
            <input type="number" min="1" value="${i.qty}" data-qty="${index}" />
            <button type="button" class="picker-btn" data-inc="${index}" aria-label="زيادة">+</button>
          </div>
          <button type="button" class="picker-x" data-del="${index}" aria-label="حذف">✕</button>
        </div>`;
      }
      return `<span class="picker-chip">${esc(o.label)}<button type="button" data-del="${index}" aria-label="حذف">✕</button></span>`;
    }).join('');

    selectedEl.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => {
      items.splice(Number(b.dataset.del), 1);
      drawSelected(); drawList(); emit();
    }));
    selectedEl.querySelectorAll('[data-inc]').forEach((b) => b.addEventListener('click', () => {
      items[Number(b.dataset.inc)].qty += 1; drawSelected(); emit();
    }));
    selectedEl.querySelectorAll('[data-dec]').forEach((b) => b.addEventListener('click', () => {
      const item = items[Number(b.dataset.dec)];
      item.qty = Math.max(1, item.qty - 1); drawSelected(); emit();
    }));
    selectedEl.querySelectorAll('[data-qty]').forEach((el) => el.addEventListener('input', () => {
      items[Number(el.dataset.qty)].qty = Math.max(1, Math.round(Number(el.value) || 1)); emit();
    }));
  }

  function drawList() {
    const term = input.value.trim().toLowerCase();
    const taken = new Set(items.map((i) => i.id));
    const rows = options
      .filter((o) => (withQty || !taken.has(String(o.id))))
      .filter((o) => !term || String(o.label).toLowerCase().includes(term) || String(o.sub || '').toLowerCase().includes(term))
      .slice(0, 40);
    list.innerHTML = rows.length
      ? rows.map((o) => `<button type="button" class="picker-opt" data-add="${esc(String(o.id))}"><span>${esc(o.label)}</span>${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</button>`).join('')
      : `<div class="picker-empty">${esc(emptyText)}</div>`;
    list.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('mousedown', (event) => {
      event.preventDefault();
      add(b.dataset.add);
    }));
  }

  function add(id) {
    const existing = items.find((i) => i.id === String(id));
    if (existing) {
      if (withQty) existing.qty += 1;
    } else {
      if (max === 1) items = [];
      if (items.length >= max) return;
      items.push({ id: String(id), qty: 1 });
    }
    input.value = '';
    drawSelected(); emit();
    if (max === 1) hide(); else drawList();
  }

  function show() { drawList(); list.classList.remove('hidden'); }
  function hide() { list.classList.add('hidden'); }

  input.addEventListener('focus', show);
  input.addEventListener('input', show);
  input.addEventListener('blur', () => setTimeout(hide, 120));
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      const first = list.querySelector('[data-add]');
      if (first) add(first.dataset.add);
    }
  });

  drawSelected();
  return {
    getSelected: () => items.map((i) => ({ id: i.id, qty: i.qty })),
    total: (priceOf) => items.reduce((sum, i) => sum + (Number(priceOf(i.id)) || 0) * i.qty, 0)
  };
}
