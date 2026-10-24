import { get, post } from '../core/api.js';
import { state } from '../core/state.js';
import { esc, timeAgo, pageHeader, emptyState, statusBadge, toast } from '../core/ui.js';
import * as sound from '../core/sound.js';

export const meta = { title: 'التصويتات', kicker: 'VOTES' };

export async function render(root) {
  root.innerHTML = '<div class="view-loading"><div class="loader-ring"></div></div>';
  try {
    const data = await get('/api/votes');
    root.innerHTML = `
      ${pageHeader({ kicker: 'BLOOD VOTE', title: 'غرفة الدم للتصويت', description: 'تصويتات العائلة، نتائجها، وختم القرار.' })}
      <div class="stack">
        ${(data.items||[]).length ? data.items.map(v => {
          const total = v.totalVotes||0;
          return `
          <div class="vote-card ${v.status}">
            <div class="row-between">
              <div>
                <p class="eyebrow">${esc(v.code)}</p>
                <h4>${esc(v.title)}</h4>
                <p class="muted">${esc(v.description||'')}</p>
              </div>
              ${statusBadge(v.status === 'open' ? 'open' : v.status === 'vetoed' ? 'vetoed' : 'closed')}
            </div>
            ${v.status === 'open' && !v.hasVoted && v.eligible ? `
              <div class="vote-options">
                ${(v.options||[]).map(o=>`<button class="vote-option" data-vote="${v._id}" data-choice="${o.key}"><span class="label">${esc(o.label)}</span></button>`).join('')}
              </div>
            ` : `
              <div class="vote-options">
                ${(v.options||[]).map(o=>{
                  const c = v.tallies ? (v.tallies[o.key]||0) : 0;
                  const pct = total ? Math.round((c/total)*100) : 0;
                  return `<div class="vote-option ${v.myChoice===o.key?'chosen':''}" disabled><span class="fill" style="width:${pct}%"></span><span class="label">${esc(o.label)}</span><span class="pct">${pct}% (${c})</span></div>`;
                }).join('')}
              </div>
            `}
            <div class="vote-meta">
              <span>عدد المصوتين: ${v.voterCount||0}${v.minParticipation? ' / حد أدنى '+v.minParticipation:''}</span>
              <span>•</span>
              <span>يُغلق: ${v.closesAt ? new Date(v.closesAt).toLocaleString('ar-SA') : '—'}</span>
              ${v.myChoice && v.anonymous && v.status==='open' ? '<span>•</span><span>لقد صوّتت</span>' : ''}
            </div>
          </div>
        `}).join('') : emptyState('لا تصويتات حالياً', '')}
      </div>
    `;
    
    root.querySelectorAll('[data-vote]').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          const res = await post(`/api/votes/${btn.dataset.vote}/cast`, { choice: btn.dataset.choice });
          if(res.fingerprint) toast('تم تسجيل صوتك • ' + res.fingerprint, 'success');
          sound.success();
          render(root);
        } catch(e){ sound.error(); toast(e.message,'danger'); }
      });
    });
  } catch (e) {
    root.innerHTML = `<div class="card"><h3>خطأ</h3><p class="muted">${esc(e.message)}</p></div>`;
  }
}
