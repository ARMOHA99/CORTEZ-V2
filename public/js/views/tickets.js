import { get, post } from '../core/api.js';
import { state } from '../core/state.js';
import { esc, timeAgo, pageHeader, statusBadge, emptyState, openModal, formData, toast } from '../core/ui.js';
import * as sound from '../core/sound.js';

export const meta = { title: 'التذاكر', kicker: 'TICKETS' };

export async function render(root) {
  root.innerHTML = '<div class="view-loading"><div class="loader-ring"></div></div>';
  try {
    const data = await get('/api/tickets');
    root.innerHTML = `
      ${pageHeader({ kicker: 'TICKETS', title: 'نظام التذاكر', description: 'إجازات، ترقيات، وشكاوى.', actions: '<button class="btn btn-primary" id="btn-new">تذكرة جديدة</button>' })}
      <div class="stack">
        ${(data.items||[]).length ? data.items.map(t => `
          <div class="ticket-row">
            <div class="ticket-ico">✉</div>
            <div class="ticket-copy">
              <strong>${esc(t.title)}</strong>
              <small>${t.type === 'leave' ? 'إجازة' : t.type === 'promotion' ? 'ترقية' : 'شكوى'} • ${timeAgo(t.createdAt)}</small>
            </div>
            ${statusBadge(t.status === 'pending' ? 'pending' : t.status === 'approved' ? 'approved' : 'rejected')}
          </div>
        `).join('') : emptyState('لا تذاكر', '')}
      </div>
    `;
    
    root.querySelector('#btn-new').addEventListener('click', ()=>{
      openModal({
        title: 'إنشاء تذكرة جديدة',
        body: `
          <form id="t-form" class="stack">
            <div class="field"><label>النوع</label><select class="select" name="type"><option value="leave">إجازة</option><option value="promotion">ترقية</option><option value="complaint">شكوى</option></select></div>
            <div class="field"><label>العنوان *</label><input class="input" name="title" required /></div>
            <div class="field"><label>التفاصيل *</label><textarea class="textarea" name="body" rows="4" required></textarea></div>
          </form>
        `,
        footer: '<button class="btn btn-ghost" data-close>إلغاء</button><button class="btn btn-primary" id="t-save">إرسال</button>',
        onMount: (m)=>{
          m.el.querySelector('[data-close]').onclick=()=>m.close();
          m.el.querySelector('#t-save').onclick=async ()=>{
            try { await post('/api/tickets', formData(m.el.querySelector('#t-form'))); sound.success(); toast('تم إرسال التذكرة','success'); m.close(); render(root); }
            catch(e){ sound.error(); toast(e.message,'danger'); }
          };
        }
      });
    });
  } catch (e) {
    root.innerHTML = `<div class="card"><h3>خطأ</h3><p class="muted">${esc(e.message)}</p></div>`;
  }
}
