import { get, post } from '../core/api.js';
import { state, can } from '../core/state.js';
import { esc, num, moneyText, timeAgo, pageHeader, kpi, emptyState, openModal, toast, progress, animateProgress } from '../core/ui.js';
import * as sound from '../core/sound.js';

export const meta = { title: 'غرفة العمليات', kicker: 'OPERATIONS' };

const TYPES = { heist: 'سرقة', supply: 'إمداد', defense: 'دفاع', territory: 'سيطرة', collection: 'تحصيل', other: 'أخرى' };

function goalCard(goal) {
  if (!goal) return '';
  const label = state.config?.system?.currencyLabel || 'دولار';
  return `
    <div class="card goal-card" style="margin-bottom:18px">
      <div class="card-body">
        <div class="row-between">
          <div><p class="eyebrow">WEEKLY GOAL • ${esc(goal.weekKey || '')}</p><h3 style="margin:2px 0 0">الهدف الأسبوعي للعائلة</h3></div>
          <strong class="goal-pct">${num(goal.percent)}%</strong>
        </div>
        ${progress(goal.percent, { thick: true })}
        <div class="row-between" style="margin-top:8px">
          <span class="muted">${num(goal.current)} / ${num(goal.target)} ${esc(label)}</span>
          <span class="muted">متبقي: ${num(goal.remaining)} ${esc(label)}</span>
        </div>
        <p class="adm-note" style="margin-top:6px">كل عملية رابحة تزيد الشريط، وكل عملية خاسرة تُنقصه.</p>
      </div>
    </div>`;
}

function itemRows(items, kind) {
  return `
    <div class="op-items-block" data-kind="${kind}">
      <div class="row-between" style="margin:10px 0 6px">
        <strong>${kind === 'looted' ? 'الغنائم (أيتمات حصلنا عليها)' : 'المفقودات (أيتمات خسرناها)'}</strong>
        <button class="btn btn-ghost btn-sm" type="button" data-add="${kind}">+ إضافة أيتم</button>
      </div>
      <div class="op-rows" data-rows="${kind}"></div>
      <div class="adm-note" data-sum="${kind}">الإجمالي: 0</div>
    </div>`;
}

async function openNewOp(root) {
  let catalog = [];
  let members = [];
  try { catalog = (await get('/api/items')).items || []; } catch (e) { catalog = []; }
  try { members = (await get('/api/members?limit=100')).items || []; } catch (e) { members = []; }
  const label = state.config?.system?.currencyLabel || 'دولار';

  const modal = openModal({
    title: 'تسجيل عملية جديدة',
    subtitle: 'OPERATIONS',
    size: 'lg',
    body: `
      <form class="adm-form" id="op-form">
        <div class="adm-grid">
          <label>عنوان العملية<input type="text" name="title" maxlength="140" required placeholder="مثال: سرقة بنك" /></label>
          <label>النتيجة<select name="result"><option value="win">فوز</option><option value="loss">خسارة</option></select></label>
          <label>النوع<select name="type">${Object.entries(TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
          <label>المبلغ النقدي (${esc(label)})<input type="number" name="money" min="0" value="0" /></label>
        </div>
        ${catalog.length ? itemRows(catalog, 'looted') + itemRows(catalog, 'lost') : '<p class="adm-note">لا توجد أيتمات بعد. اطلب من البزنس مانجر إضافة الأيتمات وأسعارها من «غرفة الأيتمات» لتحسب الغنائم والمفقودات تلقائيًا.</p>'}
        ${members.length ? `<label>المشاركون (اختر عدة أعضاء بالضغط مع Ctrl)<select name="participants" multiple size="6">${members.map((m) => `<option value="${esc(m._id)}">${esc(m.displayName || m.username || 'عضو')}</option>`).join('')}</select></label>` : ''}
        <label>ملاحظات<textarea name="notes" maxlength="1200"></textarea></label>
        <div class="goal-preview" id="op-preview"></div>
        <div class="adm-actions"><button class="btn btn-primary" type="submit">تسجيل العملية</button></div>
      </form>`
  });
  if (!modal) return;
  const form = modal.el.querySelector('#op-form');
  const priceOf = (id) => (catalog.find((c) => c._id === id) || {}).price || 0;

  function readRows(kind) {
    return Array.from(form.querySelectorAll(`[data-rows="${kind}"] .op-row`)).map((row) => ({
      itemId: row.querySelector('select').value,
      qty: Math.max(1, Math.round(Number(row.querySelector('input').value) || 1))
    })).filter((r) => r.itemId);
  }
  function recalc() {
    const total = (kind) => readRows(kind).reduce((sum, r) => sum + priceOf(r.itemId) * r.qty, 0);
    const looted = total('looted');
    const lost = total('lost');
    const money = Math.max(0, Number(form.money.value) || 0);
    ['looted', 'lost'].forEach((kind) => {
      const el = form.querySelector(`[data-sum="${kind}"]`);
      if (el) el.textContent = 'الإجمالي: ' + moneyText(kind === 'looted' ? looted : lost);
    });
    const win = form.result.value === 'win';
    const delta = win ? Math.max(0, money + looted - lost) : -(lost + money);
    form.querySelector('#op-preview').innerHTML = `<div class="kv"><span>أثر العملية على الهدف الأسبوعي</span><strong style="color:${delta >= 0 ? '#7ff0b0' : '#ff8a94'}">${delta >= 0 ? '+' : '−'}${num(Math.abs(delta))} ${esc(label)}</strong></div>`;
  }
  function addRow(kind) {
    const rows = form.querySelector(`[data-rows="${kind}"]`);
    const row = document.createElement('div');
    row.className = 'adm-row op-row';
    row.innerHTML = `
      <select class="adm-input" style="flex:2">${catalog.map((c) => `<option value="${esc(c._id)}">${esc(c.name)} — ${num(c.price)}</option>`).join('')}</select>
      <input class="adm-input" type="number" min="1" value="1" style="flex:1;min-width:80px" />
      <button class="btn btn-ghost btn-sm" type="button">✕</button>`;
    row.querySelector('button').addEventListener('click', () => { row.remove(); recalc(); });
    row.querySelector('select').addEventListener('change', recalc);
    row.querySelector('input').addEventListener('input', recalc);
    rows.appendChild(row);
    recalc();
  }
  form.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => addRow(b.dataset.add)));
  form.money.addEventListener('input', recalc);
  form.result.addEventListener('change', recalc);
  recalc();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const names = (rows) => rows.map((r) => ({ itemId: r.itemId, name: (catalog.find((c) => c._id === r.itemId) || {}).name, qty: r.qty }));
    const body = {
      title: form.title.value.trim(),
      result: form.result.value,
      type: form.type.value,
      money: Math.max(0, Number(form.money.value) || 0),
      notes: form.notes.value.trim(),
      looted: names(readRows('looted')),
      lost: names(readRows('lost')),
      participants: form.participants ? Array.from(form.participants.selectedOptions).map((o) => o.value) : []
    };
    try {
      await post('/api/operations', body);
      sound.success(); toast('تم تسجيل العملية', 'success'); modal.close(); render(root);
    } catch (e) { sound.error(); toast(e.message, 'danger'); }
  });
}

export async function render(root) {
  root.innerHTML = '<div class="view-loading"><div class="loader-ring"></div></div>';
  try {
    const [ops, stats] = await Promise.all([get('/api/operations'), get('/api/operations/stats')]);
    const label = state.config?.system?.currencyLabel || 'دولار';
    root.innerHTML = `
      ${pageHeader({ kicker: 'OPERATIONS ROOM', title: 'غرفة العمليات', description: 'سجل العمليات، الغنائم، الخسائر، وأثرها على هدف الأسبوع.', actions: can('operations:manage') ? '<button class="btn btn-primary" id="btn-new-op" type="button">تسجيل عملية جديدة</button>' : '' })}
      ${goalCard(stats.goal)}
      <div class="grid grid-4">
        ${kpi({ label: 'إجمالي العمليات', value: num(stats.stats.total), icon: '⚔' })}
        ${kpi({ label: 'انتصارات', value: num(stats.stats.wins), icon: '✓' })}
        ${kpi({ label: 'هزائم', value: num(stats.stats.losses), icon: '✕' })}
        ${kpi({ label: 'نسبة الفوز', value: stats.stats.winRate + '%', icon: '★', primary: true })}
      </div>
      <div class="card" style="margin-top:18px">
        <div class="card-head"><div><p class="eyebrow">HISTORY</p><h3>سجل العمليات</h3></div></div>
        <div class="card-body stack">
          ${(ops.items || []).length ? ops.items.map((op) => `
            <div class="op-item">
              <div class="op-result ${op.result}">${op.result === 'win' ? '✓' : '✕'}</div>
              <div class="op-copy">
                <strong>${esc(op.title)} <span class="muted">(${esc(op.code)})</span></strong>
                <small>${(op.participantNames || []).slice(0, 3).map(esc).join('، ')}${op.participantNames?.length > 3 ? ' +' + (op.participantNames.length - 3) : ''} • ${timeAgo(op.createdAt)} • ${esc(TYPES[op.type] || op.type)}</small>
                ${(op.looted || []).length || (op.lost || []).length ? `<small>${(op.looted || []).map((i) => `＋ ${esc(i.name)} ×${i.qty}`).join('، ')}${(op.looted || []).length && (op.lost || []).length ? ' | ' : ''}${(op.lost || []).map((i) => `－ ${esc(i.name)} ×${i.qty}`).join('، ')}</small>` : ''}
              </div>
              <div style="text-align:left">
                <div class="op-value">${op.result === 'win' ? '+' : '-'}${num(op.result === 'win' ? op.netValue : Math.abs(op.goalDelta))} ${esc(label)}</div>
                <small class="muted">نقد: ${num(op.money)} | غنائم: ${num(op.lootValue)} | مفقودات: ${num(op.lostValue)}</small>
              </div>
            </div>`).join('') : emptyState('لا عمليات مسجلة', 'ابدأ بتسجيل أول عملية')}
        </div>
      </div>`;
    animateProgress(root);
    const btn = root.querySelector('#btn-new-op');
    if (btn) btn.addEventListener('click', () => openNewOp(root));
  } catch (e) {
    root.innerHTML = `<div class="card"><h3>خطأ</h3><p class="muted">${esc(e.message)}</p></div>`;
  }
}
