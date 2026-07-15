// suppliers.js — supplier records, linked products, detail view, and actions.

let supplierViewSupplierId=null;
let supplierViewFocusProductIds=[];
let supplierViewPrimaryProductId=null;

function supplierById(id){
  return state.suppliers.find(supplier=>supplier.id===id);
}

function openSupplierModal(id=null){
  editingSupId=id;
  document.getElementById('modal-supplier-view')?.classList.remove('open');
  document.getElementById('sup-modal-title').textContent=id?'Edit Supplier':'Add Supplier';
  if(id){
    const s=supplierById(id);
    if(!s){toast('Supplier not found.',true);return;}
    document.getElementById('sm-name').value=s.name;
    document.getElementById('sm-contact').value=s.contact||'';
    document.getElementById('sm-email').value=s.email||'';
    document.getElementById('sm-phone').value=s.phone||'';
    document.getElementById('sm-website').value=s.website||'';
    document.getElementById('sm-lead').value=s.leadDays||'';
    document.getElementById('sm-minspend').value=s.minSpend||'';
    document.getElementById('sm-minqty').value=s.minQty||'';
    document.getElementById('sm-notes').value=s.notes||'';
    document.getElementById('sm-prod-search').value='';
    buildSupProds(s.products||[]);
  }else{
    ['sm-name','sm-contact','sm-email','sm-phone','sm-website','sm-lead','sm-minspend','sm-minqty','sm-notes','sm-prod-search'].forEach(i=>document.getElementById(i).value='');
    buildSupProds([]);
  }
  openModal('modal-supplier');
}

function buildSupProds(selected){
  const el=document.getElementById('sm-prod-list');
  const search=document.getElementById('sm-prod-search').value.toLowerCase();
  const prods=state.products.filter(p=>!search||p.name.toLowerCase().includes(search)||(p.category||'').toLowerCase().includes(search));
  const groups={};
  prods.forEach(p=>{if(!groups[p.category])groups[p.category]=[];groups[p.category].push(p);});
  let html='';
  Object.entries(groups).forEach(([cat,items])=>{
    html+=`<div style="font-size:0.72rem;color:var(--accent);font-weight:700;text-transform:uppercase;padding:6px 0 3px;">${cat}</div>`;
    items.forEach(p=>{
      html+=`<label style="display:flex;align-items:center;gap:8px;padding:3px 0;font-size:0.83rem;cursor:pointer;"><input type="checkbox" id="smp-${p.id}" value="${p.id}" ${selected.includes(p.id)?'checked':''} style="accent-color:var(--accent);width:14px;height:14px;"> ${p.name}</label>`;
    });
  });
  el.innerHTML=html||'<p style="color:var(--text-muted);font-size:0.82rem;">No products found.</p>';
}

function filterSupplierProds(){buildSupProds(getSupProds());}
function getSupProds(){return[...document.querySelectorAll('#sm-prod-list input[type=checkbox]:checked')].map(c=>c.value);}

function saveSupplier(){
  const name=document.getElementById('sm-name').value.trim();
  if(!name){toast('Name required.',true);return;}
  const existing=editingSupId?supplierById(editingSupId):null;
  const sup={
    id:editingSupId||uid(),
    name,
    contact:document.getElementById('sm-contact').value.trim(),
    email:document.getElementById('sm-email').value.trim(),
    phone:document.getElementById('sm-phone').value.trim(),
    website:document.getElementById('sm-website').value.trim(),
    leadDays:parseInt(document.getElementById('sm-lead').value)||0,
    minSpend:parseFloat(document.getElementById('sm-minspend').value)||0,
    minQty:parseFloat(document.getElementById('sm-minqty').value)||0,
    notes:document.getElementById('sm-notes').value.trim(),
    products:getSupProds(),
    archived:existing?.archived||false
  };
  if(editingSupId){
    const i=state.suppliers.findIndex(s=>s.id===editingSupId);
    state.suppliers[i]=sup;
  }else state.suppliers.push(sup);
  syncSupplierProductLinks(sup);
  save();
  closeModal('modal-supplier');
  renderSuppliers();
  toast(editingSupId?'Updated.':'Added.');
}

// Keep the reverse links (product.suppliers) consistent with a supplier's products.
function syncSupplierProductLinks(sup){
  state.products.forEach(p=>{
    if(!Array.isArray(p.suppliers))p.suppliers=[];
    const linked=(sup.products||[]).includes(p.id);
    const idx=p.suppliers.indexOf(sup.id);
    if(linked&&idx===-1)p.suppliers.push(sup.id);
    else if(!linked&&idx!==-1)p.suppliers.splice(idx,1);
  });
}

function archiveSupplier(id,archived=true){
  closeAllMenus();
  const supplier=supplierById(id);
  if(!supplier)return;
  supplier.archived=archived;
  save();
  closeModal('modal-supplier-view');
  renderSuppliers();
  toast(archived?'Archived.':'Restored.');
}

function deleteSupplier(id){
  closeAllMenus();
  if(!confirm('Delete supplier?'))return;
  state.suppliers=state.suppliers.filter(s=>s.id!==id);
  state.products.forEach(p=>{if(Array.isArray(p.suppliers))p.suppliers=p.suppliers.filter(sid=>sid!==id);});
  save();
  closeModal('modal-supplier-view');
  renderSuppliers();
  toast('Deleted.');
}

function supplierProductsHtml(supplier){
  const products=(supplier.products||[]).map(id=>getProduct(id)).filter(Boolean).sort((a,b)=>a.name.localeCompare(b.name));
  if(!products.length)return'<span style="color:var(--text-muted);font-size:0.78rem;">None linked</span>';
  return products.map(product=>`<span class="sup-tag">${escapeHtml(product.name)}</span>`).join('');
}

function supplierProductsSummaryHtml(supplier){
  const products=(supplier.products||[]).map(id=>getProduct(id)).filter(Boolean).sort((a,b)=>a.name.localeCompare(b.name));
  if(!products.length)return'<span style="color:var(--text-muted);font-size:0.78rem;">None linked</span>';
  const first=products[0];
  const remaining=products.length-1;
  return`<button class="supplier-products-summary" onclick="event.stopPropagation();openSupplierViewFromSearch('${supplier.id}')" title="View linked products">
    <span class="sup-tag">${escapeHtml(first.name)}</span>${remaining>0?`<span class="sub-badge">+${remaining} more</span>`:''}
  </button>`;
}

function supplierSearchText(supplier){
  return[supplier.name,supplier.contact,supplier.email,supplier.phone,supplier.website,supplier.notes].join(' ').toLowerCase();
}

function normalizeSupplierQuery(value){
  return String(value||'').toLowerCase().replace(/[^a-z0-9]/g,'');
}

function supplierMatchDistance(a,b){
  if(!a||!b)return 99;
  const m=a.length,n=b.length;
  const dp=Array.from({length:m+1},(_,i)=>Array.from({length:n+1},(__,j)=>i?j?0:j:j));
  for(let i=1;i<=m;i++){
    for(let j=1;j<=n;j++){
      const cost=a[i-1]===b[j-1]?0:1;
      dp[i][j]=Math.min(dp[i-1][j]+1,dp[i][j-1]+1,dp[i-1][j-1]+cost);
    }
  }
  return dp[m][n];
}

function productSearchScore(product,search){
  const query=String(search||'').trim().toLowerCase();
  const compactQuery=normalizeSupplierQuery(query);
  if(!query)return 0;
  const text=[product.name,product.category,product.subcategory,product.unit,product.sku].join(' ').toLowerCase();
  const compactText=normalizeSupplierQuery(text);
  const tokens=text.split(/[^a-z0-9]+/).filter(Boolean);
  const compactTokens=tokens.map(normalizeSupplierQuery);
  const queryTokens=query.split(/[^a-z0-9]+/).filter(Boolean).map(normalizeSupplierQuery);
  if(tokens.includes(query))return 110;
  if(text.includes(query))return 100;
  if(compactQuery.length>=5&&compactText.includes(compactQuery))return 95;
  if(compactQuery.length>=4&&compactTokens.some(token=>token.startsWith(compactQuery)))return 85;
  if(queryTokens.length>1&&queryTokens.every(q=>compactTokens.some(token=>token===q||token.startsWith(q))))return 75;
  const maxDistance=compactQuery.length<=4?1:2;
  const fuzzy=compactTokens.some(token=>{
    if(!token||Math.abs(token.length-compactQuery.length)>maxDistance)return false;
    return supplierMatchDistance(token,compactQuery)<=maxDistance;
  });
  return fuzzy?60:0;
}

function bestSupplierProductMatch(supplier,search){
  const products=(supplier.products||[]).map(id=>getProduct(id)).filter(Boolean);
  let best=null;
  let bestScore=0;
  products.forEach(product=>{
    const score=productSearchScore(product,search);
    if(score>bestScore){
      best=product;
      bestScore=score;
    }
  });
  return best;
}

function supplierProductMatches(supplier,search){
  return(supplier.products||[]).map(id=>getProduct(id)).filter(Boolean).map(product=>({
    product,
    score:productSearchScore(product,search)
  })).filter(match=>match.score>0).sort((a,b)=>b.score-a.score||a.product.name.localeCompare(b.product.name));
}

function openSupplierViewFromSearch(id){
  const supplier=supplierById(id);
  if(!supplier)return;
  const search=document.getElementById('sup-search')?.value||'';
  openSupplierView(id,null,search);
}

function supplierMenuHtml(supplier,menuId){
  return`<div class="drop-wrap">
    <button class="btn btn-secondary btn-sm icon-btn" onclick="event.stopPropagation();toggleMenu('${menuId}')" title="Supplier actions">...</button>
    <div class="drop-menu" id="${menuId}">
      <button onclick="event.stopPropagation();closeAllMenus();openSupplierModal('${supplier.id}')">Edit</button>
      <button onclick="event.stopPropagation();closeAllMenus();archiveSupplier('${supplier.id}',${supplier.archived?'false':'true'})">${supplier.archived?'Restore':'Archive'}</button>
      <button onclick="event.stopPropagation();closeAllMenus();deleteSupplier('${supplier.id}')">Delete</button>
    </div>
  </div>`;
}

function supplierViewProductRows(supplier,search=''){
  const query=String(search||'').trim().toLowerCase();
  const products=(supplier.products||[]).map(pid=>getProduct(pid)).filter(Boolean).sort((a,b)=>a.name.localeCompare(b.name));
  const visible=products.filter(product=>{
    return !query||productSearchScore(product,query)>0;
  });
  if(!visible.length)return`<tr><td colspan="5" style="color:var(--text-muted);text-align:center;">${products.length?'No linked products match your search.':'No linked products.'}</td></tr>`;
  return visible.map(product=>`
    <tr data-product-id="${product.id}" class="${supplierViewFocusProductIds.includes(product.id)?'supplier-product-highlight':''}">
      <td><strong>${escapeHtml(product.name)}</strong></td>
      <td>${catBadge(product.category)}</td>
      <td>${subBadge(product.subcategory)}</td>
      <td>${escapeHtml(product.unit||'')}</td>
      <td>${product.par||'—'}</td>
    </tr>
  `).join('');
}

function renderSupplierViewProducts(){
  const supplier=supplierById(supplierViewSupplierId);
  const tbody=document.getElementById('supplier-view-products-tbody');
  if(!supplier||!tbody)return;
  const search=document.getElementById('supplier-view-product-search')?.value||'';
  tbody.innerHTML=supplierViewProductRows(supplier,search);
}

function focusSupplierViewProduct(){
  if(!supplierViewPrimaryProductId)return;
  const row=document.querySelector(`#supplier-view-products-tbody tr[data-product-id="${supplierViewPrimaryProductId}"]`);
  if(row&&typeof row.scrollIntoView==='function')row.scrollIntoView({block:'center',behavior:'smooth'});
}

function openSupplierView(id,focusProductId=null,searchHint=''){
  const supplier=supplierById(id);
  if(!supplier)return;
  const hint=searchHint||(document.getElementById('sup-search')?.value||'');
  const directProduct=focusProductId?getProduct(focusProductId):null;
  const matches=directProduct?[{product:directProduct,score:999}]:supplierProductMatches(supplier,hint);
  const matchedProduct=matches[0]?.product||null;
  supplierViewSupplierId=id;
  supplierViewFocusProductIds=matches.map(match=>match.product.id);
  supplierViewPrimaryProductId=matchedProduct?.id||null;
  const products=(supplier.products||[]).map(pid=>getProduct(pid)).filter(Boolean).sort((a,b)=>a.name.localeCompare(b.name));
  document.getElementById('supplier-view-body').innerHTML=`
    <div class="product-view-head">
      <div>
        <h3>${escapeHtml(supplier.name)}${supplier.archived?' <span class="sub-badge">Archived</span>':''}</h3>
        <div class="product-view-meta"><span class="sup-tag">${products.length} products</span>${supplier.leadDays?`<span class="sub-badge">${supplier.leadDays} lead days</span>`:''}${matchedProduct?`<span class="sub-badge">Showing ${escapeHtml(matchedProduct.name)}</span>`:''}</div>
      </div>
    </div>
    <div class="product-detail-grid">
      <div class="product-detail-field"><div class="label">Contact</div><div class="value">${escapeHtml(supplier.contact||'—')}</div></div>
      <div class="product-detail-field"><div class="label">Email</div><div class="value">${supplier.email?`<a href="mailto:${escapeHtml(supplier.email)}" style="color:var(--accent);">${escapeHtml(supplier.email)}</a>`:'—'}</div></div>
      <div class="product-detail-field"><div class="label">Phone</div><div class="value">${escapeHtml(supplier.phone||'—')}</div></div>
      <div class="product-detail-field"><div class="label">Minimum</div><div class="value">${supplier.minSpend?fmt(supplier.minSpend):'—'}${supplier.minQty?' / '+supplier.minQty+' units':''}</div></div>
    </div>
    <div class="product-view-section"><div class="label">Website</div><p>${supplier.website?`<a href="${escapeHtml(supplier.website)}" target="_blank" rel="noopener" style="color:var(--accent);">${escapeHtml(supplier.website)}</a>`:'—'}</p></div>
    <div class="product-view-section"><div class="label">Notes</div><p>${escapeHtml(supplier.notes||'—')}</p></div>
    <div class="product-view-section"><div class="label">Linked Products</div>
      <div class="form-group supplier-view-search"><label>Search Products</label><input type="text" id="supplier-view-product-search" placeholder="Find a linked product…" oninput="renderSupplierViewProducts()"></div>
      <div class="table-wrap supplier-products-table-wrap"><table><thead><tr><th>Product</th><th>Category</th><th>Sub</th><th>Unit</th><th>Par</th></tr></thead><tbody id="supplier-view-products-tbody">${supplierViewProductRows(supplier)}</tbody></table></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="openSupplierModal('${supplier.id}')">Edit</button>
      <button class="btn btn-secondary" onclick="archiveSupplier('${supplier.id}',${supplier.archived?'false':'true'})">${supplier.archived?'Restore':'Archive'}</button>
      <button class="btn btn-ghost-danger" onclick="deleteSupplier('${supplier.id}')">Delete</button>
    </div>
  `;
  openModal('modal-supplier-view');
  setTimeout(focusSupplierViewProduct,40);
}

function renderSuppliers(){
  const tbody=document.getElementById('sup-tbody');
  const thead=document.getElementById('sup-thead');
  const{col,dir}=sortState.suppliers;
  const search=(document.getElementById('sup-search')?.value||'').trim().toLowerCase();
  const status=document.getElementById('sup-status-f')?.value||'active';
  const visCols=SUP_COLS.filter(c=>c.visible);
  thead.innerHTML='<tr>'+visCols.map(c=>{
    if(!c.sort)return`<th>${c.label}</th>`;
    return sortableTableHeader(c.label,'suppliers',c.sort);
  }).join('')+'</tr>';
  const filtered=state.suppliers.filter(s=>{
    const statusMatch=status==='all'||(status==='archived'?!!s.archived:!s.archived);
    return statusMatch&&(!search||supplierSearchText(s).includes(search)||!!bestSupplierProductMatch(s,search));
  }).map(s=>({...s,productCount:(s.products||[]).filter(id=>getProduct(id)).length}));
  const rows=sortArr(filtered,col,dir);
  if(!rows.length){tbody.innerHTML=`<tr><td colspan="${visCols.length}" style="text-align:center;color:var(--text-muted);padding:28px;">No suppliers found.</td></tr>`;return;}
  tbody.innerHTML=rows.map((s,index)=>{
    const menuId=`supplier-actions-${index}`;
    return`<tr class="supplier-row ${s.archived?'archived-row':''}" onclick="openSupplierViewFromSearch('${s.id}')">
      ${visCols.map(c=>{switch(c.key){
        case 'name':return`<td><strong>${escapeHtml(s.name)}</strong>${s.archived?' <span class="sub-badge">Archived</span>':''}</td>`;
        case 'contact':return`<td>${escapeHtml(s.contact||'—')}</td>`;
        case 'email':return`<td>${s.email?`<a href="mailto:${escapeHtml(s.email)}" onclick="event.stopPropagation();" style="color:var(--accent);">${escapeHtml(s.email)}</a>`:'—'}</td>`;
        case 'phone':return`<td>${escapeHtml(s.phone||'—')}</td>`;
        case 'leadDays':return`<td>${s.leadDays?s.leadDays+'d':'—'}</td>`;
        case 'minimum':return`<td>${s.minSpend?fmt(s.minSpend):'—'}${s.minQty?' / '+s.minQty+' units':''}</td>`;
        case 'products':return`<td style="max-width:240px;">${supplierProductsSummaryHtml(s)}</td>`;
        case 'actions':return`<td onclick="event.stopPropagation();">${supplierMenuHtml(s,menuId)}</td>`;
        default:return`<td>—</td>`;
      }}).join('')}
    </tr>`;
  }).join('');
}
