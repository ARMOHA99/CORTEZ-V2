import { get } from '../core/api.js';
import { esc, pageHeader, emptyState } from '../core/ui.js';

export const meta = { title: 'عقد الدم', kicker: 'BLOOD PACT' };

export async function render(root) {
  root.innerHTML = '<div class="view-loading"><div class="loader-ring"></div></div>';
  try {
    const data = await get('/api/pacts');
    root.innerHTML = `
      ${pageHeader({ kicker: 'BLOOD PACT', title: 'عقد الدم', description: `إصدار ${esc('V'+(data.version||1))} • ${data.stats?.signed||0}/${data.stats?.total||0} موقع` })}
      <div class="grid grid-2">
        <div class="card">
          <div class="card-head"><div><p class="eyebrow">SIGNED</p><h3>الموقّعون</h3></div></div>
          <div class="card-body">
            ${(data.signatures||[]).map(s=>`
              <div class="kv"><span>${esc(s.displayName)}</span><strong>${esc(s.fingerprint||'')}</strong></div>
            `).join('')}
          </div>
        </div>
        <div class="card">
          <div class="card-head"><div><p class="eyebrow">PENDING</p><h3>لم يوقّعوا بعد</h3></div></div>
          <div class="card-body">
            ${(data.unsigned||[]).length ? data.unsigned.map(u=>`
              <div class="kv"><span>${esc(u.name)}</span><span class="muted">${esc(u.rankName)}</span></div>
            `).join('') : '<p class="muted">الجميع وقّعوا</p>'}
          </div>
        </div>
      </div>
    `;
  } catch (e) {
    root.innerHTML = `<div class="card"><h3>خطأ</h3><p class="muted">${esc(e.message)}</p></div>`;
  }
}
