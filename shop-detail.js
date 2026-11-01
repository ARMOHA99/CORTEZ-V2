/**
 * CORTEZ — صفحة منتج: #/shop/p/<sku>
 * تُحوّل المتجر من شبكة صور إلى صفحة منتج كاملة بطلب فوري.
 */

import { get, post } from '../core/api.js';
import { state } from '../core/state.js';
import { esc, num, emptyState, toast, statusBadge } from '../core/ui.js';

export const meta = { title: 'منتج', kicker: 'SHOP' };

function currentSku() {
  const hash = location.hash || '';
  const index = hash.indexOf('/p/');
  if (index === -1) return '';
  return decodeURIComponent(hash.slice(index + 3).split('?')[0]);
}

export async function render(root) {
  const sku = currentSku();
  root.innerHTML = `<div class="card"><div class="skeleton skel-title"></div><div class="skeleton skel-line"></div><div class="skeleton skel-line"></div></div>`;

  let data;
  try {
    data = await get('/api/shop/products');
  } catch (error) {
    root.innerHTML = `<div class="card"><h3>تعذّر تحميل المنتج</h3><p class="muted">${esc(error.message)}</p>
      <a class="btn btn-ghost" href="/#/shop">العودة للمتجر</a></div>`;
    return;
  }

  const items = Array.isArray(data.items) ? data.items : [];
  const product = items.find((item) => String(item.sku || '') === sku || String(item._id) === sku);

  if (!product) {
    root.innerHTML = emptyState('المنتج غير موجود', 'ربما حُذف أو تغيّر رابطه.', '◇')
      + '<div class="row" style="justify-content:center"><a class="btn btn-primary" href="/#/shop">كل المنتجات</a></div>';
    return;
  }

  const currency = state.config?.system?.currencyLabel || 'دولار';
  const available = product.available !== false;
  const max = product.stock === null || product.stock === undefined ? 99 : Math.max(1, product.stock);
  let qty = 1;

  root.innerHTML = `
    <div class="product-detail">
      <a class="btn btn-ghost btn-sm" href="/#/shop">← المتجر</a>
      <div class="pd-grid">
        <div class="pd-media ${product.image ? '' : 'is-empty'}">
          ${product.image ? `<img src="${esc(product.image)}" alt="${esc(product.name)}" />` : '<span class="ph">■</span>'}
        </div>
        <div class="pd-body">
          <p class="eyebrow">${esc(String(product.category || 'ITEM').toUpperCase())}</p>
          <h2>${esc(product.name)}</h2>
          <p class="muted">${esc(product.description || 'لا يوجد وصف لهذا المنتج.')}</p>
          <div class="pd-meta">
            <span class="badge ${available ? 'success' : 'danger'}">
              ${available ? (product.stock === null || product.stock === undefined ? 'متوفر' : `متوفر: ${num(product.stock)}`) : 'نفدت الكمية'}
            </span>
            ${product.sku ? `<span class="badge">${esc(product.sku)}</span>` : ''}
          </div>
          <div class="pd-price">${num(product.price)} <small>${esc(currency)}</small></div>
          <div class="pd-buy">
            <div class="qty-stepper">
              <button type="button" data-step="-1" aria-label="تقليل">−</button>
              <span id="qty">1</span>
              <button type="button" data-step="1" aria-label="زيادة">+</button>
            </div>
            <button class="btn btn-primary" id="buy" ${available ? '' : 'disabled'}>
              ${available ? 'أرسل الطلب' : 'غير متوفر'}
            </button>
          </div>
          <p class="muted pd-total">الإجمالي: <strong id="total">${num(product.price)}</strong> ${esc(currency)}</p>
          <div id="result"></div>
        </div>
      </div>
    </div>`;

  const qtyEl = root.querySelector('#qty');
  const totalEl = root.querySelector('#total');
  const paintTotal = () => {
    qtyEl.textContent = String(qty);
    totalEl.textContent = num(Math.round(Number(product.price) * qty));
  };

  root.querySelectorAll('[data-step]').forEach((button) => {
    button.addEventListener('click', () => {
      qty = Math.min(max, Math.max(1, qty + Number(button.dataset.step)));
      paintTotal();
    });
  });

  const buy = root.querySelector('#buy');
  if (buy) {
    buy.addEventListener('click', async () => {
      buy.disabled = true;
      buy.textContent = 'جارٍ الإرسال…';
      try {
        const result = await post('/api/shop/orders', {
          items: [{ productId: product._id, qty }],
          note: ''
        });
        const order = result.order || {};
        root.querySelector('#result').innerHTML = `
          <div class="card pd-order">
            <div class="card-head">
              <div><p class="eyebrow">ORDER</p><h4>تم إنشاء طلبك</h4></div>
              ${statusBadge(order.status || 'pending')}
            </div>
            <p class="muted">رقم الطلب: <strong>${esc(order.code || '')}</strong></p>
            <div class="row" style="gap:8px;flex-wrap:wrap">
              <a class="btn btn-primary btn-sm" href="/#/orders">متابعة الطلبات</a>
              <a class="btn btn-ghost btn-sm" href="/#/shop">مواصلة التسوق</a>
            </div>
          </div>`;
        buy.textContent = 'تم الإرسال';
        toast('تم إنشاء الطلب', 'success');
      } catch (error) {
        toast(error.message, 'danger');
        buy.disabled = false;
        buy.textContent = 'أرسل الطلب';
      }
    });
  }
}
