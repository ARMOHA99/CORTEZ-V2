/**
 * CORTEZ — بطاقات تُضاف بعد رسم الصفحة:
 *   • بطاقة السلسلة والأوسمة
 *   • غرفة الأخبار (من AuditLog)
 *   • تفعيل إشعارات المتصفح
 */

import { get } from './api.js';
import { state } from './state.js';
import { esc, duration, hours, timeAgo, toast } from './ui.js';
import { pushSupported, pushStatus, enablePush, disablePush, sendTestPush } from './push.js';

function heatmap(last14 = []) {
  return `<div class="streak-heat" aria-label="آخر 14 يومًا">
    ${last14
      .map((day) => {
        const level = day.counted ? (day.minutes >= 180 ? 4 : day.minutes >= 90 ? 3 : 2) : day.minutes > 0 ? 1 : 0;
        return `<span class="heat-cell heat-${level} ${day.today ? 'is-today' : ''}"
          title="${esc(day.dateKey)} • ${esc(duration(day.minutes || 0))}"></span>`;
      })
      .join('')}
  </div>`;
}

export async function mountStreakCard(root) {
  if (!root || root.querySelector('#streak-card')) return;
  const holder = document.createElement('section');
  holder.id = 'streak-card';
  holder.className = 'stack';
  holder.innerHTML = '<div class="card"><div class="skeleton skel-title"></div><div class="skeleton skel-line"></div></div>';
  root.appendChild(holder);

  try {
    const data = await get('/api/streak/me');
    const streak = data.streak || {};
    const medals = Array.isArray(streak.medals) ? streak.medals : [];
    const next = streak.nextMedal;
    const shareId = state.user?._id || '';

    holder.innerHTML = `
      <div class="card streak-card">
        <div class="card-head">
          <div>
            <p class="eyebrow">LOYALTY</p>
            <h3>سلسلة الولاء</h3>
          </div>
          <span class="badge ${streak.todayCounted ? 'success' : 'warning'}">
            ${streak.todayCounted ? 'سجّلت اليوم' : 'لم تسجّل اليوم بعد'}
          </span>
        </div>
        <div class="streak-grid">
          <div class="streak-cell">
            <strong>${Number(streak.currentStreak) || 0}</strong>
            <span>سلسلة حالية (يوم)</span>
          </div>
          <div class="streak-cell">
            <strong>${Number(streak.longestStreak) || 0}</strong>
            <span>أطول سلسلة</span>
          </div>
          <div class="streak-cell">
            <strong>${Number(streak.commitment30) || 0}%</strong>
            <span>التزام آخر 30 يومًا</span>
          </div>
          <div class="streak-cell">
            <strong>${hours(streak.totalMinutes || 0)}</strong>
            <span>إجمالي الساعات</span>
          </div>
        </div>
        ${heatmap(streak.last14 || [])}
        ${
          medals.length
            ? `<div class="medal-row">${medals
                .map(
                  (medal) =>
                    `<span class="medal medal-${esc(medal.tone || 'info')}" title="${esc(medal.label)}">${esc(medal.icon || '◆')} ${esc(medal.label)}</span>`
                )
                .join('')}</div>`
            : '<p class="muted">لا أوسمة بعد. سجّل دوامك اليوم لتفتح أول وسام.</p>'
        }
        ${next ? `<p class="muted streak-next">الوسام القادم: ${esc(next.label)} — يتبقى ${esc(next.need)} ${esc(next.unit)}</p>` : ''}
        ${
          shareId
            ? `<div class="row" style="gap:8px;flex-wrap:wrap">
                 <a class="btn btn-ghost btn-sm" href="/u/${esc(shareId)}" target="_blank" rel="noopener">شارك بطاقتي</a>
                 <a class="btn btn-ghost btn-sm" href="/#/duty">${streak.todayCounted ? 'دوامي' : 'ابدأ الدوام'}</a>
               </div>`
            : ''
        }
      </div>`;
  } catch (error) {
    holder.remove();
  }
}

export async function mountFeedCard(root) {
  if (!root || root.querySelector('#feed-card')) return;
  const holder = document.createElement('section');
  holder.id = 'feed-card';
  holder.className = 'stack';
  holder.innerHTML = '<div class="card"><div class="skeleton skel-title"></div><div class="skeleton skel-line"></div></div>';
  root.appendChild(holder);

  try {
    const data = await get('/api/public/feed');
    const items = Array.isArray(data.items) ? data.items : [];
    holder.innerHTML = `
      <div class="card feed-card">
        <div class="card-head">
          <div>
            <p class="eyebrow">LIVE FEED</p>
            <h3>غرفة الأخبار</h3>
          </div>
          <span class="badge">${items.length} حدث</span>
        </div>
        ${
          items.length
            ? `<ul class="feed-list">${items
                .map(
                  (item) => `
              <li class="feed-item feed-${esc(item.tone || 'muted')}">
                <span class="feed-dot"></span>
                <div class="feed-body">
                  <p><strong>${esc(item.actor)}</strong> — ${esc(item.label)}</p>
                  ${item.description ? `<small>${esc(item.description)}</small>` : ''}
                </div>
                <time>${esc(timeAgo(item.at))}</time>
              </li>`
                )
                .join('')}</ul>`
            : '<p class="muted">لا أحداث بعد. أول حركة ستظهر هنا فورًا.</p>'
        }
      </div>`;
  } catch (error) {
    holder.remove();
  }
}

export async function mountPushCard(root) {
  if (!root || root.querySelector('#push-card')) return;
  const holder = document.createElement('section');
  holder.id = 'push-card';
  holder.className = 'stack';
  root.appendChild(holder);

  if (!pushSupported()) {
    holder.innerHTML = `<div class="card"><div class="card-head"><div><p class="eyebrow">ALERTS</p><h3>إشعارات المتصفح</h3></div></div>
      <p class="muted">متصفحك لا يدعم إشعارات الويب.</p></div>`;
    return;
  }

  let status = { enabled: false, subscribed: false, permission: 'default' };
  try {
    status = await pushStatus();
  } catch (error) {
    status = { enabled: false, subscribed: false, permission: 'default' };
  }

  function paint() {
    const subscribed = Boolean(status.subscribed);
    holder.innerHTML = `
      <div class="card push-card">
        <div class="card-head">
          <div>
            <p class="eyebrow">ALERTS</p>
            <h3>إشعارات المتصفح</h3>
          </div>
          <span class="badge ${subscribed ? 'success' : status.enabled ? 'warning' : 'muted'}">
            ${subscribed ? 'مفعّلة' : status.enabled ? 'غير مفعّلة' : 'غير مهيّأة'}
          </span>
        </div>
        <p class="muted">
          تصلك تنبيهات التحذيرات والتصويتات والطلبات حتى لو كان الموقع مغلقًا.
          ${status.enabled ? '' : ' الإدارة لم تضبط مفاتيح الإشعارات على الخادم بعد.'}
        </p>
        <div class="row" style="gap:8px;flex-wrap:wrap">
          ${
            subscribed
              ? '<button class="btn btn-ghost btn-sm" data-push="off">إيقاف الإشعارات</button>'
              : `<button class="btn btn-primary btn-sm" data-push="on" ${status.enabled ? '' : 'disabled'}>تفعيل الإشعارات</button>`
          }
          <button class="btn btn-ghost btn-sm" data-push="test" ${subscribed ? '' : 'disabled'}>إرسال تجربة</button>
        </div>
      </div>`;

    holder.querySelectorAll('[data-push]').forEach((button) => {
      button.addEventListener('click', async () => {
        const action = button.dataset.push;
        button.disabled = true;
        try {
          if (action === 'on') {
            await enablePush();
            toast('تم تفعيل الإشعارات', 'success');
          } else if (action === 'off') {
            await disablePush();
            toast('تم إيقاف الإشعارات', 'info');
          } else if (action === 'test') {
            const result = await sendTestPush();
            toast(result.sent ? 'أُرسل إشعار تجريبي' : 'لم يُرسل: تحقق من الاشتراك', result.sent ? 'success' : 'warning');
          }
          status = await pushStatus();
        } catch (error) {
          toast(error.message, 'danger');
        } finally {
          paint();
        }
      });
    });
  }

  paint();
}
