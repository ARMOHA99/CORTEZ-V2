import { get, post, del } from '../core/api.js';
import { esc, pageHeader, emptyState, toast, timeAgo } from '../core/ui.js';

export const meta = { title: 'عقد الدم', kicker: 'BLOOD PACT' };

export async function render(root) {
  root.innerHTML = '<div class="view-loading"><div class="loader-ring"></div></div>';
  try {
    const data = await get('/api/pacts');
    root.innerHTML = `
      ${pageHeader({ kicker: 'BLOOD PACT', title: 'عقد الدم', description: `إصدار ${esc('V'+(data.version||1))} • ${data.stats?.signed||0}/${data.stats?.total||0} موقع` })}
      <div class="grid grid-2">
        <div class="card">
          <div class="card-head"><div><p class="eyebrow">SIGNED</p><h3>الموقّعون</h3></div></div>
          <div class="card-body">
            ${(data.signatures||[]).map(s=>`
              <div class="kv"><span>${esc(s.displayName)}</span><strong>${esc(s.fingerprint||'')}</strong></div>
            `).join('')}
          </div>
        </div>
        <div class="card">
          <div class="card-head"><div><p class="eyebrow">PENDING</p><h3>لم يوقّعوا بعد</h3></div></div>
          <div class="card-body">
            ${(data.unsigned||[]).length ? data.unsigned.map(u=>`
              <div class="kv"><span>${esc(u.name)}</span><span class="muted">${esc(u.rankName)}</span></div>
            `).join('') : '<p class="muted">الجميع وقّعوا</p>'}
          </div>
        </div>
      </div>
    `;
  } catch (e) {
    root.innerHTML = `<div class="card"><h3>خطأ</h3><p class="muted">${esc(e.message)}</p></div>`;
  }
  await renderDevices(root);
}

/* بطاقة تطبيق الدوام: تحميل + ربط الجهاز + إدارة الأجهزة */
async function renderDevices(root) {
  let status = null;
  try {
    status = await get('/api/agent/status');
  } catch (error) {
    return;
  }
  if (!status || !status.enabled) return;

  const card = document.createElement('div');
  card.className = 'card';
  card.style.marginTop = '18px';
  const devices = status.devices || [];
  card.innerHTML = `
    <div class="card-head">
      <div><p class="eyebrow">CORTEZ AGENT</p><h3>تطبيق الدوام</h3></div>
      <span class="badge ${status.linked ? 'ok' : 'muted'}">${status.linked ? 'مرتبط' : 'غير مرتبط'}</span>
    </div>
    <div class="card-body">
      <p class="muted" style="margin-top:0">التطبيق يفحص اتصالك بسيرفر فايفم (${esc(status.target || '')}) ويسجّل دوامك تلقائيًا. ملف واحد صغير، بلا نافذة، ويعمل مع تشغيل ويندوز.</p>
      <div class="adm-actions" style="margin-bottom:12px">
        <a class="btn btn-primary btn-sm" href="${esc(status.downloadUrl || '/download/CortezAgent.exe')}">تحميل التطبيق (V${esc(status.version || '1.0.0')})</a>
        <button class="btn btn-primary btn-sm" type="button" id="pact-agent-auto">ربط جهازي الآن</button>
        <button class="btn btn-ghost btn-sm" type="button" id="pact-agent-code">رمز ربط يدوي</button>
      </div>
      <div class="agent-code-box hidden" id="pact-agent-box">
        <div class="agent-code-line"><span class="muted">الرمز</span><strong id="pact-agent-value">--------</strong><span class="muted">صالح 30 دقيقة</span></div>
        <div class="agent-cmd"><code id="pact-agent-cmd">CortezAgent.exe --link XXXXXXXX</code><button class="btn btn-ghost btn-sm" type="button" id="pact-agent-copy">نسخ</button></div>
      </div>
      <div id="pact-agent-list">${devices.length
        ? devices.map((d) => `<div class="kv"><span>${esc(d.label || 'جهاز')} <span class="muted">${esc(d.platform || '')}</span></span><span class="${d.duty ? 'ok' : 'muted'}">${d.duty ? 'على الدوام' : d.online ? 'متصل' : 'غير متصل'}</span><button class="btn btn-ghost btn-sm" data-unlink="${esc(d.id)}">فصل</button></div>`).join('')
        : '<p class="muted">لا يوجد جهاز مرتبط بعد.</p>'}</div>
    </div>`;
  root.appendChild(card);

  const btn = card.querySelector('#pact-agent-code');
  if (btn) {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        const data = await post('/api/agent/code', {});
        card.querySelector('#pact-agent-box').classList.remove('hidden');
        card.querySelector('#pact-agent-value').textContent = data.code;
        card.querySelector('#pact-agent-cmd').textContent = `CortezAgent.exe --link ${data.code}`;
      } catch (error) {
        toast(error.message, 'danger');
      } finally {
        btn.disabled = false;
      }
    });
  }
  const auto = card.querySelector('#pact-agent-auto');
  if (auto) {
    auto.addEventListener('click', async () => {
      auto.disabled = true;
      try {
        const data = await post('/api/agent/code', {});
        card.querySelector('#pact-agent-box').classList.remove('hidden');
        card.querySelector('#pact-agent-value').textContent = data.code;
        card.querySelector('#pact-agent-cmd').textContent = `CortezAgent.exe --link ${data.code}`;
        location.href = `cortezagent://link/${data.code}`;
      } catch (error) {
        toast(error.message, 'danger');
      } finally {
        setTimeout(() => { auto.disabled = false; }, 4000);
      }
    });
  }

  const copy = card.querySelector('#pact-agent-copy');
  if (copy) {
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(card.querySelector('#pact-agent-cmd').textContent);
        copy.textContent = 'تم النسخ';
        setTimeout(() => { copy.textContent = 'نسخ'; }, 1500);
      } catch (error) { /* تجاهل */ }
    });
  }
  card.querySelectorAll('[data-unlink]').forEach((el) => {
    el.addEventListener('click', async () => {
      try {
        await del(`/api/agent/device/${el.dataset.unlink}`);
        toast('تم فصل الجهاز', 'success');
        card.remove();
        await renderDevices(root);
      } catch (error) { toast(error.message, 'danger'); }
    });
  });
}
