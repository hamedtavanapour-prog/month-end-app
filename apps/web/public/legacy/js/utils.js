// utils.js — formatting, DOM, badge and sorting helpers shared across features.

function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2);}
function fmt(n){return '$'+(parseFloat(n)||0).toFixed(2);}
function fmtDate(d){if(!d)return'—';return new Date(d+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});}
function today(){return new Date().toISOString().slice(0,10);}
function toast(msg,err=false){const t=document.getElementById('toast');t.textContent=msg;t.className=err?'error show':'show';setTimeout(()=>t.className='',3600);}
function getProduct(id){return state.products.find(p=>p.id===id);}
function productNameLink(productOrId,label=null){
  const product=typeof productOrId==='string'?getProduct(productOrId):productOrId;
  if(!product)return escapeHtml(label||'—');
  return`<button class="link-btn product-name-link" onclick="event.stopPropagation();openProductView('${product.id}')">${escapeHtml(label||product.name)}</button>`;
}
function normalizeProductUnits(product){
  if(!Array.isArray(product.units)||!product.units.length){
    product.units=[{unit:product.unit||'',unitSize:product.unitSize||'',sku:product.sku||'',cost:product.cost||0}];
  }
  product.units=product.units.map(unit=>({
    unit:unit.unit||product.unit||'',
    unitSize:unit.unitSize||'',
    sku:unit.sku||product.sku||'',
    cost:parseFloat(unit.cost)||0,
    par:parseFloat(unit.par??product.par)||0
  }));
  const primary=product.units[0]||{};
  product.unit=product.unit||primary.unit||'';
  product.cost=parseFloat(product.cost)||primary.cost||0;
  product.sku=product.sku||primary.sku||'';
  return product.units;
}
function catBadge(cat){return`<span class="badge cat-${(cat||'Other').replace(/[\s\/]/g,'')}">${cat||'Other'}</span>`;}
function subBadge(sub){return sub?`<span class="sub-badge">${sub}</span>`:'';}
function aliasBadges(a){if(!a)return'';const chips=a.split(',').map(x=>x.trim()).filter(Boolean);if(!chips.length)return'';return'<div class="alias-chips">'+chips.map(x=>`<span class="alias-chip">${x}</span>`).join('')+'</div>';}
function previewAliases(){const v=document.getElementById('pm-aliases').value;document.getElementById('pm-aliases-preview').innerHTML=v.split(',').map(x=>x.trim()).filter(Boolean).map(x=>`<span class="alias-chip">${x}</span>`).join('');}
function updateSubcatOptions(tid,sid){const cat=document.getElementById(sid).value;const s=document.getElementById(tid);if(!s)return;s.innerHTML=(SUBCATS[cat]||[]).map(x=>`<option>${x}</option>`).join('');}
function updateSubcatFilter(tid,sid){const cat=document.getElementById(sid).value;const s=document.getElementById(tid);if(!s)return;s.innerHTML='<option value="">All</option>'+(cat?(SUBCATS[cat]||[]):[]).map(x=>`<option>${x}</option>`).join('');}
function sortableTableHeader(label,tableKey,sortKey){
  const current=sortState[tableKey]||{};
  const direction=current.col===sortKey?current.dir:'none';
  const sortClass=direction==='asc'?'sort-asc':direction==='desc'?'sort-desc':'';
  const ariaSort=direction==='asc'?'ascending':direction==='desc'?'descending':'none';
  return`<th class="sortable ${sortClass}" aria-sort="${ariaSort}"><button class="table-sort-button" type="button" onclick="sortTable('${tableKey}','${sortKey}')">${label}</button></th>`;
}
function sortTable(key,col){const s=sortState[key];s.dir=(s.col===col&&s.dir==='asc')?'desc':'asc';s.col=col;({products:renderProducts,inventories:renderInventoryTable,liveInventory:renderLiveInventoryPage,orders:renderOrders,suppliers:renderSuppliers,report:renderReport})[key]();}
function sortArr(arr,col,dir){return[...arr].sort((a,b)=>{let va=a[col]??'',vb=b[col]??'';if(typeof va==='string')va=va.toLowerCase();if(typeof vb==='string')vb=vb.toLowerCase();return va<vb?(dir==='asc'?-1:1):va>vb?(dir==='asc'?1:-1):0;});}
