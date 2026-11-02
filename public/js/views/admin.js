/**
 * CORTEZ — لوحة الإدارة الكاملة
 * تبويبات: نظرة عامة • الإعدادات • الرتب والصلاحيات • الأعضاء • المتجر • الإعلانات • الإنذارات • العقد
 */
import { get, post, patch, del, upload } from '../core/api.js';
import { state, can } from '../core/state.js';
import { esc, num, date, pageHeader, openModal, confirmDialog, promptDialog, toast, debounce, timeAgo, emptyState, badge, statusBadge } from '../core/ui.js';
import { applyBrand } from '../core/brand.js';
import { mountPicker } from '../core/picker.js';
import * as sound from '../core/sound.js';

export const meta = { title: 'لوحة الإدارة', kicker: 'ADMIN' };

const TABS = [
  { id: 'overview', label: 'نظرة عامة', perm: 'settings:manage' },
  { id: 'settings', label: 'الإعدادات', perm: 'settings:manage' },
  { id: 'ranks', label: 'الرتب والصلاحيات', perm: 'ranks:manage' },
  { id: 'members', label: 'الأعضاء', perm: 'members:view' },
  { id: 'store', label: 'المتجر', perm: 'store:manage' },
  { id: 'announcements', label: 'الإعلانات', perm: 'announcements:manage' },
  { id: 'discipline', label: 'الإنذارات', perm: 'discipline:manage' },
  { id: 'pact', label: 'عقد الدم', perm: 'pacts:manage' }
];

const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

const GROUP_LABELS = {
  dashboard: 'الداشبورد', attendance: 'الحضور', leaderboard: 'لوحة الشرف', members: 'الأعضاء', ranks: 'الرتب',
  duty: 'الدوام', operations: 'العمليات', store: 'المتجر', orders: 'الطلبات',
  discipline: 'الانضباط', tickets: 'التذاكر', votes: 'التصويت', pacts: 'عقد الدم',
  announcements: 'الإعلانات', settings: 'الإعدادات', audit: 'سجل التدقيق', system: 'النظام'
};

const CATEGORIES = { weapon: 'سلاح', drug: 'مواد', gear: 'عتاد', vehicle: 'مركبة', service: 'خدمة', other: 'أخرى' };
const SCOPES = { both: 'خارجي وداخلي', external: 'خارجي فقط', internal: 'داخلي فقط' };
const SEVERITIES = { normal: 'عادي', urgent: 'عاجل', critical: 'حرج' };

let currentTab = 'overview';
let memberSearch = '';
let memberPage = 1;

/* يصغّر الصور الكبيرة قبل الرفع حتى لا تتجاوز الحد المسموح */
async function shrinkImage(file) {
  try {
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type) || file.size < 900 * 1024) return file;
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, 0.88));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, type === 'image/png' ? '.png' : '.jpg'), { type });
  } catch (error) {
    return file;
  }
}

const idOf = (item) => String((item && (item._id || item.id)) || '');
const errBox = (e) => `<div class="card"><div class="card-body"><h3>خطأ</h3><p class="muted">${esc(e.message || 'حدث خطأ')}</p></div></div>`;
const loading = '<div class="view-loading"><div class="loader-ring"></div></div>';

function sw(name, label, checked) {
  return `<label class="adm-switch"><input type="checkbox" name="${name}" ${checked ? 'checked' : ''} /> ${esc(label)}</label>`;
}

/* ═══════════════════════ نظرة عامة ═══════════════════════ */
async function tabOverview(box) {
  const data = await get('/api/admin/overview');
  const st = data.stats || {};
  box.innerHTML = `
    <div class="grid grid-4">
      <div class="kpi"><div class="kpi-label">المستخدمين</div><div class="kpi-value">${num(st.users || 0)}</div></div>
      <div class="kpi"><div class="kpi-label">متصل</div><div class="kpi-value">${num(st.online || 0)}</div></div>
      <div class="kpi"><div class="kpi-label">الطلبات</div><div class="kpi-value">${num(st.orders || 0)}</div></div>
      <div class="kpi primary"><div class="kpi-label">الإصدار</div><div class="kpi-value">${esc(st.release || '—')}</div></div>
    </div>
    <div class="card" style="margin-top:18px">
      <div class="card-head"><div><p class="eyebrow">SYSTEM</p><h3>معلومات النظام</h3></div></div>
      <div class="card-body">
        <div class="kv"><span>قاعدة البيانات</span><strong>${st.db === 'connected' || st.db === true ? 'متصل' : 'غير متصل'}</strong></div>
        <div class="kv"><span>البيئة</span><strong>${esc(st.env || '—')}</strong></div>
      </div>
    </div>`;
}

/* ═══════════════════════ الإعدادات ═══════════════════════ */
async function tabSettings(box) {
  const { settings: s } = await get('/api/admin/settings');
  const night = s['system.nightShift'] || {};
  let attRanks = [];
  let dcRoles = [];
  try { attRanks = (await get('/api/admin/ranks')).ranks || []; } catch (e) { attRanks = []; }
  try { dcRoles = (await get('/api/admin/discord-roles')).roles || []; } catch (e) { dcRoles = []; }
  const attRoles = Array.isArray(s['attendance.warnRoles']) ? s['attendance.warnRoles'] : ['', '', ''];
  const attExempt = Array.isArray(s['attendance.exemptRanks']) ? s['attendance.exemptRanks'] : ['owner', 'operations', 'business'];
  const lockBypass = Array.isArray(s['system.nightLockBypass']) ? s['system.nightLockBypass'].map(String) : [];
  const attRoleField = (i) => (dcRoles.length
    ? `<select id="att-role-${i}"><option value="">— بلا —</option>${dcRoles.map((r) => `<option value="${esc(r.id)}" ${String(attRoles[i] || '') === r.id ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select>`
    : `<input type="text" id="att-role-${i}" value="${esc(attRoles[i] || '')}" placeholder="ID الرول" />`);
  const logo = s['organization.logoUrl'] || '';
  const name = s['organization.name'] || 'CORTEZ';

  box.innerHTML = `
  <form id="set-form" class="adm-form">
    <div class="adm-grid">
      <div class="card"><div class="card-body adm-form">
        <h3>الهوية</h3>
        <label>اسم المنظمة (يظهر بدل الاسم العربي)<input type="text" name="orgName" value="${esc(name)}" maxlength="40" /></label>
        <div class="adm-row">
          <div class="adm-logo-prev" id="logo-prev">${logo ? `<img src="${esc(logo)}" alt="" />` : esc(name.charAt(0).toUpperCase())}</div>
          <div style="flex:1;display:grid;gap:8px">
            <input class="adm-input" type="file" id="logo-file" accept="image/png,image/jpeg,image/webp,image/gif" />
            <input class="adm-input" type="text" name="logoUrl" id="logo-url" value="${esc(logo)}" placeholder="أو الصق رابط الصورة هنا" />
          </div>
        </div>
        <p class="adm-note">يظهر الشعار مكان الرمز القديم في كل الموقع. إن لم يكن Cloudinary مفعّلًا على Render فقد يضيع الملف المرفوع عند إعادة النشر، والأفضل لصق رابط صورة ثابت.</p>
        <button class="btn btn-ghost btn-sm" type="button" id="logo-clear">إزالة الشعار</button>
      </div></div>

      <div class="card"><div class="card-body adm-form">
        <h3>نصوص صفحة الدخول</h3>
        <p class="adm-note">كل ما يراه الزائر قبل تسجيل الدخول. اتركه فارغًا للرجوع إلى النص الافتراضي.</p>
        <label>السطر العلوي الصغير<input type="text" name="landingEyebrow" maxlength="80" value="${esc(s['landing.eyebrow'] || '')}" placeholder="CORTEZ CRIME SYNDICATE • LOS SANTOS" /></label>
        <label>الجملة الكبرى (تحت الاسم)<input type="text" name="heroTagline" maxlength="120" value="${esc(s['organization.tagline'] || '')}" /></label>
        <label>النص التعريفي<textarea name="heroDesc" rows="3" maxlength="400">${esc(s['organization.description'] || '')}</textarea></label>
        <label>زر الدخول الأساسي<input type="text" name="ctaPrimary" maxlength="80" value="${esc(s['landing.ctaPrimary'] || '')}" /></label>
        <label>زر المتجر<input type="text" name="ctaStore" maxlength="60" value="${esc(s['landing.ctaStore'] || '')}" /></label>
        <div class="adm-grid">
          <label>مسمّى الإحصائية ١<input type="text" name="statMembers" maxlength="40" value="${esc(s['landing.statMembers'] || '')}" /></label>
          <label>مسمّى الإحصائية ٢<input type="text" name="statOperations" maxlength="40" value="${esc(s['landing.statOperations'] || '')}" /></label>
          <label>مسمّى الإحصائية ٣<input type="text" name="statOnline" maxlength="40" value="${esc(s['landing.statOnline'] || '')}" /></label>
        </div>
        <label>شعار التذييل<input type="text" name="motto" maxlength="120" value="${esc(s['organization.motto'] || '')}" /></label>
        <label>سطر الحقوق في الأسفل<input type="text" name="footerNote" maxlength="200" value="${esc(s['landing.footerNote'] || '')}" placeholder="اتركه فارغًا ليبقى النص الحالي" /></label>
      </div></div>

      <div class="card"><div class="card-body adm-form">
        <h3>الحضور والدوام</h3>
        ${sw('requireRole', 'لا يدخل الموقع إلا من يملك رولاً مربوطاً برتبة (ويُطرد عند سحب الرول)', s['access.requireDiscordRole'] !== false)}
        ${sw('attendanceEnabled', 'تسجيل الحضور مفعّل', s['attendance.enabled'] !== false)}
        <label>اليوم الذي يبدأ منه الأسبوع (يُصفَّر عنده الحضور والهدف)
          <select name="weekStartDay">${WEEKDAYS.map((d, i) => `<option value="${i}" ${Number(s['system.weekStartDay']) === i ? 'selected' : ''}>${d}</option>`).join('')}</select>
        </label>
        ${sw('nightEnabled', 'تفعيل وقت الدوام المسموح', night.enabled !== false)}
        ${sw('nightLock', 'قفل الدوام خارج النافذة', Boolean(night.lock))}
        <div class="adm-row">
          <label style="flex:1">الدوام مسموح من<input type="time" name="nightStart" value="${esc(night.start || '22:00')}" /></label>
          <label style="flex:1">إلى (اليوم التالي)<input type="time" name="nightEnd" value="${esc(night.end || '06:00')}" /></label>
        </div>
        <label>رتب تتجاوز قفل الدوام (Ctrl للاختيار المتعدد — اتركها فاضية ليطبَّق القفل على الجميع بمن فيهم القيادة)
          <select id="night-bypass" multiple size="5">${attRanks.map((r) => `<option value="${esc(r.key)}" ${lockBypass.includes(r.key) ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select>
        </label>
        <p class="adm-note" id="night-stored">المحفوظ الآن على السيرفر: من ${esc(night.start || '22:00')} إلى ${esc(night.end || '06:00')} — القفل ${night.lock ? 'مفعّل' : 'مطفّي'}${s.__meta && s.__meta['system.nightShift'] && s.__meta['system.nightShift'].updatedAt ? ` (آخر حفظ: ${new Date(s.__meta['system.nightShift'].updatedAt).toLocaleString('en-GB', { timeZone: 'Africa/Algiers' })})` : ' (لم يُحفظ تعديل بعد)'}</p>
        <p class="adm-note">النافذة معناه: الدوام مسموح <strong>داخلها فقط</strong>. القفل يمنع <strong>بدء واستئناف</strong> الشفت قبل بدايتها أو بعد نهايتها، ويسمح دائمًا بإنهاء الدوام. هذه النافذة تخص الدوام فقط؛ حساب يوم الحضور والتقييم في بطاقة «الحضور والإنذارات» أسفل — أو خلّها مزامنة وتتبع هذه النافذة تلقائيًا.</p>
        <label>إغلاق الدوام تلقائيًا بعد (ساعات، 0 = معطّل)<input type="number" name="autoClose" min="0" max="72" value="${Number(s['system.autoCloseDutyHours']) || 0}" /></label>
      </div></div>

      <div class="card" style="margin-top:18px"><div class="card-body adm-form">
        <p class="eyebrow">ATTENDANCE &amp; WARNINGS</p>
        <h3>الحضور والإنذارات</h3>
        <p class="adm-note">يعمل عندما يكون «تسجيل الحضور مفعّل» في بطاقة «الحضور والدوام». عند وصول وقت الإغلاق يُقيَّم كل عضو: من سجّل أقل من الحد الأدنى يُحسب غائبًا، والغياب المتتالي يفتح وارنًا متصاعدًا.</p>

        <h4 class="adm-sec">١) يوم الحضور — من متى إلى متى يُحسب اليوم</h4>
        ${sw('attSyncNight', 'خلّي يوم الحضور يتبع نافذة الدوام الليلي تلقائيًا (بدايتها ونهايتها)', s['attendance.syncNightWindow'] === true)}
        <div class="adm-row">
          <label style="flex:1">بداية يوم الحضور<input type="time" id="att-day-start" value="${esc(s['attendance.dayStart'] || '10:00')}" /></label>
          <label style="flex:1">إغلاق اليوم = وقت التقييم<input type="time" id="att-close" value="${esc(s['attendance.closeTime'] || '02:00')}" /></label>
        </div>
        <p class="adm-note" id="att-window-preview">يوم الحضور: من 10:00 إلى 02:00 من اليوم التالي — كل دقيقة دوام تُسجَّل داخله تُحسب لهذا اليوم. عند الإغلاق يتم التقييم وإصدار الإنذارات.</p>

        <h4 class="adm-sec">٢) شرط الحضور والتبرير</h4>
        <div class="adm-row">
          <label style="flex:1">أقل مدة حضور تُعدّ حضورًا (دقيقة)<input type="number" id="att-min" min="0" max="720" value="${Number(s['attendance.minMinutes'] ?? 30)}" /></label>
          <label style="flex:1">غياب متتالٍ يفتح وارنًا<input type="number" id="att-limit" min="1" max="30" value="${Number(s['attendance.absentLimit'] ?? 3)}" /></label>
          <label style="flex:1">مهلة التبرير بعد الغياب (ساعة)<input type="number" id="att-justify" min="0" max="168" value="${Number(s['attendance.justifyHours'] ?? 12)}" /></label>
        </div>

        <h4 class="adm-sec">٣) الإنذارات</h4>
        <div class="adm-row">
          <label style="flex:1">مدة بقاء الوارن (أيام، 0 = بلا نهاية)<input type="number" id="att-warn-days" min="0" max="365" value="${Number(s['attendance.warnDays'] ?? 7)}" /></label>
          <label style="flex:1">إعفاء العضو الجديد من التقييم (أيام)<input type="number" id="att-grace" min="0" max="60" value="${Number(s['attendance.graceDays'] ?? 0)}" /></label>
        </div>
        <div class="adm-row">
          <label style="flex:1">رول الوارن الأول${attRoleField(0)}</label>
          <label style="flex:1">رول الوارن الثاني${attRoleField(1)}</label>
          <label style="flex:1">رول الوارن الثالث${attRoleField(2)}</label>
        </div>
        ${sw('attNotifySelf', 'إرسال رسالة خاصة للعضو عند الإنذار', s['attendance.notifySelf'] !== false)}
        <label>رتب معفاة من التقييم (Ctrl للاختيار المتعدد)
          <select id="att-exempt" multiple size="6">${attRanks.map((r) => `<option value="${esc(r.key)}" ${attExempt.includes(r.key) ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select>
        </label>
        <label>نص رسالة الإنذار (اختياري — بدل النص الافتراضي)<textarea id="att-template" rows="2" maxlength="500">${esc(s['attendance.template'] || '')}</textarea></label>

        <h4 class="adm-sec">٤) غرف ديسكورد — كل غرفة لحالها</h4>
        <div class="adm-row">
          <label style="flex:1">غرفة التنبيهات (تبرير جديد، أشياء تحتاج مراجعة)<input type="text" id="att-notify-channel" value="${esc(s['attendance.notifyChannelId'] || s['attendance.channelId'] || '')}" placeholder="1531406984748994651" /></label>
          <label style="flex:1">غرفة الإنذارات (رسائل الوارن الرسمية)<input type="text" id="att-warn-channel" value="${esc(s['attendance.warnChannelId'] || '')}" placeholder="1566619337241006192" /></label>
          <label style="flex:1">غرفة سجل الحضور اليومي (تقرير الإغلاق)<input type="text" id="att-log" value="${esc(s['attendance.logChannelId'] || '')}" placeholder="اذا تركتها فاضية ما ينشر تقرير" /></label>
        </div>
        ${sw('attSummary', 'نشر تقرير الحضور اليومي في غرفة السجل', s['attendance.dailySummary'] !== false)}
        <button class="btn btn-primary btn-sm" type="button" id="att-save">حفظ إعدادات الحضور</button>
      </div></div>

      <div class="card"><div class="card-body adm-form">
        <h3>الهدف الأسبوعي</h3>
        <label>قيمة الهدف<input type="number" name="goalTarget" min="0" value="${Number(s['system.weeklyGoalTarget']) || 0}" /></label>
        <div class="adm-row">
          <input class="adm-input" type="number" id="goal-amount" placeholder="مبلغ التعديل (+ أو −)" style="flex:1" />
          <input class="adm-input" type="text" id="goal-reason" placeholder="السبب" style="flex:1" />
        </div>
        <div class="adm-actions">
          <button class="btn btn-ghost btn-sm" type="button" id="goal-adjust">تعديل إنجاز الأسبوع</button>
          <button class="btn btn-ghost btn-sm" type="button" id="goal-reset">تدوير / تصفير الأسبوع</button>
        </div>
        <p class="adm-note">«تعديل إنجاز الأسبوع» يضيف المبلغ أو يخصمه من الشريط الحالي. «تدوير الأسبوع» يقفل الأسبوع الحالي ويبدأ أسبوعًا جديدًا.</p>
      </div></div>

      <div class="card"><div class="card-body adm-form">
        <h3>ديسكورد والبوت</h3>
        <label>رابط دعوة سيرفرك (الزر الذي يفتح ديسكورد)<input type="text" name="discordInvite" value="${esc(s['discord.inviteUrl'] || '')}" placeholder="https://discord.gg/xxxxxxx" /></label>
        <label>رقم قناة إشعارات طلبات المتجر<input type="text" name="chOrders" value="${esc(s['discord.channel.orders'] || '')}" placeholder="مثال: 123456789012345678" /></label>
        <label>رقم قناة إشعارات المتجر الداخلي<input type="text" name="chInternal" value="${esc(s['discord.channel.internalOrders'] || '')}" placeholder="اتركه فارغًا لاستخدام قناة المتجر" /></label>
        <label>رقم قناة إشعارات العمليات<input type="text" name="chOperations" value="${esc(s['discord.channel.operations'] || '')}" placeholder="مثال: 123456789012345678" /></label>
        <p class="adm-note">لنسخ رقم قناة: فعّل Developer Mode في ديسكورد ثم كليك يمين على القناة واختر Copy Channel ID. احفظ الإعدادات أولًا ثم اضغط «اختبار».</p>
        <div class="adm-actions">
          <button class="btn btn-ghost btn-sm" type="button" data-test="orders">اختبار قناة الطلبات</button>
          <button class="btn btn-ghost btn-sm" type="button" data-test="internalOrders">اختبار الداخلي</button>
          <button class="btn btn-ghost btn-sm" type="button" data-test="operations">اختبار العمليات</button>
        </div>
        <h4 style="margin:10px 0 0">حالة البوت</h4>
        <div id="bot-status" class="adm-form"></div>
        <div class="adm-actions">
          <button class="btn btn-ghost btn-sm" type="button" id="bot-refresh">فحص البوت</button>
          <button class="btn btn-ghost btn-sm" type="button" id="bot-commands">إعادة تسجيل أوامر / (مثل /card)</button>
          <button class="btn btn-ghost btn-sm" type="button" id="bot-sync-check">فحص مزامنة حسابي</button>
          <button class="btn btn-ghost btn-sm" type="button" id="bot-sync-all">مزامنة أسماء ورتب كل الأعضاء الآن</button>
        </div>
      </div></div>

      <div class="card"><div class="card-body adm-form">
        <h3>المتجر والنظام</h3>
        ${sw('storeExternal', 'المتجر الخارجي مفتوح', s['store.externalEnabled'] !== false)}
        ${sw('storeInternal', 'المتجر الداخلي مفتوح', s['store.internalEnabled'] !== false)}
        ${sw('leaderboardPublic', 'لوحة الشرف عامة', Boolean(s['leaderboard.public']))}
        ${sw('maintenance', 'وضع الصيانة', Boolean(s['system.maintenance']))}
        <label>رسالة الصيانة<input type="text" name="maintenanceMessage" value="${esc(s['system.maintenanceMessage'] || '')}" /></label>
        <label>شريط إعلان أعلى الموقع (اتركه فارغًا لإخفائه)<input type="text" name="banner" value="${esc(s['system.announcementBanner'] || '')}" /></label>
      </div></div>
    </div>
    <div class="adm-actions"><button class="btn btn-primary" type="submit">حفظ الإعدادات</button></div>
  </form>`;

  const form = box.querySelector('#set-form');
  const prev = box.querySelector('#logo-prev');
  const urlInput = box.querySelector('#logo-url');
  const setPrev = () => {
    const v = urlInput.value.trim();
    prev.innerHTML = v ? `<img src="${esc(v)}" alt="" />` : esc((form.orgName.value || 'C').charAt(0).toUpperCase());
  };
  urlInput.addEventListener('input', setPrev);
  box.querySelector('#logo-clear').addEventListener('click', () => { urlInput.value = ''; setPrev(); });
  box.querySelector('#logo-file').addEventListener('change', async (event) => {
    const picked = event.target.files && event.target.files[0];
    if (!picked) return;
    try {
      const file = await shrinkImage(picked);
      const res = await upload(file);
      urlInput.value = res.url;
      setPrev();
      toast(res.note || 'تم رفع الشعار، اضغط «حفظ الإعدادات» لتثبيته', res.note ? 'warning' : 'success');
    } catch (e) { toast(e.message, 'danger'); }
  });

  box.querySelector('#goal-adjust').addEventListener('click', async () => {
    const amount = Number(box.querySelector('#goal-amount').value);
    if (!amount) return toast('اكتب مبلغ التعديل', 'warning');
    try {
      await post('/api/admin/goal/adjust', { amount, reason: box.querySelector('#goal-reason').value });
      toast('تم تعديل إنجاز الأسبوع', 'success');
      box.querySelector('#goal-amount').value = '';
    } catch (e) { toast(e.message, 'danger'); }
  });
  box.querySelector('#goal-reset').addEventListener('click', async () => {
    if (!(await confirmDialog({ title: 'تدوير الأسبوع', message: 'سيُقفل الأسبوع الحالي ويبدأ أسبوع جديد. متأكد؟', confirmText: 'تدوير', danger: true }))) return;
    try { await post('/api/admin/reset-week'); toast('تم تدوير الأسبوع', 'success'); } catch (e) { toast(e.message, 'danger'); }
  });

  const botBox = box.querySelector('#bot-status');
  const botRow = (ok, text) => `<div class="adm-row"><span>${ok ? '✅' : '❌'}</span><span>${esc(text)}</span></div>`;
  async function loadBot() {
    botBox.innerHTML = '<span class="muted">جارٍ فحص البوت…</span>';
    try {
      const { status: st } = await get('/api/admin/bot-status');
      botBox.innerHTML = [
        botRow(st.tokenSet, 'توكن البوت موجود (DISCORD_BOT_TOKEN)'),
        botRow(st.enabled, 'البوت مفعّل (BOT_ENABLED)'),
        botRow(st.ready, st.ready ? `البوت متصل: ${st.tag}` : 'البوت غير متصل بديسكورد'),
        botRow(st.guildIdSet, 'رقم السيرفر موجود (DISCORD_GUILD_ID)'),
        botRow(st.guildFound, st.guildFound ? `البوت داخل السيرفر: ${st.guildName}` : 'البوت غير موجود داخل السيرفر'),
        botRow(st.channels.orders, 'قناة طلبات المتجر محددة'),
        botRow(st.channels.internalOrders, 'قناة المتجر الداخلي محددة'),
        botRow(st.channels.operations, 'قناة العمليات محددة'),
        st.lastError ? `<p class="adm-note" style="color:#4ade80">${esc(st.lastError)}</p>` : ''
      ].join('');
    } catch (e) { botBox.innerHTML = `<span class="muted">${esc(e.message)}</span>`; }
  }
  loadBot();
  box.querySelector('#bot-refresh').addEventListener('click', loadBot);
  box.querySelector('#bot-commands').addEventListener('click', async () => {
    try {
      const res = await post('/api/admin/bot/commands');
      toast(res.ok ? 'تم تسجيل الأوامر في ديسكورد' : 'تعذّر تسجيل الأوامر، راجع حالة البوت', res.ok ? 'success' : 'danger');
      loadBot();
    } catch (e) { toast(e.message, 'danger'); }
  });
  box.querySelector('#bot-sync-all').addEventListener('click', async () => {
    try {
      await post('/api/admin/sync-members');
      toast('بدأت مزامنة كل الأعضاء (الأسماء من سيرفرنا + الرتب). ستظهر النتائج خلال لحظات.', 'success');
    } catch (e) { toast(e.message, 'danger'); }
  });
  box.querySelector('#bot-sync-check').addEventListener('click', async () => {
    try {
      const res = await get('/api/me/sync-check');
      const modal = openModal({
        title: 'فحص مزامنة حسابك',
        subtitle: 'SYNC CHECK',
        body: `${res.problem ? `<p style="color:#4ade80;font-weight:700">${esc(res.problem)}</p>` : '<p style="color:#2ecc71;font-weight:700">لا توجد مشكلة ظاهرة في المزامنة.</p>'}<pre style="direction:ltr;text-align:left;white-space:pre-wrap;font-size:12px">${esc(JSON.stringify(res, null, 2))}</pre>`
      });
      if (!modal) return;
    } catch (e) { toast(e.message, 'danger'); }
  });
  box.querySelectorAll('[data-test]').forEach((btn) => btn.addEventListener('click', async () => {
    try { await post('/api/admin/bot/test', { channel: btn.dataset.test }); toast('وصلت رسالة تجريبية إلى القناة', 'success'); } catch (e) { toast(e.message, 'danger'); }
  }));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const f = form;
    const body = {
      'organization.name': f.orgName.value.trim() || 'CORTEZ',
      'organization.logoUrl': f.logoUrl.value.trim(),
      'organization.tagline': f.heroTagline.value.trim(),
      'organization.motto': f.motto.value.trim(),
      'organization.description': f.heroDesc.value.trim(),
      'landing.eyebrow': f.landingEyebrow.value.trim(),
      'landing.ctaPrimary': f.ctaPrimary.value.trim(),
      'landing.ctaStore': f.ctaStore.value.trim(),
      'landing.statMembers': f.statMembers.value.trim(),
      'landing.statOperations': f.statOperations.value.trim(),
      'landing.statOnline': f.statOnline.value.trim(),
      'landing.footerNote': f.footerNote.value.trim(),
      'access.requireDiscordRole': f.requireRole.checked,
      'attendance.enabled': f.attendanceEnabled.checked,
      'discord.inviteUrl': f.discordInvite.value.trim(),
      'discord.channel.orders': f.chOrders.value.trim(),
      'discord.channel.internalOrders': f.chInternal.value.trim(),
      'discord.channel.operations': f.chOperations.value.trim(),
      'system.weekStartDay': Number(f.weekStartDay.value),
      'system.nightShift': { enabled: f.nightEnabled.checked, lock: f.nightLock.checked, start: f.nightStart.value || '22:00', end: f.nightEnd.value || '06:00' },
      ...(() => {
        const sel = box.querySelector('#night-bypass');
        return sel ? { 'system.nightLockBypass': Array.from(sel.selectedOptions).map((o) => o.value) } : {};
      })(),
      'system.autoCloseDutyHours': Number(f.autoClose.value) || 0,
      'system.weeklyGoalTarget': Number(f.goalTarget.value) || 0,
      'store.externalEnabled': f.storeExternal.checked,
      'store.internalEnabled': f.storeInternal.checked,
      'leaderboard.public': f.leaderboardPublic.checked,
      'system.maintenance': f.maintenance.checked,
      'system.maintenanceMessage': f.maintenanceMessage.value,
      'system.announcementBanner': f.banner.value
    };
    try {
      await patch('/api/admin/settings', { entries: Object.entries(body).map(([key, value]) => ({ key, value })) });
      state.config = state.config || {};
      state.config.org = {
        ...(state.config.org || {}),
        name: body['organization.name'],
        logoUrl: body['organization.logoUrl'],
        tagline: body['organization.tagline'],
        motto: body['organization.motto'],
        description: body['organization.description']
      };
      state.config.landing = {
        eyebrow: body['landing.eyebrow'],
        ctaPrimary: body['landing.ctaPrimary'],
        ctaStore: body['landing.ctaStore'],
        statMembers: body['landing.statMembers'],
        statOperations: body['landing.statOperations'],
        statOnline: body['landing.statOnline'],
        footerNote: body['landing.footerNote']
      };
      state.config.attendanceEnabled = body['attendance.enabled'];
      state.config.discord = { ...(state.config.discord || {}), inviteUrl: body['discord.inviteUrl'] };
      state.config.links = { ...(state.config.links || {}), discordInvite: body['discord.inviteUrl'] };
      const inviteLink = document.getElementById('discord-invite');
      if (inviteLink && body['discord.inviteUrl']) inviteLink.href = body['discord.inviteUrl'];
      applyBrand(document);
      state.config = state.config || {};
      state.config.nightShift = body['system.nightShift'];
      const stored = box.querySelector('#night-stored');
      if (stored) {
        const night = body['system.nightShift'];
        stored.textContent = `المحفوظ الآن على السيرفر: من ${night.start} إلى ${night.end} — القفل ${night.lock ? 'مفعّل' : 'مطفّي'} (تم الحفظ الآن)`;
      }
      sound.success();
      toast(`تم الحفظ — الدوام مسموح من ${body['system.nightShift'].start} إلى ${body['system.nightShift'].end}`, 'success');
    } catch (e) { sound.error(); toast(e.message, 'danger'); }
  });

  const attSync = box.querySelector('[name="attSyncNight"]');
  const attStart = box.querySelector('#att-day-start');
  const attClose = box.querySelector('#att-close');
  const attPreview = box.querySelector('#att-window-preview');
  const nightStart = night.start || '22:00';
  const nightEnd = night.end || '06:00';
  const refreshPreview = () => {
    if (!attPreview || !attStart || !attClose) return;
    const sync = Boolean(attSync && attSync.checked);
    if (sync) {
      attStart.value = nightStart;
      attClose.value = nightEnd;
    }
    attStart.disabled = sync;
    attClose.disabled = sync;
    const toMin = (v) => {
      const m = String(v || '').match(/^(\d{1,2}):(\d{2})$/);
      return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
    };
    const a = toMin(attStart.value);
    let b = toMin(attClose.value);
    if (b <= a) b += 1440;
    const hours = Math.round(((b - a) / 60) * 10) / 10;
    attPreview.textContent = sync
      ? `مزامَن مع نافذة الدوام الليلي: من ${attStart.value} إلى ${attClose.value} من اليوم التالي (${hours} ساعة). أي تعديل على النافذة في بطاقة «الحضور والدوام» ينتقل تلقائيًا هنا.`
      : `يوم الحضور: من ${attStart.value} إلى ${attClose.value} من اليوم التالي (${hours} ساعة) — يُقيَّم مباشرة عند ${attClose.value}.`;
  };
  refreshPreview();
  if (attSync) attSync.addEventListener('change', refreshPreview);
  [attStart, attClose].forEach((el) => el && el.addEventListener('input', refreshPreview));

  /* نافذة الدوام تُحفظ مع زر الحضور كذلك حتى ما يضيع أي تعديل */
  const nightPatch = () => {
    const startEl = box.querySelector('[name="nightStart"]');
    const endEl = box.querySelector('[name="nightEnd"]');
    const enabledEl = box.querySelector('[name="nightEnabled"]');
    const lockEl = box.querySelector('[name="nightLock"]');
    const bypassEl = box.querySelector('#night-bypass');
    const patch = {};
    if (startEl && endEl) {
      patch['system.nightShift'] = {
        enabled: enabledEl ? enabledEl.checked : true,
        lock: lockEl ? lockEl.checked : false,
        start: startEl.value || '22:00',
        end: endEl.value || '03:00'
      };
    }
    if (bypassEl) patch['system.nightLockBypass'] = Array.from(bypassEl.selectedOptions).map((o) => o.value);
    return patch;
  };

  const attSave = box.querySelector('#att-save');
  if (attSave) {
    attSave.addEventListener('click', async () => {
      const val = (id) => { const el = box.querySelector('#' + id); return el ? el.value : ''; };
      try {
        await saveSettingEntries({
          'attendance.dayStart': val('att-day-start') || '10:00',
          'attendance.closeTime': val('att-close') || '02:00',
          'attendance.minMinutes': Number(val('att-min')) || 0,
          'attendance.absentLimit': Number(val('att-limit')) || 3,
          'attendance.justifyHours': Number(val('att-justify')) || 0,
          'attendance.warnDays': Number(val('att-warn-days')) || 0,
          'attendance.graceDays': Number(val('att-grace')) || 0,
          'attendance.syncNightWindow': Boolean(box.querySelector('[name="attSyncNight"]').checked),
          'attendance.notifyChannelId': val('att-notify-channel').trim(),
          'attendance.warnChannelId': val('att-warn-channel').trim(),
          'attendance.logChannelId': val('att-log').trim(),
          'attendance.channelId': val('att-notify-channel').trim(),
          'attendance.warnRoles': [0, 1, 2].map((i) => val('att-role-' + i).trim()),
          ...(() => {
            const sel = box.querySelector('#att-exempt');
            return sel && sel.options.length ? { 'attendance.exemptRanks': Array.from(sel.selectedOptions).map((o) => o.value) } : {};
          })(),
          'attendance.notifySelf': box.querySelector('[name="attNotifySelf"]').checked,
          'attendance.dailySummary': box.querySelector('[name="attSummary"]').checked,
          'attendance.template': val('att-template').trim(),
          ...nightPatch()
        });
        const stored = box.querySelector('#night-stored');
        const night = nightPatch()['system.nightShift'];
        if (stored && night) {
          stored.textContent = `المحفوظ الآن على السيرفر: من ${night.start} إلى ${night.end} — القفل ${night.lock ? 'مفعّل' : 'مطفّي'} (تم الحفظ الآن)`;
        }
        if (night) {
          state.config = state.config || {};
          state.config.nightShift = night;
        }
        sound.success();
        toast(`حُفظ — الدوام مسموح من ${night ? night.start : ''} إلى ${night ? night.end : ''}`, 'success');
      } catch (e) { sound.error(); toast(e.message, 'danger'); }
    });
  }
}

/* ═══════════════════════ الرتب والصلاحيات ═══════════════════════ */
function openRankModal(rank, perms, reload, discordRoles = []) {
  const editing = Boolean(rank);
  const r = rank || { key: '', name: '', short: '', level: 10, order: 50, color: '#22c55e', icon: '◆', discordRoleId: '', description: '', permissions: [] };
  const have = new Set(r.permissions || []);
  const groups = {};
  perms.forEach((p) => { (groups[p.key.split(':')[0]] = groups[p.key.split(':')[0]] || []).push(p); });

  const modal = openModal({
    title: editing ? `تعديل الرتبة: ${r.name}` : 'رتبة جديدة',
    subtitle: 'ROLE',
    size: 'lg',
    body: `
      <form class="adm-form" id="rank-form">
        <div class="adm-grid">
          <label>الاسم<input type="text" name="name" value="${esc(r.name)}" maxlength="60" required /></label>
          <label>المفتاح (إنجليزي)<input type="text" name="key" value="${esc(r.key)}" ${editing ? 'disabled' : ''} placeholder="مثال: captain" /></label>
          <label>الاختصار<input type="text" name="short" value="${esc(r.short || '')}" maxlength="20" /></label>
          <label>المستوى (الأعلى = أقوى)<input type="number" name="level" value="${Number(r.level) || 0}" min="0" max="999" /></label>
          <label>الترتيب في القوائم<input type="number" name="order" value="${Number(r.order) || 0}" /></label>
          <label>اللون<input type="color" name="color" value="${esc(r.color || '#22c55e')}" /></label>
          <label>الرمز<input type="text" name="icon" value="${esc(r.icon || '◆')}" maxlength="8" /></label>
          <label>اختر رول من سيرفر ديسكورد
            <select id="role-pick">
              <option value="">— بدون ربط / إدخال يدوي —</option>
              ${discordRoles.map((dr) => `<option value="${esc(dr.id)}" data-name="${esc(dr.name)}" ${dr.id === r.discordRoleId ? 'selected' : ''}>${esc(dr.name)}</option>`).join('')}
            </select>
          </label>
          <label>رقم الرول في ديسكورد (ID)<input type="text" name="discordRoleId" value="${esc(r.discordRoleId || '')}" placeholder="مثال: 123456789012345678" /></label>
          <label>اسم الرول في ديسكورد<input type="text" name="discordRoleName" value="${esc(r.discordRoleName || '')}" maxlength="100" /></label>
        </div>
        <label>الوصف<input type="text" name="description" value="${esc(r.description || '')}" maxlength="300" /></label>
        <div class="adm-row">
          <strong>الصلاحيات</strong>
          <button class="btn btn-ghost btn-sm" type="button" id="perm-all">تحديد الكل</button>
          <button class="btn btn-ghost btn-sm" type="button" id="perm-none">إلغاء الكل</button>
        </div>
        <div class="adm-grid">
          ${Object.entries(groups).map(([g, list]) => `
            <div class="adm-perm-group"><h5>${esc(GROUP_LABELS[g] || g)}</h5>
              ${list.map((p) => `<label class="adm-perm"><input type="checkbox" value="${esc(p.key)}" ${have.has(p.key) ? 'checked' : ''} /> ${esc(p.label)}</label>`).join('')}
            </div>`).join('')}
        </div>
        <div class="adm-actions"><button class="btn btn-primary" type="submit">${editing ? 'حفظ التعديلات' : 'إنشاء الرتبة'}</button></div>
      </form>`
  });
  if (!modal) return;
  const form = modal.el.querySelector('#rank-form');
  const boxes = () => form.querySelectorAll('.adm-perm input');
  form.querySelector('#role-pick').addEventListener('change', (event) => {
    const option = event.target.selectedOptions[0];
    form.discordRoleId.value = event.target.value;
    form.discordRoleName.value = event.target.value ? (option.dataset.name || '') : '';
  });
  form.querySelector('#perm-all').addEventListener('click', () => boxes().forEach((b) => { b.checked = true; }));
  form.querySelector('#perm-none').addEventListener('click', () => boxes().forEach((b) => { b.checked = false; }));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const body = {
      name: form.name.value.trim(),
      short: form.short.value.trim(),
      level: Number(form.level.value) || 0,
      order: Number(form.order.value) || 0,
      color: form.color.value,
      icon: form.icon.value.trim() || '◆',
      discordRoleId: form.discordRoleId.value.trim(),
      discordRoleName: form.discordRoleName.value.trim(),
      description: form.description.value.trim(),
      permissions: Array.from(boxes()).filter((b) => b.checked).map((b) => b.value)
    };
    try {
      if (editing) await patch(`/api/admin/ranks/${idOf(rank)}`, body);
      else await post('/api/admin/ranks', { ...body, key: form.key.value.trim().toLowerCase() });
      sound.success();
      toast(editing ? 'تم تحديث الرتبة' : 'تم إنشاء الرتبة', 'success');
      modal.close();
      reload();
    } catch (e) { sound.error(); toast(e.message, 'danger'); }
  });
}

async function tabRanks(box) {
  const [{ ranks }, permData, roleData] = await Promise.all([
    get('/api/admin/ranks'),
    get('/api/admin/permissions'),
    get('/api/admin/discord-roles').catch(() => ({ roles: [], available: false }))
  ]);
  const discordRoles = roleData.roles || [];
  const perms = permData.permissions || [];
  const list = (ranks || []).slice().sort((a, b) => (b.level || 0) - (a.level || 0));
  box.innerHTML = `
    <div class="adm-actions" style="margin-bottom:14px"><button class="btn btn-primary" id="rk-new" type="button">+ رتبة جديدة</button></div>
    ${roleData.available === false ? '<p class="adm-note" style="margin-bottom:12px">تعذّر جلب رولات ديسكورد (تأكد أن البوت يعمل وموجود في السيرفر). يمكنك مع ذلك إدخال رقم الرول يدويًا.</p>' : ''}
    <div class="adm-grid">
      ${list.map((r) => `
        <div class="adm-rank-card">
          <div class="adm-row" style="justify-content:space-between">
            <h4 style="color:${esc(r.color)}">${esc(r.icon || '')} ${esc(r.name)}</h4>
            <span class="adm-tag">${esc(r.key)}</span>
          </div>
          <div class="adm-note">المستوى ${Number(r.level) || 0} • ${(r.permissions || []).length} صلاحية${r.isSystem ? ' • نظامية' : ''}</div>
          <div class="adm-note">${r.discordRoleId ? '🔗 مربوطة بديسكورد: ' + esc(r.discordRoleName || r.discordRoleId) : 'غير مربوطة برول في ديسكورد'}</div>
          <div class="adm-actions">
            <button class="btn btn-ghost btn-sm" data-edit="${esc(idOf(r))}" type="button">تعديل</button>
            ${r.isSystem ? '' : `<button class="btn btn-ghost btn-sm" data-del="${esc(idOf(r))}" type="button">حذف</button>`}
          </div>
        </div>`).join('')}
    </div>`;
  const reload = () => tabRanks(box).catch((e) => { box.innerHTML = errBox(e); });
  box.querySelector('#rk-new').addEventListener('click', () => openRankModal(null, perms, reload, discordRoles));
  box.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openRankModal(list.find((r) => idOf(r) === b.dataset.edit), perms, reload, discordRoles)));
  box.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    const r = list.find((x) => idOf(x) === b.dataset.del);
    if (!(await confirmDialog({ title: 'حذف الرتبة', message: `سيُنقل أعضاء «${r.name}» إلى رتبة عضو. متأكد؟`, confirmText: 'حذف', danger: true }))) return;
    try { await del(`/api/admin/ranks/${idOf(r)}`); toast('تم الحذف', 'success'); reload(); } catch (e) { toast(e.message, 'danger'); }
  }));
}

/* ═══════════════════════ الأعضاء ═══════════════════════ */
async function tabMembers(box) {
  box.innerHTML = `
    <div class="card" style="margin-bottom:14px"><div class="card-body">
      <input class="adm-input" id="am-search" type="text" placeholder="ابحث باسم العضو…" value="${esc(memberSearch)}" />
    </div></div>
    <div id="am-list">${loading}</div>`;
  const list = box.querySelector('#am-list');

  async function load() {
    try {
      const params = new URLSearchParams({ page: String(memberPage), limit: '20' });
      if (memberSearch) params.set('search', memberSearch);
      const data = await get('/api/members?' + params.toString());
      const items = data.items || [];
      const canRank = can('ranks:manage');
      const canBan = can('members:ban');
      list.innerHTML = `
        <div class="card"><div class="card-body" style="overflow-x:auto">
          ${items.length ? `<table class="table"><thead><tr><th>العضو</th><th>الرتبة</th><th>الحالة</th><th>إجراءات</th></tr></thead><tbody>
            ${items.map((m) => `<tr>
              <td><div data-member-id="${esc(idOf(m))}"><strong>${esc(m.displayName || m.username || 'عضو')}</strong></div></td>
              <td>${canRank
                ? `<select class="adm-input" data-rank="${esc(idOf(m))}" style="min-width:140px">${(data.ranks || []).map((r) => `<option value="${esc(r.key)}" ${r.key === m.rank ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select>`
                : `<span style="color:${esc(m.rankColor)}">${esc(m.rankName)}</span>`}</td>
              <td>${m.blocked ? badge('محظور', 'danger') : statusBadge(m.duty && m.duty.status === 'on' ? 'on' : 'off')}</td>
              <td><div class="adm-actions">
                ${canBan ? (m.blocked
                  ? `<button class="btn btn-ghost btn-sm" data-unblock="${esc(idOf(m))}" type="button">فك الحظر</button>`
                  : `<button class="btn btn-ghost btn-sm" data-block="${esc(idOf(m))}" type="button">حظر</button>`) : ''}
              </div></td>
            </tr>`).join('')}
          </tbody></table>` : emptyState('لا نتائج', '')}
          ${data.pages > 1 ? `<div class="adm-row" style="justify-content:center;margin-top:14px">
            <button class="btn btn-ghost btn-sm" id="am-prev" ${memberPage <= 1 ? 'disabled' : ''}>السابق</button>
            <span class="muted">صفحة ${memberPage} من ${data.pages}</span>
            <button class="btn btn-ghost btn-sm" id="am-next" ${memberPage >= data.pages ? 'disabled' : ''}>التالي</button></div>` : ''}
        </div></div>`;

      list.querySelectorAll('[data-rank]').forEach((sel) => sel.addEventListener('change', async () => {
        try { await patch(`/api/members/${sel.dataset.rank}/rank`, { rankKey: sel.value }); sound.success(); toast('تم تغيير الرتبة', 'success'); } catch (e) { toast(e.message, 'danger'); load(); }
      }));
      list.querySelectorAll('[data-block]').forEach((b) => b.addEventListener('click', async () => {
        const reason = await promptDialog({ title: 'حظر العضو', label: 'سبب الحظر', placeholder: 'اكتب السبب…', confirmText: 'حظر' });
        if (reason === null) return;
        try { await post(`/api/members/${b.dataset.block}/block`, { reason }); toast('تم الحظر', 'success'); load(); } catch (e) { toast(e.message, 'danger'); }
      }));
      list.querySelectorAll('[data-unblock]').forEach((b) => b.addEventListener('click', async () => {
        try { await post(`/api/members/${b.dataset.unblock}/unblock`); toast('تم فك الحظر', 'success'); load(); } catch (e) { toast(e.message, 'danger'); }
      }));
      const prev = list.querySelector('#am-prev');
      const next = list.querySelector('#am-next');
      if (prev) prev.addEventListener('click', () => { memberPage = Math.max(1, memberPage - 1); load(); });
      if (next) next.addEventListener('click', () => { memberPage += 1; load(); });
    } catch (e) { list.innerHTML = errBox(e); }
  }

  box.querySelector('#am-search').addEventListener('input', debounce((event) => { memberSearch = event.target.value.trim(); memberPage = 1; load(); }, 300));
  load();
}

/* ═══════════════════════ المتجر ═══════════════════════ */
function openProductModal(product, reload) {
  const editing = Boolean(product);
  const p = product || { name: '', sku: '', description: '', category: 'other', scope: 'both', price: 0, cost: 0, stock: null, image: '', gallery: [], active: true, featured: false, order: 0 };
  const opts = (map, sel) => Object.entries(map).map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${esc(v)}</option>`).join('');
  const modal = openModal({
    title: editing ? 'تعديل منتج' : 'منتج جديد',
    subtitle: 'PRODUCT',
    size: 'lg',
    body: `
      <form class="adm-form" id="prod-form">
        <div class="adm-grid">
          <label>الاسم<input type="text" name="name" value="${esc(p.name)}" maxlength="120" required /></label>
          <label>الرمز SKU<input type="text" name="sku" value="${esc(p.sku || '')}" maxlength="40" /></label>
          <label>الفئة<select name="category">${opts(CATEGORIES, p.category)}</select></label>
          <label>يظهر في<select name="scope">${opts(SCOPES, p.scope)}</select></label>
          <label>السعر<input type="number" name="price" min="0" value="${Number(p.price) || 0}" /></label>
          <label>التكلفة<input type="number" name="cost" min="0" value="${Number(p.cost) || 0}" /></label>
          <label>المخزون (فارغ = غير محدود)<input type="number" name="stock" min="0" value="${p.stock === null || p.stock === undefined ? '' : p.stock}" /></label>
          <label>الترتيب<input type="number" name="order" value="${Number(p.order) || 0}" /></label>
        </div>
        <label>الوصف<textarea name="description" maxlength="800">${esc(p.description || '')}</textarea></label>
        <label>صورة المنتج (رابط)<input type="text" name="image" id="prod-image" value="${esc(p.image || '')}" /></label>
        <div class="prod-preview ${p.image ? '' : 'hidden'}" id="prod-preview"><img id="prod-preview-img" src="${esc(p.image || '')}" alt="" /></div>
        <input class="adm-input" type="file" id="prod-file" accept="image/png,image/jpeg,image/webp,image/gif" />
        <label>صور إضافية للمعرض (رابط في كل سطر — حتى 6 صور)
          <textarea name="gallery" id="prod-gallery" rows="3" placeholder="https://...
https://...">${esc((Array.isArray(p.gallery) ? p.gallery : []).join('\n'))}</textarea>
        </label>
        <input class="adm-input" type="file" id="prod-gallery-file" accept="image/png,image/jpeg,image/webp,image/gif" multiple />
        <p class="muted" style="font-size:11.5px">الصورة الأولى هي الرئيسية، والباقي يظهر كمصغّرات أسفلها في صفحة المنتج.</p>
        <div class="adm-row">${sw('active', 'مفعّل', p.active !== false)}${sw('featured', 'مميّز', Boolean(p.featured))}</div>
        <div class="adm-actions"><button class="btn btn-primary" type="submit">${editing ? 'حفظ' : 'إضافة'}</button></div>
      </form>`
  });
  if (!modal) return;
  const form = modal.el.querySelector('#prod-form');
  modal.el.querySelector('#prod-file').addEventListener('change', async (event) => {
    const picked = event.target.files && event.target.files[0];
    if (!picked) return;
    try {
      const file = await shrinkImage(picked);
      const res = await upload(file);
      form.image.value = res.url;
      const box = modal.el.querySelector('#prod-preview');
      const img = modal.el.querySelector('#prod-preview-img');
      if (box && img) { img.src = res.url; box.classList.remove('hidden'); }
      toast(res.note || 'تم رفع الصورة', res.note ? 'info' : 'success');
    } catch (e) { toast(e.message, 'danger'); }
  });
  modal.el.querySelector('#prod-gallery-file').addEventListener('change', async (event) => {
    const files = Array.from(event.target.files || []).slice(0, 6);
    if (!files.length) return;
    const lines = form.gallery.value.split('\n').map((line) => line.trim()).filter(Boolean);
    for (const picked of files) {
      if (lines.length >= 6) { toast('الحد 6 صور للمعرض', 'warning'); break; }
      try {
        const file = await shrinkImage(picked);
        const res = await upload(file);
        if (res.url) lines.push(res.url);
      } catch (e) { toast(e.message, 'danger'); }
    }
    form.gallery.value = lines.slice(0, 6).join('\n');
    toast('أُضيفت ' + files.length + ' صورة للمعرض', 'success');
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const gallery = form.gallery.value.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 6);
    const body = {
      name: form.name.value.trim(), sku: form.sku.value.trim(), description: form.description.value.trim(),
      category: form.category.value, scope: form.scope.value,
      price: Number(form.price.value) || 0, cost: Number(form.cost.value) || 0,
      stock: form.stock.value === '' ? null : Number(form.stock.value),
      image: form.image.value.trim(), gallery, order: Number(form.order.value) || 0,
      active: form.active.checked, featured: form.featured.checked
    };
    try {
      if (editing) await patch(`/api/products/${idOf(product)}`, body); else await post('/api/products', body);
      sound.success(); toast('تم الحفظ', 'success'); modal.close(); reload();
    } catch (e) { sound.error(); toast(e.message, 'danger'); }
  });
}

async function saveSettingEntries(entries) {
  await patch('/api/admin/settings', { entries: Object.entries(entries).map(([key, value]) => ({ key, value })) });
}

async function tabStore(box) {
  const data = await get('/api/products?all=1');
  const items = data.items || [];
  let s = {};
  const canSettings = can('settings:manage');
  if (canSettings) { try { s = (await get('/api/admin/settings')).settings || {}; } catch (e) { s = {}; } }
  let marketReview = { items: [] };
  try { marketReview = await get('/api/market/review'); } catch (e) { marketReview = { items: [] }; }
  let pendingExternal = null;
  let totalExternal = null;
  try {
    const pend = await get('/api/orders?all=1&type=external&status=pending&limit=1');
    const all = await get('/api/orders?all=1&type=external&limit=1');
    pendingExternal = pend.total; totalExternal = all.total;
  } catch (e) { /* لا صلاحية لعرض الطلبات */ }

  box.innerHTML = `
    <div class="adm-grid" style="margin-bottom:16px">
      <div class="card"><div class="card-body adm-form">
        <h3>المتجر الخارجي (لحاملي رول المتجر)</h3>
        ${canSettings ? `
          ${sw('extOpen', 'المتجر الخارجي مفتوح للطلبات', s['store.externalEnabled'] !== false)}
          <label>عنوان صفحة المتجر<input type="text" id="ext-title" value="${esc(s['store.externalTitle'] || 'المتجر الخارجي')}" maxlength="80" /></label>
          <label>وصف قصير<input type="text" id="ext-desc" value="${esc(s['store.externalDescription'] || '')}" maxlength="240" /></label>
          <div class="adm-actions"><button class="btn btn-primary btn-sm" id="ext-save" type="button">حفظ إعدادات المتجر الخارجي</button></div>` : '<p class="adm-note">لا تملك صلاحية تعديل إعدادات المتجر.</p>'}
        <div class="adm-actions">
          <button class="btn btn-ghost btn-sm" id="ext-open" type="button">فتح المتجر الخارجي ↗</button>
          <button class="btn btn-ghost btn-sm" id="ext-orders" type="button">إدارة الطلبات</button>
        </div>
        ${pendingExternal === null ? '' : `<p class="adm-note">طلبات خارجية: ${num(totalExternal)} • قيد الانتظار: <strong>${num(pendingExternal)}</strong></p>`}
        <p class="adm-note">لا يدخل المتجر الخارجي إلا من سجّل الدخول وتملك رتبته صلاحية «عرض المتجر الخارجي». رتبة «متجر» (المربوطة برول المتجر في ديسكورد) تُدخل العميل إلى المتجر وطلباته فقط، دون الداشبورد أو بقية الغرف. المنتج يظهر إذا كان «يظهر في» = خارجي أو خارجي وداخلي، وكان مفعّلًا.</p>
      </div></div>
      <div class="card"><div class="card-body adm-form">
        <h3>المتجر الداخلي (للأعضاء فقط)</h3>
        ${canSettings ? sw('intOpen', 'المتجر الداخلي مفتوح للأعضاء', s['store.internalEnabled'] !== false) : ''}
        <p class="adm-note">يطلب منه الأعضاء الذين يملكون صلاحية «طلب العتاد من المتجر الداخلي». تظهر طلباتهم في غرفة «الطلبات» تحت تبويب المتجر الداخلي.</p>
      </div></div>

      <div class="card"><div class="card-body adm-form">
        <h3>سوق الأعضاء</h3>
        <p class="adm-note">يسمح للأعضاء بعرض منتجاتهم داخل المتجر الداخلي. نسبة الإدارة تُخصم من كل بيع وتظهر في زاوية «حصيلة الإدارة» بسوق الأعضاء، ويستلم البائع الباقي.</p>
        ${canSettings ? `
          ${sw('mkOpen', 'سوق الأعضاء مفتوح', s['market.enabled'] !== false)}
          ${sw('mkApproval', 'إعلانات الأعضاء تحتاج موافقة القيادة', s['market.requireApproval'] !== false)}
          <div class="adm-grid">
            <label>عدد الإعلانات في الأسبوع<input type="number" name="mkPerWeek" min="0" max="50" value="${Number(s['market.maxPerWeek'] ?? 2)}" /></label>
            <label>نسبة الإدارة من كل بيع %<input type="number" name="mkCommission" min="0" max="50" value="${Number(s['market.commissionPercent'] ?? 10)}" /></label>
            <label>أقصى كمية في الإعلان<input type="number" name="mkMaxQty" min="1" max="99" value="${Number(s['market.maxQty'] ?? 5)}" /></label>
            <label>مدة العرض (أيام)<input type="number" name="mkDays" min="1" max="90" value="${Number(s['market.durationDays'] ?? 14)}" /></label>
            <label>أدنى سعر<input type="number" name="mkMinPrice" min="1" value="${Number(s['market.minPrice'] ?? 1)}" /></label>
            <label>أقصى سعر<input type="number" name="mkMaxPrice" min="1" value="${Number(s['market.maxPrice'] ?? 100000)}" /></label>
            <label>أدنى مستوى رتبة للعرض<input type="number" name="mkRank" min="0" max="1000" value="${Number(s['market.minRankLevel'] ?? 20)}" /></label>
          </div>
          <div class="adm-actions"><button class="btn btn-primary btn-sm" id="mk-save-settings" type="button">حفظ إعدادات السوق</button></div>` : '<p class="adm-note">لا تملك صلاحية تعديل إعدادات السوق.</p>'}
      </div></div>
    </div>

    <div class="card" style="margin-bottom:16px"><div class="card-body">
      <h3>مراجعة إعلانات السوق</h3>
      ${(marketReview.items || []).length ? `<div style="overflow-x:auto"><table class="table"><thead><tr><th>المنتج</th><th>العضو</th><th>السعر</th><th>الكمية</th><th>الحالة</th><th>تاريخ</th><th></th></tr></thead><tbody>
        ${marketReview.items.map((m) => `<tr>
          <td><strong>${esc(m.name)}</strong>${m.adminNote ? `<div class="adm-note">${esc(m.adminNote)}</div>` : ''}</td>
          <td>${esc(m.sellerName)}</td>
          <td>${num(m.price)}</td>
          <td>${num(m.remaining)} / ${num(m.qty)}</td>
          <td>${badge({ pending: 'بانتظار الموافقة', active: 'معروض', paused: 'موقوف', rejected: 'مرفوض', sold: 'نُفد', expired: 'منتهي', cancelled: 'ملغى' }[m.status] || m.status, m.status === 'active' ? 'success' : m.status === 'pending' ? 'warning' : m.status === 'rejected' ? 'danger' : '')}</td>
          <td class="muted">${esc(date(m.createdAt))}</td>
          <td><div class="adm-actions">
            ${m.status !== 'active' ? `<button class="btn btn-ghost btn-sm" data-mk-ok="${esc(m._id)}" type="button">موافقة</button>` : ''}
            ${['pending', 'active', 'paused'].includes(m.status) ? `<button class="btn btn-ghost btn-sm" data-mk-no="${esc(m._id)}" type="button">رفض</button>` : ''}
          </div></td></tr>`).join('')}
      </tbody></table></div>` : '<p class="adm-note">لا إعلانات في السوق بعد.</p>'}
    </div></div>
    <div class="adm-actions" style="margin-bottom:14px"><button class="btn btn-primary" id="pr-new" type="button">+ منتج جديد</button></div>
    <div class="card"><div class="card-body" style="overflow-x:auto">
      ${items.length ? `<table class="table"><thead><tr><th>المنتج</th><th>الفئة</th><th>السعر</th><th>المخزون</th><th>يظهر في</th><th>الحالة</th><th></th></tr></thead><tbody>
        ${items.map((p) => `<tr>
          <td><strong>${esc(p.name)}</strong></td>
          <td>${esc(CATEGORIES[p.category] || p.category)}</td>
          <td>${num(p.price || 0)}</td>
          <td>${p.stock === null || p.stock === undefined ? '∞' : num(p.stock)}</td>
          <td>${esc(SCOPES[p.scope] || p.scope)}</td>
          <td>${p.active === false ? badge('مخفي', 'danger') : badge('نشط', 'success')}</td>
          <td><div class="adm-actions">
            <button class="btn btn-ghost btn-sm" data-edit="${esc(idOf(p))}" type="button">تعديل</button>
            <button class="btn btn-ghost btn-sm" data-del="${esc(idOf(p))}" type="button">حذف</button>
          </div></td></tr>`).join('')}
      </tbody></table>` : emptyState('لا منتجات', 'أضف أول منتج')}
    </div></div>`;
  const reload = () => tabStore(box).catch((e) => { box.innerHTML = errBox(e); });
  box.querySelector('#ext-open').addEventListener('click', () => window.open(location.origin + '/#/shop', '_blank'));
  box.querySelector('#ext-orders').addEventListener('click', () => { location.hash = '#/orders'; });
  const extSave = box.querySelector('#ext-save');
  if (extSave) {
    extSave.addEventListener('click', async () => {
      try {
        await saveSettingEntries({
          'store.externalEnabled': box.querySelector('[name="extOpen"]').checked,
          'store.externalTitle': box.querySelector('#ext-title').value.trim() || 'المتجر الخارجي',
          'store.externalDescription': box.querySelector('#ext-desc').value.trim()
        });
        sound.success(); toast('تم حفظ إعدادات المتجر الخارجي', 'success');
      } catch (e) { sound.error(); toast(e.message, 'danger'); }
    });
    box.querySelector('[name="intOpen"]').addEventListener('change', async (event) => {
      try { await saveSettingEntries({ 'store.internalEnabled': event.target.checked }); toast(event.target.checked ? 'فُتح المتجر الداخلي' : 'أُغلق المتجر الداخلي', 'success'); }
      catch (e) { toast(e.message, 'danger'); event.target.checked = !event.target.checked; }
    });
  }
  const mkSave = box.querySelector('#mk-save-settings');
  if (mkSave) {
    mkSave.addEventListener('click', async () => {
      try {
        await saveSettingEntries({
          'market.enabled': box.querySelector('[name="mkOpen"]').checked,
          'market.requireApproval': box.querySelector('[name="mkApproval"]').checked,
          'market.maxPerWeek': Number(box.querySelector('[name="mkPerWeek"]').value) || 0,
          'market.commissionPercent': Math.max(0, Math.min(50, Number(box.querySelector('[name="mkCommission"]').value) || 0)),
          'market.maxQty': Number(box.querySelector('[name="mkMaxQty"]').value) || 1,
          'market.durationDays': Number(box.querySelector('[name="mkDays"]').value) || 14,
          'market.minPrice': Number(box.querySelector('[name="mkMinPrice"]').value) || 1,
          'market.maxPrice': Number(box.querySelector('[name="mkMaxPrice"]').value) || 100000,
          'market.minRankLevel': Number(box.querySelector('[name="mkRank"]').value) || 0
        });
        sound.success();
        toast('تم حفظ إعدادات السوق', 'success');
      } catch (e) { sound.error(); toast(e.message, 'danger'); }
    });
  }
  box.querySelectorAll('[data-mk-ok]').forEach((b) => b.addEventListener('click', async () => {
    try {
      await post(`/api/market/${b.dataset.mkOk}/review`, { approve: true });
      sound.success(); toast('تمت الموافقة على الإعلان', 'success'); reload();
    } catch (e) { toast(e.message, 'danger'); }
  }));
  box.querySelectorAll('[data-mk-no]').forEach((b) => b.addEventListener('click', async () => {
    try {
      await post(`/api/market/${b.dataset.mkNo}/review`, { approve: false, note: 'راجع شروط السوق' });
      toast('تم رفض الإعلان', 'success'); reload();
    } catch (e) { toast(e.message, 'danger'); }
  }));
  box.querySelector('#pr-new').addEventListener('click', () => openProductModal(null, reload));
  box.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openProductModal(items.find((p) => idOf(p) === b.dataset.edit), reload)));
  box.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    if (!(await confirmDialog({ title: 'حذف المنتج', message: 'سيُحذف المنتج نهائيًا.', confirmText: 'حذف', danger: true }))) return;
    try { await del(`/api/products/${b.dataset.del}`); toast('تم الحذف', 'success'); reload(); } catch (e) { toast(e.message, 'danger'); }
  }));
}

/* ═══════════════════════ الإعلانات ═══════════════════════ */
function toLocalInput(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function openAnnouncementModal(item, reload) {
  const editing = Boolean(item);
  const a = item || { title: '', body: '', severity: 'normal', pinned: false, active: true, expiresAt: null };
  const modal = openModal({
    title: editing ? 'تعديل إعلان' : 'إعلان جديد',
    subtitle: 'ANNOUNCEMENT',
    body: `
      <form class="adm-form" id="an-form">
        <label>العنوان<input type="text" name="title" value="${esc(a.title)}" maxlength="160" required /></label>
        <label>النص<textarea name="body" maxlength="2500" required>${esc(a.body)}</textarea></label>
        <label>الأهمية<select name="severity">${Object.entries(SEVERITIES).map(([k, v]) => `<option value="${k}" ${k === a.severity ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label>ينتهي في (اختياري)<input type="datetime-local" name="expiresAt" value="${esc(toLocalInput(a.expiresAt))}" /></label>
        <div class="adm-row">${sw('pinned', 'تثبيت', Boolean(a.pinned))}${sw('active', 'نشط', a.active !== false)}</div>
        ${editing ? '' : `<div class="adm-row">${sw('notifyDiscord', 'إرسال لديسكورد', true)}${sw('notifyMembers', 'إشعار الأعضاء', true)}</div>`}
        <div class="adm-actions"><button class="btn btn-primary" type="submit">${editing ? 'حفظ' : 'نشر'}</button></div>
      </form>`
  });
  if (!modal) return;
  const form = modal.el.querySelector('#an-form');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const body = {
      title: form.title.value.trim(), body: form.body.value.trim(), severity: form.severity.value,
      pinned: form.pinned.checked, active: form.active.checked,
      expiresAt: form.expiresAt.value ? new Date(form.expiresAt.value).toISOString() : null
    };
    if (!editing) { body.notifyDiscord = form.notifyDiscord.checked; body.notifyMembers = form.notifyMembers.checked; }
    try {
      if (editing) await patch(`/api/announcements/${idOf(item)}`, body); else await post('/api/announcements', body);
      sound.success(); toast('تم الحفظ', 'success'); modal.close(); reload();
    } catch (e) { sound.error(); toast(e.message, 'danger'); }
  });
}

async function tabAnnouncements(box) {
  const data = await get('/api/announcements?all=1');
  const items = data.items || [];
  box.innerHTML = `
    <div class="adm-actions" style="margin-bottom:14px"><button class="btn btn-primary" id="an-new" type="button">+ إعلان جديد</button></div>
    <div class="stack">
      ${items.length ? items.map((a) => `
        <div class="card"><div class="card-body">
          <div class="adm-row" style="justify-content:space-between">
            <strong>${esc(a.title)}</strong>
            <span>${a.pinned ? badge('مثبت', 'info') : ''} ${a.active === false ? badge('مخفي', 'danger') : ''} ${badge(SEVERITIES[a.severity] || a.severity, a.severity === 'normal' ? '' : 'warning')}</span>
          </div>
          <p class="muted" style="margin:8px 0">${esc(a.body)}</p>
          <div class="adm-row"><small class="muted">${timeAgo(a.createdAt)}</small>
            <button class="btn btn-ghost btn-sm" data-edit="${esc(idOf(a))}" type="button">تعديل</button>
            <button class="btn btn-ghost btn-sm" data-del="${esc(idOf(a))}" type="button">حذف</button></div>
        </div></div>`).join('') : emptyState('لا إعلانات', '')}
    </div>`;
  const reload = () => tabAnnouncements(box).catch((e) => { box.innerHTML = errBox(e); });
  box.querySelector('#an-new').addEventListener('click', () => openAnnouncementModal(null, reload));
  box.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openAnnouncementModal(items.find((a) => idOf(a) === b.dataset.edit), reload)));
  box.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    if (!(await confirmDialog({ title: 'حذف الإعلان', message: 'سيُحذف الإعلان نهائيًا.', confirmText: 'حذف', danger: true }))) return;
    try { await del(`/api/announcements/${b.dataset.del}`); toast('تم الحذف', 'success'); reload(); } catch (e) { toast(e.message, 'danger'); }
  }));
}

/* ═══════════════════════ الإنذارات والعقوبات ═══════════════════════ */
const DISC_TYPES = { warning: 'تحذير', fine: 'غرامة', note: 'ملاحظة' };

async function tabDiscipline(box) {
  const data = await get('/api/discipline?limit=40');
  const items = data.items || [];
  box.innerHTML = `
    <div class="card" style="margin-bottom:16px"><div class="card-body">
      <h3>إصدار إجراء جديد</h3>
      <form class="adm-form" id="dc-form">
        <div class="adm-field"><strong>العضو</strong><div id="dc-picker"></div></div>
        <div class="adm-row">
          <label style="flex:1">النوع<select name="type">${Object.entries(DISC_TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
          <label style="flex:1">قيمة الغرامة<input type="number" name="amount" min="0" value="0" /></label>
        </div>
        <label>السبب<textarea name="reason" maxlength="700" required></textarea></label>
        <div class="adm-actions"><button class="btn btn-primary" type="submit">إصدار</button></div>
      </form>
    </div></div>
    <div class="card"><div class="card-body" style="overflow-x:auto">
      ${items.length ? `<table class="table"><thead><tr><th>العضو</th><th>النوع</th><th>السبب</th><th>الحالة</th><th>بواسطة</th><th></th></tr></thead><tbody>
        ${items.map((d) => `<tr>
          <td><div ${d.user && d.user._id ? `data-member-id="${esc(String(d.user._id))}"` : ''}>${esc((d.user && (d.user.displayName || d.user.username)) || (d.userSnapshot && d.userSnapshot.name) || '—')}</div></td>
          <td>${esc(DISC_TYPES[d.type] || d.type)}${d.amount ? ' • ' + num(d.amount) : ''}</td>
          <td>${esc(d.reason)}</td>
          <td>${statusBadge(d.status)}</td>
          <td><small class="muted">${esc(d.issuedByName || '')} • ${timeAgo(d.createdAt)}</small></td>
          <td>${d.status === 'active' ? `<button class="btn btn-ghost btn-sm" data-revoke="${esc(idOf(d))}" type="button">إلغاء</button>` : ''}</td>
        </tr>`).join('')}
      </tbody></table>` : emptyState('لا سجلات', '')}
    </div></div>`;

  let memberList = [];
  try { memberList = (await get('/api/members?limit=100')).items || []; } catch (e) { memberList = []; }
  const picker = mountPicker(box.querySelector('#dc-picker'), {
    options: memberList.map((m) => ({ id: idOf(m), label: m.displayName || m.username || 'عضو' })),
    max: 1,
    placeholder: 'ابحث عن العضو واضغط عليه…',
    emptyText: 'لا يوجد عضو بهذا الاسم'
  });

  const reload = () => tabDiscipline(box).catch((e) => { box.innerHTML = errBox(e); });
  box.querySelector('#dc-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    const chosen = picker.getSelected()[0];
    if (!chosen) return toast('اختر العضو أولًا', 'warning');
    try {
      await post('/api/discipline', { userId: chosen.id, type: form.type.value, amount: Number(form.amount.value) || 0, reason: form.reason.value.trim() });
      sound.success(); toast('تم إصدار الإجراء', 'success'); reload();
    } catch (e) { sound.error(); toast(e.message, 'danger'); }
  });
  box.querySelectorAll('[data-revoke]').forEach((b) => b.addEventListener('click', async () => {
    const reason = await promptDialog({ title: 'إلغاء الإجراء', label: 'سبب الإلغاء', placeholder: 'اكتب السبب…', confirmText: 'إلغاء الإجراء' });
    if (reason === null) return;
    try { await patch(`/api/discipline/${b.dataset.revoke}/revoke`, { reason }); toast('تم الإلغاء', 'success'); reload(); } catch (e) { toast(e.message, 'danger'); }
  }));
}

/* ═══════════════════════ عقد الدم ═══════════════════════ */
async function tabPact(box) {
  let s = {};
  try { s = (await get('/api/admin/settings')).settings || {}; } catch (e) { s = {}; }
  box.innerHTML = `
    <div class="card"><div class="card-body">
      <form class="adm-form" id="pact-form">
        <h3>نص عقد الدم (الذي يظهر عند أول دخول)</h3>
        <label>العنوان<input type="text" name="title" value="${esc(s['pact.title'] || 'عقد الدم')}" maxlength="120" /></label>
        <label>العنوان الفرعي<input type="text" name="subtitle" value="${esc(s['pact.subtitle'] || '')}" maxlength="200" /></label>
        <label>نص العقد<textarea class="adm-textarea-lg" name="text" required>${esc(s['pact.text'] || '')}</textarea></label>
        <p class="adm-note">النسخة الحالية: ${esc(String(s['pact.version'] || 1))}. عند الحفظ يرتفع رقم النسخة ويُطلب من جميع الأعضاء إعادة التوقيع عند دخولهم القادم.</p>
        <div class="adm-actions"><button class="btn btn-primary" type="submit">حفظ العقد</button></div>
      </form>
    </div></div>`;
  box.querySelector('#pact-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const f = event.target;
    if (!(await confirmDialog({ title: 'تحديث العقد', message: 'سيُطلب من كل الأعضاء إعادة التوقيع. متأكد؟', confirmText: 'حفظ' }))) return;
    try {
      const res = await patch('/api/pacts/content', { title: f.title.value, subtitle: f.subtitle.value, text: f.text.value });
      sound.success(); toast(res.note || 'تم حفظ العقد', 'success');
      tabPact(box);
    } catch (e) { sound.error(); toast(e.message, 'danger'); }
  });
}

/* ═══════════════════════ الهيكل ═══════════════════════ */
const RENDERERS = {
  overview: tabOverview, settings: tabSettings, ranks: tabRanks, members: tabMembers,
  store: tabStore, announcements: tabAnnouncements, discipline: tabDiscipline, pact: tabPact
};

export async function render(root) {
  const tabs = TABS.filter((tab) => can(tab.perm));
  if (!tabs.length) {
    root.innerHTML = `<div class="card"><div class="card-body"><h3>لا صلاحية</h3><p class="muted">رتبتك لا تملك صلاحيات إدارية.</p></div></div>`;
    return;
  }
  if (!tabs.some((tab) => tab.id === currentTab)) currentTab = tabs[0].id;

  root.innerHTML = `
    ${pageHeader({ kicker: 'ADMIN PANEL', title: 'لوحة الإدارة', description: 'الرتب والصلاحيات، الإعدادات، المتجر، الإعلانات، الإنذارات، الأعضاء، وعقد الدم.' })}
    <div class="adm-tabs">${tabs.map((tab) => `<button class="adm-tab ${tab.id === currentTab ? 'active' : ''}" data-tab="${tab.id}" type="button">${esc(tab.label)}</button>`).join('')}</div>
    <div id="adm-body">${loading}</div>`;

  const body = root.querySelector('#adm-body');
  async function show(id) {
    currentTab = id;
    root.querySelectorAll('.adm-tab').forEach((el) => el.classList.toggle('active', el.dataset.tab === id));
    body.innerHTML = loading;
    try { await RENDERERS[id](body); } catch (e) { body.innerHTML = errBox(e); }
  }
  root.querySelectorAll('.adm-tab').forEach((el) => el.addEventListener('click', () => show(el.dataset.tab)));
  show(currentTab);
}
