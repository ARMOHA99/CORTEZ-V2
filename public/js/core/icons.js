/**
 * CORTEZ — مجموعة أيقونات SVG موحّدة
 * كل الأيقونات 24×24، خط 1.7، وترث لون النص الحالي.
 */

const PATHS = {
  dashboard: '<rect x="3" y="3" width="7.5" height="7.5" rx="1.6"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6"/>',
  duty: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3.2 1.9"/>',
  attendance: '<rect x="3" y="5" width="18" height="16" rx="2.2"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M8.5 14.5h2M13.5 14.5h2"/>',
  leaderboard: '<path d="M8 21h8M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 5H4.5a2.5 2.5 0 0 0 2.5 4M17 5h2.5a2.5 2.5 0 0 1-2.5 4"/>',
  operations: '<path d="M14.5 3.5 20.5 9.5 9.5 20.5 3.5 14.5z"/><path d="M3.5 3.5l5 5M20.5 14.5l-5-5"/>',
  items: '<path d="M12 3 3.5 7v10L12 21l8.5-4V7z"/><path d="M3.5 7 12 11l8.5-4M12 11v10"/>',
  treasury: '<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 10h18"/><circle cx="16.5" cy="14.5" r="1.2"/>',
  votes: '<path d="M12 3v18M5 8h14"/><path d="M5 8 2 15a3 3 0 0 0 6 0zM19 8l-3 7a3 3 0 0 0 6 0z"/>',
  members: '<circle cx="9" cy="8" r="3.4"/><path d="M2.8 20c0-3.2 2.8-5.4 6.2-5.4s6.2 2.2 6.2 5.4"/><path d="M16.5 5.4a3.2 3.2 0 0 1 0 6.2M18 14.9c2 .6 3.4 2.2 3.4 4.4"/>',
  achievements: '<circle cx="12" cy="9" r="5.5"/><path d="M8.6 13.6 7 21l5-2.6L17 21l-1.6-7.4"/>',
  discipline: '<path d="M12 3.5 21.5 20H2.5z"/><path d="M12 9.5v4.5M12 17h.01"/>',
  tickets: '<rect x="3" y="5.5" width="18" height="13" rx="2.4"/><path d="m3.8 7.4 8.2 6 8.2-6"/>',
  pacts: '<path d="M4 20c1.5-4 3.5-6.5 6-8.5"/><path d="M14.5 3.5 21 10l-6.5 6.5-3.6-.4-2.5-2.5-.4-3.6z"/><path d="m17 6.5-6 6"/>',
  store: '<path d="M4 9.5V20h16V9.5"/><path d="M3 9.5 5.5 4h13L21 9.5z"/><path d="M9.5 20v-5h5v5"/>',
  shop: '<path d="M5 8h14l-1.3 12H6.3z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>',
  orders: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  announcements: '<path d="M4 10v4l12 5V5z"/><path d="M16 7.5a4 4 0 0 1 0 9"/><path d="M4 14h-1.5v-4H4"/>',
  admin: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M4.2 7l2.6 1.5M17.2 15.5l2.6 1.5M4.2 17l2.6-1.5M17.2 8.5l2.6-1.5"/>',
  bell: '<path d="M6 9a6 6 0 0 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 13 6 9z"/><path d="M10 18a2 2 0 0 0 4 0"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5 5l1.8 1.8M17.2 17.2 19 19M19 5l-1.8 1.8M6.8 17.2 5 19"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>'
};

export function icon(name, size = 18, className = '') {
  const path = PATHS[name] || PATHS.dashboard;
  const sizeAttr = Number(size) || 18;
  return `<svg class="ico ${className}" viewBox="0 0 24 24" width="${sizeAttr}" height="${sizeAttr}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

export function hasIcon(name) {
  return Boolean(PATHS[name]);
}
