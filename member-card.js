/**
 * CORTEZ — بطاقة العضو + سجل حضوره (نافذة)
 */
import { get } from './api.js';
import { esc, openModal, avatarUrl, duration, dateTime, weekdayName, shortDate } from './ui.js';

const LOADER = '<div class="view-loading"><div class="loader-ring"></div></div>';

function stat(label, value) {
  return `<div class="mc-stat"><strong>${esc(String(value))}</strong><span>${esc(label)}</span></div>`;
}

function buildCard(card, report) {
  const user = card.user || {};
  const rank = card.rank || {};
  const duty = card.duty || {};
  const ops = card.operations || {};
  const disc = card.discipline || {};
  const url = avatarUrl(user);
  const summary = report && report.summary ? report.summary : null;

  const avatarHtml = url
    ? `<img class="mc-avatar" src="${esc(url)}" alt="" />`
    : `<div class="mc-avatar" style="display:grid;place-items:center;font-size:26px">${esc(String(user.name || 'ك').charAt(0))}</div>`;

  const daysHtml = summary && Array.isArray(summary.days) && summary.days.length
    ? `<div class="mc-days">${summary.days.map((day) => {
        const present = (day.minutes || 0) > 0;
        return `<div class="mc-day ${present ? 'on' : ''}"><span>${esc(weekdayName(day.dateKey))}</span><strong>${present ? '✓' : '—'}</strong><span>${esc(shortDate(day.dateKey))}</span></div>`;
      }).join('')}</div>`
    : '';

  const shifts = report && Array.isArray(report.shifts) ? report.shifts.slice(0, 15) : [];
  const shiftsHtml = shifts.length
    ? `<div style="overflow-x:auto"><table class="table"><thead><tr><th>اليوم</th><th>الدخول</th><th>الخروج</th><th>المدة</th><th>النوع</th></tr></thead><tbody>${shifts.map((shift) => {
        const isPenalty = shift.kind === 'penalty';
        const minutes = isPenalty ? shift.penaltyMinutes : (shift.liveMinutes != null ? shift.liveMinutes : shift.totalMinutes);
        return `<tr>
          <td>${esc(shift.dateKey || '')}</td>
          <td>${shift.startAt ? esc(dateTime(shift.startAt)) : '—'}</td>
          <td>${shift.endAt ? esc(dateTime(shift.endAt)) : (isPenalty ? '—' : 'جارٍ الآن')}</td>
          <td>${isPenalty ? '−' : ''}${esc(duration(minutes || 0))}</td>
          <td>${isPenalty ? 'خصم' : (shift.autoClosed ? 'إغلاق تلقائي' : 'دوام')}</td>
        </tr>`;
      }).join('')}</tbody></table></div>`
    : '<p class="muted">لا توجد سجلات دوام بعد.</p>';

  return `
    <div class="mc-head">
      ${avatarHtml}
      <div>
        <h3 style="margin:0">${esc(user.name || 'عضو')}</h3>
        <p class="muted" style="margin:4px 0 0;color:${esc(rank.color || '#9b9296')}">${esc(rank.icon || '')} ${esc(rank.name || 'زائر')}</p>
        <small class="muted">${user.joinedAt ? 'انضم: ' + esc(dateTime(user.joinedAt)) : ''}${user.lastLogin ? ' • آخر دخول: ' + esc(dateTime(user.lastLogin)) : ''}</small>
      </div>
    </div>

    <div class="mc-stats">
      ${stat('ساعات الأسبوع', duration(duty.weeklyMinutes || 0))}
      ${stat('ساعات اليوم', duration(duty.todayMinutes || 0))}
      ${stat('ساعات الشهر', duration(duty.monthlyMinutes || 0))}
      ${stat('الإجمالي', duration(duty.totalMinutes || 0))}
      ${stat('أيام الحضور', duty.presentDays || 0)}
      ${stat('خصومات الأسبوع', duration(duty.weeklyPenaltyMinutes || 0))}
      ${stat('العمليات', ops.total || 0)}
      ${stat('نسبة الفوز', (ops.winRate || 0) + '%')}
      ${stat('التحذيرات', disc.warnings || 0)}
      ${stat('الغرامات', disc.finesCount || 0)}
    </div>

    <h4 style="margin:16px 0 6px">حضور هذا الأسبوع</h4>
    ${daysHtml || '<p class="muted">لا تتوفر تفاصيل الحضور.</p>'}

    <h4 style="margin:16px 0 6px">آخر سجلات الدوام</h4>
    ${shiftsHtml}
  `;
}

export async function openMemberCard(id) {
  if (!id) return;
  const modal = openModal({ title: 'بطاقة العضو', subtitle: 'MEMBER CARD', size: 'lg', body: LOADER });
  if (!modal) return;
  try {
    const [cardRes, reportRes] = await Promise.all([
      get(`/api/members/${encodeURIComponent(id)}/card`),
      get(`/api/duty/report/${encodeURIComponent(id)}`).catch(() => null)
    ]);
    modal.bodyEl.innerHTML = buildCard(cardRes.card || {}, reportRes);
  } catch (error) {
    modal.bodyEl.innerHTML = `<p class="muted">${esc(error.message || 'تعذّر فتح البطاقة')}</p>`;
  }
}
