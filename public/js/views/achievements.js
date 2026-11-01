import { get } from '../core/api.js';
import { state } from '../core/state.js';
import { esc, num, pageHeader, emptyState, toast, date } from '../core/ui.js';
import * as sound from '../core/sound.js';

export const meta = { title: 'الأوسمة', kicker: 'ACHIEVEMENTS' };

let filter = 'all';
let group = 'الكل';
let cache = null;

const SHAPES = ['shield', 'hex', 'circle', 'diamond', 'star', 'crown', 'drop'];

function medal(badge, owned) {
  const shape = SHAPES.includes(badge.shape) ? badge.shape : 'hex';
  return `
    <div class="ach-medal shape-${shape} ${owned ? 'is-owned' : 'is-locked'}" style="--ach:${esc(badge.color)}">
      <span class="ach-medal-inner">
        <span class="ach-icon">${esc(badge.icon)}</span>
        ${owned ? '' : '<span class="ach-lock">🔒</span>'}
      </span>
    </div>`;
}

function card(badge) {
  const owned = Boolean(badge.awardedAt);
  const pct = Math.max(0, Math.min(100, badge.percent || 0));
  const valueText = badge.metric === 'marketEarnings' ? num(badge.value) : badge.value;
  return `
    <article class="ach-card ${owned ? 'is-owned' : 'is-locked'}" style="--ach:${esc(badge.color)}" data-state="${owned ? 'owned' : 'locked'}" data-badge-group="${esc(badge.group)}">
      ${medal(badge, owned)}
      <div class="ach-body">
        <div class="ach-head">
          <h4>${esc(badge.name)}</h4>
          <span class="ach-tier" style="--tier:${esc(badge.tierColor)}">${esc(badge.tierLabel)}</span>
        </div>
        <p class="ach-desc">${esc(badge.desc)}</p>
        <div class="ach-req"><span>الشرط</span> ${esc(badge.req)}</div>
        <div class="ach-bar"><span style="width:${pct}%"></span></div>
        <div class="ach-foot">
          <span class="ach-progress">${num(valueText)} / ${num(badge.target)}</span>
          ${owned
            ? `<span class="ach-date">${esc(date(badge.awardedAt))}</span>`
            : `<span class="ach-locked-label">${pct}%</span>`}
        </div>
      </div>
    </article>`;
}

function ring(stats) {
  const pct = Math.max(0, Math.min(100, stats.percent || 0));
  return `
    <div class="ach-ring" style="--pct:${pct}">
      <div class="ach-ring-hole">
        <strong>${num(stats.unlocked)}</strong>
        <span>من ${num(stats.total)}</span>
      </div>
    </div>`;
}

function renderList(root) {
  const data = cache;
  if (!data) return;
  const list = data.badges.filter((badge) => {
    const stateOk = filter === 'all' || (filter === 'owned' ? badge.awardedAt : !badge.awardedAt);
    const groupOk = group === 'الكل' || badge.group === group;
    return stateOk && groupOk;
  });
  const grid = root.querySelector('#ach-grid');
  if (!grid) return;
  grid.innerHTML = list.length ? list.map(card).join('') : emptyState('لا وسام في هذا التصنيف', '');
  const counter = root.querySelector('#ach-count');
  if (counter) counter.textContent = `${list.length} وسام`;
}

export async function render(root) {
  root.innerHTML = '<div class="view-loading"><div class="loader-ring"></div></div>';
  try {
    const data = await get('/api/achievements');
    cache = data;
    const stats = data.stats || { total: 0, unlocked: 0, percent: 0, byTier: {} };
    const groups = ['الكل', ...Array.from(new Set((data.badges || []).map((badge) => badge.group)))];
    const tierOrder = [
      { key: 'legend', label: 'أسطوري' },
      { key: 'gold', label: 'ذهبي' },
      { key: 'silver', label: 'فضي' },
      { key: 'bronze', label: 'برونزي' }
    ];

    root.innerHTML = `
      ${pageHeader({
        kicker: 'ACHIEVEMENTS',
        title: 'أوسمة العائلة',
        description: 'كل وسام يُفتح بشرط حقيقي في مسارك: دوام، عمليات، انضباط، سوق، ورتبة.'
      })}

      <div class="ach-hero card">
        ${ring(stats)}
        <div class="ach-hero-body">
          <h3>تقدّمك في الأوسمة</h3>
          <p class="muted">${stats.unlocked >= stats.total ? 'أكملت كل الأوسمة الحالية. لا شيء يتبقى إلا أن يصنع الموقع أوسمة جديدة لك.' : `أنجزت ${num(stats.unlocked)} وسامًا، ويتبقى ${num(stats.total - stats.unlocked)}.`}</p>
          <div class="ach-tiers">
            ${tierOrder.map((tier) => `<span class="ach-tier-chip tier-${tier.key}">${tier.label} <b>${num(stats.byTier?.[tier.key] || 0)}</b></span>`).join('')}
          </div>
          ${(data.leaders || []).length ? `
            <div class="ach-leaders">
              <span class="muted">الأكثر أوسمة:</span>
              ${data.leaders.map((leader) => `<a class="ach-leader" href="#/members" title="${esc(leader.name)}"><span>${esc(leader.name)}</span><b>${num(leader.count)}</b></a>`).join('')}
            </div>` : ''}
        </div>
      </div>

      <div class="ach-filters">
        <div class="ach-chip-row">
          <button class="ach-chip ${filter === 'all' ? 'active' : ''}" data-filter="all">الكل</button>
          <button class="ach-chip ${filter === 'owned' ? 'active' : ''}" data-filter="owned">مفتوحة</button>
          <button class="ach-chip ${filter === 'locked' ? 'active' : ''}" data-filter="locked">مقفلة</button>
        </div>
        <div class="ach-chip-row">
          ${groups.map((name) => `<button class="ach-chip ghost ${group === name ? 'active' : ''}" data-group="${esc(name)}">${esc(name)}</button>`).join('')}
        </div>
      </div>

      <div class="ach-meta"><span id="ach-count">${(data.badges || []).length} وسام</span></div>
      <div class="ach-grid" id="ach-grid"></div>
    `;

    renderList(root);

    root.querySelectorAll('[data-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        filter = btn.dataset.filter;
        root.querySelectorAll('[data-filter]').forEach((other) => other.classList.toggle('active', other === btn));
        sound.click();
        renderList(root);
      });
    });
    root.querySelectorAll('.ach-chip[data-group]').forEach((btn) => {
      btn.addEventListener('click', () => {
        group = btn.dataset.group;
        root.querySelectorAll('.ach-chip[data-group]').forEach((other) => other.classList.toggle('active', other === btn));
        sound.click();
        renderList(root);
      });
    });

    if ((data.awarded || []).length) {
      const names = data.badges.filter((badge) => data.awarded.includes(badge.key)).map((badge) => badge.name);
      toast(`فتحت وسامًا جديدًا: ${names.join('، ')}`, 'success');
      sound.success();
    }
  } catch (error) {
    root.innerHTML = `<div class="card"><h3>تعذّر تحميل الأوسمة</h3><p class="muted">${esc(error.message)}</p></div>`;
  }
}

export function resetFilters() {
  filter = 'all';
  group = 'الكل';
  cache = null;
}

export default { render, meta, resetFilters };
