import { get, post } from '../core/api.js';
import { state } from '../core/state.js';
import { esc, num, pageHeader, emptyState, openModal, toast } from '../core/ui.js';
import * as sound from '../core/sound.js';

export const meta = { title: 'المتجر الخارجي', kicker: 'SHOP' };

let cart = [];

function cartCount() {
  return cart.reduce((sum, item) => sum + item.qty, 0);
}

function refreshCount() {
  const el = document.getElementById('cart-count');
  if (el) el.textContent = cartCount();
}

export async function render(root) {
  root.innerHTML = '<div class="view-loading"><div class="loader-ring"></div></div>';
  try {
    const data = await get('/api/shop/products');
    const store = data.store || { open: true, title: 'المتجر الخارجي', description: '' };
    const label = state.config?.system?.currencyLabel || 'دولار';
    root.innerHTML = `
      ${pageHeader({ kicker: 'EXTERNAL STORE', title: store.title || 'المتجر الخارجي', description: store.description || 'اختر ما تريد وأرسل طلبك، وسيتواصل معك فريق المتجر.' })}
      <div class="store-grid">
        ${store.open === false
          ? emptyState('المتجر مغلق حالياً', 'عاود المحاولة لاحقاً')
          : (data.items || []).length
            ? data.items.map((p) => `
              <div class="product-card">
                <div class="product-media">${p.image ? `<img src="${esc(p.image)}" alt="" />` : '<span class="ph">■</span>'}</div>
                <div class="product-body">
                  <h4>${esc(p.name)}</h4>
                  <p>${esc(p.description || '')}</p>
                  <div class="product-foot">
                    <div class="price">${num(p.price)} <small>${esc(label)}</small></div>
                    ${p.available === false
                      ? '<span class="badge danger">نفدت الكمية</span>'
                      : `<button class="btn btn-sm btn-primary" data-add="${esc(p._id)}" data-name="${esc(p.name)}" data-price="${p.price}" type="button">أضف</button>`}
                  </div>
                </div>
              </div>`).join('')
            : emptyState('لا منتجات حالياً', 'لم تُضف منتجات للمتجر الخارجي بعد')}
      </div>
      <button class="cart-fab" id="cart-fab" type="button"><span>🛒</span> السلة <span class="count" id="cart-count">${cartCount()}</span></button>`;

    root.querySelectorAll('[data-add]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.add;
        const existing = cart.find((c) => c.productId === id);
        if (existing) existing.qty += 1;
        else cart.push({ productId: id, name: btn.dataset.name, price: Number(btn.dataset.price) || 0, qty: 1 });
        refreshCount();
        sound.click();
        toast('أُضيف للسلة', 'success');
      });
    });
    root.querySelector('#cart-fab').addEventListener('click', () => openCart(root, label));
  } catch (e) {
    root.innerHTML = `<div class="card"><h3>تعذّر فتح المتجر</h3><p class="muted">${esc(e.message)}</p></div>`;
  }
}

function openCart(root, label) {
  if (!cart.length) return toast('السلة فارغة', 'warning');
  const total = cart.reduce((sum, i) => sum + i.qty * i.price, 0);
  const modal = openModal({
    title: 'إتمام الطلب',
    subtitle: 'ORDER',
    body: `
      <form id="shop-form" class="adm-form">
        ${cart.map((i, idx) => `
          <div class="adm-row" style="justify-content:space-between">
            <span>${esc(i.name)}</span>
            <span class="adm-row">
              <button class="btn btn-ghost btn-sm" type="button" data-dec="${idx}">−</button>
              <strong>${i.qty}</strong>
              <button class="btn btn-ghost btn-sm" type="button" data-inc="${idx}">+</button>
              <strong>${num(i.price * i.qty)} ${esc(label)}</strong>
            </span>
          </div>`).join('')}
        <div class="cart-total"><span>المجموع</span><strong>${num(total)} ${esc(label)}</strong></div>
        <label>ملاحظات للطلب (اختياري)<textarea name="note" rows="2" maxlength="500"></textarea></label>
        <div class="adm-actions"><button class="btn btn-primary" type="submit">إرسال الطلب</button></div>
      </form>`
  });
  if (!modal) return;
  const form = modal.el.querySelector('#shop-form');
  const redraw = () => { modal.close(); if (cart.length) openCart(root, label); refreshCount(); };
  form.querySelectorAll('[data-inc]').forEach((b) => b.addEventListener('click', () => { cart[Number(b.dataset.inc)].qty += 1; redraw(); }));
  form.querySelectorAll('[data-dec]').forEach((b) => b.addEventListener('click', () => {
    const item = cart[Number(b.dataset.dec)];
    item.qty -= 1;
    if (item.qty <= 0) cart = cart.filter((c) => c !== item);
    redraw();
  }));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const res = await post('/api/shop/orders', { items: cart.map((c) => ({ productId: c.productId, qty: c.qty })), note: form.note.value.trim() });
      sound.success();
      toast('تم إرسال طلبك • ' + res.order.code, 'success');
      cart = [];
      modal.close();
      location.hash = '#/orders';
    } catch (e) { sound.error(); toast(e.message, 'danger'); }
  });
}
