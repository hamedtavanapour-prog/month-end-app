// inventory.js — counting sessions, progress, saved counts, single-count export.

let inventoryCountSaving=false;
let countDraftSaving=false;

function latestInventoryCount(){
  return [...state.inventories].sort((a,b)=>(b.date||'').localeCompare(a.date||''))[0]||null;
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
  if(room){
    const floorRoom=room.roomId?floorPlanRoomById(room.roomId):null;
    return new Set(roomProductIds(floorRoom));
  }
  const ids=new Set();
  (inv?.rooms||[]).forEach(invRoom=>{
    const floorRoom=invRoom.roomId?floorPlanRoomById(invRoom.roomId):null;
    roomProductIds(floorRoom).forEach(id=>ids.add(id));
  });
  if(!ids.size)state.products.filter(product=>!product.archived).forEach(product=>ids.add(product.id));
  return ids;
}
function currentRoomProducts(){
  const room=currentInventoryRoom();
  const floorRoom=room?.roomId?floorPlanRoomById(room.roomId):null;
  return roomProducts(floorRoom);
}
function currentCountProducts(){
  if(currentInvMergedView&&currentInvEdit){
    const inv=state.inventories.find(item=>item.id===currentInvEdit);
    const expected=expectedInventoryProductIds(inv);
    return state.products.filter(product=>!product.archived&&expected.has(product.id));
  }
  return currentRoomProducts();
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
  return{id:uid(),roomId:room.id,name:room.name,items:{}};
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
    inv.rooms.push({id:uid(),roomId:floorRoom.id,name:floorRoom.name,items:{}});
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
  const wrap=document.getElementById('inv-room-tabs');
  if(!wrap)return;
  const ex=currentInvEdit?state.inventories.find(i=>i.id===currentInvEdit):null;
  const rooms=ex?(normalizeInventoryRooms(ex),ex.rooms):currentInvRooms;
  wrap.innerHTML=rooms.map(room=>{
    const count=Object.keys(room.items||{}).length;
    const active=room.id===currentInvRoomId?'active':'';
    return`<button class="room-tab ${active}" type="button" onclick="switchInventoryRoom('${room.id}')"><span>${escapeHtml(room.name)}</span><strong>${count}</strong></button>`;
  }).join('');
  const select=document.getElementById('inv-room-select');
  if(select){
    const mergedOption=currentInvEdit?`<option value="all" ${currentInvMergedView?'selected':''}>Merged Total</option>`:'';
    select.innerHTML=mergedOption+rooms.map(room=>`<option value="${room.id}" ${!currentInvMergedView&&room.id===currentInvRoomId?'selected':''}>${escapeHtml(room.name)}</option>`).join('');
    select.value=currentInvMergedView?'all':(currentInvRoomId||rooms[0]?.id||'');
  }
}
function switchInventoryRoom(roomId){
  if(roomId==='all'&&currentInvEdit){
    captureCurrentRoomCounts();
    const inv=state.inventories.find(item=>item.id===currentInvEdit);if(!inv)return;
    currentInvMergedView=true;
    liveInvCounts={...inv.items};
    renderInventoryRooms();renderInvRows(true);return;
  }
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
    const room={id:uid(),roomId:floorRoom.id,name:floorRoom.name,items:{}};
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
  const room={id:uid(),roomId:floorRoom.id,name:floorRoom.name,items:{}};
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

function liveUsageQtyByProduct(baselineDate=''){
  const totals={};
  ensureUsageLogs().filter(log=>!log.archived).forEach(log=>{
    const period=usageLogPeriod(log);
    if(!liveMovementAfterBaseline(period.end||period.start,baselineDate))return;
    usageLogRows(log).forEach(row=>{
      if(!row.matched||!row.productId)return;
      totals[row.productId]=(totals[row.productId]||0)+usageRowQty(row);
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
function liveInventoryRows(){
  const baseline=latestInventoryCount();
  const baselineDate=baseline?.date||'';
  const rooms=selectedLiveInventoryRooms();
  const allRooms=liveInventoryRoomIds===null;
  const invRooms=rooms.map(room=>inventoryRoomForFloorRoom(baseline,room.id)).filter(Boolean);
  const ordered=allRooms?liveOrderQtyByProduct(baselineDate):{};
  const used=allRooms?liveUsageQtyByProduct(baselineDate):{};
  const allowed=allRooms?null:new Set(rooms.flatMap(room=>roomProductIds(room)));
  const roomLabel=allRooms?'All rooms':rooms.length===1?rooms[0].name:`${rooms.length} rooms`;
  return state.products.filter(product=>!product.archived&&(!allowed||allowed.has(product.id))).map(product=>{
    const base=allRooms?(baseline?.items?.[product.id]??product.lastCount??0):invRooms.reduce((sum,room)=>sum+(parseFloat(room.items?.[product.id])||0),0);
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
  liveInventoryViewMode=['list','icons','boxes'].includes(mode)?mode:'list';
  renderLiveInventoryPage();
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
  renderLiveInventoryViewButtons();
  if(!state.products.length){
    results.innerHTML=liveInventoryEmpty('Loading live inventory...');
    setTimeout(()=>{if(document.getElementById('page-live-inventory')?.classList.contains('active'))renderLiveInventoryPage();},600);
    return;
  }
  const search=(document.getElementById('live-inv-search')?.value||'').toLowerCase();
  const cat=document.getElementById('live-inv-cat-f')?.value||'';
  const sub=document.getElementById('live-inv-sub-f')?.value||'';
  const status=document.getElementById('live-inv-status-f')?.value||'';
  const baseline=latestInventoryCount();
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
  if(liveInventoryViewMode==='icons')results.innerHTML=liveInventoryIcons(rows);
  else if(liveInventoryViewMode==='boxes')results.innerHTML=liveInventoryBoxes(rows);
  else results.innerHTML=liveInventoryList(rows);
}

function openLiveInventoryDetail(productId){
  const row=liveInventoryRows().find(item=>item.product.id===productId);
  if(!row)return;
  const body=document.getElementById('live-inv-detail-body');
  const baseline=latestInventoryCount();
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

function initLiveCounts(ex){
  liveInvCounts={};
  if(ex){
    normalizeInventoryRooms(ex);
    currentInvRooms=[];
    const room=ex.rooms.find(item=>Object.keys(item.items||{}).length)||ex.rooms[0];
    currentInvRoomId=room.id;
    currentRoomProducts().forEach(p=>{liveInvCounts[p.id]=room.items[p.id]!==undefined?room.items[p.id]:'';});
    return;
  }
  currentInvRooms=activeFloorPlanRooms().map(room=>({id:uid(),roomId:room.id,name:room.name,items:{}}));
  if(!currentInvRooms.length)currentInvRooms=[defaultInventoryRoom()];
  currentInvRoomId=currentInvRooms[0].id;
  currentRoomProducts().forEach(p=>{liveInvCounts[p.id]='';});
}
function onInvInput(pid,el){liveInvCounts[pid]=el.value===''?'':parseFloat(el.value);hideInventoryFinishMessage();const row=document.getElementById('row-'+pid);if(!row)return;const dot=row.querySelector('.missing-dot,.filled-dot');const f=el.value!=='';if(dot)dot.className=f?'filled-dot':'missing-dot';row.className='inv-count-row '+(f?'filled-row':'missing-row');const section=row.closest('.inv-count-section');if(section){const inputs=[...section.querySelectorAll('input[data-count-input="true"]')];const filled=inputs.filter(input=>input.value!=='').length;const count=section.querySelector('.inv-section-summary-count');if(count)count.textContent=`${filled}/${inputs.length}`;}prepareFollowingInventorySection(el);updateInvProgress();}
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
  return[...products].sort((a,b)=>
    (a.category||'').localeCompare(b.category||'')||
    (a.subcategory||'').localeCompare(b.subcategory||'')||
    a.name.localeCompare(b.name)
  );
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
    openInventoryModal(draft.id);
    const selectedRoom=draft.rooms.find(room=>room.roomId===rooms[0].id)||draft.rooms[0];
    if(selectedRoom)switchInventoryRoom(selectedRoom.id);
  }finally{
    setCountDraftSaving(false);
  }
}
function startRoomCount(roomId){
  if(typeof profileCanAccessRoom==='function'&&!profileCanAccessRoom(currentProfile(),roomId)){toast('You do not have access to that room.',true);return;}
  const date=document.getElementById('room-count-date').value||today();
  const label=document.getElementById('room-count-label').value.trim();
  closeModal('modal-inv-room-select');
  openInventoryModal(null,roomId,date,label);
}
function draftRoomsFromFloorPlan(floorRooms=activeFloorPlanRooms()){
  return floorRooms.map(room=>({id:uid(),roomId:room.id,name:room.name,items:{}}));
}
async function createCountDraft(date,label,floorRooms=activeFloorPlanRooms()){
  const existing=findInventorySession(date,label);
  if(existing){
    ensureInventoryHasFloorPlanRooms(existing);
    existing.items=mergeInventoryRoomItems(existing.rooms);
    save();
    renderInventoryTable();
    toast(existing.draft?'Opening the existing draft.':'Opening the existing count.');
    return existing;
  }
  const rooms=draftRoomsFromFloorPlan(floorRooms);
  if(!rooms.length){toast('Add rooms in Settings first.',true);return;}
  const id=uid();
  const actor=window.serverAccessContext?.user||{};
  const createdBy={id:actor.id||'',name:actor.name||'Team member',role:actor.jobTitle||actor.role||'Team member'};
  const draft={id,date,label,items:{},rooms,draft:true,createdBy,createdAt:new Date().toISOString()};
  state.inventories.push(draft);
  state.inventories.sort((a,b)=>a.date<b.date?1:-1);
  save();
  const pushed=typeof cloudPushNow==='function'?await cloudPushNow():true;
  renderInventoryTable();
  refreshLiveInventoryIfVisible();
  window.recordServerEvent?.({action:'count.draft_created',entityType:'count',entityId:id,details:{label,date,rooms:rooms.length,actor:createdBy}});
  toast(pushed?'Count draft created.':'Draft saved on this device; cloud saving is still pending.',!pushed);
  return draft;
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
  if(index>=0)inv.rooms[index]={...inv.rooms[index],name:room.name,roomId:room.roomId,items:room.items};
  else inv.rooms.push(room);
  inv.items=mergeInventoryRoomItems(inv.rooms);
  inv.draft=!Object.keys(inv.items).length;
}
function cloneInventoryRoom(room){
  return{...room,items:{...(room.items||{})}};
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
    return!!match&&room.name===match.name&&inventoryRoomItemsEqual(room.items,match.items);
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
function openInventoryModal(existingId=null,selectedFloorRoomId=null,presetDate='',presetLabel=''){
  dirtyInventoryRoomIds=new Set();
  deletedInventoryRoomIds=new Set();
  expandedInventorySections=new Set();
  hideInventoryFinishMessage();
  setInventoryFinishSaving(false);
  currentInvEdit=existingId;const ex=existingId?state.inventories.find(i=>i.id===existingId):null;
  if(ex)ensureInventoryHasFloorPlanRooms(ex);
  document.getElementById('inv-date').value=ex?ex.date:(presetDate||today());document.getElementById('inv-label').value=ex?ex.label||'':presetLabel;
  initLiveCounts(ex);
  currentInvMergedView=!!ex;
  if(currentInvMergedView)liveInvCounts={...ex.items};
  document.getElementById('inv-search').value='';document.getElementById('inv-cat-f').value='';
  if(!ex&&selectedFloorRoomId){
    const selected=currentInvRooms.find(room=>room.roomId===selectedFloorRoomId);
    if(selected){
      currentInvRoomId=selected.id;
      liveInvCounts={};
      currentRoomProducts().forEach(p=>{liveInvCounts[p.id]=selected.items[p.id]!==undefined?selected.items[p.id]:'';});
    }
  }
  document.getElementById('inv-sub-f').innerHTML='<option value="">All</option>';document.getElementById('inv-show-f').value='all';document.getElementById('inv-sort-f').value='category';
  document.getElementById('mobile-count-label').textContent=document.getElementById('inv-label').value||'Inventory Count';
  document.getElementById('mobile-count-date').textContent=fmtDate(document.getElementById('inv-date').value);
  closeInventoryFilterSheet();
  renderInventoryRooms();renderInvRows(true);openModal('modal-inventory');
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
  if(liveHasEntries)return true;
  const rooms=currentInvEdit?(state.inventories.find(inv=>inv.id===currentInvEdit)?.rooms||[]):currentInvRooms;
  return(rooms||[]).some(room=>Object.keys(room.items||{}).length>0);
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
  const button=document.getElementById('inventory-count-finish');
  if(!button)return;
  button.disabled=saving;
  button.setAttribute('aria-busy',String(saving));
  const desktopLabel=button.querySelector('.desktop-only');
  const mobileLabel=button.querySelector('.mobile-only');
  if(desktopLabel)desktopLabel.textContent=saving?'Saving…':'Finish Count';
  if(mobileLabel)mobileLabel.textContent=saving?'Saving…':'Finish & View Report';
}
function renderInvRows(skipCapture=false){
  const roomScopedProducts=currentCountProducts();
  if(!skipCapture)roomScopedProducts.forEach(p=>{const el=document.getElementById('invq-'+p.id);if(el)liveInvCounts[p.id]=el.value===''?'':parseFloat(el.value);});
  const search=document.getElementById('inv-search').value.toLowerCase();const cat=document.getElementById('inv-cat-f').value;const sub=document.getElementById('inv-sub-f').value;const show=document.getElementById('inv-show-f').value;const sortMode=document.getElementById('inv-sort-f')?.value||'category';
  updateInventoryFilterSummary();
  let prods=roomScopedProducts.filter(p=>(!cat||p.category===cat)&&(!sub||p.subcategory===sub)&&(!search||p.name.toLowerCase().includes(search)||(p.aliases||'').toLowerCase().includes(search)||(p.subcategory||'').toLowerCase().includes(search)));
  if(show==='missing')prods=prods.filter(p=>{const v=liveInvCounts[p.id];return v===''||v===null||v===undefined;});
  if(show==='filled')prods=prods.filter(p=>{const v=liveInvCounts[p.id];return v!==''&&v!==null&&v!==undefined;});
  prods=sortedInventoryProducts(prods,sortMode);
  const groups={};prods.forEach(p=>{const k=p.category+'|||'+(p.subcategory||'Other');if(!groups[k])groups[k]={cat:p.category,sub:p.subcategory||'Other',items:[]};groups[k].items.push(p);});
  if(!prods.length){document.getElementById('inv-rows').innerHTML=`<p style="color:var(--text-muted);text-align:center;padding:24px;">No products assigned to this room match.</p>`;updateInvProgress();return;}
  let html='';
  const renderProduct=p=>{const val=liveInvCounts[p.id];const isFilled=val!==''&&val!==null&&val!==undefined;return`<div class="inv-count-row ${isFilled?'filled-row':'missing-row'}" id="row-${p.id}"><div><span class="${isFilled?'filled-dot':'missing-dot'}"></span><span class="inv-prod-name">${productNameLink(p)}</span><div class="inv-prod-meta">${p.category}${p.subcategory?` · ${p.subcategory}`:''} · ${p.unit}${p.par?` · Par: ${p.par}`:''}</div></div><input type="number" inputmode="decimal" enterkeyhint="next" autocomplete="off" min="0" step="0.01" id="invq-${p.id}" data-count-input="true" value="${isFilled?val:''}" placeholder="qty" ${currentInvMergedView?'readonly aria-readonly="true"':''} oninput="onInvInput('${p.id}',this)" onfocus="onInvQtyFocus(this)" onkeydown="onInvQtyKey(event,this)"><span style="font-size:0.74rem;color:var(--text-muted);">${p.unit}</span></div>`;};
  if(sortMode==='category')Object.values(groups).forEach(g=>{
    const sectionToken=encodeURIComponent(`${currentInvRoomId||''}|||${g.cat}|||${g.sub}`);
    const collapsed=!expandedInventorySections.has(sectionToken);
    const filledCount=g.items.filter(product=>{const value=liveInvCounts[product.id];return value!==''&&value!==null&&value!==undefined;}).length;
    html+=`<section class="inv-count-section ${collapsed?'collapsed':''}" data-section-token="${sectionToken}">
      <button class="inv-section-header" type="button" aria-expanded="${!collapsed}" onclick="toggleInventorySection('${sectionToken}')">
        <span class="inv-section-title">${catBadge(g.cat)} <span>${escapeHtml(g.sub)}</span></span>
        <span class="inv-section-summary"><span class="inv-section-summary-count">${filledCount}/${g.items.length}</span><span class="inv-section-chevron" aria-hidden="true">⌄</span></span>
      </button>
      <div class="inv-section-items" ${collapsed?'hidden':''}>${g.items.map(renderProduct).join('')}</div>
    </section>`;
  });
  else html=prods.map(renderProduct).join('');
  document.getElementById('inv-rows').innerHTML=html;
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
async function saveInventory(){
  if(inventoryCountSaving)return;
  const date=document.getElementById('inv-date').value;if(!date){toast('Select a date.',true);return;}
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
  const label=document.getElementById('inv-label').value.trim();
  const wasEditing=Boolean(currentInvEdit);
  const auditActor=window.serverAccessContext?.user||{};
  const auditStamp={id:auditActor.id||'',name:auditActor.name||'Team member',role:auditActor.jobTitle||auditActor.role||'Team member'};
  let rooms;
  let activeRoom=null;
  let savedId=currentInvEdit;
  if(currentInvEdit){
    const inv=state.inventories.find(x=>x.id===currentInvEdit);
    normalizeInventoryRooms(inv);
    captureCurrentRoomCounts();
    rooms=inv.rooms;
    activeRoom=rooms.find(room=>room.id===currentInvRoomId)||rooms[0];
    const editedRooms=rooms.filter(room=>dirtyInventoryRoomIds.has(room.id)).map(cloneInventoryRoom);
    const deletedIds=new Set(deletedInventoryRoomIds);
    const latest=cloudReady&&typeof cloudLoad==='function'?await cloudLoad():undefined;
    if(latest&&Array.isArray(latest.inventories)){
      state=latest;
      normalizeLoadedState();
      let cloudInv=state.inventories.find(x=>x.id===currentInvEdit);
      if(cloudInv){
        normalizeInventoryRooms(cloudInv);
        cloudInv.rooms=mergeEditedInventoryRooms(cloudInv.rooms,editedRooms,deletedIds);
        cloudInv.date=date;
        cloudInv.label=label;
        cloudInv.items=mergeInventoryRoomItems(cloudInv.rooms);
        rooms=cloudInv.rooms;
        savedId=cloudInv.id;
      }
    }
  }else{
    captureCurrentRoomCounts();
    activeRoom=currentInvRooms.find(room=>room.id===currentInvRoomId)||currentInvRooms[0];
    const latest=cloudReady&&typeof cloudLoad==='function'?await cloudLoad():undefined;
    if(latest&&Array.isArray(latest.inventories)){
      state=latest;
      normalizeLoadedState();
    }
    const session=findInventorySession(date,label);
    if(session){
      replaceInventoryRoom(session,activeRoom);
      rooms=session.rooms;
      savedId=session.id;
    }else rooms=currentInvRooms;
  }
  const items=mergeInventoryRoomItems(rooms);
  if(!Object.keys(items).length){toast('No quantities entered.',true);return;}
  if(currentInvEdit){const i=state.inventories.findIndex(x=>x.id===currentInvEdit);state.inventories[i]={...state.inventories[i],date,label,items,rooms,draft:false,updatedBy:auditStamp,updatedAt:new Date().toISOString()};savedId=state.inventories[i].id;}
  else if(!savedId){savedId=uid();state.inventories.push({id:savedId,date,label,items,rooms,createdBy:auditStamp,createdAt:new Date().toISOString()});}
  else{const i=state.inventories.findIndex(x=>x.id===savedId);if(i>=0)state.inventories[i]={...state.inventories[i],date,label,items,rooms,draft:false,createdBy:state.inventories[i].createdBy||auditStamp,createdAt:state.inventories[i].createdAt||new Date().toISOString(),updatedBy:auditStamp,updatedAt:new Date().toISOString()};}
  state.inventories.sort((a,b)=>a.date<b.date?1:-1);
  save();
  const pushed=typeof cloudPushNow==='function'?await cloudPushNow():true;
  const confirmed=pushed&&await inventorySavedInCloud(savedId,date,label,rooms);
  if(!confirmed){
    toast('Saved on this device, but cloud saving failed. Keep this window open and try again.',true);
    return;
  }
  window.recordServerEvent?.({action:wasEditing?'count.updated':'count.created',entityType:'count',entityId:savedId,details:{label,date,rooms:rooms.length,items:Object.keys(items).length,actor:auditStamp}});
  closeModal('modal-inventory');renderInventoryTable();refreshLiveInventoryIfVisible();toast(`Saved — ${Object.keys(items).length} items.`);
  dirtyInventoryRoomIds=new Set();
  deletedInventoryRoomIds=new Set();
  viewInventory(savedId);
  }catch(error){
    console.error('Inventory save failed:',error);
    showInventoryFinishMessage('The count could not be saved. Please try again.');
    toast('The count could not be saved. Please try again.',true);
  }finally{
    setInventoryFinishSaving(false);
  }
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
  let rows=state.inventories.filter(inv=>showArchivedInventories?!!inv.archived:!inv.archived).map(inv=>{normalizeInventoryRooms(inv);const total=Object.entries(inv.items).reduce((s,[id,q])=>{const p=getProduct(id);return s+(p?p.cost*q:0);},0);const expected=expectedInventoryProductIds(inv);const counted=Object.keys(inv.items).filter(id=>expected.has(id)).length,missing=Math.max(expected.size-counted,0);const roomsCount=inv.rooms.filter(room=>Object.keys(room.items||{}).length>0).length;return{...inv,counted,missing,roomsCount,value:total};});
  rows=sortArr(rows,sortState.inventories.col,sortState.inventories.dir);
  const tbody=document.getElementById('inv-tbody');
  const mobileList=document.getElementById('inventory-mobile-list');
  if(!rows.length){
    const emptyState=showArchivedInventories
      ?`<div class="table-empty-state"><strong>No archived counts</strong><p>Counts you archive will stay available here.</p></div>`
      :`<div class="table-empty-state"><strong>File your first inventory count</strong><p>Choose a room, enter what is on hand, and save a baseline for live inventory.</p><button class="btn btn-primary" type="button" onclick="openInventoryRoomSelect()">＋ Start first count</button></div>`;
    tbody.innerHTML=`<tr><td colspan="${visCols.length}">${emptyState}</td></tr>`;
    if(mobileList)mobileList.innerHTML=emptyState;
    return;
  }
  tbody.innerHTML=rows.map((inv,index)=>`<tr class="inventory-row ${inv.archived?'archived-row':''}" onclick="viewInventory('${inv.id}')">${visCols.map(c=>{switch(c.key){case 'date':return`<td>${fmtDate(inv.date)}</td>`;case 'label':return`<td>${inv.label||'—'}${inv.createdBy?.name?`<small class="count-audit-line">Created by ${escapeHtml(inv.createdBy.name)} · ${escapeHtml(inv.createdBy.role||'')}</small>`:''}${inv.draft?'<div style="margin-top:4px;"><span class="missing-pill">Draft</span></div>':''}${inv.archived?'<div style="margin-top:4px;"><span class="sub-badge">Archived</span></div>':''}</td>`;case 'rooms':return`<td><span class="filled-pill">${inv.roomsCount} room${inv.roomsCount===1?'':'s'} counted</span></td>`;case 'counted':return`<td>${inv.counted}</td>`;case 'missing':return`<td>${inv.missing>0?`<span class="missing-pill"><span class="missing-dot"></span>${inv.missing}</span>`:'<span class="filled-pill">Complete</span>'}</td>`;case 'value':return`<td>${fmt(inv.value)}</td>`;case 'actions':return`<td onclick="event.stopPropagation()"><div class="inventory-row-actions">${inventoryMenuHtml(inv,`inventory-menu-${index}`)}</div></td>`;default:return`<td>—</td>`;}}).join('')}</tr>`).join('');
  if(mobileList)mobileList.innerHTML=rows.map((inv,index)=>mobileInventoryCardHtml(inv,index)).join('');
}
function mobileInventoryCardHtml(inv,index){
  const expanded=mobileExpandedInventoryId===inv.id;
  const label=inv.label||'Inventory Count';
  return`<article class="inventory-mobile-card ${expanded?'expanded':''} ${inv.archived?'archived-row':''}" onclick="toggleMobileInventoryDetails('${inv.id}')" role="button" tabindex="0" onkeydown="if(event.target===event.currentTarget&&(event.key==='Enter'||event.key===' ')){event.preventDefault();toggleMobileInventoryDetails('${inv.id}')}" aria-label="${expanded?'Hide':'Show'} details for ${escapeHtml(label)} from ${fmtDate(inv.date)}" aria-expanded="${expanded}">
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
      ${inv.draft?'<span class="inventory-mobile-status">Draft</span>':''}${inv.archived?'<span class="inventory-mobile-status">Archived</span>':''}
      <div class="inventory-mobile-card-actions" onclick="event.stopPropagation()"><button class="btn btn-secondary inventory-mobile-view-more" type="button" onclick="event.stopPropagation();viewInventory('${inv.id}')">View More</button>${inventoryMenuHtml(inv,`inventory-mobile-menu-${index}`)}</div>
    </div>`:''}
  </article>`;
}
function toggleMobileInventoryDetails(id){
  mobileExpandedInventoryId=mobileExpandedInventoryId===id?null:id;
  closeAllMenus();
  renderInventoryTable();
}
function inventoryMenuHtml(inv,menuId){
  return`<div class="drop-wrap inventory-actions">
    <button class="icon-btn overflow-menu-button" type="button" onclick="event.stopPropagation();toggleMenu('${menuId}')" title="Count actions" aria-label="Count actions"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.4"></circle><circle cx="12" cy="12" r="1.4"></circle><circle cx="19" cy="12" r="1.4"></circle></svg></button>
    <div class="drop-menu" id="${menuId}">
      <button onclick="event.stopPropagation();closeAllMenus();openInventoryModal('${inv.id}')">Edit</button>
      <button onclick="event.stopPropagation();archiveInventory('${inv.id}',${inv.archived?'false':'true'})">${inv.archived?'Restore':'Archive'}</button>
      <div class="drop-divider"></div>
      <button onclick="event.stopPropagation();deleteInventory('${inv.id}')">Delete</button>
    </div>
  </div>`;
}
function toggleArchivedInventories(){showArchivedInventories=!showArchivedInventories;closeAllMenus();renderInventoryTable();}
function archiveInventory(id,archived=true){
  closeAllMenus();
  const inv=state.inventories.find(item=>item.id===id);if(!inv)return;
  inv.archived=archived;save();renderInventoryTable();refreshLiveInventoryIfVisible();
  window.recordServerEvent?.({action:archived?'count.archived':'count.restored',entityType:'count',entityId:id,details:{label:inv.label||'',date:inv.date}});
  if(viewInvId===id){
    document.getElementById('view-inv-title').textContent=`${inv.label||'Inventory'} — ${fmtDate(inv.date)}${inv.archived?' · Archived':''}`;
    renderViewInventoryActions(inv);
  }
  toast(archived?'Count archived.':'Count restored.');
}
function viewInventory(id){
  viewInvId=id;viewInvTab='all';viewInvExpandedProductId=null;viewInvEditingProductId=null;const inv=state.inventories.find(i=>i.id===id);if(!inv)return;normalizeInventoryRooms(inv);
  document.getElementById('view-inv-title').textContent=`${inv.label||'Inventory'} — ${fmtDate(inv.date)}${inv.archived?' · Archived':''}`;
  const attribution=document.getElementById('view-inv-attribution');if(attribution){attribution.textContent=inv.createdBy?.name?`Created by ${inv.createdBy.name} · ${inv.createdBy.role||'Team member'}${inv.createdAt?` · ${new Date(inv.createdAt).toLocaleString()}`:''}`:'';attribution.hidden=!attribution.textContent;}
  document.getElementById('view-inv-search').value='';
  renderViewInventoryActions(inv);renderViewInvTabs(inv);renderViewInvTable();openModal('modal-view-inv');
}
function renderViewInventoryActions(inv){
  const menu=document.getElementById('view-inventory-actions-menu');if(!menu)return;
  menu.innerHTML=`<button onclick="closeAllMenus();editViewedInventory()">Edit count</button><button onclick="exportViewedInventoryExcel()">Export Excel / CSV</button><button onclick="printViewedInventory()">Print / PDF</button><div class="drop-divider"></div><button onclick="archiveInventory('${inv.id}',${inv.archived?'false':'true'})">${inv.archived?'Restore count':'Archive count'}</button><button onclick="deleteInventory('${inv.id}')">Delete count</button>`;
}
function editViewedInventory(){const id=viewInvId;if(!id)return;const selectedRoom=viewInvTab!=='all'&&viewInvTab!=='missing'?viewInvTab:null;closeModal('modal-view-inv');openInventoryModal(id);if(selectedRoom)switchInventoryRoom(selectedRoom);}
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
  viewInvExpandedProductId=productId;
  viewInvEditingProductId=editing?productId:null;
  renderViewInvTable();
  if(editing)setTimeout(()=>document.querySelector(`[data-view-product-id="${productId}"] input`)?.focus(),0);
}
function viewInvItemDetailHtml(inv,product){
  const editing=viewInvEditingProductId===product.id;
  const roomFields=inv.rooms.map(room=>{
    const value=room.items?.[product.id];
    const displayValue=value===undefined||value===null||value===''?'Not counted':liveQty(value);
    return`<div class="view-inv-room-field"><span>${escapeHtml(room.name)}</span>${editing?`<input type="text" inputmode="decimal" pattern="[0-9]*[.]?[0-9]*" autocomplete="off" data-view-room-id="${room.id}" value="${value===undefined||value===null?'':value}" placeholder="Not counted">`:`<output>${displayValue}</output>`}</div>`;
  }).join('');
  return`<div class="view-inv-item-detail ${editing?'is-editing':''}" data-view-product-id="${product.id}" onclick="event.stopPropagation()"><div class="view-inv-item-detail-head"><strong>Room breakdown</strong><div class="view-inv-item-edit-control">${editing?'<span>Editing</span>':''}<button class="icon-btn view-inv-item-edit" type="button" aria-label="${editing?'Cancel room count editing':'Edit room counts'}" title="${editing?'Cancel room count editing':'Edit room counts'}" onclick="setViewInvItemEditMode('${product.id}',${editing?'false':'true'})"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l11-11-4-4L4 16v4Z"></path><path d="m13.5 6.5 4 4"></path></svg></button></div></div><div class="view-inv-room-grid">${roomFields}</div>${editing?`<div class="view-inv-item-actions"><button class="btn btn-secondary" type="button" onclick="setViewInvItemEditMode('${product.id}',false)">Cancel</button><button class="btn btn-primary" type="button" onclick="saveViewedInventoryItem('${product.id}',this)">Save Item</button></div>`:''}</div>`;
}
function saveViewedInventoryItem(productId,button){
  const inv=state.inventories.find(item=>item.id===viewInvId);if(!inv)return;
  const detail=button?.closest('.view-inv-item-detail');if(!detail)return;
  detail.querySelectorAll('[data-view-room-id]').forEach(input=>{
    const room=inv.rooms.find(item=>item.id===input.dataset.viewRoomId);if(!room)return;
    const value=input.value.trim();
    if(value==='')delete room.items[productId];
    else{const quantity=parseFloat(value);if(!isNaN(quantity)&&quantity>=0)room.items[productId]=quantity;}
  });
  inv.items=mergeInventoryRoomItems(inv.rooms);
  inv.draft=!Object.keys(inv.items).length;
  viewInvExpandedProductId=null;viewInvEditingProductId=null;
  save();renderInventoryTable();refreshLiveInventoryIfVisible();renderViewInvTable();toast('Item count updated.');
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
function deleteInventory(id){closeAllMenus();if(!confirm('Delete?'))return;const inv=state.inventories.find(i=>i.id===id);state.inventories=state.inventories.filter(i=>i.id!==id);save();window.recordServerEvent?.({action:'count.deleted',entityType:'count',entityId:id,details:{label:inv?.label||'',date:inv?.date||''}});closeModal('modal-view-inv');renderInventoryTable();refreshLiveInventoryIfVisible();toast('Deleted.');}
function openSingleInvExport(){closeAllMenus();const sel=document.getElementById('single-inv-sel');sel.innerHTML=state.inventories.map(inv=>`<option value="${inv.id}">${fmtDate(inv.date)}${inv.label?' — '+inv.label:''}</option>`).join('');openModal('modal-single-inv');}
function exportInventoryExcel(id){
  const inv=state.inventories.find(i=>i.id===id);if(!inv){toast('Count not found.',true);return;}
  normalizeInventoryRooms(inv);
  closeAllMenus();
  const rows=[['Product','Category','Sub','Qty','Unit','Par','Unit Cost','Value']];let tot=0;
  Object.entries(inv.items).forEach(([pid,qty])=>{const p=getProduct(pid);if(!p)return;const val=+(p.cost*qty).toFixed(2);tot+=val;rows.push([p.name,p.category,p.subcategory||'',qty,p.unit,p.par||0,p.cost||0,val]);});
  rows.push(['','','','','','','TOTAL',+tot.toFixed(2)]);
  const sheets=[{name:(`Merged ${inv.date}`).slice(0,31),rows}];
  inv.rooms.forEach(room=>{
    const roomRows=[['Product','Category','Sub','Qty','Unit','Par','Unit Cost','Value']];let roomTotal=0;
    Object.entries(room.items||{}).forEach(([pid,qty])=>{const p=getProduct(pid);if(!p)return;const val=+(p.cost*qty).toFixed(2);roomTotal+=val;roomRows.push([p.name,p.category,p.subcategory||'',qty,p.unit,p.par||0,p.cost||0,val]);});
    roomRows.push(['','','','','','','TOTAL',+roomTotal.toFixed(2)]);
    sheets.push({name:room.name.slice(0,31)||'Room',rows:roomRows});
  });
  xlDown(sheets,`inventory_count_${inv.date}.xlsx`);
}
function printInventoryCount(id){const inv=state.inventories.find(i=>i.id===id);if(!inv){toast('Count not found.',true);return;}normalizeInventoryRooms(inv);closeAllMenus();let tot=0;const bodyRows=Object.entries(inv.items).map(([pid,qty])=>{const p=getProduct(pid);if(!p)return null;const val=p.cost*qty;tot+=val;return[p.name,p.category,p.subcategory||'',qty,p.unit,p.par||'—',p.cost>0?fmt(p.cost):'—',fmt(val)];}).filter(Boolean);printTable(`Count — ${inv.label||fmtDate(inv.date)}`,`Date: ${fmtDate(inv.date)} · Rooms: ${inv.rooms.map(room=>room.name).join(', ')} · Merged Total: ${fmt(tot)}`,['Product','Category','Sub','Qty','Unit','Par','Unit Cost','Value'],bodyRows);}
function exportViewedInventoryExcel(){if(viewInvId)exportInventoryExcel(viewInvId);}
function printViewedInventory(){if(viewInvId)printInventoryCount(viewInvId);}
function singleInvExcel(){const id=document.getElementById('single-inv-sel').value;closeModal('modal-single-inv');exportInventoryExcel(id);}
function singleInvPrint(){const id=document.getElementById('single-inv-sel').value;closeModal('modal-single-inv');printInventoryCount(id);}

document.getElementById('mobile-count-continue')?.addEventListener('click',continueMobileCountSetup);
document.addEventListener('click',event=>{
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
  const sheet=document.getElementById('inv-filter-sheet');
  const button=document.getElementById('inv-filter-done');
  if(!sheet?.classList.contains('open')||!button)return;
  const bounds=button.getBoundingClientRect();
  if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  closeInventoryFilterSheet();
},true);
document.getElementById('inventory-count-cancel')?.addEventListener('click',()=>closeModal('modal-inventory'));
document.getElementById('inventory-count-finish')?.addEventListener('click',saveInventory);
document.addEventListener('click',event=>{
  if(!document.getElementById('modal-inventory')?.classList.contains('open'))return;
  const actions=[
    {button:document.getElementById('inventory-count-cancel'),run:()=>closeModal('modal-inventory')},
    {button:document.getElementById('inventory-count-finish'),run:saveInventory}
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
