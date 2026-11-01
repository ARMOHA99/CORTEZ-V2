import { get } from '../core/api.js';
import { esc, num, pageHeader, avatar } from '../core/ui.js';

export const meta = { title: 'لوحة الشرف', kicker: 'LEADERBOARD' };

export async function render(root) {
  root.innerHTML = '<div class="view-loading"><div class="loader-ring"></div></div>';
  try {
    const data = await get('/api/leaderboard');
    const items = data.items || [];
    root.innerHTML = `
      ${pageHeader({ kicker: 'HALL OF HONOR', title: 'لوحة الشرف', description: `ترتيب الأعضاء حسب الأداء - ${esc(data.weekKey||'')}` })}
      ${items.length >= 3 ? `
      <div class="podium">
        <div class="podium-place second">
          ${items[1]?`<div class="avatar">${items[1].avatar?`<img src="https://cdn.discordapp.com/avatars/${items[1]._id}/${items[1].avatar}.png?size=128" />`:`<span>${esc((items[1].name||'ك').charAt(0))}</span>`}</div><strong data-member-id="${esc(String(items[1]._id))}">${esc(items[1].name)}</strong><small>${esc(items[1].rankName)}</small><div class="podium-base">2</div>`:''}
        </div>
        <div class="podium-place first">
          ${items[0]?`<div class="avatar">${items[0].avatar?`<img src="https://cdn.discordapp.com/avatars/${items[0]._id}/${items[0].avatar}.png?size=128" />`:`<span>${esc((items[0].name||'ك').charAt(0))}</span>`}</div><strong data-member-id="${esc(String(items[0]._id))}">${esc(items[0].name)}</strong><small>${esc(items[0].rankName)}</small><div class="podium-base">1</div>`:''}
        </div>
        <div class="podium-place third">
          ${items[2]?`<div class="avatar">${items[2].avatar?`<img src="https://cdn.discordapp.com/avatars/${items[2]._id}/${items[2].avatar}.png?size=128" />`:`<span>${esc((items[2].name||'ك').charAt(0))}</span>`}</div><strong data-member-id="${esc(String(items[2]._id))}">${esc(items[2].name)}</strong><small>${esc(items[2].rankName)}</small><div class="podium-base">3</div>`:''}
        </div>
      </div>
      `:''}
      <div class="card">
        <div class="card-body">
          ${items.slice(3).map((item,i)=>`
            <div class="rank-row">
              <span class="rank-pos">${i+4}</span>
              <div class="avatar" style="width:38px;height:38px">${item.avatar?`<img src="https://cdn.discordapp.com/avatars/${item._id}/${item.avatar}.png?size=64" />`:`<span>${esc((item.name||'ك').charAt(0))}</span>`}</div>
              <div style="flex:1" data-member-id="${esc(String(item._id))}"><strong>${esc(item.name)}</strong><small class="muted" style="color:${esc(item.rankColor)}">${esc(item.rankName)}</small></div>
              <div class="row" style="gap:16px;font-size:12px"><span class="muted">${num(Math.floor(item.minutes/60))}س</span><span class="muted">${num(item.operations)} عملية</span><span class="rank-score">${num(item.score)} نقطة</span></div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  } catch (e) {
    root.innerHTML = `<div class="card"><h3>خطأ</h3><p class="muted">${esc(e.message)}</p></div>`;
  }
}
