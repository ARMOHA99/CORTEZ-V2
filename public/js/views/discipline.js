import { get } from '../core/api.js';
import { state } from '../core/state.js';
import { esc, timeAgo, pageHeader, statusBadge, emptyState } from '../core/ui.js';

export const meta = { title: 'سجل الانضباط', kicker: 'DISCIPLINE' };

export async function render(root) {
  root.innerHTML = '<div class="view-loading"><div class="loader-ring"></div></div>';
  try {
    const data = await get('/api/discipline/mine');
    root.innerHTML = `
      ${pageHeader({ kicker: 'DISCIPLINE', title: 'سجل انضباطي', description: 'ملاحظات، تحذيرات، وغرامات.' })}
      <div class="card">
        <div class="card-body">
          ${(data.items||[]).length ? data.items.map(d => `
            <div class="disc-row">
              <div class="disc-ico ${d.type}">${d.type==='warning'?'⚠':d.type==='fine'?'$':'●'}</div>
              <div class="disc-copy">
                <strong>${d.type==='warning'?'تحذير':d.type==='fine'?'غرامة':'ملاحظة'}</strong>
                <p>${esc(d.reason)}</p>
                <small>${timeAgo(d.createdAt)} • بواسطة ${esc(d.issuedByName)} ${d.amount? ' • '+d.amount:''} ${d.status==='revoked'?' • ملغى':''}</small>
              </div>
              ${statusBadge(d.status)}
            </div>
          `).join('') : emptyState('لا سجلات', 'سجل نظيف')}
        </div>
      </div>
    `;
  } catch (e) {
    root.innerHTML = `<div class="card"><h3>خطأ</h3><p class="muted">${esc(e.message)}</p></div>`;
  }
}
