import { get, post, del } from '../core/api.js';
import { esc, num, pageHeader, emptyState, kpi, toast } from '../core/ui.js';
import { can } from '../core/state.js';

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
    await renderAttendanceExtras(root, data);
  } catch (e) {
    root.innerHTML = `<div class="card"><h3>خطأ</h3><p class="muted">${esc(e.message)}</p></div>`;
  }
}


/* ═══════════ لوحة الحضور والإنذارات ═══════════ */
const STATUS_LABEL = {
  present: 'حاضر',
  absent: 'غائب',
  excused: 'غياب بعذر',
  leave: 'إجازة',
  exempt: 'معفى',
  pending: 'لم يُقيَّم'
};

function warningBadge(level) {
  return `<span class="badge">مستوى ${num(level)}</span>`;
}

function statusChip(status) {
  const map = { present: 'متاح', absent: 'مرفوض', excused: 'متاح', leave: 'محايد', exempt: 'محايد', pending: 'محايد' };
  return `<span class="chip ${map[status] || ''}">${esc(STATUS_LABEL[status] || status || '—')}</span>`;
}

async function renderAttendanceExtras(root, gridData) {
  let status = null;
  try { status = await get('/api/attendance/status'); } catch (e) { status = null; }

  let admin = null;
  if (can('attendance:manage')) {
    try { admin = await get('/api/attendance/review'); } catch (e) { admin = null; }
  }

  const parts = [];
  if (status) {
    const cfg = status.config || {};
    const today = status.today || null;
    const active = (status.warnings || []).filter((w) => w.status === 'active');
    parts.push(`
      <div class="grid grid-3" style="margin-bottom:16px">
        ${kpi({ label: `حالة اليوم (${esc(status.dateKey || '')})`, value: esc(STATUS_LABEL[today ? today.status : 'pending']), icon: '◈' })}
        ${kpi({ label: 'غياب متتالي', value: num(status.streak || 0), icon: '✗' })}
        ${kpi({ label: 'إنذارات سارية', value: num(active.length), icon: '⚑', primary: active.length > 0 })}
      </div>`);

    if (status.leaveUntil) {
      parts.push(`<div class="card"><div class="card-body"><p class="muted">إجازتك مسجّلة حتى ${esc(String(status.leaveUntil).slice(0, 10))} — لن تُحسب غيابًا.</p></div></div>`);
    }

    if (active.length) {
      parts.push(`
        <div class="card" style="margin-bottom:16px"><div class="card-body">
          <h3>إنذاراتك</h3>
          <table class="table">
            <thead><tr><th>المستوى</th><th>السبب</th><th>اليوم</th><th>ينتهي</th></tr></thead>
            <tbody>${active.map((w) => `<tr>
              <td>${warningBadge(w.level)}</td>
              <td>${esc(w.reason || '—')}</td>
              <td>${esc(w.dateKey || '—')}</td>
              <td>${w.expiresAt ? esc(String(w.expiresAt).slice(0, 10)) : 'بلا نهاية'}</td>
            </tr>`).join('')}</tbody>
          </table>
          <p class="adm-note">قدّم تبريرك خلال ${num(cfg.justifyHours || 12)} ساعة من إغلاق اليوم. موافقة الإدارة تلغي الإنذار.</p>
        </div></div>`);
    }

    const justifiable = status.justifiable || [];
    if (justifiable.length) {
      parts.push(`
        <div class="card" style="margin-bottom:16px"><div class="card-body adm-form">
          <h3>تبرير غياب</h3>
          <div class="adm-row">
            <label style="flex:1">اليوم
              <select id="just-day">${justifiable.map((d) => {
                const pending = d.justification && d.justification.status === 'pending';
                return `<option value="${esc(d.dateKey)}" ${pending ? 'disabled' : ''}>${esc(d.dateKey)}${pending ? ' — قيد المراجعة' : ''}</option>`;
              }).join('')}</select>
            </label>
          </div>
          <label>سبب الغياب<textarea id="just-text" rows="3" maxlength="1000" placeholder="اكتب سببًا واضحًا — الإدارة تراجع الطلب"></textarea></label>
          <button class="btn btn-primary btn-sm" id="just-send" type="button">إرسال التبرير</button>
        </div></div>`);
    }
  }

  if (admin) {
    const pending = admin.pending || [];
    const warnings = admin.warnings || [];
    const counts = admin.counts || {};
    const members = (gridData && gridData.members) || [];
    parts.push(`
      <div class="card" style="margin-bottom:16px"><div class="card-body">
        <div class="card-head" style="padding:0 0 10px"><div><p class="eyebrow">REVIEW</p><h3>مراجعة الحضور — ${esc(admin.dateKey || '')}</h3></div>
          <button class="btn btn-ghost btn-sm" id="att-run" type="button">تشغيل التقييم الآن</button></div>
        <div class="grid grid-4" style="margin-bottom:12px">
          <div class="kpi"><div class="kpi-label">حاضر</div><div class="kpi-value">${num(counts.present || 0)}</div></div>
          <div class="kpi"><div class="kpi-label">غائب</div><div class="kpi-value">${num(counts.absent || 0)}</div></div>
          <div class="kpi"><div class="kpi-label">إجازة</div><div class="kpi-value">${num(counts.leave || 0)}</div></div>
          <div class="kpi"><div class="kpi-label">تبريرات معلّقة</div><div class="kpi-value">${num(pending.length)}</div></div>
        </div>
        ${pending.length ? `<table class="table">
          <thead><tr><th>العضو</th><th>اليوم</th><th>التبرير</th><th>القرار</th></tr></thead>
          <tbody>${pending.map((row) => `<tr>
            <td><div class="user-cell" data-member-id="${esc(String(row.user || ''))}"><div class="avatar"><span>${esc(String((row.userSnapshot && row.userSnapshot.name) || 'ع').charAt(0))}</span></div>
              <div><strong>${esc((row.userSnapshot && row.userSnapshot.name) || 'عضو')}</strong><small>${esc((row.userSnapshot && row.userSnapshot.rank) || '')}</small></div></div></td>
            <td>${esc(row.dateKey)}</td>
            <td style="max-width:320px">${esc((row.justification && row.justification.text) || '')}</td>
            <td>
              <button class="btn btn-primary btn-sm" data-approve="${esc(String(row._id))}" type="button">قبول</button>
              <button class="btn btn-ghost btn-sm" data-reject="${esc(String(row._id))}" type="button">رفض</button>
            </td>
          </tr>`).join('')}</tbody>
        </table>` : '<p class="muted">لا تبريرات معلّقة.</p>'}
      </div></div>

      <div class="card" style="margin-bottom:16px"><div class="card-body">
        <h3>إنذارات سارية</h3>
        ${warnings.length ? `<table class="table">
          <thead><tr><th>العضو</th><th>المستوى</th><th>السبب</th><th>ينتهي</th><th></th></tr></thead>
          <tbody>${warnings.map((w) => `<tr>
            <td>${esc((w.userSnapshot && w.userSnapshot.name) || 'عضو')}</td>
            <td>${warningBadge(w.level)}</td>
            <td>${esc(w.reason || '—')}</td>
            <td>${w.expiresAt ? esc(String(w.expiresAt).slice(0, 10)) : 'بلا نهاية'}</td>
            <td><button class="btn btn-ghost btn-sm" data-clear="${esc(String(w._id))}" type="button">رفع</button></td>
          </tr>`).join('')}</tbody>
        </table>` : '<p class="muted">لا إنذارات سارية.</p>'}
        <div class="adm-row" style="margin-top:14px;align-items:flex-end;gap:10px">
          <label style="flex:2">منح إجازة لعضو
            <select id="leave-user">${members.map((m) => `<option value="${esc(String(m._id || ''))}">${esc(m.name || 'عضو')}</option>`).join('')}</select>
          </label>
          <label style="flex:1">أيام<input type="number" id="leave-days" min="1" max="60" value="3" /></label>
          <label style="flex:2">السبب<input type="text" id="leave-reason" maxlength="120" placeholder="مرض، سفر…" /></label>
          <button class="btn btn-ghost btn-sm" id="leave-go" type="button">تسجيل</button>
        </div>
      </div></div>`);
  }

  if (!parts.length) return;
  const head = root.querySelector('.page-head') || root.querySelector('header');
  const html = `<div class="att-extras">${parts.join('')}</div>`;
  if (head) head.insertAdjacentHTML('afterend', html);
  else root.insertAdjacentHTML('afterbegin', html);

  const box = root.querySelector('.att-extras');
  if (!box) return;

  const sendJustify = async () => {
    const dayKey = box.querySelector('#just-day');
    const text = box.querySelector('#just-text');
    if (!dayKey || !text) return;
    try {
      await post('/api/attendance/justify', { dateKey: dayKey.value, text: text.value.trim() });
      toast('أُرسل تبريرك للمراجعة', 'success');
      render(root);
    } catch (e) {
      toast(e.message || 'تعذّر إرسال التبرير', 'error');
    }
  };
  const jb = box.querySelector('#just-send');
  if (jb) jb.addEventListener('click', sendJustify);

  box.querySelectorAll('[data-approve]').forEach((btn) => btn.addEventListener('click', async () => {
    try {
      await post('/api/attendance/review', { id: btn.dataset.approve, approve: true });
      toast('قُبل التبرير وأُلغي الإنذار', 'success');
      render(root);
    } catch (e) { toast(e.message || 'تعذّر القبول', 'error'); }
  }));
  box.querySelectorAll('[data-reject]').forEach((btn) => btn.addEventListener('click', async () => {
    const note = window.prompt('سبب الرفض (اختياري)') || '';
    try {
      await post('/api/attendance/review', { id: btn.dataset.reject, approve: false, note });
      toast('رُفض التبرير', 'info');
      render(root);
    } catch (e) { toast(e.message || 'تعذّر الرفض', 'error'); }
  }));
  box.querySelectorAll('[data-clear]').forEach((btn) => btn.addEventListener('click', async () => {
    try {
      await post(`/api/attendance/warnings/${btn.dataset.clear}/clear`, {});
      toast('رُفع الإنذار', 'success');
      render(root);
    } catch (e) { toast(e.message || 'تعذّر رفع الإنذار', 'error'); }
  }));
  const runBtn = box.querySelector('#att-run');
  if (runBtn) runBtn.addEventListener('click', async () => {
    try {
      await post('/api/attendance/run', {});
      toast('تم تشغيل التقييم', 'success');
      render(root);
    } catch (e) { toast(e.message || 'تعذّر التشغيل', 'error'); }
  });
  const leaveGo = box.querySelector('#leave-go');
  if (leaveGo) leaveGo.addEventListener('click', async () => {
    try {
      await post('/api/attendance/leave', {
        userId: box.querySelector('#leave-user').value,
        days: Number(box.querySelector('#leave-days').value) || 1,
        reason: box.querySelector('#leave-reason').value.trim()
      });
      toast('سُجّلت الإجازة', 'success');
      render(root);
    } catch (e) { toast(e.message || 'تعذّر تسجيل الإجازة', 'error'); }
  });
}
