import { get } from '../core/api.js';
import { esc, pageHeader, userCell, statusBadge } from '../core/ui.js';

export const meta = { title: 'سجل الأعضاء', kicker: 'MEMBERS' };

export async function render(root) {
  root.innerHTML = '<div class="view-loading"><div class="loader-ring"></div></div>';
  try {
    const data = await get('/api/members');
    root.innerHTML = `
      ${pageHeader({ kicker: 'FAMILY ROSTER', title: 'سجل الأعضاء', description: 'قائمة أفراد عائلة كورتاس.' })}
      <div class="card">
        <div class="card-body" style="overflow-x:auto">
          <table class="table">
            <thead><tr><th>العضو</th><th>الرتبة</th><th>الحالة</th><th>آخر ظهور</th></tr></thead>
            <tbody>
              ${(data.items||[]).map(m => `
                <tr>
                  <td>${userCell({displayName:m.displayName, avatar:m.avatar, discordId:m.discordId}, m.username)}</td>
                  <td><span class="rank-pill" style="color:${esc(m.rankColor)}">${esc(m.rankName)}</span></td>
                  <td>${m.duty && m.duty.status==='on' ? statusBadge('on') : statusBadge('off')}</td>
                  <td class="muted">${m.lastSeen ? new Date(m.lastSeen).toLocaleDateString('ar-SA') : '—'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (e) {
    root.innerHTML = `<div class="card"><h3>خطأ</h3><p class="muted">${esc(e.message)}</p></div>`;
  }
}
