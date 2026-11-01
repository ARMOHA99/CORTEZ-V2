import { get, post, patch, del } from '../core/api.js';
import { can } from '../core/state.js';
import { esc, num, moneyText, pageHeader, emptyState, openModal, confirmDialog, toast, debounce, badge } from '../core/ui.js';
import * as sound from '../core/sound.js';

export const meta = { title: 'غرفة الأيتمات', kicker: 'ITEMS' };

let search = '';

function openItemModal(item, categories, reload) {
  const editing = Boolean(item);
  const it = item || { name: '', category: 'عام', price: 0, note: '', active: true };
  const modal = openModal({
    title: editing ? `تعديل: ${it.name}` : 'أيتم جديد',
    subtitle: 'ITEM',
    body: `
      <form class="adm-form" id="item-form">
        <label>اسم الأيتم<input type="text" name="name" value="${esc(it.name)}" maxlength="120" required /></label>
        <label>الفئة<input type="text" name="category" list="item-cats" value="${esc(it.category || 'عام')}" maxlength="60" /></label>
        <datalist id="item-cats">${categories.map((c) => `<option value="${esc(c)}"></option>`).join('')}</datalist>
        <label>السعر للقطعة الواحدة<input type="number" name="price" min="0" step="1" value="${Number(it.price) || 0}" required /></label>
        <label>ملاحظة<input type="text" name="note" value="${esc(it.note || '')}" maxlength="300" /></label>
        <label class="adm-switch"><input type="checkbox" name="active" ${it.active !== false ? 'checked' : ''} /> مفعّل (يظهر في العمليات)</label>
        <div class="adm-actions"><button class="btn btn-primary" type="submit">${editing ? 'حفظ' : 'إضافة'}</button></div>
      </form>`
  });
  if (!modal) return;
  modal.el.querySelector('#item-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const f = event.target;
    const body = { name: f.name.value.trim(), category: f.category.value.trim() || 'عام', price: Number(f.price.value) || 0, note: f.note.value.trim(), active: f.active.checked };
    try {
      if (editing) await patch(`/api/items/${it._id}`, body); else await post('/api/items', body);
      sound.success(); toast('تم الحفظ', 'success'); modal.close(); reload();
    } catch (e) { sound.error(); toast(e.message, 'danger'); }
  });
}

export async function render(root) {
  root.innerHTML = '<div class="view-loading"><div class="loader-ring"></div></div>';
  try {
    const manage = can('items:manage');
    const data = await get('/api/items' + (manage ? '?all=1' : ''));
    const items = data.items || [];
    const categories = Array.from(new Set(items.map((i) => i.category || 'عام')));

    root.innerHTML = `
      ${pageHeader({
        kicker: 'ITEMS ROOM',
        title: 'غرفة الأيتمات',
        description: 'أسعار الأيتمات التي تُحسب بها الغنائم والمفقودات في العمليات. تغيير السعر هنا يغيّر حساب العمليات القادمة.',
        actions: manage ? '<button class="btn btn-primary" id="item-new" type="button">+ أيتم جديد</button>' : ''
      })}
      <div class="card" style="margin-bottom:14px"><div class="card-body">
        <input class="adm-input" id="item-search" type="text" placeholder="ابحث عن أيتم…" value="${esc(search)}" />
      </div></div>
      <div id="item-list"></div>`;

    const list = root.querySelector('#item-list');
    function draw() {
      const term = search.trim().toLowerCase();
      const shown = items.filter((i) => !term || i.name.toLowerCase().includes(term) || (i.category || '').toLowerCase().includes(term));
      if (!shown.length) { list.innerHTML = emptyState('لا أيتمات', manage ? 'اضغط «أيتم جديد» لإضافة أول أيتم وسعره' : 'لم يضف البزنس مانجر أيتمات بعد'); return; }
      const groups = {};
      shown.forEach((i) => { (groups[i.category || 'عام'] = groups[i.category || 'عام'] || []).push(i); });
      list.innerHTML = Object.entries(groups).map(([cat, rows]) => `
        <div class="card" style="margin-bottom:14px">
          <div class="card-head"><div><p class="eyebrow">${esc(cat)}</p><h3>${esc(cat)} (${rows.length})</h3></div></div>
          <div class="card-body" style="overflow-x:auto">
            <table class="table"><thead><tr><th>الأيتم</th><th>السعر</th><th>الحالة</th><th>آخر تعديل</th>${manage ? '<th></th>' : ''}</tr></thead><tbody>
              ${rows.map((i) => `<tr>
                <td><strong>${esc(i.name)}</strong>${i.note ? `<br><small class="muted">${esc(i.note)}</small>` : ''}</td>
                <td><strong>${esc(moneyText(i.price))}</strong></td>
                <td>${i.active === false ? badge('مخفي', 'danger') : badge('مفعّل', 'success')}</td>
                <td><small class="muted">${esc(i.updatedByName || '—')}</small></td>
                ${manage ? `<td><div class="adm-actions"><button class="btn btn-ghost btn-sm" data-edit="${esc(i._id)}" type="button">تعديل</button><button class="btn btn-ghost btn-sm" data-del="${esc(i._id)}" type="button">حذف</button></div></td>` : ''}
              </tr>`).join('')}
            </tbody></table>
          </div>
        </div>`).join('');
      list.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openItemModal(items.find((i) => i._id === b.dataset.edit), categories, () => render(root))));
      list.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
        const it = items.find((i) => i._id === b.dataset.del);
        if (!(await confirmDialog({ title: 'حذف الأيتم', message: `سيُحذف «${it.name}» من الكتالوج. العمليات القديمة لا تتأثر.`, confirmText: 'حذف', danger: true }))) return;
        try { await del(`/api/items/${it._id}`); toast('تم الحذف', 'success'); render(root); } catch (e) { toast(e.message, 'danger'); }
      }));
    }
    draw();
    root.querySelector('#item-search').addEventListener('input', debounce((e) => { search = e.target.value; draw(); }, 200));
    const newBtn = root.querySelector('#item-new');
    if (newBtn) newBtn.addEventListener('click', () => openItemModal(null, categories, () => render(root)));
  } catch (e) {
    root.innerHTML = `<div class="card"><h3>خطأ</h3><p class="muted">${esc(e.message)}</p></div>`;
  }
}
