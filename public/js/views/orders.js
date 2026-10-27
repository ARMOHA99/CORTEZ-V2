import { get, patch } from '../core/api.js';
import { state, can } from '../core/state.js';
import { esc, num, timeAgo, pageHeader, statusBadge, emptyState, toast, promptDialog } from '../core/ui.js';
import * as sound from '../core/sound.js';

export const meta = { title: 'الطلبات', kicker: 'ORDERS' };

let scope = 'mine';   // mine | all | external | internal
let status = '';

export async function render(root) {
  root.innerHTML = '<div class="view-loading"><div class="loader-ring"></div></div>';
  const staff = can('orders:view') || can('orders:manage');
  const manage = can('orders:manage');
  if (!staff) scope = 'mine';
  try {
    const params = new URLSearchParams({ limit: '60' });
    if (scope !== 'mine') params.set('all', '1');
    if (scope === 'external' || scope === 'internal') params.set('type', scope);
    if (status) params.set('status', status);
    const data = await get('/api/orders?' + params.toString());
    const label = state.config?.system?.currencyLabel || 'دولار';

    const tab = (id, text) => `<button class="adm-tab ${scope === id ? 'active' : ''}" data-scope="${id}" type="button">${text}</button>`;
    const stat = (id, text) => `<button class="adm-tab ${status === id ? 'active' : ''}" data-status="${id}" type="button">${text}</button>`;

    root.innerHTML = `
      ${pageHeader({ kicker: staff ? 'ORDERS DESK' : 'MY ORDERS', title: staff ? 'إدارة الطلبات' : 'طلباتي', description: staff ? 'طلبات المتجر الخارجي والداخلي: اقبلها وأنجزها من هنا.' : 'تابع حالة طلباتك هنا.' })}
      ${staff ? `<div class="adm-tabs">${tab('all', 'الكل')}${tab('external', 'المتجر الخارجي')}${tab('internal', 'المتجر الداخلي')}${tab('mine', 'طلباتي')}</div>` : ''}
      <div class="adm-tabs">${stat('', 'كل الحالات')}${stat('pending', 'قيد الانتظار')}${stat('accepted', 'مقبولة')}${stat('completed', 'مكتملة')}${stat('cancelled', 'ملغاة')}</div>
      <div class="stack">
        ${(data.items || []).length ? data.items.map((o) => `
          <div class="order-card">
            <div class="order-head">
              <div><span class="code">${esc(o.code)}</span><span class="muted"> • ${timeAgo(o.createdAt)}</span></div>
              ${statusBadge(o.status)}
            </div>
            ${o.type === 'external' && o.customer ? `<div class="adm-note">الزبون: <strong>${esc(o.customer.name || '—')}</strong> • تواصل: ${esc(o.customer.contact || '—')}${o.customer.discord ? ' • ' + esc(o.customer.discord) : ''}</div>` : (o.userName ? `<div class="adm-note">العضو: <strong>${esc(o.userName)}</strong></div>` : '')}
            <div class="order-items">${(o.items || []).map((i) => `<span class="chip">${esc(i.name)} × ${i.qty}</span>`).join('')}</div>
            ${o.note ? `<div class="adm-note">ملاحظة الزبون: ${esc(o.note)}</div>` : ''}
            ${o.staffNote ? `<div class="adm-note">ملاحظة الإدارة: ${esc(o.staffNote)}</div>` : ''}
            <div class="row-between">
              <span class="muted">${o.type === 'internal' ? 'المتجر الداخلي' : 'المتجر الخارجي'}${o.handledByName ? ' • تولّاه: ' + esc(o.handledByName) : ''}</span>
              <strong>${num(o.total)} ${esc(label)}</strong>
            </div>
            ${manage && ['pending', 'accepted'].includes(o.status) && scope !== 'mine' ? `
              <div class="adm-actions" style="margin-top:8px">
                ${o.status === 'pending' ? `<button class="btn btn-primary btn-sm" data-act="accepted" data-id="${esc(o._id)}" type="button">قبول</button>` : ''}
                <button class="btn btn-primary btn-sm" data-act="completed" data-id="${esc(o._id)}" type="button">تم التسليم</button>
                <button class="btn btn-ghost btn-sm" data-act="cancelled" data-id="${esc(o._id)}" type="button">إلغاء</button>
              </div>` : ''}
          </div>`).join('') : emptyState('لا طلبات', 'لا توجد طلبات تطابق هذا الفلتر')}
      </div>`;

    root.querySelectorAll('[data-scope]').forEach((b) => b.addEventListener('click', () => { scope = b.dataset.scope; render(root); }));
    root.querySelectorAll('[data-status]').forEach((b) => b.addEventListener('click', () => { status = b.dataset.status; render(root); }));
    root.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', async () => {
      let note = '';
      if (b.dataset.act === 'cancelled') {
        note = await promptDialog({ title: 'إلغاء الطلب', label: 'سبب الإلغاء (يظهر للزبون)', placeholder: 'اكتب السبب…', confirmText: 'إلغاء الطلب' });
        if (note === null) return;
      }
      try {
        await patch(`/api/orders/${b.dataset.id}/status`, { status: b.dataset.act, note });
        sound.success(); toast('تم تحديث الطلب', 'success'); render(root);
      } catch (e) { sound.error(); toast(e.message, 'danger'); }
    }));
  } catch (e) {
    root.innerHTML = `<div class="card"><h3>خطأ</h3><p class="muted">${esc(e.message)}</p></div>`;
  }
}
