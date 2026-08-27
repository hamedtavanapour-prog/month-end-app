// store.js — local persistence (localStorage) and cloud-sync trigger.

const CURRENT_WORKSPACE_SCHEMA_VERSION=6;

function compactUsageRow(row){
  return{
    productId:row.productId||'',
    productName:row.productName||'',
    reportProductName:row.reportProductName||row.productName||'',
    sku:row.sku||'',
    unitSize:row.unitSize||'',
    qty:row.qty??'',
    actualUsage:row.actualUsage??'',
    actualPercentSales:row.actualPercentSales??'',
    idealUsage:row.idealUsage??'',
    idealPercentSales:row.idealPercentSales??'',
    varianceUsage:row.varianceUsage??'',
    variancePercentSales:row.variancePercentSales??'',
    estimatedCostVariance:row.estimatedCostVariance??'',
    begin:row.begin??'',
    end:row.end??'',
    purch:row.purch??'',
    transferIn:row.transferIn??'',
    transferOut:row.transferOut??'',
    production:row.production??'',
    periodStart:row.periodStart||'',
    periodEnd:row.periodEnd||'',
    reportCategory:row.reportCategory||'',
    reportSubcategory:row.reportSubcategory||'',
    matched:!!row.matched,
    matchedName:row.matchedName||null,
    sizeMatched:row.sizeMatched!==false,
    sourceFile:row.sourceFile||'',
    importedAt:row.importedAt||'',
    sourceOrder:Number.isFinite(row.sourceOrder)?row.sourceOrder:null,
    sourceLines:row.sourceLines||'',
    sourceLineStart:Number.isFinite(row.sourceLineStart)?row.sourceLineStart:null,
    sourceLineEnd:Number.isFinite(row.sourceLineEnd)?row.sourceLineEnd:null,
    firstPrintedLine:row.firstPrintedLine||'',
    continuationLines:Array.isArray(row.continuationLines)?row.continuationLines:[],
    nameReconstructed:!!row.nameReconstructed,
    blankNameRecovered:!!row.blankNameRecovered,
    activityReconciles:row.activityReconciles!==false,
    reconciliationDelta:row.reconciliationDelta??'',
    needsReview:!!row.needsReview,
    reviewReason:row.reviewReason||''
  };
}

function normalizeInventoryEntryTemplate(){
  const template=state.inventoryEntryTemplate;
  if(!template||!Array.isArray(template.items)){
    state.inventoryEntryTemplate=null;
    return;
  }
  const seen=new Set();
  const items=[];
  template.items.forEach((item,index)=>{
    if(!item||!item.productId||seen.has(item.productId))return;
    const product=getProduct(item.productId);
    if(!product)return;
      seen.add(item.productId);
      items.push({
        productId:item.productId,
        productName:item.productName||product.name||'',
        reportProductName:item.reportProductName||item.productName||'',
        section:item.section||'',
        sourceOrder:Number.isFinite(item.sourceOrder)?item.sourceOrder:index
      });
  });
  items.sort((a,b)=>a.sourceOrder-b.sourceOrder);
  state.inventoryEntryTemplate=items.length?{
    sourceFile:template.sourceFile||'',
    uploadedAt:template.uploadedAt||'',
    source:template.source||'template',
    items
  }:null;
}

function normalizeUsageState(){
  if(!Array.isArray(state.usageLogs))state.usageLogs=[];
  if(!Array.isArray(state.uploadedUsage))state.uploadedUsage=[];
  state.usageLogs=state.usageLogs.map(log=>{
    const rows=(Array.isArray(log.rows)?log.rows:[])
      .filter(row=>row&&row.matched&&row.productId)
      .map(compactUsageRow)
      .sort((a,b)=>(Number.isFinite(a.sourceOrder)?a.sourceOrder:Number.MAX_SAFE_INTEGER)-(Number.isFinite(b.sourceOrder)?b.sourceOrder:Number.MAX_SAFE_INTEGER));
    const period=typeof usagePeriodFromRows==='function'?usagePeriodFromRows(rows,log.periodStart,log.periodEnd):{start:log.periodStart||'',end:log.periodEnd||''};
    return{...log,archived:!!log.archived,periodStart:period.start,periodEnd:period.end,rows};
  }).filter(log=>log.rows.length);
  const selectedLog=state.usageLogs.find(log=>log.id===selectedUsageLogId)||state.usageLogs.at(-1);
  state.uploadedUsage=(selectedLog?.rows||state.uploadedUsage.filter(row=>row&&row.matched&&row.productId)).map(compactUsageRow);
  if(selectedLog)selectedUsageLogId=selectedLog.id;
  normalizeInventoryEntryTemplate();
}

function compactStateForStorage(){
  normalizeUsageState();
  if(typeof ensureDepartments==='function')ensureDepartments();
  if(typeof ensureProductMenuSettings==='function')ensureProductMenuSettings();
  return{
    workspaceSchemaVersion:CURRENT_WORKSPACE_SCHEMA_VERSION,
    products:state.products||[],
    productCatalogVersion:state.productCatalogVersion||null,
    productParLevelVersion:state.productParLevelVersion||null,
    drinks:state.drinks||[],
    menus:state.menus||[],
    menuLibraryVersion:state.menuLibraryVersion||0,
    coreDrinkRecipeVersion:state.coreDrinkRecipeVersion||0,
    springMenuRecipeVersion:state.springMenuRecipeVersion||0,
    springPrepRecipeVersion:state.springPrepRecipeVersion||0,
    kitchenMenuVersion:state.kitchenMenuVersion||0,
    prepItems:state.prepItems||[],
    inventories:state.inventories||[],
    orders:state.orders||[],
    suppliers:state.suppliers||[],
    rooms:state.rooms||[],
    profiles:state.profiles||[],
    uploadedUsage:state.uploadedUsage||[],
    usageLogs:state.usageLogs||[],
    inventoryEntryTemplate:state.inventoryEntryTemplate||null,
    importBacklog:state.importBacklog||[],
    departments:state.departments||[],
    productMenus:state.productMenus||null,
    inventoryCategories:state.inventoryCategories||null
  };
}

function save(){
  const payload=JSON.stringify(compactStateForStorage());
  try{
    localStorage.setItem('keg_bar_v5',payload);
  }catch(e){
    try{
      localStorage.removeItem('keg_bar_v5');
      localStorage.setItem('keg_bar_v5',payload);
    }catch(secondError){
      toast('Browser storage is full. Deleted old unmatched usage rows; try again.',true);
    }
  }
  if(typeof queueCloudStatePayload==='function')queueCloudStatePayload(payload);
  cloudPushDebounced();
}

function seedDefaultDrinks(){
  if(typeof SEED_DRINKS==='undefined'||!Array.isArray(SEED_DRINKS))return[];
  return SEED_DRINKS.map(drink=>({...drink,id:uid(),archived:false,linkedProducts:[]}));
}

function ensureDrinkCatalog(){
  if(!Array.isArray(state.drinks))state.drinks=[];
  if(typeof SEED_DRINKS==='undefined'||!Array.isArray(SEED_DRINKS))return false;
  const existingNames=new Set(state.drinks.map(drink=>String(drink.name||'').trim().toLowerCase()).filter(Boolean));
  let changed=false;
  seedDefaultDrinks().forEach(drink=>{
    const key=String(drink.name||'').trim().toLowerCase();
    if(!key||existingNames.has(key))return;
    state.drinks.push(drink);
    existingNames.add(key);
    changed=true;
  });
  state.drinks.forEach(drink=>{
    if(drink.archived===undefined){drink.archived=false;changed=true;}
    if(!Array.isArray(drink.ingredients)){drink.ingredients=[];changed=true;}
    if(!Array.isArray(drink.linkedProducts)){drink.linkedProducts=[];changed=true;}
    if(!drink.type){drink.type='core';changed=true;}
    if(!drink.family){drink.family='Classics';changed=true;}
  });
  return changed;
}

function seedDefaultProducts(){
  return SEED_PRODUCTS.map(p=>{
    const{supplierNames,...seed}=p;
    const prod={...seed,id:uid(),departments:['bar'],inventoryName:p.inventoryName||'',lastCount:p.lastCount===null||p.lastCount===undefined?null:Number(p.lastCount)};
    normalizeProductUnits(prod);
    return prod;
  });
}

function ensureProductCatalog(){
  if(!Array.isArray(state.products))state.products=[];
  if(!state.products.length){
    state.products=seedDefaultProducts();
    state.productCatalogVersion=DEFAULT_PRODUCT_CATALOG_VERSION;
    return true;
  }
  // A catalog version is migration metadata, not permission to replace a
  // workspace's product records. Existing names and settings always win.
  if(state.productCatalogVersion!==DEFAULT_PRODUCT_CATALOG_VERSION){
    state.productCatalogVersion=DEFAULT_PRODUCT_CATALOG_VERSION;
    return true;
  }
  if(state.products.length>=Math.min(100,SEED_PRODUCTS.length))return false;
  const existingNames=new Set(state.products.map(product=>String(product.name||'').trim().toLowerCase()).filter(Boolean));
  let added=0;
  seedDefaultProducts().forEach(product=>{
    const key=String(product.name||'').trim().toLowerCase();
    if(existingNames.has(key))return;
    state.products.push(product);
    existingNames.add(key);
    added++;
  });
  return added>0;
}

function normalizeParLevelProductName(value){
  return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim();
}

function ensureProductParLevels(){
  if(typeof PRODUCT_PAR_LEVEL_VERSION==='undefined'||typeof PRODUCT_PAR_LEVELS==='undefined'||state.productParLevelVersion===PRODUCT_PAR_LEVEL_VERSION)return false;
  const seedByName=new Map((typeof SEED_PRODUCTS==='undefined'?[]:SEED_PRODUCTS).map(product=>[product.name,product]));
  Object.entries(PRODUCT_PAR_LEVELS).forEach(([name,par])=>{
    const normalizedName=normalizeParLevelProductName(name);
    let product=state.products.find(item=>normalizeParLevelProductName(item.name)===normalizedName);
    if(!product){
      const seed=seedByName.get(name);
      const inventoryName=normalizeParLevelProductName(seed?.inventoryName);
      const candidates=inventoryName?state.products.filter(item=>normalizeParLevelProductName(item.inventoryName)===inventoryName):[];
      if(candidates.length===1)product=candidates[0];
    }
    if(!product)return;
    const nextPar=Number(par);
    if(Number(product.par)!==nextPar)product.par=nextPar;
    normalizeProductUnits(product);
    if(product.units[0]&&Number(product.units[0].par)!==nextPar)product.units[0].par=nextPar;
  });
  state.productParLevelVersion=PRODUCT_PAR_LEVEL_VERSION;
  return true;
}

function supplierSeedProductIds(seedSupplier){
  const ids=[];
  (seedSupplier.productNames||[]).forEach(name=>{
    const key=String(name||'').trim().toLowerCase();
    const product=state.products.find(item=>String(item.name||'').trim().toLowerCase()===key);
    if(product&&!ids.includes(product.id))ids.push(product.id);
  });
  return ids;
}

function supplierCatalogSeeds(){
  const seeds=new Map();
  (Array.isArray(SEED_SUPPLIERS)?SEED_SUPPLIERS:[]).forEach(seed=>{
    const name=String(seed.name||'').trim();
    if(!name)return;
    seeds.set(name.toLowerCase(),{...seed,name,productNames:[...(seed.productNames||[])]});
  });
  SEED_PRODUCTS.forEach(product=>{
    (product.supplierNames||[]).forEach(rawName=>{
      const name=String(rawName||'').trim();
      if(!name)return;
      const key=name.toLowerCase();
      const seed=seeds.get(key)||{name,productNames:[]};
      if(!seed.productNames.includes(product.name))seed.productNames.push(product.name);
      seeds.set(key,seed);
    });
  });
  return[...seeds.values()];
}

function ensureSupplierCatalog(){
  if(!Array.isArray(state.suppliers))state.suppliers=[];
  if(typeof SEED_SUPPLIERS==='undefined'||!Array.isArray(SEED_SUPPLIERS))return false;
  const existingByName=new Map(state.suppliers.map(supplier=>[String(supplier.name||'').trim().toLowerCase(),supplier]).filter(([name])=>name));
  let changed=false;
  supplierCatalogSeeds().forEach(seed=>{
    const name=String(seed.name||'').trim();
    if(!name)return;
    const key=name.toLowerCase();
    const products=supplierSeedProductIds(seed);
    let supplier=existingByName.get(key);
    if(!supplier){
      supplier={id:uid(),name,contact:'',email:'',phone:'',website:'',leadDays:0,minSpend:0,minQty:0,notes:'',products,archived:false};
      state.suppliers.push(supplier);
      existingByName.set(key,supplier);
      changed=true;
      return;
    }
    if(supplier.archived===undefined){supplier.archived=false;changed=true;}
    if(!Array.isArray(supplier.products))supplier.products=[];
    products.forEach(productId=>{
      if(!supplier.products.includes(productId)){
        supplier.products.push(productId);
        changed=true;
      }
    });
  });
  return changed;
}

function syncAllSupplierProductLinks(){
  state.products.forEach(product=>{product.suppliers=[];});
  state.suppliers.forEach(supplier=>{
    if(!Array.isArray(supplier.products))supplier.products=[];
    supplier.products.forEach(productId=>{
      const product=getProduct(productId);
      if(!product)return;
      if(!Array.isArray(product.suppliers))product.suppliers=[];
      if(!product.suppliers.includes(supplier.id))product.suppliers.push(supplier.id);
    });
  });
}

function normalizeLoadedState(){
  if(!state.products)state.products=[];
  if(!state.drinks)state.drinks=[];
  if(!state.menus)state.menus=[];
  if(!Number.isFinite(Number(state.coreDrinkRecipeVersion)))state.coreDrinkRecipeVersion=0;
  if(!Array.isArray(state.prepItems))state.prepItems=[];
  if(!state.inventories)state.inventories=[];
  if(!state.orders)state.orders=[];
  if(!state.suppliers)state.suppliers=[];
  if(!state.rooms)state.rooms=[];
  if(!state.profiles)state.profiles=[];
  if(!state.uploadedUsage)state.uploadedUsage=[];
  if(!state.usageLogs)state.usageLogs=[];
  const departmentsChanged=typeof ensureDepartments==='function'?ensureDepartments():false;
  if(state.inventoryEntryTemplate===undefined)state.inventoryEntryTemplate=null;
  if(!Array.isArray(state.importBacklog))state.importBacklog=[];
  state.importBacklog=state.importBacklog.map(item=>({
    id:item.id||uid(),
    key:item.key||normMatch(item.name||''),
    name:item.name||'Unnamed item',
    units:Array.isArray(item.units)?item.units.filter(Boolean):[],
    category:item.category||'Other',
    subcategory:item.subcategory||'Misc',
    sections:Array.isArray(item.sections)?item.sections.filter(Boolean):[item.section].filter(Boolean),
    sourceFiles:Array.isArray(item.sourceFiles)?item.sourceFiles.filter(Boolean):[],
    firstSeenAt:item.firstSeenAt||item.lastSeenAt||new Date().toISOString(),
    lastSeenAt:item.lastSeenAt||item.firstSeenAt||new Date().toISOString(),
    seenCount:Math.max(1,parseInt(item.seenCount,10)||1)
  })).filter(item=>item.key);
  normalizeUsageState();
  let productSchemaChanged=false;
  state.products.forEach(p=>{
    let departments=productDepartmentIds(p).filter(id=>!!getDepartment(id));
    if(!departments.length)departments=['bar'];
    if(JSON.stringify(p.departments)!==JSON.stringify(departments)||p.department!==undefined){p.departments=departments;delete p.department;productSchemaChanged=true;}
    if(p.inventoryName===undefined){p.inventoryName='';productSchemaChanged=true;}
    if(!p.aliases)p.aliases='';
    if(!p.sku)p.sku='';
    if(p.notes===undefined)p.notes='';
    if(p.archived===undefined)p.archived=false;
    if(!Array.isArray(p.suppliers))p.suppliers=state.suppliers.filter(s=>(s.products||[]).includes(p.id)).map(s=>s.id);
    normalizeProductUnits(p);
  });
  state.suppliers.forEach(s=>{
    if(s.archived===undefined)s.archived=false;
    if(!Array.isArray(s.products))s.products=[];
  });
  const productsChanged=ensureProductCatalog();
  const productParLevelsChanged=ensureProductParLevels();
  const inventoryCategoriesChanged=typeof normalizeInventoryCategories==='function'?normalizeInventoryCategories():false;
  let inventoriesChanged=false;
  state.inventories.forEach(inv=>{
    if(typeof normalizeInventoryRooms==='function'){
      const hadRooms=Array.isArray(inv.rooms)&&inv.rooms.length;
      const before=JSON.stringify(inv.items||{});
      normalizeInventoryRooms(inv);
      if(!hadRooms||before!==JSON.stringify(inv.items||{}))inventoriesChanged=true;
    }
  });
  let roomsChanged=false;
  if(typeof normalizeFloorPlanRooms==='function')roomsChanged=normalizeFloorPlanRooms();
  let profilesChanged=false;
  if(typeof normalizeProfiles==='function')profilesChanged=normalizeProfiles();
  const departmentAssignmentsChanged=typeof ensureDepartmentAssignments==='function'?ensureDepartmentAssignments():false;
  const suppliersChanged=ensureSupplierCatalog();
  const drinksChanged=ensureDrinkCatalog();
  const productMenusChanged=typeof ensureProductMenuSettings==='function'?ensureProductMenuSettings():false;
  const menusChanged=typeof ensureMenuLibrary==='function'?ensureMenuLibrary():false;
  const prepItemsChanged=typeof ensurePrepItems==='function'?ensurePrepItems():false;
  syncAllSupplierProductLinks();
  state.workspaceSchemaVersion=CURRENT_WORKSPACE_SCHEMA_VERSION;
  return departmentsChanged||productSchemaChanged||productMenusChanged||menusChanged||prepItemsChanged||productsChanged||productParLevelsChanged||inventoryCategoriesChanged||suppliersChanged||drinksChanged||inventoriesChanged||roomsChanged||profilesChanged||departmentAssignmentsChanged;
}

function load(){
  const raw=localStorage.getItem('keg_bar_v5');
  if(raw){
    state=JSON.parse(raw);
    const needsSchemaSave=(Number(state.workspaceSchemaVersion)||0)<CURRENT_WORKSPACE_SCHEMA_VERSION;
    if(normalizeLoadedState()&&needsSchemaSave){
      save();
      toast('Updated saved workspace data.');
    }
  }else{
    if(typeof ensureDepartments==='function')ensureDepartments();
    ensureProductCatalog();
    ensureProductParLevels();
    ensureSupplierCatalog();
    ensureDrinkCatalog();
    if(typeof ensureMenuLibrary==='function')ensureMenuLibrary();
    syncAllSupplierProductLinks();
    save();
  }
}
