import { get } from '../core/api.js';
import { state } from '../core/state.js';
import { esc, money, num, hours, timeAgo, avatar, userCell, statusBadge, kpi, progress, animateProgress, pageHeader, emptyState, countUp, installTilt } from '../core/ui.js';

export const meta = { title: 'لوحة القيادة', kicker: 'CORTEZ' };

export async function render(root) {
  root.innerHTML = '<div class="view-loading"><div class="loader-ring"></div></div>';
  try {
    const data = await get('/api/dashboard');
    const user = state.user || {};
    const goal = data.goal || {};
    root.innerHTML = `
      ${pageHeader({ kicker: 'CORTEZ • OVERVIEW', title: 'لوحة القيادة', description: `مرحباً ${esc(user.displayName || 'بك')}، نظرة سريعة على نشاط العائلة اليوم.` })}
      
      <div class="hero-strip tilt">
        <div>
          <h1>أهلاً بك، ${esc(user.displayName || 'عضو')}</h1>
          <p class="muted">رتبتك: ${esc(state.rank ? state.rank.name : '—')} • الأسبوع ${esc(goal.weekKey || '')}</p>
        </div>
        <div class="duty-actions">
          <a href="#/duty" class="btn btn-primary">الذهاب للدوام</a>
          <a href="#/operations" class="btn btn-ghost">غرفة العمليات</a>
        </div>
      </div>
      
      <div class="grid grid-5" style="margin-top:18px">
        ${kpi({ label: 'الأعضاء', value: num(data.stats.members), icon: '◈' })}
        ${kpi({ label: 'متصل الآن', value: num(data.stats.online), icon: '●' })}
        ${kpi({ label: 'على الدوام', value: num(data.stats.onDuty), icon: '◉' })}
        ${kpi({ label: 'العمليات', value: num(data.stats.operations), icon: '⚔' })}
        ${kpi({ label: 'نسبة الفوز', value: data.stats.winRate + '%', icon: '★', primary: true })}
      </div>
      
      <div class="grid grid-3" style="margin-top:18px">
        <div class="card" style="grid-column:span 2">
          <div class="card-head">
            <div>
              <p class="eyebrow">WEEKLY GOAL</p>
              <h3>هدف الأسبوع</h3>
            </div>
            <div class="row">
              <span class="muted">${num(goal.current)} / ${num(goal.target)} ${esc(state.config?.system?.currencyLabel || 'دولار')}</span>
            </div>
          </div>
          <div class="card-body">
            ${progress(goal.percent)}
            <div class="row-between" style="margin-top:10px">
              <span class="muted">متبقي: ${num(goal.remaining)} ${esc(state.config?.system?.currencyLabel || 'دولار')}</span>
              <span class="muted">${goal.percent}%</span>
            </div>
          </div>
        </div>
        <div class="card">
          <div class="card-head">
            <div>
              <p class="eyebrow">MY DUTY</p>
              <h3>دوامي</h3>
            </div>
            <a href="#/duty" class="link-btn">عرض</a>
          </div>
          <div class="card-body stack">
            <div class="kv"><span>هذا الأسبوع</span><strong>${hours(data.myDuty.weeklyMinutes)} ساعة</strong></div>
            <div class="kv"><span>اليوم</span><strong>${hours(data.myDuty.todayMinutes)} ساعة</strong></div>
            <div class="kv"><span>الحالة</span><strong>${data.myDuty.status === 'on' ? 'على الدوام' : data.myDuty.status === 'break' ? 'استراحة' : 'خارج الدوام'}</strong></div>
          </div>
        </div>
      </div>
      
      <div class="grid grid-3" style="margin-top:18px">
        <div class="card" style="grid-column:span 2">
          <div class="card-head">
            <div>
              <p class="eyebrow">OPERATIONS</p>
              <h3>أحدث العمليات</h3>
            </div>
            <a href="#/operations" class="link-btn">الكل</a>
          </div>
          <div class="card-body stack">
            ${(data.recentOperations || []).length ? data.recentOperations.map(op => `
              <div class="op-item">
                <div class="op-result ${op.result}">${op.result === 'win' ? '✓' : '✕'}</div>
                <div class="op-copy">
                  <strong>${esc(op.title)}</strong>
                  <small>${esc(op.code)} • ${timeAgo(op.createdAt)}</small>
                </div>
                <div class="op-value">${op.result === 'win' ? '+' : '-'}${num(op.netValue)} ${esc(state.config?.system?.currencyLabel || 'دولار')}</div>
              </div>
            `).join('') : emptyState('لا عمليات بعد', 'لم تسجّل أي عمليات هذا الأسبوع')}
          </div>
        </div>
        <div class="card">
          <div class="card-head">
            <div>
              <p class="eyebrow">ANNOUNCEMENTS</p>
              <h3>إعلانات العائلة</h3>
            </div>
            <a href="#/announcements" class="link-btn">الكل</a>
          </div>
          <div class="card-body stack">
            ${(data.announcements || []).length ? data.announcements.map(a => `
              <div class="announcement ${a.severity}">
                <div class="a-head">
                  <strong>${esc(a.title)}</strong>
                  ${a.pinned ? '<span class="badge">مثبت</span>' : ''}
                </div>
                <p>${esc(a.body).substring(0, 100)}${a.body.length > 100 ? '...' : ''}</p>
                <time>${timeAgo(a.createdAt)}</time>
              </div>
            `).join('') : emptyState('لا إعلانات', '')}
          </div>
        </div>
      </div>
      
      ${(data.dutyNow || []).length ? `
      <div class="card" style="margin-top:18px">
        <div class="card-head">
          <div>
            <p class="eyebrow">ON DUTY NOW</p>
            <h3>على الدوام الآن</h3>
          </div>
          <span class="badge success">${data.dutyNow.length} متصل</span>
        </div>
        <div class="card-body">
          <div class="row" style="flex-wrap:wrap">
            ${data.dutyNow.map(d => `
              <div class="chip" style="border-color:${esc(d.rankColor || '#e63946')}">${esc(d.name)} • ${Math.floor(d.minutes/60)}س ${d.minutes%60}د</div>
            `).join('')}
          </div>
        </div>
      </div>
      ` : ''}
    `;
    animateProgress(root);
    countUp(root);
    installTilt(root);
  } catch (e) {
    root.innerHTML = `<div class="card"><h3>خطأ</h3><p class="muted">${esc(e.message)}</p></div>`;
  }
}
