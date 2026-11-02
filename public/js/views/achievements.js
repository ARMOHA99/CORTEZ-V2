import { get, post, del } from '../core/api.js';
import { state, can } from '../core/state.js';
import { esc, num, pageHeader, emptyState, toast, date, openModal } from '../core/ui.js';
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

/* عرض أوسمة عضو آخر في نافذة (يستخدمه سجل الأعضاء ولوحة الشرف) */
export async function openMemberBadges(memberId, fallbackName = '') {
  const box = openModal({
    title: fallbackName ? `أوسمة ${fallbackName}` : 'أوسمة العضو',
    subtitle: 'MEMBER ACHIEVEMENTS',
    body: '<div class="view-loading"><div class="loader-ring"></div></div>',
    footer: '<button class="btn btn-ghost" data-close>إغلاق</button>',
    onMount: (m) => {
      const btn = m.el.querySelector('[data-close]');
      if (btn) btn.onclick = () => m.close();
    }
  });
  const body = box.el.querySelector('.modal-body') || box.el;
  try {
    const data = await get(`/api/achievements/u/${memberId}`);
    const member = data.member || {};
    const stats = data.stats || { total: 0, unlocked: 0 };
    const owned = (data.badges || []).filter((badge) => badge.unlocked);
    const locked = (data.badges || []).filter((badge) => !badge.unlocked).length;
    body.innerHTML = `
      <div class="ach-member-head">
        <div class="ach-member-avatar">${
          member.avatar ? `<img src="${esc(member.avatar)}" alt="" />` : esc((member.name || 'ع').charAt(0))
        }</div>
        <div class="ach-member-id">
          <strong>${esc(member.name || fallbackName || 'عضو')}</strong>
          <span class="muted">${esc(member.username ? '@' + member.username : '')}</span>
        </div>
        <div class="ach-member-score">
          <b>${num(stats.unlocked || owned.length)}</b>
          <span>من ${num(stats.total || 0)}</span>
        </div>
      </div>
      <div class="ach-mini-grid">
        ${owned.length
          ? owned.map((badge) => `
            <div class="ach-mini" style="--ach:${esc(badge.color || '#22c55e')}" title="${esc(badge.req || '')}">
              <span class="ach-mini-medal shape-${esc(badge.shape || 'hex')}">${esc(badge.icon || '★')}</span>
              <span class="ach-mini-name">${esc(badge.name)}</span>
            </div>`).join('')
          : '<p class="muted">لم يحصل على أي وسام بعد.</p>'}
      </div>
      <p class="muted" style="margin-top:10px">${num(locked)} وسام ما زال مقفلًا.</p>`;
  } catch (error) {
    body.innerHTML = `<p class="muted">${esc(error.message)}</p>`;
  }
  return box;
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
              ${data.leaders.map((leader) => `<button class="ach-leader" type="button" data-ach-member="${esc(leader.id)}" data-ach-name="${esc(leader.name)}" title="اعرض أوسمة ${esc(leader.name)}"><span>${esc(leader.name)}</span><b>${num(leader.count)}</b></button>`).join('')}
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
      ${can('settings:manage') ? '<div id="ach-admin"></div>' : ''}
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
    root.querySelectorAll('[data-ach-member]').forEach((btn) => {
    btn.addEventListener('click', () => openMemberBadges(btn.dataset.achMember, btn.dataset.achName || ''));
  });

  root.querySelectorAll('.ach-chip[data-group]').forEach((btn) => {
      btn.addEventListener('click', () => {
        group = btn.dataset.group;
        root.querySelectorAll('.ach-chip[data-group]').forEach((other) => other.classList.toggle('active', other === btn));
        sound.click();
        renderList(root);
      });
    });

    if (can('settings:manage')) initAdmin(root);

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

/* ═════════════ إدارة أوسمة الأعضاء (للقيادة) ═════════════ */
let adminMember = null;

function initAdmin(root) {
  const box = root.querySelector('#ach-admin');
  if (!box) return;
  box.innerHTML = `
    <div class="card ach-admin">
      <div class="ach-admin-head">
        <div>
          <h3>إدارة أوسمة الأعضاء</h3>
          <p class="muted">ابحث عن عضو، ثم اسحب منه وسامًا بعينه أو صفّر أوسمته كلها.</p>
        </div>
      </div>
      <div class="ach-search">
        <input type="text" id="ach-q" placeholder="اسم العضو أو آي دي ديسكورد" />
        <button class="btn btn-primary btn-sm" id="ach-search-btn" type="button">بحث</button>
      </div>
      <div id="ach-results" class="ach-results"></div>
      <div id="ach-manage"></div>
    </div>
  `;

  const input = box.querySelector('#ach-q');
  const results = box.querySelector('#ach-results');
  const panel = box.querySelector('#ach-manage');
  const runSearch = async () => {
    const query = String(input.value || '').trim();
    if (query.length < 2) return toast('اكتب حرفين على الأقل', 'warning');
    results.innerHTML = '<p class="muted">جارٍ البحث…</p>';
    try {
      const data = await get(`/api/members?search=${encodeURIComponent(query)}&limit=8`);
      const items = data.items || [];
      results.innerHTML = items.length
        ? items.map((m) => `<button class="ach-member" data-member="${esc(m._id || m.id)}" type="button"><span>${esc(m.displayName || m.username || 'عضو')}</span><small>${esc(m.rankName || m.rank || '')}</small></button>`).join('')
        : '<p class="muted">لا نتائج</p>';
      results.querySelectorAll('[data-member]').forEach((btn) => {
        btn.addEventListener('click', () => openMember(btn.dataset.member));
      });
    } catch (error) {
      results.innerHTML = `<p class="muted">${esc(error.message)}</p>`;
    }
  };
  box.querySelector('#ach-search-btn').addEventListener('click', runSearch);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); runSearch(); }
  });

  const openMember = async (id) => {
    adminMember = id;
    panel.innerHTML = '<p class="muted">جارٍ التحميل…</p>';
    try {
      const data = await get(`/api/achievements/${encodeURIComponent(id)}/manage`);
      renderMember(panel, data);
    } catch (error) {
      panel.innerHTML = `<p class="muted">${esc(error.message)}</p>`;
    }
  };
}

function renderMember(panel, data) {
  const member = data.member || {};
  const items = data.items || [];
  panel.innerHTML = `
    <div class="ach-manage-head">
      <div>
        <strong>${esc(member.name)}</strong>
        <span class="muted"> • ${num(data.ownedCount)} وسام مفتوح${data.blockedCount ? ` • ${num(data.blockedCount)} مسحوب` : ''}</span>
      </div>
      <div class="ach-manage-actions">
        ${data.blockedCount ? '<button class="btn btn-ghost btn-sm" id="ach-allow" type="button">إعادة السماح بالمنح التلقائي</button>' : ''}
        <button class="btn btn-ghost btn-sm danger" id="ach-reset" type="button">تصفير كل أوسمته</button>
      </div>
    </div>
    <div class="ach-manage-grid">
      ${items.map((item) => `
        <div class="ach-manage-item ${item.owned ? 'is-owned' : ''} ${item.blocked ? 'is-blocked' : ''}" style="--ach:${esc(item.color)}">
          <span class="ach-manage-ico">${esc(item.icon)}</span>
          <div class="ach-manage-info">
            <strong>${esc(item.name)}</strong>
            <small>${item.owned ? 'مفتوح' : item.blocked ? 'مسحوب' : `${num(item.percent)}% تقدّم`}</small>
          </div>
          <button class="btn btn-xs ${item.owned ? 'btn-ghost danger' : 'btn-ghost'}" data-key="${esc(item.key)}" data-act="${item.owned ? 'revoke' : 'grant'}" type="button">
            ${item.owned ? 'اسحب' : 'امنح'}
          </button>
        </div>`).join('')}
    </div>
  `;

  const reload = () => get(`/api/achievements/${encodeURIComponent(adminMember)}/manage`).then((fresh) => renderMember(panel, fresh)).catch(() => null);

  panel.querySelectorAll('[data-act]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        if (btn.dataset.act === 'revoke') {
          await del(`/api/achievements/${encodeURIComponent(adminMember)}/${encodeURIComponent(btn.dataset.key)}`);
          toast('سُحب الوسام', 'success');
        } else {
          await post(`/api/achievements/${encodeURIComponent(adminMember)}/grant`, { key: btn.dataset.key });
          toast('مُنح الوسام', 'success');
        }
        sound.success();
        await reload();
      } catch (error) {
        sound.error();
        toast(error.message, 'danger');
        btn.disabled = false;
      }
    });
  });

  panel.querySelector('#ach-reset')?.addEventListener('click', async (event) => {
    const btn = event.currentTarget;
    if (btn.dataset.confirm !== '1') {
      btn.dataset.confirm = '1';
      btn.textContent = 'تأكيد التصفير؟ اضغط مرة أخرى';
      setTimeout(() => { btn.dataset.confirm = ''; btn.textContent = 'تصفير كل أوسمته'; }, 4000);
      return;
    }
    btn.disabled = true;
    try {
      const result = await del(`/api/achievements/${encodeURIComponent(adminMember)}`);
      toast(`صُفّرت أوسمته (${num(result.removed || 0)})`, 'success');
      sound.success();
      await reload();
    } catch (error) {
      sound.error();
      toast(error.message, 'danger');
      btn.disabled = false;
    }
  });

  panel.querySelector('#ach-allow')?.addEventListener('click', async (event) => {
    const btn = event.currentTarget;
    btn.disabled = true;
    try {
      await post(`/api/achievements/${encodeURIComponent(adminMember)}/allow`, {});
      toast('أُعيد السماح بالمنح التلقائي', 'success');
      await reload();
    } catch (error) {
      sound.error();
      toast(error.message, 'danger');
      btn.disabled = false;
    }
  });
}
