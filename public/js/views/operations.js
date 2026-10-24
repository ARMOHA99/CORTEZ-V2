import { get, post } from '../core/api.js';
import { state } from '../core/state.js';
import { esc, num, money, timeAgo, pageHeader, kpi, statusBadge, emptyState, openModal, formData, toast } from '../core/ui.js';
import * as sound from '../core/sound.js';

export const meta = { title: 'غرفة العمليات', kicker: 'OPERATIONS' };

export async function render(root) {
  root.innerHTML = '<div class="view-loading"><div class="loader-ring"></div></div>';
  try {
    const [ops, stats] = await Promise.all([get('/api/operations'), get('/api/operations/stats')]);
    root.innerHTML = `
      ${pageHeader({ kicker: 'OPERATIONS ROOM', title: 'غرفة العمليات', description: 'سجل العمليات، الغنائم، الخسائر، وأثرها على هدف الأسبوع.', actions: state.permissions.includes('operations:manage') || state.permissions.includes('system:admin') ? '<button class="btn btn-primary" id="btn-new-op">تسجيل عملية جديدة</button>' : '' })}
      
      <div class="grid grid-4">
        ${kpi({ label: 'إجمالي العمليات', value: num(stats.stats.total), icon: '⚔' })}
        ${kpi({ label: 'انتصارات', value: num(stats.stats.wins), icon: '✓' })}
        ${kpi({ label: 'هزائم', value: num(stats.stats.losses), icon: '✕' })}
        ${kpi({ label: 'نسبة الفوز', value: stats.stats.winRate + '%', icon: '★', primary: true })}
      </div>
      
      <div class="card" style="margin-top:18px">
        <div class="card-head"><div><p class="eyebrow">HISTORY</p><h3>سجل العمليات</h3></div></div>
        <div class="card-body stack">
          ${(ops.items||[]).length ? ops.items.map(op => `
            <div class="op-item">
              <div class="op-result ${op.result}">${op.result === 'win' ? '✓' : '✕'}</div>
              <div class="op-copy">
                <strong>${esc(op.title)} <span class="muted">(${esc(op.code)})</span></strong>
                <small>${(op.participantNames||[]).slice(0,3).join('، ')}${op.participantNames?.length>3?' +'+(op.participantNames.length-3):''} • ${timeAgo(op.createdAt)} • ${op.type}</small>
              </div>
              <div style="text-align:left">
                <div class="op-value">${op.result === 'win' ? '+' : '-'}${num(op.netValue)} ${esc(state.config?.system?.currencyLabel || 'دولار')}</div>
                <small class="muted">غنائم: ${num(op.lootValue)} | مفقودات: ${num(op.lostValue)}</small>
              </div>
            </div>
          `).join('') : emptyState('لا عمليات مسجلة', 'ابدأ بتسجيل أول عملية')}
        </div>
      </div>
    `;
    
    root.querySelector('#btn-new-op')?.addEventListener('click', () => openNewOp());
    
    function openNewOp() {
      openModal({
        title: 'تسجيل عملية جديدة',
        subtitle: 'OPERATIONS',
        size: 'wide',
        body: `
          <form id="op-form" class="stack">
            <div class="grid grid-2">
              <div class="field"><label>عنوان العملية *</label><input class="input" name="title" required placeholder="مثال: عملية سرقة بنك" /></div>
              <div class="field"><label>النتيجة *</label><select class="select" name="result"><option value="win">فوز</option><option value="loss">خسارة</option></select></div>
            </div>
            <div class="field"><label>نوع العملية</label><select class="select" name="type"><option value="heist">سرقة</option><option value="supply">إمداد</option><option value="defense">دفاع</option><option value="territory">سيطرة</option><option value="collection">تحصيل</option><option value="other">أخرى</option></select></div>
            <div class="field"><label>نقد مستلم/مفقود</label><input class="input" name="money" type="number" min="0" value="0" /></div>
            <div class="field"><label>ملاحظات</label><textarea class="textarea" name="notes" rows="3"></textarea></div>
          </form>
        `,
        footer: '<button class="btn btn-ghost" data-close>إلغاء</button><button class="btn btn-primary" id="op-save">تسجيل العملية</button>',
        onMount: (m) => {
          m.el.querySelector('[data-close]').onclick = () => m.close();
          m.el.querySelector('#op-save').onclick = async () => {
            const form = m.el.querySelector('#op-form');
            const data = formData(form);
            data.looted = [];
            data.lost = [];
            data.participants = [];
            try {
              await post('/api/operations', data);
              sound.success();
              toast('تم تسجيل العملية بنجاح', 'success');
              m.close();
              render(root);
            } catch(e) { sound.error(); toast(e.message, 'danger'); }
          };
        }
      });
    }
  } catch (e) {
    root.innerHTML = `<div class="card"><h3>خطأ</h3><p class="muted">${esc(e.message)}</p></div>`;
  }
}
