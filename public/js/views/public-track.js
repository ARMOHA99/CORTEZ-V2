import { get } from '../core/api.js';
import { esc, pageHeader, statusBadge } from '../core/ui.js';

export const meta = { title: 'تتبّع الطلب', kicker: 'TRACK' };

export async function render(root) {
  root.innerHTML = `
    <div class="public-shell">
      <div class="public-top">
        <a href="/" class="brand"><span class="brand-sigil">C</span><span class="brand-copy"><strong class="org-name">CORTEZ</strong></span></a>
        <div class="row">
          <a href="#/shop" class="btn btn-ghost btn-sm">المتجر</a>
          <a href="/" class="btn btn-ghost btn-sm">العودة للرئيسية</a>
        </div>
      </div>
      <div class="public-hero">
        <p class="eyebrow">ORDER TRACKING</p>
        <h1>تتبّع حالة الطلب</h1>
      </div>
      <div class="card" style="max-width:500px;margin:0 auto">
        <div class="card-body stack">
          <div class="field"><label>رقم الطلب</label><input class="input" id="code" placeholder="ORD-XXXX-XXXX" /></div>
          <button class="btn btn-primary" id="search">بحث</button>
          <div id="result" class="stack"></div>
        </div>
      </div>
    </div>
  `;
  
  const params = new URLSearchParams(location.hash.split('?')[1]||'');
  if(params.get('code')) { document.getElementById('code').value = params.get('code'); search(); }
  
  document.getElementById('search').addEventListener('click', search);
  
  async function search() {
    const code = document.getElementById('code').value.trim();
    const res = document.getElementById('result');
    if(!code) return;
    res.innerHTML = '<div class="view-loading"><div class="loader-ring"></div></div>';
    try {
      const data = await get('/api/public/orders/' + encodeURIComponent(code));
      const o = data.order;
      res.innerHTML = `
        <div class="order-card">
          <div class="order-head"><span class="code">${esc(o.code)}</span>${statusBadge(o.status)}</div>
          <div class="order-items">${(o.items||[]).map(i=>`<span class="chip">${esc(i.name)} × ${i.qty}</span>`).join('')}</div>
          <div class="kv"><span>المجموع</span><strong>${o.total} دولار</strong></div>
        </div>
      `;
    } catch(e) {
      res.innerHTML = '<p class="muted">' + esc(e.message) + '</p>';
    }
  }
}
