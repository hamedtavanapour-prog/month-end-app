// Keeps the legacy workspace synchronized with the canonical application URL.
(function(){
  const PAGE_ROUTES={
    dashboard:['/app/dashboard','Dashboard'],
    products:['/app/catalog/products','Products'],
    menu:['/app/catalog/menu','Menu & Recipes'],
    'live-inventory':['/app/inventory/live','Live Inventory'],
    inventory:['/app/inventory/counts','Counts'],
    orders:['/app/purchasing/orders','Orders'],
    usage:['/app/inventory/usage','Usage'],
    insights:['/app/intelligence/insights','Insights'],
    suppliers:['/app/purchasing/suppliers','Suppliers'],
    reports:['/app/intelligence/reports/usage','Usage Reports'],
    profile:['/app/profile','My Profile'],
    settings:['/app/settings/general','General Settings']
  };
  const SETTINGS_ROUTES={
    general:['/app/settings/general','General Settings'],
    'floor-plan':['/app/settings/floor-plan','Floor Plan'],
    categories:['/app/catalog/categories','Categories'],
    departments:['/app/settings/departments','Departments'],
    profiles:['/app/settings/users','Users & Access'],
    appearance:['/app/settings/appearance','Appearance'],
    sync:['/app/settings/system','System & Storage'],
    exports:['/app/settings/exports','Export Preferences']
  };
  const REPORT_ROUTES={
    usage:['/app/intelligence/reports/usage','Usage Reports'],
    value:['/app/intelligence/reports/inventory-value','Inventory Value'],
    rorders:['/app/intelligence/reports/order-history','Order History']
  };
  const BASE_ROUTE_BY_MODAL={
    'modal-product':'products','modal-product-view':'products','modal-product-units':'products',
    'modal-menu-item-view':'menu','modal-prep-item-view':'menu',
    'modal-inv-room-select':'inventory','modal-inv-room-picker':'inventory','modal-inventory':'inventory','modal-count-add-item':'inventory','modal-view-inv':'inventory',
    'modal-order':'orders','modal-order-detail':'orders','modal-scan':'orders','modal-view-scan':'orders',
    'modal-usage-upload':'usage','modal-usage-log-detail':'usage','modal-inventory-template-upload':'usage',
    'modal-supplier':'suppliers','modal-supplier-view':'suppliers',
    'modal-floor-plan-room':'settings','modal-category-editor':'settings'
  };

  let ready=false;
  let applying=false;
  let pendingPath='';
  let publishTimer=null;
  let routeState={page:'dashboard',section:'general',reportView:'usage',resourceKind:'',resourceId:'',action:''};

  function cleanSegments(path){
    try{return new URL(path,location.origin).pathname.split('/').filter(Boolean).slice(1).map(decodeURIComponent);}catch(error){return[];}
  }

  function parseRoute(path){
    const parts=cleanSegments(path);
    if(!parts.length)return null;
    if(parts[0]==='dashboard')return{page:'dashboard'};
    if(parts[0]==='profile')return{page:'profile'};
    if(parts[0]==='catalog'&&parts[1]==='products')return{page:'products',resourceKind:parts[2]&&parts[2]!=='new'?'product':'',resourceId:parts[2]&&parts[2]!=='new'?parts[2]:'',action:parts[2]==='new'?'new':parts[3]==='edit'?'edit':''};
    if(parts[0]==='catalog'&&parts[1]==='menu')return{page:'menu'};
    if(parts[0]==='catalog'&&parts[1]==='menu-items'&&parts[2])return{page:'menu',resourceKind:'menu-item',resourceId:parts[2]};
    if(parts[0]==='catalog'&&parts[1]==='prep-items'&&parts[2])return{page:'menu',resourceKind:'prep-item',resourceId:parts[2]};
    if(parts[0]==='catalog'&&parts[1]==='categories')return{page:'settings',section:'categories',resourceKind:parts[2]?'category':'',resourceId:parts[2]||''};
    if(parts[0]==='catalog'&&parts[1]==='menus')return{page:'menu',resourceKind:parts[2]?'menu':'',resourceId:parts[2]||''};
    if(parts[0]==='inventory'&&parts[1]==='live')return{page:'live-inventory'};
    if(parts[0]==='inventory'&&parts[1]==='counts')return{page:'inventory',resourceKind:parts[2]&&parts[2]!=='new'?'count':'',resourceId:parts[2]&&parts[2]!=='new'?parts[2]:'',action:parts[2]==='new'?'new':parts[3]==='edit'?'edit':''};
    if(parts[0]==='inventory'&&parts[1]==='usage')return{page:'usage',resourceKind:parts[2]&&parts[2]!=='import'?'usage':'',resourceId:parts[2]&&parts[2]!=='import'?parts[2]:'',action:parts[2]==='import'?'import':parts[3]==='edit'?'edit':''};
    if(parts[0]==='purchasing'&&parts[1]==='orders')return{page:'orders',resourceKind:parts[2]&&parts[2]!=='new'?'order':'',resourceId:parts[2]&&parts[2]!=='new'?parts[2]:'',action:parts[2]==='new'?'new':parts[3]==='edit'?'edit':''};
    if(parts[0]==='purchasing'&&parts[1]==='suppliers')return{page:'suppliers',resourceKind:parts[2]&&parts[2]!=='new'?'supplier':'',resourceId:parts[2]&&parts[2]!=='new'?parts[2]:'',action:parts[2]==='new'?'new':parts[3]==='edit'?'edit':''};
    if(parts[0]==='intelligence'&&parts[1]==='insights')return{page:'insights'};
    if(parts[0]==='intelligence'&&parts[1]==='reports'){
      const reportView=parts[2]==='inventory-value'?'value':parts[2]==='order-history'?'rorders':'usage';
      return{page:'reports',reportView};
    }
    if(parts[0]==='settings'){
      if(parts[1]==='floor-plan')return{page:'settings',section:'floor-plan',resourceKind:parts[2]==='rooms'&&parts[3]?'room':'',resourceId:parts[2]==='rooms'?parts[3]||'':''};
      if(parts[1]==='departments')return{page:'settings',section:'departments',resourceKind:parts[2]?'department':'',resourceId:parts[2]||''};
      const section={general:'general',users:'profiles',appearance:'appearance',system:'sync',exports:'exports'}[parts[1]||'general'];
      if(section)return{page:'settings',section};
    }
    return null;
  }

  function stateRoute(){
    const state=routeState;
    if(state.resourceKind&&state.resourceId){
      const id=encodeURIComponent(state.resourceId);
      const suffix=state.action==='edit'?'/edit':'';
      if(state.resourceKind==='product')return[`/app/catalog/products/${id}${suffix}`,state.action==='edit'?'Edit Product':'Product Details'];
      if(state.resourceKind==='menu-item')return[`/app/catalog/menu-items/${id}`,'Menu Item'];
      if(state.resourceKind==='prep-item')return[`/app/catalog/prep-items/${id}`,'Prep Information'];
      if(state.resourceKind==='count')return[`/app/inventory/counts/${id}${suffix}`,state.action==='edit'?'Edit Count':'Count Details'];
      if(state.resourceKind==='usage')return[`/app/inventory/usage/${id}${suffix}`,state.action==='edit'?'Edit Usage':'Usage Details'];
      if(state.resourceKind==='order')return[`/app/purchasing/orders/${id}${suffix}`,state.action==='edit'?'Edit Order':'Order Details'];
      if(state.resourceKind==='supplier')return[`/app/purchasing/suppliers/${id}${suffix}`,state.action==='edit'?'Edit Supplier':'Supplier Details'];
      if(state.resourceKind==='room')return[`/app/settings/floor-plan/rooms/${id}`,'Room Settings'];
      if(state.resourceKind==='category')return[`/app/catalog/categories/${id}`,'Category Settings'];
      if(state.resourceKind==='department')return[`/app/settings/departments/${id}`,'Department Settings'];
      if(state.resourceKind==='menu')return[`/app/catalog/menus/${id}`,'Menu'];
    }
    if(state.action){
      if(state.page==='products')return['/app/catalog/products/new','New Product'];
      if(state.page==='inventory')return['/app/inventory/counts/new','New Count'];
      if(state.page==='orders')return['/app/purchasing/orders/new','New Order'];
      if(state.page==='usage')return['/app/inventory/usage/import','Import Usage'];
      if(state.page==='suppliers')return['/app/purchasing/suppliers/new','New Supplier'];
    }
    if(state.page==='settings')return SETTINGS_ROUTES[state.section]||SETTINGS_ROUTES.general;
    if(state.page==='reports')return REPORT_ROUTES[state.reportView]||REPORT_ROUTES.usage;
    return PAGE_ROUTES[state.page]||PAGE_ROUTES.dashboard;
  }

  function publishRoute(replace=false){
    if(applying)return;
    clearTimeout(publishTimer);
    publishTimer=setTimeout(()=>{
      const [path,title]=stateRoute();
      window.parent.postMessage({type:'month-end:route-change',path,title,replace},location.origin);
    },0);
  }

  function resetDetail(){routeState.resourceKind='';routeState.resourceId='';routeState.action='';}

  function recordExists(kind,id){
    if(!id||typeof state!=='object')return false;
    if(kind==='menu-item')return Boolean(typeof getMenuItemRecord==='function'&&getMenuItemRecord(id));
    if(kind==='prep-item')return Boolean(typeof getPrepItem==='function'&&getPrepItem(id));
    const collections={product:'products',count:'inventories',usage:'usageLogs',order:'orders',supplier:'suppliers',room:'rooms',department:'departments',menu:'menus'};
    if(kind==='category')return Object.prototype.hasOwnProperty.call(state.inventoryCategories||{},id);
    return Boolean((state[collections[kind]]||[]).some(item=>item.id===id));
  }

  function applyResource(target){
    const kind=target.resourceKind,id=target.resourceId;
    if(kind&&id&&!recordExists(kind,id)){
      resetDetail();
      if(typeof toast==='function')toast('That record could not be found.',true);
      publishRoute(true);
      return;
    }
    if(target.action==='new'){
      if(target.page==='products')openProductModal();
      else if(target.page==='inventory')openInventoryRoomSelect();
      else if(target.page==='orders')openOrderModal();
      else if(target.page==='suppliers')openSupplierModal();
      return;
    }
    if(target.action==='import'){openUsageUploadModal('other');return;}
    if(kind==='product')target.action==='edit'?openProductModal(id):openProductView(id);
    else if(kind==='menu-item')openMenuItemView(id);
    else if(kind==='prep-item')openPrepItemView(id);
    else if(kind==='count')target.action==='edit'?openCountRoomPicker(id):viewInventory(id);
    else if(kind==='usage')openUsageLogView(id,target.action==='edit');
    else if(kind==='order')target.action==='edit'?openOrderModal(id):viewOrderDetail(id);
    else if(kind==='supplier')target.action==='edit'?openSupplierModal(id):openSupplierView(id);
    else if(kind==='room')openFloorPlanRoomEditor(id);
    else if(kind==='category')openInventoryCategoryEditor(id);
    else if(kind==='department'&&typeof selectDepartmentSettings==='function')selectDepartmentSettings(id);
    else if(kind==='menu')openMenuPageMenu(id);
  }

  function applyRoute(path){
    const target=parseRoute(path);
    if(!target)return;
    if(!ready){pendingPath=path;return;}
    applying=true;
    routeState={page:target.page,section:target.section||'general',reportView:target.reportView||'usage',resourceKind:target.resourceKind||'',resourceId:target.resourceId||'',action:target.action||''};
    try{
      document.querySelectorAll('.modal-overlay.open').forEach(modal=>closeModal(modal.id));
      showPage(target.page);
      if(target.page==='settings')setSettingsSection(target.section||'general');
      if(target.page==='reports')switchRepTab(target.reportView||'usage');
      requestAnimationFrame(()=>{try{applyResource(target);}finally{applying=false;}});
    }catch(error){
      applying=false;
      console.error('Could not apply workspace route.',error);
    }
  }

  function wrap(name,after){
    const original=window[name];
    if(typeof original!=='function')return;
    window[name]=function(...args){const result=original.apply(this,args);if(!applying)after(...args);return result;};
  }

  function installNavigationHooks(){
    wrap('showPage',name=>{routeState.page=name;if(name!=='settings')routeState.section='general';if(name!=='reports')routeState.reportView='usage';resetDetail();publishRoute();});
    wrap('setSettingsSection',section=>{routeState.page='settings';routeState.section=section||'general';resetDetail();publishRoute();});
    wrap('switchRepTab',tab=>{routeState.page='reports';routeState.reportView=tab;resetDetail();publishRoute();});
    wrap('openProductView',id=>{routeState={...routeState,page:'products',resourceKind:'product',resourceId:id,action:''};publishRoute();});
    wrap('openMenuItemView',id=>{routeState={...routeState,page:'menu',resourceKind:'menu-item',resourceId:id,action:''};publishRoute();});
    wrap('openPrepItemView',id=>{routeState={...routeState,page:'menu',resourceKind:'prep-item',resourceId:id,action:''};publishRoute();});
    wrap('openProductModal',id=>{routeState={...routeState,page:'products',resourceKind:id?'product':'',resourceId:id||'',action:id?'edit':'new'};publishRoute();});
    wrap('viewInventory',id=>{routeState={...routeState,page:'inventory',resourceKind:'count',resourceId:id,action:''};publishRoute();});
    wrap('openInventoryRoomSelect',()=>{routeState={...routeState,page:'inventory',resourceKind:'',resourceId:'',action:'new'};publishRoute();});
    wrap('openInventoryModal',id=>{routeState={...routeState,page:'inventory',resourceKind:id?'count':'',resourceId:id||'',action:id?'edit':'new'};publishRoute();});
    wrap('openUsageLogView',(id,edit)=>{routeState={...routeState,page:'usage',resourceKind:'usage',resourceId:id,action:edit?'edit':''};publishRoute();});
    wrap('viewOrderDetail',id=>{routeState={...routeState,page:'orders',resourceKind:'order',resourceId:id,action:''};publishRoute();});
    wrap('openOrderModal',id=>{routeState={...routeState,page:'orders',resourceKind:id?'order':'',resourceId:id||'',action:id?'edit':'new'};publishRoute();});
    wrap('openSupplierView',id=>{routeState={...routeState,page:'suppliers',resourceKind:'supplier',resourceId:id,action:''};publishRoute();});
    wrap('openSupplierModal',id=>{routeState={...routeState,page:'suppliers',resourceKind:id?'supplier':'',resourceId:id||'',action:id?'edit':'new'};publishRoute();});
    wrap('openFloorPlanRoomEditor',id=>{routeState={...routeState,page:'settings',section:'floor-plan',resourceKind:'room',resourceId:id,action:''};publishRoute();});
    wrap('openInventoryCategoryEditor',name=>{if(name){routeState={...routeState,page:'settings',section:'categories',resourceKind:'category',resourceId:name,action:''};publishRoute();}});
    wrap('selectDepartmentSettings',id=>{if(id){routeState={...routeState,page:'settings',section:'departments',resourceKind:'department',resourceId:id,action:''};publishRoute();}});
    wrap('openMenuPageMenu',id=>{if(id&&id!=='__all_items__'){routeState={...routeState,page:'menu',resourceKind:'menu',resourceId:id,action:''};publishRoute();}else{routeState={...routeState,page:'menu',resourceKind:'',resourceId:'',action:''};publishRoute();}});
    wrap('showMenuPagePicker',()=>{routeState={...routeState,page:'menu',resourceKind:'',resourceId:'',action:''};publishRoute();});
    wrap('openModal',id=>{if(id==='modal-usage-upload'){routeState={...routeState,page:'usage',resourceKind:'',resourceId:'',action:'import'};publishRoute();}});
    wrap('closeModal',id=>{if(BASE_ROUTE_BY_MODAL[id]){routeState.page=BASE_ROUTE_BY_MODAL[id];if(id==='modal-floor-plan-room')routeState.section='floor-plan';if(id==='modal-category-editor')routeState.section='categories';resetDetail();if(id==='modal-menu-item-view'&&menuPageMenuId&&menuPageMenuId!=='__all_items__'){routeState.resourceKind='menu';routeState.resourceId=menuPageMenuId;}publishRoute();}});
  }

  window.addEventListener('message',event=>{
    if(event.origin!==location.origin||event.data?.type!=='month-end:apply-route')return;
    applyRoute(event.data.path||'');
  });

  window.legacyRoutingReady=function(){
    ready=true;
    installNavigationHooks();
    const query=new URLSearchParams(location.search);
    const initial=pendingPath||(()=>{
      const page=query.get('page')||'dashboard';
      const section=query.get('section')||'';
      const report=query.get('report')||'';
      const resource=query.get('resource')||'';
      const id=query.get('id')||'';
      const action=query.get('action')||'';
      routeState={page,section:section||'general',reportView:report||'usage',resourceKind:resource,resourceId:id,action};
      return stateRoute()[0];
    })();
    pendingPath='';
    applyRoute(initial);
  };
})();
