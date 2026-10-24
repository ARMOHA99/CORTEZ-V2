import { get, post } from '../core/api.js';
import { state, on } from '../core/state.js';
import { esc, num, hours, duration, time, date, pageHeader, kpi, statusBadge, emptyState, countUp } from '../core/ui.js';
import * as sound from '../core/sound.js';

export const meta = { title: 'الدوام', kicker: 'DUTY' };

let timer = null;
let summary = null;

function renderTimer(root) {
  const el = document.getElementById('duty-timer');
  if (!el || !summary || !summary.shift) return;
  const now = Date.now();
  const start = new Date(summary.shift.startAt).getTime();
  let mins = Math.floor((now - start) / 60000);
  if (summary.shift.status === 'paused') {
    const paused = summary.shift.breakStartedAt ? new Date(summary.shift.breakStartedAt).getTime() : now;
    mins = Math.floor((paused - start) / 60000) - (summary.shift.breakMinutes || 0);
  } else {
    mins = Math.floor((now - start) / 60000) - (summary.shift.breakMinutes || 0);
  }
  mins = Math.max(0, mins);
  const h = String(Math.floor(mins/60)).padStart(2,'0');
  const m = String(mins%60).padStart(2,'0');
  el.textContent = h + ':' + m;
}

export async function render(root) {
  root.innerHTML = '<div class="view-loading"><div class="loader-ring"></div></div>';
  try {
    const data = await get('/api/duty/summary');
    summary = data.summary;
    root.innerHTML = `
      ${pageHeader({ kicker: 'DUTY MANAGEMENT', title: 'نظام الدوام', description: 'ابدأ دوامك، خذ استراحة، وأنهِه في الوقت المناسب.' })}
      
      <div class="grid grid-4">
        ${kpi({ label: 'ساعات الأسبوع', value: hours(summary.weeklyMinutes), icon: '◷' })}
        ${kpi({ label: 'ساعات اليوم', value: hours(summary.todayMinutes), icon: '◉' })}
        ${kpi({ label: 'إجمالي الساعات', value: hours(summary.totalMinutes), icon: '▦' })}
        ${kpi({ label: 'خصومات الأسبوع', value: hours(summary.weeklyPenaltyMinutes), icon: '⚠' })}
      </div>
      
      <div class="card" style="margin-top:18px; text-align:center; padding:40px 20px">
        <p class="eyebrow">CURRENT STATUS</p>
        <h3 style="margin:6px 0 18px">${summary.status === 'on' ? 'أنت على الدوام' : summary.status === 'break' ? 'أنت في استراحة' : 'أنت خارج الدوام'}</h3>
        ${summary.shift ? `<div class="duty-timer" id="duty-timer">00:00</div><div class="duty-timer-label">مدة الدوام الحالي</div>` : '<p class="muted">لم تبدأ دوامك بعد</p>'}
        <div class="duty-buttons">
          ${summary.status === 'off' ? `<button class="btn btn-primary" id="btn-start">بدء الدوام</button>` : ''}
          ${summary.status === 'on' ? `<button class="btn btn-ghost" id="btn-pause">استراحة</button><button class="btn btn-danger" id="btn-end">إنهاء الدوام</button>` : ''}
          ${summary.status === 'break' ? `<button class="btn btn-primary" id="btn-resume">استئناف الدوام</button><button class="btn btn-danger" id="btn-end">إنهاء الدوام</button>` : ''}
        </div>
      </div>
      
      <div class="grid grid-2" style="margin-top:18px">
        <div class="card">
          <div class="card-head"><div><p class="eyebrow">WEEKLY</p><h3>سجل الأسبوع</h3></div></div>
          <div class="card-body">
            <div class="mini-bar">
              ${(summary.days||[]).map(d => {
                const max = Math.max(...(summary.days||[]).map(x=>x.minutes), 60);
                const h = Math.max(3, (d.minutes/max)*60);
                return `<div class="bar ${d.minutes?'' : 'zero'}" style="height:${h}px" title="${hours(d.minutes)}س"></div>`;
              }).join('')}
            </div>
            <div class="mini-bar-labels">
              ${(summary.days||[]).map(d => `<span>${d.dateKey.slice(5)}</span>`).join('')}
            </div>
          </div>
        </div>
        <div class="card">
          <div class="card-head"><div><p class="eyebrow">INFO</p><h3>معلومات</h3></div></div>
          <div class="card-body stack">
            <div class="kv"><span>بداية الأسبوع</span><strong>${summary.weekKey}</strong></div>
            <div class="kv"><span>نافذة الدوام الليلي</span><strong>22:00 - 06:00</strong></div>
            <div class="kv"><span>يوم العمل يبدأ</span><strong>06:00</strong></div>
          </div>
        </div>
      </div>
    `;
    
    if (timer) clearInterval(timer);
    if (summary.shift) {
      renderTimer(root);
      timer = setInterval(() => renderTimer(root), 1000);
    }
    
    root.querySelector('#btn-start')?.addEventListener('click', async () => {
      try { const res = await post('/api/duty/start'); summary = res.summary; sound.success(); render(root); } catch(e){ sound.error(); alert(e.message); }
    });
    root.querySelector('#btn-pause')?.addEventListener('click', async () => {
      try { const res = await post('/api/duty/pause'); summary = res.summary; sound.click(); render(root); } catch(e){ sound.error(); alert(e.message); }
    });
    root.querySelector('#btn-resume')?.addEventListener('click', async () => {
      try { const res = await post('/api/duty/resume'); summary = res.summary; sound.click(); render(root); } catch(e){ sound.error(); alert(e.message); }
    });
    root.querySelector('#btn-end')?.addEventListener('click', async () => {
      try { const res = await post('/api/duty/end'); summary = res.summary; sound.success(); if(timer) clearInterval(timer); render(root); } catch(e){ sound.error(); alert(e.message); }
    });
    
    countUp(root);
  } catch (e) {
    root.innerHTML = `<div class="card"><h3>خطأ</h3><p class="muted">${esc(e.message)}</p></div>`;
  }
}
