// main.js — app entry point. Boots state (cloud→local), renders, wires column pickers.

async function init(){
  const cloud=await cloudLoad();
  if(cloud){
    // Cloud is the source of truth when it has data.
    state=cloud;
    const restoredProducts=normalizeLoadedState();
    try{localStorage.setItem('keg_bar_v5',JSON.stringify(state));}catch(e){}
    cloudReady=true;
    if(restoredProducts){
      await cloudPush();
      toast(`Restored ${state.products.length} default products.`);
    }
  }else{
    // No cloud data: load the local cache or seed defaults.
    load();
    cloudReady=true;
    if(cloud===null){await cloudPush();}            // cloud reachable but empty → seed it
    else{toast('Offline — changes save locally and sync when reconnected.',true);}
  }
  if(typeof normalizeInventoryCategories==='function'&&normalizeInventoryCategories())save();
  if(typeof refreshCategorySelects==='function')refreshCategorySelects();
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
