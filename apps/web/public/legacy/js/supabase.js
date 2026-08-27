// supabase.js — authenticated compatibility bridge.
// The legacy interface remains unchanged while persistence is handled by the
// new organization-scoped Next.js + Supabase foundation.

const CLOUD_PENDING_KEY='keg_bar_v5_cloud_pending';
let cloudReady=false, localOnlyMode=false, cloudUpdatedAt='', _pushTimer=null, _pushPromise=Promise.resolve(true), _pendingCloudPayload='', _cloudRefreshTimer=null, _cloudRefreshRunning=false, _cloudRefreshLastChecked=0;
function enableLocalOnlyMode(){
  localOnlyMode=true;
  _pendingCloudPayload='';
  try{localStorage.removeItem(CLOUD_PENDING_KEY);}catch(error){}
}
function isLocalDevelopmentHost(){
  return location.protocol==='file:'||location.hostname==='localhost'||location.hostname==='127.0.0.1'||location.hostname==='::1';
}
function persistLocalOnlyState(){
  try{
    const snapshot=typeof compactStateForStorage==='function'?compactStateForStorage():state;
    localStorage.setItem('keg_bar_v5',JSON.stringify(snapshot));
    return true;
  }catch(error){
    console.error('Local count save failed:',error);
    return false;
  }
}
function queueCloudStatePayload(payload){
  if(localOnlyMode)return;
  _pendingCloudPayload=String(payload||'');
  try{localStorage.setItem(CLOUD_PENDING_KEY,'1');}catch(error){}
}
function pendingLocalWorkspaceState(){
  try{
    if(localStorage.getItem(CLOUD_PENDING_KEY)!=='1')return null;
    const cached=JSON.parse(localStorage.getItem('keg_bar_v5')||'null');
    return cached&&typeof cached==='object'&&!Array.isArray(cached)?cached:null;
  }catch(error){return null;}
}
// Pull the saved state from Supabase. Returns the data object, null if the
// row is empty, or undefined if the request failed (offline / error).
async function cloudLoad(){
  try{
    const r=await fetch(WORKSPACE_STATE_ENDPOINT,{credentials:'same-origin',cache:'no-store'});
    if(!r.ok)throw new Error('HTTP '+r.status);
    const payload=await r.json();
    cloudUpdatedAt=payload.updatedAt||cloudUpdatedAt;
    return payload.data||null;
  }catch(e){console.error('Cloud load failed:',e);return undefined;}
}
// Upsert the full state to Supabase (keyed on the single 'main' row).
async function cloudPush(){
  const push=async()=>{
    if(localOnlyMode)return persistLocalOnlyState();
    const queuedPayload=_pendingCloudPayload;
    try{
      const body=queuedPayload||JSON.stringify(typeof compactStateForStorage==='function'?compactStateForStorage():state);
      const headers={'Content-Type':'application/json'};
      if(cloudUpdatedAt)headers['x-workspace-version']=cloudUpdatedAt;
      const r=await fetch(WORKSPACE_STATE_ENDPOINT,{
        method:'PUT',credentials:'same-origin',headers,body
      });
      const payload=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(payload.error||`HTTP ${r.status}`);
      cloudUpdatedAt=payload.updatedAt||cloudUpdatedAt;
      if((queuedPayload&&_pendingCloudPayload===queuedPayload)||(!queuedPayload&&!_pendingCloudPayload)){
        _pendingCloudPayload='';
        try{localStorage.removeItem(CLOUD_PENDING_KEY);}catch(error){}
      }
      return true;
    }catch(e){console.error('Cloud push failed:',e);toast(e.message||'Could not save the shared workspace.',true);return false;}
  };
  _pushPromise=_pushPromise.then(push,push);
  return _pushPromise;
}

async function cloudSaveProduct(product){
  try{
    if(localOnlyMode){
      const index=(state.products||[]).findIndex(candidate=>candidate.id===product.id);
      if(index>=0)state.products[index]=product;else state.products.push(product);
      if(!persistLocalOnlyState())return null;
      return state;
    }
    if(_pushTimer&&!await cloudPushNow())return null;
    if(!await _pushPromise)return null;
    const response=await fetch(WORKSPACE_STATE_ENDPOINT,{
      method:'PATCH',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({product,productCatalogVersion:state.productCatalogVersion||DEFAULT_PRODUCT_CATALOG_VERSION})
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(payload.error||`HTTP ${response.status}`);
    const savedProduct=Array.isArray(payload.data?.products)?payload.data.products.find(candidate=>candidate?.id===product.id):null;
    if(!savedProduct)throw new Error('The shared workspace did not return the saved product.');
    cloudUpdatedAt=payload.updatedAt||cloudUpdatedAt;
    return payload.data||null;
  }catch(error){
    console.error('Shared product save failed:',error);
    return null;
  }
}

async function cloudMergeProducts(keepId,removeId,mergedState){
  try{
    if(localOnlyMode){
      state=mergedState;
      if(!persistLocalOnlyState())return null;
      return state;
    }
    if(_pushTimer&&!await cloudPushNow())return null;
    if(!await _pushPromise)return null;
    const keepProduct=(mergedState.products||[]).find(product=>product.id===keepId);
    if(!keepProduct)return null;
    const response=await fetch(WORKSPACE_STATE_ENDPOINT,{method:'PATCH',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({productMerge:{keepId,removeId,keepProduct}})});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(payload.error||`HTTP ${response.status}`);
    if(!(payload.data?.products||[]).some(product=>product?.id===keepId)||(payload.data?.products||[]).some(product=>product?.id===removeId))throw new Error('The shared workspace did not return the merged product.');
    cloudUpdatedAt=payload.updatedAt||cloudUpdatedAt;
    return payload.data||null;
  }catch(error){console.error('Shared product merge failed:',error);return null;}
}

async function cloudSaveInventoryCategory(previousName,name,subcategories){
  try{
    if(_pushTimer&&!await cloudPushNow())return null;
    if(!await _pushPromise)return null;
    const response=await fetch(WORKSPACE_STATE_ENDPOINT,{
      method:'PATCH',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({categoryRename:{previousName,name,subcategories}})
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(payload.error||`HTTP ${response.status}`);
    const categories=payload.data?.inventoryCategories;
    if(!categories||!Object.prototype.hasOwnProperty.call(categories,name)||(previousName!==name&&Object.prototype.hasOwnProperty.call(categories,previousName)))throw new Error('The shared workspace did not return the renamed category.');
    cloudUpdatedAt=payload.updatedAt||cloudUpdatedAt;
    return payload.data||null;
  }catch(error){
    console.error('Shared category save failed:',error);
    return null;
  }
}

async function cloudCreateCountDraft(draft){
  try{
    if(localOnlyMode){
      const existing=(state.inventories||[]).find(item=>item.id===draft.id||(String(item.date||'')===String(draft.date||'')&&String(item.label||'').trim().toLowerCase()===String(draft.label||'').trim().toLowerCase()));
      if(!existing){
        state.inventories.push(draft);
        state.inventories.sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
      }
      if(!persistLocalOnlyState())return null;
      return{state,draft:existing||draft};
    }
    if(_pushTimer&&!await cloudPushNow())return null;
    if(!await _pushPromise)return null;
    const response=await fetch(WORKSPACE_STATE_ENDPOINT,{
      method:'PATCH',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({countDraft:draft})
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(payload.error||`HTTP ${response.status}`);
    const inventories=Array.isArray(payload.data?.inventories)?payload.data.inventories:[];
    const saved=inventories.find(item=>item?.id===draft.id)||inventories.find(item=>String(item?.date||'')===String(draft.date||'')&&String(item?.label||'').trim().toLowerCase()===String(draft.label||'').trim().toLowerCase());
    if(!saved)throw new Error('The shared workspace did not return the count draft.');
    cloudUpdatedAt=payload.updatedAt||cloudUpdatedAt;
    return{state:payload.data,draft:saved};
  }catch(error){
    console.error('Shared count draft save failed:',error);
    return null;
  }
}

async function cloudImportMonthEndCount(imported){
  try{
    if(localOnlyMode){
      if(!(state.inventories||[]).some(item=>item.id===imported.id))state.inventories.push(imported);
      state.inventories.sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
      if(!persistLocalOnlyState())return null;
      return state;
    }
    if(_pushTimer&&!await cloudPushNow())return null;
    if(!await _pushPromise)return null;
    const response=await fetch(WORKSPACE_STATE_ENDPOINT,{method:'PATCH',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({countImport:imported})});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(payload.error||`HTTP ${response.status}`);
    const saved=Array.isArray(payload.data?.inventories)?payload.data.inventories.find(item=>item?.id===imported.id):null;
    if(!saved||saved.recordType!=='imported')throw new Error('The shared workspace did not return the imported count.');
    cloudUpdatedAt=payload.updatedAt||cloudUpdatedAt;
    return payload.data||null;
  }catch(error){console.error('Month-end count import failed:',error);return null;}
}

async function cloudSaveCountRoom(countId,roomId,items,extraProductIds=[]){
  try{
    if(localOnlyMode){
      const inv=(state.inventories||[]).find(item=>item.id===countId);
      if(!inv||inventoryIsFinalised(inv))return null;
      const room=(inv.rooms||[]).find(item=>item.id===roomId);
      if(!room)return null;
      const previousItems={...(room.items||{})};
      room.items={...items};
      room.extraProductIds=[...extraProductIds];
      inv.items={};
      (inv.rooms||[]).forEach(candidate=>Object.entries(candidate.items||{}).forEach(([productId,quantity])=>{if(typeof quantity==='number'&&isFinite(quantity))inv.items[productId]=(inv.items[productId]||0)+quantity;}));
      inv.draft=!Object.keys(inv.items).length;
      inv.status='saved';
      inv.updatedAt=new Date().toISOString();
      const changes=[...new Set([...Object.keys(previousItems),...Object.keys(items)])].filter(productId=>previousItems[productId]!==items[productId]).map(productId=>({productId,before:previousItems[productId]??null,after:items[productId]??null}));
      if(typeof inventoryHistoryEvent==='function')inv.history=[...(Array.isArray(inv.history)?inv.history:[]),inventoryHistoryEvent('room_saved',{roomId,roomName:room.name,changes,changedItems:changes.length})];
      if(!persistLocalOnlyState())return null;
      return state;
    }
    if(_pushTimer&&!await cloudPushNow())return null;
    if(!await _pushPromise)return null;
    const response=await fetch(WORKSPACE_STATE_ENDPOINT,{
      method:'PATCH',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({countRoomSave:{countId,roomId,items,extraProductIds}})
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(payload.error||`HTTP ${response.status}`);
    const saved=Array.isArray(payload.data?.inventories)?payload.data.inventories.find(item=>item?.id===countId):null;
    if(!saved)throw new Error('The shared workspace did not return the saved count.');
    cloudUpdatedAt=payload.updatedAt||cloudUpdatedAt;
    return payload.data||null;
  }catch(error){
    console.error('Shared count room save failed:',error);
    return null;
  }
}

async function cloudFinaliseCount(countId,zeroItemsByRoom=[]){
  try{
    if(localOnlyMode){
      const inv=(state.inventories||[]).find(item=>item.id===countId);
      if(!inv||!Object.keys(inv.items||{}).length)return null;
      const zeroByRoom=new Map(zeroItemsByRoom.map(entry=>[entry.roomId,new Set(entry.productIds||[])]));
      (inv.rooms||[]).forEach(room=>{const productIds=zeroByRoom.get(room.id);if(!productIds)return;room.items={...(room.items||{})};productIds.forEach(productId=>{if(!Object.prototype.hasOwnProperty.call(room.items,productId))room.items[productId]=0;});});
      inv.items=typeof mergeInventoryRoomItems==='function'?mergeInventoryRoomItems(inv.rooms):inv.items;
      inv.draft=false;inv.status='finalised';inv.finalised=true;inv.finalisedAt=new Date().toISOString();inv.updatedAt=inv.finalisedAt;
      if(typeof inventoryHistoryEvent==='function')inv.history=[...(Array.isArray(inv.history)?inv.history:[]),inventoryHistoryEvent('finalised')];
      if(!persistLocalOnlyState())return null;
      return state;
    }
    if(_pushTimer&&!await cloudPushNow())return null;
    if(!await _pushPromise)return null;
    const response=await fetch(WORKSPACE_STATE_ENDPOINT,{
      method:'PATCH',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({countFinalise:{countId,zeroItemsByRoom}})
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(payload.error||`HTTP ${response.status}`);
    const saved=Array.isArray(payload.data?.inventories)?payload.data.inventories.find(item=>item?.id===countId):null;
    if(!saved||saved.status!=='finalised')throw new Error('The shared workspace did not return the finalised count.');
    cloudUpdatedAt=payload.updatedAt||cloudUpdatedAt;
    return payload.data||null;
  }catch(error){
    console.error('Shared count finalise failed:',error);
    return null;
  }
}

async function cloudArchiveCount(countId,archived){
  try{
    if(localOnlyMode){
      const inv=(state.inventories||[]).find(item=>item.id===countId);if(!inv)return null;
      inv.archived=!!archived;inv.updatedAt=new Date().toISOString();
      if(typeof inventoryHistoryEvent==='function')inv.history=[...(Array.isArray(inv.history)?inv.history:[]),inventoryHistoryEvent(archived?'archived':'restored')];
      if(!persistLocalOnlyState())return null;
      return state;
    }
    if(_pushTimer&&!await cloudPushNow())return null;
    if(!await _pushPromise)return null;
    const response=await fetch(WORKSPACE_STATE_ENDPOINT,{
      method:'PATCH',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({countArchive:{countId,archived:!!archived}})
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(payload.error||`HTTP ${response.status}`);
    cloudUpdatedAt=payload.updatedAt||cloudUpdatedAt;
    return payload.data||null;
  }catch(error){
    console.error('Shared count archive update failed:',error);
    toast(error.message||'The count could not be updated.',true);
    return null;
  }
}

async function cloudDeleteCount(countId){
  try{
    if(localOnlyMode){
      const target=(state.inventories||[]).find(item=>item.id===countId);if(!target)return null;
      const deletingRoot=target.recordType!=='recount';
      state.inventories=(state.inventories||[]).filter(item=>item.id!==countId&&!(deletingRoot&&item.recordType==='recount'&&item.parentCountId===countId));
      if(!persistLocalOnlyState())return null;
      return state;
    }
    if(_pushTimer&&!await cloudPushNow())return null;
    if(!await _pushPromise)return null;
    const response=await fetch(WORKSPACE_STATE_ENDPOINT,{
      method:'PATCH',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({countDelete:{countId}})
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(payload.error||`HTTP ${response.status}`);
    cloudUpdatedAt=payload.updatedAt||cloudUpdatedAt;
    return payload.data||null;
  }catch(error){
    console.error('Shared count deletion failed:',error);
    toast(error.message||'The count could not be deleted.',true);
    return null;
  }
}

async function cloudLoadCountRoomLocks(countId){
  try{
    if(localOnlyMode)return[];
    const response=await fetch(`/api/count-room-locks?countId=${encodeURIComponent(countId)}`,{credentials:'same-origin',cache:'no-store'});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(payload.error||`HTTP ${response.status}`);
    return Array.isArray(payload.locks)?payload.locks:[];
  }catch(error){
    console.error('Count room availability load failed:',error);
    return null;
  }
}

async function cloudAcquireCountRoom(countId,roomId){
  try{
    if(localOnlyMode)return{acquired:true,lock:{countId,roomId,mine:true,holderName:'Local session'}};
    const response=await fetch('/api/count-room-locks',{
      method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({countId,roomId})
    });
    const payload=await response.json().catch(()=>({}));
    if(response.status===409)return{acquired:false,lock:payload.lock||null};
    if(!response.ok)throw new Error(payload.error||`HTTP ${response.status}`);
    return{acquired:!!payload.acquired,lock:payload.lock||null};
  }catch(error){
    console.error('Count room reservation failed:',error);
    return null;
  }
}

async function cloudReleaseCountRoom(countId,roomId,keepalive=false){
  try{
    if(localOnlyMode)return true;
    const response=await fetch('/api/count-room-locks',{
      method:'DELETE',credentials:'same-origin',keepalive,headers:{'Content-Type':'application/json'},body:JSON.stringify({countId,roomId})
    });
    return response.ok;
  }catch(error){
    console.error('Count room release failed:',error);
    return false;
  }
}

function cloudCanApplyRefresh(){
  const modalOpen=document.querySelector('.modal-overlay.open');
  const inlineEdits=typeof pendingEdits==='object'&&Object.keys(pendingEdits).length>0;
  return !document.hidden&&!modalOpen&&!inlineEdits&&!_pushTimer&&!_pendingCloudPayload;
}

async function cloudRefreshLatest(){
  if(localOnlyMode||!cloudReady||_cloudRefreshRunning||!cloudCanApplyRefresh())return false;
  const now=Date.now();
  if(now-_cloudRefreshLastChecked<5000)return false;
  _cloudRefreshLastChecked=now;
  _cloudRefreshRunning=true;
  try{
    const headers={};
    if(cloudUpdatedAt)headers['x-workspace-version']=cloudUpdatedAt;
    const response=await fetch(WORKSPACE_STATE_ENDPOINT,{credentials:'same-origin',cache:'no-store',headers});
    if(response.status===304)return false;
    if(!response.ok)return false;
    const payload=await response.json();
    if(!payload.data||!payload.updatedAt||!cloudUpdatedAt||Date.parse(payload.updatedAt)<=Date.parse(cloudUpdatedAt))return false;
    state=payload.data;
    if(typeof normalizeLoadedState==='function')normalizeLoadedState();
    try{localStorage.setItem('keg_bar_v5',JSON.stringify(state));}catch(error){}
    cloudUpdatedAt=payload.updatedAt;
    const activePage=document.querySelector('.page.active')?.id?.replace('page-','')||'dashboard';
    showPage(activePage);
    toast('Workspace updated from another account.');
    return true;
  }catch(error){
    console.error('Shared workspace refresh failed:',error);
    return false;
  }finally{_cloudRefreshRunning=false;}
}

function startCloudRefresh(){
  clearInterval(_cloudRefreshTimer);
  _cloudRefreshTimer=setInterval(cloudRefreshLatest,30000);
  const resume=()=>{
    if(_pendingCloudPayload)cloudPush();
    else cloudRefreshLatest();
  };
  window.addEventListener('focus',resume);
  window.addEventListener('online',resume);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)resume();});
}
// Debounced so rapid edits collapse into one network write.
function cloudPushDebounced(){
  if(!cloudReady)return;
  clearTimeout(_pushTimer);
  _pushTimer=setTimeout(()=>{
    _pushTimer=null;
    cloudPush();
  },800);
}
// Critical saves (such as finishing a count) must not report success while a
// debounced cloud write is still pending.
async function cloudPushNow(){
  if(!cloudReady)return true;
  clearTimeout(_pushTimer);
  _pushTimer=null;
  return cloudPush();
}
