import { get, post } from '../core/api.js';
import { state, can } from '../core/state.js';
import { esc, num, moneyText, timeAgo, pageHeader, kpi, emptyState, openModal, toast, progress, animateProgress } from '../core/ui.js';
import { mountPicker } from '../core/picker.js';
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

async function openNewOp(root) {
  let catalog = [];
  let members = [];
  try { catalog = (await get('/api/items')).items || []; } catch (e) { catalog = []; }
  try { members = (await get('/api/members?limit=100')).items || []; } catch (e) { members = []; }
  const label = state.config?.system?.currencyLabel || 'دولار';
  const priceOf = (id) => (catalog.find((c) => c._id === id) || {}).price || 0;

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
        ${catalog.length ? `
          <div class="adm-field"><strong>الغنائم (أيتمات حصلنا عليها)</strong><div id="pk-looted"></div><div class="adm-note" id="sum-looted">الإجمالي: 0</div></div>
          <div class="adm-field"><strong>المفقودات (أيتمات خسرناها)</strong><div id="pk-lost"></div><div class="adm-note" id="sum-lost">الإجمالي: 0</div></div>`
          : '<p class="adm-note">لا توجد أيتمات بعد. اطلب من البزنس مانجر إضافة الأيتمات وأسعارها من «غرفة الأيتمات» لتحسب الغنائم والمفقودات تلقائيًا.</p>'}
        ${members.length ? '<div class="adm-field"><strong>المشاركون</strong><div id="pk-members"></div></div>' : ''}
        <label>ملاحظات<textarea name="notes" maxlength="1200"></textarea></label>
        <div class="goal-preview" id="op-preview"></div>
        <div class="adm-actions"><button class="btn btn-primary" type="submit">تسجيل العملية</button></div>
      </form>`
  });
  if (!modal) return;
  const form = modal.el.querySelector('#op-form');
  let looted = null;
  let lost = null;
  let people = null;

  function recalc() {
    const lootValue = looted ? looted.total(priceOf) : 0;
    const lostValue = lost ? lost.total(priceOf) : 0;
    const money = Math.max(0, Number(form.money.value) || 0);
    const l1 = form.querySelector('#sum-looted');
    const l2 = form.querySelector('#sum-lost');
    if (l1) l1.textContent = 'الإجمالي: ' + moneyText(lootValue);
    if (l2) l2.textContent = 'الإجمالي: ' + moneyText(lostValue);
    const win = form.result.value === 'win';
    const delta = win ? Math.max(0, money + lootValue - lostValue) : -(lostValue + money);
    form.querySelector('#op-preview').innerHTML = `<div class="kv"><span>أثر العملية على الهدف الأسبوعي</span><strong style="color:${delta >= 0 ? '#7ff0b0' : '#ff8a94'}">${delta >= 0 ? '+' : '−'}${num(Math.abs(delta))} ${esc(label)}</strong></div>`;
  }

  const itemOptions = catalog.map((c) => ({ id: c._id, label: c.name, sub: `${num(c.price)} ${label}` }));
  if (catalog.length) {
    looted = mountPicker(form.querySelector('#pk-looted'), { options: itemOptions, withQty: true, placeholder: 'ابحث عن أيتم واضغط عليه لإضافته…', onChange: recalc });
    lost = mountPicker(form.querySelector('#pk-lost'), { options: itemOptions, withQty: true, placeholder: 'ابحث عن أيتم واضغط عليه لإضافته…', onChange: recalc });
  }
  if (members.length) {
    people = mountPicker(form.querySelector('#pk-members'), {
      options: members.map((m) => ({ id: m._id, label: m.displayName || m.username || 'عضو' })),
      placeholder: 'ابحث عن عضو واضغط عليه لإضافته…',
      emptyText: 'لا يوجد عضو بهذا الاسم'
    });
  }
  form.money.addEventListener('input', recalc);
  form.result.addEventListener('change', recalc);
  recalc();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const toItems = (picker) => (picker ? picker.getSelected() : []).map((r) => ({ itemId: r.id, name: (catalog.find((c) => c._id === r.id) || {}).name, qty: r.qty }));
    const body = {
      title: form.title.value.trim(),
      result: form.result.value,
      type: form.type.value,
      money: Math.max(0, Number(form.money.value) || 0),
      notes: form.notes.value.trim(),
      looted: toItems(looted),
      lost: toItems(lost),
      participants: people ? people.getSelected().map((r) => r.id) : []
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
