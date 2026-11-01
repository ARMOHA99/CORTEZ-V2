import { get, post } from '../core/api.js';
import { state } from '../core/state.js';
import { esc, hours, pageHeader, toast } from '../core/ui.js';
import * as sound from '../core/sound.js';

export const meta = { title: 'الدوام', kicker: 'DUTY' };

let timer = null;
let summary = null;
let clockOffset = 0; // الفرق بين ساعة السيرفر وساعة جهازك
let base = null;

function pad(n) {
  return String(n).padStart(2, '0');
}

function shiftSeconds(shift, nowMs) {
  if (!shift) return 0;
  const start = Date.parse(shift.startAt);
  const breakMs = (shift.breakMinutes || 0) * 60000;
  if (shift.status === 'paused' && shift.breakStartedAt) {
    return Math.max(0, Math.floor((Date.parse(shift.breakStartedAt) - start - breakMs) / 1000));
  }
  return Math.max(0, Math.floor((nowMs - start - breakMs) / 1000));
}

function tick() {
  const timerEl = document.getElementById('duty-timer');
  if (!timerEl || !summary || !summary.shift) {
    if (timer) clearInterval(timer);
    timer = null;
    return;
  }
  const seconds = shiftSeconds(summary.shift, Date.now() + clockOffset);
  timerEl.textContent = `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor((seconds % 3600) / 60))}:${pad(seconds % 60)}`;

  const liveMinutes = seconds / 60;
  const set = (id, closed) => {
    const el = document.getElementById(id);
    if (el) el.textContent = hours(closed + liveMinutes);
  };
  set('k-week', base.week);
  set('k-today', base.today);
  set('k-total', base.total);
}

export async function render(root) {
  root.innerHTML = '<div class="view-loading"><div class="loader-ring"></div></div>';
  try {
    const data = await get('/api/duty/summary');
    summary = data.summary;
    clockOffset = data.serverTime ? Date.parse(data.serverTime) - Date.now() : 0;

    // الجزء المغلق من الساعات (بدون الدوام الجاري) — نضيف الجاري لحظيًا
    const liveAtFetch = summary.shift ? Number(summary.shift.liveMinutes) || 0 : 0;
    base = {
      week: Math.max(0, (summary.weeklyMinutes || 0) - liveAtFetch),
      today: Math.max(0, (summary.todayMinutes || 0) - liveAtFetch),
      total: Math.max(0, summary.totalMinutes || 0)
    };

    const attendanceOn = !state.config || state.config.attendanceEnabled !== false;
    const night = (state.config && state.config.nightShift) || {};
    const statusText = summary.status === 'on' ? 'أنت على الدوام' : summary.status === 'break' ? 'أنت في استراحة' : 'أنت خارج الدوام';

    root.innerHTML = `
      ${pageHeader({ kicker: 'DUTY MANAGEMENT', title: 'نظام الدوام', description: 'ابدأ دوامك، خذ استراحة، وأنهِه في الوقت المناسب.' })}

      ${attendanceOn ? '' : '<div class="card" style="margin-bottom:16px"><div class="card-body"><strong>تسجيل الحضور متوقف حالياً من الإدارة.</strong></div></div>'}

      <div class="grid grid-4">
        <div class="kpi"><div class="kpi-label">ساعات الأسبوع</div><div class="kpi-value" id="k-week">${hours(summary.weeklyMinutes)}</div></div>
        <div class="kpi"><div class="kpi-label">ساعات اليوم</div><div class="kpi-value" id="k-today">${hours(summary.todayMinutes)}</div></div>
        <div class="kpi"><div class="kpi-label">إجمالي الساعات</div><div class="kpi-value" id="k-total">${hours(summary.totalMinutes + liveAtFetch)}</div></div>
        <div class="kpi"><div class="kpi-label">خصومات الأسبوع</div><div class="kpi-value">${hours(summary.weeklyPenaltyMinutes)}</div></div>
      </div>

      <div class="card" style="margin-top:18px; text-align:center; padding:40px 20px">
        <p class="eyebrow">CURRENT STATUS</p>
        <h3 style="margin:6px 0 18px">${statusText}</h3>
        ${summary.shift ? '<div class="duty-timer" id="duty-timer">00:00:00</div><div class="duty-timer-label">مدة الدوام الحالي</div>' : '<p class="muted">لم تبدأ دوامك بعد</p>'}
        <div class="duty-buttons">
          ${summary.status === 'off' && attendanceOn ? '<button class="btn btn-primary" id="btn-start">بدء الدوام</button>' : ''}
          ${summary.status === 'on' ? '<button class="btn btn-ghost" id="btn-pause">استراحة</button><button class="btn btn-danger" id="btn-end">إنهاء الدوام</button>' : ''}
          ${summary.status === 'break' ? '<button class="btn btn-primary" id="btn-resume">استئناف الدوام</button><button class="btn btn-danger" id="btn-end">إنهاء الدوام</button>' : ''}
        </div>
      </div>

      <div class="grid grid-2" style="margin-top:18px">
        <div class="card">
          <div class="card-head"><div><p class="eyebrow">WEEKLY</p><h3>سجل الأسبوع</h3></div></div>
          <div class="card-body">
            <div class="mini-bar">
              ${(summary.days || []).map((d) => {
                const max = Math.max(...(summary.days || []).map((x) => x.minutes), 60);
                const height = Math.max(3, (d.minutes / max) * 60);
                return `<div class="bar ${d.minutes ? '' : 'zero'}" style="height:${height}px" title="${hours(d.minutes)}س"></div>`;
              }).join('')}
            </div>
            <div class="mini-bar-labels">
              ${(summary.days || []).map((d) => `<span>${esc(d.dateKey.slice(5))}</span>`).join('')}
            </div>
          </div>
        </div>
        <div class="card">
          <div class="card-head"><div><p class="eyebrow">INFO</p><h3>معلومات</h3></div></div>
          <div class="card-body stack">
            <div class="kv"><span>بداية الأسبوع</span><strong>${esc(summary.weekKey)}</strong></div>
            <div class="kv"><span>اليوم الحالي</span><strong>${esc(summary.dateKey)}</strong></div>
            <div class="kv"><span>نافذة الدوام الليلي</span><strong>${esc(night.start || '22:00')} - ${esc(night.end || '06:00')}</strong></div>
          </div>
        </div>
      </div>
    `;

    if (timer) clearInterval(timer);
    timer = null;
    if (summary.shift) {
      tick();
      if (summary.status === 'on') timer = setInterval(tick, 1000);
    }

    const act = (selector, path, soundFn) => {
      const btn = root.querySelector(selector);
      if (!btn) return;
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          await post(path);
          soundFn();
          render(root);
        } catch (error) {
          sound.error();
          toast(error.message, 'danger');
          btn.disabled = false;
        }
      });
    };
    act('#btn-start', '/api/duty/start', sound.success);
    act('#btn-pause', '/api/duty/pause', sound.click);
    act('#btn-resume', '/api/duty/resume', sound.click);
    act('#btn-end', '/api/duty/end', sound.success);
  } catch (error) {
    root.innerHTML = `<div class="card"><h3>خطأ</h3><p class="muted">${esc(error.message)}</p></div>`;
  }
}
