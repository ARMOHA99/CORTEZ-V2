import { get } from '../core/api.js';
import { esc, num, pageHeader, emptyState, kpi } from '../core/ui.js';

export const meta = { title: 'جدول الحضور', kicker: 'ATTENDANCE' };

let weekOverride = null;

function shiftWeek(key, days) {
  const [y, m, d] = String(key).split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

const DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

function dayName(key) {
  const [y, m, d] = String(key).split('-').map(Number);
  return DAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

export async function render(root) {
  root.innerHTML = '<div class="view-loading"><div class="loader-ring"></div></div>';
  try {
    const data = await get('/api/duty/attendance' + (weekOverride ? `?week=${encodeURIComponent(weekOverride)}` : ''));
    const days = data.weekDays || [];
    const today = data.today || '';
    const members = data.members || [];
    const stats = data.stats || { present: 0, absent: 0, rate: 0 };

    // عدد الحاضرين في كل يوم
    const perDay = days.map((_, i) => members.filter((m) => m.cells && m.cells[i] && m.cells[i].present).length);

    // "غائب" يُحسب فقط للأيام التي مضت (اليوم الحالي والأيام القادمة لا تُعد غيابًا)
    const cellHtml = (c, m) => {
      if (c.present) {
        const mins = c.minutes || 0;
        return `<td class="cell ${c.dateKey === today ? 'today-col' : ''}"><span class="att-cell yes ${m.dutyStatus === 'on' && c.dateKey === today ? 'live' : ''}" title="${Math.floor(mins / 60)}س ${mins % 60}د">✓</span></td>`;
      }
      if (c.dateKey > today) return `<td class="cell"><span class="att-cell future">·</span></td>`;
      if (c.dateKey === today) return `<td class="cell today-col"><span class="att-cell pending" title="لم يسجّل بعد">…</span></td>`;
      return `<td class="cell"><span class="att-cell no" title="لم يحضر">✗</span></td>`;
    };

    root.innerHTML = `
      ${pageHeader({ kicker: 'ATTENDANCE GRID', title: 'جدول الحضور الأسبوعي', description: `أسبوع ${esc(data.weekKey || '')} — من حضر ومن لم يحضر كل يوم.` })}
      <div class="adm-row" style="margin-bottom:14px">
        <button class="btn btn-ghost btn-sm" id="att-prev" type="button">→ الأسبوع السابق</button>
        <button class="btn btn-ghost btn-sm" id="att-now" type="button">الأسبوع الحالي</button>
        <button class="btn btn-ghost btn-sm" id="att-next" type="button">الأسبوع التالي ←</button>
      </div>
      <div class="grid grid-3" style="margin-bottom:16px">
        ${kpi({ label: 'حضور', value: num(stats.present), icon: '✓' })}
        ${kpi({ label: 'غياب (الأيام الماضية)', value: num(members.reduce((s, m) => s + (m.cells || []).filter((c) => !c.present && c.dateKey < today).length, 0)), icon: '✗' })}
        ${kpi({ label: 'عدد الأعضاء', value: num(members.length), icon: '◈', primary: true })}
      </div>
      <div class="card"><div class="card-body" style="overflow-x:auto">
        <table class="table attendance-table">
          <thead><tr>
            <th>العضو</th>
            ${days.map((d) => `<th class="${d === today ? 'today-col' : ''}"><div class="day-head"><strong>${esc(dayName(d))}</strong><span>${esc(d.slice(5))}</span></div></th>`).join('')}
            <th>الأيام</th><th>الساعات</th>
          </tr></thead>
          <tbody>
            ${members.length ? members.map((m) => `
              <tr>
                <td><div class="user-cell" data-member-id="${esc(String(m._id || ''))}">
                  <div class="avatar"><span>${esc((m.name || 'ك').charAt(0))}</span></div>
                  <div><strong>${esc(m.name)}</strong><small style="color:${esc(m.rankColor)}">${esc(m.rankName)}</small></div>
                </div></td>
                ${(m.cells || []).map((c) => cellHtml(c, m)).join('')}
                <td><strong>${m.presentDays || 0}/7</strong></td>
                <td><strong>${Math.floor((m.totalMinutes || 0) / 60)}س ${(m.totalMinutes || 0) % 60}د</strong></td>
              </tr>`).join('') : `<tr><td colspan="${days.length + 3}">${emptyState('لا أعضاء لعرضهم', 'يظهر هنا كل عضو يملك رتبة غير «زائر»')}</td></tr>`}
          </tbody>
          ${members.length ? `<tfoot><tr><td><strong>الحاضرون</strong></td>${perDay.map((n, i) => `<td class="cell ${days[i] === today ? 'today-col' : ''}"><strong>${n}</strong></td>`).join('')}<td></td><td></td></tr></tfoot>` : ''}
        </table>
      </div></div>
      <p class="adm-note" style="margin-top:10px">✓ حضر • ✗ لم يحضر • … اليوم لم ينتهِ بعد • · يوم قادم. يوم الدوام يتبع نافذة الدوام الليلي، لا منتصف الليل.</p>`;

    const go = (key) => { weekOverride = key; render(root); };
    root.querySelector('#att-prev').addEventListener('click', () => go(shiftWeek(data.weekKey, -7)));
    root.querySelector('#att-next').addEventListener('click', () => go(shiftWeek(data.weekKey, 7)));
    root.querySelector('#att-now').addEventListener('click', () => go(null));
  } catch (e) {
    root.innerHTML = `<div class="card"><h3>خطأ</h3><p class="muted">${esc(e.message)}</p></div>`;
  }
}
