import { get } from '../core/api.js';
import { esc, pageHeader, userCell, statusBadge, badge, debounce, emptyState } from '../core/ui.js';

export const meta = { title: 'سجل الأعضاء', kicker: 'MEMBERS' };

let search = '';
let page = 1;

export async function render(root) {
  root.innerHTML = `
    ${pageHeader({ kicker: 'FAMILY ROSTER', title: 'سجل الأعضاء', description: 'اضغط على اسم أي عضو لفتح بطاقته وسجل حضوره.' })}
    <div class="card" style="margin-bottom:14px">
      <div class="card-body adm-form">
        <input class="adm-input" id="mem-search" type="text" placeholder="ابحث باسم العضو…" value="${esc(search)}" />
      </div>
    </div>
    <div id="mem-list"><div class="view-loading"><div class="loader-ring"></div></div></div>
  `;

  const box = root.querySelector('#mem-list');

  async function load() {
    try {
      const params = new URLSearchParams({ page: String(page), limit: '25' });
      if (search) params.set('search', search);
      const data = await get('/api/members?' + params.toString());
      const items = data.items || [];
      box.innerHTML = `
        <div class="card">
          <div class="card-body" style="overflow-x:auto">
            ${items.length ? `
            <table class="table">
              <thead><tr><th>العضو</th><th>الرتبة</th><th>الحالة</th><th>آخر ظهور</th></tr></thead>
              <tbody>
                ${items.map((m) => `
                  <tr>
                    <td><div data-member-id="${esc(String(m._id))}">${userCell({ displayName: m.displayName, avatar: m.avatar, avatarUrl: m.avatarUrl, discordId: m.discordId }, m.username)}</div></td>
                    <td><span class="rank-pill" style="color:${esc(m.rankColor)}">${esc(m.rankIcon || '')} ${esc(m.rankName)}</span></td>
                    <td>${m.blocked ? badge('محظور', 'danger') : (m.duty && m.duty.status === 'on' ? statusBadge('on') : statusBadge('off'))}</td>
                    <td class="muted">${m.lastSeen ? new Date(m.lastSeen).toLocaleDateString('ar-SA') : '—'}</td>
                  </tr>`).join('')}
              </tbody>
            </table>` : emptyState('لا نتائج', 'جرّب اسمًا آخر')}
            ${data.pages > 1 ? `
              <div class="adm-row" style="justify-content:center;margin-top:14px">
                <button class="btn btn-ghost btn-sm" id="mem-prev" ${page <= 1 ? 'disabled' : ''}>السابق</button>
                <span class="muted">صفحة ${page} من ${data.pages}</span>
                <button class="btn btn-ghost btn-sm" id="mem-next" ${page >= data.pages ? 'disabled' : ''}>التالي</button>
              </div>` : ''}
          </div>
        </div>`;
      const prev = box.querySelector('#mem-prev');
      const next = box.querySelector('#mem-next');
      if (prev) prev.addEventListener('click', () => { page = Math.max(1, page - 1); load(); });
      if (next) next.addEventListener('click', () => { page += 1; load(); });
    } catch (error) {
      box.innerHTML = `<div class="card"><h3>خطأ</h3><p class="muted">${esc(error.message)}</p></div>`;
    }
  }

  root.querySelector('#mem-search').addEventListener('input', debounce((event) => {
    search = event.target.value.trim();
    page = 1;
    load();
  }, 300));

  load();
}
