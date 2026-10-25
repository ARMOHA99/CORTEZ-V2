import { get } from '../core/api.js';
import { esc, pageHeader, emptyState } from '../core/ui.js';

export const meta = { title: 'جدول الحضور', kicker: 'ATTENDANCE' };

export async function render(root) {
  root.innerHTML = '<div class="view-loading"><div class="loader-ring"></div></div>';
  try {
    const data = await get('/api/duty/attendance');
    root.innerHTML = `
      ${pageHeader({ kicker: 'ATTENDANCE GRID', title: 'جدول الحضور الأسبوعي', description: `أسبوع ${esc(data.weekKey || '')}` })}
      <div class="card">
        <div class="card-body" style="overflow-x:auto">
          <table class="table attendance-table">
            <thead>
              <tr>
                <th>العضو</th>
                ${(data.weekDays||[]).map(d => `<th><div class="day-head"><strong>${d.slice(8)}</strong><span>${d}</span></div></th>`).join('')}
                <th>المجموع</th>
              </tr>
            </thead>
            <tbody>
              ${(data.members||[]).length ? data.members.map(m => `
                <tr>
                  <td>
                    <div class="user-cell" data-member-id="${esc(String(m._id||''))}">
                      <div class="avatar"><span>${esc((m.name||'ك').charAt(0))}</span></div>
                      <div><strong>${esc(m.name)}</strong><small style="color:${esc(m.rankColor)}">${esc(m.rankName)}</small></div>
                    </div>
                  </td>
                  ${(m.cells||[]).map(c => `<td class="cell"><span class="att-cell ${c.present ? 'yes' : 'no'} ${m.dutyStatus==='on' && c.present ? 'live' : ''}">${c.present ? '✓' : '—'}</span></td>`).join('')}
                  <td><strong>${Math.floor((m.totalMinutes||0)/60)}س ${(m.totalMinutes||0)%60}د</strong></td>
                </tr>
              `).join('') : `<tr><td colspan="10">${emptyState('لا بيانات', '')}</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (e) {
    root.innerHTML = `<div class="card"><h3>خطأ</h3><p class="muted">${esc(e.message)}</p></div>`;
  }
}
