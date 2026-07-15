// inventory.js — counting sessions, progress, saved counts, single-count export.

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
  room={id:id||uid(),name:clean,archived:false,productIds:null};
  state.rooms.push(room);
  return room;
}
function normalizeRoomProductIds(room){
  if(!Array.isArray(room.productIds))return null;
  const activeIds=new Set(state.products.filter(product=>!product.archived).map(product=>product.id));
  return [...new Set(room.productIds)].filter(id=>activeIds.has(id));
}
function normalizeFloorPlanRooms(){
  if(!Array.isArray(state.rooms))state.rooms=[];
  const seen=new Set();
  let changed=false;
  state.rooms=state.rooms.map((room,index)=>{
    let clean=String(room.name||`Room ${index+1}`).trim()||`Room ${index+1}`;
    if(clean==='Unassigned')clean=defaultFloorPlanRoomName();
    const productIds=normalizeRoomProductIds(room);
    const normalized={id:room.id||uid(),name:clean,archived:!!room.archived,productIds};
    if(normalized.id!==room.id||normalized.name!==room.name||normalized.archived!==room.archived||JSON.stringify(productIds)!==JSON.stringify(room.productIds??null))changed=true;
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
    state.rooms=[{id:uid(),name:defaultFloorPlanRoomName(),archived:false,productIds:null}];
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
  const products=state.products.filter(product=>!product.archived);
  if(!room||!Array.isArray(room.productIds))return products.map(product=>product.id);
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
function roomProductSummary(room){
  const activeCount=state.products.filter(product=>!product.archived).length;
  if(!Array.isArray(room.productIds))return`All ${activeCount} active items`;
  const count=roomProductIds(room).length;
  return`${count} selected item${count===1?'':'s'}`;
}
function renderRoomProductPicker(room){
  const cats=[...new Set(state.products.filter(product=>!product.archived).map(product=>product.category||'Other'))].sort();
  const allowed=new Set(roomProductIds(room));
  const products=state.products.filter(product=>!product.archived).sort((a,b)=>
    (a.category||'').localeCompare(b.category||'')||
    (a.subcategory||'').localeCompare(b.subcategory||'')||
    a.name.localeCompare(b.name)
  );
  const allSelected=products.length>0&&products.every(product=>allowed.has(product.id));
  const noneSelected=!products.some(product=>allowed.has(product.id));
  return`
    <div class="room-product-editor floor-plan-edit-only">
      <div class="room-product-toolbar">
        <span>${roomProductSummary(room)}</span>
        <div>
          <button class="btn btn-secondary btn-sm room-filter-chip ${allSelected?'active':''}" type="button" aria-pressed="${allSelected}" onclick="setRoomProducts('${room.id}','all')">All</button>
          <button class="btn btn-secondary btn-sm room-filter-chip ${noneSelected?'active':''}" type="button" aria-pressed="${noneSelected}" onclick="setRoomProducts('${room.id}','none')">None</button>
          ${cats.map(cat=>{
            const categoryProducts=products.filter(product=>(product.category||'Other')===cat);
            const selected=categoryProducts.length>0&&categoryProducts.every(product=>allowed.has(product.id));
            return`<button class="btn btn-secondary btn-sm room-filter-chip ${selected?'active':''}" type="button" aria-pressed="${selected}" onclick="setRoomProducts('${room.id}','cat:${escapeHtml(cat)}')">${escapeHtml(cat)}</button>`;
          }).join('')}
        </div>
      </div>
      <div class="room-product-list">
        ${products.map(product=>`
          <label class="room-product-option">
            <input type="checkbox" ${allowed.has(product.id)?'checked':''} onchange="toggleRoomProduct('${room.id}','${product.id}',this.checked)">
            <span><strong>${escapeHtml(product.name)}</strong><em>${escapeHtml(product.category||'Other')}${product.subcategory?` · ${escapeHtml(product.subcategory)}`:''}</em></span>
          </label>
        `).join('')||'<div class="empty-cell">No active products.</div>'}
      </div>
    </div>
  `;
}
function renderFloorPlanRooms(){
  const list=document.getElementById('settings-room-list');
  const rooms=activeFloorPlanRooms();
  if(list)list.innerHTML=rooms.map(room=>`
    <div class="settings-list-row">
      <div class="settings-room-main">
        <div>
          <span class="room-chip">${escapeHtml(room.name)}</span>
          <span class="room-product-count">${roomProductSummary(room)}</span>
        </div>
        <div class="settings-row-actions floor-plan-edit-only">
          <button class="btn btn-secondary btn-sm" type="button" onclick="startRenameRoom('${room.id}')">Rename</button>
          <button class="btn btn-ghost-danger btn-sm" type="button" onclick="archiveRoom('${room.id}')">Remove</button>
        </div>
      </div>
      ${renderRoomProductPicker(room)}
    </div>
  `).join('')||`<div class="empty-cell">No rooms defined.</div>`;
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
  const editBtn=document.getElementById('floor-plan-edit-btn');
  if(editBtn)editBtn.textContent=floorPlanEditMode?'Done':'Edit';
  document.getElementById('settings-room-group')?.classList.toggle('editing',floorPlanEditMode);
}
function setRoomProducts(roomId,scope){
  if(!floorPlanEditMode)return;
  const room=floorPlanRoomById(roomId);
  if(!room)return;
  const activeProducts=state.products.filter(product=>!product.archived);
  if(scope==='all')room.productIds=null;
  else if(scope==='none')room.productIds=[];
  else if(String(scope).startsWith('cat:')){
    const cat=String(scope).slice(4);
    const categoryIds=activeProducts.filter(product=>(product.category||'Other')===cat).map(product=>product.id);
    const selected=new Set(roomProductIds(room));
    const categorySelected=categoryIds.length>0&&categoryIds.every(id=>selected.has(id));
    categoryIds.forEach(id=>categorySelected?selected.delete(id):selected.add(id));
    room.productIds=[...selected];
  }
  save();
  renderFloorPlanRooms();
  refreshLiveInventoryIfVisible();
  toast('Room items updated.');
}
function toggleRoomProduct(roomId,productId,checked){
  if(!floorPlanEditMode)return;
  const room=floorPlanRoomById(roomId);
  if(!room)return;
  if(!Array.isArray(room.productIds))room.productIds=state.products.filter(product=>!product.archived).map(product=>product.id);
  const ids=new Set(room.productIds);
  if(checked)ids.add(productId);
  else ids.delete(productId);
  room.productIds=[...ids];
  save();
  renderFloorPlanRooms();
  refreshLiveInventoryIfVisible();
}
function toggleFloorPlanEdit(){
  floorPlanEditMode=!floorPlanEditMode;
  if(!floorPlanEditMode){
    editingSettingsRoomId=null;
    addingSettingsRoom=false;
    const input=document.getElementById('settings-room-name');
    if(input)input.value='';
  }
  renderFloorPlanRooms();
}
function startAddSettingsRoom(){
  if(!floorPlanEditMode)return;
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
  if(!floorPlanEditMode)return;
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
  }else ensureFloorPlanRoom(name);
  addingSettingsRoom=false;
  if(input)input.value='';
  save();
  renderFloorPlanRooms();
  renderInventoryTable();
  renderLiveInventoryRoomTabs();
  toast(editingSettingsRoomId?'Room saved.':'Room saved.');
}
function startRenameRoom(roomId){
  if(!floorPlanEditMode)return;
  const room=floorPlanRoomById(roomId);
  if(!room)return;
  editingSettingsRoomId=roomId;
  addingSettingsRoom=false;
  const input=document.getElementById('settings-room-name');
  if(input)input.value=room.name;
  renderFloorPlanRooms();
  requestAnimationFrame(()=>document.getElementById('settings-room-name')?.focus());
}
function archiveRoom(roomId){
  if(!floorPlanEditMode)return;
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
}
function switchInventoryRoom(roomId){
  captureCurrentRoomCounts();
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
        <h3>${escapeHtml(row.name)}</h3>
        <div class="product-view-meta">${liveStatusBadge(row)} ${catBadge(row.category)} ${subBadge(row.subcategory)} <span class="sub-badge">${escapeHtml(row.roomName)}</span></div>
      </div>
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
function onInvInput(pid,el){liveInvCounts[pid]=el.value===''?'':parseFloat(el.value);const row=document.getElementById('row-'+pid);if(!row)return;const dot=row.querySelector('.missing-dot,.filled-dot');const f=el.value!=='';if(dot)dot.className=f?'filled-dot':'missing-dot';row.className='inv-count-row '+(f?'filled-row':'missing-row');const section=row.closest('.inv-count-section');if(section){const inputs=[...section.querySelectorAll('input[data-count-input="true"]')];const filled=inputs.filter(input=>input.value!=='').length;const count=section.querySelector('.inv-section-summary-count');if(count)count.textContent=`${filled}/${inputs.length}`;}updateInvProgress();}
function invQtyInputs(){return[...document.querySelectorAll('#inv-rows input[data-count-input="true"]')].filter(input=>!input.closest('[hidden]'));}
function focusInvQtyInput(current,step=1){
  const inputs=invQtyInputs();
  const index=inputs.indexOf(current);
  const next=inputs[index+step];
  if(next){
    next.focus();
    next.select();
  }
}
function onInvQtyFocus(input){setTimeout(()=>input.select(),0);}
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
  const rooms=typeof accessibleFloorPlanRooms==='function'?accessibleFloorPlanRooms():activeFloorPlanRooms();
  document.getElementById('room-count-date').value=today();
  document.getElementById('room-count-label').value='';
  const list=document.getElementById('room-count-list');
  list.innerHTML=rooms.map(room=>`<button class="room-select-card" type="button" onclick="startRoomCount('${room.id}')"><strong>${escapeHtml(room.name)}</strong><span>Count this room</span></button>`).join('')||`<div class="empty-cell">No rooms assigned to your profile.</div>`;
  openModal('modal-inv-room-select');
}
function startRoomCount(roomId){
  if(typeof profileCanAccessRoom==='function'&&!profileCanAccessRoom(currentProfile(),roomId)){toast('You do not have access to that room.',true);return;}
  const date=document.getElementById('room-count-date').value||today();
  const label=document.getElementById('room-count-label').value.trim();
  closeModal('modal-inv-room-select');
  openInventoryModal(null,roomId,date,label);
}
function draftRoomsFromFloorPlan(){
  return activeFloorPlanRooms().map(room=>({id:uid(),roomId:room.id,name:room.name,items:{}}));
}
function createCountDraft(){
  const date=document.getElementById('room-count-date').value;
  if(!date){toast('Select a date.',true);return;}
  const label=document.getElementById('room-count-label').value.trim();
  const existing=findInventorySession(date,label);
  if(existing){
    ensureInventoryHasFloorPlanRooms(existing);
    existing.items=mergeInventoryRoomItems(existing.rooms);
    save();
    closeModal('modal-inv-room-select');
    renderInventoryTable();
    toast('Draft already exists.');
    return;
  }
  const rooms=draftRoomsFromFloorPlan();
  if(!rooms.length){toast('Add rooms in Settings first.',true);return;}
  const id=uid();
  state.inventories.push({id,date,label,items:{},rooms,draft:true});
  state.inventories.sort((a,b)=>a.date<b.date?1:-1);
  save();
  closeModal('modal-inv-room-select');
  renderInventoryTable();
  refreshLiveInventoryIfVisible();
  toast('Count draft created.');
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
  currentInvEdit=existingId;const ex=existingId?state.inventories.find(i=>i.id===existingId):null;
  if(ex)ensureInventoryHasFloorPlanRooms(ex);
  document.getElementById('inv-date').value=ex?ex.date:(presetDate||today());document.getElementById('inv-label').value=ex?ex.label||'':presetLabel;
  initLiveCounts(ex);document.getElementById('inv-search').value='';document.getElementById('inv-cat-f').value='';
  if(!ex&&selectedFloorRoomId){
    const selected=currentInvRooms.find(room=>room.roomId===selectedFloorRoomId);
    if(selected){
      currentInvRoomId=selected.id;
      liveInvCounts={};
      currentRoomProducts().forEach(p=>{liveInvCounts[p.id]=selected.items[p.id]!==undefined?selected.items[p.id]:'';});
    }
  }
  document.getElementById('inv-sub-f').innerHTML='<option value="">All</option>';document.getElementById('inv-show-f').value='all';document.getElementById('inv-sort-f').value='category';
  renderInventoryRooms();renderInvRows(true);openModal('modal-inventory');
}
function updateInvProgress(){
  const products=currentRoomProducts();
  const total=products.length;const filled=products.filter(product=>{const v=liveInvCounts[product.id];return v!==''&&v!==null&&v!==undefined;}).length;const pct=total>0?Math.round(filled/total*100):0;
  document.getElementById('inv-prog-bar').style.width=pct+'%';document.getElementById('inv-prog-label').textContent=`${filled} of ${total} (${pct}%)`;
  document.getElementById('inv-prog-pills').innerHTML=`<span class="filled-pill"><span class="filled-dot"></span>${filled}</span><span class="missing-pill"><span class="missing-dot"></span>${total-filled} missing</span>`;
}
function renderInvRows(skipCapture=false){
  const roomScopedProducts=currentRoomProducts();
  if(!skipCapture)roomScopedProducts.forEach(p=>{const el=document.getElementById('invq-'+p.id);if(el)liveInvCounts[p.id]=el.value===''?'':parseFloat(el.value);});
  const search=document.getElementById('inv-search').value.toLowerCase();const cat=document.getElementById('inv-cat-f').value;const sub=document.getElementById('inv-sub-f').value;const show=document.getElementById('inv-show-f').value;const sortMode=document.getElementById('inv-sort-f')?.value||'category';
  let prods=roomScopedProducts.filter(p=>(!cat||p.category===cat)&&(!sub||p.subcategory===sub)&&(!search||p.name.toLowerCase().includes(search)||(p.aliases||'').toLowerCase().includes(search)||(p.subcategory||'').toLowerCase().includes(search)));
  if(show==='missing')prods=prods.filter(p=>{const v=liveInvCounts[p.id];return v===''||v===null||v===undefined;});
  if(show==='filled')prods=prods.filter(p=>{const v=liveInvCounts[p.id];return v!==''&&v!==null&&v!==undefined;});
  prods=sortedInventoryProducts(prods,sortMode);
  const groups={};prods.forEach(p=>{const k=p.category+'|||'+(p.subcategory||'Other');if(!groups[k])groups[k]={cat:p.category,sub:p.subcategory||'Other',items:[]};groups[k].items.push(p);});
  if(!prods.length){document.getElementById('inv-rows').innerHTML=`<p style="color:var(--text-muted);text-align:center;padding:24px;">No products assigned to this room match.</p>`;updateInvProgress();return;}
  let html='';
  const renderProduct=p=>{const val=liveInvCounts[p.id];const isFilled=val!==''&&val!==null&&val!==undefined;return`<div class="inv-count-row ${isFilled?'filled-row':'missing-row'}" id="row-${p.id}"><div><span class="${isFilled?'filled-dot':'missing-dot'}"></span><span class="inv-prod-name">${productNameLink(p)}</span><div class="inv-prod-meta">${p.category}${p.subcategory?` · ${p.subcategory}`:''} · ${p.unit}${p.par?` · Par: ${p.par}`:''}</div></div><input type="number" min="0" step="0.01" id="invq-${p.id}" data-count-input="true" value="${isFilled?val:''}" placeholder="qty" oninput="onInvInput('${p.id}',this)" onfocus="onInvQtyFocus(this)" onkeydown="onInvQtyKey(event,this)"><span style="font-size:0.74rem;color:var(--text-muted);">${p.unit}</span></div>`;};
  if(sortMode==='category')Object.values(groups).forEach(g=>{
    const sectionToken=encodeURIComponent(`${currentInvRoomId||''}|||${g.cat}|||${g.sub}`);
    const collapsed=!expandedInventorySections.has(sectionToken);
    const filledCount=g.items.filter(product=>{const value=liveInvCounts[product.id];return value!==''&&value!==null&&value!==undefined;}).length;
    html+=`<section class="inv-count-section ${collapsed?'collapsed':''}">
      <button class="inv-section-header" type="button" aria-expanded="${!collapsed}" onclick="toggleInventorySection('${sectionToken}')">
        <span class="inv-section-title">${catBadge(g.cat)} <span>${escapeHtml(g.sub)}</span></span>
        <span class="inv-section-summary"><span class="inv-section-summary-count">${filledCount}/${g.items.length}</span><span class="inv-section-chevron" aria-hidden="true">⌄</span></span>
      </button>
      <div class="inv-section-items" ${collapsed?'hidden':''}>${g.items.map(renderProduct).join('')}</div>
    </section>`;
  });
  else html=prods.map(renderProduct).join('');
  document.getElementById('inv-rows').innerHTML=html;updateInvProgress();
}
function toggleInventorySection(sectionToken){
  if(expandedInventorySections.has(sectionToken))expandedInventorySections.delete(sectionToken);
  else expandedInventorySections.add(sectionToken);
  renderInvRows();
}
async function saveInventory(){
  const date=document.getElementById('inv-date').value;if(!date){toast('Select a date.',true);return;}
  const label=document.getElementById('inv-label').value.trim();
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
  if(currentInvEdit){const i=state.inventories.findIndex(x=>x.id===currentInvEdit);state.inventories[i]={...state.inventories[i],date,label,items,rooms,draft:false};savedId=state.inventories[i].id;}
  else if(!savedId){savedId=uid();state.inventories.push({id:savedId,date,label,items,rooms});}
  else{const i=state.inventories.findIndex(x=>x.id===savedId);if(i>=0)state.inventories[i]={...state.inventories[i],date,label,items,rooms,draft:false};}
  state.inventories.sort((a,b)=>a.date<b.date?1:-1);
  save();
  const pushed=typeof cloudPushNow==='function'?await cloudPushNow():true;
  const confirmed=pushed&&await inventorySavedInCloud(savedId,date,label,rooms);
  if(!confirmed){
    toast('Saved on this device, but cloud saving failed. Keep this window open and try again.',true);
    return;
  }
  closeModal('modal-inventory');renderInventoryTable();refreshLiveInventoryIfVisible();toast(`Saved — ${Object.keys(items).length} items.`);
  dirtyInventoryRoomIds=new Set();
  deletedInventoryRoomIds=new Set();
  viewInventory(savedId);
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
  document.getElementById('inv-thead').innerHTML='<tr>'+visCols.map(c=>{if(!c.sort||c.key==='actions')return`<th>${c.label}</th>`;const s=sortState.inventories;const cls=s.col===c.sort?(s.dir==='asc'?'sort-asc':'sort-desc'):'';return`<th class="sortable ${cls}" onclick="sortTable('inventories','${c.sort}')">${c.label}</th>`;}).join('')+'</tr>';
  let rows=state.inventories.filter(inv=>showArchivedInventories?!!inv.archived:!inv.archived).map(inv=>{normalizeInventoryRooms(inv);const total=Object.entries(inv.items).reduce((s,[id,q])=>{const p=getProduct(id);return s+(p?p.cost*q:0);},0);const expected=expectedInventoryProductIds(inv);const counted=Object.keys(inv.items).filter(id=>expected.has(id)).length,missing=Math.max(expected.size-counted,0);const roomsCount=inv.rooms.filter(room=>Object.keys(room.items||{}).length>0).length;return{...inv,counted,missing,roomsCount,value:total};});
  rows=sortArr(rows,sortState.inventories.col,sortState.inventories.dir);
  const tbody=document.getElementById('inv-tbody');
  if(!rows.length){
    const emptyState=showArchivedInventories
      ?`<div class="table-empty-state"><span class="table-empty-icon" aria-hidden="true">🗄️</span><strong>No archived counts</strong><p>Counts you archive will stay available here.</p></div>`
      :`<div class="table-empty-state"><span class="table-empty-icon" aria-hidden="true">📋</span><strong>File your first inventory count</strong><p>Choose a room, enter what is on hand, and save a baseline for live inventory.</p><button class="btn btn-primary" type="button" onclick="openInventoryRoomSelect()">＋ Start first count</button></div>`;
    tbody.innerHTML=`<tr><td colspan="${visCols.length}">${emptyState}</td></tr>`;
    return;
  }
  tbody.innerHTML=rows.map((inv,index)=>`<tr class="inventory-row ${inv.archived?'archived-row':''}" onclick="viewInventory('${inv.id}')">${visCols.map(c=>{switch(c.key){case 'date':return`<td>${fmtDate(inv.date)}</td>`;case 'label':return`<td>${inv.label||'—'}${inv.draft?'<div style="margin-top:4px;"><span class="missing-pill">Draft</span></div>':''}${inv.archived?'<div style="margin-top:4px;"><span class="sub-badge">Archived</span></div>':''}</td>`;case 'rooms':return`<td><span class="filled-pill">${inv.roomsCount} room${inv.roomsCount===1?'':'s'} counted</span></td>`;case 'counted':return`<td>${inv.counted}</td>`;case 'missing':return`<td>${inv.missing>0?`<span class="missing-pill"><span class="missing-dot"></span>${inv.missing}</span>`:'<span style="color:var(--success)">✓</span>'}</td>`;case 'value':return`<td>${fmt(inv.value)}</td>`;case 'actions':return`<td onclick="event.stopPropagation()"><div class="inventory-row-actions"><button class="btn btn-secondary btn-sm" type="button" onclick="viewInventory('${inv.id}')">View</button>${inventoryMenuHtml(inv,`inventory-menu-${index}`)}</div></td>`;default:return`<td>—</td>`;}}).join('')}</tr>`).join('');
}
function inventoryMenuHtml(inv,menuId){
  return`<div class="drop-wrap inventory-actions">
    <button class="btn btn-secondary btn-sm icon-btn" onclick="event.stopPropagation();toggleMenu('${menuId}')" title="Count actions">...</button>
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
  inv.archived=archived;save();renderInventoryTable();refreshLiveInventoryIfVisible();toast(archived?'Count archived.':'Count restored.');
}
function viewInventory(id){
  viewInvId=id;viewInvTab='all';const inv=state.inventories.find(i=>i.id===id);normalizeInventoryRooms(inv);
  document.getElementById('view-inv-title').textContent=`${inv.label||'Inventory'} — ${fmtDate(inv.date)}${inv.archived?' · Archived':''}`;
  renderViewInvTabs(inv);renderViewInvTable();openModal('modal-view-inv');
}
function editViewedInventory(){const id=viewInvId;if(!id)return;closeModal('modal-view-inv');openInventoryModal(id);}
function renderViewInvTabs(inv){
  const tabs=document.getElementById('view-inv-tabs');
  tabs.innerHTML=`<div class="tab ${viewInvTab==='all'?'active':''}" onclick="switchViewInvTab('all')" id="vitab-all">Merged Total</div><div class="tab ${viewInvTab==='missing'?'active':''}" onclick="switchViewInvTab('missing')" id="vitab-missing">Not Counted</div>`+
    inv.rooms.map(room=>`<div class="tab ${viewInvTab===room.id?'active':''}" onclick="switchViewInvTab('${room.id}')">${escapeHtml(room.name)}</div>`).join('');
}
function switchViewInvTab(tab){viewInvTab=tab;const inv=state.inventories.find(i=>i.id===viewInvId);if(inv)renderViewInvTabs(inv);renderViewInvTable();}
function roomQtyBreakdown(inv,productId){
  return inv.rooms.map(room=>({name:room.name,qty:room.items?.[productId]}))
    .filter(item=>item.qty!==undefined&&item.qty!==null&&item.qty!=='')
    .map(item=>`${escapeHtml(item.name)} ${liveQty(item.qty)}`)
    .join(' · ');
}
function renderViewInvTable(){
  const inv=state.inventories.find(i=>i.id===viewInvId);if(!inv)return;normalizeInventoryRooms(inv);
  const selectedRoom=inv.rooms.find(r=>r.id===viewInvTab)||null;
  const source=viewInvTab==='all'||viewInvTab==='missing'?inv.items:(selectedRoom?.items||{});
  let total=0,rows='';
  if(viewInvTab==='missing'){const expected=expectedInventoryProductIds(inv);const mp=state.products.filter(p=>expected.has(p.id)&&source[p.id]===undefined);rows=mp.map(p=>`<tr style="color:var(--danger)"><td>${productNameLink(p)}</td><td>${catBadge(p.category)}</td><td>${subBadge(p.subcategory)}</td><td>—</td><td>${p.unit}</td><td>${p.par||'—'}</td><td>—</td><td>—</td></tr>`).join('')||`<tr><td colspan="8" style="color:var(--text-muted);text-align:center">All counted!</td></tr>`;}
  else{rows=Object.entries(source).map(([pid,qty])=>{const p=getProduct(pid);if(!p)return'';const val=p.cost*qty;total+=val;const breakdown=viewInvTab==='all'?roomQtyBreakdown(inv,pid):'';return`<tr><td>${productNameLink(p)}</td><td>${catBadge(p.category)}</td><td>${subBadge(p.subcategory)}</td><td><strong>${liveQty(qty)}</strong>${breakdown?`<div style="color:var(--text-muted);font-size:0.7rem;margin-top:3px;">${breakdown}</div>`:''}</td><td>${p.unit}</td><td>${p.par||'—'}</td><td>${p.cost>0?fmt(p.cost):'—'}</td><td><strong>${fmt(val)}</strong></td></tr>`;}).join('');}
  document.getElementById('view-inv-tbody').innerHTML=rows||`<tr><td colspan="8" style="color:var(--text-muted)">No items.</td></tr>`;
  document.getElementById('view-inv-total').textContent=viewInvTab!=='missing'?`Total: ${fmt(total)}`:'';
}
function deleteInventory(id){closeAllMenus();if(!confirm('Delete?'))return;state.inventories=state.inventories.filter(i=>i.id!==id);save();closeModal('modal-view-inv');renderInventoryTable();refreshLiveInventoryIfVisible();toast('Deleted.');}
function openSingleInvExport(){closeAllMenus();const sel=document.getElementById('single-inv-sel');sel.innerHTML=state.inventories.map(inv=>`<option value="${inv.id}">${fmtDate(inv.date)}${inv.label?' — '+inv.label:''}</option>`).join('');openModal('modal-single-inv');}
function singleInvExcel(){
  const id=document.getElementById('single-inv-sel').value;const inv=state.inventories.find(i=>i.id===id);if(!inv){toast('No count selected.',true);return;}
  normalizeInventoryRooms(inv);
  closeModal('modal-single-inv');
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
function singleInvPrint(){const id=document.getElementById('single-inv-sel').value;const inv=state.inventories.find(i=>i.id===id);if(!inv){toast('No count selected.',true);return;}normalizeInventoryRooms(inv);closeModal('modal-single-inv');let tot=0;const bodyRows=Object.entries(inv.items).map(([pid,qty])=>{const p=getProduct(pid);if(!p)return null;const val=p.cost*qty;tot+=val;return[p.name,p.category,p.subcategory||'',qty,p.unit,p.par||'—',p.cost>0?fmt(p.cost):'—',fmt(val)];}).filter(Boolean);printTable(`Count — ${inv.label||fmtDate(inv.date)}`,`Date: ${fmtDate(inv.date)} · Rooms: ${inv.rooms.map(room=>room.name).join(', ')} · Merged Total: ${fmt(tot)}`,['Product','Category','Sub','Qty','Unit','Par','Unit Cost','Value'],bodyRows);}
