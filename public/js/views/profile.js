import { get } from '../core/api.js';
import { state } from '../core/state.js';
import { esc, hours, num, pageHeader } from '../core/ui.js';

export const meta = { title: 'ملفي الشخصي', kicker: 'PROFILE' };

export async function render(root) {
  root.innerHTML = '<div class="view-loading"><div class="loader-ring"></div></div>';
  try {
    const data = await get('/api/me/card');
    const card = data.card || {};
    root.innerHTML = `
      ${pageHeader({ kicker: 'IDENTITY', title: 'بطاقتي', description: 'بطاقة العضو الرسمية.' })}
      <div class="member-card-stage">
        <div class="member-card-3d tilt">
          <div class="mc-head">
            <div class="avatar-lg">${card.user?.avatar?`<img src="https://cdn.discordapp.com/avatars/${card.user.discordId}/${card.user.avatar}.png?size=256" />`:`<span>${esc((card.user?.name||'ك').charAt(0))}</span>`}</div>
            <div>
              <h3>${esc(card.user?.name||'')}</h3>
              <p>${esc(card.rank?.name||'')} • ${esc(card.org||'كورتاس')}</p>
            </div>
          </div>
          <div class="mc-stats">
            <div class="mc-stat"><strong>${hours(card.duty?.weeklyMinutes||0)}</strong><span>ساعات الأسبوع</span></div>
            <div class="mc-stat"><strong>${num(card.operations?.total||0)}</strong><span>عمليات</span></div>
            <div class="mc-stat"><strong>${num(card.operations?.wins||0)}</strong><span>انتصارات</span></div>
            <div class="mc-stat"><strong>${card.operations?.winRate||0}%</strong><span>نسبة الفوز</span></div>
          </div>
          <div class="mc-foot">
            <div>
              <p class="eyebrow">BLOOD PACT</p>
              <p class="muted">${card.bloodPact?.signed ? 'موقّع' : 'غير موقّع'}</p>
            </div>
            <div class="fingerprint-mini ${card.bloodPact?.signed?'signed':''}"><span></span><span></span><span></span><span></span></div>
          </div>
        </div>
      </div>
    `;
  } catch (e) {
    root.innerHTML = `<div class="card"><h3>خطأ</h3><p class="muted">${esc(e.message)}</p></div>`;
  }
}
