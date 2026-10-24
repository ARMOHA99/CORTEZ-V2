import { get } from '../core/api.js';
import { state } from '../core/state.js';
import { esc, num, pageHeader } from '../core/ui.js';

export const meta = { title: 'لوحة الإدارة', kicker: 'ADMIN' };

export async function render(root) {
  root.innerHTML = '<div class="view-loading"><div class="loader-ring"></div></div>';
  try {
    const data = await get('/api/admin/overview');
    root.innerHTML = `
      ${pageHeader({ kicker: 'ADMIN PANEL', title: 'لوحة الإدارة', description: 'إعدادات المنصة، الرتب، السجل، والمزيد.' })}
      <div class="grid grid-4">
        <div class="kpi"><div class="kpi-label">المستخدمين</div><div class="kpi-value">${num(data.stats?.users||0)}</div></div>
        <div class="kpi"><div class="kpi-label">متصل</div><div class="kpi-value">${num(data.stats?.online||0)}</div></div>
        <div class="kpi"><div class="kpi-label">الطلبات</div><div class="kpi-value">${num(data.stats?.orders||0)}</div></div>
        <div class="kpi primary"><div class="kpi-label">الإصدار</div><div class="kpi-value">${esc(data.stats?.release||'—')}</div></div>
      </div>
      <div class="card" style="margin-top:18px">
        <div class="card-head"><div><p class="eyebrow">SYSTEM</p><h3>معلومات النظام</h3></div></div>
        <div class="card-body">
          <div class="kv"><span>قاعدة البيانات</span><strong>${data.stats?.db==='connected'?'متصل':'غير متصل'}</strong></div>
          <div class="kv"><span>البيئة</span><strong>${data.stats?.env||'—'}</strong></div>
        </div>
      </div>
    `;
  } catch (e) {
    root.innerHTML = `<div class="card"><h3>خطأ</h3><p class="muted">${esc(e.message)}</p></div>`;
  }
}
