import { get, post } from '../core/api.js';
import { state } from '../core/state.js';
import { esc, num, money, timeAgo, pageHeader, kpi, statusBadge, emptyState, openModal, formData, toast } from '../core/ui.js';
import * as sound from '../core/sound.js';

export const meta = { title: 'الخزينة', kicker: 'TREASURY' };

function shortDate(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}/${d.getDate()}`;
}

/* رسم بياني لحركة الرصيد (زيادة ونقصان) — SVG بدون مكتبات */
function balanceChart(transactions, currentBalance) {
  const rows = (transactions || []).slice().reverse().filter((tx) => tx.createdAt);
  if (rows.length < 1) return '<p class="muted">لا توجد حركات كافية لرسم المنحنى بعد.</p>';
  const W = 800;
  const H = 260;
  const pad = { l: 64, r: 16, t: 16, b: 30 };
  // الرصيد بعد كل حركة (إن لم يُحفظ نحسبه رجوعًا من الرصيد الحالي)
  let running = Number(currentBalance) || 0;
  const balances = new Array(rows.length);
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const stored = Number(rows[i].balanceAfter);
    balances[i] = Number.isFinite(stored) && rows[i].balanceAfter !== undefined ? stored : running;
    running = balances[i] - (rows[i].type === 'income' ? rows[i].amount : -rows[i].amount);
  }
  const start = running;
  const points = [{ v: start, label: 'البداية', tx: null }].concat(rows.map((tx, i) => ({ v: balances[i], label: shortDate(tx.createdAt), tx })));
  const min = Math.min(...points.map((p) => p.v), 0);
  const max = Math.max(...points.map((p) => p.v), 1);
  const span = max - min || 1;
  const x = (i) => pad.l + (points.length === 1 ? 0 : (i / (points.length - 1)) * (W - pad.l - pad.r));
  const y = (v) => pad.t + (1 - (v - min) / span) * (H - pad.t - pad.b);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(1)},${y(min).toFixed(1)} L${x(0).toFixed(1)},${y(min).toFixed(1)} Z`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => min + span * t);
  const grid = ticks.map((v) => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="rgba(255,255,255,.07)" /><text x="${pad.l - 8}" y="${(y(v) + 4).toFixed(1)}" fill="#9b9296" font-size="11" text-anchor="end">${num(Math.round(v))}</text>`).join('');
  const dots = points.slice(1).map((p, i) => `<circle cx="${x(i + 1).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="4" fill="${p.tx.type === 'income' ? '#7ff0b0' : '#ff8a94'}" stroke="#0b0b0e" stroke-width="1.5"><title>${p.tx.type === 'income' ? '+' : '−'}${num(p.tx.amount)} • ${esc(p.tx.description || '')} • الرصيد ${num(p.v)}</title></circle>`).join('');
  const labelIdx = Array.from(new Set([0, Math.floor((points.length - 1) / 2), points.length - 1]));
  const xl = labelIdx.map((i) => `<text x="${x(i).toFixed(1)}" y="${H - 8}" fill="#9b9296" font-size="11" text-anchor="middle">${esc(points[i].label)}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="حركة الرصيد" style="display:block">
    <defs><linearGradient id="bal-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#e63946" stop-opacity=".35"/><stop offset="1" stop-color="#e63946" stop-opacity="0"/></linearGradient></defs>
    ${grid}
    <path d="${area}" fill="url(#bal-fill)"/>
    <path d="${line}" fill="none" stroke="#e63946" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${dots}${xl}
  </svg>`;
}

/* أعمدة الدخل والمصروف اليومية */
function dailyBars(series) {
  const rows = (series || []).slice(-21);
  if (!rows.length) return '<p class="muted">لا توجد حركات في آخر 30 يومًا.</p>';
  const W = 800;
  const H = 200;
  const pad = { l: 16, r: 16, t: 10, b: 26 };
  const max = Math.max(...rows.map((r) => Math.max(r.income || 0, r.expense || 0)), 1);
  const slot = (W - pad.l - pad.r) / rows.length;
  const bw = Math.min(16, slot / 2.6);
  const h = (v) => ((v || 0) / max) * (H - pad.t - pad.b);
  const bars = rows.map((r, i) => {
    const cx = pad.l + slot * i + slot / 2;
    return `<g><rect x="${(cx - bw - 1).toFixed(1)}" y="${(H - pad.b - h(r.income)).toFixed(1)}" width="${bw}" height="${h(r.income).toFixed(1)}" rx="3" fill="#7ff0b0"><title>دخل ${num(r.income || 0)} • ${esc(r.day)}</title></rect>
      <rect x="${(cx + 1).toFixed(1)}" y="${(H - pad.b - h(r.expense)).toFixed(1)}" width="${bw}" height="${h(r.expense).toFixed(1)}" rx="3" fill="#ff8a94"><title>مصروف ${num(r.expense || 0)} • ${esc(r.day)}</title></rect>
      <text x="${cx.toFixed(1)}" y="${H - 8}" fill="#9b9296" font-size="10" text-anchor="middle">${esc(String(r.day).slice(5))}</text></g>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="الدخل والمصروف اليومي" style="display:block">${bars}</svg>`;
}

export async function render(root) {
  root.innerHTML = '<div class="view-loading"><div class="loader-ring"></div></div>';
  try {
    const data = await get('/api/treasury');
    const t = data.treasury || {};
    root.innerHTML = `
      ${pageHeader({ kicker: 'TREASURY', title: 'خزينة العائلة', description: 'دخل، مصاريف، الرصيد، وحركة الخزينة.', actions: state.permissions.includes('treasury:manage') ? '<button class="btn btn-primary" id="btn-add-tx">إضافة حركة</button>' : '' })}
      
      <div class="grid grid-3">
        ${kpi({ label: 'إجمالي الدخل', value: num(t.income), icon: '↗', valueHtml: money(t.income) })}
        ${kpi({ label: 'إجمالي المصاريف', value: num(t.expense), icon: '↙' })}
        ${kpi({ label: 'الرصيد الحالي', value: num(t.balance), icon: '$', primary: true, valueHtml: money(t.balance) })}
      </div>
      
      <div class="card" style="margin-top:18px">
        <div class="card-head"><div><p class="eyebrow">BALANCE</p><h3>حركة الرصيد (زيادة ونقصان)</h3></div>
          <div class="muted" style="font-size:12px"><span style="color:#7ff0b0">●</span> إيداع &nbsp; <span style="color:#ff8a94">●</span> سحب</div></div>
        <div class="card-body">${balanceChart(t.transactions, t.balance)}</div>
      </div>
      <div class="card" style="margin-top:18px">
        <div class="card-head"><div><p class="eyebrow">DAILY</p><h3>الدخل والمصروف اليومي</h3></div>
          <div class="muted" style="font-size:12px"><span style="color:#7ff0b0">■</span> دخل &nbsp; <span style="color:#ff8a94">■</span> مصروف</div></div>
        <div class="card-body">${dailyBars(t.series)}</div>
      </div>

      <div class="grid grid-3" style="margin-top:18px">
        <div class="card" style="grid-column:span 2">
          <div class="card-head"><div><p class="eyebrow">LEDGER</p><h3>سجل الحركات</h3></div></div>
          <div class="card-body">
            ${(t.transactions||[]).length ? t.transactions.map(tx => `
              <div class="tx-row">
                <div class="tx-ico ${tx.type}">${tx.type==='income'?'↗':'↙'}</div>
                <div class="tx-copy">
                  <strong>${esc(tx.description)}</strong>
                  <small>${esc(tx.category)} • ${timeAgo(tx.createdAt)}${tx.createdByName ? ' • ' + esc(tx.createdByName) : ''}</small>
                </div>
                <div class="tx-amount" style="color:${tx.type==='income'?'#7ff0b0':'#ff8a94'}">${tx.type==='income'?'+':'-'}${num(tx.amount)} ${esc(t.currency||'دولار')}</div>
              </div>
            `).join('') : emptyState('لا حركات', '')}
          </div>
        </div>
        <div class="card">
          <div class="card-head"><div><p class="eyebrow">BY CATEGORY</p><h3>حسب التصنيف</h3></div></div>
          <div class="card-body stack">
            ${(t.categories||[]).slice(0,10).map(c => `
              <div class="kv"><span>${esc(c.category)} ${c.type==='income'?'(دخل)':'(مصروف)'}</span><strong style="color:${c.type==='income'?'#7ff0b0':'#ff8a94'}">${num(c.total)}</strong></div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
    
    root.querySelector('#btn-add-tx')?.addEventListener('click', () => {
      openModal({
        title: 'إضافة حركة خزينة',
        subtitle: 'TREASURY',
        body: `
          <form id="tx-form" class="stack">
            <div class="field"><label>النوع</label><select class="select" name="type"><option value="income">إيداع</option><option value="expense">سحب</option></select></div>
            <div class="field"><label>المبلغ *</label><input class="input" name="amount" type="number" min="0" required /></div>
            <div class="field"><label>التصنيف</label><input class="input" name="category" placeholder="عمليات، صيانة، أخرى..." /></div>
            <div class="field"><label>الوصف *</label><input class="input" name="description" required placeholder="سبب الحركة" /></div>
          </form>
        `,
        footer: '<button class="btn btn-ghost" data-close>إلغاء</button><button class="btn btn-primary" id="tx-save">حفظ</button>',
        onMount: (m) => {
          m.el.querySelector('[data-close]').onclick = () => m.close();
          m.el.querySelector('#tx-save').onclick = async () => {
            const data = formData(m.el.querySelector('#tx-form'));
            try {
              await post('/api/treasury/transaction', data);
              sound.success(); toast('تم إضافة الحركة', 'success'); m.close(); render(root);
            } catch(e){ sound.error(); toast(e.message,'danger'); }
          };
        }
      });
    });
  } catch (e) {
    root.innerHTML = `<div class="card"><h3>خطأ</h3><p class="muted">${esc(e.message)}</p></div>`;
  }
}
