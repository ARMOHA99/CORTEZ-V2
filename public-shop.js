import { get, post } from '../core/api.js';
import { esc, num, pageHeader, emptyState, openModal, toast } from '../core/ui.js';

export const meta = { title: 'المتجر الخارجي', kicker: 'PUBLIC' };

let cart = [];

export async function render(root) {
  root.innerHTML = '<div class="view-loading"><div class="loader-ring"></div></div>';
  try {
    const data = await get('/api/public/products');
    root.innerHTML = `
      <div class="public-shell">
        <div class="public-top">
          <a href="/" class="brand"><span class="brand-sigil">C</span><span class="brand-copy"><strong class="org-name">CORTEZ</strong></span></a>
          <div class="row">
            <a href="#/track" class="btn btn-ghost btn-sm">تتبّع طلب</a>
            <a href="/" class="btn btn-ghost btn-sm">العودة للرئيسية</a>
          </div>
        </div>
        <div class="public-hero">
          <p class="eyebrow">PUBLIC STORE</p>
          <h1>المتجر الخارجي</h1>
          <p>يمكن للجميع تقديم طلب عبر هذا المتجر</p>
        </div>
        <div class="store-grid">
          ${(data.items||[]).length ? data.items.map(p => `
            <div class="product-card">
              <div class="product-media">${p.image ? `<img src="${esc(p.image)}" alt="" />` : `<span class="ph">■</span>`}</div>
              <div class="product-body">
                <h4>${esc(p.name)}</h4>
                <p>${esc(p.description||'')}</p>
                <div class="product-foot">
                  <div class="price">${num(p.price)} <small>دولار</small></div>
                  <button class="btn btn-sm btn-primary" data-add="${p._id}" data-name="${esc(p.name)}" data-price="${p.price}">أضف</button>
                </div>
              </div>
            </div>
          `).join('') : emptyState('المتجر مغلق أو فارغ', '')}
        </div>
        <button class="cart-fab" id="cart-fab"><span>🛒</span> السلة <span class="count" id="cart-count">0</span></button>
      </div>
    `;
    
    root.querySelectorAll('[data-add]').forEach(btn => {
      btn.addEventListener('click', ()=>{
        const id = btn.dataset.add;
        const name = btn.dataset.name;
        const price = Number(btn.dataset.price)||0;
        const existing = cart.find(c=>c.productId===id);
        if(existing) existing.qty++; else cart.push({productId:id, name, price, qty:1});
        const c = document.getElementById('cart-count'); if(c) c.textContent = cart.reduce((s,i)=>s+i.qty,0);
        toast('أضيف للسلة','success');
      });
    });
    root.querySelector('#cart-fab').addEventListener('click', openCart);
  } catch (e) {
    root.innerHTML = `<div class="public-shell"><div class="card"><h3>خطأ</h3><p class="muted">${esc(e.message)}</p></div></div>`;
  }
}

function openCart() {
  const total = cart.reduce((s,i)=>s+i.qty*i.price,0);
  openModal({
    title: 'إتمام الطلب',
    subtitle: 'PUBLIC ORDER',
    body: `
      <form id="guest-form" class="stack">
        <div class="field"><label>الاسم الكامل *</label><input class="input" name="customer_name" required /></div>
        <div class="field"><label>وسيلة التواصل (Discord/ID) *</label><input class="input" name="customer_contact" required /></div>
        <div class="field"><label>ملاحظات</label><textarea class="textarea" name="note" rows="2"></textarea></div>
        <div class="divider"></div>
        ${cart.map(i=>`<div class="kv"><span>${esc(i.name)} × ${i.qty}</span><strong>${num(i.price*i.qty)} دولار</strong></div>`).join('')}
        <div class="cart-total"><span>المجموع</span><strong>${num(total)} دولار</strong></div>
      </form>
    `,
    footer: '<button class="btn btn-ghost" data-close>إلغاء</button><button class="btn btn-primary" id="guest-send">إرسال الطلب</button>',
    onMount: (m)=>{
      m.el.querySelector('[data-close]').onclick=()=>m.close();
      m.el.querySelector('#guest-send').onclick=async ()=>{
        const form = m.el.querySelector('#guest-form');
        const fd = new FormData(form);
        const data = { customer: { name: fd.get('customer_name'), contact: fd.get('customer_contact') }, items: cart.map(c=>({productId:c.productId, qty:c.qty})), note: fd.get('note') };
        try {
          const res = await post('/api/public/orders', data);
          toast('تم إرسال الطلب بنجاح • ' + res.order.code, 'success');
          cart=[]; m.close(); window.location.hash='#/track?code='+res.order.code;
        } catch(e){ toast(e.message,'danger'); }
      };
    }
  });
}
