// main.js — app entry point. Boots state (cloud→local), renders, wires column pickers.

async function init(){
  const pendingLocal=typeof pendingLocalWorkspaceState==='function'?pendingLocalWorkspaceState():null;
  const cloud=await cloudLoad();
  if(cloud===undefined&&typeof enableLocalOnlyMode==='function'&&typeof isLocalDevelopmentHost==='function'&&isLocalDevelopmentHost())enableLocalOnlyMode();
  if(pendingLocal){
    // A previous session closed or lost its connection before the cloud save
    // completed. Keep that local snapshot authoritative until it is confirmed.
    state=pendingLocal;
    normalizeLoadedState();
    cloudReady=true;
    const payload=JSON.stringify(compactStateForStorage());
    queueCloudStatePayload(payload);
    if(!await cloudPush())toast('Your latest changes are safe on this device and will retry when the connection returns.',true);
  }else if(cloud){
    // Cloud is the source of truth when it has data.
    state=cloud;
    const needsSchemaSave=(Number(state.workspaceSchemaVersion)||0)<CURRENT_WORKSPACE_SCHEMA_VERSION;
    const normalizedState=normalizeLoadedState();
    try{localStorage.setItem('keg_bar_v5',JSON.stringify(state));}catch(e){}
    cloudReady=true;
    if(normalizedState&&needsSchemaSave){
      // Persist migrations through the normal local outbox. Rendering no longer
      // waits several seconds for a full-state write on every hard refresh.
      save();
      toast('Updated saved workspace data.');
    }
  }else{
    // No cloud data: load the local cache or seed defaults.
    load();
    cloudReady=true;
    if(cloud===null){await cloudPush();}            // cloud reachable but empty → seed it
    else if(localOnlyMode){toast('Local-only mode — count changes stay in this browser.',false);}
    else{toast('Offline — changes save locally and sync when reconnected.',true);}
  }
  // normalizeLoadedState already normalizes categories. Repeating it here made
  // the legacy category ordering report a change and schedule a full workspace
  // write on every page load.
  if(typeof refreshCategorySelects==='function')refreshCategorySelects();
  if(typeof restoreMenuPageItemView==='function')restoreMenuPageItemView();
  const activePage=document.querySelector('.page.active')?.id?.replace('page-','')||'dashboard';
  if(typeof handleInviteFromUrl==='function')handleInviteFromUrl();
  if(activePage==='dashboard')renderDashboard();
  else showPage(activePage);
  buildColPicker('prod-col-checks',PROD_COLS,'renderProducts');
  buildColPicker('inv-col-checks',INV_COLS,'renderInventoryTable');
  buildColPicker('ord-col-checks',ORD_COLS,'renderOrders');
  buildColPicker('sup-col-checks',SUP_COLS,'renderSuppliers');
  if(typeof renderProfileMenu==='function')renderProfileMenu();
  if(typeof renderAccessControlledNav==='function')renderAccessControlledNav();
  if(typeof startCloudRefresh==='function')startCloudRefresh();
}
init().finally(()=>window.legacyRoutingReady?.());
