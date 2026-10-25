import { get, post } from '../core/api.js';
import { state, can } from '../core/state.js';
import { esc, pageHeader, emptyState, statusBadge, toast, openModal, confirmDialog, promptDialog } from '../core/ui.js';
import * as sound from '../core/sound.js';

export const meta = { title: 'التصويتات', kicker: 'VOTES' };

async function openCreate(root) {
  let ranks = [];
  try { ranks = (await get('/api/admin/ranks')).ranks || []; } catch (e) { ranks = []; }
  const modal = openModal({
    title: 'تصويت جديد',
    subtitle: 'NEW VOTE',
    size: 'lg',
    body: `
      <form class="adm-form" id="vote-form">
        <label>العنوان<input type="text" name="title" maxlength="180" required /></label>
        <label>الوصف<textarea name="description" maxlength="2500"></textarea></label>
        <label>الخيارات (خيار في كل سطر — اتركها فارغة لـ «أُقِرّ / رُفِض»)
          <textarea name="options" placeholder="أُقِرّ&#10;رُفِض"></textarea>
        </label>
        <div class="adm-row">
          <label style="flex:1">المدة (بالساعات)<input type="number" name="hours" min="1" max="720" value="24" /></label>
          <label style="flex:1">الحد الأدنى للمشاركين<input type="number" name="minParticipation" min="1" value="1" /></label>
        </div>
        <label>من يحق له التصويت (اتركه فارغًا لكل الأعضاء)
          <select name="eligibleRanks" multiple size="5">
            ${ranks.filter((r) => r.key !== 'guest').map((r) => `<option value="${esc(r.key)}">${esc(r.name)}</option>`).join('')}
          </select>
        </label>
        <label class="adm-switch"><input type="checkbox" name="anonymous" /> تصويت سري</label>
        <div class="adm-actions"><button class="btn btn-primary" type="submit">نشر التصويت</button></div>
      </form>`
  });
  if (!modal) return;
  modal.el.querySelector('#vote-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    const lines = form.options.value.split('\n').map((line) => line.trim()).filter(Boolean);
    const payload = {
      title: form.title.value.trim(),
      description: form.description.value.trim(),
      options: lines.length ? lines.map((label, index) => ({ key: `opt-${index + 1}`, label })) : undefined,
      closesAt: new Date(Date.now() + Math.max(1, Number(form.hours.value) || 24) * 3600 * 1000).toISOString(),
      minParticipation: Number(form.minParticipation.value) || 1,
      eligibleRanks: Array.from(form.eligibleRanks.selectedOptions).map((option) => option.value),
      anonymous: form.anonymous.checked
    };
    try {
      await post('/api/votes', payload);
      sound.success();
      toast('تم نشر التصويت', 'success');
      modal.close();
      render(root);
    } catch (error) {
      sound.error();
      toast(error.message, 'danger');
    }
  });
}

export async function render(root) {
  root.innerHTML = '<div class="view-loading"><div class="loader-ring"></div></div>';
  try {
    const data = await get('/api/votes');
    const canCreate = can('votes:create');
    const canVeto = can('votes:veto');
    root.innerHTML = `
      ${pageHeader({
        kicker: 'BLOOD VOTE',
        title: 'غرفة الدم للتصويت',
        description: 'تصويتات العائلة، نتائجها، وختم القرار.',
        actions: canCreate ? '<button class="btn btn-primary" id="vote-new" type="button">+ تصويت جديد</button>' : ''
      })}
      <div class="stack">
        ${(data.items || []).length ? data.items.map((v) => {
          const total = v.totalVotes || 0;
          return `
          <div class="vote-card ${v.status}">
            <div class="row-between">
              <div>
                <p class="eyebrow">${esc(v.code)}</p>
                <h4>${esc(v.title)}</h4>
                <p class="muted">${esc(v.description || '')}</p>
              </div>
              ${statusBadge(v.status === 'open' ? 'open' : v.status === 'vetoed' ? 'vetoed' : 'closed')}
            </div>
            ${v.status === 'open' && !v.hasVoted && v.eligible ? `
              <div class="vote-options">
                ${(v.options || []).map((o) => `<button class="vote-option" data-vote="${v._id}" data-choice="${o.key}"><span class="label">${esc(o.label)}</span></button>`).join('')}
              </div>
            ` : `
              <div class="vote-options">
                ${(v.options || []).map((o) => {
                  const c = v.tallies ? (v.tallies[o.key] || 0) : 0;
                  const pct = total ? Math.round((c / total) * 100) : 0;
                  return `<div class="vote-option ${v.myChoice === o.key ? 'chosen' : ''}" disabled><span class="fill" style="width:${pct}%"></span><span class="label">${esc(o.label)}</span><span class="pct">${pct}% (${c})</span></div>`;
                }).join('')}
              </div>
            `}
            <div class="vote-meta">
              <span>عدد المصوتين: ${v.voterCount || 0}${v.minParticipation ? ' / حد أدنى ' + v.minParticipation : ''}</span>
              <span>•</span>
              <span>يُغلق: ${v.closesAt ? new Date(v.closesAt).toLocaleString('ar-SA') : '—'}</span>
              ${v.myChoice && v.anonymous && v.status === 'open' ? '<span>•</span><span>لقد صوّتت</span>' : ''}
            </div>
            ${v.status === 'open' && (canCreate || canVeto) ? `
              <div class="adm-actions" style="margin-top:10px">
                ${canCreate ? `<button class="btn btn-ghost btn-sm" data-close="${v._id}" type="button">إغلاق التصويت</button>` : ''}
                ${canVeto ? `<button class="btn btn-ghost btn-sm" data-veto="${v._id}" type="button">نقض (Veto)</button>` : ''}
              </div>` : ''}
          </div>`;
        }).join('') : emptyState('لا تصويتات حالياً', canCreate ? 'اضغط «تصويت جديد» لإنشاء أول تصويت' : '')}
      </div>
    `;

    const newBtn = root.querySelector('#vote-new');
    if (newBtn) newBtn.addEventListener('click', () => openCreate(root));

    root.querySelectorAll('[data-vote]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          const res = await post(`/api/votes/${btn.dataset.vote}/cast`, { choice: btn.dataset.choice });
          if (res.fingerprint) toast('تم تسجيل صوتك • ' + res.fingerprint, 'success');
          sound.success();
          render(root);
        } catch (e) { sound.error(); toast(e.message, 'danger'); }
      });
    });

    root.querySelectorAll('[data-close]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!(await confirmDialog({ title: 'إغلاق التصويت', message: 'سيُغلق التصويت ولن يُقبل أي صوت جديد.', confirmText: 'إغلاق' }))) return;
        try { await post(`/api/votes/${btn.dataset.close}/close`); toast('تم الإغلاق', 'success'); render(root); } catch (e) { toast(e.message, 'danger'); }
      });
    });

    root.querySelectorAll('[data-veto]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const reason = await promptDialog({ title: 'نقض التصويت', label: 'سبب النقض', placeholder: 'اكتب السبب…', confirmText: 'نقض' });
        if (reason === null) return;
        try { await post(`/api/votes/${btn.dataset.veto}/veto`, { reason }); toast('تم نقض التصويت', 'success'); render(root); } catch (e) { toast(e.message, 'danger'); }
      });
    });
  } catch (e) {
    root.innerHTML = `<div class="card"><h3>خطأ</h3><p class="muted">${esc(e.message)}</p></div>`;
  }
}
