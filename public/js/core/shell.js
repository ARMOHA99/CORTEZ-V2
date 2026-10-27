/**
 * CORTEZ — غلاف التطبيق (شريط جانبي، علوي، إشعارات، قائمة)
 */
import { state, on, can, emit } from './state.js';
import { api, get, post } from './api.js';
import { esc, avatar, avatarUrl, timeAgo, userCell } from './ui.js';
import { initSocket } from './socket.js';
import * as sound from './sound.js';
import { applyBrand } from './brand.js';

const NAV = [
  { group: 'عام', items: [
    { id: 'dashboard', label: 'داشبورد', icon: '◆', route: '#/dashboard', perm: 'dashboard:view' },
    { id: 'duty', label: 'الدوام', icon: '◉', route: '#/duty' },
    { id: 'attendance', label: 'جدول الحضور', icon: '▦', route: '#/attendance', perm: 'attendance:view' },
    { id: 'leaderboard', label: 'لوحة الشرف', icon: '★', route: '#/leaderboard', perm: 'leaderboard:view' }
  ]},
  { group: 'العمليات', items: [
    { id: 'operations', label: 'غرفة العمليات', icon: '⚔', route: '#/operations', perm: 'operations:view' },
    { id: 'items', label: 'غرفة الأيتمات', icon: '◫', route: '#/items', perm: 'items:view' },
    { id: 'treasury', label: 'الخزينة', icon: '$', route: '#/treasury', perm: 'treasury:view' },
    { id: 'votes', label: 'التصويتات', icon: '⚖', route: '#/votes', perm: 'votes:view' }
  ]},
  { group: 'العائلة', items: [
    { id: 'members', label: 'سجل الأعضاء', icon: '◈', route: '#/members', perm: 'members:view' },
    { id: 'discipline', label: 'سجل الانضباط', icon: '⚠', route: '#/discipline', perm: 'discipline:view' },
    { id: 'tickets', label: 'التذاكر', icon: '✉', route: '#/tickets' },
    { id: 'pacts', label: 'عقد الدم', icon: '✒', route: '#/pacts', perm: 'pacts:view' }
  ]},
  { group: 'الخدمات', items: [
    { id: 'store', label: 'المتجر الداخلي', icon: '■', route: '#/store-internal', perm: 'store:internal' },
    { id: 'orders', label: 'الطلبات', icon: '▢', route: '#/orders' },
    { id: 'announcements', label: 'الإعلانات', icon: '◔', route: '#/announcements' }
  ]},
  { group: 'إدارة', items: [
    { id: 'admin', label: 'لوحة الإدارة', icon: '⚙', route: '#/admin', anyPerm: ['settings:manage', 'ranks:manage', 'store:manage', 'announcements:manage', 'discipline:manage', 'pacts:manage', 'members:manage'] }
  ]}
];

function visibleItem(item) {
  if (item.perm && !can(item.perm)) return false;
  if (item.anyPerm && !item.anyPerm.some((perm) => can(perm))) return false;
  return true;
}

export function renderNav() {
  const nav = document.getElementById('side-nav');
  const mobile = document.getElementById('mobile-nav');
  if (!nav) return;
  const html = NAV.map((group) => {
    const items = group.items.filter(visibleItem);
    if (!items.length) return '';
    return `<div class="nav-group-label">${esc(group.group)}</div>` + items.map((item) => 
      `<a href="${item.route}" class="side-link" data-nav="${item.id}" data-sound="click"><span class="nav-icon">${item.icon}</span><span>${esc(item.label)}</span></a>`
    ).join('');
  }).join('');
  nav.innerHTML = html || '';
  if (mobile) {
    const mhtml = NAV.flatMap((g) => g.items).filter(visibleItem).slice(0, 6).map((item) =>
      `<a href="${item.route}" class="mobile-link" data-nav="${item.id}" data-sound="click"><span>${item.icon}</span><span>${esc(item.label)}</span></a>`
    ).join('');
    mobile.innerHTML = mhtml;
  }
}

export function setActiveNav(route) {
  document.querySelectorAll('.side-link, .mobile-link').forEach((el) => el.classList.toggle('active', el.getAttribute('href') === route));
}

export function renderUserChip() {
  const chip = document.getElementById('sidebar-user');
  const topAvatar = document.getElementById('top-avatar');
  const topName = document.getElementById('top-name');
  const topRank = document.getElementById('top-rank');
  const user = state.user;
  const rank = state.rank;
  if (!user) return;
  if (chip) {
    const url = avatarUrl(user);
    chip.innerHTML = `<div class="user-chip-avatar">${url ? `<img src="${esc(url)}" alt="" />` : esc((user.displayName || user.username || 'ك').charAt(0))}</div><div class="user-chip-copy"><strong>${esc(user.displayName || user.username || 'عضو')}</strong><small style="color:${esc(rank && rank.color ? rank.color : '#9b9296')}">${esc(rank ? rank.name : 'زائر')}</small></div>`;
  }
  if (topAvatar) {
    const url = avatarUrl(user);
    if (url) { topAvatar.src = url; topAvatar.style.display = 'block'; } else { topAvatar.removeAttribute('src'); topAvatar.style.display = 'none'; }
  }
  if (topName) topName.textContent = user.displayName || user.username || 'عضو';
  if (topRank) { topRank.textContent = rank ? rank.name : 'زائر'; topRank.style.color = rank && rank.color ? rank.color : '#9b9296'; }
}

export function renderOnline() {
  const count = state.online || 0;
  const el = document.getElementById('online-count');
  const sel = document.getElementById('sidebar-online');
  if (el) el.textContent = count;
  if (sel) sel.textContent = count;
}

export function renderNotifications() {
  const badge = document.getElementById('notif-badge');
  const list = document.getElementById('notif-list');
  const data = state.notifications || { unread: 0, items: [] };
  if (badge) {
    if (data.unread > 0) { badge.textContent = data.unread > 99 ? '99+' : data.unread; badge.classList.remove('hidden'); }
    else badge.classList.add('hidden');
  }
  if (list) {
    if (!data.items.length) {
      list.innerHTML = '<div class="empty" style="padding:16px"><small class="muted">لا إشعارات جديدة</small></div>';
      return;
    }
    list.innerHTML = data.items.slice(0, 10).map((item) => 
      `<a class="notif-item ${item.read ? '' : 'unread'}" href="${item.link || '#'}"><strong>${esc(item.title)}</strong>${item.body ? `<p>${esc(item.body)}</p>` : ''}<time>${timeAgo(item.createdAt)}</time></a>`
    ).join('');
  }
}

export function initShell() {
  const app = document.getElementById('app');
  const menuBtn = document.getElementById('menu-btn');
  const sidebarClose = document.getElementById('sidebar-close');
  const sidebar = document.getElementById('sidebar');
  const profileBtn = document.getElementById('profile-btn');
  const profileMenu = document.getElementById('profile-menu');
  const notifBtn = document.getElementById('notif-btn');
  const notifPanel = document.getElementById('notif-panel');
  const notifReadAll = document.getElementById('notif-read-all');
  const logoutBtn = document.getElementById('logout-btn');
  const syncBtn = document.getElementById('sync-btn');
  const discordLink = document.getElementById('sidebar-discord');

  if (app) app.classList.add('entering');

  const setDrawer = (open) => {
    if (!sidebar) return;
    sidebar.classList.toggle('open', open);
    if (app) app.classList.toggle('nav-open', open);
    document.body.classList.toggle('sidebar-open', open);
  };

  if (menuBtn && sidebar) menuBtn.addEventListener('click', (e) => { e.stopPropagation(); setDrawer(!sidebar.classList.contains('open')); sound.click(); });
  if (sidebarClose && sidebar) sidebarClose.addEventListener('click', () => setDrawer(false));
  document.addEventListener('click', (e) => {
    if (!sidebar || !sidebar.classList.contains('open')) return;
    if (sidebar.contains(e.target) && !e.target.closest('a.side-link')) return;
    if (menuBtn && menuBtn.contains(e.target)) return;
    setDrawer(false);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setDrawer(false); });
  window.addEventListener('hashchange', () => setDrawer(false));

  if (profileBtn && profileMenu) {
    profileBtn.addEventListener('click', (e) => { e.stopPropagation(); profileMenu.classList.toggle('hidden'); if (notifPanel) notifPanel.classList.add('hidden'); });
  }
  if (notifBtn && notifPanel) {
    notifBtn.addEventListener('click', (e) => { e.stopPropagation(); notifPanel.classList.toggle('hidden'); if (profileMenu) profileMenu.classList.add('hidden'); get('/api/me/notifications').then((d) => { state.notifications = { unread: d.unread || 0, items: d.items || [] }; renderNotifications(); emit('notifications', state.notifications); }).catch(() => {}); });
  }
  document.addEventListener('click', () => { if (profileMenu) profileMenu.classList.add('hidden'); if (notifPanel) notifPanel.classList.add('hidden'); });

  if (notifReadAll) notifReadAll.addEventListener('click', async () => {
    try { await post('/api/me/notifications/read-all'); state.notifications.unread = 0; state.notifications.items = (state.notifications.items || []).map((i) => ({ ...i, read: true })); renderNotifications(); sound.click(); } catch (e) { /* ignore */ }
  });

  if (logoutBtn) logoutBtn.addEventListener('click', async () => {
    try { await post('/auth/logout'); window.location.href = '/'; } catch (e) { window.location.href = '/'; }
  });

  if (syncBtn) syncBtn.addEventListener('click', async () => {
    try { const res = await post('/api/me/sync'); if (res.user) state.user = res.user; renderUserChip(); sound.success(); window.location.reload(); } catch (e) { sound.error(); alert(e.message); }
  });

  if (discordLink && state.config) {
    const invite = (state.config.links && state.config.links.discordInvite) || (state.config.discord && state.config.discord.inviteUrl);
    if (invite) { discordLink.href = invite; } else { discordLink.style.display = 'none'; }
  }

  on('me', () => { renderNav(); renderUserChip(); renderOnline(); renderNotifications(); applyBrand(document); });
  on('notifications', () => renderNotifications());
  on('online', () => renderOnline());
  on('socket:connected', () => {});

  initSocket();
}
