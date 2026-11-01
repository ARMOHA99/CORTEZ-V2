import { get, post } from '../core/api.js';
import { state } from '../core/state.js';
import { esc, num, money, pageHeader, emptyState, openModal, toast } from '../core/ui.js';
import * as sound from '../core/sound.js';

export const meta = { title: 'المتجر الداخلي', kicker: 'STORE' };

let cart = [];

export async function render(root) {
  root.innerHTML = '<div class="view-loading"><div class="loader-ring"></div></div>';
  try {
    const data = await get('/api/products?scope=internal');
    root.innerHTML = `
      ${pageHeader({ kicker: 'INTERNAL STORE', title: 'المتجر الداخلي', description: 'طلب العتاد والمعدات للعائلة.' })}
      <div class="store-grid">
        ${(data.items||[]).length ? data.items.map(p => `
          <div class="product-card tilt">
            <div class="product-media">${p.image ? `<img src="${esc(p.image)}" alt="" />` : `<span class="ph">■</span>`}</div>
            <div class="product-body">
              <h4>${esc(p.name)}</h4>
              <p>${esc(p.description||'')}</p>
              <div class="product-foot">
                <div class="price">${num(p.price)} <small>${esc(state.config?.system?.currencyLabel||'دولار')}</small></div>
                <button class="btn btn-sm btn-primary" data-add="${p._id}" data-name="${esc(p.name)}" data-price="${p.price}">أضف للسلة</button>
              </div>
            </div>
          </div>
        `).join('') : emptyState('المتجر فارغ', '')}
      </div>
      <button class="cart-fab" id="cart-fab"><span>🛒</span> السلة <span class="count" id="cart-count">0</span></button>
    `;
    
    root.querySelectorAll('[data-add]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.add;
        const name = btn.dataset.name;
        const price = Number(btn.dataset.price)||0;
        const existing = cart.find(c=>c.productId===id);
        if(existing) existing.qty++; else cart.push({productId:id, name, price, qty:1});
        updateCart();
        sound.click();
      });
    });
    
    root.querySelector('#cart-fab').addEventListener('click', openCart);
    updateCart();
  } catch (e) {
    root.innerHTML = `<div class="card"><h3>خطأ</h3><p class="muted">${esc(e.message)}</p></div>`;
  }
}

function updateCart() {
  const c = document.getElementById('cart-count');
  if(c) c.textContent = cart.reduce((s,i)=>s+i.qty,0);
}

function openCart() {
  const total = cart.reduce((s,i)=>s+i.qty*i.price,0);
  openModal({
    title: 'سلة الطلب',
    subtitle: 'INTERNAL ORDER',
    body: `
      <div class="stack">
        ${cart.length ? cart.map((item,idx)=>`
          <div class="cart-line">
            <div style="flex:1"><strong>${esc(item.name)}</strong><div class="muted">${num(item.price)} × ${item.qty} = ${num(item.price*item.qty)}</div></div>
            <div class="qty">
              <button data-dec="${idx}">-</button>
              <span>${item.qty}</span>
              <button data-inc="${idx}">+</button>
            </div>
          </div>
        `).join('') : '<p class="muted">السلة فارغة</p>'}
        <div class="cart-total"><span>المجموع</span><strong>${num(total)} ${esc(state.config?.system?.currencyLabel||'دولار')}</strong></div>
      </div>
    `,
    footer: cart.length ? '<button class="btn btn-ghost" data-close>إغلاق</button><button class="btn btn-primary" id="checkout">إرسال الطلب</button>' : '<button class="btn btn-ghost" data-close>إغلاق</button>',
    onMount: (m) => {
      m.el.querySelector('[data-close]').onclick = ()=>m.close();
      m.el.querySelectorAll('[data-inc]').forEach(b=>b.onclick=()=>{cart[Number(b.dataset.inc)].qty++; openCart(); m.close();});
      m.el.querySelectorAll('[data-dec]').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.dec); cart[i].qty--; if(cart[i].qty<=0) cart.splice(i,1); openCart(); m.close();});
      m.el.querySelector('#checkout')?.addEventListener('click', async ()=>{
        try {
          await post('/api/orders/internal', { items: cart.map(c=>({productId:c.productId, qty:c.qty})) });
          sound.success(); toast('تم إرسال الطلب بنجاح', 'success');
          cart=[]; updateCart(); m.close();
        } catch(e){ sound.error(); toast(e.message,'danger'); }
      });
    }
  });
}
