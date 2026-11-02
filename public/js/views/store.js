import { get, post, patch, upload } from '../core/api.js';
import { state } from '../core/state.js';
import { esc, num, money, pageHeader, emptyState, openModal, toast } from '../core/ui.js';
import * as sound from '../core/sound.js';

export const meta = { title: 'المتجر الداخلي', kicker: 'STORE' };

let cart = [];
let tab = 'official';
let marketState = null;

const CATEGORIES = [
  { key: 'weapon', label: 'سلاح' },
  { key: 'drug', label: 'مواد' },
  { key: 'gear', label: 'عتاد' },
  { key: 'vehicle', label: 'مركبة' },
  { key: 'service', label: 'خدمة' },
  { key: 'other', label: 'أخرى' }
];

const STATUS_LABEL = {
  pending: 'بانتظار الموافقة',
  active: 'معروض',
  paused: 'موقوف',
  rejected: 'مرفوض',
  sold: 'نُفد',
  expired: 'منتهي',
  cancelled: 'ملغى'
};

function currency() {
  return state.config?.system?.currencyLabel || 'دولار';
}

function refreshCount() {
  const el = document.getElementById('cart-count');
  if (el) el.textContent = cart.reduce((sum, item) => sum + item.qty, 0);
}

function addToCart(item) {
  const key = item.listingId || item.productId;
  const existing = cart.find((row) => (row.listingId || row.productId) === key);
  if (existing) existing.qty++;
  else cart.push({ ...item, qty: 1 });
  refreshCount();
  sound.click();
}

/* ═════════════ رسم البطاقات ═════════════ */
function officialCard(p) {
  const gallery = Array.isArray(p.gallery) ? p.gallery.length : 0;
  return `
    <div class="product-card">
      <div class="product-media">${p.image ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy" />` : '<span class="ph">■</span>'}
        ${gallery ? `<span class="media-count">＋${gallery + (p.image ? 1 : 0)}</span>` : ''}
      </div>
      <div class="product-body">
        <h4>${esc(p.name)}</h4>
        <p>${esc(p.description || '')}</p>
        <div class="product-foot">
          <div class="price">${num(p.price)} <small>${esc(currency())}</small></div>
          <button class="btn btn-sm btn-primary" data-add="${esc(p._id)}" data-name="${esc(p.name)}" data-price="${Number(p.price) || 0}">أضف للسلة</button>
        </div>
      </div>
    </div>`;
}

function marketCard(item) {
  const mine = item.mine;
  const left = item.remaining === null || item.remaining === undefined ? '—' : item.remaining;
  return `
    <div class="product-card market-card ${mine ? 'is-mine' : ''}" style="--mk:#2a9d8f">
      <div class="product-media">${item.image ? `<img src="${esc(item.image)}" alt="${esc(item.name)}" loading="lazy" />` : '<span class="ph">🏷️</span>'}
        <span class="market-flag">سوق الأعضاء</span>
      </div>
      <div class="product-body">
        <h4>${esc(item.name)}</h4>
        <p class="market-seller">بواسطة <strong>${esc(item.sellerName)}</strong>${mine ? ' <span class="you">أنت</span>' : ''}</p>
        <p>${esc(item.description || '')}</p>
        <div class="product-foot">
          <div class="price">${num(item.price)} <small>${esc(currency())}</small></div>
          <div class="market-actions">
            <span class="market-left" title="الكمية المتبقية">متبقي ${esc(String(left))}</span>
            ${mine
              ? '<span class="badge">إعلانك</span>'
              : `<button class="btn btn-sm btn-primary" data-add-listing="${esc(item._id)}" data-name="${esc(item.name)}" data-price="${Number(item.price) || 0}" ${item.available ? '' : 'disabled'}>أضف للسلة</button>`}
          </div>
        </div>
      </div>
    </div>`;
}

function mineRow(item) {
  const label = STATUS_LABEL[item.status] || item.status;
  return `
    <div class="market-row" data-status="${esc(item.status)}">
      <div class="market-row-media">${item.image ? `<img src="${esc(item.image)}" alt="" />` : '<span>🏷️</span>'}</div>
      <div class="market-row-body">
        <strong>${esc(item.name)}</strong>
        <span class="muted">${num(item.price)} ${esc(currency())} • متبقي ${num(item.remaining)} من ${num(item.qty)}</span>
        ${item.adminNote ? `<span class="market-note">ملاحظة القيادة: ${esc(item.adminNote)}</span>` : ''}
      </div>
      <div class="market-row-side">
        <span class="market-status" data-s="${esc(item.status)}">${esc(label)}</span>
        <div class="market-row-btns">
          ${item.status === 'active' ? `<button class="btn btn-xs btn-ghost" data-pause="${esc(item._id)}">إيقاف</button>` : ''}
          ${item.status === 'paused' ? `<button class="btn btn-xs btn-ghost" data-resume="${esc(item._id)}">تشغيل</button>` : ''}
          ${['pending', 'active', 'paused', 'rejected'].includes(item.status) ? `<button class="btn btn-xs btn-ghost danger" data-cancel="${esc(item._id)}">حذف</button>` : ''}
        </div>
      </div>
    </div>`;
}

/* ═════════════ نموذج عرض منتج ═════════════ */
function openListingForm(root) {
  const limits = marketState?.limits || {};
  const quota = marketState?.quota || { remaining: 0, max: 2, used: 0 };
  if (quota.remaining <= 0) {
    toast(`استهلكت حصتك لهذا الأسبوع (${quota.max} إعلان). تتجدد مع بداية الأسبوع.`, 'warning');
    return;
  }
  const modal = openModal({
    title: 'اعرض منتجك في السوق',
    subtitle: 'MEMBER MARKET',
    body: `
      <form id="mk-form" class="stack">
        <div class="market-quota">
          <span>حصتك هذا الأسبوع</span>
          <strong>${num(quota.used)} / ${num(quota.max)}</strong>
          <span class="muted">يتبقى ${num(quota.remaining)} إعلان</span>
        </div>
        <label>اسم المنتج<input type="text" name="name" maxlength="120" required placeholder="مثال: مسدس معدّل" /></label>
        <label>الوصف<textarea name="description" rows="3" maxlength="600" placeholder="ما يميّز منتجك؟"></textarea></label>
        <div class="adm-grid">
          <label>السعر (${esc(currency())})<input type="number" name="price" min="${Number(limits.minPrice) || 1}" max="${Number(limits.maxPrice) || 100000}" required /></label>
          <label>الكمية<input type="number" name="qty" min="1" max="${Number(limits.maxQty) || 5}" value="1" required /></label>
          <label>الفئة<select name="category">${CATEGORIES.map((c) => `<option value="${c.key}">${c.label}</option>`).join('')}</select></label>
        </div>
        <div class="mk-image">
          <span class="mk-label">صورة المنتج (اختياري)</span>
          <div class="mk-image-row">
            <input type="text" name="image" id="mk-image" maxlength="500" placeholder="https://… أو ارفع صورة من جهازك" />
            <button type="button" class="btn btn-ghost btn-sm" id="mk-pick">📁 من جهازي</button>
            <input type="file" id="mk-file" accept="image/png,image/jpeg,image/webp,image/gif" hidden />
          </div>
          <div class="mk-preview hidden" id="mk-preview"><img alt="معاينة" /></div>
        </div>
        <div class="market-terms">
          <span>مدة العرض ${num(limits.durationDays)} يومًا، والحد ${num(limits.maxQty)} قطعة.</span>
          ${limits.requireApproval ? '<span>الإعلان يظهر بعد موافقة القيادة.</span>' : ''}
        </div>
      </form>
    `,
    footer: '<button class="btn btn-ghost" data-close>إلغاء</button><button class="btn btn-primary" id="mk-save">إرسال العرض</button>',
    onMount: (m) => {
      m.el.querySelector('[data-close]').onclick = () => m.close();

      /* رفع صورة من جهاز العضو */
      const imageInput = m.el.querySelector('#mk-image');
      const fileInput = m.el.querySelector('#mk-file');
      const pickBtn = m.el.querySelector('#mk-pick');
      const preview = m.el.querySelector('#mk-preview');
      const showPreview = (url) => {
        if (!preview) return;
        if (!url) { preview.classList.add('hidden'); return; }
        preview.querySelector('img').src = url;
        preview.classList.remove('hidden');
      };
      imageInput?.addEventListener('input', () => showPreview(imageInput.value.trim()));
      pickBtn?.addEventListener('click', () => fileInput?.click());
      fileInput?.addEventListener('change', async () => {
        const file = fileInput.files && fileInput.files[0];
        if (!file) return;
        if (file.size > 6 * 1024 * 1024) return toast('حجم الصورة كبير (الحد 6 ميجا)', 'warning');
        pickBtn.disabled = true;
        pickBtn.textContent = 'جارٍ الرفع…';
        try {
          const res = await upload(file, '/api/market/upload');
          imageInput.value = res.url || '';
          showPreview(res.url);
          sound.success();
        } catch (error) {
          sound.error();
          toast(error.message, 'danger');
        } finally {
          pickBtn.disabled = false;
          pickBtn.textContent = '📁 من جهازي';
          fileInput.value = '';
        }
      });
      m.el.querySelector('#mk-save').onclick = async () => {
        const form = m.el.querySelector('#mk-form');
        const body = {
          name: form.name.value.trim(),
          description: form.description.value.trim(),
          price: Number(form.price.value) || 0,
          qty: Number(form.qty.value) || 1,
          category: form.category.value,
          image: form.image.value.trim()
        };
        if (!body.name || body.name.length < 3) return toast('اسم المنتج قصير', 'warning');
        if (!body.price) return toast('أدخل سعرًا صحيحًا', 'warning');
        const btn = m.el.querySelector('#mk-save');
        btn.disabled = true;
        btn.textContent = 'جارٍ الإرسال…';
        try {
          const res = await post('/api/market', body);
          sound.success();
          toast(res.listing.status === 'pending' ? 'أُرسل العرض بانتظار موافقة القيادة' : 'ظهر منتجك في السوق', 'success');
          m.close();
          await loadMarket(root);
          switchTab(root, 'mine');
        } catch (error) {
          sound.error();
          toast(error.message, 'danger');
          btn.disabled = false;
          btn.textContent = 'إرسال العرض';
        }
      };
    }
  });
}

/* ═════════════ تحميل السوق ═════════════ */
async function loadMarket(root) {
  const [market, mine] = await Promise.all([get('/api/market'), get('/api/market/mine')]);
  marketState = {
    limits: market.limits,
    quota: market.quota,
    items: market.items || [],
    mine: mine.items || [],
    earnings: mine.earnings || { count: 0, net: 0, pendingPayout: 0, recent: [] },
    quotaMine: mine.quota
  };
  renderMarket(root);
}

function renderMarket(root) {
  const box = root.querySelector('#market-panel');
  if (!box || !marketState) return;
  const { items, mine, earnings, quota, limits } = marketState;
  const pending = (mine || []).filter((row) => row.status === 'pending').length;

  box.innerHTML = `
    <div class="market-head">
      <div class="market-head-info">
        <h3>سوق الأعضاء</h3>
        <p class="muted">اعرض عتادك للعائلة، ويصل كامل المبلغ إليك عند البيع.</p>
      </div>
      <div class="market-head-side">
        <div class="market-quota-pill ${quota.remaining > 0 ? '' : 'is-empty'}">
          حصتك: <strong>${num(quota.used)} / ${num(quota.max)}</strong> هذا الأسبوع
        </div>
        <button class="btn btn-primary btn-sm" id="mk-new">＋ اعرض منتجك</button>
      </div>
    </div>

    <div class="market-stats">
      <div class="market-stat"><span>مبيعاتي</span><strong>${num(earnings.count)}</strong></div>
      <div class="market-stat"><span>صافي الأرباح</span><strong>${money(earnings.net)}</strong></div>
      <div class="market-stat"><span>مستحق لم يُسلَّم</span><strong>${money(earnings.pendingPayout)}</strong></div>
      <div class="market-stat"><span>إعلاناتي</span><strong>${num((mine || []).length)}</strong></div>
    </div>

    ${items.length
      ? `<div class="store-grid market-grid">${items.map(marketCard).join('')}</div>`
      : emptyState('لا شيء معروض الآن', 'كن أول من يعرض منتجًا في السوق')}

    <div class="market-mine">
      <div class="market-mine-head">
        <h3>إعلاناتي</h3>
        ${pending ? `<span class="badge warn">${num(pending)} بانتظار الموافقة</span>` : ''}
      </div>
      ${(mine || []).length ? (mine || []).map(mineRow).join('') : '<p class="muted">لم تعرض شيئًا بعد.</p>'}
    </div>
  `;

  box.querySelector('#mk-new')?.addEventListener('click', () => openListingForm(root));
  box.querySelectorAll('[data-add-listing]').forEach((btn) => {
    btn.addEventListener('click', () => {
      addToCart({
        listingId: btn.dataset.addListing,
        name: btn.dataset.name,
        price: Number(btn.dataset.price) || 0
      });
      toast('أُضيف إلى سلة الطلب', 'success');
    });
  });
  box.querySelectorAll('[data-pause]').forEach((btn) => {
    btn.addEventListener('click', () => changeStatus(btn.dataset.pause, 'paused', root));
  });
  box.querySelectorAll('[data-resume]').forEach((btn) => {
    btn.addEventListener('click', () => changeStatus(btn.dataset.resume, 'active', root));
  });
  box.querySelectorAll('[data-cancel]').forEach((btn) => {
    btn.addEventListener('click', () => changeStatus(btn.dataset.cancel, 'cancelled', root));
  });
}

async function changeStatus(id, status, root) {
  try {
    await patch(`/api/market/${id}`, { status });
    sound.click();
    toast(status === 'cancelled' ? 'حُذف الإعلان' : status === 'paused' ? 'أُوقف الإعلان' : 'أُعيد تشغيل الإعلان', 'success');
    await loadMarket(root);
  } catch (error) {
    sound.error();
    toast(error.message, 'danger');
  }
}

/* ═════════════ التبويبات ═════════════ */
function switchTab(root, next) {
  tab = next;
  root.querySelectorAll('[data-store-tab]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.storeTab === next);
  });
  const official = root.querySelector('#official-panel');
  const marketPanel = root.querySelector('#market-panel');
  if (official) official.classList.toggle('hidden', next !== 'official');
  if (marketPanel) marketPanel.classList.toggle('hidden', next !== 'market');
  const cartBtn = root.querySelector('#cart-fab');
  if (cartBtn) cartBtn.classList.toggle('hidden', next === 'market' && false);
  if (next === 'market') loadMarket(root);
}

export async function render(root) {
  root.innerHTML = '<div class="view-loading"><div class="loader-ring"></div></div>';
  try {
    const data = await get('/api/products?scope=internal');
    root.innerHTML = `
      ${pageHeader({
        kicker: 'INTERNAL STORE',
        title: 'المتجر الداخلي',
        description: 'عتاد العائلة، وأيضًا سوق بين الأعضاء.'
      })}

      <div class="store-tabs">
        <button class="store-tab active" data-store-tab="official">عتاد العائلة</button>
        <button class="store-tab" data-store-tab="market">سوق الأعضاء</button>
      </div>

      <div id="official-panel">
        <div class="store-grid">
          ${(data.items || []).length ? data.items.map(officialCard).join('') : emptyState('المتجر فارغ', '')}
        </div>
      </div>

      <div id="market-panel" class="hidden"></div>

      <button class="cart-fab" id="cart-fab"><span>🛒</span> السلة <span class="count" id="cart-count">0</span></button>
    `;

    root.querySelectorAll('[data-add]').forEach((btn) => {
      btn.addEventListener('click', () => {
        addToCart({
          productId: btn.dataset.add,
          name: btn.dataset.name,
          price: Number(btn.dataset.price) || 0
        });
        toast('أُضيف إلى السلة', 'success');
      });
    });
    root.querySelectorAll('[data-store-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        sound.click();
        switchTab(root, btn.dataset.storeTab);
      });
    });
    root.querySelector('#cart-fab').addEventListener('click', openCart);
    refreshCount();
    loadMarket(root).catch(() => null);
  } catch (error) {
    root.innerHTML = `<div class="card"><h3>خطأ</h3><p class="muted">${esc(error.message)}</p></div>`;
  }
}

function openCart() {
  const total = cart.reduce((sum, item) => sum + item.qty * item.price, 0);
  openModal({
    title: 'سلة الطلب',
    subtitle: 'INTERNAL ORDER',
    body: `
      <div class="stack">
        ${cart.length ? cart.map((item, idx) => `
          <div class="cart-line">
            <div style="flex:1"><strong>${esc(item.name)}</strong><div class="muted">${num(item.price)} × ${item.qty} = ${num(item.price * item.qty)}${item.listingId ? ' <span class="you">سوق</span>' : ''}</div></div>
            <div class="qty">
              <button data-dec="${idx}">-</button>
              <span>${item.qty}</span>
              <button data-inc="${idx}">+</button>
            </div>
          </div>
        `).join('') : '<p class="muted">السلة فارغة</p>'}
        <div class="cart-total"><span>المجموع</span><strong>${num(total)} ${esc(currency())}</strong></div>
      </div>
    `,
    footer: cart.length ? '<button class="btn btn-ghost" data-close>إغلاق</button><button class="btn btn-primary" id="checkout">إرسال الطلب</button>' : '<button class="btn btn-ghost" data-close>إغلاق</button>',
    onMount: (m) => {
      m.el.querySelector('[data-close]').onclick = () => m.close();
      m.el.querySelectorAll('[data-inc]').forEach((b) => { b.onclick = () => { cart[Number(b.dataset.inc)].qty++; openCart(); m.close(); }; });
      m.el.querySelectorAll('[data-dec]').forEach((b) => { b.onclick = () => { const i = Number(b.dataset.dec); cart[i].qty--; if (cart[i].qty <= 0) cart.splice(i, 1); openCart(); m.close(); }; });
      m.el.querySelector('#checkout')?.addEventListener('click', async () => {
        try {
          await post('/api/orders/internal', {
            items: cart.map((c) => (c.listingId ? { listingId: c.listingId, qty: c.qty } : { productId: c.productId, qty: c.qty }))
          });
          sound.success();
          toast('تم إرسال الطلب بنجاح', 'success');
          cart = [];
          refreshCount();
          m.close();
        } catch (e) {
          sound.error();
          toast(e.message, 'danger');
        }
      });
    }
  });
}

export default { render, meta };
