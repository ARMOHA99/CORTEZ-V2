import { get, post, del } from '../core/api.js';
import { esc, pageHeader, toast, timeAgo } from '../core/ui.js';

export const meta = { title: 'تطبيق الدوام', kicker: 'CORTEZ AGENT' };

export async function render(root) {
  root.innerHTML = '<div class="view-loading"><div class="loader-ring"></div></div>';
  let status = null;
  try {
    status = await get('/api/agent/status');
  } catch (error) {
    root.innerHTML = `<div class="card"><h3>خطأ</h3><p class="muted">${esc(error.message)}</p></div>`;
    return;
  }
  if (!status || !status.enabled) {
    root.innerHTML = '<div class="card"><h3>تطبيق الدوام</h3><p class="muted">هذا النظام غير مفعّل حالياً.</p></div>';
    return;
  }

  const devices = status.devices || [];
  const download = status.downloadUrl || '/download/CortezAgent.exe';
  root.innerHTML = `
    ${pageHeader({ kicker: 'CORTEZ AGENT', title: 'تطبيق الدوام', description: `ملف واحد صغير يسجّل دوامك تلقائياً من اتصالك بسيرفر ${esc(status.target || 'فايفم')}` })}
    <div class="grid grid-2">
      <div class="card">
        <div class="card-body">
          <h3 style="margin-top:0">حمّل التطبيق</h3>
          <p class="muted">النسخة ${esc(status.version || '1.3.0')} • لا يحتاج صلاحية أدمين • يعمل مع تشغيل ويندوز</p>
          ${(status.devices || []).some((d) => d.version && d.version !== status.version)
            ? `<p class="pact-warning" style="margin:6px 0">عندك نسخة قديمة من التطبيق — نزّل الجديدة من الزر أعلاه وشغّلها، وستحدّث نفسها.</p>`
            : ''}
          <a class="btn btn-primary" href="${esc(download)}" download>تحميل CortezAgent.exe</a>
          <ol class="muted" style="margin:14px 0 0;padding-inline-start:18px;font-size:13px;line-height:2">
            <li>شغّل الملف الذي نزّلته (تفتح نافذة صغيرة).</li>
            <li>ارجع لهذه الصفحة واضغط «ربط جهازي الآن».</li>
            <li>وافق على فتح CortezAgent في المتصفح — انتهى الربط.</li>
          </ol>
        </div>
      </div>

      <div class="card">
        <div class="card-body">
          <h3 style="margin-top:0">ربط الجهاز</h3>
          <p class="muted">حالة الربط: <strong class="${status.linked ? 'ok' : ''}">${status.linked ? 'مرتبط' : 'غير مرتبط'}</strong>${status.duty ? ' • على الدوام الآن' : ''}</p>
          <div class="adm-actions">
            <button class="btn btn-primary" type="button" id="agent-auto">ربط جهازي الآن</button>
            <button class="btn btn-ghost" type="button" id="agent-manual">رمز ربط يدوي</button>
            ${status.duty ? '<button class="btn btn-danger" type="button" id="agent-cancel-shift">إلغاء الدوام الحالي بلا احتساب</button>' : ''}
          </div>
          <div class="agent-code-box hidden" id="agent-box" style="margin-top:14px">
            <div class="agent-code-line"><span class="muted">الرمز</span><strong id="agent-code-value">--------</strong><span class="muted">صالح 30 دقيقة</span></div>
            <div class="agent-cmd"><code id="agent-cmd">CortezAgent.exe --link XXXXXXXX</code><button class="btn btn-ghost btn-sm" type="button" id="agent-copy">نسخ</button></div>
            <p class="muted" style="font-size:12px;margin:8px 0 0">الصق الرمز داخل نافذة التطبيق ثم اضغط «ربط الجهاز».</p>
          </div>
        </div>
      </div>
    </div>

    <div class="card" style="margin-top:18px">
      <div class="card-head"><div><p class="eyebrow">DEVICES</p><h3>أجهزتي</h3></div></div>
      <div class="card-body" id="agent-devices">
        ${devices.length
          ? devices.map((d) => `<div class="kv"><span>${esc(d.label || 'جهاز')} <span class="muted">${esc(d.platform || '')}</span> <span class="muted">v${esc(d.version || '?')}</span></span><span class="${d.duty ? 'ok' : 'muted'}">${d.duty ? 'على الدوام' : d.online ? 'متصل' : 'غير متصل'}</span><span class="muted">${d.lastSeenAt ? timeAgo(d.lastSeenAt) : 'لم ينبض بعد'}</span><button class="btn btn-ghost btn-sm" data-unlink="${esc(d.id)}">فصل</button></div>${d.diag ? `<p class="muted" style="font-size:11.5px;margin:2px 0 8px">آخر فحص: ${esc(d.diag)}</p>` : ''}`).join('')
          : '<p class="muted">لا يوجد جهاز مرتبط بعد.</p>'}
      </div>
    </div>`;

  const box = root.querySelector('#agent-box');
  const codeValue = root.querySelector('#agent-code-value');
  const cmd = root.querySelector('#agent-cmd');

  const askCode = async () => {
    const data = await post('/api/agent/code', {});
    box.classList.remove('hidden');
    codeValue.textContent = data.code;
    cmd.textContent = `CortezAgent.exe --link ${data.code}`;
    return data.code;
  };

  const auto = root.querySelector('#agent-auto');
  auto.addEventListener('click', async () => {
    auto.disabled = true;
    try {
      const code = await askCode();
      location.href = `cortezagent://link/${code}`;
      toast('تم إرسال الرمز للتطبيق — وافق على الفتح في المتصفح', 'info');
    } catch (error) {
      toast(error.message, 'danger');
    } finally {
      setTimeout(() => { auto.disabled = false; }, 4000);
    }
  });

  const manual = root.querySelector('#agent-manual');
  manual.addEventListener('click', async () => {
    try {
      await askCode();
    } catch (error) {
      toast(error.message, 'danger');
    }
  });

  const cancelBtn = root.querySelector('#agent-cancel-shift');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', async () => {
      cancelBtn.disabled = true;
      try {
        await post('/api/agent/cancel-shift', {});
        toast('أُلغي الدوام بلا احتساب دقائق', 'success');
        render(root);
      } catch (error) {
        toast(error.message, 'danger');
        cancelBtn.disabled = false;
      }
    });
  }

  root.querySelector('#agent-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(cmd.textContent);
      toast('تم نسخ الأمر', 'success');
    } catch (error) {
      toast('انسخ الرمز يدوياً', 'warning');
    }
  });

  root.querySelectorAll('[data-unlink]').forEach((el) => {
    el.addEventListener('click', async () => {
      try {
        await del(`/api/agent/device/${el.dataset.unlink}`);
        toast('تم فصل الجهاز', 'success');
        render(root);
      } catch (error) {
        toast(error.message, 'danger');
      }
    });
  });
}
