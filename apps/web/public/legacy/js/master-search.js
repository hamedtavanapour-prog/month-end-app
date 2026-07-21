// master-search.js — permission-aware Spotlight-style navigation and record search.

const MASTER_SEARCH_RECENTS_KEY='month-end-master-search-recents-v1';
const MASTER_SEARCH_GROUP_ORDER=['Quick actions','Pages','Products','Menu items','Counts','Usage reports','Orders','Suppliers','Rooms','Categories','Departments','Menus','People','Settings'];
let masterSearchMatches=[];
let masterSearchActiveIndex=-1;
let masterSearchReturnFocus=null;

function masterSearchNormalize(value=''){
  return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim();
}

function masterSearchDistance(a,b){
  if(a===b)return 0;
  if(!a.length)return b.length;
  if(!b.length)return a.length;
  const matrix=Array.from({length:a.length+1},(_,index)=>[index]);
  for(let column=0;column<=b.length;column++)matrix[0][column]=column;
  for(let row=1;row<=a.length;row++){
    for(let column=1;column<=b.length;column++){
      const cost=a[row-1]===b[column-1]?0:1;
      matrix[row][column]=Math.min(matrix[row-1][column]+1,matrix[row][column-1]+1,matrix[row-1][column-1]+cost);
      if(row>1&&column>1&&a[row-1]===b[column-2]&&a[row-2]===b[column-1]){
        matrix[row][column]=Math.min(matrix[row][column],matrix[row-2][column-2]+cost);
      }
    }
  }
  return matrix[a.length][b.length];
}

function masterSearchScore(record,query){
  const q=masterSearchNormalize(query);
  if(!q)return record.suggest||0;
  const title=masterSearchNormalize(record.title);
  const subtitle=masterSearchNormalize(record.subtitle);
  const keywords=masterSearchNormalize(record.keywords);
  const haystack=`${title} ${subtitle} ${keywords}`.trim();
  if(!haystack)return-Infinity;
  let score=record.priority||0;
  if(title===q)score+=1300;
  else if(title.startsWith(q))score+=950-Math.min(title.length-q.length,90);
  else if(title.includes(q))score+=720-title.indexOf(q)*2;
  else if(haystack.includes(q))score+=540-haystack.indexOf(q);
  const queryTokens=q.split(' ').filter(Boolean);
  const titleTokens=title.split(' ').filter(Boolean);
  const allTokens=haystack.split(' ').filter(Boolean);
  let matched=0;
  queryTokens.forEach(token=>{
    let best=0;
    allTokens.forEach(candidate=>{
      if(candidate===token)best=Math.max(best,180);
      else if(candidate.startsWith(token))best=Math.max(best,130);
      else if(candidate.includes(token))best=Math.max(best,95);
      else{
        const distance=masterSearchDistance(token,candidate);
        const tolerance=token.length>=7?2:token.length>=4?1:0;
        if(distance<=tolerance)best=Math.max(best,80-distance*18);
      }
    });
    if(best){matched++;score+=best;}
    if(titleTokens.some(candidate=>candidate===token||candidate.startsWith(token)))score+=55;
  });
  if(matched!==queryTokens.length)return-Infinity;
  score+=Math.round((matched/queryTokens.length)*100);
  return score;
}

function masterSearchCanAccess(page){
  return typeof profileCanAccessPage!=='function'||profileCanAccessPage(typeof currentProfile==='function'?currentProfile():null,page);
}

function masterSearchAfterPage(page,callback){
  showPage(page);
  closeAllMenus?.();
  if(callback)requestAnimationFrame(()=>callback());
}

function masterSearchRecord(config){
  return{subtitle:'',keywords:'',priority:0,suggest:0,...config};
}

function buildMasterSearchIndex(){
  const records=[];
  const add=config=>records.push(masterSearchRecord(config));
  const can=masterSearchCanAccess;
  const pages=[
    ['dashboard','Dashboard','Inventory overview, alerts, and recent activity','home overview metrics'],
    ['products','Products','Product catalog and drink menu items','catalog bottles items'],
    ['live-inventory','Live Inventory','Current stock by room','on hand stock rooms'],
    ['inventory','Counts','Draft, file, and review inventory counts','account count inventory'],
    ['orders','Orders','Purchase orders, invoices, and deliveries','purchases invoice'],
    ['usage','Usage','Usage file imports and matching','ideal actual usage pdf import'],
    ['insights','Insights','Inventory trends and recommendations','analytics trends'],
    ['suppliers','Suppliers','Supplier contacts and linked products','vendors contacts'],
    ['reports','Reports','Inventory, usage, value, and order reports','export reports'],
    ['settings','Settings','Workspace, access, categories, and appearance','preferences configuration']
  ];
  pages.forEach(([page,title,subtitle,keywords],index)=>{if(can(page))add({id:`page:${page}`,group:'Pages',title,subtitle,keywords,icon:'page',page,priority:45,suggest:88-index,action:()=>showPage(page)});});

  const actions=[
    ['inventory','Start a new count','Create a saved count draft and choose rooms','new inventory account count','count',()=>openInventoryRoomSelect()],
    ['products','Add a product','Create a product in the catalog','new item bottle product','plus',()=>openProductModal()],
    ['orders','Create an order','Start a new purchase order','new invoice purchase','plus',()=>openOrderModal()],
    ['usage','Upload a usage report','Import a PDF or spreadsheet for usage matching','pdf food trak ideal usage import','upload',()=>openUsageUploadModal('other')],
    ['suppliers','Add a supplier','Create a supplier and contact record','new vendor contact','plus',()=>openSupplierModal()],
    ['settings','Manage users and access','View profiles, roles, and permissions','staff manager administrator profile','people',()=>setSettingsSection('profiles')]
  ];
  actions.forEach(([page,title,subtitle,keywords,icon,callback],index)=>{if(can(page))add({id:`action:${masterSearchNormalize(title).replace(/ /g,'-')}`,group:'Quick actions',title,subtitle,keywords,icon,page,priority:65,suggest:100-index,action:()=>masterSearchAfterPage(page,callback)});});

  if(can('settings')){
    const settings=[
      ['general','General','Workspace and application information','workspace account'],['floor-plan','Floor Plan','Rooms and the items assigned to them','locations room'],['categories','Categories','Inventory categories and subcategories','taxonomy classifications'],['departments','Departments','Department workspaces and assignments','bar kitchen'],['product-menus','Menu','Department menus and menu items','drinks recipes'],['profiles','Users & Access','Profiles, roles, departments, and permissions','staff managers team'],['appearance','Appearance','Theme and display preferences','dark light colors'],['sync','Sync & Storage','Cloud sync and browser cache','backup database'],['exports','Exports','Spreadsheet and print preferences','xlsx csv pdf']
    ];
    settings.forEach(([key,title,subtitle,keywords],index)=>add({id:`settings:${key}`,group:'Settings',title,subtitle,keywords,icon:'settings',page:'settings',priority:38,suggest:index<5?55-index:0,action:()=>masterSearchAfterPage('settings',()=>setSettingsSection(key))}));
  }

  if(can('products')){
    (state.products||[]).filter(item=>!item.archived).forEach(product=>{
      const suppliers=(product.suppliers||[]).map(id=>(state.suppliers||[]).find(item=>item.id===id)?.name).filter(Boolean);
      add({id:`product:${product.id}`,group:'Products',title:product.name||product.inventoryName||'Unnamed product',subtitle:[product.category,product.subcategory,product.unit].filter(Boolean).join(' · '),keywords:[product.inventoryName,product.sku,product.productNumber,product.aliases,product.packaging,suppliers].flat().filter(Boolean).join(' '),icon:'product',page:'products',priority:24,action:()=>masterSearchAfterPage('products',()=>openProductView(product.id))});
    });
    (state.drinks||[]).filter(item=>!item.archived).forEach(drink=>add({id:`drink:${drink.id}`,group:'Menu items',title:drink.name||'Unnamed menu item',subtitle:[drink.family||drink.category,drink.type].filter(Boolean).join(' · '),keywords:[drink.description,(drink.recipe||[]).map(item=>item.name||item.productName)].flat(2).filter(Boolean).join(' '),icon:'menu',page:'products',priority:18,action:()=>masterSearchAfterPage('products',()=>openDrinkView(drink.id))}));
  }

  if(can('inventory'))(state.inventories||[]).filter(item=>!item.archived).forEach(inventory=>add({id:`count:${inventory.id}`,group:'Counts',title:inventory.label||`Count — ${inventory.date||'undated'}`,subtitle:[inventory.date,(inventory.rooms||[]).length?`${inventory.rooms.length} room${inventory.rooms.length===1?'':'s'}`:'',inventory.status].filter(Boolean).join(' · '),keywords:[inventory.createdBy?.name,inventory.updatedBy?.name,(inventory.rooms||[]).map(room=>room.name)].flat().filter(Boolean).join(' '),icon:'count',page:'inventory',priority:20,action:()=>masterSearchAfterPage('inventory',()=>viewInventory(inventory.id))}));

  if(can('usage'))(state.usageLogs||[]).filter(item=>!item.archived).forEach(log=>add({id:`usage:${log.id}`,group:'Usage reports',title:log.fileName||log.name||log.label||'Usage report',subtitle:[log.startDate&&log.endDate?`${log.startDate} – ${log.endDate}`:log.date,`${(log.rows||log.items||[]).length||0} items`].filter(Boolean).join(' · '),keywords:[log.createdBy?.name,log.updatedBy?.name,(log.rows||log.items||[]).map(row=>row.productName||row.name||row.rawName)].flat(2).filter(Boolean).join(' '),icon:'usage',page:'usage',priority:19,action:()=>masterSearchAfterPage('usage',()=>openUsageLogView(log.id))}));

  if(can('orders'))(state.orders||[]).filter(item=>!item.archived).forEach(raw=>{
    const order=typeof normalizeOrder==='function'?normalizeOrder(raw):raw;
    add({id:`order:${order.id}`,group:'Orders',title:order.invoiceNumber?`Order ${order.invoiceNumber}`:`Order — ${order.date||'undated'}`,subtitle:[order.supplier,order.date,order.status].filter(Boolean).join(' · '),keywords:[order.notes,(order.lines||[]).map(line=>[line.productName,line.sku,line.productNumber])].flat(3).filter(Boolean).join(' '),icon:'order',page:'orders',priority:18,action:()=>masterSearchAfterPage('orders',()=>viewOrderDetail(order.id))});
  });

  if(can('suppliers'))(state.suppliers||[]).filter(item=>!item.archived).forEach(supplier=>add({id:`supplier:${supplier.id}`,group:'Suppliers',title:supplier.name||'Unnamed supplier',subtitle:[supplier.contact,supplier.email,supplier.phone].filter(Boolean).join(' · '),keywords:[supplier.website,supplier.notes,(supplier.products||[]).map(id=>(state.products||[]).find(item=>item.id===id)?.name)].flat(2).filter(Boolean).join(' '),icon:'supplier',page:'suppliers',priority:17,action:()=>masterSearchAfterPage('suppliers',()=>openSupplierView(supplier.id))}));

  if(can('settings')){
    (state.rooms||[]).filter(item=>!item.archived).forEach(room=>add({id:`room:${room.id}`,group:'Rooms',title:room.name||'Unnamed room',subtitle:'Floor Plan room',keywords:[room.categoryNames,room.categories,(room.productIds||[]).map(id=>(state.products||[]).find(item=>item.id===id)?.name)].flat(2).filter(Boolean).join(' '),icon:'room',page:'settings',priority:16,action:()=>masterSearchAfterPage('settings',()=>{setSettingsSection('floor-plan');requestAnimationFrame(()=>openFloorPlanRoomEditor(room.id));})}));
    Object.entries(state.inventoryCategories||{}).forEach(([name,subcategories])=>add({id:`category:${name}`,group:'Categories',title:name,subtitle:`${subcategories.length} subcategor${subcategories.length===1?'y':'ies'}`,keywords:subcategories.join(' '),icon:'category',page:'settings',priority:15,action:()=>masterSearchAfterPage('settings',()=>{setSettingsSection('categories');requestAnimationFrame(()=>openInventoryCategoryEditor(name));})}));
    (state.departments||[]).filter(item=>!item.archived).forEach(department=>add({id:`department:${department.id}`,group:'Departments',title:department.name||'Unnamed department',subtitle:'Department settings',keywords:[department.description,department.type].filter(Boolean).join(' '),icon:'department',page:'settings',priority:13,action:()=>masterSearchAfterPage('settings',()=>{setSettingsSection('departments');if(typeof selectDepartmentSettings==='function')requestAnimationFrame(()=>selectDepartmentSettings(department.id));})}));
    (state.menus||[]).filter(item=>!item.archived).forEach(menu=>add({id:`menu:${menu.id}`,group:'Menus',title:menu.name||'Unnamed menu',subtitle:`${(menu.items||[]).length} menu items`,keywords:[menu.description,menu.sourceFile,(menu.items||[]).map(item=>item.name)].flat(2).filter(Boolean).join(' '),icon:'menu',page:'settings',priority:13,action:()=>masterSearchAfterPage('settings',()=>{setSettingsSection('product-menus');setSettingsMenuDepartment(menu.departmentId);if(typeof selectSettingsMenu==='function')requestAnimationFrame(()=>selectSettingsMenu(menu.id));})}));
    if(typeof profileCanManageProfiles!=='function'||profileCanManageProfiles())(state.profiles||[]).filter(item=>!item.archived).forEach(profile=>add({id:`profile:${profile.id}`,group:'People',title:profile.name||profile.email||'Unnamed user',subtitle:[profile.role,profile.email].filter(Boolean).join(' · '),keywords:[profile.position,profile.status].filter(Boolean).join(' '),icon:'people',page:'settings',priority:12,action:()=>masterSearchAfterPage('settings',()=>setSettingsSection('profiles'))}));
  }
  return records;
}

function masterSearchRecentIds(){
  try{return JSON.parse(localStorage.getItem(MASTER_SEARCH_RECENTS_KEY)||'[]').filter(item=>typeof item==='string').slice(0,8);}catch(error){return[];}
}

function rememberMasterSearchResult(id){
  try{localStorage.setItem(MASTER_SEARCH_RECENTS_KEY,JSON.stringify([id,...masterSearchRecentIds().filter(item=>item!==id)].slice(0,8)));}catch(error){}
}

function masterSearchIconMarkup(type){
  const paths={
    page:'<path d="M5 4h14v16H5z"/><path d="M9 8h6M9 12h6M9 16h4"/>',plus:'<path d="M12 5v14M5 12h14"/>',upload:'<path d="M12 16V4m0 0L7 9m5-5 5 5"/><path d="M5 14v6h14v-6"/>',product:'<path d="m4 7 8-4 8 4-8 4-8-4Z"/><path d="m4 7 8 4 8-4M4 7v10l8 4 8-4V7"/>',count:'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 9h6M9 13h6M9 17h4"/>',usage:'<path d="M3 19h18M5 16l4-5 4 3 6-8"/>',order:'<path d="M3 5h18l-2 12H5L3 5Z"/><path d="M8 9h8M8 13h6"/>',supplier:'<path d="M3 21V8l6 3V8l6 3V4h6v17H3Z"/>',room:'<path d="M4 20V5l8-2v17M4 20h16M16 8h4v12"/>',category:'<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/>',department:'<path d="M4 20V5h10v15M14 10h6v10M8 9h2M8 13h2M8 17h2M17 14h1M17 17h1"/>',menu:'<path d="M6 4h12M6 9h12M6 14h8M6 19h8"/>',people:'<circle cx="9" cy="8" r="3"/><path d="M3 20c0-4 2-6 6-6s6 2 6 6M16 6a3 3 0 0 1 0 6M18 14c2 .5 3 2.5 3 5"/>',settings:'<path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6"/>'
  };
  return`<svg viewBox="0 0 24 24" aria-hidden="true">${paths[type]||paths.page}</svg>`;
}

function renderMasterSearch(){
  const input=document.getElementById('master-search-input');
  const results=document.getElementById('master-search-results');
  const status=document.getElementById('master-search-status');
  if(!input||!results||!status)return;
  const query=input.value.trim();
  const index=buildMasterSearchIndex();
  if(query){
    masterSearchMatches=index.map(record=>({...record,score:masterSearchScore(record,query)})).filter(record=>Number.isFinite(record.score)).sort((a,b)=>b.score-a.score||MASTER_SEARCH_GROUP_ORDER.indexOf(a.group)-MASTER_SEARCH_GROUP_ORDER.indexOf(b.group)||a.title.localeCompare(b.title)).slice(0,40);
  }else{
    const byId=new Map(index.map(record=>[record.id,record]));
    const recent=masterSearchRecentIds().map(id=>byId.get(id)).filter(Boolean).map(record=>({...record,group:'Recent'}));
    const suggested=index.filter(record=>record.suggest>0).sort((a,b)=>b.suggest-a.suggest).slice(0,recent.length?8:12);
    masterSearchMatches=[...recent,...suggested.filter(record=>!recent.some(item=>item.id===record.id))];
  }
  masterSearchActiveIndex=masterSearchMatches.length?0:-1;
  document.getElementById('master-search-clear').hidden=!query;
  status.textContent=query?`${masterSearchMatches.length} result${masterSearchMatches.length===1?'':'s'} for “${query}”`:(masterSearchMatches.some(item=>item.group==='Recent')?'Recent and suggested':'Suggested destinations and actions');
  if(!masterSearchMatches.length){
    results.innerHTML=`<div class="master-search-empty"><span>${masterSearchIconMarkup('page')}</span><strong>No results for “${escapeHtml(query)}”</strong><small>Try a product name, count label, supplier, page, or action such as “new order”.</small></div>`;
    input.removeAttribute('aria-activedescendant');return;
  }
  const groups=[];
  masterSearchMatches.forEach(record=>{
    let group=groups.find(item=>item.name===record.group);
    if(!group){group={name:record.group,items:[]};groups.push(group);}
    group.items.push(record);
  });
  // Keep the keyboard order identical to the visual grouped order.
  masterSearchMatches=groups.flatMap(group=>group.items);
  results.innerHTML=groups.map(group=>`<section class="master-search-group" aria-label="${escapeHtml(group.name)}"><h3>${escapeHtml(group.name)}</h3>${group.items.map(record=>{const index=masterSearchMatches.indexOf(record);return`<button class="master-search-result ${index===masterSearchActiveIndex?'active':''}" id="master-search-result-${index}" type="button" role="option" aria-selected="${index===masterSearchActiveIndex}" data-master-search-index="${index}"><span class="master-search-result-icon">${masterSearchIconMarkup(record.icon)}</span><span class="master-search-result-copy"><strong>${escapeHtml(record.title)}</strong><small>${escapeHtml(record.subtitle||record.group)}</small></span><span class="master-search-result-type">${escapeHtml(record.group)}</span><span class="master-search-result-open" aria-hidden="true">↵</span></button>`;}).join('')}</section>`).join('');
  input.setAttribute('aria-activedescendant','master-search-result-0');
}

function setMasterSearchActive(index,scroll=true){
  if(!masterSearchMatches.length){masterSearchActiveIndex=-1;return;}
  masterSearchActiveIndex=(index+masterSearchMatches.length)%masterSearchMatches.length;
  document.querySelectorAll('.master-search-result').forEach(item=>{const active=Number(item.dataset.masterSearchIndex)===masterSearchActiveIndex;item.classList.toggle('active',active);item.setAttribute('aria-selected',String(active));});
  const active=document.getElementById(`master-search-result-${masterSearchActiveIndex}`);
  document.getElementById('master-search-input')?.setAttribute('aria-activedescendant',active?.id||'');
  if(scroll)active?.scrollIntoView({block:'nearest'});
}

function runMasterSearchResult(index=masterSearchActiveIndex){
  const record=masterSearchMatches[index];if(!record)return;
  rememberMasterSearchResult(record.id);
  closeMasterSearch();
  record.action?.();
}

function openMasterSearch(trigger=null){
  const overlay=document.getElementById('master-search-overlay');
  const input=document.getElementById('master-search-input');
  if(!overlay||!input)return;
  masterSearchReturnFocus=trigger||document.activeElement;
  closeAllMenus?.();closeMobileNavMenus?.();
  overlay.classList.add('open');overlay.setAttribute('aria-hidden','false');
  input.setAttribute('aria-expanded','true');input.value='';
  renderMasterSearch();syncBlockingUiState?.();
  requestAnimationFrame(()=>input.focus());
}

function closeMasterSearch(){
  const overlay=document.getElementById('master-search-overlay');
  const input=document.getElementById('master-search-input');
  if(!overlay?.classList.contains('open'))return;
  overlay.classList.remove('open');overlay.setAttribute('aria-hidden','true');
  input?.setAttribute('aria-expanded','false');input?.removeAttribute('aria-activedescendant');
  syncBlockingUiState?.();
  const focusTarget=masterSearchReturnFocus;masterSearchReturnFocus=null;
  if(focusTarget?.isConnected)requestAnimationFrame(()=>focusTarget.focus());
}

function initMasterSearch(){
  const overlay=document.getElementById('master-search-overlay');
  const dialog=overlay?.querySelector('.master-search-dialog');
  const input=document.getElementById('master-search-input');
  const results=document.getElementById('master-search-results');
  if(!overlay||!dialog||!input||!results||overlay.dataset.bound)return;
  overlay.dataset.bound='true';
  overlay.addEventListener('mousedown',event=>{if(event.target===overlay)closeMasterSearch();});
  dialog.addEventListener('mousedown',event=>event.stopPropagation());
  input.addEventListener('input',renderMasterSearch);
  input.addEventListener('keydown',event=>{
    if(event.key==='ArrowDown'){event.preventDefault();setMasterSearchActive(masterSearchActiveIndex+1);}
    else if(event.key==='ArrowUp'){event.preventDefault();setMasterSearchActive(masterSearchActiveIndex-1);}
    else if(event.key==='Enter'){event.preventDefault();runMasterSearchResult();}
    else if(event.key==='Escape'){event.preventDefault();closeMasterSearch();}
  });
  results.addEventListener('mousemove',event=>{const item=event.target.closest('[data-master-search-index]');if(item)setMasterSearchActive(Number(item.dataset.masterSearchIndex),false);});
  results.addEventListener('click',event=>{const item=event.target.closest('[data-master-search-index]');if(item)runMasterSearchResult(Number(item.dataset.masterSearchIndex));});
  document.getElementById('master-search-clear')?.addEventListener('click',()=>{input.value='';renderMasterSearch();input.focus();});
  document.addEventListener('keydown',event=>{
    const shortcut=(event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k';
    if(shortcut){event.preventDefault();overlay.classList.contains('open')?closeMasterSearch():openMasterSearch();return;}
    if(event.key==='Escape'&&overlay.classList.contains('open'))closeMasterSearch();
  });
  window.addEventListener('message',event=>{
    if(event.origin!==window.location.origin||event.data?.type!=='month-end:open-master-search')return;
    if(!overlay.classList.contains('open'))openMasterSearch();
  });
}

document.addEventListener('DOMContentLoaded',initMasterSearch);
