// products.js — product list, selection, detail view, add/edit/delete/archive.

let productUnitEditorSnapshot=null;
let productUnitEditorSaving=false;
let productSaveInProgress=false;
let mobileExpandedProductId=null;

const PRODUCT_MENU_DEFINITIONS={
  products:{label:'Inventory Products',description:'Items assigned to this department'},
  'info-items':{label:'Prep & Info',description:'Non-counted ingredients, mixes, garnishes, and preparation notes'},
  'import-backlog':{label:'Import Backlog',description:'Unmatched imported items saved for later'},
  drinks:{label:'All Drinks',description:'Complete Bar drink catalog'},
  'core-drinks':{label:'Core Drinks',description:'Drinks marked Core in Settings'},
  'non-core-drinks':{label:'Non-Core Drinks',description:'Drinks marked Non-Core in Settings'},
  archived:{label:'Archived',description:'Archived items in this department'}
};

function defaultDepartments(){
  return[
    {id:'bar',name:'Bar',archived:false,managerId:'',roomIds:[],userIds:[]},
    {id:'kitchen',name:'Kitchen',archived:false,managerId:'',roomIds:[],userIds:[]}
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
    const normalized={
      id:String(department.id),
      name:String(department.name||`Department ${index+1}`).trim()||`Department ${index+1}`,
      archived:!!department.archived,
      managerId:String(department.managerId||''),
      roomIds:[...new Set(Array.isArray(department.roomIds)?department.roomIds.filter(Boolean):[])],
      userIds:[...new Set(Array.isArray(department.userIds)?department.userIds.filter(Boolean):[])]
    };
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
function ensureDepartmentAssignments(){
  ensureDepartments();
  let changed=false;
  const before=JSON.stringify(allDepartments().map(department=>({id:department.id,roomIds:department.roomIds,userIds:department.userIds})));
  const fallback=getDepartment('bar')||allDepartments()[0];
  const departmentIds=new Set(allDepartments().map(department=>department.id));
  allDepartments().forEach(department=>{
    department.roomIds=[];
    department.userIds=[...new Set([...(department.userIds||[]),department.managerId].filter(Boolean))];
  });
  (state.rooms||[]).forEach(room=>{
    if(!departmentIds.has(room.departmentId)){room.departmentId=fallback?.id||'';changed=true;}
    const department=getDepartment(room.departmentId);
    if(department&&!department.roomIds.includes(room.id))department.roomIds.push(room.id);
  });
  if(before!==JSON.stringify(allDepartments().map(department=>({id:department.id,roomIds:department.roomIds,userIds:department.userIds}))))changed=true;
  return changed;
}
function productDepartmentIds(product){
  const ids=Array.isArray(product?.departments)?product.departments.filter(Boolean):[product?.department].filter(Boolean);
  return[...new Set(ids.length?ids:['bar'])];
}
function productInDepartment(product,departmentId){return productDepartmentIds(product).includes(departmentId);}

function defaultProductMenuSettings(){
  return Object.fromEntries(allDepartments().map(department=>{
    const views=['products','info-items','import-backlog','archived'];
    return[department.id,views.map(view=>({view,label:view==='info-items'?PRODUCT_MENU_DEFINITIONS[view].label:department.id==='bar'?PRODUCT_MENU_DEFINITIONS[view].label:`${department.name} ${view==='products'?'Products':view==='import-backlog'?'Import Backlog':'Archived'}`,visible:true}))];
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
  ensureCurrentDepartmentView();
  const departments=activeDepartments();
  if(tabs)tabs.innerHTML=departments.map(department=>`<button type="button" class="${department.id===productDepartmentView?'active':''}" data-product-department="${department.id}" onclick="setProductDepartmentView('${department.id}')">${escapeHtml(department.name)}</button>`).join('');
  const select=document.getElementById('product-department-select');
  if(select){select.innerHTML=departments.map(department=>`<option value="${escapeHtml(department.id)}">${escapeHtml(department.name)}</option>`).join('');select.value=productDepartmentView;}
}

function renderProductCatalogMenu(){
  const sidebar=document.getElementById('product-catalog-sidebar');
  if(!sidebar)return;
  if(!['products','info-items','import-backlog','archived'].includes(productCatalogView))productCatalogView='products';
  sidebar.innerHTML=`
    <button class="catalog-nav ${productCatalogView==='products'?'active':''}" data-catalog-view="products" type="button" onclick="setProductCatalogView('products')"><span>Inventory</span><strong id="catalog-count-products">0</strong></button>
    <button class="catalog-nav ${productCatalogView==='info-items'?'active':''}" data-catalog-view="info-items" type="button" onclick="setProductCatalogView('info-items')"><span>Prep &amp; Info</span><strong id="catalog-count-info-items">0</strong></button>
    <button class="catalog-nav ${productCatalogView==='import-backlog'?'active':''}" data-catalog-view="import-backlog" type="button" onclick="setProductCatalogView('import-backlog')"><span>Import Backlog</span><strong id="catalog-count-import-backlog">0</strong></button>
    <button class="catalog-nav ${productCatalogView==='archived'?'active':''}" data-catalog-view="archived" type="button" onclick="setProductCatalogView('archived')"><span>Archived</span><strong id="catalog-count-archived">0</strong></button>`;
  const select=document.getElementById('product-catalog-select');
  if(select){
    select.innerHTML='<option value="products">Inventory</option><option value="info-items">Prep &amp; Info</option><option value="import-backlog">Import Backlog</option><option value="archived">Archived</option>';
    select.value=productCatalogView;
  }
}

function toggleProductCatalogMenu(){
  productCatalogMenuExpanded=!productCatalogMenuExpanded;
  renderProductCatalogMenu();
}

function setProductCatalogMenuView(menuId){setProductCatalogView(`menu:${menuId}`);}

function productColumnLabel(column){
  if(productDepartmentView!=='bar'&&column.key==='unit')return'Unit';
  if(productDepartmentView!=='bar'&&column.key==='cost')return'Unit Cost';
  return column.label;
}

function setProductDepartmentView(department){
  if(!getDepartment(department)||getDepartment(department).archived)return;
  productDepartmentView=department;
  productCatalogView='products';
  mobileExpandedProductId=null;
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
  mobileExpandedProductId=null;
  if(view.startsWith('menu:'))productCatalogMenuExpanded=true;
  selectedProds.clear();
  document.querySelectorAll('.catalog-nav[data-catalog-view]').forEach(btn=>btn.classList.toggle('active',btn.dataset.catalogView===view));
  document.getElementById('prod-sel-bar')?.classList.remove('show');
  renderProducts();
}

function openProductFilterSheet(){
  closeAllMenus();
  const sheet=document.getElementById('product-filter-sheet');
  if(!sheet)return;
  const page=document.getElementById('page-products');
  if(window.innerWidth<=820&&page&&sheet.parentElement!==page)page.appendChild(sheet);
  sheet.scrollTop=0;
  sheet.classList.add('open');
  syncMobileSheetBackdrop();
}
function closeProductFilterSheet(){
  const sheet=document.getElementById('product-filter-sheet');
  sheet?.classList.remove('open');
  const home=document.querySelector('#page-products .product-filter-row');
  if(sheet&&home&&sheet.parentElement!==home)home.appendChild(sheet);
  syncMobileSheetBackdrop();
}
function setProductSort(value){const[col='name',dir='asc']=String(value||'name:asc').split(':');sortState.products={col,dir};renderProducts();}
function updateProductFilterSummary(){
  const summary=document.getElementById('product-filter-summary');if(!summary)return;
  const cat=document.getElementById('prod-cat-f')?.value||'';
  const sub=document.getElementById('prod-sub-f')?.value||'';
  const status=document.getElementById('prod-status-f')?.value||'active';
  const sortValue=`${sortState.products.col}:${sortState.products.dir}`;
  const sort=document.getElementById('prod-sort-f');if(sort)sort.value=sortValue;
  const active=[cat,sub,status!=='active'?status:'',sortValue!=='name:asc'?sortValue:''].filter(Boolean).length;
  summary.textContent=active?`${active} active`:'Default';
}

function updateCatalogCounts(){
  const drinks=state.drinks||[];
  const departmentProducts=(state.products||[]).filter(product=>productInDepartment(product,productDepartmentView));
  const counts={
    products:departmentProducts.filter(p=>!p.archived).length,
    'info-items':(state.prepItems||[]).filter(item=>!item.archived).length,
    'import-backlog':(state.importBacklog||[]).filter(item=>backlogDepartment(item)===productDepartmentView).length,
    drinks:drinks.filter(d=>!d.archived).length,
    'core-drinks':drinks.filter(d=>d.type==='core'&&!d.archived).length,
    'non-core-drinks':drinks.filter(d=>d.type==='non-core'&&!d.archived).length,
    archived:departmentProducts.filter(p=>p.archived).length
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
    document.getElementById('pm-status').value=p.status==='delisted'||p.archived?'delisted':'active';
    buildProductUnitRows(normalizeProductUnits(p));
    selectProductUnitByValues(p.unit,p.sku,p.cost,p.par);
    previewAliases();
  }else{
    ['pm-name','pm-inventory-name','pm-aliases','pm-cost','pm-par','pm-last-count','pm-sku','pm-notes'].forEach(i=>document.getElementById(i).value='');
    document.getElementById('pm-aliases-preview').innerHTML='';
    document.getElementById('pm-cat').value=department==='bar'?'Spirits':department==='kitchen'?'Food':'Supplies';updateSubcatOptions('pm-sub','pm-cat');
    buildProductUnitRows([{unit:'',unitSize:'',sku:'',cost:0,par:0}]);
    rebuildProductUnitSelect();
    document.getElementById('pm-status').value='active';
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
    <button class="btn btn-ghost-danger btn-sm" type="button" onclick="removeProductUnitRow(this)">Remove</button>
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
  if(id==='modal-product'&&productSaveInProgress){toast('Wait for the shared save to finish.',true);return false;}
  if(id==='modal-category-editor'&&typeof categorySaveInProgress!=='undefined'&&categorySaveInProgress){toast('Wait for the shared save to finish.',true);return false;}
  if(id==='modal-inventory'&&typeof currentCountRoomLock!=='undefined'&&currentCountRoomLock&&!inventoryRoomExitInProgress){toast('Use Save Room or Exit Room before leaving.',true);return false;}
  if(id==='modal-inv-room-picker'){
    clearInterval(countRoomPickerRefreshTimer);
    countRoomPickerRefreshTimer=null;
    countRoomPickerCountId=null;
    countRoomPickerLocks=[];
  }
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
async function saveProduct(){
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
  const status=document.getElementById('pm-status').value;
  const prod={...existing,id:editingProductId||uid(),name,inventoryName:document.getElementById('pm-inventory-name').value.trim(),aliases:document.getElementById('pm-aliases').value.trim(),departments,unit:primary.unit,category:document.getElementById('pm-cat').value,subcategory:document.getElementById('pm-sub').value,cost:primary.cost||parseFloat(document.getElementById('pm-cost').value)||0,par:parseFloat(primary.par)||parseFloat(document.getElementById('pm-par').value)||0,sku:primary.sku||document.getElementById('pm-sku').value.trim(),notes:document.getElementById('pm-notes').value.trim(),suppliers:getProdSuppliers(),units:orderedUnits,lastCount:lastCountValue===''?null:parseFloat(lastCountValue)||0,status,archived:status==='delisted'};
  const wasEditing=Boolean(editingProductId);
  const saveButton=document.getElementById('product-save-button');
  productSaveInProgress=true;saveButton.disabled=true;saveButton.textContent='Saving…';
  const sharedState=await cloudSaveProduct(prod);
  if(!sharedState){
    productSaveInProgress=false;saveButton.disabled=false;saveButton.textContent='Save Product';
    toast('Could not save to the shared workspace. Try again.',true);return;
  }
  state=sharedState;
  if(typeof normalizeLoadedState==='function')normalizeLoadedState();
  try{localStorage.setItem('keg_bar_v5',JSON.stringify(state));}catch(error){}
  productSaveInProgress=false;closeModal('modal-product');renderProducts();toast(wasEditing?'Saved for everyone.':'Added for everyone.');
  saveButton.disabled=false;saveButton.textContent='Save Product';
}
function deleteProduct(id){closeAllMenus();if(!confirm('Delete this product?'))return;state.products=state.products.filter(p=>p.id!==id);state.suppliers.forEach(s=>{if(Array.isArray(s.products))s.products=s.products.filter(pid=>pid!==id);});save();closeModal('modal-product-view');renderProducts();toast('Deleted.');}
function archiveProduct(id,archived=true){closeAllMenus();const p=getProduct(id);if(!p)return;p.archived=archived;p.status=archived?'delisted':'active';save();closeModal('modal-product-view');renderProducts();toast(archived?'De-listed.':'Activated.');}
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
    openInventoryRoomSelect();
  }else if(action==='usage'){
    showPage('usage');
    toast('Upload or edit a usage log, then add this product there.');
  }else if(action==='order'){
    showPage('orders');
    openOrderModal();
  }
}
function productMenuHtml(product,menuId){
  const archiveLabel=product.archived?'Set Active':'De-list';
  const archiveAction=product.archived?`archiveProduct('${product.id}',false)`:`archiveProduct('${product.id}',true)`;
  return`<div class="drop-wrap product-actions">
    <button class="icon-btn overflow-menu-button" type="button" onclick="event.stopPropagation();toggleMenu('${menuId}')" title="Product actions" aria-label="Product actions"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.4"></circle><circle cx="12" cy="12" r="1.4"></circle><circle cx="19" cy="12" r="1.4"></circle></svg></button>
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
  if(!window.__openingRecipeProduct)recipeProductReturn=null;
  closeAllMenus();
  const lastInv=state.inventories[0];
  const lastCount=p.lastCount??(lastInv?lastInv.items[p.id]??null:null);
  const low=p.par>0&&lastCount!==null&&lastCount!==undefined&&lastCount<=p.par;
  const units=normalizeProductUnits(p);
  const isBar=productDepartmentView==='bar'&&productInDepartment(p,'bar');
  const menuUses=productMenuUses(p.id);
  const departmentBadges=productDepartmentIds(p).map(id=>`<span class="sub-badge">${escapeHtml(departmentName(id))}</span>`).join(' ');
  const body=document.getElementById('product-view-body');
  body.innerHTML=`
    <div class="product-view-head">
      <div>
        <h3 id="product-view-title">${escapeHtml(p.name)}${p.archived?' <span class="sub-badge">De-listed</span>':''}</h3>
        <div class="product-view-meta">${departmentBadges} ${catBadge(p.category)} ${subBadge(p.subcategory)} ${low?'<span class="missing-pill"><span class="missing-dot"></span>At / below par</span>':''}</div>
      </div>
      <div class="detail-heading-actions">
        ${recipeProductReturn?'<button class="btn btn-secondary btn-sm recipe-back-button" type="button" onclick="returnToRecipe()">← Back to Recipe</button>':''}
        <button class="icon-btn" type="button" aria-label="Edit product" title="Edit product" onclick="openProductModal('${p.id}')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l11-11-4-4L4 16v4Z"></path><path d="m13.5 6.5 4 4"></path></svg></button>
        <div class="drop-wrap"><button class="icon-btn overflow-menu-button" type="button" aria-label="Product actions" title="Product actions" onclick="event.stopPropagation();toggleMenu('product-view-actions-menu')"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.4"></circle><circle cx="12" cy="12" r="1.4"></circle><circle cx="19" cy="12" r="1.4"></circle></svg></button><div class="drop-menu" id="product-view-actions-menu"><button onclick="closeAllMenus();openProductQuickAction('count','${p.id}')">Add Count</button><button onclick="closeAllMenus();openProductQuickAction('usage','${p.id}')">Add Usage</button><button onclick="closeAllMenus();openProductQuickAction('order','${p.id}')">Add Order</button><div class="drop-divider"></div><button onclick="closeAllMenus();archiveProduct('${p.id}',${p.archived?'false':'true'})">${p.archived?'Restore':'Archive'}</button><button onclick="closeAllMenus();deleteProduct('${p.id}')">Delete</button></div></div>
        <button class="detail-close" type="button" aria-label="Close product detail" title="Close" onclick="closeModal('modal-product-view')">&times;</button>
      </div>
    </div>
    <div class="product-detail-grid">
      <div class="product-detail-field"><div class="label">Status</div><div class="value">${p.archived||p.status==='delisted'?'De-listed':'Active'}</div></div>
      <div class="product-detail-field"><div class="label">Inventory Name</div><div class="value">${escapeHtml(p.inventoryName||p.name||'—')}</div></div>
      <div class="product-detail-field"><div class="label">${isBar?'Packaging':'Unit'}</div><div class="value">${escapeHtml(p.unit||'—')}</div></div>
      <div class="product-detail-field"><div class="label">${isBar?'Packaging Cost':'Unit Cost'}</div><div class="value">${p.cost>0?fmt(p.cost):'—'}</div></div>
      <div class="product-detail-field"><div class="label">Par</div><div class="value">${p.par||'—'}</div></div>
      <div class="product-detail-field"><div class="label">Last Count</div><div class="value">${lastCount!==null&&lastCount!==undefined?lastCount:'—'}</div></div>
      <div class="product-detail-field"><div class="label">SKU / Code</div><div class="value">${p.sku||'—'}</div></div>
      <div class="product-detail-field"><div class="label">Suppliers</div><div class="value">${productSuppliersHtml(p)}</div></div>
    </div>
    <div class="product-view-section"><div class="label">Alternate / Voice Names</div>${aliasBadges(p.aliases)||'<span style="color:var(--text-muted);font-size:0.84rem;">—</span>'}</div>
    <div class="product-view-section"><div class="label">Used In Menu</div>${menuUses.length?`<div class="product-menu-use-list">${menuUses.map(({menu,item})=>`<button type="button" onclick="closeModal('modal-product-view');menuPageDepartment='${menu.departmentId}';menuPageMenuId='${menu.id}';showPage('menu');openMenuItemView('${item.id}')"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(menu.name)}</span></button>`).join('')}</div>`:'<p>Not linked to a menu recipe yet.</p>'}</div>
    <div class="product-view-section"><div class="label">Notes</div><p>${p.notes||'—'}</p></div>
    <div class="product-view-section"><div class="label">${isBar?'Packaging Options':'Units'}</div>
      <div class="table-wrap"><table><thead><tr><th>Default</th><th>${isBar?'Packaging':'Unit'}</th><th>${isBar?'Package Size':'Size'}</th><th>SKU</th><th>${isBar?'Packaging Cost':'Cost'}</th><th>Par</th></tr></thead><tbody>
        ${units.map((unit,index)=>`<tr><td>${index===0?'Yes':'—'}</td><td>${unit.unit||'—'}</td><td>${unit.unitSize||'—'}</td><td>${unit.sku||'—'}</td><td>${unit.cost?fmt(unit.cost):'—'}</td><td>${unit.par||'—'}</td></tr>`).join('')}
      </tbody></table></div>
    </div>
    `;
  openModal('modal-product-view');
}

function toggleMobileProductDetails(id){
  mobileExpandedProductId=mobileExpandedProductId===id?null:id;
  closeAllMenus();
  renderProducts();
}
function mobileProductCardHtml(product){
  const expanded=mobileExpandedProductId===product.id;
  const suppliers=productSuppliersHtml(product)||'—';
  const lastCount=product.lastCount!==null&&product.lastCount!==undefined?product.lastCount:'—';
  return`<article class="product-mobile-card ${expanded?'expanded':''} ${product.archived?'archived-row':''}">
    <button class="product-mobile-card-head" type="button" aria-expanded="${expanded}" onclick="toggleMobileProductDetails('${product.id}')"><strong>${escapeHtml(product.name)}</strong><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg></button>
    ${expanded?`<div class="product-mobile-details">
      <div><span>Inventory name</span><strong>${escapeHtml(product.inventoryName||product.name||'—')}</strong></div>
      <div><span>Category</span><strong>${escapeHtml(product.category||'—')}</strong></div>
      <div><span>Subcategory</span><strong>${escapeHtml(product.subcategory||'—')}</strong></div>
      <div><span>Packaging</span><strong>${escapeHtml(product.unit||'—')}</strong></div>
      <div><span>Packaging cost</span><strong>${product.cost>0?fmt(product.cost):'—'}</strong></div>
      <div><span>Par</span><strong>${product.par||'—'}</strong></div>
      <div><span>Last count</span><strong>${lastCount}</strong></div>
      <div><span>SKU / code</span><strong>${escapeHtml(product.sku||'—')}</strong></div>
      <div class="product-mobile-wide"><span>Alternate names</span><strong>${escapeHtml(product.aliases||'—')}</strong></div>
      <div class="product-mobile-wide"><span>Suppliers</span><strong>${suppliers}</strong></div>
      <div class="product-mobile-wide"><span>Notes</span><strong>${escapeHtml(product.notes||'—')}</strong></div>
      <div class="product-mobile-actions" onclick="event.stopPropagation()">${productMenuHtml(product,`product-mobile-actions-${product.id}`)}</div>
    </div>`:''}
  </article>`;
}

function renderProducts(){
  ensureCurrentDepartmentView();
  renderProductDepartmentTabs();
  ensurePrepItems();
  const infoLibraryMode=productCatalogView==='info-items';
  const productsPage=document.getElementById('page-products');
  productsPage?.classList.toggle('info-library-mode',infoLibraryMode);
  const title=departmentName(productDepartmentView);
  const addButton=document.getElementById('add-product-button');
  if(addButton){addButton.textContent=infoLibraryMode?'＋ Add Info Item':`＋ Add ${title} Product`;addButton.setAttribute('onclick',infoLibraryMode?'openNewPrepItem()':'openProductModal()');}
  const help=document.getElementById('product-department-help');
  if(help)help.textContent=infoLibraryMode?'Shared non-counted ingredients, mixes, garnishes, and preparation notes.':`Items assigned to ${title}. Shared items may also appear in other departments.`;
  const productSearch=document.getElementById('prod-search');if(productSearch)productSearch.placeholder=infoLibraryMode?'Search prep and information items…':'Search products…';
  renderProductCatalogMenu();
  updateCatalogCounts();
  updateProductFilterSummary();
  const catalogCard=document.querySelector('#page-products .catalog-card');
  const mobileList=document.getElementById('product-mobile-list');
  const mobileCardMode=['products','info-items'].includes(productCatalogView);
  catalogCard?.classList.toggle('product-mobile-card-mode',mobileCardMode);
  if(mobileList)mobileList.innerHTML='';
  document.querySelectorAll('.catalog-nav[data-catalog-view]').forEach(btn=>btn.classList.toggle('active',btn.dataset.catalogView===productCatalogView));
  document.querySelectorAll('[data-product-department]').forEach(button=>button.classList.toggle('active',button.dataset.productDepartment===productDepartmentView));
  if(productCatalogView==='info-items')return renderPrepInfoCatalog();
  if(productCatalogView==='import-backlog')return renderImportBacklogCatalog();
  if(productCatalogView==='archived')return renderArchivedCatalog();
  if(productCatalogView.startsWith('menu:'))return renderMenuCatalog(productCatalogView.slice(5));
  if(productCatalogView!=='products')return renderDrinkCatalog();
  const search=document.getElementById('prod-search').value.toLowerCase();
  const cat=document.getElementById('prod-cat-f').value;
  const sub=document.getElementById('prod-sub-f').value;
  const status=document.getElementById('prod-status-f')?.value||'active';
  const departmentProducts=state.products.filter(product=>productInDepartment(product,productDepartmentView));
  const activeDepartmentProducts=departmentProducts.filter(product=>!product.archived);
  const lastInv=state.inventories[0];
  const{col,dir}=sortState.products;
  const visCols=PROD_COLS.filter(c=>c.visible);
  const thead=document.getElementById('prod-thead');
  thead.innerHTML='<tr>'+visCols.map(c=>{
    if(c.key==='sel')return`<th style="width:36px;padding:9px 8px;"><input type="checkbox" onchange="prodHeaderCheck(this)" style="accent-color:var(--accent);width:15px;height:15px;cursor:pointer;"></th>`;
    const label=productColumnLabel(c);
    if(!c.sort)return`<th>${label}</th>`;
    return sortableTableHeader(label,'products',c.sort);
  }).join('')+'</tr>';
  let list=departmentProducts.filter(p=>{
    const supplierText=(p.suppliers||[]).map(sid=>state.suppliers.find(s=>s.id===sid)?.name||'').join(' ').toLowerCase();
    const ms=!search||p.name.toLowerCase().includes(search)||(p.inventoryName||'').toLowerCase().includes(search)||(p.aliases||'').toLowerCase().includes(search)||supplierText.includes(search);
    const st=status==='all'||(status==='archived'?!!p.archived:!p.archived);
    return productInDepartment(p,productDepartmentView)&&ms&&st&&(!cat||p.category===cat)&&(!sub||p.subcategory===sub);
  }).map(p=>({...p,lastCount:p.lastCount??(lastInv?lastInv.items[p.id]??null:null)}));
  list=sortArr(list,col,dir);
  const tbody=document.getElementById('prod-tbody');
  if(!list.length){
    const filtersApplied=!!(search||cat||sub||status!=='active');
    let emptyState;
    if(filtersApplied){
      emptyState=`<div class="table-empty-state"><strong>No products match these filters</strong><p>Clear the search and filters to return to active ${escapeHtml(title)} products.</p><button class="btn btn-secondary" type="button" onclick="resetProductFilters()">Clear filters</button></div>`;
    }else if(departmentProducts.length&&!activeDepartmentProducts.length){
      emptyState=`<div class="table-empty-state"><strong>All ${escapeHtml(title)} products are archived</strong><p>Archived products are kept out of active inventory and counts.</p><button class="btn btn-secondary" type="button" onclick="showArchivedProductFilter()">View archived products</button></div>`;
    }else{
      emptyState=`<div class="table-empty-state"><strong>Add your first ${escapeHtml(title)} product</strong><p>Products hold the names, packaging, cost, and supplier details used across inventory.</p><button class="btn btn-primary" type="button" onclick="openProductModal()">＋ Add ${escapeHtml(title)} product</button></div>`;
    }
    tbody.innerHTML=`<tr><td colspan="${visCols.length}">${emptyState}</td></tr>`;
    if(mobileList)mobileList.innerHTML=emptyState;
    syncHeaderCb();return;
  }
  tbody.innerHTML=list.map(p=>{
    const low=p.par>0&&p.lastCount!==null&&p.lastCount<=p.par;
    const sel=selectedProds.has(p.id);
    const menuId=`prod-actions-${p.id}`;
    return`<tr data-id="${p.id}" class="product-row ${sel?'row-selected':''} ${p.archived?'archived-row':''}" onclick="openProductView('${p.id}')">${visCols.map(c=>{switch(c.key){
      case 'sel':return`<td style="text-align:center;padding:9px 8px;"><input type="checkbox" ${sel?'checked':''} onchange="event.stopPropagation();prodRowCheck('${p.id}',this)" onclick="event.stopPropagation()" style="accent-color:var(--accent);width:15px;height:15px;cursor:pointer;"></td>`;
      case 'name':return`<td><strong>${p.name}</strong>${p.archived?' <span class="sub-badge">Archived</span>':''}${low?` <span class="missing-pill">Low</span>`:''}${p.notes?`<div style="font-size:0.71rem;color:var(--text-muted);">${p.notes}</div>`:''}</td>`;
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
  if(mobileList)mobileList.innerHTML=list.map(mobileProductCardHtml).join('');
  syncHeaderCb();
}

function prepItemMenuUses(prepItem){
  const key=prepItemKey(prepItem?.name);
  return(state.menus||[]).flatMap(menu=>(menu.items||[]).filter(item=>(item.ingredients||[]).some(ingredient=>ingredient.linkKind!=='product'&&(ingredient.prepItemId===prepItem.id||prepItemKey(ingredient.name)===key))).map(item=>({menu,item})));
}

function renderPrepInfoCatalog(){
  ensurePrepItems();
  const query=(document.getElementById('prod-search')?.value||'').trim().toLowerCase();
  const items=(state.prepItems||[]).filter(item=>!item.archived).filter(item=>!query||[item.name,item.description,item.prepInstructions,item.notes,...prepItemMenuUses(item).flatMap(use=>[use.menu.name,use.item.name])].join(' ').toLowerCase().includes(query)).sort((a,b)=>a.name.localeCompare(b.name));
  const thead=document.getElementById('prod-thead');const tbody=document.getElementById('prod-tbody');const mobileList=document.getElementById('product-mobile-list');
  thead.innerHTML='<tr><th>Info Item</th><th>Used In</th><th>Description</th><th>Prep Instructions</th></tr>';
  if(!items.length){
    const empty=`<div class="table-empty-state"><strong>${query?'No information items match this search':'No prep or information items yet'}</strong><p>${query?'Try another name, recipe, or description.':'Non-counted recipe ingredients will appear here automatically.'}</p>${query?'':'<button class="btn btn-primary" type="button" onclick="openNewPrepItem()">＋ Add Info Item</button>'}</div>`;
    tbody.innerHTML=`<tr><td colspan="4">${empty}</td></tr>`;if(mobileList)mobileList.innerHTML=empty;return;
  }
  tbody.innerHTML=items.map(item=>{const uses=prepItemMenuUses(item);return`<tr class="prep-info-row" onclick="openPrepItemView('${item.id}')"><td><strong>${escapeHtml(item.name)}</strong><div class="prep-info-type">Not included in inventory counts</div></td><td>${uses.length?uses.slice(0,3).map(use=>`<span class="sub-badge">${escapeHtml(use.item.name)}</span>`).join(' '):'—'}</td><td>${escapeHtml(item.description||'Add a description')}</td><td>${escapeHtml(item.prepInstructions||'Add preparation instructions')}</td></tr>`;}).join('');
  if(mobileList)mobileList.innerHTML=items.map(item=>{const uses=prepItemMenuUses(item);return`<button class="prep-info-mobile-card" type="button" onclick="openPrepItemView('${item.id}')"><span><strong>${escapeHtml(item.name)}</strong><small>Prep / information · not counted</small></span><p>${escapeHtml(item.description||item.prepInstructions||'Open to add description and preparation instructions.')}</p><b>${uses.length} menu use${uses.length===1?'':'s'} <span>›</span></b></button>`;}).join('');
}

function renderMenuCatalog(menuId){
  const menu=getSettingsMenu(menuId);
  if(!menu||!menuInDepartment(menu,productDepartmentView)||menu.archived||!menu.active){productCatalogView='products';renderProducts();return;}
  const search=(document.getElementById('prod-search')?.value||'').trim().toLowerCase();
  const tbody=document.getElementById('prod-tbody');
  const thead=document.getElementById('prod-thead');
  const items=menu.items.filter(item=>!search||[item.name,item.category,item.description,item.recipe,item.price].join(' ').toLowerCase().includes(search));
  thead.innerHTML='<tr><th>Menu Item</th><th>Section</th><th>Description</th><th>Recipe</th><th>Price</th></tr>';
  if(!items.length){
    tbody.innerHTML=`<tr><td colspan="5" class="empty-cell">${search?'No menu items match this search.':'This menu has no items yet. Add items in Menu Settings.'}</td></tr>`;
    return;
  }
  tbody.innerHTML=items.map(item=>`<tr class="menu-catalog-row">
    <td data-mobile-label="Menu Item"><strong>${escapeHtml(item.name)}</strong></td>
    <td data-mobile-label="Section">${escapeHtml(item.category||'—')}</td>
    <td data-mobile-label="Description">${escapeHtml(item.description||'—')}</td>
    <td data-mobile-label="Recipe"><span class="menu-catalog-recipe">${escapeHtml(item.recipe||'—')}</span></td>
    <td data-mobile-label="Price">${item.price?`$${escapeHtml(item.price)}`:'—'}</td>
  </tr>`).join('');
}

function resetProductFilters(shouldRender=true){
  document.getElementById('prod-search').value='';
  document.getElementById('prod-cat-f').value='';
  document.getElementById('prod-sub-f').innerHTML='<option value="">All</option>';
  document.getElementById('prod-status-f').value='active';
  sortState.products={col:'name',dir:'asc'};
  if(shouldRender)renderProducts();
}
function showArchivedProductFilter(){
  resetProductFilters(false);
  document.getElementById('prod-status-f').value='archived';
  renderProducts();
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
  const words=String(name||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().split(/\s+/).filter(Boolean);
  const products=(state.products||[]).filter(product=>!product.archived&&productInDepartment(product,'bar'));
  const exact=products.filter(product=>{
    const candidates=[product.name,product.inventoryName,...String(product.aliases||'').split(',')].map(normalize).filter(Boolean);
    return candidates.includes(key);
  });
  if(exact.length===1)return exact[0];
  if(exact.length>1)return null;
  const safeAliasMatches=products.filter(product=>String(product.aliases||'').split(',').some(rawAlias=>{
    const aliasWords=String(rawAlias||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().split(/\s+/).filter(Boolean);
    if(!aliasWords.length||aliasWords.join('').length<4)return false;
    return aliasWords.every(word=>words.includes(word));
  }));
  return safeAliasMatches.length===1?safeAliasMatches[0]:null;
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
  const rows=products.filter(item=>!search||[item.kind,item.name,item.type,item.detail].join(' ').toLowerCase().includes(search)).sort((a,b)=>a.name.localeCompare(b.name));
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

function menuRecipeSearchText(value){
  return` ${String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim()} `;
}

function menuItemProductMatches(item,departmentId='bar'){
  const recipe=menuRecipeSearchText(item?.recipe);
  if(recipe.trim()==='')return[];
  return(state.products||[]).filter(product=>!product.archived&&productInDepartment(product,departmentId)).filter(product=>{
    const names=[product.name,product.inventoryName,...String(product.aliases||'').split(',')]
      .map(menuRecipeSearchText).map(name=>name.trim()).filter(name=>name.length>1);
    return names.some(name=>recipe.includes(` ${name} `));
  });
}

function menuItemLinkedProducts(item){
  const saved=new Set(Array.isArray(item?.linkedProductIds)?item.linkedProductIds:[]);
  Object.values(item?.ingredientLinks||{}).forEach(link=>{if(link?.kind==='product'&&link.productId)saved.add(link.productId);});
  return(state.products||[]).filter(product=>saved.has(product.id));
}

function productMenuUses(productId){
  ensureMenuLibrary();
  return(state.menus||[]).flatMap(menu=>(menu.items||[])
    .filter(item=>(item.linkedProductIds||[]).includes(productId)||(item.ingredients||[]).some(ingredient=>ingredient?.linkKind==='product'&&ingredient.productId===productId)||Object.values(item.ingredientLinks||{}).some(link=>link?.kind==='product'&&link.productId===productId))
    .map(item=>({menu,item})));
}

function normalizeMenuVariant(entry,index=0,fallbackGlassware=''){
  const name=String(entry?.name||entry?.label||(['Single','Keg Size'][index])||'One Size').trim()||'One Size';
  return{id:entry?.id||uid(),key:String(entry?.key||prepItemKey(name).replace(/\s+/g,'-')||`size-${index+1}`),name,glassware:String(entry?.glassware||fallbackGlassware||'').trim()};
}

function normalizeMenuIngredient(entry,index=0,legacyLinks={},variants=[]){
  const parsed=typeof entry==='string'?parsedRecipeIngredient(entry):null;
  const name=String(parsed?.name||entry?.name||entry?.ingredient||'').trim();
  const amount=String(parsed?.amount||entry?.amount||entry?.quantity||'').trim();
  const rawAmounts=entry?.amounts&&typeof entry.amounts==='object'&&!Array.isArray(entry.amounts)?entry.amounts:{};
  const amounts=Object.fromEntries(variants.map((variant,variantIndex)=>[variant.key,String(rawAmounts[variant.key]??(variantIndex===0?amount:'')).trim()]));
  const legacyLink=legacyLinks[prepItemKey(name)]||{};
  let productId=String(entry?.productId||legacyLink.productId||'');
  if(productId&&!getProduct(productId))productId='';
  if(!productId&&entry?.linkKind!=='prep'&&legacyLink.kind!=='prep')productId=ingredientProductMatch(entry?.productName||name)?.id||'';
  const prepItemId=productId?'':String(entry?.prepItemId||legacyLink.prepItemId||getPrepItemByName(name)?.id||'');
  return{id:entry?.id||uid(),name,amount:amounts[variants[0]?.key]||amount,amounts,linkKind:productId?'product':'prep',productId,prepItemId,index};
}

function menuRecipeText(item){
  const firstVariant=item?.variants?.[0];
  const ingredients=(item?.ingredients||[]).filter(entry=>entry.name).map(entry=>`• ${[entry.amounts?.[firstVariant?.key]||entry.amount,entry.name].filter(Boolean).join(' ')}`);
  const lines=[];
  if(ingredients.length)lines.push('Ingredients:',...ingredients);
  if(item?.description)lines.push(`Method: ${item.description}`);
  if(firstVariant?.glassware||item?.glassware)lines.push(`Glassware: ${firstVariant?.glassware||item.glassware}`);
  if(item?.garnish)lines.push(`Garnish: ${item.garnish}`);
  return lines.join('\n');
}

function normalizeMenuLibraryItem(item,index=0){
  const ingredients=Array.isArray(item?.ingredients)?item.ingredients.filter(entry=>typeof entry==='string').join('\n'):'';
  const recipe=String(item?.recipe||ingredients||item?.method||'').trim();
  const legacyParts=menuRecipeParts({recipe});
  const ingredientLinks=item?.ingredientLinks&&typeof item.ingredientLinks==='object'&&!Array.isArray(item.ingredientLinks)
    ?Object.fromEntries(Object.entries(item.ingredientLinks).filter(([key,value])=>key&&value&&['product','prep'].includes(value.kind)).map(([key,value])=>[prepItemKey(key),{kind:value.kind,productId:String(value.productId||''),prepItemId:String(value.prepItemId||'')}]))
    :{};
  const variants=(Array.isArray(item?.variants)&&item.variants.length?item.variants:[{name:'One Size',glassware:item?.glassware||legacyParts.glassware||''}]).map((entry,variantIndex)=>normalizeMenuVariant(entry,variantIndex,item?.glassware||legacyParts.glassware||''));
  const rawIngredients=Array.isArray(item?.ingredients)&&item.ingredients.length?item.ingredients:legacyParts.ingredientLines;
  const structuredIngredients=rawIngredients.map((entry,ingredientIndex)=>normalizeMenuIngredient(entry,ingredientIndex,ingredientLinks,variants)).filter(entry=>entry.name);
  const normalized={
    id:item?.id||uid(),
    name:String(item?.name||item?.title||`Menu item ${index+1}`).trim()||`Menu item ${index+1}`,
    category:String(item?.category||item?.section||'').trim(),
    description:String(item?.description||item?.details||legacyParts.method||'').trim(),
    glassware:String(item?.glassware||legacyParts.glassware||'').trim(),
    garnish:String(item?.garnish||legacyParts.garnish||'').trim(),
    imageUrl:String(item?.imageUrl||item?.image||'').trim(),
    method:String(item?.method||'').trim(),
    variants,
    ingredients:structuredIngredients,
    recipe:'',
    price:String(item?.price??item?.cost??'').replace(/^\$/,'').trim(),
    source:String(item?.source||'manual'),
    linkedProductIds:[...new Set(structuredIngredients.filter(entry=>entry.linkKind==='product'&&entry.productId).map(entry=>entry.productId))],
    ingredientLinks:Object.fromEntries(structuredIngredients.map(entry=>[prepItemKey(entry.name),entry.linkKind==='product'?{kind:'product',productId:entry.productId,prepItemId:''}:{kind:'prep',productId:'',prepItemId:entry.prepItemId}]))
  };
  normalized.recipe=menuRecipeText(normalized);
  return normalized;
}

function starterMenuItemFromDrink(drink){
  const item=normalizeMenuLibraryItem({
    id:uid(),
    name:drink.name,
    category:drink.family||'Drink',
    recipe:recipeFromCatalogDrink(drink),
    source:'starter-drink-catalog'
  });
  item.linkedProductIds=menuItemProductMatches(item,'bar').map(product=>product.id);
  return item;
}

function starterMenuLibrary(){
  const drinks=(state.drinks||[]).filter(drink=>!drink.archived);
  return[
    {id:'menu-core-drinks',departmentId:'bar',departmentIds:['bar'],name:'Core Drinks',description:'Core drink recipes',active:true,archived:false,sourceFile:'',importedAt:'',items:drinks.filter(drink=>drink.type==='core').map(starterMenuItemFromDrink)},
    {id:'menu-non-core-drinks',departmentId:'bar',departmentIds:['bar'],name:'Non-Core Drinks',description:'Non-core drink recipes',active:true,archived:false,sourceFile:'',importedAt:'',items:drinks.filter(drink=>drink.type==='non-core').map(starterMenuItemFromDrink)}
  ];
}

function menuDepartmentIds(menu){
  const valid=new Set(activeDepartments().map(department=>department.id));
  const source=Array.isArray(menu?.departmentIds)?menu.departmentIds:[menu?.departmentId];
  const ids=[...new Set(source.filter(id=>valid.has(id)))];
  return ids.length?ids:[activeDepartments()[0]?.id||'bar'];
}
function menuInDepartment(menu,departmentId){return departmentId==='all'||menuDepartmentIds(menu).includes(departmentId);}
function menuDepartmentLabel(menu){
  const ids=menuDepartmentIds(menu);
  return ids.length===activeDepartments().length?'All departments':ids.map(departmentName).join(' + ');
}

function ensureMenuLibrary(){
  let changed=false;
  const libraryVersion=Number(state.menuLibraryVersion)||0;
  if(!Array.isArray(state.menus)){state.menus=[];changed=true;}
  const seen=new Set();
  const normalized=state.menus.map((menu,index)=>{
    if(!menu||seen.has(menu.id)){changed=true;return null;}
    const next={
      id:menu.id||uid(),
      departmentId:menuDepartmentIds(menu)[0],
      departmentIds:menuDepartmentIds(menu),
      name:String(menu.name||`Menu ${index+1}`).trim()||`Menu ${index+1}`,
      description:String(menu.description||'').trim(),
      active:menu.active!==false,
      archived:!!menu.archived,
      sourceFile:String(menu.sourceFile||''),
      importedAt:String(menu.importedAt||''),
      items:(Array.isArray(menu.items)?menu.items:[]).map((item,itemIndex)=>{
        const normalizedItem=normalizeMenuLibraryItem(item,itemIndex);
        if(libraryVersion<3)normalizedItem.linkedProductIds=menuItemProductMatches(normalizedItem,menu.departmentId).map(product=>product.id);
        return normalizedItem;
      })
    };
    seen.add(next.id);
    if(JSON.stringify(menu)!==JSON.stringify(next))changed=true;
    return next;
  }).filter(Boolean);
  if(JSON.stringify(state.menus)!==JSON.stringify(normalized))changed=true;
  state.menus=libraryVersion<1&&!normalized.length?starterMenuLibrary():normalized;
  const combinedMenus=state.menus.filter(menu=>menu.id==='menu-all-drinks'||prepItemKey(menu.name)==='all drinks');
  if(libraryVersion<3||combinedMenus.length){
    const regularMenus=state.menus.filter(menu=>!combinedMenus.includes(menu));
    combinedMenus.forEach(combined=>{
      combined.items.forEach(item=>{
        const duplicate=regularMenus.some(menu=>menu.departmentId===combined.departmentId&&menu.items.some(existing=>prepItemKey(existing.name)===prepItemKey(item.name)&&String(existing.recipe||'')===String(item.recipe||'')));
        if(duplicate)return;
        const drink=(state.drinks||[]).find(entry=>prepItemKey(entry.name)===prepItemKey(item.name));
        const preferredName=drink?.type==='core'?'Core Drinks':drink?.type==='non-core'?'Non-Core Drinks':'Other Drinks';
        let target=regularMenus.find(menu=>menu.departmentId===combined.departmentId&&prepItemKey(menu.name)===prepItemKey(preferredName));
        if(!target){target={id:uid(),departmentId:combined.departmentId,name:preferredName,description:'Menu items preserved from the previous All Drinks list.',active:true,archived:false,sourceFile:'',importedAt:'',items:[]};regularMenus.push(target);}
        target.items.push(item);
      });
    });
    if(combinedMenus.length){state.menus=regularMenus;changed=true;}
    state.menuLibraryVersion=3;changed=true;
  }
  if(libraryVersion<4){state.menuLibraryVersion=4;changed=true;}
  const coreRecipeVersion=Number(state.coreDrinkRecipeVersion||0);
  if(coreRecipeVersion<2&&Array.isArray(globalThis.CORE_DRINKS_MAY_2026)){
    let coreMenu=state.menus.find(menu=>menuDepartmentIds(menu).includes('bar')&&prepItemKey(menu.name)==='core drinks');
    if(!coreMenu){coreMenu={id:'menu-core-drinks',departmentId:'bar',departmentIds:['bar'],name:'Core Drinks',description:'CAN May 2026 Core Drink Recipes',active:true,archived:false,sourceFile:'',importedAt:'',items:[]};state.menus.unshift(coreMenu);}
    if(coreRecipeVersion<1||!coreMenu.items?.length){
      const previousItems=coreMenu.items||[];
      coreMenu.items=globalThis.CORE_DRINKS_MAY_2026.map((source,index)=>{
        const previous=previousItems.find(item=>prepItemKey(item.name)===prepItemKey(source.name));
        return normalizeMenuLibraryItem({...source,id:previous?.id||`core-may-2026-${prepItemKey(source.name).replace(/\s+/g,'-')}`,price:previous?.price||source.price||'',source:'CAN May 2026 Core Drinks.pdf'},index);
      });
      coreMenu.description='CAN May 2026 Core Drink Recipes - updated May 19, 2026';
      coreMenu.sourceFile='CAN May 2026 Core Drinks.pdf';coreMenu.importedAt=new Date().toISOString();coreMenu.active=true;coreMenu.archived=false;
    }else{
      coreMenu.items.forEach(item=>{const source=globalThis.CORE_DRINKS_MAY_2026.find(entry=>prepItemKey(entry.name)===prepItemKey(item.name));if(source&&item.imageUrl!==source.imageUrl)item.imageUrl=source.imageUrl;});
    }
    state.coreDrinkRecipeVersion=2;changed=true;
  }
  if(ensureSpring2026MenuRecipes())changed=true;
  return changed;
}

function mergeSpringMenuItems(menu,sources){
  let changed=false;
  if(!Array.isArray(menu.items))menu.items=[];
  sources.forEach((source,index)=>{
    const existing=menu.items.find(item=>prepItemKey(item.name)===prepItemKey(source.name));
    const normalized=normalizeMenuLibraryItem({...source,id:existing?.id||`spring-2026-${prepItemKey(source.name).replace(/\s+/g,'-')}`,price:existing?.price||source.price||'',imageUrl:source.imageUrl||existing?.imageUrl||'',source:source.source||'CAN Spring 2026'},index);
    if(existing){
      const itemIndex=menu.items.indexOf(existing);
      if(JSON.stringify(existing)!==JSON.stringify(normalized)){menu.items[itemIndex]=normalized;changed=true;}
    }else{menu.items.push(normalized);changed=true;}
  });
  return changed;
}

function ensureSpring2026MenuRecipes(){
  if((Number(state.springMenuRecipeVersion)||0)>=1)return false;
  if(!Array.isArray(globalThis.SPRING_2026_NON_CORE_DRINKS)||!Array.isArray(globalThis.SPRING_2026_CORE_ADDITIONS))return false;
  let changed=false;
  let coreMenu=state.menus.find(menu=>menuDepartmentIds(menu).includes('bar')&&prepItemKey(menu.name)==='core drinks');
  if(!coreMenu){
    coreMenu={id:'menu-core-drinks',departmentId:'bar',departmentIds:['bar'],name:'Core Drinks',description:'CAN Spring 2026 Classics & Creations',active:true,archived:false,sourceFile:'',importedAt:'',items:[]};
    state.menus.unshift(coreMenu);changed=true;
  }
  if(mergeSpringMenuItems(coreMenu,globalThis.SPRING_2026_CORE_ADDITIONS))changed=true;
  Object.entries(globalThis.SPRING_2026_CORE_UPDATES||{}).forEach(([name,updates])=>{
    const item=coreMenu.items.find(entry=>prepItemKey(entry.name)===name);if(!item)return;
    const ingredientRenames=updates.ingredientRenames||{};
    (item.ingredients||[]).forEach(ingredient=>{const nextName=ingredientRenames[prepItemKey(ingredient.name)];if(nextName){ingredient.name=nextName;ingredient.prepItemId='';}});
    Object.assign(item,Object.fromEntries(Object.entries(updates).filter(([key])=>key!=='ingredientRenames')));item.recipe=menuRecipeText(item);changed=true;
  });
  coreMenu.description='CAN Spring 2026 Classics & Creations';
  coreMenu.sourceFile='CAN Pocket Bar Information Sheet Spring 2026 (2).pdf + New Drinks.pdf';
  coreMenu.importedAt=new Date().toISOString();

  let nonCoreMenu=state.menus.find(menu=>menuDepartmentIds(menu).includes('bar')&&prepItemKey(menu.name)==='non core drinks');
  if(!nonCoreMenu){
    nonCoreMenu={id:'menu-non-core-drinks',departmentId:'bar',departmentIds:['bar'],name:'Non-Core Drinks',description:'CAN Spring 2026 non-core cocktails, specialty coffees, and shots',active:true,archived:false,sourceFile:'',importedAt:'',items:[]};
    state.menus.push(nonCoreMenu);changed=true;
  }
  if(mergeSpringMenuItems(nonCoreMenu,globalThis.SPRING_2026_NON_CORE_DRINKS))changed=true;
  nonCoreMenu.description='CAN Spring 2026 non-core cocktails, specialty coffees, and shots';
  nonCoreMenu.sourceFile='CAN - Spring 2026 Non-Core Cocktails.pdf';
  nonCoreMenu.importedAt=new Date().toISOString();nonCoreMenu.active=true;nonCoreMenu.archived=false;
  state.springMenuRecipeVersion=1;
  return true;
}

function getSettingsMenu(id){ensureMenuLibrary();return state.menus.find(menu=>menu.id===id)||null;}

function prepItemKey(value){return String(value||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ' ).trim();}

function ensurePrepItems(){
  if(!Array.isArray(state.prepItems)){state.prepItems=[];return true;}
  let changed=false;
  const seen=new Set();
  state.prepItems=state.prepItems.map(item=>{
    const name=String(item?.name||'').trim();
    const key=prepItemKey(name);
    if(!name||!key||seen.has(key)){changed=true;return null;}
    seen.add(key);
    const normalized={
      id:item.id||uid(),name,description:String(item.description||''),prepInstructions:String(item.prepInstructions||''),notes:String(item.notes||''),imageUrls:Array.isArray(item.imageUrls)?item.imageUrls.map(String).filter(Boolean):[],archived:!!item.archived
    };
    if(JSON.stringify(item)!==JSON.stringify(normalized))changed=true;
    return normalized;
  }).filter(Boolean);
  if((Number(state.springPrepRecipeVersion)||0)<1&&Array.isArray(globalThis.SPRING_2026_PREP_RECIPES)){
    const existingByName=new Map(state.prepItems.map(item=>[prepItemKey(item.name),item]));
    globalThis.SPRING_2026_PREP_RECIPES.forEach(source=>{
      const existing=existingByName.get(prepItemKey(source.name));
      if(existing)Object.assign(existing,{description:source.description,prepInstructions:source.prepInstructions,notes:source.notes,imageUrls:Array.isArray(source.imageUrls)?source.imageUrls:existing.imageUrls||[],archived:false});
      else{const item={id:`spring-prep-${prepItemKey(source.name).replace(/\s+/g,'-')}`,name:source.name,description:source.description,prepInstructions:source.prepInstructions,notes:source.notes,imageUrls:Array.isArray(source.imageUrls)?source.imageUrls:[],archived:false};state.prepItems.push(item);existingByName.set(prepItemKey(item.name),item);}
    });
    state.springPrepRecipeVersion=1;changed=true;
  }
  const byName=new Map(state.prepItems.map(item=>[prepItemKey(item.name),item]));
  (state.menus||[]).forEach(menu=>(menu.items||[]).forEach(menuItem=>(menuItem.ingredients||[]).forEach(ingredient=>{
    if(ingredient.linkKind==='product'||!String(ingredient.name||'').trim())return;
    const key=prepItemKey(ingredient.name);
    let prepItem=byName.get(key);
    if(!prepItem){
      prepItem={id:uid(),name:String(ingredient.name).trim(),description:'',prepInstructions:'',notes:'Added from a menu recipe',imageUrls:[],archived:false};
      state.prepItems.push(prepItem);byName.set(key,prepItem);changed=true;
    }
    if(ingredient.prepItemId!==prepItem.id){ingredient.prepItemId=prepItem.id;changed=true;}
  })));
  return changed;
}

function getPrepItem(id){ensurePrepItems();return state.prepItems.find(item=>item.id===id)||null;}
function getPrepItemByName(name){const key=prepItemKey(name);return(state.prepItems||[]).find(item=>prepItemKey(item.name)===key)||null;}

function getMenuItemRecord(id){
  ensureMenuLibrary();
  for(const menu of state.menus){
    const item=(menu.items||[]).find(entry=>entry.id===id);
    if(item)return{menu,item};
  }
  return null;
}

function menuRecipeParts(item){
  const raw=String(item?.recipe||'').replace(/\r/g,'');
  const ingredientLines=[];
  const methodLines=[];
  let glassware=String(item?.glassware||'').trim();
  let garnish=String(item?.garnish||'').trim();
  let section='ingredients';
  raw.split('\n').forEach(rawLine=>{
    let line=rawLine.trim();
    if(!line)return;
    if(/^ingredients?\s*:?$/i.test(line)){section='ingredients';return;}
    if(/^method\s*:/i.test(line)){section='method';line=line.replace(/^method\s*:\s*/i,'');if(line)methodLines.push(line);return;}
    if(/^glassware\s*:/i.test(line)){glassware=line.replace(/^glassware\s*:\s*/i,'').trim();return;}
    if(/^garnish\s*:/i.test(line)){garnish=line.replace(/^garnish\s*:\s*/i,'').trim();return;}
    line=line.replace(/^[•\-*]\s*/,'').trim();
    if(!line)return;
    (section==='method'?methodLines:ingredientLines).push(line);
  });
  return{ingredientLines,method:methodLines.join('\n'),glassware,garnish};
}

function parsedRecipeIngredient(line){
  const text=String(line||'').trim();
  const match=text.match(/^((?:\d+\s+)?(?:\d+\/\d+|\d+(?:\.\d+)?)?)\s*(oz|ml|dash(?:es)?|barspoon|tsp|tbsp|cup|cups|piece|pieces|slice|slices)?\s*(.*)$/i);
  const quantity=String(match?.[1]||'').trim();
  const unit=String(match?.[2]||'').trim();
  const name=String(match?.[3]||text).trim()||text;
  return{name,amount:[quantity,unit].filter(Boolean).join(' ')};
}

function menuRecipeIngredients(item){
  if(Array.isArray(item?.ingredients))return item.ingredients.filter(entry=>entry.name).map(entry=>{
    const product=entry.linkKind==='product'?getProduct(entry.productId):null;
    const prep=product?null:(entry.prepItemId?getPrepItem(entry.prepItemId):getPrepItemByName(entry.name));
    const variantKey=menuItemViewVariantId&&item.variants?.some(variant=>variant.id===menuItemViewVariantId)?item.variants.find(variant=>variant.id===menuItemViewVariantId)?.key:item.variants?.[0]?.key;
    return{id:entry.id,name:entry.name,amount:entry.amounts?.[variantKey]??entry.amount??'',amounts:entry.amounts||{},product,prep};
  });
  return menuRecipeParts(item).ingredientLines.map(line=>{const parsed=parsedRecipeIngredient(line);const product=ingredientProductMatch(parsed.name);return{...parsed,product,prep:product?null:getPrepItemByName(parsed.name)};});
}

function openMenuSettings(){toggleMenuManager();}

function setMenuPageDepartment(departmentId){
  if(departmentId!=='all'&&(!getDepartment(departmentId)||getDepartment(departmentId).archived))return;
  menuPageDepartment=departmentId;
  menuPageMenuId='';
  const search=document.getElementById('menu-page-search');if(search)search.value='';
  renderMenuPage();
}

function openMenuPageMenu(menuId){
  const menu=menuId==='__all_items__'?null:getSettingsMenu(menuId);
  if(menuId!=='__all_items__'&&(!menu||menu.archived))return;
  menuPageMenuId=menuId;
  if(menu&&menuPageDepartment!=='all'&&!menuInDepartment(menu,menuPageDepartment))menuPageDepartment=menuDepartmentIds(menu)[0];
  const search=document.getElementById('menu-page-search');if(search)search.value='';
  document.getElementById('menu-page-manager').hidden=true;
  document.getElementById('menu-page-editor').hidden=true;
  document.getElementById('menu-page-browser').hidden=false;
  renderMenuPage();
}

function showMenuPagePicker(){menuPageMenuId='';const search=document.getElementById('menu-page-search');if(search)search.value='';renderMenuPage();}
function setMenuPageMenu(menuId){menuId?openMenuPageMenu(menuId):showMenuPagePicker();}

function renderMenuPage(){
  ensureMenuLibrary();ensurePrepItems();
  const departments=activeDepartments();
  if(menuPageDepartment!=='all'&&(!getDepartment(menuPageDepartment)||getDepartment(menuPageDepartment).archived))menuPageDepartment='all';
  const departmentSelect=document.getElementById('menu-page-department');
  if(departmentSelect){departmentSelect.innerHTML=`<option value="all">All departments</option>${departments.map(department=>`<option value="${escapeHtml(department.id)}">${escapeHtml(department.name)}</option>`).join('')}`;departmentSelect.value=menuPageDepartment;}
  const allActiveMenus=state.menus.filter(menu=>!menu.archived&&menu.active);
  const menus=allActiveMenus.filter(menu=>menuInDepartment(menu,menuPageDepartment));
  if(menuPageMenuId&&menuPageMenuId!=='__all_items__'&&!allActiveMenus.some(menu=>menu.id===menuPageMenuId))menuPageMenuId='';
  const searchGroup=document.getElementById('menu-page-search-group');if(searchGroup)searchGroup.hidden=!menuPageMenuId;
  const menuSearchGroup=document.getElementById('menu-page-menu-search-group');if(menuSearchGroup)menuSearchGroup.hidden=!!menuPageMenuId;
  const query=(document.getElementById('menu-page-search')?.value||'').trim().toLowerCase();
  const menuQuery=(document.getElementById('menu-page-menu-search')?.value||'').trim().toLowerCase();
  const summary=document.getElementById('menu-page-summary');
  const grid=document.getElementById('menu-page-grid');
  if(!grid)return;
  if(!menuPageMenuId){
    if(summary)summary.innerHTML='<div class="menu-page-intro"><span class="detail-eyebrow">Choose a menu</span><h3>Open one menu at a time</h3><p>Menus can contain drinks, food, or both. Use Browse all items when you need the complete searchable library.</p></div>';
    grid.className='menu-page-grid menu-selection-grid';
    const visibleMenus=menus.filter(menu=>!menuQuery||[menu.name,menu.description,...menu.items.map(item=>`${item.name} ${item.category}`)].join(' ').toLowerCase().includes(menuQuery));
    grid.innerHTML=visibleMenus.length?visibleMenus.map(menu=>`<button class="menu-selection-card" type="button" onclick="openMenuPageMenu('${menu.id}')"><span class="detail-eyebrow">${escapeHtml(menuDepartmentLabel(menu))}</span><strong>${escapeHtml(menu.name)}</strong><small>${escapeHtml(menu.description||'Open this menu')}</small><b>${menu.items.length} item${menu.items.length===1?'':'s'}</b></button>`).join(''):`<div class="menu-page-empty"><strong>No menus match this search</strong><span>Try a menu name, season, or one of its item names.</span></div>`;
    return;
  }
  const browsingAllItems=menuPageMenuId==='__all_items__';
  const selectedMenus=browsingAllItems?allActiveMenus:allActiveMenus.filter(menu=>menu.id===menuPageMenuId);
  const selectedMenu=browsingAllItems?null:selectedMenus[0];
  const records=selectedMenus.flatMap(menu=>(menu.items||[]).map(item=>({menu,item}))).filter(({menu,item})=>!query||[menu.name,item.name,item.category,item.description,item.recipe].join(' ').toLowerCase().includes(query));
  const uniqueItems=[];
  const seen=new Set();
  records.forEach(record=>{const key=`${record.item.name.toLowerCase()}|${record.item.recipe.toLowerCase()}`;if(!seen.has(key)){seen.add(key);uniqueItems.push(record);}});
  if(summary)summary.innerHTML=`<div class="menu-selected-heading"><button class="btn btn-secondary btn-sm" type="button" onclick="showMenuPagePicker()">← Menus</button><div><span class="detail-eyebrow">${browsingAllItems?'Item library':escapeHtml(menuDepartmentLabel(selectedMenu))}</span><h3>${browsingAllItems?'All Menu Items':escapeHtml(selectedMenu?.name||'Menu')}</h3><p>${browsingAllItems?'Every item from every active menu, together in one searchable view.':escapeHtml(selectedMenu?.description||`${uniqueItems.length} menu items`)}</p></div>${selectedMenu?`<button class="btn btn-primary btn-sm" type="button" onclick="addPageMenuItem('${selectedMenu.id}')">＋ Add Item</button>`:''}</div>`;
  grid.className='menu-page-grid menu-item-row-list';
  if(!uniqueItems.length){grid.innerHTML=`<div class="menu-page-empty"><strong>${query?'No menu items match this search':'No active menu items yet'}</strong><span>${query?'Try a different item, section, or ingredient.':'Create or activate a menu in Manage Menus.'}</span>${query?'':'<button class="btn btn-primary" type="button" onclick="toggleMenuManager()">Manage Menus</button>'}</div>`;return;}
  grid.innerHTML=uniqueItems.map(({menu,item})=>`<button class="menu-item-row" type="button" onclick="openMenuItemView('${item.id}')"><span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml([item.category,browsingAllItems?menu.name:''].filter(Boolean).join(' · ')||menu.name)}</small></span>${item.price?`<b>$${escapeHtml(item.price)}</b>`:''}<span class="menu-item-row-arrow">›</span></button>`).join('');
}

function toggleMenuManager(forceOpen=false){
  const manager=document.getElementById('menu-page-manager');
  if(!manager)return;
  if(!manager.hidden&&!forceOpen){closeMenuManager();return;}
  menuPageEditingMenuId='';
  document.getElementById('menu-page-browser').hidden=true;
  document.getElementById('menu-page-editor').hidden=true;
  manager.hidden=false;
  renderMenuManager();
}

function closeMenuManager(){
  menuPageEditingMenuId='';
  document.getElementById('menu-page-manager').hidden=true;
  document.getElementById('menu-page-editor').hidden=true;
  document.getElementById('menu-page-browser').hidden=false;
  renderMenuPage();
}

function setMenuPageImportStatus(message,error=false){
  const status=document.getElementById('menu-page-import-status');
  if(!status)return;
  status.hidden=!message;status.classList.toggle('error',!!error);status.textContent=message||'';
}

function createMenuFromPage(){
  const nameInput=document.getElementById('menu-page-new-name');
  const descriptionInput=document.getElementById('menu-page-new-description');
  const name=String(nameInput?.value||'').trim();
  if(!name){toast('Enter a menu name.',true);nameInput?.focus();return;}
  if(['all drinks','all menu items'].includes(prepItemKey(name))){toast('That name is reserved for the item library.',true);return;}
  if(state.menus.some(menu=>!menu.archived&&prepItemKey(menu.name)===prepItemKey(name))){toast('A menu with that name already exists.',true);return;}
  const departmentIds=menuPageDepartment==='all'?activeDepartments().map(department=>department.id):[menuPageDepartment];
  const menu={id:uid(),departmentId:departmentIds[0]||'bar',departmentIds,name,description:String(descriptionInput?.value||'').trim(),active:true,archived:false,sourceFile:'',importedAt:'',items:[]};
  state.menus.push(menu);save();
  if(nameInput)nameInput.value='';if(descriptionInput)descriptionInput.value='';
  renderMenuManager();openPageMenuEditor(menu.id);toast(`${name} created.`);
}

function renderMenuManager(){
  const list=document.getElementById('menu-manager-list');if(!list)return;
  const menus=state.menus.filter(menu=>menuInDepartment(menu,menuPageDepartment));
  const active=menus.filter(menu=>!menu.archived);
  const archived=menus.filter(menu=>menu.archived);
  list.innerHTML=`${active.map(menu=>`<div class="menu-manager-row"><button class="menu-manager-row-main" type="button" onclick="openPageMenuEditor('${menu.id}')"><strong>${escapeHtml(menu.name)}</strong><small>${escapeHtml(menuDepartmentLabel(menu))} · ${menu.items.length} item${menu.items.length===1?'':'s'}${menu.description?` · ${escapeHtml(menu.description)}`:''}</small></button><label class="menu-active-toggle"><input type="checkbox" ${menu.active?'checked':''} onchange="setPageMenuActive('${menu.id}',this.checked)"><span>Active</span></label><button class="btn btn-secondary btn-sm" type="button" onclick="openPageMenuEditor('${menu.id}')">Edit</button><button class="btn btn-ghost-danger btn-sm" type="button" onclick="archivePageMenu('${menu.id}',true)">Archive</button></div>`).join('')||'<div class="menu-empty-state"><strong>No menus yet</strong><span>Create or import the first menu above.</span></div>'}${archived.length?`<div class="menu-manager-archived"><h4>Archived</h4>${archived.map(menu=>`<div class="menu-manager-row"><span class="menu-manager-row-main"><strong>${escapeHtml(menu.name)}</strong><small>${menu.items.length} stored item${menu.items.length===1?'':'s'}</small></span><button class="btn btn-secondary btn-sm" type="button" onclick="archivePageMenu('${menu.id}',false)">Restore</button><button class="btn btn-ghost-danger btn-sm" type="button" onclick="deletePageMenu('${menu.id}')">Delete</button></div>`).join('')}</div>`:''}`;
}

function setPageMenuActive(id,active){const menu=getSettingsMenu(id);if(!menu)return;menu.active=!!active;save();renderMenuManager();renderMenuPage();}
function archivePageMenu(id,archived=true){const menu=getSettingsMenu(id);if(!menu)return;menu.archived=!!archived;save();renderMenuManager();renderMenuPage();toast(menu.archived?'Menu archived.':'Menu restored.');}
function deletePageMenu(id){const menu=getSettingsMenu(id);if(!menu||!confirm(`Delete “${menu.name}” and its ${menu.items.length} item${menu.items.length===1?'':'s'}?`))return;state.menus=state.menus.filter(entry=>entry.id!==id);save();renderMenuManager();renderMenuPage();toast('Menu deleted.');}

function menuProductLinkOptions(ingredient={}){
  const selected=ingredient.linkKind==='product'&&ingredient.productId?`product:${ingredient.productId}`:ingredient.prepItemId?`prep:${ingredient.prepItemId}`:'prep';
  const prepOptions=(state.prepItems||[]).filter(item=>!item.archived).sort((a,b)=>a.name.localeCompare(b.name)).map(item=>`<option value="prep:${item.id}" ${selected===`prep:${item.id}`?'selected':''}>${escapeHtml(item.name)}</option>`).join('');
  const editingMenu=getSettingsMenu(menuItemEditingMenuId||menuPageEditingMenuId);
  const allowedDepartments=editingMenu?menuDepartmentIds(editingMenu):(menuPageDepartment==='all'?activeDepartments().map(department=>department.id):[menuPageDepartment]);
  const productOptions=(state.products||[]).filter(product=>!product.archived&&allowedDepartments.some(departmentId=>productInDepartment(product,departmentId))).sort((a,b)=>a.name.localeCompare(b.name)).map(product=>`<option value="product:${product.id}" ${selected===`product:${product.id}`?'selected':''}>${escapeHtml(product.name)}</option>`).join('');
  return`<option value="prep" ${selected==='prep'?'selected':''}>Prep / information — use typed name</option>${prepOptions?`<optgroup label="Existing prep / information items">${prepOptions}</optgroup>`:''}<optgroup label="Counted products">${productOptions}</optgroup>`;
}

function renderPageMenuEditor(focusItemId=''){
  const editor=document.getElementById('menu-page-editor');
  const menu=getSettingsMenu(menuPageEditingMenuId);
  if(!editor||!menu){closeMenuManager();return;}
  editor.hidden=false;
  editor.innerHTML=`<div class="menu-manager-heading"><button class="btn btn-secondary btn-sm" type="button" onclick="closePageMenuEditor()">← Menus</button><div><span class="detail-eyebrow">${escapeHtml(departmentName(menu.departmentId))}</span><h3>Edit ${escapeHtml(menu.name)}</h3><p>Menu details, items, recipes, and ingredient links are managed here.</p></div><button class="detail-close" type="button" aria-label="Close menu editor" onclick="closeMenuManager()">&times;</button></div><div class="menu-page-editor-fields"><label><span>Menu name</span><input type="text" value="${escapeHtml(menu.name)}" onchange="updatePageMenu('${menu.id}','name',this.value)"></label><label><span>Description</span><input type="text" value="${escapeHtml(menu.description)}" onchange="updatePageMenu('${menu.id}','description',this.value)"></label><label class="menu-active-toggle"><input type="checkbox" ${menu.active?'checked':''} onchange="setPageMenuActive('${menu.id}',this.checked)"><span>Active</span></label><button class="btn btn-primary" type="button" onclick="addPageMenuItem('${menu.id}')">＋ Add Menu Item</button></div><div class="menu-page-item-edit-list">${menu.items.length?menu.items.map((item,index)=>{const ingredients=menuRecipeIngredients(item);return`<article class="menu-page-item-editor" data-page-menu-item-id="${item.id}"><div class="menu-page-item-editor-head"><strong>${escapeHtml(item.name)}</strong><div><button class="btn btn-secondary btn-sm" type="button" ${index===0?'disabled':''} onclick="movePageMenuItem('${menu.id}','${item.id}',-1)">↑</button><button class="btn btn-secondary btn-sm" type="button" ${index===menu.items.length-1?'disabled':''} onclick="movePageMenuItem('${menu.id}','${item.id}',1)">↓</button><button class="btn btn-ghost-danger btn-sm" type="button" onclick="deletePageMenuItem('${menu.id}','${item.id}')">Delete</button></div></div><div class="menu-page-item-fields"><label><span>Item name</span><input type="text" value="${escapeHtml(item.name)}" onchange="updatePageMenuItem('${menu.id}','${item.id}','name',this.value)"></label><label><span>Section</span><input type="text" value="${escapeHtml(item.category)}" onchange="updatePageMenuItem('${menu.id}','${item.id}','category',this.value)"></label><label><span>Price</span><input type="text" inputmode="decimal" value="${escapeHtml(item.price)}" onchange="updatePageMenuItem('${menu.id}','${item.id}','price',this.value)"></label><label class="menu-page-wide"><span>Description</span><textarea onchange="updatePageMenuItem('${menu.id}','${item.id}','description',this.value)">${escapeHtml(item.description)}</textarea></label><label class="menu-page-wide"><span>Recipe</span><textarea data-page-recipe-field placeholder="Ingredients:\n3/4 oz Astral Tequila\n1/4 oz Cointreau\n2 oz Margarita Mix\nMethod: Shake and strain" onchange="updatePageMenuItem('${menu.id}','${item.id}','recipe',this.value)">${escapeHtml(item.recipe)}</textarea></label></div>${ingredients.length?`<div class="menu-ingredient-link-editor"><strong>Ingredient links</strong><p>Choose a counted product only when this exact ingredient is part of inventory. Everything else stays a prep/information item.</p>${ingredients.map(entry=>{const explicit=item.ingredientLinks?.[prepItemKey(entry.name)];const selected=explicit?.kind==='product'?explicit.productId:entry.product?.id||'';return`<label><span>${escapeHtml(entry.name)}</span><select onchange="updatePageMenuIngredientLink('${menu.id}','${item.id}',decodeURIComponent('${encodeURIComponent(entry.name)}'),this.value)">${menuProductLinkOptions(selected)}</select></label>`;}).join('')}</div>`:''}</article>`;}).join(''):'<div class="menu-empty-state"><strong>No menu items yet</strong><span>Add the first item to start its recipe.</span></div>'}</div>`;
  if(focusItemId)requestAnimationFrame(()=>editor.querySelector(`[data-page-menu-item-id="${focusItemId}"] [data-page-recipe-field]`)?.focus());
}

function openPageMenuEditor(id,focusItemId=''){const menu=getSettingsMenu(id);if(!menu)return;menuPageEditingMenuId=id;menuPageDepartment=menu.departmentId;document.getElementById('menu-page-browser').hidden=true;document.getElementById('menu-page-manager').hidden=true;renderPageMenuEditor(focusItemId);}
function closePageMenuEditor(){menuPageEditingMenuId='';document.getElementById('menu-page-editor').hidden=true;document.getElementById('menu-page-manager').hidden=false;renderMenuManager();}
function updatePageMenu(id,field,value){const menu=getSettingsMenu(id);if(!menu||!['name','description'].includes(field))return;const next=String(value||'').trim();if(field==='name'&&!next){toast('A menu needs a name.',true);renderPageMenuEditor();return;}if(field==='name'&&['all drinks','all menu items'].includes(prepItemKey(next))){toast('That name is reserved for the item library.',true);renderPageMenuEditor();return;}menu[field]=next;save();renderPageMenuEditor();renderMenuPage();}
function addPageMenuItem(menuId){const menu=getSettingsMenu(menuId);if(!menu)return;const item=normalizeMenuLibraryItem({id:uid(),name:'New menu item'});menu.items.push(item);save();renderPageMenuEditor(item.id);}
function updatePageMenuItem(menuId,itemId,field,value){const item=getSettingsMenu(menuId)?.items.find(entry=>entry.id===itemId);if(!item||!['name','category','description','recipe','price'].includes(field))return;item[field]=String(value||'').trim();if(field==='recipe'){const names=new Set(menuRecipeParts(item).ingredientLines.map(line=>prepItemKey(parsedRecipeIngredient(line).name)));Object.keys(item.ingredientLinks||{}).forEach(key=>{if(!names.has(key))delete item.ingredientLinks[key];});item.linkedProductIds=[...new Set(menuRecipeIngredients(item).filter(entry=>entry.product).map(entry=>entry.product.id))];}save();renderPageMenuEditor(itemId);renderMenuPage();}
function updatePageMenuIngredientLink(menuId,itemId,name,value){const item=getSettingsMenu(menuId)?.items.find(entry=>entry.id===itemId);if(!item)return;if(!item.ingredientLinks)item.ingredientLinks={};const key=prepItemKey(name);if(String(value).startsWith('product:'))item.ingredientLinks[key]={kind:'product',productId:String(value).slice(8),prepItemId:''};else item.ingredientLinks[key]={kind:'prep',productId:'',prepItemId:getPrepItemByName(name)?.id||''};item.linkedProductIds=[...new Set(menuRecipeIngredients(item).filter(entry=>entry.product).map(entry=>entry.product.id))];save();renderPageMenuEditor(itemId);renderMenuPage();}
function movePageMenuItem(menuId,itemId,direction){const menu=getSettingsMenu(menuId);if(!menu)return;const index=menu.items.findIndex(item=>item.id===itemId);const target=index+direction;if(index<0||target<0||target>=menu.items.length)return;[menu.items[index],menu.items[target]]=[menu.items[target],menu.items[index]];save();renderPageMenuEditor(itemId);renderMenuPage();}
function deletePageMenuItem(menuId,itemId){const menu=getSettingsMenu(menuId);if(!menu)return;const item=menu.items.find(entry=>entry.id===itemId);if(!item||!confirm(`Delete “${item.name}” from this menu?`))return;menu.items=menu.items.filter(entry=>entry.id!==itemId);save();renderPageMenuEditor();renderMenuPage();}

// The menu manager edits menu-level details only. Recipe work happens in the
// focused menu-item modal so a user never has to scan every recipe at once.
function renderPageMenuEditor(){
  const editor=document.getElementById('menu-page-editor');
  const menu=getSettingsMenu(menuPageEditingMenuId);
  if(!editor||!menu){closeMenuManager();return;}
  editor.hidden=false;
  const assigned=new Set(menuDepartmentIds(menu));
  editor.innerHTML=`<div class="menu-manager-heading"><button class="btn btn-secondary btn-sm" type="button" onclick="closePageMenuEditor()">← Menus</button><div><span class="detail-eyebrow">${escapeHtml(menuDepartmentLabel(menu))}</span><h3>Menu settings</h3><p>Menus can include drinks, food, or both. Open an item to edit its recipe separately.</p></div><button class="detail-close" type="button" aria-label="Close menu editor" onclick="closeMenuManager()">&times;</button></div><div class="menu-page-editor-fields"><label><span>Menu name</span><input type="text" value="${escapeHtml(menu.name)}" onchange="updatePageMenu('${menu.id}','name',this.value)"></label><label><span>Menu description</span><input type="text" value="${escapeHtml(menu.description)}" onchange="updatePageMenu('${menu.id}','description',this.value)"></label><label class="menu-active-toggle"><input type="checkbox" ${menu.active?'checked':''} onchange="setPageMenuActive('${menu.id}',this.checked)"><span>Active</span></label><button class="btn btn-primary" type="button" onclick="addPageMenuItem('${menu.id}')">＋ Add Item</button></div><div class="menu-department-scope"><span>Visible in departments</span><div>${activeDepartments().map(department=>`<label><input type="checkbox" ${assigned.has(department.id)?'checked':''} onchange="updatePageMenuDepartments('${menu.id}','${department.id}',this.checked)"><strong>${escapeHtml(department.name)}</strong></label>`).join('')}</div><p>Select more than one department for feature menus that combine food and drinks.</p></div><div class="menu-manager-item-list">${menu.items.length?menu.items.map((item,index)=>`<div class="menu-manager-item-row"><button type="button" onclick="openMenuItemView('${item.id}')"><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.category||'Uncategorized')}</small></button><div><button class="btn btn-secondary btn-sm" type="button" ${index===0?'disabled':''} onclick="movePageMenuItem('${menu.id}','${item.id}',-1)">↑</button><button class="btn btn-secondary btn-sm" type="button" ${index===menu.items.length-1?'disabled':''} onclick="movePageMenuItem('${menu.id}','${item.id}',1)">↓</button><button class="btn btn-ghost-danger btn-sm" type="button" onclick="deletePageMenuItem('${menu.id}','${item.id}')">Delete</button></div></div>`).join(''):'<div class="menu-empty-state"><strong>No menu items yet</strong><span>Add the first item to this menu.</span></div>'}</div>`;
}

function updatePageMenuDepartments(id,departmentId,enabled){
  const menu=getSettingsMenu(id);if(!menu||!getDepartment(departmentId))return;
  const ids=new Set(menuDepartmentIds(menu));enabled?ids.add(departmentId):ids.delete(departmentId);
  if(!ids.size){toast('A menu must stay visible in at least one department.',true);renderPageMenuEditor();return;}
  menu.departmentIds=[...ids];menu.departmentId=menu.departmentIds[0];save();renderPageMenuEditor();renderMenuPage();
}
function openPageMenuEditor(id){const menu=getSettingsMenu(id);if(!menu)return;menuPageEditingMenuId=id;if(menuPageDepartment!=='all'&&!menuInDepartment(menu,menuPageDepartment))menuPageDepartment=menuDepartmentIds(menu)[0];document.getElementById('menu-page-browser').hidden=true;document.getElementById('menu-page-manager').hidden=true;renderPageMenuEditor();}
function addPageMenuItem(menuId){const menu=getSettingsMenu(menuId);if(!menu)return;menuItemEditingMenuId=menuId;menuItemEditIsNew=true;menuItemEditDraft=normalizeMenuLibraryItem({id:uid(),name:'New menu item',ingredients:[]});renderMenuItemEditor();openModal('modal-menu-item-view');}
function movePageMenuItem(menuId,itemId,direction){const menu=getSettingsMenu(menuId);if(!menu)return;const index=menu.items.findIndex(item=>item.id===itemId);const target=index+direction;if(index<0||target<0||target>=menu.items.length)return;[menu.items[index],menu.items[target]]=[menu.items[target],menu.items[index]];save();renderPageMenuEditor();renderMenuPage();}
function deletePageMenuItem(menuId,itemId){const menu=getSettingsMenu(menuId);if(!menu)return;const item=menu.items.find(entry=>entry.id===itemId);if(!item||!confirm(`Delete “${item.name}” from this menu?`))return;menu.items=menu.items.filter(entry=>entry.id!==itemId);save();renderPageMenuEditor();renderMenuPage();toast('Menu item deleted.');}

function openMenuItemEditor(menuId,itemId){
  const item=getSettingsMenu(menuId)?.items.find(entry=>entry.id===itemId);if(!item)return;
  menuItemEditingMenuId=menuId;menuItemEditIsNew=false;menuItemEditDraft=JSON.parse(JSON.stringify(normalizeMenuLibraryItem(item)));
  renderMenuItemEditor();openModal('modal-menu-item-view');
}

function renderMenuItemEditor(){
  const item=menuItemEditDraft;const menu=getSettingsMenu(menuItemEditingMenuId);const body=document.getElementById('menu-item-view-body');if(!item||!menu||!body)return;
  body.innerHTML=`<div class="product-view-head"><div><span class="detail-eyebrow">${escapeHtml(menu.name)}</span><h3 id="menu-item-view-title">${menuItemEditIsNew?'Add Menu Item':`Edit ${escapeHtml(item.name)}`}</h3></div><button class="detail-close" type="button" aria-label="Close menu item editor" onclick="cancelMenuItemEditor()">&times;</button></div><div class="menu-item-edit-fields"><label><span>Item name</span><input type="text" value="${escapeHtml(item.name)}" oninput="updateMenuItemDraftField('name',this.value)"></label><label><span>Section</span><input type="text" value="${escapeHtml(item.category)}" oninput="updateMenuItemDraftField('category',this.value)"></label><label><span>Price</span><input type="text" inputmode="decimal" value="${escapeHtml(item.price)}" oninput="updateMenuItemDraftField('price',this.value)"></label></div><div class="menu-item-ingredient-editor"><div class="menu-item-editor-section-head"><div><span class="label">Ingredients &amp; amounts</span><p>Type the menu-facing name and connect it to the exact inventory or prep item.</p></div><button class="btn btn-primary btn-sm" type="button" onclick="addMenuItemDraftIngredient()">＋ Add Ingredient</button></div><div class="menu-item-ingredient-list">${item.ingredients.length?item.ingredients.map((ingredient,index)=>`<div class="menu-item-ingredient-edit-row"><label><span>Amount</span><input type="text" value="${escapeHtml(ingredient.amount)}" placeholder="2 oz" oninput="updateMenuItemDraftIngredient(${index},'amount',this.value)"></label><label><span>Ingredient name</span><input data-menu-ingredient-name type="text" value="${escapeHtml(ingredient.name)}" placeholder="Polar Ice Vodka" oninput="updateMenuItemDraftIngredient(${index},'name',this.value)"></label><label><span>Linked to</span><select onchange="updateMenuItemDraftIngredient(${index},'link',this.value)">${menuProductLinkOptions(ingredient)}</select></label><button class="btn btn-ghost-danger btn-sm" type="button" aria-label="Remove ${escapeHtml(ingredient.name||'ingredient')}" onclick="removeMenuItemDraftIngredient(${index})">Remove</button></div>`).join(''):'<div class="menu-empty-state compact"><strong>No ingredients yet</strong><span>Add each ingredient and its amount separately.</span></div>'}</div></div><div class="menu-item-service-fields"><label class="wide"><span>Description / how to make it</span><textarea placeholder="Explain how to build, shake, strain, or serve this item." oninput="updateMenuItemDraftField('description',this.value)">${escapeHtml(item.description)}</textarea></label><label><span>Glassware</span><input type="text" value="${escapeHtml(item.glassware)}" placeholder="Tall Collins" oninput="updateMenuItemDraftField('glassware',this.value)"></label><label><span>Garnish</span><input type="text" value="${escapeHtml(item.garnish)}" placeholder="Lime wedge" oninput="updateMenuItemDraftField('garnish',this.value)"></label></div><div class="modal-actions">${menuItemEditIsNew?'':`<button class="btn btn-ghost-danger" type="button" onclick="deleteCurrentMenuItem()">Delete Item</button>`}<button class="btn btn-secondary" type="button" onclick="cancelMenuItemEditor()">Cancel</button><button class="btn btn-primary" type="button" onclick="saveMenuItemEditor()">Save Item</button></div>`;
}

function updateMenuItemDraftField(field,value){if(!menuItemEditDraft||!['name','category','price','description','glassware','garnish'].includes(field))return;menuItemEditDraft[field]=String(value||'');}
function addMenuItemDraftIngredient(){if(!menuItemEditDraft)return;menuItemEditDraft.ingredients.push({id:uid(),name:'',amount:'',linkKind:'prep',productId:'',prepItemId:''});renderMenuItemEditor();requestAnimationFrame(()=>document.querySelector('#menu-item-view-body .menu-item-ingredient-edit-row:last-child [data-menu-ingredient-name]')?.focus());}
function removeMenuItemDraftIngredient(index){if(!menuItemEditDraft)return;menuItemEditDraft.ingredients.splice(index,1);renderMenuItemEditor();}
function updateMenuItemDraftIngredient(index,field,value){const ingredient=menuItemEditDraft?.ingredients?.[index];if(!ingredient)return;if(field==='name'||field==='amount'){ingredient[field]=String(value||'');return;}if(field==='link'){if(String(value).startsWith('product:')){ingredient.linkKind='product';ingredient.productId=String(value).slice(8);ingredient.prepItemId='';if(!ingredient.name)ingredient.name=getProduct(ingredient.productId)?.name||'';}else{ingredient.linkKind='prep';ingredient.productId='';ingredient.prepItemId=String(value).startsWith('prep:')?String(value).slice(5):'';if(!ingredient.name&&ingredient.prepItemId)ingredient.name=getPrepItem(ingredient.prepItemId)?.name||'';}renderMenuItemEditor();}}

function cancelMenuItemEditor(){const itemId=menuItemEditDraft?.id;const isNew=menuItemEditIsNew;menuItemEditDraft=null;menuItemEditingMenuId='';menuItemEditIsNew=false;if(isNew)closeModal('modal-menu-item-view');else openMenuItemView(itemId);}
function saveMenuItemEditor(){
  const menu=getSettingsMenu(menuItemEditingMenuId);if(!menu||!menuItemEditDraft)return;
  const name=String(menuItemEditDraft.name||'').trim();if(!name){toast('Item name is required.',true);return;}
  menuItemEditDraft.name=name;menuItemEditDraft.ingredients=(menuItemEditDraft.ingredients||[]).filter(entry=>String(entry.name||'').trim()).map(entry=>({...entry,name:String(entry.name).trim(),amount:String(entry.amount||'').trim()}));
  const saved=normalizeMenuLibraryItem(menuItemEditDraft);const index=menu.items.findIndex(entry=>entry.id===saved.id);
  if(index>=0)menu.items[index]=saved;else menu.items.push(saved);
  menuItemEditDraft=null;menuItemEditingMenuId='';menuItemEditIsNew=false;save();renderMenuPage();if(menuPageEditingMenuId)renderPageMenuEditor();openMenuItemView(saved.id);toast('Menu item saved.');
}
function deleteCurrentMenuItem(){if(!menuItemEditDraft||menuItemEditIsNew)return;const menuId=menuItemEditingMenuId,itemId=menuItemEditDraft.id;menuItemEditDraft=null;menuItemEditingMenuId='';menuItemEditIsNew=false;closeModal('modal-menu-item-view');deletePageMenuItem(menuId,itemId);}

function menuItemVariantEditorHtml(item){
  return`<div class="menu-item-variant-editor"><div class="menu-item-editor-section-head"><div><span class="label">Sizes &amp; glassware</span><p>Each POS size keeps its own glass and exact ingredient measurements.</p></div><button class="btn btn-secondary btn-sm" type="button" onclick="addMenuItemDraftVariant()">＋ Add Size</button></div><div class="menu-item-variant-list">${item.variants.map((variant,index)=>`<div class="menu-item-variant-row"><label><span>Size name</span><input type="text" value="${escapeHtml(variant.name)}" oninput="updateMenuItemDraftVariant(${index},'name',this.value)"></label><label><span>Glassware</span><input type="text" value="${escapeHtml(variant.glassware)}" placeholder="Small Rocks" oninput="updateMenuItemDraftVariant(${index},'glassware',this.value)"></label>${item.variants.length>1?`<button class="btn btn-ghost-danger btn-sm" type="button" onclick="removeMenuItemDraftVariant(${index})">Remove</button>`:''}</div>`).join('')}</div></div>`;
}

function menuItemIngredientEditorHtml(item){
  const columns=`minmax(170px,.8fr) ${item.variants.map(()=>`minmax(92px,.38fr)`).join(' ')} minmax(230px,1fr) auto`;
  return`<div class="menu-item-ingredient-editor"><div class="menu-item-editor-section-head"><div><span class="label">Ingredients &amp; amounts</span><p>Type the displayed ingredient name, enter the exact amount for each size, and connect it to inventory or prep information.</p></div><button class="btn btn-primary btn-sm" type="button" onclick="addMenuItemDraftIngredient()">＋ Add Ingredient</button></div><div class="menu-item-ingredient-list">${item.ingredients.length?item.ingredients.map((ingredient,index)=>`<div class="menu-item-ingredient-edit-row" style="grid-template-columns:${columns}"><label><span>Ingredient name</span><input data-menu-ingredient-name type="text" value="${escapeHtml(ingredient.name)}" placeholder="Polar Ice Vodka" oninput="updateMenuItemDraftIngredient(${index},'name',this.value)"></label>${item.variants.map(variant=>`<label><span>${escapeHtml(variant.name)}</span><input type="text" value="${escapeHtml(ingredient.amounts?.[variant.key]||'')}" placeholder="2 oz" oninput="updateMenuItemDraftIngredient(${index},'amount:${variant.key}',this.value)"></label>`).join('')}<label><span>Linked to</span><select onchange="updateMenuItemDraftIngredient(${index},'link',this.value)">${menuProductLinkOptions(ingredient)}</select></label><button class="btn btn-ghost-danger btn-sm" type="button" aria-label="Remove ${escapeHtml(ingredient.name||'ingredient')}" onclick="removeMenuItemDraftIngredient(${index})">Remove</button></div>`).join(''):'<div class="menu-empty-state compact"><strong>No ingredients yet</strong><span>Add each ingredient and its exact amount.</span></div>'}</div></div>`;
}

function renderMenuItemEditor(){
  const item=menuItemEditDraft;const menu=getSettingsMenu(menuItemEditingMenuId);const body=document.getElementById('menu-item-view-body');if(!item||!menu||!body)return;
  body.innerHTML=`<div class="product-view-head"><div><span class="detail-eyebrow">${escapeHtml(menu.name)}</span><h3 id="menu-item-view-title">${menuItemEditIsNew?'Add Menu Item':`Edit ${escapeHtml(item.name)}`}</h3></div><button class="detail-close" type="button" aria-label="Close menu item editor" onclick="cancelMenuItemEditor()">&times;</button></div><div class="menu-item-edit-fields"><label><span>Item name</span><input type="text" value="${escapeHtml(item.name)}" oninput="updateMenuItemDraftField('name',this.value)"></label><label><span>Section</span><input type="text" value="${escapeHtml(item.category)}" oninput="updateMenuItemDraftField('category',this.value)"></label><label><span>Price</span><input type="text" inputmode="decimal" value="${escapeHtml(item.price)}" oninput="updateMenuItemDraftField('price',this.value)"></label></div>${menuItemVariantEditorHtml(item)}${menuItemIngredientEditorHtml(item)}<div class="menu-item-service-fields"><label><span>Method</span><input list="menu-method-options" value="${escapeHtml(item.method)}" placeholder="Shake &amp; Strain" oninput="updateMenuItemDraftField('method',this.value)"><datalist id="menu-method-options"><option value="Shake & Strain"><option value="Shake & Double Strain"><option value="Shake & Dump"><option value="Shake & Top"><option value="Build in Glass"><option value="Stir & Strain"><option value="Blended"></datalist></label><label><span>Garnish</span><input type="text" value="${escapeHtml(item.garnish)}" placeholder="Dehydrated lime wheel" oninput="updateMenuItemDraftField('garnish',this.value)"></label><label class="wide"><span>Description / how to make it</span><textarea placeholder="Keep the complete preparation and garnish instructions here." oninput="updateMenuItemDraftField('description',this.value)">${escapeHtml(item.description)}</textarea></label></div><div class="modal-actions">${menuItemEditIsNew?'':`<button class="btn btn-ghost-danger" type="button" onclick="deleteCurrentMenuItem()">Delete Item</button>`}<button class="btn btn-secondary" type="button" onclick="cancelMenuItemEditor()">Cancel</button><button class="btn btn-primary" type="button" onclick="saveMenuItemEditor()">Save Item</button></div>`;
}

function updateMenuItemDraftField(field,value){if(!menuItemEditDraft||!['name','category','price','description','method','garnish'].includes(field))return;menuItemEditDraft[field]=String(value||'');}
function addMenuItemDraftVariant(){if(!menuItemEditDraft)return;const variant=normalizeMenuVariant({name:`Size ${menuItemEditDraft.variants.length+1}`},menuItemEditDraft.variants.length);menuItemEditDraft.variants.push(variant);menuItemEditDraft.ingredients.forEach(ingredient=>{if(!ingredient.amounts)ingredient.amounts={};ingredient.amounts[variant.key]='';});renderMenuItemEditor();}
function updateMenuItemDraftVariant(index,field,value){const variant=menuItemEditDraft?.variants?.[index];if(!variant||!['name','glassware'].includes(field))return;variant[field]=String(value||'');}
function removeMenuItemDraftVariant(index){if(!menuItemEditDraft||menuItemEditDraft.variants.length<2)return;const[removed]=menuItemEditDraft.variants.splice(index,1);menuItemEditDraft.ingredients.forEach(ingredient=>{if(ingredient.amounts)delete ingredient.amounts[removed.key];});renderMenuItemEditor();}
function addMenuItemDraftIngredient(){if(!menuItemEditDraft)return;menuItemEditDraft.ingredients.push({id:uid(),name:'',amount:'',amounts:Object.fromEntries(menuItemEditDraft.variants.map(variant=>[variant.key,''])),linkKind:'prep',productId:'',prepItemId:''});renderMenuItemEditor();requestAnimationFrame(()=>document.querySelector('#menu-item-view-body .menu-item-ingredient-edit-row:last-child [data-menu-ingredient-name]')?.focus());}
function updateMenuItemDraftIngredient(index,field,value){const ingredient=menuItemEditDraft?.ingredients?.[index];if(!ingredient)return;if(field==='name'){ingredient.name=String(value||'');return;}if(field.startsWith('amount:')){if(!ingredient.amounts)ingredient.amounts={};ingredient.amounts[field.slice(7)]=String(value||'');return;}if(field==='link'){if(String(value).startsWith('product:')){ingredient.linkKind='product';ingredient.productId=String(value).slice(8);ingredient.prepItemId='';if(!ingredient.name)ingredient.name=getProduct(ingredient.productId)?.name||'';}else{ingredient.linkKind='prep';ingredient.productId='';ingredient.prepItemId=String(value).startsWith('prep:')?String(value).slice(5):'';if(!ingredient.name&&ingredient.prepItemId)ingredient.name=getPrepItem(ingredient.prepItemId)?.name||'';}renderMenuItemEditor();}}

async function handleMenuPageImport(event){
  const input=event.target;const file=input.files?.[0];if(!file)return;
  setMenuPageImportStatus(`Reading ${file.name}…`);
  try{
    const imported=await readMenuImportData(file);
    const items=Array.isArray(imported.items)?imported.items.map(normalizeMenuLibraryItem):menuItemsFromRows(imported.rows);
    if(!items.length)throw new Error('No menu items could be identified in this file.');
    let name=String(imported.name||menuNameFromFile(file.name)).trim();if(['all drinks','all menu items'].includes(prepItemKey(name)))name='Imported Menu';
    const departmentIds=menuPageDepartment==='all'?activeDepartments().map(department=>department.id):[menuPageDepartment];
    const menu={id:uid(),departmentId:departmentIds[0]||'bar',departmentIds,name,description:String(imported.description||'Imported menu — review recipes and ingredient links before activating.').trim(),active:false,archived:false,sourceFile:file.name,importedAt:new Date().toISOString(),items};
    state.menus.push(menu);save();setMenuPageImportStatus(`Imported ${items.length} item${items.length===1?'':'s'} from ${file.name}.`);openPageMenuEditor(menu.id);toast('Menu imported as an inactive draft.');
  }catch(error){setMenuPageImportStatus(error?.message||'The menu could not be imported.',true);toast('Menu import failed.',true);}finally{input.value='';}
}

function openRecipeProduct(id,menuId,itemId){
  closeModal('modal-menu-item-view');
  const product=getProduct(id);
  if(!product)return;
  recipeProductReturn={menuId,itemId,departmentId:menuPageDepartment,menuViewId:menuPageMenuId,variantId:menuItemViewVariantId};
  productDepartmentView=productDepartmentIds(product)[0]||'bar';
  productCatalogView='products';
  showPage('products');
  window.__openingRecipeProduct=true;
  openProductView(id);
  window.__openingRecipeProduct=false;
}

function returnToRecipe(){
  const target=recipeProductReturn;if(!target)return;
  recipeProductReturn=null;
  closeModal('modal-product-view');
  closeModal('modal-prep-item-view');
  menuPageDepartment=target.departmentId||'bar';menuPageMenuId=target.menuViewId||'';
  showPage('menu');
  menuItemViewVariantId=target.variantId||'';openMenuItemView(target.itemId,!!target.variantId);
}

function openPrepItemByName(name){
  if(!window.__openingRecipePrep)recipeProductReturn=null;
  const existing=getPrepItemByName(name);
  const item=existing||{id:uid(),name:String(name||'Prep item').trim()||'Prep item',description:'',prepInstructions:'',notes:'',imageUrls:[],archived:false};
  closeModal('modal-menu-item-view');
  document.getElementById('prep-item-id').value=item.id;
  document.getElementById('prep-item-name').value=item.name;
  document.getElementById('prep-item-description').value=item.description||'';
  document.getElementById('prep-item-instructions').value=item.prepInstructions||'';
  document.getElementById('prep-item-view-title').textContent=item.name;
  const gallery=document.getElementById('prep-item-image-gallery');
  if(gallery){gallery.innerHTML=(item.imageUrls||[]).map((url,index)=>`<img src="${escapeHtml(url)}" alt="${escapeHtml(item.name)}${item.imageUrls.length>1?` - reference ${index+1}`:''}">`).join('');gallery.hidden=!(item.imageUrls||[]).length;}
  const back=document.getElementById('prep-item-back-recipe');if(back)back.hidden=!recipeProductReturn;
  openModal('modal-prep-item-view');
}

function openNewPrepItem(){
  recipeProductReturn=null;
  closeModal('modal-menu-item-view');
  document.getElementById('prep-item-id').value=uid();
  document.getElementById('prep-item-name').value='';
  document.getElementById('prep-item-description').value='';
  document.getElementById('prep-item-instructions').value='';
  const gallery=document.getElementById('prep-item-image-gallery');if(gallery){gallery.innerHTML='';gallery.hidden=true;}
  document.getElementById('prep-item-view-title').textContent='New prep / information item';
  const back=document.getElementById('prep-item-back-recipe');if(back)back.hidden=true;
  openModal('modal-prep-item-view');
  requestAnimationFrame(()=>document.getElementById('prep-item-name')?.focus());
}

function openRecipePrep(name,menuId,itemId){
  recipeProductReturn={menuId,itemId,departmentId:menuPageDepartment,menuViewId:menuPageMenuId,variantId:menuItemViewVariantId};
  window.__openingRecipePrep=true;
  const existing=getPrepItemByName(name);
  if(existing)openPrepItemView(existing.id);
  else openPrepItemByName(name);
  window.__openingRecipePrep=false;
}

function openPrepItemView(id){const item=getPrepItem(id);if(item)openPrepItemByName(item.name);}

function savePrepItem(){
  const id=document.getElementById('prep-item-id').value||uid();
  const name=document.getElementById('prep-item-name').value.trim();
  if(!name){toast('Prep item name is required.',true);return;}
  const existingItem=state.prepItems.find(entry=>entry.id===id);
  const item={id,name,description:document.getElementById('prep-item-description').value.trim(),prepInstructions:document.getElementById('prep-item-instructions').value.trim(),notes:existingItem?.notes||'',imageUrls:existingItem?.imageUrls||[],archived:false};
  const duplicate=state.prepItems.find(entry=>prepItemKey(entry.name)===prepItemKey(name)&&entry.id!==id);
  if(duplicate){item.id=duplicate.id;state.prepItems=state.prepItems.filter(entry=>entry.id!==id&&entry.id!==duplicate.id);}
  const index=state.prepItems.findIndex(entry=>entry.id===item.id);
  if(index>=0)state.prepItems[index]={...state.prepItems[index],...item};else state.prepItems.push(item);
  save();
  document.getElementById('prep-item-id').value=item.id;
  document.getElementById('prep-item-view-title').textContent=item.name;
  toast('Prep information saved. This item remains outside inventory counts.');
  renderMenuPage();
  if(document.getElementById('page-products')?.classList.contains('active'))renderProducts();
  window.openPrepItemView?.(item.id);
}

function editMenuItemRecipe(menuId,itemId){
  openMenuItemEditor(menuId,itemId);
}

function setMenuItemViewVariant(itemId,variantId){menuItemViewVariantId=variantId;openMenuItemView(itemId,true);}
function openMenuItemView(id,preserveVariant=false){
  const record=getMenuItemRecord(id);if(!record)return;
  const{menu,item}=record;const variants=item.variants?.length?item.variants:[normalizeMenuVariant({name:'One Size',glassware:item.glassware})];
  if(!preserveVariant||!variants.some(variant=>variant.id===menuItemViewVariantId))menuItemViewVariantId=variants[0].id;
  const activeVariant=variants.find(variant=>variant.id===menuItemViewVariantId)||variants[0];const ingredients=menuRecipeIngredients(item);
  const body=document.getElementById('menu-item-view-body');
  body.innerHTML=`<div class="product-view-head"><div><span class="detail-eyebrow">${escapeHtml(menu.name)}</span><h3 id="menu-item-view-title">${escapeHtml(item.name)}</h3><div class="product-view-meta"><span class="sub-badge">${escapeHtml(item.category||'Uncategorized')}</span>${item.price?`<span class="sub-badge">$${escapeHtml(item.price)}</span>`:''}${item.method?`<span class="sub-badge">${escapeHtml(item.method)}</span>`:''}</div></div><div class="detail-heading-actions"><button class="btn btn-secondary btn-sm" type="button" onclick="editMenuItemRecipe('${menu.id}','${item.id}')">Edit Item</button><button class="detail-close" type="button" aria-label="Close menu item" onclick="closeModal('modal-menu-item-view')">&times;</button></div></div>${item.imageUrl?`<div class="menu-item-hero-image"><img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name)}"></div>`:''}${variants.length>1?`<div class="menu-size-switch" role="group" aria-label="Recipe size">${variants.map(variant=>`<button class="${variant.id===activeVariant.id?'active':''}" type="button" onclick="setMenuItemViewVariant('${item.id}','${variant.id}')">${escapeHtml(variant.name)}</button>`).join('')}</div>`:''}<div class="product-view-section"><div class="label">Ingredients - ${escapeHtml(activeVariant.name)}</div><div class="menu-recipe-list">${ingredients.length?ingredients.map(entry=>{const encoded=encodeURIComponent(entry.name);return`<div class="menu-recipe-row"><div class="menu-recipe-main">${entry.amount?`<span class="menu-recipe-amount">${escapeHtml(entry.amount)}</span>`:''}${entry.product?`<button class="menu-recipe-link" type="button" onclick="openRecipeProduct('${entry.product.id}','${menu.id}','${item.id}')">${escapeHtml(entry.name)}</button>`:`<button class="menu-recipe-link" type="button" onclick="openRecipePrep(decodeURIComponent('${encoded}'),'${menu.id}','${item.id}')">${escapeHtml(entry.name)}</button>`}</div></div>`;}).join(''):'<p class="menu-method-copy">No ingredients have been added yet.</p>'}</div></div>${item.description?`<div class="product-view-section"><div class="label">How to make it</div><p class="menu-method-copy">${escapeHtml(item.description)}</p></div>`:''}<div class="menu-service-summary">${activeVariant.glassware?`<div><span>Glassware</span><strong>${escapeHtml(activeVariant.glassware)}</strong></div>`:''}${item.garnish?`<div><span>Garnish</span><strong>${escapeHtml(item.garnish)}</strong></div>`:''}</div><div class="modal-actions"><button class="btn btn-secondary" type="button" onclick="closeModal('modal-menu-item-view')">Close</button></div>`;
  openModal('modal-menu-item-view');
}

function addSettingsMenu(){
  const input=document.getElementById('settings-menu-name');
  const name=String(input?.value||'').trim();
  if(!name){toast('Enter a menu name.',true);input?.focus();return;}
  const menu={id:uid(),departmentId:settingsProductMenuWorkspace,name,description:'',active:true,archived:false,sourceFile:'',importedAt:'',items:[]};
  state.menus.push(menu);
  selectedSettingsMenuId=menu.id;
  settingsMenuEditMode=true;
  settingsMenuEditSnapshot=JSON.parse(JSON.stringify(menu));
  if(input)input.value='';
  save();
  renderProductMenuSettings();
  refreshProductCatalogIfVisible();
  toast(`${name} created.`);
}

function selectSettingsMenu(id){
  const menu=getSettingsMenu(id);
  selectedSettingsMenuId=menu?.departmentId===settingsProductMenuWorkspace?menu.id:null;
  settingsMenuEditMode=false;
  settingsMenuEditSnapshot=null;
  renderProductMenuSettings();
  document.getElementById('settings-menu-editor')?.scrollIntoView({behavior:'smooth',block:'start'});
}

function closeSettingsMenuEditor(){selectedSettingsMenuId=null;settingsMenuEditMode=false;settingsMenuEditSnapshot=null;renderProductMenuSettings();}

function setSettingsMenuEditMode(editing){
  if(editing){
    const menu=getSettingsMenu(selectedSettingsMenuId);
    settingsMenuEditSnapshot=menu?JSON.parse(JSON.stringify(menu)):null;
    settingsMenuEditMode=!!menu;
  }else{
    settingsMenuEditMode=false;
    settingsMenuEditSnapshot=null;
  }
  renderProductMenuSettings();
}

function cancelSettingsMenuEdit(){
  const snapshot=settingsMenuEditSnapshot;
  if(snapshot){
    const index=state.menus.findIndex(menu=>menu.id===snapshot.id);
    if(index>=0)state.menus[index]=JSON.parse(JSON.stringify(snapshot));
  }
  settingsMenuEditMode=false;
  settingsMenuEditSnapshot=null;
  save();
  renderProductMenuSettings();
  refreshProductCatalogIfVisible();
  toast('Menu changes cancelled.');
}

function updateSettingsMenu(id,field,value){
  const menu=getSettingsMenu(id);
  if(!menu||!['name','description'].includes(field))return;
  const next=String(value||'').trim();
  if(field==='name'&&!next){toast('A menu needs a name.',true);renderProductMenuSettings();return;}
  menu[field]=next;
  save();
  renderProductMenuSettings();
  refreshProductCatalogIfVisible();
  toast('Menu updated.');
}

function toggleSettingsMenuActive(id,active){
  const menu=getSettingsMenu(id);
  if(!menu)return;
  menu.active=!!active;
  save();
  refreshProductCatalogIfVisible();
  renderProductMenuSettings();
  toast(menu.active?'Menu activated.':'Menu deactivated.');
}

function archiveSettingsMenu(id,archived=true){
  const menu=getSettingsMenu(id);
  if(!menu)return;
  menu.archived=!!archived;
  if(selectedSettingsMenuId===id){selectedSettingsMenuId=null;settingsMenuEditMode=false;settingsMenuEditSnapshot=null;}
  save();
  renderProductMenuSettings();
  refreshProductCatalogIfVisible();
  toast(menu.archived?'Menu archived.':'Menu restored.');
}

function beginSettingsMenuDrag(event,id){
  draggedSettingsMenuId=id;
  event.dataTransfer.effectAllowed='move';
  event.dataTransfer.setData('text/plain',id);
  event.currentTarget.classList.add('is-dragging');
}

function dropSettingsMenu(event,targetId){
  event.preventDefault();
  const draggedId=draggedSettingsMenuId||event.dataTransfer.getData('text/plain');
  const bounds=event.currentTarget.getBoundingClientRect();
  reorderSettingsMenu(draggedId,targetId,event.clientY>bounds.top+bounds.height/2);
  draggedSettingsMenuId=null;
}

function reorderSettingsMenu(draggedId,targetId,after=false){
  if(!draggedId||draggedId===targetId)return;
  const dragged=getSettingsMenu(draggedId);
  const target=getSettingsMenu(targetId);
  if(!dragged||!target||dragged.departmentId!==target.departmentId)return;
  const from=state.menus.findIndex(menu=>menu.id===draggedId);
  let to=state.menus.findIndex(menu=>menu.id===targetId);
  const [menu]=state.menus.splice(from,1);
  if(from<to)to--;
  if(after)to++;
  state.menus.splice(to,0,menu);
  save();renderProductMenuSettings();refreshProductCatalogIfVisible();
}

function endSettingsMenuDrag(event){draggedSettingsMenuId=null;event.currentTarget.classList.remove('is-dragging');}

function beginSettingsMenuPointerDrag(event,id){
  if(event.button!==0)return;
  draggedSettingsMenuId=id;
  settingsMenuPointerTargetId=id;
  settingsMenuPointerAfter=false;
  event.currentTarget.setPointerCapture?.(event.pointerId);
  event.currentTarget.closest('.menu-overview-card')?.classList.add('is-dragging');
  document.addEventListener('pointermove',moveSettingsMenuPointerDrag,{passive:false});
  document.addEventListener('pointerup',endSettingsMenuPointerDrag,{once:true});
}

function moveSettingsMenuPointerDrag(event){
  if(!draggedSettingsMenuId)return;
  event.preventDefault();
  const row=document.elementFromPoint(event.clientX,event.clientY)?.closest('.menu-overview-card');
  if(!row||!row.dataset.menuId||row.dataset.menuId===draggedSettingsMenuId)return;
  document.querySelectorAll('.menu-overview-card.drag-target').forEach(item=>item.classList.remove('drag-target','drop-after'));
  const bounds=row.getBoundingClientRect();
  settingsMenuPointerTargetId=row.dataset.menuId;
  settingsMenuPointerAfter=event.clientY>bounds.top+bounds.height/2;
  row.classList.add('drag-target');
  row.classList.toggle('drop-after',settingsMenuPointerAfter);
}

function endSettingsMenuPointerDrag(){
  document.removeEventListener('pointermove',moveSettingsMenuPointerDrag);
  document.querySelectorAll('.menu-overview-card').forEach(item=>item.classList.remove('is-dragging','drag-target','drop-after'));
  const draggedId=draggedSettingsMenuId;
  const targetId=settingsMenuPointerTargetId;
  const after=settingsMenuPointerAfter;
  draggedSettingsMenuId=null;settingsMenuPointerTargetId=null;settingsMenuPointerAfter=false;
  reorderSettingsMenu(draggedId,targetId,after);
}

function moveSettingsMenu(id,direction){
  ensureMenuLibrary();
  const menu=getSettingsMenu(id);
  if(!menu)return;
  const departmentMenus=state.menus.filter(entry=>entry.departmentId===menu.departmentId);
  const departmentIndex=departmentMenus.findIndex(entry=>entry.id===id);
  const targetMenu=departmentMenus[departmentIndex+direction];
  if(departmentIndex<0||!targetMenu)return;
  const index=state.menus.findIndex(entry=>entry.id===id);
  const target=state.menus.findIndex(entry=>entry.id===targetMenu.id);
  [state.menus[index],state.menus[target]]=[state.menus[target],state.menus[index]];
  save();
  renderProductMenuSettings();
  refreshProductCatalogIfVisible();
}

function deleteSettingsMenu(id){
  const menu=getSettingsMenu(id);
  if(!menu||!confirm(`Delete “${menu.name}” and its ${menu.items.length} item${menu.items.length===1?'':'s'}?`))return;
  state.menus=state.menus.filter(entry=>entry.id!==id);
  if(selectedSettingsMenuId===id){selectedSettingsMenuId=null;settingsMenuEditMode=false;settingsMenuEditSnapshot=null;}
  save();
  renderProductMenuSettings();
  refreshProductCatalogIfVisible();
  toast('Menu deleted.');
}

function menuCatalogOptions(){
  const drinks=settingsProductMenuWorkspace==='bar'?(state.drinks||[]).filter(item=>!item.archived).sort((a,b)=>a.name.localeCompare(b.name)):[];
  const products=(state.products||[]).filter(item=>!item.archived&&productInDepartment(item,settingsProductMenuWorkspace)).sort((a,b)=>a.name.localeCompare(b.name));
  return`<option value="">Choose a drink or product…</option>
    ${drinks.length?`<optgroup label="Drinks">${drinks.map(item=>`<option value="drink:${item.id}">${escapeHtml(item.name)}</option>`).join('')}</optgroup>`:''}
    <optgroup label="Products">${products.map(item=>`<option value="product:${item.id}">${escapeHtml(item.name)}</option>`).join('')}</optgroup>`;
}

function recipeFromCatalogDrink(drink){
  const sections=[];
  if((drink.ingredients||[]).length)sections.push(`Ingredients:\n${drink.ingredients.map(item=>`• ${item}`).join('\n')}`);
  if(drink.method)sections.push(`Method: ${drink.method}`);
  if(drink.glassware)sections.push(`Glassware: ${drink.glassware}`);
  return sections.join('\n');
}

function addCatalogItemToSettingsMenu(){
  const menu=getSettingsMenu(selectedSettingsMenuId);
  const select=document.getElementById('settings-menu-catalog-add');
  if(!menu||!select?.value){toast('Choose a drink or product first.',true);return;}
  const [kind,id]=select.value.split(':');
  const source=kind==='drink'?(state.drinks||[]).find(item=>item.id===id):getProduct(id);
  if(!source)return;
  const item=normalizeMenuLibraryItem({
    id:uid(),
    name:source.name,
    category:kind==='drink'?(source.family||'Drink'):(source.category||'Product'),
    description:kind==='drink'?'':(source.subcategory||''),
    recipe:kind==='drink'?recipeFromCatalogDrink(source):'',
    source:`catalog-${kind}`
  },menu.items.length);
  item.linkedProductIds=menuItemProductMatches(item,menu.departmentId).map(product=>product.id);
  menu.items.push(item);
  save();
  renderProductMenuSettings();
  toast(`${source.name} added as an independent menu item.`);
}

function addBlankSettingsMenuItem(){
  const menu=getSettingsMenu(selectedSettingsMenuId);
  if(!menu)return;
  const item=normalizeMenuLibraryItem({id:uid(),name:'New menu item'},menu.items.length);
  menu.items.push(item);
  save();
  renderProductMenuSettings();
  document.querySelector(`[data-menu-item-id="${item.id}"] input[data-menu-item-field="name"]`)?.select();
}

function updateSettingsMenuItem(menuId,itemId,field,value){
  const menu=getSettingsMenu(menuId);
  const item=menu?.items.find(entry=>entry.id===itemId);
  if(!item||!['name','category','description','recipe','price'].includes(field))return;
  item[field]=String(value||'').trim();
  if(field==='recipe')item.linkedProductIds=menuItemProductMatches(item,menu.departmentId).map(product=>product.id);
  save();
}

function moveSettingsMenuItem(menuId,itemId,direction){
  const menu=getSettingsMenu(menuId);
  if(!menu)return;
  const index=menu.items.findIndex(item=>item.id===itemId);
  const target=index+direction;
  if(index<0||target<0||target>=menu.items.length)return;
  [menu.items[index],menu.items[target]]=[menu.items[target],menu.items[index]];
  save();
  renderProductMenuSettings();
}

function deleteSettingsMenuItem(menuId,itemId){
  const menu=getSettingsMenu(menuId);
  if(!menu)return;
  menu.items=menu.items.filter(item=>item.id!==itemId);
  save();
  renderProductMenuSettings();
  toast('Menu item removed.');
}

function renderSettingsMenuEditor(menu){
  const editor=document.getElementById('settings-menu-editor');
  const overview=document.getElementById('settings-menu-overview');
  if(!editor||!overview)return;
  if(!menu){overview.hidden=false;editor.hidden=true;editor.innerHTML='';return;}
  overview.hidden=true;
  editor.hidden=false;
  if(!settingsMenuEditMode){
    editor.innerHTML=`
      <div class="menu-editor-heading">
        <button class="btn btn-secondary btn-sm mobile-back-button" type="button" onclick="closeSettingsMenuEditor()" aria-label="Back to menus" title="Back to menus"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg><span>Menus</span></button>
        <div><h3>${escapeHtml(menu.name)}</h3><p>${escapeHtml(departmentName(menu.departmentId))} menu · ${menu.active?'Active':'Inactive'} · ${menu.items.length} item${menu.items.length===1?'':'s'}</p></div>
        <button class="btn btn-secondary" type="button" onclick="setSettingsMenuEditMode(true)">Edit</button>
      </div>
      ${menu.description?`<p class="menu-view-description">${escapeHtml(menu.description)}</p>`:''}
      <div class="menu-view-item-list">${menu.items.length?menu.items.map(item=>{const linked=menuItemLinkedProducts(item);return`<article class="menu-view-item"><div><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.category||'Uncategorized')}${item.price?` · $${escapeHtml(item.price)}`:''}</span></div>${item.description?`<p>${escapeHtml(item.description)}</p>`:''}${item.recipe?`<pre>${escapeHtml(item.recipe)}</pre>`:''}${linked.length?`<div class="menu-item-product-links"><span>Inventory:</span>${linked.map(product=>productNameLink(product)).join(' ')}</div>`:''}</article>`;}).join(''):'<div class="menu-empty-state"><strong>No menu items yet</strong><span>Choose Edit to add the first item.</span></div>'}</div>`;
    return;
  }
  editor.innerHTML=`
    <div class="menu-editor-heading">
      <button class="btn btn-secondary btn-sm mobile-back-button" type="button" onclick="cancelSettingsMenuEdit()" aria-label="Cancel menu editing" title="Cancel menu editing"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg><span>Cancel</span></button>
      <div><h3>Edit ${escapeHtml(menu.name)}</h3><p>${escapeHtml(departmentName(menu.departmentId))} menu</p></div>
      <div class="editor-completion-actions"><button class="btn btn-secondary" type="button" onclick="cancelSettingsMenuEdit()">Cancel</button><button class="btn btn-primary" type="button" onclick="setSettingsMenuEditMode(false)">Done</button></div>
    </div>
    <div class="menu-edit-status"><label class="menu-active-toggle"><input type="checkbox" ${menu.active?'checked':''} onchange="toggleSettingsMenuActive('${menu.id}',this.checked)"><span>Active on Menu page</span></label><button class="btn btn-ghost-danger btn-sm" type="button" onclick="archiveSettingsMenu('${menu.id}',true)">Archive menu</button></div>
    <div class="menu-editor-fields">
      <label><span>Menu name</span><input type="text" value="${escapeHtml(menu.name)}" onchange="updateSettingsMenu('${menu.id}','name',this.value)"></label>
      <label><span>Description</span><input type="text" value="${escapeHtml(menu.description)}" placeholder="Season, location, or notes" onchange="updateSettingsMenu('${menu.id}','description',this.value)"></label>
    </div>
    <div class="menu-item-toolbar">
      <select id="settings-menu-catalog-add" aria-label="Choose a catalog item">${menuCatalogOptions()}</select>
      <button class="btn btn-primary btn-sm" type="button" onclick="addCatalogItemToSettingsMenu()">＋ Add Selected</button>
      <button class="btn btn-secondary btn-sm" type="button" onclick="addBlankSettingsMenuItem()">＋ Blank Item</button>
    </div>
    <div class="menu-item-settings-list">
      ${menu.items.length?menu.items.map((item,index)=>`<div class="menu-item-setting-row" data-menu-item-id="${item.id}">
        <div class="menu-item-order"><span aria-hidden="true">⋮⋮</span><button type="button" title="Move up" ${index===0?'disabled':''} onclick="moveSettingsMenuItem('${menu.id}','${item.id}',-1)">↑</button><button type="button" title="Move down" ${index===menu.items.length-1?'disabled':''} onclick="moveSettingsMenuItem('${menu.id}','${item.id}',1)">↓</button></div>
        <div class="menu-item-fields">
          <input type="text" data-menu-item-field="name" aria-label="Menu item name" value="${escapeHtml(item.name)}" placeholder="Drink or item name" onchange="updateSettingsMenuItem('${menu.id}','${item.id}','name',this.value)">
          <input type="text" data-menu-item-field="category" aria-label="Menu item category" value="${escapeHtml(item.category)}" placeholder="Category or section" onchange="updateSettingsMenuItem('${menu.id}','${item.id}','category',this.value)">
          <textarea data-menu-item-field="description" aria-label="Menu item description" placeholder="Guest-facing description" onchange="updateSettingsMenuItem('${menu.id}','${item.id}','description',this.value)">${escapeHtml(item.description)}</textarea>
          <textarea data-menu-item-field="recipe" aria-label="Menu item recipe" placeholder="Ingredients, quantities, method, and glassware" onchange="updateSettingsMenuItem('${menu.id}','${item.id}','recipe',this.value)">${escapeHtml(item.recipe)}</textarea>
          <label class="menu-price-field"><span>$</span><input type="text" inputmode="decimal" data-menu-item-field="price" aria-label="Menu item price" value="${escapeHtml(item.price)}" placeholder="Price" onchange="updateSettingsMenuItem('${menu.id}','${item.id}','price',this.value)"></label>
        </div>
        <button class="btn btn-ghost-danger btn-sm menu-item-delete" type="button" onclick="deleteSettingsMenuItem('${menu.id}','${item.id}')">Delete</button>
      </div>`).join(''):'<div class="menu-empty-state"><strong>No menu items yet</strong><span>Add from the drink/product catalog, create a blank item, or import a file.</span></div>'}
    </div>`;
}

function renderProductMenuSettings(){
  const list=document.getElementById('settings-menu-list');
  const archivedList=document.getElementById('settings-archived-menus');
  if(!list||!archivedList)return;
  ensureMenuLibrary();
  if(!getDepartment(settingsProductMenuWorkspace)||getDepartment(settingsProductMenuWorkspace).archived)settingsProductMenuWorkspace=activeDepartments()[0]?.id||'bar';
  const department=getDepartment(settingsProductMenuWorkspace);
  const departmentMenus=state.menus.filter(menu=>menu.departmentId===settingsProductMenuWorkspace&&!menu.archived);
  const archivedMenus=state.menus.filter(menu=>menu.departmentId===settingsProductMenuWorkspace&&menu.archived);
  const tabs=document.getElementById('settings-menu-department-tabs');
  if(tabs)tabs.innerHTML=activeDepartments().map(item=>`<button type="button" class="${item.id===settingsProductMenuWorkspace?'active':''}" data-menu-department="${escapeHtml(item.id)}" onclick="setSettingsMenuDepartment(this.dataset.menuDepartment)">${escapeHtml(item.name)}</button>`).join('');
  const selectedMenu=getSettingsMenu(selectedSettingsMenuId);
  if(selectedSettingsMenuId&&(selectedMenu?.departmentId!==settingsProductMenuWorkspace||selectedMenu.archived)){selectedSettingsMenuId=null;settingsMenuEditMode=false;settingsMenuEditSnapshot=null;}
  list.innerHTML=departmentMenus.length?departmentMenus.map(menu=>`<div class="menu-overview-card ${menu.active?'':'is-inactive'}" data-menu-id="${escapeHtml(menu.id)}" role="button" tabindex="0" draggable="true" onclick="if(!event.target.closest('.menu-setting-drag'))selectSettingsMenu(this.dataset.menuId)" onkeydown="if((event.key==='Enter'||event.key===' ')&&!event.target.closest('.menu-setting-drag')){event.preventDefault();selectSettingsMenu(this.dataset.menuId)}" ondragstart="beginSettingsMenuDrag(event,this.dataset.menuId)" ondragover="event.preventDefault()" ondrop="dropSettingsMenu(event,this.dataset.menuId)" ondragend="endSettingsMenuDrag(event)">
    <span class="menu-setting-drag" aria-label="Drag to reorder" title="Hold and drag to reorder" onpointerdown="beginSettingsMenuPointerDrag(event,this.closest('.menu-overview-card').dataset.menuId)">⋮⋮</span>
    <span class="menu-setting-main"><strong>${escapeHtml(menu.name)}</strong><small>${menu.items.length} item${menu.items.length===1?'':'s'}${menu.sourceFile?` · Imported from ${escapeHtml(menu.sourceFile)}`:''}</small></span>
    <span class="menu-status-badge ${menu.active?'':'inactive'}">${menu.active?'Active':'Inactive'}</span><span class="menu-card-arrow" aria-hidden="true">›</span>
  </div>`).join(''):`<div class="menu-empty-state"><strong>No ${escapeHtml(department?.name||'department')} menus yet</strong><span>Create a menu from scratch or import an existing menu file.</span></div>`;
  archivedList.hidden=!archivedMenus.length;
  archivedList.innerHTML=archivedMenus.length?`<h4>Archived menus</h4>${archivedMenus.map(menu=>`<div class="archived-settings-row"><span><strong>${escapeHtml(menu.name)}</strong><small>${menu.items.length} stored item${menu.items.length===1?'':'s'}</small></span><button class="btn btn-secondary btn-sm" type="button" onclick="archiveSettingsMenu('${menu.id}',false)">Restore</button></div>`).join('')}`:'';
  renderSettingsMenuEditor(getSettingsMenu(selectedSettingsMenuId));
}

function setSettingsMenuDepartment(departmentId){
  if(!getDepartment(departmentId)||getDepartment(departmentId).archived)return;
  settingsProductMenuWorkspace=departmentId;
  selectedSettingsMenuId=null;
  settingsMenuEditMode=false;
  settingsMenuEditSnapshot=null;
  setMenuImportStatus('');
  renderProductMenuSettings();
}

function setMenuImportStatus(message,error=false){
  const status=document.getElementById('settings-menu-import-status');
  if(!status)return;
  status.hidden=!message;
  status.classList.toggle('error',!!error);
  status.textContent=message||'';
}

function menuNameFromFile(fileName){
  const name=String(fileName||'Imported Menu').replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim();
  return name||'Imported Menu';
}

function textRowsForMenu(text){
  return String(text||'').split(/\r?\n/).map(line=>line.trim()).filter(Boolean).map(line=>[line]);
}

async function ocrMenuImage(image){
  if(typeof Tesseract==='undefined')throw new Error('The image reader did not load. Refresh and try again.');
  const result=await Tesseract.recognize(image,'eng',{logger:event=>{
    if(event.status==='recognizing text')setMenuImportStatus(`Scanning menu… ${Math.round((event.progress||0)*100)}%`);
  }});
  return textRowsForMenu(result?.data?.text||'');
}

async function readMenuPdfRows(file){
  try{
    return await readUsagePdfRows(await file.arrayBuffer());
  }catch(readError){
    const pdfjs=window.pdfjsLib;
    if(!pdfjs||typeof Tesseract==='undefined')throw readError;
    setMenuImportStatus('This PDF looks scanned. Running text recognition…');
    if(pdfjs.GlobalWorkerOptions&&!pdfjs.GlobalWorkerOptions.workerSrc)pdfjs.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
    const doc=await pdfjs.getDocument({data:await file.arrayBuffer()}).promise;
    const rows=[];
    for(let pageNumber=1;pageNumber<=doc.numPages;pageNumber++){
      setMenuImportStatus(`Scanning PDF page ${pageNumber} of ${doc.numPages}…`);
      const page=await doc.getPage(pageNumber);
      const viewport=page.getViewport({scale:1.6});
      const canvas=document.createElement('canvas');
      canvas.width=Math.ceil(viewport.width);
      canvas.height=Math.ceil(viewport.height);
      await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
      rows.push(...await ocrMenuImage(canvas));
    }
    return rows;
  }
}

async function readMenuImportData(file){
  const lowerName=String(file.name||'').toLowerCase();
  if(file.type==='application/json'||lowerName.endsWith('.json')){
    const parsed=JSON.parse(await file.text());
    if(Array.isArray(parsed))return{items:parsed};
    if(Array.isArray(parsed?.items))return{name:parsed.name,description:parsed.description,items:parsed.items};
    throw new Error('The JSON file needs an items array.');
  }
  if(file.type.startsWith('image/'))return{rows:await ocrMenuImage(file)};
  if(file.type==='application/pdf'||lowerName.endsWith('.pdf'))return{rows:await readMenuPdfRows(file)};
  if(file.type.startsWith('text/')||lowerName.endsWith('.txt'))return{rows:textRowsForMenu(await file.text())};
  return{rows:readUsageSpreadsheetRows(await file.arrayBuffer())};
}

function menuHeaderKey(value){
  const text=String(value||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ');
  if(/^(menu )?(item|item name|drink|drink name|name|title|product)$/.test(text))return'name';
  if(/recipe|ingredient|preparation|method|build/.test(text))return'recipe';
  if(/description|detail|note/.test(text))return'description';
  if(/price|cost/.test(text))return'price';
  if(/category|section|type|course|group/.test(text))return'category';
  return'';
}

function menuPriceValue(value){
  const match=String(value||'').trim().match(/(?:\$|CAD\s*)?(\d+(?:\.\d{1,2})?)\s*$/i);
  return match?match[1]:'';
}

function menuItemsFromRows(rawRows){
  const rows=(Array.isArray(rawRows)?rawRows:[]).map(row=>(Array.isArray(row)?row:[row]).map(cell=>String(cell??'').replace(/\s+/g,' ').trim()).filter(Boolean)).filter(row=>row.length);
  if(!rows.length)return[];
  let headerIndex=-1;
  let columns={};
  rows.slice(0,12).some((row,index)=>{
    const mapped=row.map(menuHeaderKey);
    if(mapped.includes('name')&&mapped.filter(Boolean).length>=2){
      headerIndex=index;
      mapped.forEach((key,column)=>{if(key&&columns[key]===undefined)columns[key]=column;});
      return true;
    }
    return false;
  });

  const items=[];
  if(headerIndex>=0){
    rows.slice(headerIndex+1).forEach(row=>{
      const name=String(row[columns.name]||'').trim();
      if(!name)return;
      const recipeParts=[];
      if(columns.recipe!==undefined&&row[columns.recipe])recipeParts.push(row[columns.recipe]);
      row.forEach((value,index)=>{
        if(!value||Object.values(columns).includes(index))return;
        if(/ingredients?|method|glassware/i.test(value))recipeParts.push(value);
      });
      items.push(normalizeMenuLibraryItem({
        name,
        category:columns.category!==undefined?row[columns.category]:'',
        description:columns.description!==undefined?row[columns.description]:'',
        recipe:recipeParts.join('\n'),
        price:columns.price!==undefined?menuPriceValue(row[columns.price]):'',
        source:'import'
      },items.length));
    });
    return items;
  }

  rows.forEach(row=>{
    const cells=[...row];
    let price='';
    const finalCell=cells.at(-1)||'';
    const parsedPrice=menuPriceValue(finalCell);
    if(parsedPrice&&(cells.length>1||/[\$]|\d+\.\d{2}\s*$/.test(finalCell))){
      price=parsedPrice;
      cells[cells.length-1]=finalCell.replace(/(?:\$|CAD\s*)?\d+(?:\.\d{1,2})?\s*$/i,'').trim();
      if(!cells.at(-1))cells.pop();
    }
    const clean=cells.filter(Boolean);
    if(!clean.length)return;
    if(clean.length===1){
      const line=clean[0];
      const looksLikeRecipe=items.length>0&&(/^[•·\-*]/.test(line)||/^(ingredients?|method|glassware|preparation)\s*:/i.test(line)||line.includes(',')||/^\d+(?:\.\d+)?\s*(oz|ml|cl|dash|drop|tsp|tbsp)\b/i.test(line));
      if(looksLikeRecipe){
        items.at(-1).recipe=[items.at(-1).recipe,line].filter(Boolean).join('\n');
        return;
      }
      const split=line.split(/\s+(?:—|–|\||-{2,})\s+/).map(part=>part.trim()).filter(Boolean);
      items.push(normalizeMenuLibraryItem({name:split[0],description:split.slice(1).join(' '),price,source:'import'},items.length));
      return;
    }
    items.push(normalizeMenuLibraryItem({name:clean[0],description:clean.slice(1).join(' · '),price,source:'import'},items.length));
  });
  return items;
}

async function handleMenuImport(event){
  const input=event.target;
  const file=input.files?.[0];
  if(!file)return;
  setMenuImportStatus(`Reading ${file.name}…`);
  try{
    const imported=await readMenuImportData(file);
    const items=(Array.isArray(imported.items)?imported.items.map(normalizeMenuLibraryItem):menuItemsFromRows(imported.rows)).map(item=>{
      item.linkedProductIds=menuItemProductMatches(item,settingsProductMenuWorkspace).map(product=>product.id);
      return item;
    });
    if(!items.length)throw new Error('No menu items could be identified in this file.');
    const menu={
      id:uid(),
      departmentId:settingsProductMenuWorkspace,
      name:String(imported.name||menuNameFromFile(file.name)).trim(),
      description:String(imported.description||'Imported menu — review item names, prices, and recipes before activating.').trim(),
      active:false,
      archived:false,
      sourceFile:file.name,
      importedAt:new Date().toISOString(),
      items
    };
    state.menus.push(menu);
    selectedSettingsMenuId=menu.id;
    settingsMenuEditMode=true;
    settingsMenuEditSnapshot=JSON.parse(JSON.stringify(menu));
    save();
    renderProductMenuSettings();
    setMenuImportStatus(`Imported ${items.length} item${items.length===1?'':'s'} from ${file.name}. Review the draft below, then activate it when ready.`);
    toast('Menu imported as an inactive draft.');
  }catch(error){
    setMenuImportStatus(error?.message||'The menu could not be imported.',true);
    toast('Menu import failed.',true);
  }finally{
    input.value='';
  }
}

function renderDepartmentSettings(){
  const list=document.getElementById('settings-department-list');
  const overview=document.getElementById('settings-department-overview');
  const detail=document.getElementById('settings-department-detail');
  const archivedList=document.getElementById('settings-archived-departments');
  if(!list||!overview||!detail||!archivedList)return;
  ensureDepartments();
  list.innerHTML=activeDepartments().map(department=>{
    const productCount=(state.products||[]).filter(product=>productInDepartment(product,department.id)).length;
    const menuCount=(state.menus||[]).filter(menu=>menu.departmentId===department.id&&!menu.archived).length;
    return`<button class="department-select-card" type="button" data-department-id="${escapeHtml(department.id)}" onclick="selectDepartmentSettings(this.dataset.departmentId)">
      <span><strong>${escapeHtml(department.name)}</strong><small>${productCount} inventory item${productCount===1?'':'s'} · ${menuCount} menu${menuCount===1?'':'s'}</small></span><span aria-hidden="true">›</span>
    </button>`;
  }).join('')||'<div class="menu-empty-state"><strong>No active departments</strong><span>Restore an archived department to continue.</span></div>';
  const archivedDepartments=allDepartments().filter(department=>department.archived);
  archivedList.hidden=!archivedDepartments.length;
  archivedList.innerHTML=archivedDepartments.length?`<h4>Archived departments</h4>${archivedDepartments.map(department=>`<div class="archived-settings-row"><span><strong>${escapeHtml(department.name)}</strong><small>Inventory, menus, rooms, and access are safely stored.</small></span><button class="btn btn-secondary btn-sm" type="button" onclick="toggleDepartmentArchived('${department.id}',false)">Restore</button></div>`).join('')}`:'';
  if(creatingSettingsDepartment){
    overview.hidden=true;
    detail.hidden=false;
    const profiles=(state.profiles||[]).filter(profile=>!profile.archived);
    const rooms=activeFloorPlanRooms();
    detail.innerHTML=`
      <div class="department-detail-head"><button class="btn btn-secondary btn-sm mobile-back-button" type="button" onclick="cancelDepartmentCreation()" aria-label="Back to departments" title="Back to departments"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg><span>Departments</span></button><div><h3>Create Department</h3><p>Define the team and rooms now; inventory can be added after creation.</p></div></div>
      <div class="settings-group department-create-form">
        <div class="form-group"><label for="settings-department-create-name">Department name</label><input type="text" id="settings-department-create-name" placeholder="e.g. Catering" autofocus></div>
        <div class="form-group"><label for="settings-department-create-manager">Manager</label><select id="settings-department-create-manager"><option value="">No manager yet</option>${profiles.map(profile=>`<option value="${escapeHtml(profile.id)}">${escapeHtml(profile.name)} · ${escapeHtml(profile.role)}</option>`).join('')}</select></div>
        <fieldset class="department-assignment-field"><legend>Rooms</legend><p>Choose the rooms owned by this department. A room can belong to one department.</p><div class="department-assignment-options">${rooms.map(room=>`<label><input type="checkbox" name="department-create-room" value="${escapeHtml(room.id)}"><span><strong>${escapeHtml(room.name)}</strong><small>Currently ${escapeHtml(departmentName(room.departmentId))}</small></span></label>`).join('')||'<span class="empty-cell">No active rooms yet.</span>'}</div></fieldset>
        <fieldset class="department-assignment-field"><legend>Users with access</legend><p>Select the people who can work in this department.</p><div class="department-assignment-options">${profiles.map(profile=>`<label><input type="checkbox" name="department-create-user" value="${escapeHtml(profile.id)}"><span><strong>${escapeHtml(profile.name)}</strong><small>${escapeHtml(profile.role)}</small></span></label>`).join('')||'<span class="empty-cell">No users are available.</span>'}</div></fieldset>
        <div class="department-create-inventory-note"><strong>Inventory comes next</strong><span>After creating the department, its settings page will help you add or assign products.</span></div>
        <div class="department-detail-actions"><button class="btn btn-secondary" type="button" onclick="cancelDepartmentCreation()">Cancel</button><button class="btn btn-primary" type="button" onclick="addDepartment()">Create Department</button></div>
      </div>`;
    return;
  }
  const department=getDepartment(selectedSettingsDepartmentId);
  if(!department){selectedSettingsDepartmentId=null;overview.hidden=false;detail.hidden=true;detail.innerHTML='';return;}
  const products=(state.products||[]).filter(product=>productInDepartment(product,department.id));
  const menuCount=(state.menus||[]).filter(menu=>menu.departmentId===department.id&&!menu.archived).length;
  const sharedCount=products.filter(product=>productDepartmentIds(product).length>1).length;
  const profiles=(state.profiles||[]).filter(profile=>!profile.archived);
  const manager=profiles.find(profile=>profile.id===department.managerId);
  const rooms=activeFloorPlanRooms();
  const assignedRooms=rooms.filter(room=>room.departmentId===department.id);
  const assignedUsers=profiles.filter(profile=>department.userIds.includes(profile.id));
  overview.hidden=true;
  detail.hidden=false;
  detail.innerHTML=`
    <div class="department-detail-head"><button class="btn btn-secondary btn-sm mobile-back-button" type="button" onclick="closeDepartmentSettings()" aria-label="Back to departments" title="Back to departments"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg><span>Departments</span></button><div><h3>${escapeHtml(department.name)}</h3><p>Independent inventory and menu workspace</p></div>${departmentSettingsEditMode?`<div class="editor-completion-actions"><button class="btn btn-secondary" type="button" onclick="cancelDepartmentSettingsEdit()">Cancel</button><button class="btn btn-primary" type="button" onclick="setDepartmentSettingsEditMode(false)">Done</button></div>`:`<button class="btn btn-secondary department-detail-edit" type="button" onclick="setDepartmentSettingsEditMode(true)">Edit</button>`}</div>
    <div class="department-detail-stats">
      <div class="department-detail-stat"><span>Inventory items</span><strong>${products.length}</strong></div>
      <div class="department-detail-stat"><span>Menus</span><strong>${menuCount}</strong></div>
      <div class="department-detail-stat"><span>Shared products</span><strong>${sharedCount}</strong></div>
    </div>
    ${products.length?'':`<div class="department-setup-warning"><span aria-hidden="true">!</span><div><strong>This department is missing inventory</strong><p>Add new products or assign existing shared products to finish setting up ${escapeHtml(department.name)}.</p></div><button class="btn btn-primary" type="button" onclick="openDepartmentInventory('${department.id}')">Set Up Inventory</button></div>`}
    ${departmentSettingsEditMode?`<div class="settings-group">
        <div class="form-group"><label>Department name</label><input type="text" value="${escapeHtml(department.name)}" onchange="renameDepartment('${department.id}',this.value)"></div>
        <div class="form-group"><label>Manager</label><select onchange="updateDepartmentManager('${department.id}',this.value)"><option value="">No manager assigned</option>${profiles.map(profile=>`<option value="${escapeHtml(profile.id)}" ${profile.id===department.managerId?'selected':''}>${escapeHtml(profile.name)} · ${escapeHtml(profile.role)}</option>`).join('')}</select></div>
        <fieldset class="department-assignment-field"><legend>Rooms</legend><p>Rooms assigned to ${escapeHtml(department.name)}.</p><div class="department-assignment-options">${rooms.map(room=>`<label><input type="checkbox" ${room.departmentId===department.id?'checked':''} onchange="toggleDepartmentRoom('${department.id}','${room.id}',this.checked)"><span><strong>${escapeHtml(room.name)}</strong><small>${room.departmentId===department.id?'Assigned here':`Currently ${escapeHtml(departmentName(room.departmentId))}`}</small></span></label>`).join('')||'<span class="empty-cell">No active rooms yet.</span>'}</div></fieldset>
        <fieldset class="department-assignment-field"><legend>Users with access</legend><p>People allowed to work in ${escapeHtml(department.name)}.</p><div class="department-assignment-options">${profiles.map(profile=>`<label><input type="checkbox" ${department.userIds.includes(profile.id)?'checked':''} onchange="toggleDepartmentUser('${department.id}','${profile.id}',this.checked)"><span><strong>${escapeHtml(profile.name)}</strong><small>${escapeHtml(profile.role)}</small></span></label>`).join('')||'<span class="empty-cell">No users are available.</span>'}</div></fieldset>
        <div class="department-detail-actions"><button class="btn btn-ghost-danger" type="button" onclick="toggleDepartmentArchived('${department.id}',true)">Archive department</button></div>
      </div>`:`<div class="settings-group department-view-facts">
        <div><span>Manager</span><strong>${escapeHtml(manager?.name||'Not assigned')}</strong></div>
        <div><span>Rooms</span><strong>${assignedRooms.length?assignedRooms.map(room=>escapeHtml(room.name)).join(', '):'No rooms assigned'}</strong></div>
        <div><span>Users with access</span><strong>${assignedUsers.length?assignedUsers.map(profile=>escapeHtml(profile.name)).join(', '):'No users assigned'}</strong></div>
        <div class="department-detail-actions"><button class="btn btn-primary" type="button" onclick="openDepartmentMenus('${department.id}')">View ${escapeHtml(department.name)} menus</button></div>
      </div>`}`;
}

function startDepartmentCreation(){
  selectedSettingsDepartmentId=null;
  creatingSettingsDepartment=true;
  departmentSettingsEditMode=false;
  departmentSettingsEditSnapshot=null;
  renderDepartmentSettings();
  document.getElementById('settings-department-create-name')?.focus();
}

function cancelDepartmentCreation(){creatingSettingsDepartment=false;renderDepartmentSettings();}

function selectDepartmentSettings(id){
  if(!getDepartment(id))return;
  creatingSettingsDepartment=false;
  departmentSettingsEditMode=false;
  departmentSettingsEditSnapshot=null;
  selectedSettingsDepartmentId=id;
  renderDepartmentSettings();
}

function closeDepartmentSettings(){selectedSettingsDepartmentId=null;departmentSettingsEditMode=false;departmentSettingsEditSnapshot=null;renderDepartmentSettings();}

function setDepartmentSettingsEditMode(editing){
  if(editing){
    const department=getDepartment(selectedSettingsDepartmentId);
    departmentSettingsEditSnapshot=department?{
      department:JSON.parse(JSON.stringify(department)),
      roomDepartments:(state.rooms||[]).map(room=>({id:room.id,departmentId:room.departmentId}))
    }:null;
    departmentSettingsEditMode=!!department;
  }else{
    departmentSettingsEditMode=false;
    departmentSettingsEditSnapshot=null;
  }
  renderDepartmentSettings();
}

function cancelDepartmentSettingsEdit(){
  const snapshot=departmentSettingsEditSnapshot;
  if(snapshot){
    const index=state.departments.findIndex(department=>department.id===snapshot.department.id);
    if(index>=0)state.departments[index]=JSON.parse(JSON.stringify(snapshot.department));
    snapshot.roomDepartments.forEach(saved=>{
      const room=(state.rooms||[]).find(item=>item.id===saved.id);
      if(room)room.departmentId=saved.departmentId;
    });
    fetch('/api/department-manager',{method:'PUT',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({department:snapshot.department.id||snapshot.department.name,membershipId:snapshot.department.managerId||null})}).catch(()=>{});
  }
  departmentSettingsEditMode=false;
  departmentSettingsEditSnapshot=null;
  ensureDepartmentAssignments();
  save();
  renderDepartmentSettings();
  renderProductMenuSettings();
  renderProductDepartmentTabs();
  refreshProductCatalogIfVisible();
  toast('Department changes cancelled.');
}

function openDepartmentMenus(id){
  const department=getDepartment(id);
  if(!department||department.archived){toast('Restore this department before managing its menus.',true);return;}
  menuPageDepartment=id;
  menuPageMenuId='';
  showPage('menu');
  toggleMenuManager(true);
}

function openDepartmentInventory(id){
  const department=getDepartment(id);
  if(!department||department.archived)return;
  productDepartmentView=id;
  productCatalogView='products';
  showPage('products');
  setProductDepartmentView(id);
  openProductModal();
}

function addDepartment(){
  const input=document.getElementById('settings-department-create-name');
  const name=String(input?.value||'').trim();
  if(!name){toast('Enter a department name.',true);input?.focus();return;}
  if(allDepartments().some(department=>department.name.toLowerCase()===name.toLowerCase())){toast('That department already exists.',true);return;}
  const id=`department-${uid()}`;
  const managerId=document.getElementById('settings-department-create-manager')?.value||'';
  const roomIds=[...document.querySelectorAll('input[name="department-create-room"]:checked')].map(input=>input.value);
  const userIds=[...document.querySelectorAll('input[name="department-create-user"]:checked')].map(input=>input.value);
  if(managerId&&!userIds.includes(managerId))userIds.push(managerId);
  state.departments.push({id,name,archived:false,managerId,roomIds:[],userIds});
  (state.rooms||[]).forEach(room=>{if(roomIds.includes(room.id))room.departmentId=id;});
  ensureDepartmentAssignments();
  ensureProductMenuSettings();
  selectedSettingsDepartmentId=id;
  creatingSettingsDepartment=false;
  save();renderDepartmentSettings();renderProductMenuSettings();renderProductDepartmentTabs();refreshProductCatalogIfVisible();
  toast(`${name} department added.`);
}

function updateDepartmentManager(id,managerId){
  const department=getDepartment(id);
  if(!department)return;
  department.managerId=managerId||'';
  if(managerId&&!department.userIds.includes(managerId))department.userIds.push(managerId);
  save();renderDepartmentSettings();
  fetch('/api/department-manager',{method:'PUT',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({department:department.id||department.name,membershipId:managerId||null})}).catch(()=>{});
}

function toggleDepartmentRoom(id,roomId,assigned){
  const department=getDepartment(id);
  const room=floorPlanRoomById(roomId);
  if(!department||!room)return;
  room.departmentId=assigned?id:'bar';
  if(!assigned&&id==='bar')room.departmentId=activeDepartments().find(item=>item.id!==id)?.id||id;
  ensureDepartmentAssignments();
  save();renderDepartmentSettings();
}

function toggleDepartmentUser(id,userId,allowed){
  const department=getDepartment(id);
  if(!department)return;
  if(allowed&&!department.userIds.includes(userId))department.userIds.push(userId);
  if(!allowed)department.userIds=department.userIds.filter(id=>id!==userId);
  if(department.managerId&&!department.userIds.includes(department.managerId))department.userIds.push(department.managerId);
  save();renderDepartmentSettings();
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
  ensureDepartments();
  const department=state.departments.find(item=>item.id===id);
  if(!department)return;
  if(archived&&state.departments.filter(item=>!item.archived).length<=1){toast('Keep at least one department active.',true);return;}
  department.archived=!!archived;
  if(department.archived){selectedSettingsDepartmentId=null;departmentSettingsEditMode=false;departmentSettingsEditSnapshot=null;}
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
        <h3 id="product-view-title">${escapeHtml(drink.name)}${drink.archived?' <span class="sub-badge">Archived</span>':''}</h3>
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
