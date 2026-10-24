import { get } from '../core/api.js';
import { state } from '../core/state.js';
import { esc, num, timeAgo, pageHeader, statusBadge, emptyState } from '../core/ui.js';

export const meta = { title: 'الطلبات', kicker: 'ORDERS' };

export async function render(root) {
  root.innerHTML = '<div class="view-loading"><div class="loader-ring"></div></div>';
  try {
    const data = await get('/api/orders');
    root.innerHTML = `
      ${pageHeader({ kicker: 'MY ORDERS', title: 'طلباتي', description: 'تابع حالة طلباتك هنا.' })}
      <div class="stack">
        ${(data.items||[]).length ? data.items.map(o => `
          <div class="order-card">
            <div class="order-head">
              <div>
                <span class="code">${esc(o.code)}</span>
                <span class="muted"> • ${timeAgo(o.createdAt)}</span>
              </div>
              ${statusBadge(o.status)}
            </div>
            <div class="order-items">
              ${(o.items||[]).map(i=>`<span class="chip">${esc(i.name)} × ${i.qty}</span>`).join('')}
            </div>
            <div class="row-between">
              <span class="muted">${o.type === 'internal' ? 'طلب داخلي' : 'طلب خارجي'}</span>
              <strong>${num(o.total)} ${esc(state.config?.system?.currencyLabel||'دولار')}</strong>
            </div>
          </div>
        `).join('') : emptyState('لا طلبات', 'اطلب من المتجر الداخلي أو الخارجي')}
      </div>
    `;
  } catch (e) {
    root.innerHTML = `<div class="card"><h3>خطأ</h3><p class="muted">${esc(e.message)}</p></div>`;
  }
}
