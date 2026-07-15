// products.js — product list, selection, detail view, add/edit/delete/archive.

let productUnitEditorSnapshot=null;
let productUnitEditorSaving=false;

const PRODUCT_MENU_DEFINITIONS={
  products:{label:'Inventory Products',description:'Items assigned to this department'},
  'import-backlog':{label:'Import Backlog',description:'Unmatched imported items saved for later'},
  drinks:{label:'All Drinks',description:'Complete Bar drink catalog'},
  'core-drinks':{label:'Core Drinks',description:'Drinks marked Core in Settings'},
  'non-core-drinks':{label:'Non-Core Drinks',description:'Drinks marked Non-Core in Settings'},
  archived:{label:'Archived',description:'Archived items in this department'}
};

function defaultDepartments(){
  return[
    {id:'bar',name:'Bar',archived:false},
    {id:'kitchen',name:'Kitchen',archived:false}
  ];
}

function ensureDepartments(){
  const defaults=defaultDepartments();
  let changed=false;
  if(!Array.isArray(state.departments)){state.departments=[];changed=true;}
  const seen=new Set();
  state.departments=state.departments.map((department,index)=>{
    if(!department||!department.id||seen.has(department.id)){changed=true;return null;}
    seen.add(department.id);
    const normalized={id:String(department.id),name:String(department.name||`Department ${index+1}`).trim()||`Department ${index+1}`,archived:!!department.archived};
    if(JSON.stringify(department)!==JSON.stringify(normalized))changed=true;
    return normalized;
  }).filter(Boolean);
  defaults.forEach(department=>{if(!seen.has(department.id)){state.departments.push({...department});changed=true;}});
  return changed;
}

function allDepartments(){ensureDepartments();return state.departments;}
function activeDepartments(){return allDepartments().filter(department=>!department.archived);}
function getDepartment(id){return allDepartments().find(department=>department.id===id)||null;}
function departmentName(id){return getDepartment(id)?.name||'Department';}
function productDepartmentIds(product){
  const ids=Array.isArray(product?.departments)?product.departments.filter(Boolean):[product?.department].filter(Boolean);
  return[...new Set(ids.length?ids:['bar'])];
}
function productInDepartment(product,departmentId){return productDepartmentIds(product).includes(departmentId);}

function defaultProductMenuSettings(){
  return Object.fromEntries(allDepartments().map(department=>{
    const views=department.id==='bar'?['products','import-backlog','drinks','core-drinks','non-core-drinks','archived']:['products','import-backlog','archived'];
    return[department.id,views.map(view=>({view,label:department.id==='bar'?PRODUCT_MENU_DEFINITIONS[view].label:`${department.name} ${view==='products'?'Products':view==='import-backlog'?'Import Backlog':'Archived'}`,visible:true}))];
  }));
}

function ensureProductMenuSettings(){
  const defaults=defaultProductMenuSettings();
  let changed=false;
  if(!state.productMenus||typeof state.productMenus!=='object'){state.productMenus=defaults;return true;}
  allDepartments().forEach(({id:department})=>{
    const allowed=defaults[department].map(item=>item.view);
    const existing=Array.isArray(state.productMenus[department])?state.productMenus[department]:[];
    const seen=new Set();
    const normalized=[];
    existing.forEach(item=>{
      if(!item||!allowed.includes(item.view)||seen.has(item.view)){changed=true;return;}
      seen.add(item.view);
      const fallback=defaults[department].find(entry=>entry.view===item.view);
      normalized.push({view:item.view,label:String(item.label||fallback.label).trim()||fallback.label,visible:item.visible!==false});
    });
    defaults[department].forEach(item=>{if(!seen.has(item.view)){normalized.push({...item});changed=true;}});
    if(JSON.stringify(existing)!==JSON.stringify(normalized))changed=true;
    state.productMenus[department]=normalized;
  });
  return changed;
}

function productMenuEntries(department=productDepartmentView,visibleOnly=false){
  ensureProductMenuSettings();
  const entries=state.productMenus[department]||[];
  return visibleOnly?entries.filter(item=>item.visible):entries;
}

function backlogDepartment(item){
  return item?.category==='Food'&&getDepartment('kitchen')?'kitchen':'bar';
}

function ensureCurrentDepartmentView(){
  const departments=activeDepartments();
  if(!departments.length){state.departments.push({id:`department-${uid()}`,name:'General',archived:false});ensureProductMenuSettings();}
  if(!getDepartment(productDepartmentView)||getDepartment(productDepartmentView).archived)productDepartmentView=activeDepartments()[0]?.id||'bar';
  return getDepartment(productDepartmentView);
}

function renderProductDepartmentTabs(){
  const tabs=document.getElementById('product-department-tabs');
  if(!tabs)return;
  ensureCurrentDepartmentView();
  tabs.innerHTML=activeDepartments().map(department=>`<button type="button" class="${department.id===productDepartmentView?'active':''}" data-product-department="${department.id}" onclick="setProductDepartmentView('${department.id}')">${escapeHtml(department.name)}</button>`).join('');
}

function renderProductCatalogMenu(){
  const sidebar=document.getElementById('product-catalog-sidebar');
  if(!sidebar)return;
  let entries=productMenuEntries(productDepartmentView,true);
  if(!entries.length){
    state.productMenus[productDepartmentView].find(item=>item.view==='products').visible=true;
    entries=productMenuEntries(productDepartmentView,true);
  }
  if(!entries.some(item=>item.view===productCatalogView))productCatalogView=entries[0]?.view||'products';
  sidebar.innerHTML=entries.map(item=>`<button class="catalog-nav ${item.view===productCatalogView?'active':''}" data-catalog-view="${item.view}" onclick="setProductCatalogView('${item.view}')"><span>${escapeHtml(item.label)}</span><strong id="catalog-count-${item.view}">0</strong></button>`).join('');
}

function productColumnLabel(column){
  if(productDepartmentView!=='bar'&&column.key==='unit')return'Unit';
  if(productDepartmentView!=='bar'&&column.key==='cost')return'Unit Cost';
  return column.label;
}

function setProductDepartmentView(department){
  if(!getDepartment(department)||getDepartment(department).archived)return;
  productDepartmentView=department;
  productCatalogView='products';
  selectedProds.clear();
  const categoryFilter=document.getElementById('prod-cat-f');
  if(categoryFilter)categoryFilter.value='';
  const subcategoryFilter=document.getElementById('prod-sub-f');
  if(subcategoryFilter)subcategoryFilter.innerHTML='<option value="">All</option>';
  renderProductDepartmentTabs();
  const title=departmentName(productDepartmentView);
  const addButton=document.getElementById('add-product-button');
  if(addButton)addButton.textContent=`＋ Add ${title} Product`;
  const help=document.getElementById('product-department-help');
  if(help)help.textContent=`Items assigned to ${title}. Shared items may also appear in other departments.`;
  buildColPicker('prod-col-checks',PROD_COLS,'renderProducts');
  document.getElementById('prod-sel-bar')?.classList.remove('show');
  renderProducts();
}

function setProductCatalogView(view){
  productCatalogView=view;
  selectedProds.clear();
  document.querySelectorAll('.catalog-nav').forEach(btn=>btn.classList.toggle('active',btn.dataset.catalogView===view));
  document.getElementById('prod-sel-bar')?.classList.remove('show');
  renderProducts();
}

function updateCatalogCounts(){
  const drinks=state.drinks||[];
  const departmentProducts=(state.products||[]).filter(product=>productInDepartment(product,productDepartmentView));
  const counts={
    products:departmentProducts.filter(p=>!p.archived).length,
    'import-backlog':(state.importBacklog||[]).filter(item=>backlogDepartment(item)===productDepartmentView).length,
    drinks:drinks.filter(d=>!d.archived).length,
    'core-drinks':drinks.filter(d=>d.type==='core'&&!d.archived).length,
    'non-core-drinks':drinks.filter(d=>d.type==='non-core'&&!d.archived).length,
    archived:departmentProducts.filter(p=>p.archived).length+(productDepartmentView==='bar'?drinks.filter(d=>d.archived).length:0)
  };
  Object.entries(counts).forEach(([key,value])=>{
    const el=document.getElementById(`catalog-count-${key}`);
    if(el)el.textContent=value;
  });
}

function prodHeaderCheck(cb){
  const ids=[...document.querySelectorAll('#prod-tbody tr[data-id]')].map(r=>r.dataset.id);
  ids.forEach(id=>{if(cb.checked)selectedProds.add(id);else selectedProds.delete(id);});
  document.querySelectorAll('#prod-tbody input[type=checkbox]').forEach(box=>{box.checked=cb.checked;});
  updateProdSelBar();
}
function prodRowCheck(id,cb){
  if(cb.checked)selectedProds.add(id);else selectedProds.delete(id);
  syncHeaderCb();updateProdSelBar();
}
function syncHeaderCb(){
  const allIds=[...document.querySelectorAll('#prod-tbody tr[data-id]')].map(r=>r.dataset.id);
  const hcb=document.querySelector('#prod-thead input[type=checkbox]');
  if(!hcb||!allIds.length)return;
  const allC=allIds.every(id=>selectedProds.has(id));
  const anyC=allIds.some(id=>selectedProds.has(id));
  hcb.checked=allC;hcb.indeterminate=anyC&&!allC;
}
function updateProdSelBar(){
  const n=selectedProds.size;
  document.getElementById('prod-sel-bar').classList.toggle('show',n>0);
  document.getElementById('prod-sel-count').textContent=`${n} selected`;
}
function prodSelectVisible(){document.querySelectorAll('#prod-tbody tr[data-id]').forEach(r=>{selectedProds.add(r.dataset.id);const cb=r.querySelector('input[type=checkbox]');if(cb)cb.checked=true;});syncHeaderCb();updateProdSelBar();}
function prodClearSel(){selectedProds.clear();document.querySelectorAll('#prod-tbody input[type=checkbox]').forEach(c=>c.checked=false);syncHeaderCb();updateProdSelBar();}
function prodDeleteSelected(){
  const n=selectedProds.size;if(!n)return;
  if(!confirm(`Delete ${n} product${n>1?'s':''}? Cannot be undone.`))return;
  state.products=state.products.filter(p=>!selectedProds.has(p.id));
  state.suppliers.forEach(s=>{if(Array.isArray(s.products))s.products=s.products.filter(pid=>!selectedProds.has(pid));});
  selectedProds.clear();save();renderProducts();updateProdSelBar();
  toast(`${n} product${n>1?'s':''} deleted.`);
}
function openProductModal(id=null){
  editingProductId=id;
  closeAllMenus();
  document.getElementById('modal-product-view')?.classList.remove('open');
  const existing=id?getProduct(id):null;
  const existingDepartments=existing?productDepartmentIds(existing):[];
  const department=existingDepartments.includes(productDepartmentView)?productDepartmentView:(existingDepartments[0]||productDepartmentView);
  configureProductModalForDepartment(department,!!id);
  buildProductDepartmentOptions(existingDepartments.length?existingDepartments:[productDepartmentView]);
  updateSubcatOptions('pm-sub','pm-cat');
  if(id){
    const p=getProduct(id);
    document.getElementById('pm-name').value=p.name;document.getElementById('pm-inventory-name').value=p.inventoryName||'';document.getElementById('pm-aliases').value=p.aliases||'';
    document.getElementById('pm-cat').value=p.category;updateSubcatOptions('pm-sub','pm-cat');
    document.getElementById('pm-sub').value=p.subcategory||'';
    document.getElementById('pm-cost').value=p.cost;document.getElementById('pm-par').value=p.par||'';
    document.getElementById('pm-last-count').value=p.lastCount??'';
    document.getElementById('pm-sku').value=p.sku||'';document.getElementById('pm-notes').value=p.notes||'';
    buildProductUnitRows(normalizeProductUnits(p));
    selectProductUnitByValues(p.unit,p.sku,p.cost,p.par);
    previewAliases();
  }else{
    ['pm-name','pm-inventory-name','pm-aliases','pm-cost','pm-par','pm-last-count','pm-sku','pm-notes'].forEach(i=>document.getElementById(i).value='');
    document.getElementById('pm-aliases-preview').innerHTML='';
    document.getElementById('pm-cat').value=department==='bar'?'Spirits':department==='kitchen'?'Food':'Supplies';updateSubcatOptions('pm-sub','pm-cat');
    buildProductUnitRows([{unit:'',unitSize:'',sku:'',cost:0,par:0}]);
    rebuildProductUnitSelect();
  }
  document.getElementById('pm-sup-search').value='';
  buildProdSuppliers(id?(getProduct(id).suppliers||[]):[]);
  openModal('modal-product');
}

function configureProductModalForDepartment(department,isEditing=false){
  const isBar=department==='bar';
  document.getElementById('prod-modal-title').textContent=`${isEditing?'Edit':'Add'} ${departmentName(department)} Product`;
  document.getElementById('pm-department-context').textContent='This item is saved once in the master catalog. Select every department that uses it.';
  document.getElementById('pm-unit-label').textContent=isBar?'Packaging':'Unit';
  document.getElementById('pm-cost-label').textContent=isBar?'Packaging Cost ($)':'Unit Cost ($)';
  document.getElementById('pm-unit-editor-button').textContent=isBar?'Edit Packaging':'Edit Units';
  document.getElementById('pm-unit-editor-title').textContent=isBar?'Edit Packaging':'Edit Units';
  document.getElementById('pm-unit-editor-help').textContent=isBar?'Define all packaging sizes, SKU/code, cost, and par levels for this product. Select one default package.':'Define all unit sizes, SKU/code, cost, and par levels for this product. Select one default unit.';
  document.getElementById('pm-unit-editor-unit-label').textContent=isBar?'Packaging':'Unit';
  document.getElementById('pm-unit-editor-size-label').textContent=isBar?'Package Size':'Unit Size';
  document.getElementById('pm-unit-editor-cost-label').textContent=isBar?'Packaging Cost':'Cost';
  document.getElementById('pm-add-unit-button').textContent=isBar?'＋ Add Packaging':'＋ Add Unit';
}
function buildProductDepartmentOptions(selected=[]){
  const list=document.getElementById('pm-department-list');
  if(!list)return;
  const selectedIds=new Set(selected);
  list.innerHTML=activeDepartments().map(department=>`<label class="product-department-option"><input type="checkbox" value="${escapeHtml(department.id)}" ${selectedIds.has(department.id)?'checked':''}><span>${escapeHtml(department.name)}</span></label>`).join('');
}
function getSelectedProductDepartments(){return[...document.querySelectorAll('#pm-department-list input[type="checkbox"]:checked')].map(input=>input.value);}
function buildProductUnitRows(units){
  const el=document.getElementById('pm-unit-rows');
  el.innerHTML='';
  (units&&units.length?units:[{unit:'',unitSize:'',sku:'',cost:0,par:0}]).forEach(unit=>addProductUnitRow(unit));
  rebuildProductUnitSelect();
}
function addProductUnitRow(unit={}){
  const el=document.getElementById('pm-unit-rows');
  const row=document.createElement('div');
  row.className='product-unit-row';
  const isDefault=document.querySelectorAll('#pm-unit-rows .product-unit-row').length===0;
  row.innerHTML=`
    <input type="radio" name="pm-default-unit" data-role="defaultUnit" ${isDefault?'checked':''} title="Default unit">
    <input type="text" data-field="unit" placeholder="bottle" value="${unit.unit||''}" oninput="rebuildProductUnitSelect()">
    <input type="text" data-field="unitSize" placeholder="750 ml" value="${unit.unitSize||''}" oninput="rebuildProductUnitSelect()">
    <input type="text" data-field="sku" placeholder="SKU / code" value="${unit.sku||''}" oninput="rebuildProductUnitSelect()">
    <input type="number" min="0" step="0.01" data-field="cost" placeholder="0.00" value="${unit.cost||''}" oninput="rebuildProductUnitSelect()">
    <input type="number" min="0" step="1" data-field="par" placeholder="0" value="${unit.par||''}" oninput="rebuildProductUnitSelect()">
    <button class="btn btn-ghost-danger btn-sm" type="button" onclick="removeProductUnitRow(this)">✕</button>
  `;
  el.appendChild(row);
  rebuildProductUnitSelect();
}
function removeProductUnitRow(btn){
  const rows=document.querySelectorAll('#pm-unit-rows .product-unit-row');
  if(rows.length<=1){toast('Keep at least one unit option.',true);return;}
  const row=btn.closest('.product-unit-row');
  const wasDefault=row.querySelector('[data-role="defaultUnit"]')?.checked;
  btn.closest('.product-unit-row').remove();
  if(wasDefault){
    const first=document.querySelector('#pm-unit-rows .product-unit-row [data-role="defaultUnit"]');
    if(first)first.checked=true;
  }
  rebuildProductUnitSelect();
}
function getProductUnitRows(){
  return[...document.querySelectorAll('#pm-unit-rows .product-unit-row')].map(row=>{
    const unit={};
    row.querySelectorAll('[data-field]').forEach(input=>unit[input.dataset.field]=input.value.trim());
    unit.cost=parseFloat(unit.cost)||0;
    unit.par=parseFloat(unit.par)||0;
    return unit;
  }).filter(unit=>unit.unit||unit.unitSize||unit.sku||unit.cost);
}
function getDefaultProductUnitIndex(){
  const rows=[...document.querySelectorAll('#pm-unit-rows .product-unit-row')];
  const index=rows.findIndex(row=>row.querySelector('[data-role="defaultUnit"]')?.checked);
  return index>=0?index:0;
}
function setDefaultProductUnitIndex(index){
  const radios=[...document.querySelectorAll('#pm-unit-rows [data-role="defaultUnit"]')];
  if(radios.length)radios[Math.min(index,radios.length-1)].checked=true;
}
function orderUnitsByDefault(units,defaultIndex=getDefaultProductUnitIndex()){
  const primary=units[defaultIndex]||units[0];
  return{primary,orderedUnits:[primary,...units.filter((_,i)=>i!==defaultIndex)]};
}
function productUnitLabel(unit){
  const parts=[unit.unit,unit.unitSize].filter(Boolean).join(' - ');
  return parts||'Unnamed unit';
}
function rebuildProductUnitSelect(){
  const select=document.getElementById('pm-unit');
  if(!select)return;
  const current=select.value;
  const units=getProductUnitRows();
  select.innerHTML=units.map((unit,index)=>`<option value="${index}">${productUnitLabel(unit)}</option>`).join('');
  if(units.length){
    select.value=units[current]?current:'0';
    onProductUnitSelected(false);
  }
}
function selectProductUnitByValues(unit,sku,cost,par){
  const units=getProductUnitRows();
  const idx=units.findIndex(u=>(u.unit===unit&&(!sku||u.sku===sku))||(u.unit===unit&&parseFloat(u.cost)===parseFloat(cost)));
  document.getElementById('pm-unit').value=idx>=0?String(idx):'0';
  setDefaultProductUnitIndex(idx>=0?idx:0);
  onProductUnitSelected(false);
}
function onProductUnitSelected(syncRows=true){
  const units=getProductUnitRows();
  const selectedIndex=parseInt(document.getElementById('pm-unit').value,10)||0;
  const selected=units[selectedIndex]||units[0];
  if(!selected)return;
  setDefaultProductUnitIndex(selectedIndex);
  document.getElementById('pm-cost').value=selected.cost||'';
  document.getElementById('pm-sku').value=selected.sku||'';
  document.getElementById('pm-par').value=selected.par||'';
  if(syncRows)toast('Unit details loaded.');
}
function syncSelectedProductUnitField(field,value){
  const rows=[...document.querySelectorAll('#pm-unit-rows .product-unit-row')];
  const selectedIndex=parseInt(document.getElementById('pm-unit').value,10)||0;
  const input=rows[selectedIndex]?.querySelector(`[data-field="${field}"]`);
  if(input)input.value=value;
  rebuildProductUnitSelect();
  document.getElementById('pm-unit').value=String(Math.min(selectedIndex,rows.length-1));
}
function cloneProductUnitRows(units){
  return units.map(unit=>({unit:unit.unit||'',unitSize:unit.unitSize||'',sku:unit.sku||'',cost:parseFloat(unit.cost)||0,par:parseFloat(unit.par)||0}));
}
function openProductUnitEditor(){
  productUnitEditorSnapshot={units:cloneProductUnitRows(getProductUnitRows()),defaultIndex:getDefaultProductUnitIndex(),selectedIndex:parseInt(document.getElementById('pm-unit').value,10)||0};
  productUnitEditorSaving=false;
  openModal('modal-product-units');
}
function restoreProductUnitEditorSnapshot(){
  if(!productUnitEditorSnapshot)return;
  buildProductUnitRows(cloneProductUnitRows(productUnitEditorSnapshot.units));
  setDefaultProductUnitIndex(productUnitEditorSnapshot.defaultIndex);
  rebuildProductUnitSelect();
  document.getElementById('pm-unit').value=String(productUnitEditorSnapshot.selectedIndex);
  onProductUnitSelected(false);
  productUnitEditorSnapshot=null;
}
function cancelProductUnitEditor(){
  restoreProductUnitEditorSnapshot();
  productUnitEditorSaving=true;
  closeModal('modal-product-units');
  productUnitEditorSaving=false;
}
function beforeModalClose(id){
  if(id==='modal-product-units'&&!productUnitEditorSaving){
    restoreProductUnitEditorSnapshot();
  }
  return true;
}
function saveProductUnitEditor(){
  const units=getProductUnitRows();
  if(!units.length){toast('Add at least one unit.',true);return;}
  const {primary,orderedUnits}=orderUnitsByDefault(units);
  buildProductUnitRows(orderedUnits);
  setDefaultProductUnitIndex(0);
  rebuildProductUnitSelect();
  document.getElementById('pm-unit').value='0';
  onProductUnitSelected(false);
  productUnitEditorSnapshot=null;
  productUnitEditorSaving=true;
  closeModal('modal-product-units');
  productUnitEditorSaving=false;
  toast('Units saved.');
}
// Render the supplier checkboxes inside the product modal.
function buildProdSuppliers(selected){
  const el=document.getElementById('pm-sup-list');
  const sups=sortArr(state.suppliers,'name','asc');
  if(!sups.length){el.innerHTML='<p style="color:var(--text-muted);font-size:0.82rem;">No suppliers yet — add them on the Suppliers page, then link them here.</p>';return;}
  el.innerHTML=sups.map(s=>`<label data-supplier-search="${escapeHtml([s.name,s.contact,s.email,s.phone].filter(Boolean).join(' ').toLowerCase())}" style="display:flex;align-items:center;gap:8px;padding:3px 0;font-size:0.83rem;cursor:pointer;"><input type="checkbox" value="${s.id}" ${selected.includes(s.id)?'checked':''} style="accent-color:var(--accent);width:14px;height:14px;"> ${escapeHtml(s.name)}</label>`).join('');
}
function filterProductSuppliers(){
  const query=(document.getElementById('pm-sup-search')?.value||'').trim().toLowerCase();
  document.querySelectorAll('#pm-sup-list [data-supplier-search]').forEach(row=>{row.hidden=!!query&&!row.dataset.supplierSearch.includes(query);});
}
function getProdSuppliers(){return[...document.querySelectorAll('#pm-sup-list input[type=checkbox]:checked')].map(c=>c.value);}
// Keep the reverse links (supplier.products) consistent with a product's suppliers.
function syncProductSupplierLinks(prod){
  state.suppliers.forEach(s=>{
    if(!Array.isArray(s.products))s.products=[];
    const linked=(prod.suppliers||[]).includes(s.id);
    const idx=s.products.indexOf(prod.id);
    if(linked&&idx===-1)s.products.push(prod.id);
    else if(!linked&&idx!==-1)s.products.splice(idx,1);
  });
}
function saveProduct(){
  const name=document.getElementById('pm-name').value.trim();
  if(!name){toast('Name required.',true);return;}
  let units=getProductUnitRows();
  if(!units.length){toast('Add at least one unit option.',true);return;}
  const departments=getSelectedProductDepartments();
  if(!departments.length){toast('Select at least one department.',true);return;}
  units=units.map((u,i)=>({unit:u.unit||'unit',unitSize:u.unitSize||'',sku:u.sku||(i===0?document.getElementById('pm-sku').value.trim():''),cost:parseFloat(u.cost)||0,par:parseFloat(u.par)||0}));
  const {primary,orderedUnits}=orderUnitsByDefault(units);
  const existing=editingProductId?getProduct(editingProductId):null;
  const lastCountValue=document.getElementById('pm-last-count').value;
  const prod={id:editingProductId||uid(),name,inventoryName:document.getElementById('pm-inventory-name').value.trim(),aliases:document.getElementById('pm-aliases').value.trim(),departments,unit:primary.unit,category:document.getElementById('pm-cat').value,subcategory:document.getElementById('pm-sub').value,cost:primary.cost||parseFloat(document.getElementById('pm-cost').value)||0,par:parseFloat(primary.par)||parseFloat(document.getElementById('pm-par').value)||0,sku:primary.sku||document.getElementById('pm-sku').value.trim(),notes:document.getElementById('pm-notes').value.trim(),suppliers:getProdSuppliers(),units:orderedUnits,lastCount:lastCountValue===''?null:parseFloat(lastCountValue)||0,archived:existing?.archived||false};
  if(editingProductId){const i=state.products.findIndex(p=>p.id===editingProductId);state.products[i]=prod;}else state.products.push(prod);
  syncProductSupplierLinks(prod);
  save();closeModal('modal-product');renderProducts();toast(editingProductId?'Updated.':'Added.');
}
function deleteProduct(id){closeAllMenus();if(!confirm('Delete this product?'))return;state.products=state.products.filter(p=>p.id!==id);state.suppliers.forEach(s=>{if(Array.isArray(s.products))s.products=s.products.filter(pid=>pid!==id);});save();closeModal('modal-product-view');renderProducts();toast('Deleted.');}
function archiveProduct(id,archived=true){closeAllMenus();const p=getProduct(id);if(!p)return;p.archived=archived;save();closeModal('modal-product-view');renderProducts();toast(archived?'Archived.':'Restored.');}
function onInlineEdit(pid,field,val){if(!pendingEdits[pid])pendingEdits[pid]={};pendingEdits[pid][field]=val;}
function saveAllInlineEdits(){let n=0;Object.entries(pendingEdits).forEach(([pid,ch])=>{const i=state.products.findIndex(p=>p.id===pid);if(i===-1)return;if(ch.par!==undefined)state.products[i].par=parseFloat(ch.par)||0;if(ch.lastCount!==undefined)state.products[i].lastCount=ch.lastCount===''?null:parseFloat(ch.lastCount);n++;});pendingEdits={};save();renderProducts();toast(`${n} product(s) saved.`);}

function productSuppliersHtml(product){
  const tags=(product.suppliers||[]).map(sid=>{
    const s=state.suppliers.find(x=>x.id===sid);
    return s?`<button class="supplier-link-chip" onclick="event.stopPropagation();openSupplierView('${s.id}','${product.id}')" title="View supplier products">${escapeHtml(s.name)}</button>`:null;
  }).filter(Boolean).join('');
  return tags||'<span style="color:var(--text-muted);font-size:0.78rem;">—</span>';
}
function openProductQuickAction(action,id){
  closeModal('modal-product-view');
  if(action==='count'){
    showPage('inventory');
    openInventoryModal();
  }else if(action==='usage'){
    showPage('usage');
    toast('Upload or edit a usage log, then add this product there.');
  }else if(action==='order'){
    showPage('orders');
    openOrderModal();
  }
}
function productMenuHtml(product,menuId){
  const archiveLabel=product.archived?'Restore':'Archive';
  const archiveAction=product.archived?`archiveProduct('${product.id}',false)`:`archiveProduct('${product.id}',true)`;
  return`<div class="drop-wrap product-actions">
    <button class="btn btn-secondary btn-sm icon-btn" onclick="event.stopPropagation();toggleMenu('${menuId}')" title="Product actions">...</button>
    <div class="drop-menu" id="${menuId}">
      <button onclick="event.stopPropagation();closeAllMenus();openProductModal('${product.id}')">Edit</button>
      <button onclick="event.stopPropagation();${archiveAction}">${archiveLabel}</button>
      <div class="drop-divider"></div>
      <button onclick="event.stopPropagation();deleteProduct('${product.id}')">Delete</button>
    </div>
  </div>`;
}
function openProductView(id){
  const p=getProduct(id);
  if(!p)return;
  closeAllMenus();
  const lastInv=state.inventories[0];
  const lastCount=p.lastCount??(lastInv?lastInv.items[p.id]??null:null);
  const low=p.par>0&&lastCount!==null&&lastCount!==undefined&&lastCount<=p.par;
  const units=normalizeProductUnits(p);
  const isBar=productDepartmentView==='bar'&&productInDepartment(p,'bar');
  const departmentBadges=productDepartmentIds(p).map(id=>`<span class="sub-badge">${escapeHtml(departmentName(id))}</span>`).join(' ');
  const body=document.getElementById('product-view-body');
  body.innerHTML=`
    <div class="product-view-head">
      <div>
        <h3>${p.name}${p.archived?' <span class="sub-badge">Archived</span>':''}</h3>
        <div class="product-view-meta">${departmentBadges} ${catBadge(p.category)} ${subBadge(p.subcategory)} ${low?'<span class="missing-pill"><span class="missing-dot"></span>At / below par</span>':''}</div>
      </div>
    </div>
    <div class="product-detail-grid">
      <div class="product-detail-field"><div class="label">Inventory Name</div><div class="value">${escapeHtml(p.inventoryName||p.name||'—')}</div></div>
      <div class="product-detail-field"><div class="label">${isBar?'Packaging':'Unit'}</div><div class="value">${escapeHtml(p.unit||'—')}</div></div>
      <div class="product-detail-field"><div class="label">${isBar?'Packaging Cost':'Unit Cost'}</div><div class="value">${p.cost>0?fmt(p.cost):'—'}</div></div>
      <div class="product-detail-field"><div class="label">Par</div><div class="value">${p.par||'—'}</div></div>
      <div class="product-detail-field"><div class="label">Last Count</div><div class="value">${lastCount!==null&&lastCount!==undefined?lastCount:'—'}</div></div>
      <div class="product-detail-field"><div class="label">SKU / Code</div><div class="value">${p.sku||'—'}</div></div>
      <div class="product-detail-field"><div class="label">Suppliers</div><div class="value">${productSuppliersHtml(p)}</div></div>
    </div>
    <div class="product-view-section"><div class="label">Alternate / Voice Names</div>${aliasBadges(p.aliases)||'<span style="color:var(--text-muted);font-size:0.84rem;">—</span>'}</div>
    <div class="product-view-section"><div class="label">Notes</div><p>${p.notes||'—'}</p></div>
    <div class="product-view-section"><div class="label">${isBar?'Packaging Options':'Units'}</div>
      <div class="table-wrap"><table><thead><tr><th>Default</th><th>${isBar?'Packaging':'Unit'}</th><th>${isBar?'Package Size':'Size'}</th><th>SKU</th><th>${isBar?'Packaging Cost':'Cost'}</th><th>Par</th></tr></thead><tbody>
        ${units.map((unit,index)=>`<tr><td>${index===0?'Yes':'—'}</td><td>${unit.unit||'—'}</td><td>${unit.unitSize||'—'}</td><td>${unit.sku||'—'}</td><td>${unit.cost?fmt(unit.cost):'—'}</td><td>${unit.par||'—'}</td></tr>`).join('')}
      </tbody></table></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="openProductModal('${p.id}')">Edit</button>
      <button class="btn btn-secondary" onclick="openProductQuickAction('count','${p.id}')">Add Count</button>
      <button class="btn btn-secondary" onclick="openProductQuickAction('usage','${p.id}')">Add Usage</button>
      <button class="btn btn-secondary" onclick="openProductQuickAction('order','${p.id}')">Add Order</button>
      <button class="btn btn-secondary" onclick="archiveProduct('${p.id}',${p.archived?'false':'true'})">${p.archived?'Restore':'Archive'}</button>
      <button class="btn btn-ghost-danger" onclick="deleteProduct('${p.id}')">Delete</button>
    </div>`;
  openModal('modal-product-view');
}

function renderProducts(){
  ensureCurrentDepartmentView();
  renderProductDepartmentTabs();
  const title=departmentName(productDepartmentView);
  const addButton=document.getElementById('add-product-button');
  if(addButton)addButton.textContent=`＋ Add ${title} Product`;
  const help=document.getElementById('product-department-help');
  if(help)help.textContent=`Items assigned to ${title}. Shared items may also appear in other departments.`;
  renderProductCatalogMenu();
  updateCatalogCounts();
  document.querySelectorAll('.catalog-nav').forEach(btn=>btn.classList.toggle('active',btn.dataset.catalogView===productCatalogView));
  document.querySelectorAll('[data-product-department]').forEach(button=>button.classList.toggle('active',button.dataset.productDepartment===productDepartmentView));
  if(productCatalogView==='import-backlog')return renderImportBacklogCatalog();
  if(productCatalogView==='archived')return renderArchivedCatalog();
  if(productCatalogView!=='products')return renderDrinkCatalog();
  const search=document.getElementById('prod-search').value.toLowerCase();
  const cat=document.getElementById('prod-cat-f').value;
  const sub=document.getElementById('prod-sub-f').value;
  const status=document.getElementById('prod-status-f')?.value||'active';
  const lastInv=state.inventories[0];
  const{col,dir}=sortState.products;
  const visCols=PROD_COLS.filter(c=>c.visible);
  const thead=document.getElementById('prod-thead');
  thead.innerHTML='<tr>'+visCols.map(c=>{
    if(c.key==='sel')return`<th style="width:36px;padding:9px 8px;"><input type="checkbox" onchange="prodHeaderCheck(this)" style="accent-color:var(--accent);width:15px;height:15px;cursor:pointer;"></th>`;
    const label=productColumnLabel(c);
    if(!c.sort)return`<th>${label}</th>`;
    const s=sortState.products;const cls=s.col===c.sort?(s.dir==='asc'?'sort-asc':'sort-desc'):'';
    return`<th class="sortable ${cls}" onclick="sortTable('products','${c.sort}')">${label}</th>`;
  }).join('')+'</tr>';
  let list=state.products.filter(p=>{
    const supplierText=(p.suppliers||[]).map(sid=>state.suppliers.find(s=>s.id===sid)?.name||'').join(' ').toLowerCase();
    const ms=!search||p.name.toLowerCase().includes(search)||(p.inventoryName||'').toLowerCase().includes(search)||(p.aliases||'').toLowerCase().includes(search)||supplierText.includes(search);
    const st=status==='all'||(status==='archived'?!!p.archived:!p.archived);
    return productInDepartment(p,productDepartmentView)&&ms&&st&&(!cat||p.category===cat)&&(!sub||p.subcategory===sub);
  }).map(p=>({...p,lastCount:p.lastCount??(lastInv?lastInv.items[p.id]??null:null)}));
  list=sortArr(list,col,dir);
  const tbody=document.getElementById('prod-tbody');
  if(!list.length){tbody.innerHTML=`<tr><td colspan="${visCols.length}" style="text-align:center;color:var(--text-muted);padding:28px;">No products found.</td></tr>`;syncHeaderCb();return;}
  tbody.innerHTML=list.map(p=>{
    const low=p.par>0&&p.lastCount!==null&&p.lastCount<=p.par;
    const sel=selectedProds.has(p.id);
    const menuId=`prod-actions-${p.id}`;
    return`<tr data-id="${p.id}" class="product-row ${sel?'row-selected':''} ${p.archived?'archived-row':''}" onclick="openProductView('${p.id}')">${visCols.map(c=>{switch(c.key){
      case 'sel':return`<td style="text-align:center;padding:9px 8px;"><input type="checkbox" ${sel?'checked':''} onchange="event.stopPropagation();prodRowCheck('${p.id}',this)" onclick="event.stopPropagation()" style="accent-color:var(--accent);width:15px;height:15px;cursor:pointer;"></td>`;
      case 'name':return`<td><strong>${p.name}</strong>${p.archived?' <span class="sub-badge">Archived</span>':''}${low?` <span style="color:var(--warning);font-size:0.74rem;">⚠</span>`:''}${p.notes?`<div style="font-size:0.71rem;color:var(--text-muted);">${p.notes}</div>`:''}</td>`;
      case 'inventoryName':return`<td>${escapeHtml(p.inventoryName||p.name||'—')}</td>`;
      case 'aliases':return`<td>${aliasBadges(p.aliases)}</td>`;
      case 'category':return`<td>${catBadge(p.category)}</td>`;
      case 'subcategory':return`<td>${subBadge(p.subcategory)}</td>`;
      case 'unit':return`<td>${p.unit}</td>`;
      case 'cost':return`<td>${p.cost>0?fmt(p.cost):'—'}</td>`;
      case 'par':return`<td>${p.par||'—'}</td>`;
      case 'lastCount':return`<td>${p.lastCount!==null&&p.lastCount!==undefined?p.lastCount:'—'}</td>`;
      case 'sku':return`<td style="font-size:0.78rem;">${p.sku||'—'}</td>`;
      case 'notes':return`<td style="font-size:0.78rem;color:var(--text-muted);">${p.notes||'—'}</td>`;
      case 'suppliers':return`<td style="max-width:190px;">${productSuppliersHtml(p)}</td>`;
      case 'actions':return`<td onclick="event.stopPropagation()">${productMenuHtml(p,menuId)}</td>`;
      default:return`<td>—</td>`;
    }}).join('')}</tr>`;
  }).join('');
  syncHeaderCb();
}

function backlogSeenLabel(value){
  if(!value)return'—';
  const date=new Date(value);
  return isNaN(date.getTime())?'—':date.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
}

function addBacklogProduct(id){
  const item=(state.importBacklog||[]).find(entry=>entry.id===id);
  if(!item)return;
  const group={
    productId:null,productName:item.name,sourceNames:[item.name],units:item.units||[],newUnits:[],
    category:item.category||'Other',subcategory:item.subcategory||'Misc',section:item.sections?.[0]||'',selected:true
  };
  const product=createInventoryTemplateProduct(group,item.sourceFiles?.at(-1)||'Import Backlog');
  product.departments=[productDepartmentView];
  delete product.department;
  save();
  renderProducts();
  toast(`${product.name} added to Products.`);
}

function removeBacklogProduct(id){
  const item=(state.importBacklog||[]).find(entry=>entry.id===id);
  if(!item||!confirm(`Remove ${item.name} from the import backlog?`))return;
  state.importBacklog=state.importBacklog.filter(entry=>entry.id!==id);
  save();
  renderProducts();
  toast('Removed from import backlog.');
}

function renderImportBacklogCatalog(){
  const search=(document.getElementById('prod-search')?.value||'').trim().toLowerCase();
  const category=document.getElementById('prod-cat-f')?.value||'';
  const subcategory=document.getElementById('prod-sub-f')?.value||'';
  const thead=document.getElementById('prod-thead');
  const tbody=document.getElementById('prod-tbody');
  thead.innerHTML='<tr><th>Item</th><th>Category</th><th>Source Headers</th><th>Units</th><th>Last Seen</th><th>Actions</th></tr>';
  const items=(state.importBacklog||[])
    .filter(item=>backlogDepartment(item)===productDepartmentView&&(!search||item.name.toLowerCase().includes(search)||(item.units||[]).join(' ').toLowerCase().includes(search))&&(!category||item.category===category)&&(!subcategory||item.subcategory===subcategory))
    .sort((a,b)=>a.category.localeCompare(b.category)||a.subcategory.localeCompare(b.subcategory)||a.name.localeCompare(b.name));
  if(!items.length){
    tbody.innerHTML='<tr><td colspan="6" class="empty-cell">No saved unmatched products.</td></tr>';
    return;
  }
  const byCategory=new Map();
  items.forEach(item=>{
    const key=`${item.category} · ${item.subcategory}`;
    if(!byCategory.has(key))byCategory.set(key,[]);
    byCategory.get(key).push(item);
  });
  tbody.innerHTML=[...byCategory.entries()].map(([label,entries])=>`
    <tr class="backlog-category-row"><td colspan="6"><strong>${escapeHtml(label)}</strong><span>${entries.length}</span></td></tr>
    ${entries.map(item=>`<tr>
      <td><strong>${escapeHtml(item.name)}</strong><small class="backlog-source-count">Seen in ${item.seenCount||1} import${item.seenCount===1?'':'s'}</small></td>
      <td>${catBadge(item.category)} ${subBadge(item.subcategory)}</td>
      <td><div class="backlog-chip-list">${(item.sections||[]).map(section=>`<span>${escapeHtml(section)}</span>`).join('')||'—'}</div></td>
      <td><div class="backlog-chip-list">${(item.units||[]).map(unit=>`<span>${escapeHtml(unit)}</span>`).join('')||'—'}</div></td>
      <td>${backlogSeenLabel(item.lastSeenAt)}<small class="backlog-source-count">${escapeHtml(item.sourceFiles?.at(-1)||'')}</small></td>
      <td><div class="backlog-actions"><button class="btn btn-primary btn-sm" type="button" onclick="addBacklogProduct('${item.id}')">Add to Products</button><button class="btn btn-ghost-danger btn-sm" type="button" onclick="removeBacklogProduct('${item.id}')">Remove</button></div></td>
    </tr>`).join('')}
  `).join('');
}

function drinkTypePill(type){
  return`<span class="drink-type-pill ${type==='non-core'?'non-core':''}">${type==='non-core'?'Non-Core':'Core'}</span>`;
}

function ingredientProductMatch(name){
  const normalize=typeof normalizeSupplierQuery==='function'?normalizeSupplierQuery:(value=>String(value||'').toLowerCase().replace(/[^a-z0-9]/g,''));
  const key=normalize(name);
  if(!key)return null;
  return(state.products||[]).filter(product=>productInDepartment(product,'bar')).find(product=>{
    const productKey=normalize(product.name);
    const aliases=(product.aliases||'').split(',').map(alias=>normalize(alias)).filter(Boolean);
    return productKey&&(key.includes(productKey)||productKey.includes(key)||aliases.some(alias=>key.includes(alias)||alias.includes(key)));
  })||null;
}

function ingredientChip(name){
  const product=ingredientProductMatch(name);
  return product?productNameLink(product,name):`<span class="alias-chip">${escapeHtml(name)}</span>`;
}

function renderDrinkCatalog(){
  const search=document.getElementById('prod-search').value.toLowerCase();
  const status=document.getElementById('prod-status-f')?.value||'active';
  const tbody=document.getElementById('prod-tbody');
  const thead=document.getElementById('prod-thead');
  const drinks=(state.drinks||[]).filter(drink=>{
    const statusMatch=productCatalogView==='archived'?!!drink.archived:status==='all'||(status==='archived'?!!drink.archived:!drink.archived);
    const viewMatch=productCatalogView==='drinks'||productCatalogView==='archived'||(productCatalogView==='core-drinks'&&drink.type==='core')||(productCatalogView==='non-core-drinks'&&drink.type==='non-core');
    const text=[drink.name,drink.family,drink.glassware,drink.method,...(drink.ingredients||[])].join(' ').toLowerCase();
    return statusMatch&&viewMatch&&(!search||text.includes(search));
  }).sort((a,b)=>a.name.localeCompare(b.name));
  thead.innerHTML='<tr><th>Drink</th><th>Type</th><th>Family</th><th>Glassware</th><th>Method</th><th>Ingredients</th></tr>';
  if(!drinks.length){tbody.innerHTML='<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:28px;">No drinks found.</td></tr>';return;}
  tbody.innerHTML=drinks.map(drink=>`<tr class="product-row ${drink.archived?'archived-row':''}" onclick="openDrinkView('${drink.id}')">
    <td><strong>${escapeHtml(drink.name)}</strong>${drink.archived?' <span class="sub-badge">Archived</span>':''}</td>
    <td>${drinkTypePill(drink.type)}</td>
    <td>${escapeHtml(drink.family||'—')}</td>
    <td>${escapeHtml(drink.glassware||'—')}</td>
    <td>${escapeHtml(drink.method||'—')}</td>
    <td><div class="ingredient-list">${(drink.ingredients||[]).slice(0,4).map(item=>`<span class="sub-badge">${escapeHtml(item)}</span>`).join('')}${(drink.ingredients||[]).length>4?`<span class="sub-badge">+${drink.ingredients.length-4}</span>`:''}</div></td>
  </tr>`).join('');
  syncHeaderCb();
}

function renderArchivedCatalog(){
  const search=document.getElementById('prod-search').value.toLowerCase();
  const tbody=document.getElementById('prod-tbody');
  const thead=document.getElementById('prod-thead');
  const products=(state.products||[]).filter(item=>item.archived&&productInDepartment(item,productDepartmentView)).map(item=>({kind:'Product',name:item.name,type:item.category,detail:item.subcategory||item.unit||'',id:item.id}));
  const drinks=productDepartmentView==='bar'?(state.drinks||[]).filter(item=>item.archived).map(item=>({kind:'Drink',name:item.name,type:item.type==='non-core'?'Non-Core':'Core',detail:item.family||'',id:item.id})):[];
  const rows=[...products,...drinks].filter(item=>!search||[item.kind,item.name,item.type,item.detail].join(' ').toLowerCase().includes(search)).sort((a,b)=>a.name.localeCompare(b.name));
  thead.innerHTML='<tr><th>Name</th><th>Type</th><th>Group</th><th></th></tr>';
  if(!rows.length){tbody.innerHTML='<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:28px;">No archived items found.</td></tr>';return;}
  tbody.innerHTML=rows.map(item=>`<tr class="product-row archived-row" onclick="${item.kind==='Product'?`openProductView('${item.id}')`:`openDrinkView('${item.id}')`}">
    <td><strong>${escapeHtml(item.name)}</strong></td>
    <td>${escapeHtml(item.kind)}</td>
    <td>${escapeHtml(item.type)} ${item.detail?`<span class="sub-badge">${escapeHtml(item.detail)}</span>`:''}</td>
    <td><span class="sub-badge">Archived</span></td>
  </tr>`).join('');
}

function refreshProductCatalogIfVisible(){
  if(document.getElementById('page-products')?.classList.contains('active'))renderProducts();
}

function setSettingsProductMenuWorkspace(department){
  if(!getDepartment(department)||getDepartment(department).archived)return;
  settingsProductMenuWorkspace=department;
  renderProductMenuSettings();
}

function renderProductMenuSettings(){
  const list=document.getElementById('settings-product-menu-list');
  if(!list)return;
  ensureProductMenuSettings();
  if(!getDepartment(settingsProductMenuWorkspace)||getDepartment(settingsProductMenuWorkspace).archived)settingsProductMenuWorkspace=activeDepartments()[0]?.id||'bar';
  const workspaceTabs=document.getElementById('settings-product-menu-workspace');
  if(workspaceTabs)workspaceTabs.innerHTML=activeDepartments().map(department=>`<button type="button" class="${department.id===settingsProductMenuWorkspace?'active':''}" data-settings-product-workspace="${department.id}" onclick="setSettingsProductMenuWorkspace('${department.id}')">${escapeHtml(department.name)}</button>`).join('');
  const entries=productMenuEntries(settingsProductMenuWorkspace);
  list.innerHTML=entries.map((item,index)=>{
    const definition=PRODUCT_MENU_DEFINITIONS[item.view];
    return`<div class="product-menu-setting-row">
      <span class="product-menu-drag" aria-hidden="true">⋮⋮</span>
      <div class="product-menu-setting-copy"><input type="text" value="${escapeHtml(item.label)}" aria-label="Menu label" onchange="updateProductMenuLabel('${item.view}',this.value)"><small>${escapeHtml(definition.description)}</small></div>
      <label class="product-menu-visible"><input type="checkbox" ${item.visible?'checked':''} onchange="toggleProductMenuVisibility('${item.view}',this.checked,this)"><span>Show</span></label>
      <div class="product-menu-order-actions"><button class="btn btn-secondary btn-sm" type="button" title="Move up" ${index===0?'disabled':''} onclick="moveProductMenuItem('${item.view}',-1)">↑</button><button class="btn btn-secondary btn-sm" type="button" title="Move down" ${index===entries.length-1?'disabled':''} onclick="moveProductMenuItem('${item.view}',1)">↓</button></div>
    </div>`;
  }).join('');
  const drinkGroup=document.getElementById('settings-drink-classification-group');
  if(drinkGroup)drinkGroup.hidden=settingsProductMenuWorkspace!=='bar';
  if(settingsProductMenuWorkspace==='bar')renderDrinkClassificationSettings();
}

function updateProductMenuLabel(view,value){
  const item=productMenuEntries(settingsProductMenuWorkspace).find(entry=>entry.view===view);
  if(!item)return;
  item.label=String(value||'').trim()||PRODUCT_MENU_DEFINITIONS[view].label;
  save();
  renderProductMenuSettings();
  refreshProductCatalogIfVisible();
  toast('Product menu updated.');
}

function toggleProductMenuVisibility(view,visible,checkbox){
  const entries=productMenuEntries(settingsProductMenuWorkspace);
  const item=entries.find(entry=>entry.view===view);
  if(!item)return;
  if(!visible&&entries.filter(entry=>entry.visible).length<=1){
    if(checkbox)checkbox.checked=true;
    toast('Keep at least one menu item visible.',true);
    return;
  }
  item.visible=!!visible;
  save();
  renderProductMenuSettings();
  refreshProductCatalogIfVisible();
}

function moveProductMenuItem(view,direction){
  const entries=productMenuEntries(settingsProductMenuWorkspace);
  const index=entries.findIndex(entry=>entry.view===view);
  const target=index+direction;
  if(index<0||target<0||target>=entries.length)return;
  [entries[index],entries[target]]=[entries[target],entries[index]];
  save();
  renderProductMenuSettings();
  refreshProductCatalogIfVisible();
}

function resetProductMenuSettings(){
  const defaults=defaultProductMenuSettings();
  state.productMenus[settingsProductMenuWorkspace]=defaults[settingsProductMenuWorkspace];
  save();
  renderProductMenuSettings();
  refreshProductCatalogIfVisible();
  toast(`${departmentName(settingsProductMenuWorkspace)} product menu restored.`);
}

function renderDepartmentSettings(){
  const list=document.getElementById('settings-department-list');
  if(!list)return;
  ensureDepartments();
  list.innerHTML=allDepartments().map((department,index)=>{
    const productCount=(state.products||[]).filter(product=>productInDepartment(product,department.id)).length;
    return`<div class="department-setting-row ${department.archived?'is-archived':''}">
      <div class="department-setting-copy"><input type="text" value="${escapeHtml(department.name)}" aria-label="Department name" onchange="renameDepartment('${department.id}',this.value)"><small>${productCount} item${productCount===1?'':'s'} · ${department.archived?'Hidden from Products':'Visible in Products'}</small></div>
      <div class="department-setting-actions"><button class="btn btn-secondary btn-sm" type="button" title="Move up" ${index===0?'disabled':''} onclick="moveDepartment('${department.id}',-1)">↑</button><button class="btn btn-secondary btn-sm" type="button" title="Move down" ${index===state.departments.length-1?'disabled':''} onclick="moveDepartment('${department.id}',1)">↓</button><button class="btn btn-secondary btn-sm" type="button" onclick="toggleDepartmentArchived('${department.id}',${department.archived?'false':'true'})">${department.archived?'Restore':'Archive'}</button></div>
    </div>`;
  }).join('');
}

function addDepartment(){
  const input=document.getElementById('settings-department-name');
  const name=String(input?.value||'').trim();
  if(!name){toast('Enter a department name.',true);return;}
  if(allDepartments().some(department=>department.name.toLowerCase()===name.toLowerCase())){toast('That department already exists.',true);return;}
  const id=`department-${uid()}`;
  state.departments.push({id,name,archived:false});
  ensureProductMenuSettings();
  if(input)input.value='';
  save();renderDepartmentSettings();renderProductMenuSettings();renderProductDepartmentTabs();refreshProductCatalogIfVisible();
  toast(`${name} department added.`);
}

function renameDepartment(id,value){
  const department=getDepartment(id);
  const name=String(value||'').trim();
  if(!department)return;
  if(!name||allDepartments().some(item=>item.id!==id&&item.name.toLowerCase()===name.toLowerCase())){toast('Use a unique department name.',true);renderDepartmentSettings();return;}
  department.name=name;
  save();renderDepartmentSettings();renderProductMenuSettings();renderProductDepartmentTabs();refreshProductCatalogIfVisible();
  toast('Department renamed.');
}

function toggleDepartmentArchived(id,archived){
  const department=getDepartment(id);
  if(!department)return;
  if(archived&&activeDepartments().length<=1){toast('Keep at least one department active.',true);return;}
  department.archived=!!archived;
  ensureCurrentDepartmentView();
  if(!getDepartment(settingsProductMenuWorkspace)||getDepartment(settingsProductMenuWorkspace).archived)settingsProductMenuWorkspace=activeDepartments()[0]?.id||'bar';
  save();renderDepartmentSettings();renderProductMenuSettings();renderProductDepartmentTabs();refreshProductCatalogIfVisible();
  toast(`${department.name} ${department.archived?'archived':'restored'}.`);
}

function moveDepartment(id,direction){
  const index=state.departments.findIndex(department=>department.id===id);
  const target=index+direction;
  if(index<0||target<0||target>=state.departments.length)return;
  [state.departments[index],state.departments[target]]=[state.departments[target],state.departments[index]];
  save();renderDepartmentSettings();renderProductMenuSettings();renderProductDepartmentTabs();
}

function renderDrinkClassificationSettings(){
  const list=document.getElementById('settings-drink-classification-list');
  if(!list)return;
  const query=(document.getElementById('settings-drink-search')?.value||'').trim().toLowerCase();
  const drinks=(state.drinks||[]).filter(drink=>!drink.archived&&(!query||[drink.name,drink.family,drink.type].join(' ').toLowerCase().includes(query))).sort((a,b)=>a.name.localeCompare(b.name));
  list.innerHTML=drinks.map(drink=>`<div class="drink-classification-row"><span><strong>${escapeHtml(drink.name)}</strong><small>${escapeHtml(drink.family||'No family')}</small></span><select aria-label="Classification for ${escapeHtml(drink.name)}" onchange="setDrinkClassification('${drink.id}',this.value)"><option value="core" ${drink.type==='core'?'selected':''}>Core</option><option value="non-core" ${drink.type==='non-core'?'selected':''}>Non-Core</option></select></div>`).join('')||'<div class="empty-cell">No drinks found.</div>';
}

function setDrinkClassification(id,type){
  const drink=(state.drinks||[]).find(item=>item.id===id);
  if(!drink||!['core','non-core'].includes(type))return;
  drink.type=type;
  save();
  updateCatalogCounts();
  refreshProductCatalogIfVisible();
  toast(`${drink.name} is now ${type==='core'?'Core':'Non-Core'}.`);
}

function openDrinkView(id){
  const drink=(state.drinks||[]).find(item=>item.id===id);
  if(!drink)return;
  const linked=(drink.linkedProducts||[]).map(pid=>getProduct(pid)).filter(Boolean);
  document.getElementById('product-view-body').innerHTML=`
    <div class="product-view-head">
      <div>
        <h3>${escapeHtml(drink.name)}${drink.archived?' <span class="sub-badge">Archived</span>':''}</h3>
        <div class="product-view-meta">${drinkTypePill(drink.type)} <span class="sub-badge">${escapeHtml(drink.family||'Classics')}</span></div>
      </div>
    </div>
    <div class="product-detail-grid">
      <div class="product-detail-field"><div class="label">Glassware</div><div class="value">${escapeHtml(drink.glassware||'—')}</div></div>
      <div class="product-detail-field"><div class="label">Method</div><div class="value">${escapeHtml(drink.method||'—')}</div></div>
      <div class="product-detail-field"><div class="label">Importance</div><div class="value">${drink.type==='core'?'Core Drink':'Non-Core Drink'}</div></div>
      <div class="product-detail-field"><div class="label">Linked Products</div><div class="value">${linked.length||'—'}</div></div>
    </div>
    <div class="product-view-section"><div class="label">Ingredients</div><div class="ingredient-list">${(drink.ingredients||[]).map(ingredientChip).join('')||'<span style="color:var(--text-muted);font-size:0.84rem;">—</span>'}</div></div>
    <div class="product-view-section"><div class="label">Inventory Links</div>${linked.length?linked.map(product=>productNameLink(product)).join(' '):'<p>Matched ingredient names are clickable now; saved recipe links will be connected in the next phase.</p>'}</div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="closeModal('modal-product-view')">Close</button>
    </div>`;
  openModal('modal-product-view');
}
