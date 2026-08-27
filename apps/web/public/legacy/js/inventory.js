// inventory.js — counting sessions, progress, saved counts, single-count export.

let inventoryCountSaving=false;
let countDraftSaving=false;
let recountSourceCountId=null;
let recountSelectedProductIds=new Set();
let countExtraSelectedProductIds=new Set();
let expandedCountExtraCategories=new Set();
const COUNT_UNLISTED_CATEGORY='Unlisted';
const COUNT_UNLISTED_SUBCATEGORY='Added Items';

function latestInventoryCount(){
  return finalisedInventoryBaselines()[0]||null;
}
function inventoryIsFinalised(inv){return!!inv&&(inv.status==='finalised'||inv.finalised===true);}
function finalisedInventoryBaselines(){
  return(state.inventories||[]).filter(inv=>inventoryIsFinalised(inv)&&!inv.archived).sort((a,b)=>
    String(b.date||'').localeCompare(String(a.date||''))||
    String(b.updatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.createdAt||''))||
    Number(b.recountNumber||0)-Number(a.recountNumber||0)
  );
}
function selectedLiveInventoryBaseline(){
  const available=finalisedInventoryBaselines();
  if(liveInventoryBaselineId){
    const selected=available.find(inv=>inv.id===liveInventoryBaselineId);
    if(selected)return selected;
    liveInventoryBaselineId=null;
  }
  return available[0]||null;
}
function setLiveInventoryBaseline(id=''){
  liveInventoryBaselineId=id||null;
  renderLiveInventoryPage();
}
function renderLiveInventoryBaselineOptions(){
  const select=document.getElementById('live-inv-baseline-f');if(!select)return;
  const available=finalisedInventoryBaselines().slice(0,12);
  const selected=selectedLiveInventoryBaseline();
  select.innerHTML=available.length?available.map((inv,index)=>`<option value="${escapeHtml(inv.id)}">${index===0?'Latest · ':''}${fmtDate(inv.date)} · ${escapeHtml(inv.label||'Inventory Count')}${inv.recordType==='recount'?` · Re-count ${inv.recountNumber||''}`:' · Count'}</option>`).join(''):'<option value="">No finalized counts</option>';
  if(selected)select.value=selected.id;
}
function inventoryStatusLabel(inv){return inventoryIsFinalised(inv)?'Finalised':'Saved';}
function inventoryRootId(inv){return inv?.parentCountId||inv?.id||null;}
function recountsForInventory(inv){
  const rootId=inventoryRootId(inv);
  return state.inventories.filter(item=>item.recordType==='recount'&&item.parentCountId===rootId);
}
function roomKey(name){
  return String(name||'').trim().toLowerCase();
}
function defaultFloorPlanRoomName(){
  return'Main Room';
}
function ensureFloorPlanRoom(name,id=null){
  if(!Array.isArray(state.rooms))state.rooms=[];
  const clean=String(name||'').trim()||defaultFloorPlanRoomName();
  const key=roomKey(clean);
  let room=state.rooms.find(item=>roomKey(item.name)===key);
  if(room)return room;
  room={id:id||uid(),name:clean,archived:false,productIds:null,categoryNames:typeof inventoryCategoryNames==='function'?inventoryCategoryNames():[],manualProductIds:[],departmentId:'bar'};
  state.rooms.push(room);
  return room;
}
function normalizeRoomProductIds(room){
  if(!Array.isArray(room.productIds))return null;
  const activeIds=new Set(state.products.filter(product=>!product.archived).map(product=>product.id));
  return [...new Set(room.productIds)].filter(id=>activeIds.has(id));
}
function floorPlanProductsForDepartment(departmentId='bar'){
  return state.products.filter(product=>!product.archived&&(!departmentId||typeof productInDepartment!=='function'||productInDepartment(product,departmentId)));
}
function normalizeRoomAssignmentRules(room,productIds){
  const products=floorPlanProductsForDepartment(String(room.departmentId||'bar'));
  const configuredCategories=typeof inventoryCategoryNames==='function'?inventoryCategoryNames():[...new Set(products.map(product=>product.category||'Other'))];
  if(Array.isArray(room.categoryNames)||Array.isArray(room.manualProductIds)){
    const categoryNames=[...new Set((room.categoryNames||[]).map(name=>String(name||'').trim()).filter(name=>configuredCategories.includes(name)))];
    const activeIds=new Set(products.map(product=>product.id));
    const manualProductIds=[...new Set(room.manualProductIds||[])].filter(id=>activeIds.has(id));
    return{categoryNames,manualProductIds};
  }
  const selected=new Set(Array.isArray(productIds)?productIds:products.map(product=>product.id));
  const categoryNames=configuredCategories.filter(category=>{
    const categoryProducts=products.filter(product=>(product.category||'Other')===category);
    return categoryProducts.length>0&&categoryProducts.every(product=>selected.has(product.id));
  });
  const coveredCategories=new Set(categoryNames);
  const manualProductIds=products.filter(product=>selected.has(product.id)&&!coveredCategories.has(product.category||'Other')).map(product=>product.id);
  return{categoryNames,manualProductIds};
}
function normalizeFloorPlanRooms(){
  if(!Array.isArray(state.rooms))state.rooms=[];
  const seen=new Set();
  let changed=false;
  state.rooms=state.rooms.map((room,index)=>{
    let clean=String(room.name||`Room ${index+1}`).trim()||`Room ${index+1}`;
    if(clean==='Unassigned')clean=defaultFloorPlanRoomName();
    const productIds=normalizeRoomProductIds(room);
    const assignments=normalizeRoomAssignmentRules(room,productIds);
    const normalized={id:room.id||uid(),name:clean,archived:!!room.archived,productIds,categoryNames:assignments.categoryNames,manualProductIds:assignments.manualProductIds,departmentId:String(room.departmentId||'bar')};
    if(normalized.id!==room.id||normalized.name!==room.name||normalized.archived!==room.archived||normalized.departmentId!==room.departmentId||JSON.stringify(productIds)!==JSON.stringify(room.productIds??null)||JSON.stringify(normalized.categoryNames)!==JSON.stringify(room.categoryNames)||JSON.stringify(normalized.manualProductIds)!==JSON.stringify(room.manualProductIds))changed=true;
    return normalized;
  }).filter(room=>{
    const key=roomKey(room.name);
    if(!key||seen.has(key)){changed=true;return false;}
    seen.add(key);
    return true;
  });
  state.inventories.forEach(inv=>{
    (inv.rooms||[]).forEach(room=>{
      const floorRoom=ensureFloorPlanRoom(room.name,room.roomId||room.id);
      if(room.roomId!==floorRoom.id){room.roomId=floorRoom.id;changed=true;}
      if(room.name!==floorRoom.name){room.name=floorRoom.name;changed=true;}
    });
  });
  if(!state.rooms.length){
    state.rooms=[{id:uid(),name:defaultFloorPlanRoomName(),archived:false,productIds:null,categoryNames:typeof inventoryCategoryNames==='function'?inventoryCategoryNames():[],manualProductIds:[],departmentId:'bar'}];
    changed=true;
  }
  return changed;
}
function activeFloorPlanRooms(){
  normalizeFloorPlanRooms();
  return state.rooms.filter(room=>!room.archived);
}
function floorPlanRoomById(id){
  normalizeFloorPlanRooms();
  return state.rooms.find(room=>room.id===id);
}
function roomProductIds(room){
  const products=floorPlanProductsForDepartment(room?.departmentId||'bar');
  if(!room)return products.map(product=>product.id);
  if(Array.isArray(room.categoryNames)||Array.isArray(room.manualProductIds)){
    const categories=new Set(room.categoryNames||[]);
    const manual=new Set(room.manualProductIds||[]);
    return products.filter(product=>categories.has(product.category||'Other')||manual.has(product.id)).map(product=>product.id);
  }
  if(!Array.isArray(room.productIds))return products.map(product=>product.id);
  const allowed=new Set(room.productIds);
  return products.filter(product=>allowed.has(product.id)).map(product=>product.id);
}
function roomProducts(room){
  const allowed=new Set(roomProductIds(room));
  return state.products.filter(product=>!product.archived&&allowed.has(product.id));
}
function expectedInventoryProductIds(inv,room=null){
  const recountSelection=inv?.recordType==='recount'?new Set(inv.selectedProductIds||[]):null;
  if(room){
    const floorRoom=room.roomId?floorPlanRoomById(room.roomId):null;
    const ids=[...roomProductIds(floorRoom),...(room.extraProductIds||[])];
    return new Set(recountSelection?ids.filter(id=>recountSelection.has(id)):ids);
  }
  const ids=new Set();
  (inv?.rooms||[]).forEach(invRoom=>{
    const floorRoom=invRoom.roomId?floorPlanRoomById(invRoom.roomId):null;
    roomProductIds(floorRoom).forEach(id=>ids.add(id));
    (invRoom.extraProductIds||[]).forEach(id=>ids.add(id));
  });
  if(!ids.size)state.products.filter(product=>!product.archived).forEach(product=>ids.add(product.id));
  return recountSelection&&recountSelection.size?new Set([...ids].filter(id=>recountSelection.has(id))):ids;
}
function currentRoomProducts(){
  const room=currentInventoryRoom();
  const inv=currentInvEdit?state.inventories.find(item=>item.id===currentInvEdit):null;
  const floorRoom=room?.roomId?floorPlanRoomById(room.roomId):null;
  const allowed=new Set(roomProductIds(floorRoom));
  (room?.extraProductIds||[]).forEach(id=>allowed.add(id));
  const selected=inv?.recordType==='recount'?new Set(inv.selectedProductIds||[]):null;
  return state.products.filter(product=>!product.archived&&allowed.has(product.id)&&(!selected||selected.has(product.id)));
}
function currentCountProducts(){
  if(currentInvMergedView&&currentInvEdit){
    const inv=state.inventories.find(item=>item.id===currentInvEdit);
    const expected=expectedInventoryProductIds(inv);
    return state.products.filter(product=>!product.archived&&expected.has(product.id));
  }
  return currentRoomProducts();
}
function countProductDisplayGroup(product,room=currentInventoryRoom()){
  if((room?.extraProductIds||[]).includes(product?.id))return{category:COUNT_UNLISTED_CATEGORY,subcategory:COUNT_UNLISTED_SUBCATEGORY};
  return{category:product?.category||'Other',subcategory:product?.subcategory||'Other'};
}
function roomProductSummary(room){
  const count=roomProductIds(room).length;
  const categoryCount=(room.categoryNames||[]).length;
  return`${count} item${count===1?'':'s'} · ${categoryCount} categor${categoryCount===1?'y':'ies'}`;
}
function renderFloorPlanRooms(){
  const list=document.getElementById('settings-room-list');
  const rooms=activeFloorPlanRooms();
  if(list)list.innerHTML=rooms.map(room=>`<button class="settings-room-card" type="button" onclick="openFloorPlanRoomEditor('${room.id}')"><span><strong>${escapeHtml(room.name)}</strong><small>${roomProductSummary(room)}</small></span><em aria-hidden="true">›</em></button>`).join('')||`<div class="empty-cell">No rooms defined.</div>`;
  const count=document.getElementById('settings-room-count');
  if(count)count.textContent=`${rooms.length} room${rooms.length===1?'':'s'}`;
  const saveBtn=document.getElementById('settings-room-save');
  if(saveBtn)saveBtn.textContent=editingSettingsRoomId?'Save Changes':'Add Room';
  const addTrigger=document.getElementById('settings-room-add-trigger');
  const createForm=document.getElementById('settings-room-create-form');
  const formOpen=addingSettingsRoom||!!editingSettingsRoomId;
  if(addTrigger)addTrigger.hidden=formOpen;
  if(createForm)createForm.hidden=!formOpen;
  const formLabel=document.getElementById('settings-room-form-label');
  if(formLabel)formLabel.textContent=editingSettingsRoomId?'Rename room':'Room name';
}
function startAddSettingsRoom(){
  editingSettingsRoomId=null;
  addingSettingsRoom=true;
  const input=document.getElementById('settings-room-name');
  if(input)input.value='';
  renderFloorPlanRooms();
  requestAnimationFrame(()=>document.getElementById('settings-room-name')?.focus());
}
function cancelSettingsRoomForm(){
  editingSettingsRoomId=null;
  addingSettingsRoom=false;
  const input=document.getElementById('settings-room-name');
  if(input)input.value='';
  renderFloorPlanRooms();
}
function addSettingsRoom(){
  const input=document.getElementById('settings-room-name');
  const name=(input?.value||'').trim();
  if(!name){toast('Enter a room name.',true);return;}
  const exists=state.rooms.some(room=>room.id!==editingSettingsRoomId&&roomKey(room.name)===roomKey(name)&&!room.archived);
  if(exists){toast('Room already exists.',true);return;}
  if(editingSettingsRoomId){
    const room=floorPlanRoomById(editingSettingsRoomId);
    if(room){
      room.name=name;
      state.inventories.forEach(inv=>{
        (inv.rooms||[]).forEach(invRoom=>{if(invRoom.roomId===room.id)invRoom.name=room.name;});
      });
    }
    editingSettingsRoomId=null;
  }else{
    const room=ensureFloorPlanRoom(name);
    room.categoryNames=[];
    room.manualProductIds=[];
    room.productIds=[];
    editingFloorPlanRoomId=room.id;
  }
  addingSettingsRoom=false;
  if(input)input.value='';
  save();
  renderFloorPlanRooms();
  renderInventoryTable();
  renderLiveInventoryRoomTabs();
  if(editingFloorPlanRoomId)openFloorPlanRoomEditor(editingFloorPlanRoomId);
  else toast('Room saved.');
}
function startRenameRoom(roomId){
  openFloorPlanRoomEditor(roomId);
}
function archiveRoom(roomId){
  const active=activeFloorPlanRooms();
  if(active.length<=1){toast('Keep at least one room.',true);return;}
  const room=floorPlanRoomById(roomId);
  if(!room)return;
  if(!confirm(`Remove "${room.name}" from future counts? Previous counts will keep this room in their history.`))return;
  room.archived=true;
  if(editingSettingsRoomId===roomId){editingSettingsRoomId=null;addingSettingsRoom=false;}
  save();
  renderFloorPlanRooms();
  renderInventoryTable();
  renderLiveInventoryPage();
  toast('Room removed from active floor plan.');
}
function openFloorPlanRoomEditor(roomId){
  const room=floorPlanRoomById(roomId);if(!room)return;
  editingFloorPlanRoomId=room.id;
  floorPlanRoomDraft={name:room.name,categoryNames:[...(room.categoryNames||[])],manualProductIds:[...(room.manualProductIds||[])],departmentId:room.departmentId||'bar'};
  floorPlanManualSearchOpen=false;
  const query=document.getElementById('floor-plan-product-query');if(query)query.value='';
  renderFloorPlanRoomEditor();
  openModal('modal-floor-plan-room');
}
function closeFloorPlanRoomEditor(){
  editingFloorPlanRoomId=null;floorPlanRoomDraft=null;floorPlanManualSearchOpen=false;
  closeModal('modal-floor-plan-room');
}
function renderFloorPlanRoomEditor(){
  if(!floorPlanRoomDraft)return;
  const room=floorPlanRoomById(editingFloorPlanRoomId);
  const name=document.getElementById('floor-plan-room-name');if(name)name.value=floorPlanRoomDraft.name;
  const categories=document.getElementById('floor-plan-room-categories');
  if(categories)categories.innerHTML=(typeof inventoryCategoryNames==='function'?inventoryCategoryNames():[]).map(category=>{
    const count=floorPlanProductsForDepartment(floorPlanRoomDraft.departmentId).filter(product=>(product.category||'Other')===category).length;
    const selected=floorPlanRoomDraft.categoryNames.includes(category);
    return`<label class="room-category-option"><input type="checkbox" data-category="${escapeHtml(category)}" ${selected?'checked':''} onchange="toggleFloorPlanRoomCategory(this.dataset.category,this.checked)"><span><strong>${escapeHtml(category)}</strong><small>${count} product${count===1?'':'s'}</small></span></label>`;
  }).join('');
  const products=floorPlanProductsForDepartment(floorPlanRoomDraft.departmentId);
  const manualProducts=floorPlanRoomDraft.manualProductIds.map(id=>products.find(product=>product.id===id)).filter(Boolean).filter(product=>!floorPlanRoomDraft.categoryNames.includes(product.category||'Other'));
  const manual=document.getElementById('floor-plan-manual-products');
  if(manual)manual.innerHTML=manualProducts.map(product=>`<span class="room-manual-product"><span><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.category||'Other')}</small></span><button type="button" aria-label="Remove ${escapeHtml(product.name)}" onclick="removeFloorPlanManualProduct('${product.id}')">&times;</button></span>`).join('')||'<small class="room-editor-empty">No individual products added.</small>';
  const search=document.getElementById('floor-plan-product-search');if(search)search.hidden=!floorPlanManualSearchOpen;
  const toggle=document.getElementById('floor-plan-manual-toggle');if(toggle)toggle.textContent=floorPlanManualSearchOpen?'Close Search':'＋ Add an item manually';
  const remove=document.getElementById('floor-plan-room-delete');if(remove)remove.hidden=activeFloorPlanRooms().length<=1||!room;
  if(floorPlanManualSearchOpen)renderFloorPlanProductSearch();
}
function toggleFloorPlanRoomCategory(category,checked){
  if(!floorPlanRoomDraft)return;
  const categories=new Set(floorPlanRoomDraft.categoryNames);
  if(checked){
    categories.add(category);
    const productIds=new Set(floorPlanProductsForDepartment(floorPlanRoomDraft.departmentId).filter(product=>(product.category||'Other')===category).map(product=>product.id));
    floorPlanRoomDraft.manualProductIds=floorPlanRoomDraft.manualProductIds.filter(id=>!productIds.has(id));
  }else categories.delete(category);
  floorPlanRoomDraft.categoryNames=[...categories];
  renderFloorPlanRoomEditor();
}
function toggleFloorPlanManualSearch(){
  floorPlanManualSearchOpen=!floorPlanManualSearchOpen;
  renderFloorPlanRoomEditor();
  if(floorPlanManualSearchOpen)requestAnimationFrame(()=>document.getElementById('floor-plan-product-query')?.focus());
}
function renderFloorPlanProductSearch(){
  const results=document.getElementById('floor-plan-product-results');if(!results||!floorPlanRoomDraft)return;
  const query=(document.getElementById('floor-plan-product-query')?.value||'').trim().toLowerCase();
  if(!query){results.innerHTML='<small class="room-editor-empty">Start typing to find a product.</small>';return;}
  const matches=floorPlanProductsForDepartment(floorPlanRoomDraft.departmentId).filter(product=>[product.name,product.inventoryName,product.alias,product.sku,product.category,product.subcategory].some(value=>String(value||'').toLowerCase().includes(query))).slice(0,12);
  const manual=new Set(floorPlanRoomDraft.manualProductIds);
  results.innerHTML=matches.map(product=>{
    const byCategory=floorPlanRoomDraft.categoryNames.includes(product.category||'Other');
    const added=manual.has(product.id);
    return`<button class="room-product-search-result" type="button" ${byCategory||added?'disabled':''} onclick="addFloorPlanManualProduct('${product.id}')"><span><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.category||'Other')}${product.subcategory?` · ${escapeHtml(product.subcategory)}`:''}</small></span><em>${byCategory?'Included by category':added?'Added':'＋ Add'}</em></button>`;
  }).join('')||'<small class="room-editor-empty">No matching products.</small>';
}
function addFloorPlanManualProduct(productId){
  if(!floorPlanRoomDraft)return;
  floorPlanRoomDraft.manualProductIds=[...new Set([...floorPlanRoomDraft.manualProductIds,productId])];
  renderFloorPlanRoomEditor();
}
function removeFloorPlanManualProduct(productId){
  if(!floorPlanRoomDraft)return;
  floorPlanRoomDraft.manualProductIds=floorPlanRoomDraft.manualProductIds.filter(id=>id!==productId);
  renderFloorPlanRoomEditor();
}
function saveFloorPlanRoomEditor(){
  const room=floorPlanRoomById(editingFloorPlanRoomId);if(!room||!floorPlanRoomDraft)return;
  const name=(document.getElementById('floor-plan-room-name')?.value||'').trim();
  if(!name){toast('Enter a room name.',true);return;}
  if(state.rooms.some(candidate=>candidate.id!==room.id&&!candidate.archived&&roomKey(candidate.name)===roomKey(name))){toast('Room already exists.',true);return;}
  room.name=name;
  room.categoryNames=[...floorPlanRoomDraft.categoryNames];
  room.manualProductIds=[...floorPlanRoomDraft.manualProductIds];
  room.productIds=roomProductIds(room);
  state.inventories.forEach(inv=>(inv.rooms||[]).forEach(invRoom=>{if(invRoom.roomId===room.id)invRoom.name=room.name;}));
  save();closeFloorPlanRoomEditor();renderFloorPlanRooms();renderInventoryTable();renderLiveInventoryRoomTabs();refreshLiveInventoryIfVisible();toast('Room saved.');
}
function removeEditedFloorPlanRoom(){
  const roomId=editingFloorPlanRoomId;
  closeFloorPlanRoomEditor();
  archiveRoom(roomId);
}
function defaultInventoryRoom(){
  const room=activeFloorPlanRooms()[0]||ensureFloorPlanRoom(defaultFloorPlanRoomName());
  return{id:uid(),roomId:room.id,name:room.name,items:{},extraProductIds:[]};
}
function normalizeInventoryRooms(inv){
  if(!inv)return[];
  if(!Array.isArray(inv.rooms)||!inv.rooms.length){
    inv.rooms=[{id:uid(),name:inv.roomName||'Main Room',items:{...(inv.items||{})}}];
  }
  // Preserve each room object. The count editor keeps a reference to the
  // active room while it reads the visible inputs; replacing the objects here
  // would send those edits into a detached object instead of the inventory.
  inv.rooms=inv.rooms.map((entry,index)=>{
    const room=entry&&typeof entry==='object'?entry:{};
    const floorRoom=floorPlanRoomById(room.roomId)||ensureFloorPlanRoom(room.name||`Room ${index+1}`,room.roomId);
    room.id=room.id||uid();
    room.roomId=floorRoom.id;
    room.name=floorRoom.name;
    if(!room.items||typeof room.items!=='object')room.items={};
    const activeProductIds=new Set(state.products.filter(product=>!product.archived).map(product=>product.id));
    room.extraProductIds=[...new Set(Array.isArray(room.extraProductIds)?room.extraProductIds:[])].filter(id=>activeProductIds.has(id));
    return room;
  });
  inv.items=mergeInventoryRoomItems(inv.rooms);
  return inv.rooms;
}
function ensureInventoryHasFloorPlanRooms(inv){
  if(!inv)return;
  normalizeInventoryRooms(inv);
  activeFloorPlanRooms().forEach(floorRoom=>{
    if(inv.rooms.some(room=>room.roomId===floorRoom.id))return;
    inv.rooms.push({id:uid(),roomId:floorRoom.id,name:floorRoom.name,items:{},extraProductIds:[]});
  });
  inv.items=mergeInventoryRoomItems(inv.rooms);
}
function mergeInventoryRoomItems(rooms){
  const items={};
  (rooms||[]).forEach(room=>{
    Object.entries(room.items||{}).forEach(([pid,qty])=>{
      const n=parseFloat(qty);
      if(!isNaN(n))items[pid]=(items[pid]||0)+n;
    });
  });
  return items;
}
function currentInventoryRoom(){
  const ex=currentInvEdit?state.inventories.find(i=>i.id===currentInvEdit):null;
  if(ex)normalizeInventoryRooms(ex);
  const rooms=ex?.rooms||currentInvRooms;
  let room=rooms.find(r=>r.id===currentInvRoomId)||rooms[0];
  currentInvRoomId=room.id;
  return room;
}
function inventoryRoomItemsEqual(a={},b={}){
  const keys=new Set([...Object.keys(a||{}),...Object.keys(b||{})]);
  return[...keys].every(key=>{
    const av=parseFloat(a?.[key]),bv=parseFloat(b?.[key]);
    return(isNaN(av)&&isNaN(bv))||av===bv;
  });
}
function captureCurrentRoomCounts(){
  if(currentInvMergedView)return;
  const room=currentInventoryRoom();
  if(!room)return;
  const allowedProducts=currentRoomProducts();
  const allowedIds=new Set(allowedProducts.map(product=>product.id));
  allowedProducts.forEach(p=>{
    const el=document.getElementById('invq-'+p.id);
    if(el)liveInvCounts[p.id]=el.value===''?'':parseFloat(el.value);
  });
  const items={};
  Object.entries(liveInvCounts).forEach(([pid,val])=>{
    if(allowedIds.has(pid)&&val!==''&&val!==null&&val!==undefined&&!isNaN(val))items[pid]=parseFloat(val);
  });
  if(currentInvEdit&&!inventoryRoomItemsEqual(room.items,items))dirtyInventoryRoomIds.add(room.id);
  room.items=items;
}
function renderInventoryRooms(){
  const room=currentInventoryRoom();
  const label=document.getElementById('inv-room-current');
  if(label)label.textContent=room?.name||'Room';
}
function switchInventoryRoom(roomId){
  if(currentCountRoomLock&&roomId!==currentCountRoomLock.roomId){toast('Save or exit this room before choosing another one.',true);return;}
  captureCurrentRoomCounts();
  currentInvMergedView=false;
  currentInvRoomId=roomId;
  const room=currentInventoryRoom();
  liveInvCounts={};
  currentRoomProducts().forEach(p=>{liveInvCounts[p.id]=room.items[p.id]!==undefined?room.items[p.id]:'';});
  renderInventoryRooms();
  renderInvRows(true);
}
function addInventoryRoom(){
  const input=document.getElementById('inv-room-name');
  const rooms=(currentInvEdit?state.inventories.find(i=>i.id===currentInvEdit)?.rooms:currentInvRooms)||[];
  const active=currentInventoryRoom();
  const typed=(input?.value||'').trim();
  const name=(typed&&typed!==active?.name?typed:`Room ${rooms.length+1}`);
  const floorRoom=ensureFloorPlanRoom(name);
  save();
  const ex=currentInvEdit?state.inventories.find(i=>i.id===currentInvEdit):null;
  if(!ex){
    captureCurrentRoomCounts();
    const existing=currentInvRooms.find(room=>room.roomId===floorRoom.id);
    if(existing){
      currentInvRoomId=existing.id;
      liveInvCounts={};
      currentRoomProducts().forEach(p=>{liveInvCounts[p.id]=existing.items[p.id]!==undefined?existing.items[p.id]:'';});
      renderInventoryRooms();
      renderInvRows(true);
      renderFloorPlanRooms();
      return;
    }
    const room={id:uid(),roomId:floorRoom.id,name:floorRoom.name,items:{},extraProductIds:[]};
    currentInvRooms.push(room);
    currentInvRoomId=room.id;
    liveInvCounts={};
    currentRoomProducts().forEach(p=>{liveInvCounts[p.id]='';});
    renderInventoryRooms();
    renderInvRows(true);
    renderFloorPlanRooms();
    renderLiveInventoryRoomTabs();
    return;
  }
  captureCurrentRoomCounts();
  normalizeInventoryRooms(ex);
  const existing=ex.rooms.find(room=>room.roomId===floorRoom.id);
  if(existing){
    currentInvRoomId=existing.id;
    liveInvCounts={};
    currentRoomProducts().forEach(p=>{liveInvCounts[p.id]=existing.items[p.id]!==undefined?existing.items[p.id]:'';});
    renderInventoryRooms();
    renderInvRows(true);
    renderFloorPlanRooms();
    return;
  }
  const room={id:uid(),roomId:floorRoom.id,name:floorRoom.name,items:{},extraProductIds:[]};
  ex.rooms.push(room);
  dirtyInventoryRoomIds.add(room.id);
  currentInvRoomId=room.id;
  liveInvCounts={};
  currentRoomProducts().forEach(p=>{liveInvCounts[p.id]='';});
  renderInventoryRooms();
  renderInvRows(true);
  renderFloorPlanRooms();
}
function renameInventoryRoom(){
  const room=currentInventoryRoom();
  if(!room)return;
  const name=(document.getElementById('inv-room-name')?.value||'').trim();
  if(!name){toast('Enter a room name.',true);return;}
  const floorRoom=room.roomId?floorPlanRoomById(room.roomId):null;
  if(floorRoom)floorRoom.name=name;
  room.name=name;
  if(currentInvEdit)dirtyInventoryRoomIds.add(room.id);
  save();
  renderInventoryRooms();
  renderFloorPlanRooms();
  renderLiveInventoryRoomTabs();
}
function deleteInventoryRoom(){
  const ex=currentInvEdit?state.inventories.find(i=>i.id===currentInvEdit):null;
  if(ex)normalizeInventoryRooms(ex);
  const rooms=ex?ex.rooms:currentInvRooms;
  if(rooms.length<=1){toast('Keep at least one room.',true);return;}
  const room=currentInventoryRoom();
  if(currentInvEdit)deletedInventoryRoomIds.add(room.id);
  const remaining=rooms.filter(r=>r.id!==room.id);
  if(ex)ex.rooms=remaining;
  else currentInvRooms=remaining;
  currentInvRoomId=remaining[0].id;
  liveInvCounts={};
  currentRoomProducts().forEach(p=>{liveInvCounts[p.id]=remaining[0].items[p.id]!==undefined?remaining[0].items[p.id]:'';});
  renderInventoryRooms();
  renderInvRows(true);
}

function liveMovementAfterBaseline(date,baselineDate){
  if(!baselineDate)return true;
  if(!date)return true;
  return String(date)>=String(baselineDate);
}

function liveOrderQtyByProduct(baselineDate=''){
  const totals={};
  state.orders.forEach(raw=>{
    const order=typeof normalizeOrder==='function'?normalizeOrder(raw):raw;
    if(!liveMovementAfterBaseline(order.date,baselineDate))return;
    const sign=order.isRefund?-1:1;
    (order.lines||[]).forEach(line=>{
      const normalized=typeof normalizeLine==='function'?normalizeLine(line):line;
      if(!normalized.productId)return;
      totals[normalized.productId]=(totals[normalized.productId]||0)+(parseFloat(normalized.qty)||0)*sign;
    });
  });
  return totals;
}

function liveUsageDeductionQty(row){
  const ideal=typeof usageNumber==='function'?usageNumber(row?.idealUsage):parseFloat(row?.idealUsage);
  return ideal===''||!Number.isFinite(ideal)?0:ideal;
}

function liveUsageQtyByProduct(baselineDate=''){
  const totals={};
  ensureUsageLogs().filter(log=>!log.archived).forEach(log=>{
    const period=usageLogPeriod(log);
    if(!liveMovementAfterBaseline(period.end||period.start,baselineDate))return;
    usageLogRows(log).forEach(row=>{
      if(!row.matched||!row.productId)return;
      totals[row.productId]=(totals[row.productId]||0)+liveUsageDeductionQty(row);
    });
  });
  return totals;
}

function selectedLiveInventoryRooms(){
  const rooms=activeFloorPlanRooms();
  if(liveInventoryRoomIds===null)return rooms;
  const valid=rooms.filter(room=>liveInventoryRoomIds.has(room.id));
  if(!valid.length){liveInventoryRoomIds=null;return rooms;}
  return valid;
}
function renderLiveInventoryRoomTabs(){
  const options=document.getElementById('live-room-options');
  const label=document.getElementById('live-room-picker-label');
  if(!options||!label)return;
  const rooms=activeFloorPlanRooms();
  const selected=selectedLiveInventoryRooms();
  const selectedIds=new Set(selected.map(room=>room.id));
  const allSelected=liveInventoryRoomIds===null||selected.length===rooms.length;
  label.textContent=allSelected?'All rooms':selected.length===1?selected[0].name:`${selected.length} rooms`;
  options.innerHTML=rooms.map(room=>`<label class="live-room-option"><input type="checkbox" ${selectedIds.has(room.id)?'checked':''} onchange="toggleLiveInventoryRoom('${room.id}',this.checked)"><span>${escapeHtml(room.name)}</span></label>`).join('')||'<div class="empty-cell">No rooms available.</div>';
}
function selectAllLiveInventoryRooms(){
  liveInventoryRoomIds=null;
  renderLiveInventoryPage();
}
function toggleLiveInventoryRoom(roomId,checked){
  const roomIds=activeFloorPlanRooms().map(room=>room.id);
  if(liveInventoryRoomIds===null)liveInventoryRoomIds=new Set(roomIds);
  if(checked)liveInventoryRoomIds.add(roomId);
  else liveInventoryRoomIds.delete(roomId);
  if(!liveInventoryRoomIds.size){liveInventoryRoomIds.add(roomId);toast('Keep at least one room selected.',true);}
  if(liveInventoryRoomIds.size===roomIds.length)liveInventoryRoomIds=null;
  renderLiveInventoryPage();
}
function inventoryRoomForFloorRoom(inv,floorRoomId){
  if(!inv||!floorRoomId)return null;
  normalizeInventoryRooms(inv);
  return inv.rooms.find(room=>room.roomId===floorRoomId)||null;
}
function resolvedLiveBaselineItems(inv){
  if(!inv)return{};
  if(inv.recordType!=='recount')return inv.items||{};
  const source=recountSourceInventory(inv);
  return{...(source?.items||{}),...(inv.items||{})};
}
function resolvedLiveBaselineRoomItems(inv,floorRoomId){
  if(!inv)return{};
  const room=inventoryRoomForFloorRoom(inv,floorRoomId);
  if(inv.recordType!=='recount')return room?.items||{};
  const sourceRoom=inventoryRoomForFloorRoom(recountSourceInventory(inv),floorRoomId);
  return{...(sourceRoom?.items||{}),...(room?.items||{})};
}
function liveInventoryRows(){
  const baseline=selectedLiveInventoryBaseline();
  const baselineDate=baseline?.date||'';
  const rooms=selectedLiveInventoryRooms();
  const allRooms=liveInventoryRoomIds===null;
  const baselineItems=resolvedLiveBaselineItems(baseline);
  const ordered=allRooms?liveOrderQtyByProduct(baselineDate):{};
  const used=allRooms?liveUsageQtyByProduct(baselineDate):{};
  const allowed=allRooms?null:new Set(rooms.flatMap(room=>roomProductIds(room)));
  const roomLabel=allRooms?'All rooms':rooms.length===1?rooms[0].name:`${rooms.length} rooms`;
  return state.products.filter(product=>!product.archived&&(!allowed||allowed.has(product.id))).map(product=>{
    const base=allRooms?(baselineItems[product.id]??product.lastCount??0):rooms.reduce((sum,room)=>sum+(parseFloat(resolvedLiveBaselineRoomItems(baseline,room.id)?.[product.id])||0),0);
    const orderQty=ordered[product.id]||0;
    const usageQty=used[product.id]||0;
    const live=base+orderQty-usageQty;
    const par=parseFloat(product.par)||0;
    const value=live*(parseFloat(product.cost)||0);
    return{product,name:product.name,category:product.category,subcategory:product.subcategory||'',unit:product.unit||'',base,ordered:orderQty,used:usageQty,live,par,value,baselineDate,roomName:roomLabel};
  });
}

function liveQty(value){
  const number=parseFloat(value)||0;
  return Number.isInteger(number)?String(number):number.toFixed(2);
}

function liveStatusText(row){
  if(row.live<0)return'Negative';
  if(row.par>0&&row.live<=row.par)return'Low / At Par';
  return'OK';
}

function liveStatusClass(row){
  if(row.live<0)return'negative';
  if(row.par>0&&row.live<=row.par)return'low';
  return'ok';
}

function liveStatusBadge(row){
  if(row.live<0)return'<span class="missing-pill"><span class="missing-dot"></span>'+liveStatusText(row)+'</span>';
  if(row.par>0&&row.live<=row.par)return'<span class="missing-pill"><span class="missing-dot"></span>'+liveStatusText(row)+'</span>';
  return'<span class="filled-pill"><span class="filled-dot"></span>OK</span>';
}

function setLiveInventoryViewMode(mode){
  liveInventoryViewMode=['list','icons','boxes','variances'].includes(mode)?mode:'list';
  renderLiveInventoryPage();
}

let liveVarianceSort={col:'variance',dir:'asc'};
function sortLiveVariances(col){
  liveVarianceSort.dir=liveVarianceSort.col===col&&liveVarianceSort.dir==='asc'?'desc':'asc';
  liveVarianceSort.col=col;
  renderLiveInventoryPage();
}
function liveVarianceHeader(label,col){
  const active=liveVarianceSort.col===col;
  return`<th class="sortable ${active?`sort-${liveVarianceSort.dir}`:''}" aria-sort="${active?(liveVarianceSort.dir==='asc'?'ascending':'descending'):'none'}"><button class="table-sort-button" type="button" onclick="sortLiveVariances('${col}')">${label}</button></th>`;
}
function liveInventoryVariances(rows){
  const varianceRows=rows.map(row=>({...row,variance:row.live-row.par}));
  const sorted=sortArr(varianceRows,liveVarianceSort.col,liveVarianceSort.dir);
  return`<div class="table-wrap"><table><thead><tr>${liveVarianceHeader('Product','name')}${liveVarianceHeader('Count','base')}${liveVarianceHeader('Orders','ordered')}${liveVarianceHeader('Usage','used')}${liveVarianceHeader('Live','live')}${liveVarianceHeader('Par','par')}${liveVarianceHeader('Variance','variance')}</tr></thead><tbody>${sorted.map(row=>`<tr onclick="openLiveInventoryDetail('${row.product.id}')"><td><strong>${escapeHtml(row.name)}</strong></td><td>${liveQty(row.base)}</td><td>${liveQty(row.ordered)}</td><td>${liveQty(row.used)}</td><td>${liveQty(row.live)}</td><td>${liveQty(row.par)}</td><td class="${typeof varianceClass==='function'?varianceClass(row.variance):''}">${row.variance>0?'+':''}${liveQty(row.variance)}</td></tr>`).join('')}</tbody></table></div>`;
}

let liveInventoryFilterHome=null;
let liveInventoryFilterNextSibling=null;

function openLiveInventoryFilterSheet(){
  closeAllMenus();
  const sheet=document.getElementById('live-inv-filter-sheet');
  const overlay=document.getElementById('live-inv-filter-overlay');
  if(!sheet)return;
  if(window.innerWidth<=820&&overlay){
    if(!liveInventoryFilterHome){
      liveInventoryFilterHome=sheet.parentElement;
      liveInventoryFilterNextSibling=sheet.nextSibling;
    }
    overlay.appendChild(sheet);
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden','false');
  }
  sheet.scrollTop=0;
  sheet.classList.add('open');
  syncBlockingUiState();
}

function closeLiveInventoryFilterSheet(){
  const sheet=document.getElementById('live-inv-filter-sheet');
  const overlay=document.getElementById('live-inv-filter-overlay');
  sheet?.classList.remove('open');
  overlay?.classList.remove('open');
  overlay?.setAttribute('aria-hidden','true');
  if(sheet&&liveInventoryFilterHome&&sheet.parentElement!==liveInventoryFilterHome){
    if(liveInventoryFilterNextSibling?.parentElement===liveInventoryFilterHome)liveInventoryFilterHome.insertBefore(sheet,liveInventoryFilterNextSibling);
    else liveInventoryFilterHome.appendChild(sheet);
  }
  liveInventoryFilterHome=null;
  liveInventoryFilterNextSibling=null;
  syncBlockingUiState();
}

function updateLiveInventoryFilterSummary(){
  const summary=document.getElementById('live-inv-filter-summary');
  if(!summary)return;
  const category=document.getElementById('live-inv-cat-f')?.value||'';
  const subcategory=document.getElementById('live-inv-sub-f')?.value||'';
  const status=document.getElementById('live-inv-status-f')?.value||'';
  const sort=document.getElementById('live-inv-sort-f')?.value||'name-asc';
  const roomFiltered=liveInventoryRoomIds!==null;
  const manualBaseline=liveInventoryBaselineId&&liveInventoryBaselineId!==latestInventoryCount()?.id;
  const active=[category,subcategory,status,sort!=='name-asc'?sort:'',roomFiltered?'rooms':'',manualBaseline?'baseline':''].filter(Boolean).length;
  summary.textContent=active?`${active} active`:'Default';
}

function renderLiveInventoryViewButtons(){
  document.querySelectorAll('#live-inv-view-mode button').forEach(button=>{
    const onclick=button.getAttribute('onclick')||'';
    button.classList.toggle('active',onclick.includes(`'${liveInventoryViewMode}'`));
  });
}

function liveInventoryEmpty(message){
  return`<div class="empty-cell" style="padding:28px;text-align:center;color:var(--text-muted);">${message}</div>`;
}

function liveInventoryList(rows){
  return`<div class="live-inv-list">${rows.map(row=>`
    <button type="button" class="live-inv-list-row" onclick="openLiveInventoryDetail('${row.product.id}')">
      <span class="live-item-status ${liveStatusClass(row)}"><span class="live-status-dot ${liveStatusClass(row)}"></span>${liveStatusText(row)}</span>
      <span class="live-item-name">${escapeHtml(row.name)}</span>
      <span class="live-item-count"><span>Count</span>${liveQty(row.base)}</span>
      <span class="live-item-qty"><span>Live</span>${liveQty(row.live)}</span>
    </button>
  `).join('')}</div>`;
}

function liveInventoryIcons(rows){
  return`<div class="live-inv-grid icons">${rows.map(row=>`
    <button type="button" class="live-inv-icon ${liveStatusClass(row)}" onclick="openLiveInventoryDetail('${row.product.id}')">
      <span class="live-item-status ${liveStatusClass(row)}"><span class="live-status-dot ${liveStatusClass(row)}"></span>${liveStatusText(row)}</span>
      <span class="live-inv-glyph">${escapeHtml((row.name||'?').slice(0,1).toUpperCase())}</span>
      <span class="live-item-name">${escapeHtml(row.name)}</span>
      <span class="live-item-qty">${liveQty(row.live)}</span>
      <span class="live-item-count">Count ${liveQty(row.base)}</span>
    </button>
  `).join('')}</div>`;
}

function liveInventoryBoxes(rows){
  return`<div class="live-inv-grid boxes">${rows.map(row=>`
    <button type="button" class="live-inv-box ${liveStatusClass(row)}" onclick="openLiveInventoryDetail('${row.product.id}')">
      <span class="live-item-status ${liveStatusClass(row)}"><span class="live-status-dot ${liveStatusClass(row)}"></span>${liveStatusText(row)}</span>
      <span class="live-item-name">${escapeHtml(row.name)}</span>
      <span class="live-item-qty">${liveQty(row.live)}</span>
      <span class="live-item-count">Count ${liveQty(row.base)}</span>
    </button>
  `).join('')}</div>`;
}

function renderLiveInventoryPage(){
  const results=document.getElementById('live-inv-results');
  if(!results)return;
  renderLiveInventoryRoomTabs();
  renderLiveInventoryBaselineOptions();
  renderLiveInventoryViewButtons();
  updateLiveInventoryFilterSummary();
  if(!state.products.length){
    results.innerHTML=liveInventoryEmpty('Loading live inventory...');
    setTimeout(()=>{if(document.getElementById('page-live-inventory')?.classList.contains('active'))renderLiveInventoryPage();},600);
    return;
  }
  const search=(document.getElementById('live-inv-search')?.value||'').toLowerCase();
  const cat=document.getElementById('live-inv-cat-f')?.value||'';
  const sub=document.getElementById('live-inv-sub-f')?.value||'';
  const status=document.getElementById('live-inv-status-f')?.value||'';
  const sort=document.getElementById('live-inv-sort-f')?.value||'name-asc';
  const baseline=selectedLiveInventoryBaseline();
  const allLiveRows=liveInventoryRows();
  const selectedRooms=selectedLiveInventoryRooms();
  const allRooms=liveInventoryRoomIds===null;
  const roomLabel=allRooms?'All rooms':selectedRooms.length===1?selectedRooms[0].name:`${selectedRooms.length} rooms`;
  let rows=allLiveRows.filter(row=>
    (!cat||row.category===cat)&&
    (!sub||row.subcategory===sub)&&
    (!search||row.name.toLowerCase().includes(search)||(row.product.aliases||'').toLowerCase().includes(search)||row.subcategory.toLowerCase().includes(search))
  );
  if(status==='low')rows=rows.filter(row=>row.par>0&&row.live<=row.par);
  if(status==='negative')rows=rows.filter(row=>row.live<0);
  if(status==='movement')rows=rows.filter(row=>row.ordered||row.used);
  const [sortColumn,sortDirection]=sort.split('-');
  sortState.liveInventory={col:sortColumn||'name',dir:sortDirection||'asc'};
  rows=sortArr(rows,sortState.liveInventory.col,sortState.liveInventory.dir);
  const totalValue=rows.reduce((sum,row)=>sum+row.value,0);
  const lowCount=allLiveRows.filter(row=>row.par>0&&row.live<=row.par).length;
  const negativeCount=allLiveRows.filter(row=>row.live<0).length;
  const movementCount=allLiveRows.filter(row=>row.ordered||row.used).length;
  const stats=document.getElementById('live-inv-stats');
  if(stats)stats.innerHTML=`
    <div class="stat-card"><div class="label">Rooms</div><div class="value" style="font-size:1rem;">${escapeHtml(roomLabel)}</div><div class="sub">${allRooms?'Merged inventory':`Combined count from ${selectedRooms.length} selected room${selectedRooms.length===1?'':'s'}`}</div></div>
    <div class="stat-card"><div class="label">Baseline Count</div><div class="value" style="font-size:1rem;">${baseline?fmtDate(baseline.date):'—'}</div><div class="sub">${baseline?.label||'No count filed'}</div></div>
    <div class="stat-card"><div class="label">Visible Value</div><div class="value">${fmt(totalValue)}</div></div>
    <div class="stat-card"><div class="label">Low / At Par</div><div class="value" style="color:${lowCount?'var(--danger)':'var(--success)'}">${lowCount}</div></div>
    <div class="stat-card"><div class="label">Negative</div><div class="value" style="color:${negativeCount?'var(--danger)':'var(--success)'}">${negativeCount}</div></div>
    <div class="stat-card"><div class="label">With Movement</div><div class="value">${movementCount}</div></div>
  `;
  if(!rows.length){
    results.innerHTML=liveInventoryEmpty('No live inventory rows match.');
    return;
  }
  if(liveInventoryViewMode==='variances')results.innerHTML=liveInventoryVariances(rows);
  else if(liveInventoryViewMode==='icons')results.innerHTML=liveInventoryIcons(rows);
  else if(liveInventoryViewMode==='boxes')results.innerHTML=liveInventoryBoxes(rows);
  else results.innerHTML=liveInventoryList(rows);
}

function openLiveInventoryDetail(productId){
  const row=liveInventoryRows().find(item=>item.product.id===productId);
  if(!row)return;
  const body=document.getElementById('live-inv-detail-body');
  const baseline=selectedLiveInventoryBaseline();
  body.innerHTML=`
    <div class="product-view-head">
      <div>
        <h3 id="live-inv-detail-title">${escapeHtml(row.name)}</h3>
        <div class="product-view-meta">${liveStatusBadge(row)} ${catBadge(row.category)} ${subBadge(row.subcategory)} <span class="sub-badge">${escapeHtml(row.roomName)}</span></div>
      </div>
      <div class="detail-heading-actions"><button class="detail-close" type="button" aria-label="Close live inventory detail" title="Close" onclick="closeModal('modal-live-inv-detail')">&times;</button></div>
    </div>
    <div class="product-detail-grid">
      <div class="product-detail-field"><div class="label">Live Quantity</div><div class="value">${liveQty(row.live)}</div></div>
      <div class="product-detail-field"><div class="label">Latest Count</div><div class="value">${liveQty(row.base)}</div></div>
      <div class="product-detail-field"><div class="label">Orders In</div><div class="value">${row.ordered?`+${liveQty(row.ordered)}`:'—'}</div></div>
      <div class="product-detail-field"><div class="label">Usage Out</div><div class="value">${row.used?`-${liveQty(row.used)}`:'—'}</div></div>
      <div class="product-detail-field"><div class="label">Par</div><div class="value">${row.par||'—'}</div></div>
      <div class="product-detail-field"><div class="label">Value</div><div class="value">${fmt(row.value)}</div></div>
    </div>
    <div class="product-view-section"><div class="label">Baseline</div><p>${baseline?`${fmtDate(baseline.date)}${baseline.label?' · '+escapeHtml(baseline.label):''}`:'No count filed yet.'}</p></div>
  `;
  openModal('modal-live-inv-detail');
}

function initLiveCounts(ex,selectedRoomId=null){
  liveInvCounts={};
  if(ex){
    normalizeInventoryRooms(ex);
    currentInvRooms=[];
    const room=ex.rooms.find(item=>item.id===selectedRoomId)||ex.rooms[0];
    currentInvRoomId=room.id;
    currentRoomProducts().forEach(p=>{liveInvCounts[p.id]=room.items[p.id]!==undefined?room.items[p.id]:'';});
    return;
  }
  currentInvRooms=activeFloorPlanRooms().map(room=>({id:uid(),roomId:room.id,name:room.name,items:{},extraProductIds:[]}));
  if(!currentInvRooms.length)currentInvRooms=[defaultInventoryRoom()];
  currentInvRoomId=currentInvRooms[0].id;
  currentRoomProducts().forEach(p=>{liveInvCounts[p.id]='';});
}
function inventorySectionProgress(category,subcategory){
  const items=currentCountProducts().filter(product=>{const group=countProductDisplayGroup(product);return group.category===category&&group.subcategory===subcategory;});
  const filled=items.filter(product=>{const value=liveInvCounts[product.id];return value!==''&&value!==null&&value!==undefined;}).length;
  return{filled,total:items.length,complete:items.length>0&&filled===items.length};
}
function syncInventorySectionCompletion(section){
  if(!section?.dataset.sectionToken)return;
  const token=decodeURIComponent(section.dataset.sectionToken).split('|||');
  const progress=inventorySectionProgress(token[1]||'',token[2]||'Other');
  section.classList.toggle('complete',progress.complete);
  const count=section.querySelector('.inv-section-summary-count');
  if(count)count.textContent=`${progress.filled}/${progress.total}`;
}
function onInvInput(pid,el){liveInvCounts[pid]=el.value===''?'':parseFloat(el.value);hideInventoryFinishMessage();const row=document.getElementById('row-'+pid);if(!row)return;const dot=row.querySelector('.missing-dot,.filled-dot');const f=el.value!=='';if(dot)dot.className=f?'filled-dot':'missing-dot';row.className='inv-count-row '+(f?'filled-row':'missing-row');syncInventorySectionCompletion(row.closest('.inv-count-section'));prepareFollowingInventorySection(el);updateInvProgress();}
function invQtyInputs(){return[...document.querySelectorAll('#inv-rows input[data-count-input="true"]')];}
function expandInventorySectionElement(section){
  if(!section||!section.classList.contains('collapsed'))return;
  section.classList.remove('collapsed');
  section.querySelector('.inv-section-header')?.setAttribute('aria-expanded','true');
  const items=section.querySelector('.inv-section-items');
  if(items)items.hidden=false;
  if(section.dataset.sectionToken)expandedInventorySections.add(section.dataset.sectionToken);
}
function prepareFollowingInventorySection(input){
  const section=input?.closest('.inv-count-section');
  if(!section)return;
  const sectionInputs=[...section.querySelectorAll('input[data-count-input="true"]')];
  if(sectionInputs.at(-1)!==input)return;
  expandInventorySectionElement(section.nextElementSibling?.matches('.inv-count-section')?section.nextElementSibling:null);
}
function scrollInventoryInputIntoView(input){
  requestAnimationFrame(()=>input.scrollIntoView({behavior:'smooth',block:'center',inline:'nearest'}));
}
function focusInvQtyInput(current,step=1){
  const inputs=invQtyInputs();
  const index=inputs.indexOf(current);
  const next=inputs[index+step];
  if(next){
    expandInventorySectionElement(next.closest('.inv-count-section'));
    next.focus();
    next.select();
    scrollInventoryInputIntoView(next);
  }else if(step>0){
    current.blur();
  }
}
function onInvQtyFocus(input){setTimeout(()=>{input.select();prepareFollowingInventorySection(input);scrollInventoryInputIntoView(input);},0);}
function onInvQtyKey(event,input){
  if(event.key!=='Enter'&&event.key!=='Tab')return;
  event.preventDefault();
  focusInvQtyInput(input,event.shiftKey?-1:1);
}
function usageCountOrderMap(){
  const map=new Map();
  const template=state.inventoryEntryTemplate;
  if(template&&Array.isArray(template.items)&&template.items.length){
    template.items
      .filter(item=>item&&item.productId)
      .sort((a,b)=>(Number.isFinite(a.sourceOrder)?a.sourceOrder:Number.MAX_SAFE_INTEGER)-(Number.isFinite(b.sourceOrder)?b.sourceOrder:Number.MAX_SAFE_INTEGER))
      .forEach(item=>{if(!map.has(item.productId))map.set(item.productId,map.size);});
    return map;
  }
  const logs=typeof ensureUsageLogs==='function'?ensureUsageLogs().filter(log=>!log.archived):[];
  const orderedLogs=[...logs].sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
  orderedLogs.forEach(log=>{
    const rows=typeof usageLogRows==='function'?usageLogRows(log):(log.rows||[]);
    [...rows].sort((a,b)=>(Number.isFinite(a.sourceOrder)?a.sourceOrder:Number.MAX_SAFE_INTEGER)-(Number.isFinite(b.sourceOrder)?b.sourceOrder:Number.MAX_SAFE_INTEGER)).forEach(row=>{
      if(row.productId&&!map.has(row.productId))map.set(row.productId,map.size);
    });
  });
  return map;
}
function sortedInventoryProducts(products,mode){
  if(mode==='alpha')return[...products].sort((a,b)=>a.name.localeCompare(b.name));
  if(mode==='usage'){
    const usageOrder=usageCountOrderMap();
    return[...products].sort((a,b)=>{
      const ai=usageOrder.has(a.id)?usageOrder.get(a.id):Number.MAX_SAFE_INTEGER;
      const bi=usageOrder.has(b.id)?usageOrder.get(b.id):Number.MAX_SAFE_INTEGER;
      return ai-bi||a.name.localeCompare(b.name);
    });
  }
  return[...products].sort((a,b)=>{
    const ag=countProductDisplayGroup(a),bg=countProductDisplayGroup(b);
    return ag.category.localeCompare(bg.category)||
      ag.subcategory.localeCompare(bg.subcategory)||
      a.name.localeCompare(b.name);
  });
}
function openInventoryRoomSelect(){
  document.getElementById('room-count-date').value=today();
  document.getElementById('room-count-label').value='';
  openModal('modal-inv-room-select');
}
function setCountDraftSaving(saving){
  countDraftSaving=saving;
  const button=document.getElementById('mobile-count-continue');
  if(!button)return;
  button.disabled=saving;
  button.setAttribute('aria-busy',String(saving));
  button.textContent=saving?'Creating…':'Create Draft';
}
async function continueMobileCountSetup(){
  if(countDraftSaving)return;
  const date=document.getElementById('room-count-date').value||today();
  const label=document.getElementById('room-count-label').value.trim();
  if(!date){toast('Select a date.',true);return;}
  if(!label){toast('Name this count before creating the draft.',true);document.getElementById('room-count-label').focus();return;}
  const rooms=typeof accessibleFloorPlanRooms==='function'?accessibleFloorPlanRooms():activeFloorPlanRooms();
  if(!rooms.length){toast('Add a room in Settings before starting a count.',true);return;}
  setCountDraftSaving(true);
  try{
    const draft=await createCountDraft(date,label,rooms);
    if(!draft)return;
    closeModal('modal-inv-room-select');
    await openCountRoomPicker(draft.id);
  }finally{
    setCountDraftSaving(false);
  }
}
function draftRoomsFromFloorPlan(floorRooms=activeFloorPlanRooms()){
  return floorRooms.map(room=>({id:uid(),roomId:room.id,name:room.name,items:{},extraProductIds:[]}));
}
async function createCountDraft(date,label,floorRooms=activeFloorPlanRooms()){
  const existing=findInventorySession(date,label);
  if(existing){
    ensureInventoryHasFloorPlanRooms(existing);
    existing.items=mergeInventoryRoomItems(existing.rooms);
    renderInventoryTable();
    toast(existing.draft?'Opening the existing draft.':'Opening the existing count.');
    return existing;
  }
  const rooms=draftRoomsFromFloorPlan(floorRooms);
  if(!rooms.length){toast('Add rooms in Settings first.',true);return;}
  const id=uid();
  const actor=window.serverAccessContext?.user||{};
  const createdBy={id:actor.id||'',name:actor.name||'Team member',role:actor.jobTitle||actor.role||'Team member'};
  const draft={id,date,label,items:{},rooms,draft:true,status:'saved',finalised:false,recordType:'count',createdBy,createdAt:new Date().toISOString(),history:[inventoryHistoryEvent('created',{label,date,recordType:'count'})]};
  const shared=typeof cloudCreateCountDraft==='function'?await cloudCreateCountDraft(draft):null;
  if(!shared){toast('Could not create the shared count. Try again.',true);return null;}
  state=shared.state;
  normalizeLoadedState();
  try{localStorage.setItem('keg_bar_v5',JSON.stringify(state));}catch(error){}
  renderInventoryTable();
  refreshLiveInventoryIfVisible();
  window.recordServerEvent?.({action:'count.draft_created',entityType:'count',entityId:shared.draft.id,details:{label,date,rooms:rooms.length,actor:createdBy}});
  toast(shared.draft.id===id?'Count created. Choose a room.':'Opening the existing count.');
  return shared.draft;
}

function countRoomLockFor(roomId){return countRoomPickerLocks.find(lock=>lock.roomId===roomId)||null;}
function renderCountRoomPicker(){
  const list=document.getElementById('count-room-picker-list');
  const context=document.getElementById('count-room-picker-context');
  const inv=state.inventories.find(item=>item.id===countRoomPickerCountId);
  if(!list||!inv)return;
  normalizeInventoryRooms(inv);
  if(context)context.textContent=`${inv.label||'Inventory Count'} · ${fmtDate(inv.date)} — select one room.${localOnlyMode?' Local-only mode: this count stays in this browser.':' Other team members can count different rooms at the same time.'}`;
  const finaliseButton=document.getElementById('count-picker-finalise');
  if(finaliseButton){finaliseButton.disabled=!Object.keys(inv.items||{}).length;finaliseButton.textContent=`Finalise ${inv.recordType==='recount'?'Re-count':'Count'}`;}
  const accessible=inv.rooms.filter(room=>typeof profileCanAccessRoom!=='function'||profileCanAccessRoom(currentProfile(),room.roomId));
  list.innerHTML=accessible.map(room=>{
    const lock=countRoomLockFor(room.id);
    const unavailable=lock&&!lock.mine;
    const counted=Object.keys(room.items||{}).length;
    const uncounted=inventoryUncountedEntries(inv).filter(entry=>entry.roomId===room.id).length;
    const detail=unavailable?`${lock.holderName||'A team member'} is counting this room right now.`:lock?.mine?'Reserved by you. Select to continue.':`${counted} item${counted===1?'':'s'} saved · ${uncounted} uncounted · Available to count`;
    return`<button class="count-room-picker-card ${unavailable?'is-locked':''}" type="button" ${unavailable?'disabled aria-disabled="true"':''} onclick="enterCountRoom('${room.id}')"><span class="count-room-picker-copy"><strong>${escapeHtml(room.name)}</strong><span>${escapeHtml(detail)}</span></span><em class="count-room-picker-status">${unavailable?'In use':lock?.mine?'Continue':'Open'}</em></button>`;
  }).join('')||'<div class="count-room-picker-loading">No rooms are available for your account.</div>';
}
async function refreshCountRoomPicker(){
  if(!countRoomPickerCountId)return;
  const locks=typeof cloudLoadCountRoomLocks==='function'?await cloudLoadCountRoomLocks(countRoomPickerCountId):[];
  if(locks===null){
    const list=document.getElementById('count-room-picker-list');
    if(list)list.innerHTML='<div class="count-room-picker-loading">Room availability could not be loaded. Try again.</div>';
    return;
  }
  countRoomPickerLocks=locks;
  renderCountRoomPicker();
}
async function openCountRoomPicker(countId,preferredRoomId=null){
  const inv=state.inventories.find(item=>item.id===countId);
  if(!inv){toast('Count not found.',true);return;}
  if(inventoryIsFinalised(inv)){toast('This count is finalised and can no longer be changed.',true);return;}
  countRoomPickerCountId=countId;
  countRoomPickerLocks=[];
  const list=document.getElementById('count-room-picker-list');
  if(list)list.innerHTML='<div class="count-room-picker-loading">Checking room availability…</div>';
  openModal('modal-inv-room-picker');
  await refreshCountRoomPicker();
  clearInterval(countRoomPickerRefreshTimer);
  countRoomPickerRefreshTimer=setInterval(refreshCountRoomPicker,10000);
  const preferredLock=preferredRoomId?countRoomLockFor(preferredRoomId):null;
  if(preferredRoomId&&(!preferredLock||preferredLock.mine))await enterCountRoom(preferredRoomId);
}
function closeCountRoomPicker(){
  clearInterval(countRoomPickerRefreshTimer);
  countRoomPickerRefreshTimer=null;
  countRoomPickerCountId=null;
  countRoomPickerLocks=[];
  closeModal('modal-inv-room-picker');
}
async function enterCountRoom(roomId){
  if(!countRoomPickerCountId)return;
  const inv=state.inventories.find(item=>item.id===countRoomPickerCountId);
  if(inventoryIsFinalised(inv)){closeCountRoomPicker();toast('This count is finalised and can no longer be changed.',true);return;}
  const room=inv?.rooms?.find(item=>item.id===roomId);
  if(!room)return;
  if(typeof profileCanAccessRoom==='function'&&!profileCanAccessRoom(currentProfile(),room.roomId)){toast('You do not have access to that room.',true);return;}
  const result=typeof cloudAcquireCountRoom==='function'?await cloudAcquireCountRoom(countRoomPickerCountId,roomId):null;
  if(!result){toast('Could not reserve this room. Try again.',true);return;}
  if(!result.acquired){
    countRoomPickerLocks=countRoomPickerLocks.filter(lock=>lock.roomId!==roomId).concat(result.lock?[result.lock]:[]);
    renderCountRoomPicker();
    toast(`${result.lock?.holderName||'Another team member'} is counting this room right now.`,true);
    return;
  }
  currentCountRoomLock={countId:countRoomPickerCountId,roomId};
  clearInterval(countRoomPickerRefreshTimer);
  countRoomPickerRefreshTimer=null;
  countRoomPickerCountId=null;
  countRoomPickerLocks=[];
  closeModal('modal-inv-room-picker');
  if(typeof resetInventoryTranscribeHistory==='function')resetInventoryTranscribeHistory();
  startCountRoomHeartbeat();
  openInventoryModal(currentCountRoomLock.countId,currentCountRoomLock.roomId);
}
function startCountRoomHeartbeat(){
  clearInterval(countRoomLockHeartbeatTimer);
  countRoomLockHeartbeatTimer=setInterval(async()=>{
    if(!currentCountRoomLock)return;
    const lock={...currentCountRoomLock};
    const result=await cloudAcquireCountRoom(lock.countId,lock.roomId);
    if(result?.acquired)return;
    if(result===null){toast('The room reservation could not be renewed. Check your connection.',true);return;}
    toast(`${result?.lock?.holderName||'Another team member'} now has this room. Your unsaved entries were not saved.`,true);
    await exitInventoryRoom(true);
  },45000);
}
function inventoryRoomHasUnsavedChanges(){
  const room=currentInventoryRoom();
  if(!room)return false;
  const visible={};
  currentRoomProducts().forEach(product=>{
    const value=liveInvCounts[product.id];
    if(value!==''&&value!==null&&value!==undefined&&!isNaN(value))visible[product.id]=parseFloat(value);
  });
  return dirtyInventoryRoomIds.has(room.id)||!inventoryRoomItemsEqual(room.items,visible);
}
async function exitInventoryRoom(force=false){
  if(inventoryRoomExitInProgress||inventoryCountSaving)return;
  if(!force&&inventoryRoomHasUnsavedChanges()&&!confirm('Exit this room without saving your changes?'))return;
  inventoryRoomExitInProgress=true;
  const lock=currentCountRoomLock?{...currentCountRoomLock}:null;
  clearInterval(countRoomLockHeartbeatTimer);
  countRoomLockHeartbeatTimer=null;
  const room=currentInventoryRoom();
  if(room)room.extraProductIds=[...currentInventoryRoomOriginalExtraProductIds];
  currentInventoryRoomOriginalExtraProductIds=[];
  closeModal('modal-count-add-item');
  if(lock&&typeof cloudReleaseCountRoom==='function')await cloudReleaseCountRoom(lock.countId,lock.roomId);
  currentCountRoomLock=null;
  if(typeof resetInventoryTranscribeHistory==='function')resetInventoryTranscribeHistory();
  closeModal('modal-inventory');
  inventoryRoomExitInProgress=false;
  if(lock)await openCountRoomPicker(lock.countId);
}
function sameInventorySession(inv,date,label){
  return String(inv.date||'')===String(date||'')&&String(inv.label||'').trim().toLowerCase()===String(label||'').trim().toLowerCase();
}
function findInventorySession(date,label){
  return state.inventories.find(inv=>sameInventorySession(inv,date,label));
}
function replaceInventoryRoom(inv,room){
  ensureInventoryHasFloorPlanRooms(inv);
  const index=inv.rooms.findIndex(item=>(room.roomId&&item.roomId===room.roomId)||item.id===room.id);
  if(index>=0)inv.rooms[index]={...inv.rooms[index],name:room.name,roomId:room.roomId,items:room.items,extraProductIds:[...(room.extraProductIds||[])]};
  else inv.rooms.push(room);
  inv.items=mergeInventoryRoomItems(inv.rooms);
  inv.draft=!Object.keys(inv.items).length;
}
function cloneInventoryRoom(room){
  return{...room,items:{...(room.items||{})},extraProductIds:[...(room.extraProductIds||[])]};
}
function mergeEditedInventoryRooms(cloudRooms,editedRooms,deletedIds=new Set()){
  const rooms=(cloudRooms||[]).filter(room=>!deletedIds.has(room.id)).map(cloneInventoryRoom);
  (editedRooms||[]).forEach(edited=>{
    const index=rooms.findIndex(room=>room.id===edited.id||(edited.roomId&&room.roomId===edited.roomId));
    if(index>=0)rooms[index]={...rooms[index],...cloneInventoryRoom(edited)};
    else rooms.push(cloneInventoryRoom(edited));
  });
  return rooms;
}
function inventoryRoomsEqual(a=[],b=[]){
  if(a.length!==b.length)return false;
  return a.every(room=>{
    const match=b.find(candidate=>candidate.id===room.id||(room.roomId&&candidate.roomId===room.roomId));
    const leftExtras=[...(room.extraProductIds||[])].sort();
    const rightExtras=[...(match?.extraProductIds||[])].sort();
    return!!match&&room.name===match.name&&inventoryRoomItemsEqual(room.items,match.items)&&JSON.stringify(leftExtras)===JSON.stringify(rightExtras);
  });
}
async function inventorySavedInCloud(id,date,label,rooms){
  if(!cloudReady||typeof cloudLoad!=='function')return true;
  const latest=await cloudLoad();
  if(!latest||!Array.isArray(latest.inventories))return false;
  const saved=latest.inventories.find(inv=>inv.id===id);
  if(!saved)return false;
  normalizeInventoryRooms(saved);
  return String(saved.date||'')===String(date||'')&&
    String(saved.label||'')===String(label||'')&&
    inventoryRoomsEqual(rooms,saved.rooms);
}
function openInventoryModal(existingId=null,selectedRoomId=null){
  const ex=existingId?state.inventories.find(i=>i.id===existingId):null;
  if(!ex||!selectedRoomId){
    if(existingId)openCountRoomPicker(existingId);
    else openInventoryRoomSelect();
    return;
  }
  if(inventoryIsFinalised(ex)){toast('This count is finalised and can no longer be changed.',true);return;}
  dirtyInventoryRoomIds=new Set();
  deletedInventoryRoomIds=new Set();
  expandedInventorySections=new Set();
  hideInventoryFinishMessage();
  setInventoryFinishSaving(false);
  currentInvEdit=existingId;
  ensureInventoryHasFloorPlanRooms(ex);
  if(!ex.rooms.some(room=>room.id===selectedRoomId)){toast('That room is no longer part of this count.',true);return;}
  document.getElementById('inv-date').value=ex.date;document.getElementById('inv-label').value=ex.label||'';
  initLiveCounts(ex,selectedRoomId);
  currentInventoryRoomOriginalExtraProductIds=[...(currentInventoryRoom()?.extraProductIds||[])];
  currentInvMergedView=false;
  document.getElementById('inv-search').value='';document.getElementById('inv-cat-f').value='';
  document.getElementById('inv-sub-f').innerHTML='<option value="">All</option>';document.getElementById('inv-show-f').value='all';document.getElementById('inv-sort-f').value='category';
  document.getElementById('inventory-count-title').textContent=`${ex.recordType==='recount'?`Re-count ${ex.recountNumber||''}`:'Count'} ${currentInventoryRoom()?.name||'Room'}`.replace(/\s+/g,' ');
  document.getElementById('mobile-count-label').textContent=document.getElementById('inv-label').value||'Inventory Count';
  document.getElementById('mobile-count-date').textContent=fmtDate(document.getElementById('inv-date').value);
  closeInventoryFilterSheet();
  renderInventoryRooms();renderInvRows(true);openModal('modal-inventory');
}

function countExtraProductCandidates(){
  const assigned=new Set(currentRoomProducts().map(product=>product.id));
  const query=(document.getElementById('count-extra-product-search')?.value||'').trim().toLowerCase();
  return state.products.filter(product=>{
    if(product.archived||assigned.has(product.id))return false;
    if(!query)return true;
    return[product.name,product.inventoryName,product.aliases,product.sku,product.category,product.subcategory]
      .some(value=>String(value||'').toLowerCase().includes(query));
  }).sort((a,b)=>String(a.inventoryName||a.name).localeCompare(String(b.inventoryName||b.name)));
}
function countExtraCategoryToken(category){return encodeURIComponent(String(category||'Other'));}
function toggleCountExtraCategory(category){
  const token=countExtraCategoryToken(category);
  if(expandedCountExtraCategories.has(token))expandedCountExtraCategories.delete(token);
  else expandedCountExtraCategories.add(token);
  renderCountExtraProductPicker();
}
function setCountExtraProductSelected(productId,selected){
  if(selected)countExtraSelectedProductIds.add(productId);
  else countExtraSelectedProductIds.delete(productId);
  renderCountExtraProductPicker();
}
function setCountExtraCategorySelected(category,selected){
  countExtraProductCandidates().filter(product=>(product.category||'Other')===category).forEach(product=>{
    if(selected)countExtraSelectedProductIds.add(product.id);
    else countExtraSelectedProductIds.delete(product.id);
  });
  expandedCountExtraCategories.add(countExtraCategoryToken(category));
  renderCountExtraProductPicker();
}
function updateCountExtraSelectionSummary(){
  const count=countExtraSelectedProductIds.size;
  const summary=document.getElementById('count-extra-selected-count');
  const button=document.getElementById('count-extra-add-selected');
  if(summary)summary.textContent=`${count} selected`;
  if(button){button.disabled=count===0;button.textContent=count?`Add ${count} Selected`:'Add Selected';}
}
function renderCountExtraProductPicker(){
  const list=document.getElementById('count-extra-product-list');
  if(!list)return;
  const products=countExtraProductCandidates();
  const query=(document.getElementById('count-extra-product-search')?.value||'').trim();
  const groups={};
  products.slice(0,200).forEach(product=>{const category=product.category||'Other';(groups[category]||=([])).push(product);});
  list.innerHTML=Object.entries(groups).map(([category,items])=>{
    const token=countExtraCategoryToken(category);
    const expanded=!!query||expandedCountExtraCategories.has(token);
    const selectedCount=items.filter(product=>countExtraSelectedProductIds.has(product.id)).length;
    const allSelected=items.length>0&&selectedCount===items.length;
    return`<section class="count-extra-category ${expanded?'':'collapsed'}">
      <div class="count-extra-category-head">
        <button type="button" class="count-extra-category-toggle" aria-expanded="${expanded}" onclick="toggleCountExtraCategory(decodeURIComponent('${token}'))"><span>${catBadge(category)} <strong>${items.length} item${items.length===1?'':'s'}</strong></span><span class="inv-section-chevron" aria-hidden="true">⌄</span></button>
        <label class="count-extra-category-select"><input type="checkbox" ${allSelected?'checked':''} ${selectedCount&&!allSelected?'data-partial="true"':''} onchange="setCountExtraCategorySelected(decodeURIComponent('${token}'),this.checked)"><span>Select category</span></label>
      </div>
      <div class="count-extra-category-items" ${expanded?'':'hidden'}>${items.map(product=>`<label class="count-extra-product-card ${countExtraSelectedProductIds.has(product.id)?'selected':''}"><input type="checkbox" ${countExtraSelectedProductIds.has(product.id)?'checked':''} onchange="setCountExtraProductSelected('${escapeHtml(product.id)}',this.checked)"><span><strong>${escapeHtml(product.inventoryName||product.name)}</strong><small>${product.subcategory?`${escapeHtml(product.subcategory)} · `:''}${escapeHtml(product.unit||'unit')}</small></span></label>`).join('')}</div>
    </section>`;
  }).join('')||'<div class="count-extra-product-empty">No other products match your search.</div>';
  list.querySelectorAll('input[data-partial="true"]').forEach(input=>{input.indeterminate=true;});
  updateCountExtraSelectionSummary();
}
function openCountExtraProductPicker(){
  if(!currentCountRoomLock||currentCountRoomLock.countId!==currentInvEdit||currentCountRoomLock.roomId!==currentInvRoomId){toast('This room is not reserved for you.',true);return;}
  const room=currentInventoryRoom();
  document.getElementById('count-extra-product-room').textContent=`Add a product to ${room?.name||'this room'} for this count only. Room Settings and future counts will not change.`;
  const search=document.getElementById('count-extra-product-search');
  if(search)search.value='';
  countExtraSelectedProductIds=new Set();
  expandedCountExtraCategories=new Set();
  renderCountExtraProductPicker();
  openModal('modal-count-add-item');
  setTimeout(()=>search?.focus(),0);
}
function addCountExtraProducts(productIds,{closePicker=true,focusProductId=null}={}){
  const room=currentInventoryRoom();
  const products=productIds.map(productId=>state.products.find(item=>item.id===productId&&!item.archived)).filter(Boolean);
  if(!room||!products.length||!currentCountRoomLock||currentCountRoomLock.countId!==currentInvEdit||currentCountRoomLock.roomId!==room.id){toast('This room is no longer reserved for you.',true);return[];}
  room.extraProductIds=[...new Set([...(room.extraProductIds||[]),...products.map(product=>product.id)])];
  products.forEach(product=>{liveInvCounts[product.id]=room.items?.[product.id]??liveInvCounts[product.id]??'';});
  dirtyInventoryRoomIds.add(room.id);
  if(closePicker)closeModal('modal-count-add-item');
  document.getElementById('inv-search').value='';
  document.getElementById('inv-cat-f').value='';
  document.getElementById('inv-sub-f').innerHTML='<option value="">All</option>';
  document.getElementById('inv-show-f').value='all';
  products.forEach(product=>{const group=countProductDisplayGroup(product,room);expandedInventorySections.add(encodeURIComponent(`${currentInvRoomId||''}|||${group.category}|||${group.subcategory}`));});
  renderInvRows();
  const focusId=focusProductId||products[0]?.id;
  if(focusId)setTimeout(()=>document.getElementById('invq-'+focusId)?.focus(),0);
  toast(`${products.length} item${products.length===1?'':'s'} added to ${room.name} for this count only.`);
  return products;
}
function addCountExtraProduct(productId){return addCountExtraProducts([productId]);}
function addSelectedCountExtraProducts(){
  const added=addCountExtraProducts([...countExtraSelectedProductIds]);
  if(added.length)countExtraSelectedProductIds=new Set();
}
function removeCountExtraProduct(productId){
  const room=currentInventoryRoom();
  const product=state.products.find(item=>item.id===productId);
  if(!room||!(room.extraProductIds||[]).includes(productId)||currentInvMergedView)return;
  room.extraProductIds=(room.extraProductIds||[]).filter(id=>id!==productId);
  delete liveInvCounts[productId];
  dirtyInventoryRoomIds.add(room.id);
  renderInvRows();
  toast(`${product?.inventoryName||product?.name||'Item'} removed from this count.`);
}
function openInventoryFilterSheet(){
  closeAllMenus();
  const sheet=document.getElementById('inv-filter-sheet');
  if(!sheet)return;
  sheet.scrollTop=0;
  sheet.classList.add('open');
  syncMobileSheetBackdrop();
}
function closeInventoryFilterSheet(){document.getElementById('inv-filter-sheet')?.classList.remove('open');syncMobileSheetBackdrop();}
function updateInventoryFilterSummary(){
  const summary=document.getElementById('inv-filter-summary');
  if(!summary)return;
  const cat=document.getElementById('inv-cat-f')?.value||'';
  const sub=document.getElementById('inv-sub-f')?.value||'';
  const show=document.getElementById('inv-show-f')?.value||'all';
  const sort=document.getElementById('inv-sort-f')?.value||'category';
  const active=[cat,sub,show!=='all'?show:'',sort!=='category'?sort:''].filter(Boolean).length;
  summary.textContent=active?`${active} active`:'Default';
}
function updateInvProgress(){
  const products=currentCountProducts();
  const total=products.length;const filled=products.filter(product=>{const v=liveInvCounts[product.id];return v!==''&&v!==null&&v!==undefined;}).length;const pct=total>0&&filled>0?Math.max(1,Math.round(filled/total*100)):0;
  document.getElementById('inv-prog-bar').style.width=pct+'%';document.getElementById('inv-prog-label').textContent=`${filled} of ${total} (${pct}%)`;
  document.getElementById('inv-prog-pills').innerHTML=`<span class="filled-pill"><span class="filled-dot"></span>${filled}</span><span class="missing-pill"><span class="missing-dot"></span>${total-filled} missing</span>`;
}
function hideInventoryFinishMessage(){
  const message=document.getElementById('inventory-finish-message');
  if(message)message.hidden=true;
}
function showInventoryFinishMessage(text){
  const message=document.getElementById('inventory-finish-message');
  if(message){message.textContent=text;message.hidden=false;}
}
function inventoryCountHasEntries(){
  const liveHasEntries=Object.values(liveInvCounts||{}).some(value=>value!==''&&value!==null&&value!==undefined&&!isNaN(value));
  return liveHasEntries;
}
function focusFirstInventoryQuantity(){
  const firstSection=document.querySelector('#inv-rows .inv-count-section');
  if(firstSection?.classList.contains('collapsed'))firstSection.querySelector('.inv-section-header')?.click();
  setTimeout(()=>{
    const firstInput=document.querySelector('#inv-rows input[data-count-input="true"]:not([disabled])');
    firstInput?.focus();
    firstInput?.select();
  },0);
}
function setInventoryFinishSaving(saving){
  inventoryCountSaving=saving;
  const saveButton=document.getElementById('inventory-count-finish');
  if(saveButton){saveButton.disabled=saving;saveButton.setAttribute('aria-busy',String(saving));saveButton.textContent=saving?'Saving…':'Save';}
}
function syncInventoryUnlistedCategoryOption(){
  const select=document.getElementById('inv-cat-f');if(!select)return;
  const existing=[...select.options].find(option=>option.value===COUNT_UNLISTED_CATEGORY);
  const hasUnlisted=(currentInventoryRoom()?.extraProductIds||[]).length>0;
  if(hasUnlisted&&!existing)select.add(new Option(COUNT_UNLISTED_CATEGORY,COUNT_UNLISTED_CATEGORY));
  else if(!hasUnlisted&&existing){if(select.value===COUNT_UNLISTED_CATEGORY)select.value='';existing.remove();}
}
function updateInventorySubcategoryFilter(){
  const category=document.getElementById('inv-cat-f')?.value||'';
  const select=document.getElementById('inv-sub-f');if(!select)return;
  const choices=category===COUNT_UNLISTED_CATEGORY?[COUNT_UNLISTED_SUBCATEGORY]:(category?(SUBCATS[category]||[]):[]);
  select.innerHTML='<option value="">All</option>'+choices.map(value=>`<option>${escapeHtml(value)}</option>`).join('');
  renderInvRows();
}
function renderInvRows(skipCapture=false){
  syncInventoryUnlistedCategoryOption();
  const roomScopedProducts=currentCountProducts();
  const activeInventory=currentInvEdit?state.inventories.find(item=>item.id===currentInvEdit):null;
  const activeRoom=currentInventoryRoom();
  if(!skipCapture)roomScopedProducts.forEach(p=>{const el=document.getElementById('invq-'+p.id);if(el)liveInvCounts[p.id]=el.value===''?'':parseFloat(el.value);});
  const search=document.getElementById('inv-search').value.trim().toLowerCase();const cat=document.getElementById('inv-cat-f').value;const sub=document.getElementById('inv-sub-f').value;const show=document.getElementById('inv-show-f').value;const sortMode=document.getElementById('inv-sort-f')?.value||'category';
  updateInventoryFilterSummary();
  let prods=roomScopedProducts.filter(p=>{const group=countProductDisplayGroup(p,activeRoom);return(!cat||group.category===cat)&&(!sub||group.subcategory===sub)&&(!search||p.name.toLowerCase().includes(search)||(p.inventoryName||'').toLowerCase().includes(search)||(p.aliases||'').toLowerCase().includes(search)||group.category.toLowerCase().includes(search)||group.subcategory.toLowerCase().includes(search));});
  if(show==='missing')prods=prods.filter(p=>{const v=liveInvCounts[p.id];return v===''||v===null||v===undefined;});
  if(show==='filled')prods=prods.filter(p=>{const v=liveInvCounts[p.id];return v!==''&&v!==null&&v!==undefined;});
  prods=sortedInventoryProducts(prods,sortMode);
  const groups={};prods.forEach(p=>{const group=countProductDisplayGroup(p,activeRoom);const k=group.category+'|||'+group.subcategory;if(!groups[k])groups[k]={cat:group.category,sub:group.subcategory,items:[]};groups[k].items.push(p);});
  if(!prods.length){document.getElementById('inv-rows').innerHTML=`<p style="color:var(--text-muted);text-align:center;padding:24px;">No products assigned to this room match.</p>`;updateInvProgress();return;}
  let html='';
  const extraIds=new Set(currentInventoryRoom()?.extraProductIds||[]);
  const renderProduct=p=>{const val=liveInvCounts[p.id];const isFilled=val!==''&&val!==null&&val!==undefined;const temporary=extraIds.has(p.id);const removable=temporary&&!currentInvMergedView;const group=countProductDisplayGroup(p,activeRoom);return`<div class="inv-count-row ${isFilled?'filled-row':'missing-row'} ${removable?'has-remove':''}" id="row-${p.id}"><div><span class="${isFilled?'filled-dot':'missing-dot'}"></span><span class="inv-prod-name">${productNameLink(p)}</span><div class="inv-prod-meta">${group.category}${group.subcategory?` · ${group.subcategory}`:''} · ${p.unit}${p.par?` · Par: ${p.par}`:''}${temporary?' · <span class="count-only-product-label">This count only</span>':''}</div>${recountPreviousRoomCountHtml(activeInventory,activeRoom,p.id)}</div><input type="number" inputmode="decimal" enterkeyhint="next" autocomplete="off" min="0" step="0.01" id="invq-${p.id}" data-count-input="true" value="${isFilled?val:''}" placeholder="qty" ${currentInvMergedView?'readonly aria-readonly="true"':''} oninput="onInvInput('${p.id}',this)" onfocus="onInvQtyFocus(this)" onkeydown="onInvQtyKey(event,this)"><span class="inv-count-unit">${p.unit}</span>${removable?`<button class="count-only-remove" type="button" aria-label="Remove ${escapeHtml(p.inventoryName||p.name)} from this count" title="Remove this count-only item" onclick="removeCountExtraProduct('${p.id}')">×</button>`:''}</div>`;};
  if(sortMode==='category')Object.values(groups).forEach(g=>{
    const sectionToken=encodeURIComponent(`${currentInvRoomId||''}|||${g.cat}|||${g.sub}`);
    const collapsed=!search&&!expandedInventorySections.has(sectionToken);
    const progress=inventorySectionProgress(g.cat,g.sub);
    html+=`<section class="inv-count-section ${collapsed?'collapsed':''} ${progress.complete?'complete':''}" data-section-token="${sectionToken}">
      <button class="inv-section-header" type="button" aria-expanded="${!collapsed}" onclick="toggleInventorySection('${sectionToken}')">
        <span class="inv-section-title">${catBadge(g.cat)} <span>${escapeHtml(g.sub)}</span></span>
        <span class="inv-section-summary"><span class="inv-section-complete-mark" aria-label="Complete" title="All items counted">✓</span>${search?'':`<span class="inv-section-summary-count">${progress.filled}/${progress.total}</span>`}<span class="inv-section-chevron" aria-hidden="true">⌄</span></span>
      </button>
      <div class="inv-section-items" ${collapsed?'hidden':''}>${g.items.map(renderProduct).join('')}</div>
    </section>`;
  });
  else html=prods.map(renderProduct).join('');
  document.getElementById('inv-rows').innerHTML=html;
  if(search)requestAnimationFrame(()=>document.querySelector('#inv-rows .inv-count-row')?.scrollIntoView({behavior:'smooth',block:'nearest'}));
  const renderedInputs=invQtyInputs();
  renderedInputs.forEach(input=>input.setAttribute('enterkeyhint','next'));
  renderedInputs.at(-1)?.setAttribute('enterkeyhint','done');
  updateInvProgress();
}
function toggleInventorySection(sectionToken){
  if(expandedInventorySections.has(sectionToken))expandedInventorySections.delete(sectionToken);
  else expandedInventorySections.add(sectionToken);
  renderInvRows();
}
async function saveInventory(done=false){
  if(inventoryCountSaving)return;
  if(!currentCountRoomLock||currentCountRoomLock.countId!==currentInvEdit||currentCountRoomLock.roomId!==currentInvRoomId){toast('This room is not reserved for you. Return to room selection.',true);return;}
  if(!inventoryCountHasEntries()){
    const message='Enter at least one quantity before finishing. Use 0 when an item was counted but is empty.';
    showInventoryFinishMessage(message);
    toast(message,true);
    focusFirstInventoryQuantity();
    return;
  }
  hideInventoryFinishMessage();
  setInventoryFinishSaving(true);
  try{
    const lock={...currentCountRoomLock};
    const inv=state.inventories.find(item=>item.id===lock.countId);
    const room=inv?.rooms?.find(item=>item.id===lock.roomId);
    if(!inv||!room)throw new Error('Count room not found');
    if(inventoryIsFinalised(inv)){toast('This count is finalised and can no longer be changed.',true);return;}
    if(typeof _pushTimer!=='undefined'&&_pushTimer&&typeof cloudPushNow==='function'&&!await cloudPushNow()){
      showInventoryFinishMessage('Another workspace change is still waiting to save. Please try again.');
      return;
    }
    captureCurrentRoomCounts();
    const items={...room.items};
    const extraProductIds=[...(room.extraProductIds||[])];
    const shared=typeof cloudSaveCountRoom==='function'?await cloudSaveCountRoom(lock.countId,lock.roomId,items,extraProductIds):null;
    if(!shared){
      showInventoryFinishMessage('The room could not be saved to the shared count. Please try again.');
      toast('The room could not be saved. Please try again.',true);
      return;
    }
    state=shared;
    normalizeLoadedState();
    try{localStorage.setItem('keg_bar_v5',JSON.stringify(state));}catch(error){}
    dirtyInventoryRoomIds=new Set();
    deletedInventoryRoomIds=new Set();
    currentInventoryRoomOriginalExtraProductIds=[...(currentInventoryRoom()?.extraProductIds||[])];
    renderInventoryTable();refreshLiveInventoryIfVisible();
    window.recordServerEvent?.({action:'count.room_saved',entityType:'count',entityId:lock.countId,details:{roomId:lock.roomId,roomName:room.name,items:Object.keys(items).length}});
    if(!done){
      toast(`${room.name} saved.`);
      return;
    }
    clearInterval(countRoomLockHeartbeatTimer);
    countRoomLockHeartbeatTimer=null;
    if(typeof cloudReleaseCountRoom==='function')await cloudReleaseCountRoom(lock.countId,lock.roomId);
    currentCountRoomLock=null;
    if(typeof resetInventoryTranscribeHistory==='function')resetInventoryTranscribeHistory();
    currentInventoryRoomOriginalExtraProductIds=[];
    inventoryRoomExitInProgress=true;
    closeModal('modal-inventory');
    inventoryRoomExitInProgress=false;
    toast(`${room.name} saved — choose another room or finalise the count.`);
    await openCountRoomPicker(lock.countId);
  }catch(error){
    console.error('Inventory save failed:',error);
    showInventoryFinishMessage('The count could not be saved. Please try again.');
    toast('The count could not be saved. Please try again.',true);
  }finally{
    setInventoryFinishSaving(false);
  }
}
function inventoryListSummary(inv){
  normalizeInventoryRooms(inv);
  const total=Object.entries(inv.items||{}).reduce((sum,[id,quantity])=>{const product=getProduct(id);return sum+(product?product.cost*quantity:0);},0);
  const expected=expectedInventoryProductIds(inv);
  const counted=Object.keys(inv.items||{}).filter(id=>expected.has(id)).length;
  return{...inv,counted,missing:Math.max(expected.size-counted,0),roomsCount:inv.rooms.filter(room=>Object.keys(room.items||{}).length>0).length,value:total};
}
function inventorySearchText(inv){
  const historyActors=(inv.history||[]).flatMap(event=>[event?.actor?.name,event?.actor?.role]);
  return[
    inv.label,inv.date,fmtDate(inv.date),inventoryStatusLabel(inv),inv.recordType==='recount'?'recount':'count',
    inv.archived?'archived':'current',inv.recountNumber,inv.createdBy?.name,inv.createdBy?.role,inv.createdBy?.email,
    inv.updatedBy?.name,inv.updatedBy?.role,inv.updatedBy?.email,...historyActors
  ].filter(Boolean).join(' ').toLowerCase();
}
function inventoryMatchesSearch(inv,query){
  const terms=String(query||'').trim().toLowerCase().split(/\s+/).filter(Boolean);
  if(!terms.length)return true;
  const text=inventorySearchText(inv);
  return terms.every(term=>text.includes(term));
}
function inventoryFamilies(query=''){
  const inventories=state.inventories||[];
  const ids=new Set(inventories.map(inv=>inv.id));
  const roots=inventories.filter(inv=>inv.recordType!=='recount'||!inv.parentCountId||!ids.has(inv.parentCountId));
  return roots.map(root=>{
    const recounts=inventories.filter(inv=>inv.recordType==='recount'&&inv.parentCountId===root.id)
      .sort((a,b)=>Number(a.recountNumber||0)-Number(b.recountNumber||0)||String(a.createdAt||a.date||'').localeCompare(String(b.createdAt||b.date||'')));
    return{root:inventoryListSummary(root),recounts:recounts.map(inventoryListSummary)};
  }).filter(family=>(showArchivedInventories?!!family.root.archived:!family.root.archived)&&[family.root,...family.recounts].some(inv=>inventoryMatchesSearch(inv,query)));
}
function toggleRecountFamily(id){
  if(expandedRecountFamilies.has(id))expandedRecountFamilies.delete(id);else expandedRecountFamilies.add(id);
  renderInventoryTable();
}
function recountFamilyToggleHtml(inv,recounts,expanded){
  if(!recounts.length)return'';
  return`<button class="recount-family-toggle" type="button" aria-expanded="${expanded}" aria-label="${expanded?'Hide':'Show'} ${recounts.length} linked re-count${recounts.length===1?'':'s'}" onclick="event.stopPropagation();toggleRecountFamily('${inv.id}')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"></path></svg><span>${recounts.length} re-count${recounts.length===1?'':'s'}</span></button>`;
}
function inventoryTableRowHtml(inv,index,recounts=[],isRecountChild=false,expanded=false){
  const visCols=INV_COLS.filter(column=>column.visible);
  return`<tr class="inventory-row ${inv.archived?'archived-row':''} ${isRecountChild?'inventory-recount-row':''}" onclick="viewInventory('${inv.id}')">${visCols.map(column=>{switch(column.key){
    case'date':return`<td>${fmtDate(inv.date)}</td>`;
    case'label':return`<td><div class="inventory-label-cell">${isRecountChild?'<span class="recount-branch" aria-hidden="true">↳</span>':''}<div><strong>${escapeHtml(inv.label||'—')}</strong>${inv.createdBy?.name?`<small class="count-audit-line">Created by ${escapeHtml(inv.createdBy.name)} · ${escapeHtml(inv.createdBy.role||'')}</small>`:''}<div class="inventory-status-row"><span class="${inventoryIsFinalised(inv)?'filled-pill':'sub-badge'}">${inventoryStatusLabel(inv)}</span>${inv.recordType==='recount'?` <span class="sub-badge">Re-count ${inv.recountNumber||''}</span>`:''}${inv.archived?' <span class="sub-badge">Archived</span>':''}</div>${!isRecountChild?recountFamilyToggleHtml(inv,recounts,expanded):''}</div></div></td>`;
    case'rooms':return`<td><span class="filled-pill">${inv.roomsCount} room${inv.roomsCount===1?'':'s'} counted</span></td>`;
    case'counted':return`<td>${inv.counted}</td>`;
    case'missing':return`<td>${inv.missing>0?`<span class="missing-pill"><span class="missing-dot"></span>${inv.missing}</span>`:'<span class="filled-pill">Complete</span>'}</td>`;
    case'value':return`<td>${fmt(inv.value)}</td>`;
    case'actions':return`<td onclick="event.stopPropagation()"><div class="inventory-row-actions">${inventoryMenuHtml(inv,`inventory-menu-${index}`)}</div></td>`;
    default:return'<td>—</td>';
  }}).join('')}</tr>`;
}
function renderInventoryTable(){
  renderFloorPlanRooms();
  const visCols=INV_COLS.filter(c=>c.visible);
  const archivedCount=state.inventories.filter(inv=>inv.archived).length;
  const archiveToggle=document.getElementById('inv-archive-toggle');
  if(archiveToggle){
    archiveToggle.textContent=`Archived (${archivedCount})`;
    archiveToggle.classList.toggle('active',showArchivedInventories);
  }
  const mobileArchiveToggle=document.getElementById('inv-mobile-archive-toggle');
  if(mobileArchiveToggle)mobileArchiveToggle.textContent=showArchivedInventories?'View current counts':`Archived counts (${archivedCount})`;
  const listContext=document.getElementById('inventory-list-context');
  if(listContext){
    listContext.hidden=!showArchivedInventories;
    listContext.innerHTML=showArchivedInventories?`<strong>Archived counts</strong><span>${archivedCount?`${archivedCount} saved count${archivedCount===1?' is':'s are'} archived. Restore one from its More menu to return it to current counts.`:'There are no archived counts yet.'}</span>`:'';
  }
  document.getElementById('inv-thead').innerHTML='<tr>'+visCols.map(c=>{if(!c.sort||c.key==='actions')return`<th>${c.label}</th>`;return sortableTableHeader(c.label,'inventories',c.sort);}).join('')+'</tr>';
  const query=(document.getElementById('inventory-search')?.value||'').trim();
  let families=inventoryFamilies(query);
  const sortedRoots=sortArr(families.map(family=>family.root),sortState.inventories.col,sortState.inventories.dir);
  const familyById=new Map(families.map(family=>[family.root.id,family]));
  families=sortedRoots.map(root=>familyById.get(root.id)).filter(Boolean);
  const matchedRecords=families.length;
  const searchCount=document.getElementById('inventory-search-count');
  if(searchCount)searchCount.textContent=query?`${matchedRecords} matching count${matchedRecords===1?'':'s'}`:'';
  const tbody=document.getElementById('inv-tbody');
  const mobileList=document.getElementById('inventory-mobile-list');
  if(!families.length){
    const emptyState=query
      ?`<div class="table-empty-state"><strong>No matching counts</strong><p>Try a count name, date, creator, or status.</p></div>`
      :showArchivedInventories
      ?`<div class="table-empty-state"><strong>No archived counts</strong><p>Counts you archive will stay available here.</p></div>`
      :`<div class="table-empty-state"><strong>File your first inventory count</strong><p>Choose a room, enter what is on hand, and save a baseline for live inventory.</p><button class="btn btn-primary" type="button" onclick="openInventoryRoomSelect()">＋ Start first count</button></div>`;
    tbody.innerHTML=`<tr><td colspan="${visCols.length}">${emptyState}</td></tr>`;
    if(mobileList)mobileList.innerHTML=emptyState;
    return;
  }
  tbody.innerHTML=families.map((family,index)=>{
    const expanded=!query&&expandedRecountFamilies.has(family.root.id);
    return inventoryTableRowHtml(family.root,`root-${index}`,family.recounts,false,expanded)+(expanded?family.recounts.map((recount,recountIndex)=>inventoryTableRowHtml(recount,`recount-${index}-${recountIndex}`,[],true,false)).join(''):'');
  }).join('');
  if(mobileList)mobileList.innerHTML=families.map((family,index)=>{
    const expanded=!query&&expandedRecountFamilies.has(family.root.id);
    return`<section class="inventory-mobile-family">${mobileInventoryCardHtml(family.root,`root-${index}`)}${family.recounts.length?`<button class="inventory-mobile-recount-toggle" type="button" aria-expanded="${expanded}" onclick="toggleRecountFamily('${family.root.id}')"><span>${family.recounts.length} linked re-count${family.recounts.length===1?'':'s'}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"></path></svg></button>${expanded?`<div class="inventory-mobile-recounts">${family.recounts.map((recount,recountIndex)=>mobileInventoryCardHtml(recount,`recount-${index}-${recountIndex}`,true)).join('')}</div>`:''}`:''}</section>`;
  }).join('');
}
function mobileInventoryCardHtml(inv,index,isRecountChild=false){
  const expanded=mobileExpandedInventoryId===inv.id;
  const label=inv.label||'Inventory Count';
  return`<article class="inventory-mobile-card ${expanded?'expanded':''} ${inv.archived?'archived-row':''} ${isRecountChild?'inventory-mobile-recount-card':''}" onclick="toggleMobileInventoryDetails('${inv.id}')" role="button" tabindex="0" onkeydown="if(event.target===event.currentTarget&&(event.key==='Enter'||event.key===' ')){event.preventDefault();toggleMobileInventoryDetails('${inv.id}')}" aria-label="${expanded?'Hide':'Show'} details for ${escapeHtml(label)} from ${fmtDate(inv.date)}" aria-expanded="${expanded}">
    <div class="inventory-mobile-card-head">
      <div class="inventory-mobile-card-title"><strong>${escapeHtml(label)}</strong><time datetime="${inv.date}">${fmtDate(inv.date)}</time></div>
      <span class="inventory-mobile-expand" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"></path></svg></span>
    </div>
    ${expanded?`<div class="inventory-mobile-details">
      <div class="inventory-mobile-detail-row"><span>Rooms counted</span><strong>${inv.roomsCount}</strong></div>
      <div class="inventory-mobile-detail-row"><span>Items counted</span><strong>${inv.counted}</strong></div>
      <div class="inventory-mobile-detail-row"><span>Items missing</span><strong class="${inv.missing?'danger-text':''}">${inv.missing}</strong></div>
      <div class="inventory-mobile-detail-row"><span>Total value</span><strong>${fmt(inv.value)}</strong></div>
      ${inv.createdBy?.name?`<div class="inventory-mobile-detail-row count-created-by"><span>Created by</span><strong>${escapeHtml(inv.createdBy.name)}<small>${escapeHtml(inv.createdBy.role||'')}</small></strong></div>`:''}
      <span class="inventory-mobile-status">${inventoryStatusLabel(inv)}</span>${inv.recordType==='recount'?`<span class="inventory-mobile-status">Re-count ${inv.recountNumber||''}</span>`:''}${inv.archived?'<span class="inventory-mobile-status">Archived</span>':''}
      <div class="inventory-mobile-card-actions" onclick="event.stopPropagation()"><button class="btn btn-secondary inventory-mobile-view-more" type="button" onclick="event.stopPropagation();viewInventory('${inv.id}')">View More</button>${inventoryMenuHtml(inv,`inventory-mobile-menu-${index}`)}</div>
    </div>`:''}
  </article>`;
}
function toggleMobileInventoryDetails(id){
  mobileExpandedInventoryId=mobileExpandedInventoryId===id?null:id;
  closeAllMenus();
  renderInventoryTable();
}
function canDeleteFinalisedInventory(){
  return localOnlyMode||window.serverAccessContext?.canDeleteFinalisedCounts===true;
}
function inventoryMenuHtml(inv,menuId){
  const mutable=!inventoryIsFinalised(inv);
  const canDelete=mutable||canDeleteFinalisedInventory();
  return`<div class="drop-wrap inventory-actions">
    <button class="icon-btn overflow-menu-button" type="button" onclick="event.stopPropagation();toggleMenu('${menuId}')" title="Count actions" aria-label="Count actions"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.4"></circle><circle cx="12" cy="12" r="1.4"></circle><circle cx="19" cy="12" r="1.4"></circle></svg></button>
    <div class="drop-menu" id="${menuId}">
      ${mutable?`<button onclick="event.stopPropagation();closeAllMenus();openCountRoomPicker('${inv.id}')">Edit</button><button onclick="event.stopPropagation();closeAllMenus();finaliseInventoryCount('${inv.id}')">Finalise</button>`:''}
      ${inventoryIsFinalised(inv)?`<button onclick="event.stopPropagation();closeAllMenus();openRecountSelector('${inv.id}')">Re-count</button>`:''}
      <button onclick="event.stopPropagation();archiveInventory('${inv.id}',${inv.archived?'false':'true'})">${inv.archived?'Restore':'Archive'}</button>
      ${canDelete?`<div class="drop-divider"></div><button class="danger-menu-item" onclick="event.stopPropagation();deleteInventory('${inv.id}')">Delete${mutable?'':' permanently'}</button>`:''}
    </div>
  </div>`;
}
function inventoryUncountedEntries(inv){
  if(!inv)return[];
  normalizeInventoryRooms(inv);
  const entries=[];
  (inv.rooms||[]).forEach(room=>{
    expectedInventoryProductIds(inv,room).forEach(productId=>{
      if(Object.prototype.hasOwnProperty.call(room.items||{},productId))return;
      const product=getProduct(productId);
      if(product&&!product.archived)entries.push({roomId:room.id,roomName:room.name,productId,productName:product.inventoryName||product.name});
    });
  });
  return entries;
}
function countFinalisationZeroItemsByRoom(entries){
  const grouped=new Map();
  entries.forEach(entry=>{if(!grouped.has(entry.roomId))grouped.set(entry.roomId,[]);grouped.get(entry.roomId).push(entry.productId);});
  return[...grouped].map(([roomId,productIds])=>({roomId,productIds}));
}
function openCountUncountedDialog(inv,entries){
  pendingCountFinalisationId=inv.id;
  pendingCountUncountedEntries=entries;
  const roomCount=new Set(entries.map(entry=>entry.roomId)).size;
  const summary=document.getElementById('count-uncounted-summary');
  const examples=document.getElementById('count-uncounted-examples');
  if(summary)summary.textContent=`${entries.length} item${entries.length===1?' has':'s have'} not been counted across ${roomCount} room${roomCount===1?'':'s'}. What would you like to do?`;
  if(examples){
    const names=entries.slice(0,6).map(entry=>`${entry.productName} (${entry.roomName})`);
    examples.textContent=`${names.join(' · ')}${entries.length>names.length?` · ${entries.length-names.length} more`:''}`;
  }
  openModal('modal-count-uncounted');
}
function closeCountUncountedDialog(){
  pendingCountFinalisationId=null;
  pendingCountUncountedEntries=[];
  closeModal('modal-count-uncounted');
}
async function performInventoryFinalisation(id,zeroItemsByRoom=[]){
  const inv=state.inventories.find(item=>item.id===id);
  if(!inv)return false;
  const fromPicker=countRoomPickerCountId===id;
  const shared=typeof cloudFinaliseCount==='function'?await cloudFinaliseCount(id,zeroItemsByRoom):null;
  if(!shared){toast('The count could not be finalised. Please try again.',true);return false;}
  state=shared;normalizeLoadedState();
  try{localStorage.setItem('keg_bar_v5',JSON.stringify(state));}catch(error){}
  renderInventoryTable();refreshLiveInventoryIfVisible();
  window.recordServerEvent?.({action:'count.finalised',entityType:'count',entityId:id,details:{label:inv.label||'',recordType:inv.recordType||'count',zeroedItems:zeroItemsByRoom.reduce((sum,room)=>sum+room.productIds.length,0)}});
  toast(`${inv.recordType==='recount'?'Re-count':'Count'} finalised. It is now read-only.`);
  if(fromPicker){closeCountRoomPicker();viewInventory(id);}
  else if(viewInvId===id)viewInventory(id);
  return true;
}
async function resolveCountUncounted(action){
  const id=pendingCountFinalisationId;
  const entries=[...pendingCountUncountedEntries];
  if(!id)return;
  closeCountUncountedDialog();
  if(action==='back'){
    const first=entries[0];
    await openCountRoomPicker(id,first?.roomId||null);
    if(currentInvEdit===id&&currentInvRoomId===first?.roomId){
      const filter=document.getElementById('inv-show-f');if(filter)filter.value='missing';
      renderInvRows();
      toast('Showing only the items that still need a count.');
    }
    return;
  }
  const zeroItemsByRoom=action==='zero'?countFinalisationZeroItemsByRoom(entries):[];
  await performInventoryFinalisation(id,zeroItemsByRoom);
}
async function finaliseInventoryCount(id){
  closeAllMenus();
  const inv=state.inventories.find(item=>item.id===id);
  if(!inv){toast('Count not found.',true);return false;}
  if(inventoryIsFinalised(inv)){toast('This count is already finalised.');return true;}
  if(!Object.keys(inv.items||{}).length){toast('Save at least one counted item before finalising.',true);return false;}
  const uncounted=inventoryUncountedEntries(inv);
  if(uncounted.length){openCountUncountedDialog(inv,uncounted);return false;}
  if(!confirm(`Finalise “${inv.label||'this count'}”? It will become read-only.`))return false;
  return performInventoryFinalisation(id);
}
function finaliseCountFromPicker(){
  if(countRoomPickerCountId)finaliseInventoryCount(countRoomPickerCountId);
}
function recountSourceInventory(inv){
  if(!inv)return null;
  return state.inventories.find(item=>item.id===inventoryRootId(inv))||inv;
}
function recountSelectableProducts(){
  return state.products.filter(product=>!product.archived).sort((a,b)=>String(a.inventoryName||a.name).localeCompare(String(b.inventoryName||b.name)));
}
function recountPreviousRoomCount(inv,room,productId){
  if(inv?.recordType!=='recount'||!room)return{counted:false,value:null};
  const source=recountSourceInventory(inv);
  const sourceRoom=inventoryRoomForFloorRoom(source,room.roomId)||(source?.rooms||[]).find(candidate=>candidate.name===room.name);
  if(!sourceRoom||!Object.prototype.hasOwnProperty.call(sourceRoom.items||{},productId))return{counted:false,value:null};
  return{counted:true,value:sourceRoom.items[productId]};
}
function recountPreviousRoomCountHtml(inv,room,productId){
  if(inv?.recordType!=='recount')return'';
  const previous=recountPreviousRoomCount(inv,room,productId);
  const value=previous.counted?String(previous.value):'Not counted';
  return`<div class="recount-previous-room-count"><span>Original in ${escapeHtml(room?.name||'this room')}</span><strong>${escapeHtml(value)}</strong></div>`;
}
function renderRecountProductSelector(){
  const source=recountSourceInventory(state.inventories.find(item=>item.id===recountSourceCountId));
  const list=document.getElementById('recount-product-list');
  if(!source||!list)return;
  const query=(document.getElementById('recount-product-search')?.value||'').trim().toLowerCase();
  const products=recountSelectableProducts().filter(product=>!query||[product.name,product.inventoryName,product.category,product.subcategory,product.aliases].some(value=>String(value||'').toLowerCase().includes(query)));
  list.innerHTML=products.map(product=>`<label class="recount-product-option"><input type="checkbox" value="${escapeHtml(product.id)}" ${recountSelectedProductIds.has(product.id)?'checked':''} onchange="toggleRecountProduct('${product.id}',this.checked)"><span><strong>${escapeHtml(product.inventoryName||product.name)}</strong><small>${escapeHtml(product.category||'Other')}${product.subcategory?` · ${escapeHtml(product.subcategory)}`:''}</small></span></label>`).join('')||'<p class="empty-cell">No products match.</p>';
  const count=document.getElementById('recount-selected-count');if(count)count.textContent=`${recountSelectedProductIds.size} selected`;
  const create=document.getElementById('recount-create-button');if(create)create.disabled=!recountSelectedProductIds.size;
}
function toggleRecountProduct(productId,checked){
  if(checked)recountSelectedProductIds.add(productId);else recountSelectedProductIds.delete(productId);
  renderRecountProductSelector();
}
function setAllRecountProducts(selected){
  recountSelectedProductIds=new Set(selected?recountSelectableProducts().map(product=>product.id):[]);
  renderRecountProductSelector();
}
function openRecountSelector(countId,preselectedProductIds=[]){
  closeAllMenus();
  const requested=state.inventories.find(item=>item.id===countId);
  if(!inventoryIsFinalised(requested)){toast('Finalise the count before starting a re-count.',true);return;}
  const source=recountSourceInventory(requested);
  if(!source){toast('Choose a saved count before starting a re-count.',true);return;}
  recountSourceCountId=source.id;
  if(typeof recountTranscribeHistory!=='undefined')recountTranscribeHistory=[];
  if(typeof renderTranscribeHistory==='function')renderTranscribeHistory('recount');
  const available=new Set(recountSelectableProducts().map(product=>product.id));
  recountSelectedProductIds=new Set((preselectedProductIds||[]).filter(id=>available.has(id)));
  const context=document.getElementById('recount-source-context');
  if(context)context.textContent=`Choose any active product to check against ${source.label||'the original count'}. The re-count will be saved as a separate record.`;
  const search=document.getElementById('recount-product-search');if(search)search.value='';
  renderRecountProductSelector();openModal('modal-recount-select');
}
async function createRecount(){
  const source=recountSourceInventory(state.inventories.find(item=>item.id===recountSourceCountId));
  const selected=[...recountSelectedProductIds];
  if(!source||!selected.length){toast('Select at least one item to re-count.',true);return;}
  const number=recountsForInventory(source).reduce((max,item)=>Math.max(max,Number(item.recountNumber)||0),0)+1;
  const selectedSet=new Set(selected);
  const rooms=(source.rooms||[]).filter(room=>{
    const expected=expectedInventoryProductIds(source,room);
    return selected.some(id=>expected.has(id)||Object.prototype.hasOwnProperty.call(room.items||{},id));
  }).map(room=>({
    id:uid(),roomId:room.roomId,name:room.name,items:{},
    extraProductIds:(room.extraProductIds||[]).filter(id=>selectedSet.has(id))
  }));
  if(!rooms.length){toast('The selected items are not assigned to a count room.',true);return;}
  const actor=window.serverAccessContext?.user||{};
  const draft={
    id:uid(),date:today(),label:`${source.label||'Inventory Count'} — Re-count ${number}`,
    items:{},rooms,draft:true,status:'saved',finalised:false,recordType:'recount',
    parentCountId:source.id,recountNumber:number,selectedProductIds:selected,
    createdBy:{id:actor.id||'',name:actor.name||'Team member',role:actor.jobTitle||actor.role||'Team member'},createdAt:new Date().toISOString(),
    history:[inventoryHistoryEvent('created',{label:`${source.label||'Inventory Count'} — Re-count ${number}`,date:today(),recordType:'recount'})]
  };
  const button=document.getElementById('recount-create-button');if(button){button.disabled=true;button.textContent='Creating…';}
  const shared=typeof cloudCreateCountDraft==='function'?await cloudCreateCountDraft(draft):null;
  if(button){button.disabled=false;button.textContent='Create Re-count';}
  if(!shared){toast('The re-count could not be created. Please try again.',true);return;}
  state=shared.state;normalizeLoadedState();
  try{localStorage.setItem('keg_bar_v5',JSON.stringify(state));}catch(error){}
  closeModal('modal-recount-select');closeModal('modal-view-inv');renderInventoryTable();
  window.recordServerEvent?.({action:'count.recount_created',entityType:'count',entityId:shared.draft.id,details:{parentCountId:source.id,recountNumber:number,items:selected.length}});
  toast(`Re-count ${number} created with ${selected.length} item${selected.length===1?'':'s'}.`);
  await openCountRoomPicker(shared.draft.id);
}
function toggleArchivedInventories(){showArchivedInventories=!showArchivedInventories;closeAllMenus();renderInventoryTable();}
async function archiveInventory(id,archived=true){
  closeAllMenus();
  const inv=state.inventories.find(item=>item.id===id);if(!inv)return;
  const shared=typeof cloudArchiveCount==='function'?await cloudArchiveCount(id,archived):null;
  if(!shared)return;
  state=shared;normalizeLoadedState();
  try{localStorage.setItem('keg_bar_v5',JSON.stringify(state));}catch(error){}
  renderInventoryTable();refreshLiveInventoryIfVisible();
  window.recordServerEvent?.({action:archived?'count.archived':'count.restored',entityType:'count',entityId:id,details:{label:inv.label||'',date:inv.date}});
  if(viewInvId===id){
    const saved=state.inventories.find(item=>item.id===id);if(saved){document.getElementById('view-inv-title').textContent=`${saved.label||'Inventory'} — ${fmtDate(saved.date)}${saved.archived?' · Archived':''}`;renderViewInventoryActions(saved);renderViewedInventoryHistory(saved);}
  }
  toast(archived?'Count archived.':'Count restored.');
}
function viewInventory(id){
  viewInvId=id;viewInvTab='all';viewInvExpandedProductId=null;viewInvEditingProductId=null;const inv=state.inventories.find(i=>i.id===id);if(!inv)return;normalizeInventoryRooms(inv);
  document.getElementById('view-inv-title').textContent=`${inv.label||'Inventory'} — ${fmtDate(inv.date)} · ${inventoryStatusLabel(inv)}${inv.archived?' · Archived':''}`;
  const editButton=document.querySelector('.view-inv-edit-count');if(editButton)editButton.hidden=inventoryIsFinalised(inv);
  const attribution=document.getElementById('view-inv-attribution');if(attribution){attribution.textContent=inv.createdBy?.name?`Created by ${inv.createdBy.name} · ${inv.createdBy.role||'Team member'}${inv.createdAt?` · ${new Date(inv.createdAt).toLocaleString()}`:''}`:'';attribution.hidden=!attribution.textContent;}
  document.getElementById('view-inv-search').value='';
  renderViewInventoryActions(inv);renderViewedInventoryHistory(inv);setViewedInventoryHistoryMode(false);renderViewInvTabs(inv);renderViewInvTable();openModal('modal-view-inv');
}
function inventoryHistoryEvent(action,details={}){
  return{id:uid(),action,at:new Date().toISOString(),actor:currentAuditStamp(),details};
}
function inventoryHistoryActionLabel(action){
  return({created:'Count created',room_saved:'Room saved',item_updated:'Item quantities updated',finalised:'Count finalised',archived:'Count archived',restored:'Count restored'})[action]||String(action||'Count updated').replaceAll('_',' ');
}
function inventoryHistoryQuantity(value){return value===null||value===undefined||value===''?'Not counted':liveQty(value);}
function inventoryHistorySummary(event){
  const details=event?.details||{};
  const changes=Array.isArray(details.changes)?details.changes:[];
  const room=details.roomName?escapeHtml(details.roomName):'';
  return event.action==='created'
    ?`${details.recordType==='recount'?'Re-count':'Count'} opened${details.date?` for ${escapeHtml(fmtDate(details.date))}`:''}`
    :event.action==='room_saved'
      ?`${room||'Count room'} saved · ${changes.length} quantit${changes.length===1?'y':'ies'} changed`
      :event.action==='item_updated'
        ?`${changes.length} room quantit${changes.length===1?'y':'ies'} changed`
        :event.action==='finalised'?'The count became read-only'
        :event.action==='archived'?'Moved out of the current Counts list'
        :event.action==='restored'?'Returned to the current Counts list':'';
}
function inventoryHistoryChangesMarkup(event){
  const details=event?.details||{};
  const changes=Array.isArray(details.changes)?details.changes:[];
  const room=details.roomName?escapeHtml(details.roomName):'';
  const changeRows=changes.map(change=>{
    const product=getProduct(change?.productId);
    const productName=product?.name||'Unknown item';
    const roomName=change?.roomName||room;
    return`<li><span><strong>${escapeHtml(productName)}</strong>${roomName?`<small>${escapeHtml(roomName)}</small>`:''}</span><span><del>${escapeHtml(inventoryHistoryQuantity(change?.before))}</del><b aria-hidden="true">→</b><ins>${escapeHtml(inventoryHistoryQuantity(change?.after))}</ins></span></li>`;
  }).join('');
  return changeRows?`<ul class="record-history-changes">${changeRows}</ul>`:'<p class="record-history-empty-change">No item quantities changed in this update.</p>';
}
function inventoryHistoryDateParts(value){
  const date=new Date(value||'');
  if(Number.isNaN(date.getTime()))return{date:'Date unavailable',time:'Time unavailable'};
  return{
    date:date.toLocaleDateString(),
    time:date.toLocaleTimeString([],{hour:'numeric',minute:'2-digit',second:'2-digit'})
  };
}
function inventoryHistoryMarkup(inv){
  let events=Array.isArray(inv?.history)?inv.history.filter(event=>event&&typeof event==='object'):[];
  if(!events.length){
    events=[{id:'created',action:'created',at:inv?.createdAt,actor:inv?.createdBy,details:{date:inv?.date,recordType:inv?.recordType||'count'}}];
    if(inv?.updatedAt)events.push({id:'updated',action:'updated',at:inv.updatedAt,actor:inv.updatedBy,details:{}});
  }
  events=[...events].sort((a,b)=>String(b.at||'').localeCompare(String(a.at||'')));
  return`<div class="record-history-title"><div><strong>Complete change history</strong><small>${events.length} recorded event${events.length===1?'':'s'}</small></div><small>Newest first</small></div><div class="record-history-timeline record-history-timeline-detailed">${events.map(event=>{const when=inventoryHistoryDateParts(event.at);return`<details class="record-history-event"><summary><span class="record-history-dot" aria-hidden="true"></span><span class="record-history-event-copy"><strong>${escapeHtml(inventoryHistoryActionLabel(event.action))}</strong><span class="record-history-when"><time>${escapeHtml(when.date)}</time><time>${escapeHtml(when.time)}</time></span><small>By ${escapeHtml(auditActorLabel(event.actor))}</small><p>${inventoryHistorySummary(event)}</p></span><span class="record-history-chevron" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m7 10 5 5 5-5"></path></svg></span></summary><div class="record-history-event-details">${inventoryHistoryChangesMarkup(event)}</div></details>`;}).join('')}</div>`;
}
function renderViewedInventoryHistory(inv){const panel=document.getElementById('view-inv-history');if(panel)panel.innerHTML=inventoryHistoryMarkup(inv);}
function setViewedInventoryHistoryMode(active){
  const modal=document.querySelector('#modal-view-inv .view-inv-modal');
  const panel=document.getElementById('view-inv-history');
  const controls=document.querySelector('#modal-view-inv .view-inv-controls');
  const countContent=document.querySelector('#modal-view-inv .view-inv-scroll');
  const toggle=document.getElementById('view-inv-history-toggle');
  if(!modal||!panel)return;
  modal.classList.toggle('history-mode',active);
  panel.hidden=!active;
  if(controls)controls.hidden=active;
  if(countContent)countContent.hidden=active;
  if(toggle){toggle.classList.toggle('active',active);toggle.setAttribute('aria-expanded',String(active));toggle.setAttribute('aria-pressed',String(active));toggle.setAttribute('aria-label',active?'Return to count details':'View count history');toggle.title=active?'Count details':'History';}
}
function toggleViewedInventoryHistory(){
  const inv=state.inventories.find(item=>item.id===viewInvId);
  const modal=document.querySelector('#modal-view-inv .view-inv-modal');
  if(!inv||!modal)return;
  const active=!modal.classList.contains('history-mode');
  if(active)renderViewedInventoryHistory(inv);
  setViewedInventoryHistoryMode(active);
}
function renderViewInventoryActions(inv){
  const menu=document.getElementById('view-inventory-actions-menu');if(!menu)return;
  const canDelete=!inventoryIsFinalised(inv)||canDeleteFinalisedInventory();
  menu.innerHTML=`${inventoryIsFinalised(inv)?`<button onclick="closeAllMenus();openRecountSelector('${inv.id}')">Re-count selected items</button>`:`<button onclick="closeAllMenus();editViewedInventory()">Edit count</button><button onclick="closeAllMenus();finaliseInventoryCount('${inv.id}')">Finalise count</button>`}<button onclick="openCountReportExport('${inv.id}')">Export report</button><div class="drop-divider"></div><button onclick="archiveInventory('${inv.id}',${inv.archived?'false':'true'})">${inv.archived?'Restore count':'Archive count'}</button>${canDelete?`<button class="danger-menu-item" onclick="deleteInventory('${inv.id}')">Delete${inventoryIsFinalised(inv)?' permanently':''}</button>`:''}`;
}
function editViewedInventory(){const id=viewInvId;if(!id)return;const inv=state.inventories.find(item=>item.id===id);if(inventoryIsFinalised(inv)){toast('This count is finalised and can no longer be changed.',true);return;}const selectedRoom=viewInvTab!=='all'&&viewInvTab!=='missing'?viewInvTab:null;closeModal('modal-view-inv');openCountRoomPicker(id,selectedRoom);}
function renderViewInvTabs(inv){
  const select=document.getElementById('view-inv-select');
  select.innerHTML=`<option value="all">Merged Total</option><option value="missing">Not Counted</option>${inv.rooms.map(room=>`<option value="${room.id}">${escapeHtml(room.name)}</option>`).join('')}`;
  select.value=viewInvTab;
}
function switchViewInvTab(tab){viewInvTab=tab;viewInvExpandedProductId=null;viewInvEditingProductId=null;const inv=state.inventories.find(i=>i.id===viewInvId);if(inv)renderViewInvTabs(inv);renderViewInvTable();}
function roomQtyBreakdown(inv,productId){
  return inv.rooms.map(room=>({name:room.name,qty:room.items?.[productId]}))
    .filter(item=>item.qty!==undefined&&item.qty!==null&&item.qty!=='')
    .map(item=>`${escapeHtml(item.name)} ${liveQty(item.qty)}`)
    .join(' · ');
}
function toggleViewInvProduct(productId){
  viewInvExpandedProductId=viewInvExpandedProductId===productId?null:productId;
  viewInvEditingProductId=null;
  renderViewInvTable();
}
function setViewInvItemEditMode(productId,editing=true){
  const inv=state.inventories.find(item=>item.id===viewInvId);
  if(editing&&inventoryIsFinalised(inv)){toast('This count is finalised and can no longer be changed.',true);return;}
  viewInvExpandedProductId=productId;
  viewInvEditingProductId=editing?productId:null;
  renderViewInvTable();
  if(editing)setTimeout(()=>document.querySelector(`[data-view-product-id="${productId}"] input`)?.focus(),0);
}
function viewInvItemDetailHtml(inv,product){
  const editing=viewInvEditingProductId===product.id;
  const locked=inventoryIsFinalised(inv);
  const roomFields=inv.rooms.map(room=>{
    const value=room.items?.[product.id];
    const displayValue=value===undefined||value===null||value===''?'Not counted':liveQty(value);
    return`<div class="view-inv-room-field"><span>${escapeHtml(room.name)}</span>${editing?`<input type="text" inputmode="decimal" pattern="[0-9]*[.]?[0-9]*" autocomplete="off" data-view-room-id="${room.id}" value="${value===undefined||value===null?'':value}" placeholder="Not counted">`:`<output>${displayValue}</output>`}</div>`;
  }).join('');
  return`<div class="view-inv-item-detail ${editing?'is-editing':''}" data-view-product-id="${product.id}" onclick="event.stopPropagation()"><div class="view-inv-item-detail-head"><strong>Room breakdown</strong><div class="view-inv-item-edit-control">${locked?'<span>Read-only</span>':`${editing?'<span>Editing</span>':''}<button class="icon-btn view-inv-item-edit" type="button" aria-label="${editing?'Cancel room count editing':'Edit room counts'}" title="${editing?'Cancel room count editing':'Edit room counts'}" onclick="setViewInvItemEditMode('${product.id}',${editing?'false':'true'})"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l11-11-4-4L4 16v4Z"></path><path d="m13.5 6.5 4 4"></path></svg></button>`}</div></div><div class="view-inv-room-grid">${roomFields}</div>${editing?`<div class="view-inv-item-actions"><button class="btn btn-secondary" type="button" onclick="setViewInvItemEditMode('${product.id}',false)">Cancel</button><button class="btn btn-primary" type="button" onclick="saveViewedInventoryItem('${product.id}',this)">Save Item</button></div>`:''}</div>`;
}
function saveViewedInventoryItem(productId,button){
  const inv=state.inventories.find(item=>item.id===viewInvId);if(!inv)return;
  if(inventoryIsFinalised(inv)){toast('This count is finalised and can no longer be changed.',true);return;}
  const detail=button?.closest('.view-inv-item-detail');if(!detail)return;
  const changes=[];
  detail.querySelectorAll('[data-view-room-id]').forEach(input=>{
    const room=inv.rooms.find(item=>item.id===input.dataset.viewRoomId);if(!room)return;
    const before=Object.prototype.hasOwnProperty.call(room.items||{},productId)?room.items[productId]:null;
    const value=input.value.trim();
    if(value==='')delete room.items[productId];
    else{const quantity=parseFloat(value);if(!isNaN(quantity)&&quantity>=0)room.items[productId]=quantity;}
    const after=Object.prototype.hasOwnProperty.call(room.items||{},productId)?room.items[productId]:null;
    if(before!==after)changes.push({productId,roomId:room.id,roomName:room.name,before,after});
  });
  if(!changes.length){viewInvEditingProductId=null;renderViewInvTable();toast('No quantity changes to save.');return;}
  inv.items=mergeInventoryRoomItems(inv.rooms);
  inv.draft=!Object.keys(inv.items).length;
  inv.updatedBy=currentAuditStamp();inv.updatedAt=new Date().toISOString();
  inv.history=[...(Array.isArray(inv.history)?inv.history:[]),inventoryHistoryEvent('item_updated',{productId,changes})];
  viewInvExpandedProductId=null;viewInvEditingProductId=null;
  save();renderInventoryTable();refreshLiveInventoryIfVisible();renderViewedInventoryHistory(inv);renderViewInvTable();toast('Item count updated.');
}
function renderViewInvTable(){
  const inv=state.inventories.find(i=>i.id===viewInvId);if(!inv)return;normalizeInventoryRooms(inv);
  const selectedRoom=inv.rooms.find(r=>r.id===viewInvTab)||null;
  const source=viewInvTab==='all'||viewInvTab==='missing'?inv.items:(selectedRoom?.items||{});
  const search=(document.getElementById('view-inv-search')?.value||'').trim().toLowerCase();
  let products;
  if(viewInvTab==='missing'){
    const expected=expectedInventoryProductIds(inv);
    products=state.products.filter(product=>expected.has(product.id)&&source[product.id]===undefined);
  }else products=Object.keys(source).map(getProduct).filter(Boolean);
  products=products.filter(product=>!search||[product.name,product.category,product.subcategory,product.aliases].some(value=>String(value||'').toLowerCase().includes(search))).sort((a,b)=>a.name.localeCompare(b.name));
  let total=0;
  const desktopRows=products.map(product=>{
    const qty=source[product.id];const counted=qty!==undefined&&qty!==null&&qty!=='';const val=counted?product.cost*qty:0;total+=val;
    const expanded=viewInvExpandedProductId===product.id;
    return`<tr class="view-inv-item-row" onclick="toggleViewInvProduct('${product.id}')"><td>${productNameLink(product)}</td><td>${catBadge(product.category)}</td><td>${subBadge(product.subcategory)}</td><td><strong>${counted?liveQty(qty):'—'}</strong></td><td>${product.unit}</td><td>${product.par||'—'}</td><td>${counted&&product.cost>0?fmt(product.cost):'—'}</td><td><strong>${counted?fmt(val):'—'}</strong></td></tr>${expanded?`<tr class="view-inv-detail-row"><td colspan="8">${viewInvItemDetailHtml(inv,product)}</td></tr>`:''}`;
  }).join('');
  const mobileCards=products.map(product=>{
    const qty=source[product.id];const counted=qty!==undefined&&qty!==null&&qty!=='';const expanded=viewInvExpandedProductId===product.id;
    return`<article class="view-inv-item-card ${expanded?'expanded':''}"><button type="button" onclick="toggleViewInvProduct('${product.id}')" aria-expanded="${expanded}"><span><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.category)}${product.subcategory?` · ${escapeHtml(product.subcategory)}`:''} · ${escapeHtml(product.unit)}</small></span><span class="view-inv-item-qty"><strong>${counted?liveQty(qty):'—'}</strong><small>${viewInvTab==='all'?'total':'counted'}</small></span></button>${expanded?viewInvItemDetailHtml(inv,product):''}</article>`;
  }).join('');
  const emptyText=viewInvTab==='missing'&&!search?'All items were counted.':search?'No matching items.':'No items.';
  document.getElementById('view-inv-tbody').innerHTML=desktopRows||`<tr><td colspan="8" style="color:var(--text-muted);text-align:center">${emptyText}</td></tr>`;
  document.getElementById('view-inv-list').innerHTML=mobileCards||`<p class="empty-cell">${emptyText}</p>`;
  document.getElementById('view-inv-total').textContent=viewInvTab!=='missing'?`Total: ${fmt(total)}`:'';
}
async function deleteInventory(id){
  closeAllMenus();
  const inv=state.inventories.find(item=>item.id===id);if(!inv)return;
  if(inventoryIsFinalised(inv)&&!canDeleteFinalisedInventory()){toast('Only an owner or administrator can delete a finalised count.',true);return;}
  const linked=inv.recordType==='recount'?[]:recountsForInventory(inv);
  const warning=inventoryIsFinalised(inv)?'This finalised count will be permanently deleted and cannot be recovered. ':'';
  const linkedWarning=linked.length?`Its ${linked.length} linked re-count${linked.length===1?'':'s'} will also be deleted. `:'';
  if(!confirm(`${warning}${linkedWarning}Delete “${inv.label||'this count'}”?`))return;
  const shared=typeof cloudDeleteCount==='function'?await cloudDeleteCount(id):null;
  if(!shared)return;
  state=shared;normalizeLoadedState();
  try{localStorage.setItem('keg_bar_v5',JSON.stringify(state));}catch(error){}
  window.recordServerEvent?.({action:'count.deleted',entityType:'count',entityId:id,details:{label:inv.label||'',date:inv.date,finalised:inventoryIsFinalised(inv),linkedRecounts:linked.length}});
  closeModal('modal-view-inv');renderInventoryTable();refreshLiveInventoryIfVisible();toast('Count permanently deleted.');
}
const COUNT_REPORT_ORDER_LABELS={
  usage:'Usage order — Inventory Entry Form',
  category:'Category, subcategory, then product',
  alpha:'Product name — A to Z',
  'alpha-desc':'Product name — Z to A',
  'qty-desc':'Quantity — highest first',
  'qty-asc':'Quantity — lowest first',
  'value-desc':'Inventory value — highest first',
  'value-asc':'Inventory value — lowest first'
};
function inventoryEntryReportOrderMap(){
  const map=new Map();
  const items=state.inventoryEntryTemplate?.items;
  if(!Array.isArray(items))return map;
  [...items]
    .filter(item=>item?.productId)
    .sort((a,b)=>(Number.isFinite(a.sourceOrder)?a.sourceOrder:Number.MAX_SAFE_INTEGER)-(Number.isFinite(b.sourceOrder)?b.sourceOrder:Number.MAX_SAFE_INTEGER))
    .forEach(item=>{if(!map.has(item.productId))map.set(item.productId,map.size);});
  return map;
}
function countReportEntries(items={}){
  return Object.entries(items).map(([productId,rawQty])=>{
    const product=getProduct(productId);
    if(!product)return null;
    const qty=parseFloat(rawQty)||0;
    return{product,qty,value:qty*(parseFloat(product.cost)||0)};
  }).filter(Boolean);
}
function sortCountReportEntries(entries,order='category'){
  const text=(value)=>String(value||'');
  const categoryCompare=(a,b)=>
    text(a.product.category).localeCompare(text(b.product.category))||
    text(a.product.subcategory).localeCompare(text(b.product.subcategory))||
    text(a.product.name).localeCompare(text(b.product.name));
  if(order==='usage'){
    const usageOrder=inventoryEntryReportOrderMap();
    return[...entries].sort((a,b)=>{
      const ai=usageOrder.has(a.product.id)?usageOrder.get(a.product.id):Number.MAX_SAFE_INTEGER;
      const bi=usageOrder.has(b.product.id)?usageOrder.get(b.product.id):Number.MAX_SAFE_INTEGER;
      return ai-bi||categoryCompare(a,b);
    });
  }
  if(order==='alpha'||order==='alpha-desc'){
    const direction=order==='alpha-desc'?-1:1;
    return[...entries].sort((a,b)=>direction*text(a.product.name).localeCompare(text(b.product.name)));
  }
  if(order==='qty-desc'||order==='qty-asc'){
    const direction=order==='qty-desc'?-1:1;
    return[...entries].sort((a,b)=>direction*(a.qty-b.qty)||categoryCompare(a,b));
  }
  if(order==='value-desc'||order==='value-asc'){
    const direction=order==='value-desc'?-1:1;
    return[...entries].sort((a,b)=>direction*(a.value-b.value)||categoryCompare(a,b));
  }
  return[...entries].sort(categoryCompare);
}
function countReportRoomDetailText(inv,product){
  if(!inv||!product)return'';
  const rooms=(inv.rooms||[]).flatMap(room=>Object.prototype.hasOwnProperty.call(room.items||{},product.id)
    ?[`${room.name}: ${liveQty(room.items[product.id])} ${product.unit||'unit'}`]
    :[]);
  return rooms.length?`Room details: ${rooms.join(' · ')}`:'';
}
function countReportRows(items,order,inv=null,includeRoomDetails=false){
  const entries=sortCountReportEntries(countReportEntries(items),order);
  const rows=[['Product','Category','Subcategory','Qty','Unit','Par','Unit Cost','Value']];
  let total=0;
  entries.forEach(({product,qty,value})=>{
    total+=value;
    rows.push([product.name,product.category,product.subcategory||'',qty,product.unit,product.par||0,product.cost||0,+value.toFixed(2)]);
    const detail=includeRoomDetails?countReportRoomDetailText(inv,product):'';
    if(detail)rows.push([detail,'','','','','','','']);
  });
  rows.push(['','','','','','','TOTAL',+total.toFixed(2)]);
  return{entries,rows,total};
}
function recountComparisonReport(inv,order='category',includeRoomDetails=false){
  const source=recountSourceInventory(inv);
  const productIds=new Set(Object.keys(source?.items||{}));
  expectedInventoryProductIds(source).forEach(id=>productIds.add(id));
  const entries=sortCountReportEntries([...productIds].map(productId=>{
    const product=getProduct(productId);if(!product)return null;
    const original=parseFloat(source?.items?.[productId])||0;
    const hasRecount=Object.prototype.hasOwnProperty.call(inv.items||{},productId);
    const recount=hasRecount?(parseFloat(inv.items[productId])||0):null;
    const finalQty=recount===null?original:recount;
    return{product,qty:finalQty,value:finalQty*(parseFloat(product.cost)||0),original,recount,finalQty};
  }).filter(Boolean),order);
  let total=0;
  const rows=[['Product','Category','Subcategory','Original Count','Re-count','Final Count','Unit','Unit Cost','Final Value']];
  entries.forEach(entry=>{total+=entry.value;rows.push([entry.product.name,entry.product.category,entry.product.subcategory||'',entry.original,entry.recount===null?'':entry.recount,entry.finalQty,entry.product.unit,entry.product.cost||0,+entry.value.toFixed(2)]);const detail=includeRoomDetails?countReportRoomDetailText(inv,entry.product):'';if(detail)rows.push([detail,'','','','','','','','']);});
  rows.push(['','','','','','','','TOTAL',+total.toFixed(2)]);
  return{entries,rows,total};
}
function inventoryExportReport(inv,order,includeRoomDetails=false){return inv.recordType==='recount'?recountComparisonReport(inv,order,includeRoomDetails):countReportRows(inv.items,order,inv,includeRoomDetails);}
function openCountReportExport(id=viewInvId){
  closeAllMenus();
  const inv=state.inventories.find(item=>item.id===id);
  if(!inv){toast('Count not found.',true);return;}
  normalizeInventoryRooms(inv);
  countReportInventoryId=id;
  const title=document.getElementById('count-report-export-title');
  const summary=document.getElementById('count-report-export-summary');
  const orderSelect=document.getElementById('count-report-order');
  const usageOption=orderSelect?.querySelector('option[value="usage"]');
  const hasInventoryEntryOrder=inventoryEntryReportOrderMap().size>0;
  if(title)title.textContent=`Export report — ${inv.label||'Count'}`;
  if(summary){
    const reportItemCount=inv.recordType==='recount'?recountComparisonReport(inv,'category').entries.length:Object.keys(inv.items||{}).length;
    summary.textContent=`${fmtDate(inv.date)} · ${inv.rooms.length} room${inv.rooms.length===1?'':'s'} · ${reportItemCount} report item${reportItemCount===1?'':'s'}${inv.recordType==='recount'?' · Original, re-count, and final quantities':''}`;
  }
  if(usageOption){
    usageOption.disabled=!hasInventoryEntryOrder;
    usageOption.textContent=hasInventoryEntryOrder?'Usage order — Inventory Entry Form':'Usage order — Inventory Entry Form (not set)';
  }
  if(orderSelect)orderSelect.value=hasInventoryEntryOrder?'usage':'category';
  const excel=document.querySelector('input[name="count-report-format"][value="xlsx"]');
  if(excel)excel.checked=true;
  const roomDetails=document.getElementById('count-report-room-details');
  if(roomDetails)roomDetails.checked=false;
  updateCountReportExportPreview();
  openModal('modal-count-report-export');
}
function updateCountReportExportPreview(){
  const inv=state.inventories.find(item=>item.id===countReportInventoryId);
  if(!inv)return;
  const order=document.getElementById('count-report-order')?.value||'category';
  const format=document.querySelector('input[name="count-report-format"]:checked')?.value||'xlsx';
  const includeRoomDetails=!!document.getElementById('count-report-room-details')?.checked;
  const report=inventoryExportReport(inv,order);
  const names=report.entries.slice(0,4).map(entry=>entry.product.name);
  const remaining=Math.max(report.entries.length-names.length,0);
  const previewTitle=document.getElementById('count-report-preview-title');
  const previewItems=document.getElementById('count-report-preview-items');
  const source=document.getElementById('count-report-order-source');
  const button=document.getElementById('count-report-export-button');
  const printButton=document.getElementById('count-report-print-button');
  if(previewTitle)previewTitle.textContent=`${report.entries.length} items · ${COUNT_REPORT_ORDER_LABELS[order]||COUNT_REPORT_ORDER_LABELS.category}`;
  if(previewItems)previewItems.textContent=names.length?`${names.join(' → ')}${remaining?` → ${remaining} more`:''}`:'This count has no reportable items.';
  if(source){
    const template=state.inventoryEntryTemplate;
    const roomDetailNote=includeRoomDetails?(format==='xlsx'?' Room quantities will appear beneath each merged item.':' Room quantities will appear in small text beneath each item.'):'';
    source.textContent=(order==='usage'
      ?`Order source: ${template?.sourceFile||'Inventory Entry Form'}`
      :format==='xlsx'
        ?'The selected order will be applied to the merged total and every room worksheet.'
        :'Download saves a PDF file directly. Open / Print uses the browser print dialog.')+roomDetailNote;
  }
  if(printButton)printButton.hidden=format!=='pdf';
  if(button)button.textContent=format==='pdf'?'Download PDF':'Download Excel report';
}
function exportConfiguredCountReport(){
  const id=countReportInventoryId;
  const order=document.getElementById('count-report-order')?.value||'category';
  const format=document.querySelector('input[name="count-report-format"]:checked')?.value||'xlsx';
  const includeRoomDetails=!!document.getElementById('count-report-room-details')?.checked;
  if(!id){toast('Count not found.',true);return;}
  closeModal('modal-count-report-export');
  if(format==='pdf')downloadInventoryCountPdf(id,order,includeRoomDetails);
  else exportInventoryExcel(id,order,includeRoomDetails);
}
function printConfiguredCountReport(){
  const id=countReportInventoryId;
  const order=document.getElementById('count-report-order')?.value||'category';
  const includeRoomDetails=!!document.getElementById('count-report-room-details')?.checked;
  if(!id){toast('Count not found.',true);return;}
  closeModal('modal-count-report-export');
  printInventoryCount(id,order,includeRoomDetails);
}
function exportInventoryExcel(id,order='category',includeRoomDetails=false){
  const inv=state.inventories.find(i=>i.id===id);if(!inv){toast('Count not found.',true);return;}
  normalizeInventoryRooms(inv);
  closeAllMenus();
  const merged=inventoryExportReport(inv,order,includeRoomDetails);
  const sheets=[{name:(`Merged ${inv.date}`).slice(0,31),rows:merged.rows}];
  inv.rooms.forEach(room=>{
    const roomReport=countReportRows(room.items||{},order);
    sheets.push({name:room.name.slice(0,31)||'Room',rows:roomReport.rows});
  });
  xlDown(sheets,`inventory_count_${inv.date}.xlsx`);
}
function countReportPdfText(value){
  return String(value??'')
    .replace(/[–—]/g,'-')
    .replace(/→/g,'>')
    .replace(/\s+/g,' ')
    .trim();
}
function countReportPdfFileName(inv){
  const label=countReportPdfText(inv.label||'count')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g,'-')
    .replace(/^-|-$/g,'')
    .slice(0,48)||'count';
  return`${label}_${inv.date||today()}_count_report.pdf`;
}
function buildInventoryCountPdf(id,order='category',includeRoomDetails=false){
  const inv=state.inventories.find(item=>item.id===id);
  if(!inv)throw new Error('Count not found.');
  const PdfDocument=window.jspdf?.jsPDF;
  if(!PdfDocument)throw new Error('The PDF download library did not load. Refresh and try again, or use Open / Print.');
  normalizeInventoryRooms(inv);
  const report=inventoryExportReport(inv,order);
  const doc=new PdfDocument({orientation:'landscape',unit:'pt',format:'letter'});
  if(typeof doc.autoTable!=='function')throw new Error('The PDF table library did not load. Refresh and try again, or use Open / Print.');
  const title=countReportPdfText(`Count Report - ${inv.label||fmtDate(inv.date)}`);
  const roomNames=inv.rooms.map(room=>room.name).join(', ');
  const details=countReportPdfText(`Date: ${fmtDate(inv.date)} | Rooms: ${roomNames} | Order: ${COUNT_REPORT_ORDER_LABELS[order]||COUNT_REPORT_ORDER_LABELS.category} | Merged Total: ${fmt(report.total)}`);
  const isRecount=inv.recordType==='recount';
  const body=[];
  report.entries.forEach(entry=>{
    const product=entry.product;
    body.push(isRecount?[
      countReportPdfText(product.name),countReportPdfText(product.category),countReportPdfText(product.subcategory||''),
      liveQty(entry.original),entry.recount===null?'-':liveQty(entry.recount),liveQty(entry.finalQty),countReportPdfText(product.unit),product.cost>0?fmt(product.cost):'-',fmt(entry.value)
    ]:[
      countReportPdfText(product.name),countReportPdfText(product.category),countReportPdfText(product.subcategory||''),
      liveQty(entry.qty),countReportPdfText(product.unit),product.par||'-',product.cost>0?fmt(product.cost):'-',fmt(entry.value)
    ]);
    const roomDetail=includeRoomDetails?countReportRoomDetailText(inv,product):'';
    if(roomDetail)body.push([{content:countReportPdfText(roomDetail),colSpan:isRecount?9:8,styles:{fontSize:5.8,fontStyle:'italic',textColor:[92,103,114],fillColor:[250,251,252],cellPadding:{top:2,right:4,bottom:3,left:10}}}]);
  });
  const pageWidth=doc.internal.pageSize.getWidth();
  const pageHeight=doc.internal.pageSize.getHeight();
  doc.autoTable({
    head:[isRecount?['Product','Category','Subcategory','Original','Re-count','Final','Unit','Unit Cost','Final Value']:['Product','Category','Subcategory','Qty','Unit','Par','Unit Cost','Value']],
    body,
    foot:[isRecount?['','','','','','','','Total',fmt(report.total)]:['','','','','','','Total',fmt(report.total)]],
    startY:78,
    margin:{top:78,right:30,bottom:34,left:30},
    theme:'striped',
    showHead:'everyPage',
    showFoot:'lastPage',
    styles:{font:'helvetica',fontSize:7.5,cellPadding:4,overflow:'ellipsize',textColor:[28,36,45],lineColor:[220,225,230],lineWidth:.25},
    headStyles:{fillColor:[38,49,61],textColor:[255,255,255],fontStyle:'bold',fontSize:7.5},
    footStyles:{fillColor:[232,236,240],textColor:[28,36,45],fontStyle:'bold'},
    alternateRowStyles:{fillColor:[246,247,248]},
    columnStyles:isRecount?{
      0:{cellWidth:175},1:{cellWidth:70},2:{cellWidth:78},3:{cellWidth:48,halign:'right'},4:{cellWidth:48,halign:'right'},5:{cellWidth:48,halign:'right'},6:{cellWidth:50},7:{cellWidth:66,halign:'right'},8:{cellWidth:76,halign:'right'}
    }:{
      0:{cellWidth:205},
      1:{cellWidth:82},
      2:{cellWidth:96},
      3:{cellWidth:48,halign:'right'},
      4:{cellWidth:58},
      5:{cellWidth:46,halign:'right'},
      6:{cellWidth:72,halign:'right'},
      7:{cellWidth:72,halign:'right'}
    },
    didDrawPage:()=>{
      const pageNumber=doc.internal.getNumberOfPages();
      doc.setTextColor(23,32,42);
      doc.setFont('helvetica','bold');
      doc.setFontSize(16);
      doc.text(title,30,31);
      doc.setTextColor(86,98,110);
      doc.setFont('helvetica','normal');
      doc.setFontSize(7.5);
      const detailLines=doc.splitTextToSize(details,pageWidth-60);
      doc.text(detailLines,30,47);
      doc.setFontSize(7);
      doc.text(`Page ${pageNumber}`,pageWidth-30,pageHeight-17,{align:'right'});
    }
  });
  doc.setProperties({
    title,
    subject:'Inventory count report',
    author:'Month End',
    creator:'Month End'
  });
  return{doc,fileName:countReportPdfFileName(inv),report};
}
function downloadInventoryCountPdf(id,order='category',includeRoomDetails=false){
  try{
    const output=buildInventoryCountPdf(id,order,includeRoomDetails);
    output.doc.save(output.fileName);
    toast(`Downloaded: ${output.fileName}`);
  }catch(error){
    console.error('Count report PDF download failed:',error);
    toast(error.message||'The PDF could not be downloaded.',true);
  }
}
function printInventoryCount(id,order='category',includeRoomDetails=false){
  const inv=state.inventories.find(i=>i.id===id);if(!inv){toast('Count not found.',true);return;}
  normalizeInventoryRooms(inv);
  closeAllMenus();
  const report=inventoryExportReport(inv,order);
  const isRecount=inv.recordType==='recount';
  const bodyRows=report.entries.map(entry=>{
    const detail=includeRoomDetails?countReportRoomDetailText(inv,entry.product):'';
    const productCell=detail?{value:entry.product.name,detail}:entry.product.name;
    return isRecount
      ?[productCell,entry.product.category,entry.product.subcategory||'',entry.original,entry.recount===null?'—':entry.recount,entry.finalQty,entry.product.unit,entry.product.cost>0?fmt(entry.product.cost):'—',fmt(entry.value)]
      :[productCell,entry.product.category,entry.product.subcategory||'',entry.qty,entry.product.unit,entry.product.par||'—',entry.product.cost>0?fmt(entry.product.cost):'—',fmt(entry.value)];
  });
  printTable(
    `Count Report — ${inv.label||fmtDate(inv.date)}`,
    `Date: ${fmtDate(inv.date)} · Rooms: ${inv.rooms.map(room=>room.name).join(', ')} · Order: ${COUNT_REPORT_ORDER_LABELS[order]||COUNT_REPORT_ORDER_LABELS.category} · Merged Total: ${fmt(report.total)}`,
    isRecount?['Product','Category','Subcategory','Original Count','Re-count','Final Count','Unit','Unit Cost','Final Value']:['Product','Category','Subcategory','Qty','Unit','Par','Unit Cost','Value'],
    bodyRows
  );
}

document.getElementById('mobile-count-continue')?.addEventListener('click',continueMobileCountSetup);
document.addEventListener('click',event=>{
  if(document.getElementById('voice-modal')?.classList.contains('open'))return;
  const setup=document.getElementById('modal-inv-room-select');
  const button=document.getElementById('mobile-count-continue');
  if(!setup?.classList.contains('open')||!button)return;
  const bounds=button.getBoundingClientRect();
  if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  continueMobileCountSetup();
},true);
document.getElementById('inv-filter-done')?.addEventListener('click',closeInventoryFilterSheet);
document.addEventListener('click',event=>{
  if(document.getElementById('voice-modal')?.classList.contains('open'))return;
  const sheet=document.getElementById('inv-filter-sheet');
  const button=document.getElementById('inv-filter-done');
  if(!sheet?.classList.contains('open')||!button)return;
  const bounds=button.getBoundingClientRect();
  if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  closeInventoryFilterSheet();
},true);
document.getElementById('inventory-count-cancel')?.addEventListener('click',()=>exitInventoryRoom());
document.getElementById('inventory-count-finish')?.addEventListener('click',()=>saveInventory(false));
document.addEventListener('click',event=>{
  // This coordinate fallback is registered before voice.js. Without an
  // explicit top-layer guard, a tap on Stop & Review can also activate the
  // count footer underneath it on narrow mobile screens and exit the room.
  if(document.getElementById('voice-modal')?.classList.contains('open'))return;
  if(!document.getElementById('modal-inventory')?.classList.contains('open'))return;
  const actions=[
    {button:document.getElementById('inventory-count-cancel'),run:()=>exitInventoryRoom()},
    {button:document.getElementById('inventory-count-finish'),run:()=>saveInventory(false)},
  ];
  const action=actions.find(item=>{
    if(!item.button)return false;
    const bounds=item.button.getBoundingClientRect();
    return event.clientX>=bounds.left&&event.clientX<=bounds.right&&event.clientY>=bounds.top&&event.clientY<=bounds.bottom;
  });
  if(!action)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  action.run();
},true);
window.addEventListener('pagehide',()=>{
  if(currentCountRoomLock&&typeof cloudReleaseCountRoom==='function')cloudReleaseCountRoom(currentCountRoomLock.countId,currentCountRoomLock.roomId,true);
});
