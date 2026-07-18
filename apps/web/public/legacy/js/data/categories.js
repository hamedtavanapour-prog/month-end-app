// categories.js — editable inventory categories and their subcategories.

const DEFAULT_INVENTORY_CATEGORIES={
  Spirits:['Vodka','Rum','Gin','Scotch (Single)','Scotch (Blend)','Irish Whiskey','Rye','Tequila','Brandy / Cognac','Aperitifs','Other Spirits'],
  Liqueurs:['Liqueurs','Ports'],
  Reds:['Pinot Noir','Italian Reds','Cabernet & Blends','Cabernet Shiraz','Syrah / Shiraz','Syrah','Shiraz','Grenache','Grenache & Syrah','Malbec','Spanish Reds','Other Reds'],
  Whites:['Pinot Gris / Grigio','Sauvignon Blanc','Chardonnay','Viognier','Other Whites','Non-Alcoholic'],
  'Rosé & Bubbles':['Rosé','Bubbles'],
  Beer:['Kegs','Bottles','Cans','Features / Craft','Non-Alcoholic'],
  Cider:['Cans','Bottles'],
  Food:['Freezer','Cooler 1','Cooler 2','Dry Storage 1','Salad Hub','Other Food'],
  Supplies:['Smallwares','Other Supplies'],
  Other:['Soft Drinks','Juices','Syrups','Misc']
};

let SUBCATS=JSON.parse(JSON.stringify(DEFAULT_INVENTORY_CATEGORIES));
let categoryEditorSubcategories=[];

function wineCategoryForSubcategory(subcategory=''){
  const value=String(subcategory||'').trim();
  if(['Rosé','Bubbles'].includes(value))return'Rosé & Bubbles';
  if((DEFAULT_INVENTORY_CATEGORIES.Whites||[]).includes(value))return'Whites';
  return'Reds';
}

function normalizeInventoryCategories(){
  let changed=false;
  if(!state.inventoryCategories||typeof state.inventoryCategories!=='object'||Array.isArray(state.inventoryCategories)){
    state.inventoryCategories=JSON.parse(JSON.stringify(DEFAULT_INVENTORY_CATEGORIES));
    changed=true;
  }
  const hadLegacyWineCategory=Object.prototype.hasOwnProperty.call(state.inventoryCategories,'Wine');
  if(hadLegacyWineCategory){delete state.inventoryCategories.Wine;changed=true;}
  Object.entries(state.inventoryCategories).forEach(([name,subcategories])=>{
    const cleanName=String(name||'').trim();
    const cleanSubs=[...new Set((Array.isArray(subcategories)?subcategories:[]).map(item=>String(item||'').trim()).filter(Boolean))];
    if(!cleanName){delete state.inventoryCategories[name];changed=true;return;}
    if(cleanName!==name){delete state.inventoryCategories[name];state.inventoryCategories[cleanName]=cleanSubs;changed=true;return;}
    if(JSON.stringify(cleanSubs)!==JSON.stringify(subcategories)){state.inventoryCategories[name]=cleanSubs;changed=true;}
  });
  if(hadLegacyWineCategory){
    ['Reds','Whites','Rosé & Bubbles'].forEach(name=>{
      if(!state.inventoryCategories[name]){state.inventoryCategories[name]=[...DEFAULT_INVENTORY_CATEGORIES[name]];changed=true;}
    });
  }
  (state.products||[]).forEach(product=>{
    if(product.category!=='Wine')return;
    product.category=wineCategoryForSubcategory(product.subcategory);
    changed=true;
  });
  (state.importBacklog||[]).forEach(item=>{
    if(item.category!=='Wine')return;
    item.category=wineCategoryForSubcategory(item.subcategory);
    changed=true;
  });
  [...(state.products||[]),...(state.importBacklog||[])].forEach(item=>{
    const category=String(item.category||'Other').trim()||'Other';
    if(!state.inventoryCategories[category]){state.inventoryCategories[category]=[];changed=true;}
    const subcategory=String(item.subcategory||'').trim();
    if(subcategory&&!state.inventoryCategories[category].includes(subcategory)){state.inventoryCategories[category].push(subcategory);changed=true;}
  });
  (state.rooms||[]).forEach(room=>{
    if(!Array.isArray(room.categoryNames)||!room.categoryNames.includes('Wine'))return;
    room.categoryNames=[...new Set(room.categoryNames.flatMap(name=>name==='Wine'?['Reds','Whites','Rosé & Bubbles']:[name]))];
    changed=true;
  });
  const preferredOrder=Object.keys(DEFAULT_INVENTORY_CATEGORIES);
  const orderedCategories={};
  preferredOrder.forEach(name=>{if(state.inventoryCategories[name])orderedCategories[name]=state.inventoryCategories[name];});
  Object.entries(state.inventoryCategories).forEach(([name,subcategories])=>{if(!orderedCategories[name])orderedCategories[name]=subcategories;});
  if(JSON.stringify(Object.keys(orderedCategories))!==JSON.stringify(Object.keys(state.inventoryCategories))){state.inventoryCategories=orderedCategories;changed=true;}
  Object.keys(SUBCATS).forEach(key=>delete SUBCATS[key]);
  Object.entries(state.inventoryCategories).forEach(([name,subcategories])=>{SUBCATS[name]=[...subcategories];});
  return changed;
}

function inventoryCategoryNames(){
  return Object.keys(SUBCATS);
}

function refreshCategorySelects(){
  const configs=[
    ['prod-cat-f',true],['live-inv-cat-f',true],['usage-cat-f',true],['rep-cat',true],['inv-cat-f',true],['pm-cat',false]
  ];
  configs.forEach(([id,includeAll])=>{
    const select=document.getElementById(id);if(!select)return;
    const previous=select.value;
    select.innerHTML=(includeAll?'<option value="">All</option>':'')+inventoryCategoryNames().map(name=>`<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
    if([...select.options].some(option=>option.value===previous))select.value=previous;
  });
}

function renderInventoryCategorySettings(){
  const list=document.getElementById('settings-category-list');if(!list)return;
  list.innerHTML=inventoryCategoryNames().map(name=>{
    const count=(state.products||[]).filter(product=>!product.archived&&product.category===name).length;
    return`<button class="category-settings-row" type="button" data-category-name="${escapeHtml(name)}" onclick="openInventoryCategoryEditor(this.dataset.categoryName)"><span><strong>${escapeHtml(name)}</strong><small>${escapeHtml((SUBCATS[name]||[]).join(' · ')||'No subcategories')}</small></span><em>${count} product${count===1?'':'s'} ›</em></button>`;
  }).join('')||'<div class="empty-cell">No inventory categories.</div>';
}

function openInventoryCategoryEditor(name=''){
  editingInventoryCategoryName=name;
  categoryEditorSubcategories=[...(SUBCATS[name]||[])];
  document.getElementById('category-editor-title').textContent=name?'Edit Category':'Add Category';
  document.getElementById('category-editor-name').value=name;
  const subcategoryInput=document.getElementById('category-editor-subcategory-input');
  if(subcategoryInput)subcategoryInput.value='';
  renderInventoryCategorySubcategoryEditor();
  const remove=document.getElementById('category-editor-delete');
  if(remove)remove.hidden=!name;
  openModal('modal-category-editor');
  setTimeout(()=>document.getElementById('category-editor-name')?.focus(),30);
}

function renderInventoryCategorySubcategoryEditor(){
  const list=document.getElementById('category-editor-subcategory-list');if(!list)return;
  list.innerHTML=categoryEditorSubcategories.map((subcategory,index)=>`<span class="category-subcategory-chip"><span>${escapeHtml(subcategory)}</span><button type="button" aria-label="Remove ${escapeHtml(subcategory)}" title="Remove" onclick="removeInventoryCategorySubcategory(${index})">×</button></span>`).join('');
}

function addInventoryCategorySubcategory(shouldFocus=true){
  const input=document.getElementById('category-editor-subcategory-input');if(!input)return;
  const additions=String(input.value||'').split(/[\n,]/).map(item=>item.trim()).filter(Boolean);
  additions.forEach(addition=>{
    if(!categoryEditorSubcategories.some(existing=>existing.toLowerCase()===addition.toLowerCase()))categoryEditorSubcategories.push(addition);
  });
  input.value='';
  renderInventoryCategorySubcategoryEditor();
  if(shouldFocus)input.focus();
}

function removeInventoryCategorySubcategory(index){
  if(!Number.isInteger(index)||index<0||index>=categoryEditorSubcategories.length)return;
  categoryEditorSubcategories.splice(index,1);
  renderInventoryCategorySubcategoryEditor();
  document.getElementById('category-editor-subcategory-input')?.focus();
}

function saveInventoryCategory(){
  const name=(document.getElementById('category-editor-name')?.value||'').trim();
  if((document.getElementById('category-editor-subcategory-input')?.value||'').trim())addInventoryCategorySubcategory(false);
  const subcategories=[...categoryEditorSubcategories];
  if(!name){toast('Enter a category name.',true);return;}
  const duplicate=inventoryCategoryNames().some(existing=>existing!==editingInventoryCategoryName&&existing.toLowerCase()===name.toLowerCase());
  if(duplicate){toast('That category already exists.',true);return;}
  const previous=editingInventoryCategoryName;
  if(previous&&previous!==name){
    delete state.inventoryCategories[previous];
    (state.products||[]).forEach(product=>{if(product.category===previous)product.category=name;});
    (state.importBacklog||[]).forEach(item=>{if(item.category===previous)item.category=name;});
    (state.rooms||[]).forEach(room=>{if(Array.isArray(room.categoryNames))room.categoryNames=room.categoryNames.map(category=>category===previous?name:category);});
  }
  state.inventoryCategories[name]=subcategories;
  normalizeInventoryCategories();
  save();
  refreshCategorySelects();
  renderInventoryCategorySettings();
  renderFloorPlanRooms();
  closeModal('modal-category-editor');
  toast('Category saved.');
}

function deleteInventoryCategory(){
  const name=editingInventoryCategoryName;if(!name)return;
  if(name==='Other'){toast('Keep the Other category as a fallback.',true);return;}
  const count=(state.products||[]).filter(product=>product.category===name).length;
  if(!confirm(`Delete "${name}"? ${count} product${count===1?'':'s'} will move to Other.`))return;
  delete state.inventoryCategories[name];
  (state.products||[]).forEach(product=>{if(product.category===name){product.category='Other';product.subcategory='Misc';}});
  (state.importBacklog||[]).forEach(item=>{if(item.category===name){item.category='Other';item.subcategory='Misc';}});
  (state.rooms||[]).forEach(room=>{if(Array.isArray(room.categoryNames))room.categoryNames=room.categoryNames.filter(category=>category!==name);});
  normalizeInventoryCategories();
  save();refreshCategorySelects();renderInventoryCategorySettings();renderFloorPlanRooms();closeModal('modal-category-editor');toast('Category deleted.');
}
