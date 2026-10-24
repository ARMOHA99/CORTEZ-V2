import { get } from '../core/api.js';
import { esc, timeAgo, pageHeader, emptyState } from '../core/ui.js';

export const meta = { title: 'الإعلانات', kicker: 'ANNOUNCEMENTS' };

export async function render(root) {
  root.innerHTML = '<div class="view-loading"><div class="loader-ring"></div></div>';
  try {
    const data = await get('/api/announcements');
    root.innerHTML = `
      ${pageHeader({ kicker: 'NEWS', title: 'إعلانات العائلة', description: 'أهم الأخبار والتعميمات.' })}
      <div class="stack">
        ${(data.items||[]).length ? data.items.map(a => `
          <div class="announcement ${a.severity}" style="padding:18px">
            <div class="a-head"><strong style="font-size:15px">${esc(a.title)}</strong>${a.pinned?'<span class="badge">مثبت</span>':''}</div>
            <p style="margin-top:8px">${esc(a.body)}</p>
            <time>${timeAgo(a.createdAt)}</time>
          </div>
        `).join('') : emptyState('لا إعلانات', '')}
      </div>
    `;
  } catch (e) {
    root.innerHTML = `<div class="card"><h3>خطأ</h3><p class="muted">${esc(e.message)}</p></div>`;
  }
}
