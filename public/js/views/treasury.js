import { get, post } from '../core/api.js';
import { state } from '../core/state.js';
import { esc, num, money, timeAgo, pageHeader, kpi, statusBadge, emptyState, openModal, formData, toast } from '../core/ui.js';
import * as sound from '../core/sound.js';

export const meta = { title: 'الخزينة', kicker: 'TREASURY' };

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
