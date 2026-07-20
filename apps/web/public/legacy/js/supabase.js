// supabase.js — authenticated compatibility bridge.
// The legacy interface remains unchanged while persistence is handled by the
// new organization-scoped Next.js + Supabase foundation.

let cloudReady=false, cloudUpdatedAt='', _pushTimer=null, _pushPromise=Promise.resolve(true), _cloudRefreshTimer=null, _cloudRefreshRunning=false;
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
    try{
      const data=typeof compactStateForStorage==='function'?compactStateForStorage():state;
      const headers={'Content-Type':'application/json'};
      if(cloudUpdatedAt)headers['x-workspace-version']=cloudUpdatedAt;
      const r=await fetch(WORKSPACE_STATE_ENDPOINT,{
        method:'PUT',credentials:'same-origin',headers,body:JSON.stringify(data)
      });
      const payload=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(payload.error||`HTTP ${r.status}`);
      cloudUpdatedAt=payload.updatedAt||cloudUpdatedAt;
      return true;
    }catch(e){console.error('Cloud push failed:',e);toast(e.message||'Could not save the shared workspace.',true);return false;}
  };
  _pushPromise=_pushPromise.then(push,push);
  return _pushPromise;
}

async function cloudSaveProduct(product){
  try{
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

async function cloudSaveCountRoom(countId,roomId,items,extraProductIds=[]){
  try{
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

async function cloudLoadCountRoomLocks(countId){
  try{
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
  return !document.hidden&&!modalOpen&&!inlineEdits&&!_pushTimer;
}

async function cloudRefreshLatest(){
  if(!cloudReady||_cloudRefreshRunning||!cloudCanApplyRefresh())return false;
  _cloudRefreshRunning=true;
  try{
    const response=await fetch(WORKSPACE_STATE_ENDPOINT,{credentials:'same-origin',cache:'no-store'});
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
  _cloudRefreshTimer=setInterval(cloudRefreshLatest,10000);
  window.addEventListener('focus',cloudRefreshLatest);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)cloudRefreshLatest();});
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
