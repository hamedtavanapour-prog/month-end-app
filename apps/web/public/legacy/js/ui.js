// ui.js — generic UI: dropdown menus, column pickers, page navigation, modals.
// (Classic script sharing global scope; load order defined in index.html.)

const THEME_STORAGE_KEY='keg_bar_theme_v2';
const APP_THEMES=['slate','graphite','paper','hospitality','hospitality-light'];
const SIDEBAR_STORAGE_KEY='keg_bar_sidebar_collapsed';
const PROFILE_STORAGE_KEY='keg_bar_current_profile';
const APP_ACCESS_OPTIONS=[
  {key:'dashboard',label:'Dashboard'},
  {key:'products',label:'Products'},
  {key:'live-inventory',label:'Live Inventory'},
  {key:'inventory',label:'Counts'},
  {key:'orders',label:'Orders'},
  {key:'usage',label:'Usage'},
  {key:'insights',label:'Insights'},
  {key:'suppliers',label:'Suppliers'},
  {key:'reports',label:'Reports'},
  {key:'settings',label:'Settings'}
];
const MANAGER_DEFAULT_ACCESS=['dashboard','live-inventory','inventory','orders','usage','reports'];

// Number fields are text-entry controls. Scrolling or arrow keys must not adjust values.
document.addEventListener('wheel',event=>{
  const input=event.target?.closest?.('input[type="number"]');
  if(input&&document.activeElement===input)input.blur();
},{capture:true,passive:true});
document.addEventListener('keydown',event=>{
  if((event.key==='ArrowUp'||event.key==='ArrowDown')&&event.target?.matches?.('input[type="number"]'))event.preventDefault();
},true);

function setTheme(theme){
  const nextTheme=APP_THEMES.includes(theme)?theme:'slate';
  document.documentElement.dataset.theme=nextTheme;
  try{localStorage.setItem(THEME_STORAGE_KEY,nextTheme);}catch(e){}
  updateThemeToggle(nextTheme);
}

function updateThemeToggle(theme=document.documentElement.dataset.theme||'slate'){
  document.querySelectorAll('[data-theme-choice]').forEach(card=>{
    const active=card.dataset.themeChoice===theme;
    card.classList.toggle('active',active);
    card.setAttribute('aria-pressed',String(active));
  });
}

function toggleTheme(){
  const current=document.documentElement.dataset.theme||'slate';
  setTheme(current==='graphite'?'slate':'graphite');
}

function initTheme(){
  let saved='slate';
  try{saved=localStorage.getItem(THEME_STORAGE_KEY)||'slate';}catch(e){}
  setTheme(saved);
}

initTheme();

function initSidebar(){
  let collapsed=false;
  try{collapsed=localStorage.getItem(SIDEBAR_STORAGE_KEY)==='true';}catch(e){}
  document.body.classList.toggle('sidebar-collapsed',collapsed);
}
function toggleSidebar(){
  const collapsed=!document.body.classList.contains('sidebar-collapsed');
  document.body.classList.toggle('sidebar-collapsed',collapsed);
  try{localStorage.setItem(SIDEBAR_STORAGE_KEY,String(collapsed));}catch(e){}
}
initSidebar();

function resetFloatingMenuPosition(menu){
  menu.style.removeProperty('top');
  menu.style.removeProperty('right');
  menu.style.removeProperty('bottom');
  menu.style.removeProperty('left');
  menu.style.removeProperty('max-height');
  menu.style.removeProperty('visibility');
}
function closeAllMenus(){
  document.querySelectorAll('.drop-menu,.col-menu,.profile-menu').forEach(menu=>{
    if(typeof menu.hidePopover==='function'&&menu.matches(':popover-open'))menu.hidePopover();
    menu.classList.remove('open');
    resetFloatingMenuPosition(menu);
  });
  syncMobileSheetBackdrop();
}
function syncMobileSheetBackdrop(){
  const backdrop=document.getElementById('mobile-sheet-backdrop');
  if(!backdrop)return;
  const hasOpenSheet=window.innerWidth<=820&&!!document.querySelector('.drop-menu.open,.col-menu.open,.product-filter-sheet.open,.inv-filter-sheet.open');
  backdrop.classList.toggle('open',hasOpenSheet);
  backdrop.setAttribute('aria-hidden',String(!hasOpenSheet));
}
function closeMobileSheets(){
  closeAllMenus();
  if(typeof closeProductFilterSheet==='function')closeProductFilterSheet();
  else document.getElementById('product-filter-sheet')?.classList.remove('open');
  if(typeof closeInventoryFilterSheet==='function')closeInventoryFilterSheet();
  else document.getElementById('inv-filter-sheet')?.classList.remove('open');
  syncMobileSheetBackdrop();
}
function activateFilePicker(event,inputId){
  if(event.key!=='Enter'&&event.key!==' ')return;
  event.preventDefault();
  document.getElementById(inputId)?.click();
}
function positionFloatingMenu(menu,trigger){
  if(window.innerWidth<=820){
    resetFloatingMenuPosition(menu);
    return;
  }
  const gap=6;
  const edge=12;
  const triggerRect=trigger.getBoundingClientRect();
  const menuRect=menu.getBoundingClientRect();
  const roomBelow=window.innerHeight-triggerRect.bottom-gap-edge;
  const roomAbove=triggerRect.top-gap-edge;
  const openUp=menuRect.height>roomBelow&&roomAbove>roomBelow;
  const top=openUp
    ?Math.max(edge,triggerRect.top-gap-menuRect.height)
    :Math.min(triggerRect.bottom+gap,window.innerHeight-menuRect.height-edge);
  const left=Math.min(
    Math.max(edge,triggerRect.right-menuRect.width),
    Math.max(edge,window.innerWidth-menuRect.width-edge)
  );

  menu.style.top=`${top}px`;
  menu.style.right='auto';
  menu.style.bottom='auto';
  menu.style.left=`${left}px`;
  menu.style.maxHeight=`${window.innerHeight-edge*2}px`;
  menu.style.visibility='visible';
}
function toggleMenu(id){
  const menu=document.getElementById(id);
  if(!menu)return;
  const wasOpen=menu.classList.contains('open');
  closeAllMenus();
  if(wasOpen)return;

  const trigger=(document.activeElement instanceof HTMLElement&&document.activeElement.closest('.drop-wrap,.col-wrap'))
    ?document.activeElement
    :menu.closest('.drop-wrap,.col-wrap')?.querySelector('button');
  menu.classList.add('open');
  syncMobileSheetBackdrop();

  if(trigger&&menu.matches('.drop-menu,.col-menu')&&typeof menu.showPopover==='function'){
    menu.setAttribute('popover','manual');
    menu.style.visibility='hidden';
    menu.showPopover();
    positionFloatingMenu(menu,trigger);
  }
}
function toggleProfileMenu(){toggleMenu('profile-menu');}
function openCurrentProfileSettings(){
  closeAllMenus();
  showPage('settings',{profileOnly:true});
  setSettingsSection('profiles');
}

function profileInitials(profile){
  const name=String(profile?.name||'Manager').trim();
  return name.split(/\s+/).slice(0,2).map(part=>part[0]?.toUpperCase()||'').join('')||'M';
}
function defaultProfilePermissions(){
  return{pages:APP_ACCESS_OPTIONS.map(item=>item.key),rooms:[]};
}
function normalizeProfilePermissions(profile){
  const permissions=profile.permissions&&typeof profile.permissions==='object'?profile.permissions:{};
  const pageSet=new Set(APP_ACCESS_OPTIONS.map(item=>item.key));
  const pages=Array.isArray(permissions.pages)?permissions.pages.filter(page=>pageSet.has(page)):defaultProfilePermissions().pages;
  const activeRoomIds=new Set(typeof activeFloorPlanRooms==='function'?activeFloorPlanRooms().map(room=>room.id):[]);
  const rooms=Array.isArray(permissions.rooms)?permissions.rooms.filter(roomId=>activeRoomIds.has(roomId)):[];
  return{pages,rooms};
}
function profileInviteUrl(profile){
  const origin=location.origin||'';
  return`${origin}${location.pathname}?invite=${encodeURIComponent(profile.inviteToken||profile.id)}`;
}
function normalizeProfiles(){
  if(!Array.isArray(state.profiles))state.profiles=[];
  let changed=false;
  state.profiles=state.profiles.map((profile,index)=>{
    const status=profile.status||'active';
    const normalized={
      id:profile.id||uid(),
      name:String(profile.name||`Manager ${index+1}`).trim()||`Manager ${index+1}`,
      email:String(profile.email||'').trim().toLowerCase(),
      role:String(profile.role||'Manager').trim()||'Manager',
      status:['active','invited','disabled'].includes(status)?status:'active',
      inviteToken:profile.inviteToken||uid(),
      invitedAt:profile.invitedAt||'',
      acceptedAt:profile.acceptedAt||'',
      permissions:normalizeProfilePermissions(profile),
      archived:!!profile.archived
    };
    if(JSON.stringify(profile)!==JSON.stringify(normalized))changed=true;
    return normalized;
  });
  if(!state.profiles.length){
    state.profiles=[{id:uid(),name:'Manager',email:'',role:'Bar Manager',status:'active',inviteToken:uid(),invitedAt:'',acceptedAt:new Date().toISOString(),permissions:defaultProfilePermissions(),archived:false}];
    changed=true;
  }
  try{currentProfileId=localStorage.getItem(PROFILE_STORAGE_KEY)||currentProfileId;}catch(e){}
  if(!state.profiles.some(profile=>profile.id===currentProfileId&&!profile.archived)){
    currentProfileId=state.profiles.find(profile=>!profile.archived)?.id||state.profiles[0].id;
    try{localStorage.setItem(PROFILE_STORAGE_KEY,currentProfileId);}catch(e){}
  }
  return changed;
}
function currentProfile(){
  normalizeProfiles();
  return state.profiles.find(profile=>profile.id===currentProfileId)||state.profiles.find(profile=>!profile.archived)||state.profiles[0];
}
function profileCanManageProfiles(profile=currentProfile()){
  normalizeProfiles();
  if(!profile)return false;
  const role=String(profile.role||'').toLowerCase();
  const firstActive=state.profiles.find(item=>!item.archived);
  return role==='owner'||role==='bar manager'||profile.id===firstActive?.id;
}
function setCurrentProfile(profileId){
  if(profileId!==currentProfileId&&!profileCanManageProfiles()){toast('You can only view your own profile.',true);return;}
  const profile=state.profiles.find(item=>item.id===profileId&&!item.archived);
  if(!profile)return;
  currentProfileId=profile.id;
  try{localStorage.setItem(PROFILE_STORAGE_KEY,currentProfileId);}catch(e){}
  renderProfileMenu();
  renderSettings();
  closeAllMenus();
  toast(`Switched to ${profile.name}.`);
}
function logoutProfile(){
  const profile=currentProfile();
  try{localStorage.removeItem(PROFILE_STORAGE_KEY);}catch(e){}
  currentProfileId=state.profiles.find(item=>!item.archived&&item.id!==profile?.id)?.id||state.profiles.find(item=>!item.archived)?.id||null;
  if(currentProfileId)try{localStorage.setItem(PROFILE_STORAGE_KEY,currentProfileId);}catch(e){}
  renderProfileMenu();
  renderSettings();
  closeAllMenus();
  toast('Logged out.');
}
function selectedInviteRooms(){
  return[...document.querySelectorAll('#settings-profile-room-access input:checked')].map(input=>input.value);
}
function selectedInvitePages(){
  return[...document.querySelectorAll('#settings-profile-page-access input:checked')].map(input=>input.value);
}
function selectInviteRooms(scope){
  document.querySelectorAll('#settings-profile-room-access input').forEach(input=>{input.checked=scope==='all';});
}
function selectInvitePages(scope){
  const defaults=new Set(scope==='manager'?MANAGER_DEFAULT_ACCESS:APP_ACCESS_OPTIONS.map(item=>item.key));
  document.querySelectorAll('#settings-profile-page-access input').forEach(input=>{input.checked=defaults.has(input.value);});
}
function inviteEmailBody(profile){
  const rooms=profile.permissions.rooms.length
    ? activeFloorPlanRooms().filter(room=>profile.permissions.rooms.includes(room.id)).map(room=>room.name).join(', ')
    : 'All rooms';
  const pages=profile.permissions.pages.map(page=>APP_ACCESS_OPTIONS.find(item=>item.key===page)?.label||page).join(', ');
  return[
    `Hi ${profile.name},`,
    '',
    'You have been invited to Keg Bar Inventory for this restaurant.',
    '',
    `Role: ${profile.role}`,
    `Room access: ${rooms}`,
    `App access: ${pages}`,
    '',
    `Accept invite: ${profileInviteUrl(profile)}`,
    '',
    'After auth is enabled, you will create your own password and use your email to log in.'
  ].join('\n');
}
async function sendProfileInvite(profile){
  const payload={to:profile.email,name:profile.name,role:profile.role,inviteUrl:profileInviteUrl(profile),body:inviteEmailBody(profile)};
  try{
    const response=await fetch('/api/invite-manager',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const data=await response.json().catch(()=>({}));
    if(response.ok&&data.sent)return true;
  }catch(e){}
  const subject=encodeURIComponent('Invitation to Keg Bar Inventory');
  const body=encodeURIComponent(payload.body);
  window.location.href=`mailto:${encodeURIComponent(profile.email)}?subject=${subject}&body=${body}`;
  return false;
}
async function inviteProfile(){
  if(!profileCanManageProfiles()){toast('Only owners and bar managers can invite managers.',true);return;}
  const name=(document.getElementById('settings-profile-name')?.value||'').trim();
  const email=(document.getElementById('settings-profile-email')?.value||'').trim().toLowerCase();
  const role=(document.getElementById('settings-profile-role')?.value||'').trim()||'Assistant Manager';
  if(!name){toast('Enter a profile name.',true);return;}
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){toast('Enter a valid email.',true);return;}
  if(!selectedInvitePages().length){toast('Select at least one page this manager can access.',true);return;}
  normalizeProfiles();
  if(state.profiles.some(profile=>!profile.archived&&profile.email&&profile.email===email)){toast('A manager with that email already exists.',true);return;}
  const profile={id:uid(),name,email,role,status:'invited',inviteToken:uid(),invitedAt:new Date().toISOString(),acceptedAt:'',permissions:{rooms:selectedInviteRooms(),pages:selectedInvitePages()},archived:false};
  state.profiles.push(profile);
  document.getElementById('settings-profile-name').value='';
  document.getElementById('settings-profile-email').value='';
  save();
  renderSettings();
  renderProfileMenu();
  const sent=await sendProfileInvite(profile);
  toast(sent?'Invitation email sent.':'Invite saved. Your email app is ready to send it.');
}
async function resendProfileInvite(profileId){
  if(!profileCanManageProfiles()){toast('Only owners and bar managers can resend invites.',true);return;}
  const profile=state.profiles.find(item=>item.id===profileId&&!item.archived);
  if(!profile||!profile.email)return;
  profile.status='invited';
  profile.invitedAt=new Date().toISOString();
  profile.inviteToken=profile.inviteToken||uid();
  save();
  renderProfileSettings();
  const sent=await sendProfileInvite(profile);
  toast(sent?'Invitation email sent.':'Invite saved. Your email app is ready to send it.');
}
function handleInviteFromUrl(){
  const params=new URLSearchParams(location.search);
  const token=params.get('invite');
  if(!token)return false;
  normalizeProfiles();
  const profile=state.profiles.find(item=>!item.archived&&item.inviteToken===token);
  if(!profile){toast('Invite link not found for this restaurant.',true);return false;}
  profile.status='active';
  profile.acceptedAt=profile.acceptedAt||new Date().toISOString();
  currentProfileId=profile.id;
  try{localStorage.setItem(PROFILE_STORAGE_KEY,currentProfileId);}catch(e){}
  save();
  renderProfileMenu();
  toast(`Signed in as ${profile.name}.`);
  history.replaceState(null,'',location.pathname);
  return true;
}
function archiveProfile(profileId){
  normalizeProfiles();
  if(!profileCanManageProfiles()){toast('Only owners and bar managers can remove profiles.',true);return;}
  if(state.profiles.filter(profile=>!profile.archived).length<=1){toast('Keep at least one profile.',true);return;}
  const profile=state.profiles.find(item=>item.id===profileId);
  if(!profile)return;
  profile.archived=true;
  if(currentProfileId===profileId)currentProfileId=state.profiles.find(item=>!item.archived)?.id||null;
  if(currentProfileId)try{localStorage.setItem(PROFILE_STORAGE_KEY,currentProfileId);}catch(e){}
  save();
  renderSettings();
  renderProfileMenu();
  toast('Profile removed.');
}
function profileCanAccessPage(profile,page){
  if(!profile)return true;
  const permissions=normalizeProfilePermissions(profile);
  return permissions.pages.includes(page);
}
function profileCanAccessRoom(profile,roomId){
  if(!profile)return true;
  const permissions=normalizeProfilePermissions(profile);
  return !permissions.rooms.length||permissions.rooms.includes(roomId);
}
function accessibleFloorPlanRooms(){
  const profile=currentProfile();
  return activeFloorPlanRooms().filter(room=>profileCanAccessRoom(profile,room.id));
}
function renderProfileMenu(){
  const profile=currentProfile();
  const initials=profileInitials(profile);
  const avatar=document.getElementById('profile-avatar');
  if(avatar)avatar.textContent=initials;
  const name=document.getElementById('profile-name');
  if(name)name.textContent=profile?.name||'Manager';
  const role=document.getElementById('profile-role');
  if(role)role.textContent=profile?.email||profile?.role||'Manager';
  const menuName=document.getElementById('profile-menu-name');
  if(menuName)menuName.textContent=profile?.name||'Manager';
  const menuRole=document.getElementById('profile-menu-role');
  if(menuRole)menuRole.textContent=profile?.email||profile?.role||'Manager';
}
function renderProfileInviteControls(){
  const roomWrap=document.getElementById('settings-profile-room-access');
  if(roomWrap)roomWrap.innerHTML=activeFloorPlanRooms().map(room=>`
    <label class="permission-option"><input type="checkbox" value="${room.id}" checked><span>${escapeHtml(room.name)}</span></label>
  `).join('')||'<div class="empty-cell">No rooms defined.</div>';
  const pageWrap=document.getElementById('settings-profile-page-access');
  if(pageWrap)pageWrap.innerHTML=APP_ACCESS_OPTIONS.map(item=>`
    <label class="permission-option"><input type="checkbox" value="${item.key}" ${MANAGER_DEFAULT_ACCESS.includes(item.key)?'checked':''}><span>${escapeHtml(item.label)}</span></label>
  `).join('');
}
function renderProfileSettings(){
  const list=document.getElementById('settings-profile-list');
  if(!list)return;
  normalizeProfiles();
  const canManage=profileCanManageProfiles();
  const profile=currentProfile();
  const inviteForm=document.querySelector('.invite-form');
  if(inviteForm)inviteForm.style.display=canManage?'grid':'none';
  renderProfileInviteControls();
  const visibleProfiles=canManage?state.profiles.filter(item=>!item.archived):state.profiles.filter(item=>!item.archived&&item.id===profile?.id);
  list.innerHTML=(canManage?'':`<div class="settings-note">Your account can view its own profile and assigned access. Team management is limited to owners and bar managers.</div>`)+visibleProfiles.map(profile=>`
    <div class="settings-list-row">
      <div class="profile-access-row">
        <div class="profile-row-main"><span class="profile-avatar small">${profileInitials(profile)}</span><div><strong>${escapeHtml(profile.name)}</strong><small>${escapeHtml(profile.email||'No email')} · ${escapeHtml(profile.role)}</small></div></div>
        <div class="settings-row-actions">
          <span class="${profile.status==='active'?'filled-pill':'missing-pill'}">${profile.status==='active'?'Active':'Invited'}</span>
          ${profile.id===currentProfileId?'<span class="filled-pill">Current</span>':canManage?`<button class="btn btn-secondary btn-sm" type="button" onclick="setCurrentProfile('${profile.id}')">Switch</button>`:''}
          ${canManage&&profile.email?`<button class="btn btn-secondary btn-sm" type="button" onclick="resendProfileInvite('${profile.id}')">Resend Invite</button>`:''}
          ${canManage?`<button class="btn btn-ghost-danger btn-sm" type="button" onclick="archiveProfile('${profile.id}')">Remove</button>`:''}
        </div>
      </div>
      <div class="profile-permission-summary">
        <span>Rooms: ${profile.permissions.rooms.length?activeFloorPlanRooms().filter(room=>profile.permissions.rooms.includes(room.id)).map(room=>escapeHtml(room.name)).join(', '):'All rooms'}</span>
        <span>Access: ${profile.permissions.pages.map(page=>escapeHtml(APP_ACCESS_OPTIONS.find(item=>item.key===page)?.label||page)).join(', ')}</span>
      </div>
    </div>
  `).join('');
}
function setSettingsSection(section){
  const app=document.getElementById('settings-app');
  if(!section){
    if(app)app.classList.remove('detail-open');
    return;
  }
  if(section!=='profiles'&&!profileCanAccessPage(currentProfile(),'settings')){
    toast('You can only view your own profile.',true);
    section='profiles';
  }
  activeSettingsSection=section;
  document.querySelectorAll('.settings-nav-item').forEach(item=>item.classList.toggle('active',item.dataset.settingsKey===section));
  document.querySelectorAll('.settings-pane').forEach(pane=>pane.classList.toggle('active',pane.dataset.settingsPane===section));
  if(app)app.classList.add('detail-open');
  renderSettings();
}
function filterSettingsNav(){
  const query=(document.getElementById('settings-search')?.value||'').trim().toLowerCase();
  document.querySelectorAll('.settings-nav-item').forEach(item=>{
    item.style.display=!query||item.textContent.toLowerCase().includes(query)?'flex':'none';
  });
}
function renderSettings(){
  if(!activeSettingsSection)activeSettingsSection='general';
  if(activeSettingsSection!=='profiles'&&!profileCanAccessPage(currentProfile(),'settings'))activeSettingsSection='profiles';
  if(!document.querySelector(`.settings-pane[data-settings-pane="${activeSettingsSection}"]`))activeSettingsSection='general';
  const canUseSettings=profileCanAccessPage(currentProfile(),'settings');
  document.querySelectorAll('.settings-nav-item').forEach(item=>{
    item.classList.toggle('active',item.dataset.settingsKey===activeSettingsSection);
    item.style.display=canUseSettings||item.dataset.settingsKey==='profiles'?'flex':'none';
  });
  document.querySelectorAll('.settings-pane').forEach(pane=>pane.classList.toggle('active',pane.dataset.settingsPane===activeSettingsSection));
  if(window.innerWidth>820)document.getElementById('settings-app')?.classList.add('detail-open');
  if(typeof renderFloorPlanRooms==='function')renderFloorPlanRooms();
  if(typeof renderDepartmentSettings==='function')renderDepartmentSettings();
  if(typeof renderProductMenuSettings==='function')renderProductMenuSettings();
  renderProfileSettings();
  renderGeneralSettings();
  updateThemeToggle();
  const profile=currentProfile();
  const avatar=document.getElementById('settings-profile-avatar');
  if(avatar)avatar.textContent=profileInitials(profile);
  const title=document.getElementById('settings-profile-title');
  if(title)title.textContent=profile?.name||'Manager';
}

function renderGeneralSettings(){
  const setText=(id,value)=>{const element=document.getElementById(id);if(element)element.textContent=String(value);};
  const profile=currentProfile();
  const organization=window.serverAccessContext?.organization;
  const activeUsers=(state.profiles||[]).filter(item=>!item.archived).length;
  const departments=typeof activeDepartments==='function'?activeDepartments().length:(state.departments||[]).filter(item=>!item.archived).length;
  const rooms=typeof activeFloorPlanRooms==='function'?activeFloorPlanRooms().length:(state.rooms||[]).filter(item=>!item.archived).length;
  const products=(state.products||[]).filter(item=>!item.archived).length;
  const counts=(state.inventories||[]).filter(item=>!item.archived).length;
  const version=document.querySelector('meta[name="app-version"]')?.content||'1.0.0';
  setText('general-organization-name',organization?.name||'Month\'s End');
  setText('general-workspace-summary',`${departments} department${departments===1?'':'s'} · ${rooms} counting room${rooms===1?'':'s'}`);
  setText('general-user-count',activeUsers||1);
  setText('general-department-count',departments);
  setText('general-room-count',rooms);
  setText('general-product-count',products);
  setText('general-current-user',profile?.name||'Workspace member');
  setText('general-current-role',profile?.role||'Workspace member');
  setText('general-count-total',counts);
  setText('general-app-version',version);
  const status=document.getElementById('general-sync-status');
  if(status)status.lastChild.textContent=cloudReady?'Cloud connected':'Local fallback';
}

function renderAccessControlledNav(){
  const profile=currentProfile();
  document.querySelectorAll('.nav-item').forEach(item=>{
    const page=(item.id||'').replace('nav-','');
    if(!page)return;
    const allowed=profileCanAccessPage(profile,page);
    item.classList.toggle('access-disabled',!allowed);
    item.title=allowed?'':'You do not have access to this area.';
  });
  document.querySelectorAll('[data-mobile-page]').forEach(item=>{
    const allowed=profileCanAccessPage(profile,item.dataset.mobilePage);
    item.disabled=!allowed;
    item.title=allowed?'':'You do not have access to this area.';
  });
  const actionAllowed=MOBILE_ACTION_PAGES.some(page=>profileCanAccessPage(profile,page));
  const moreAllowed=MOBILE_MORE_PAGES.some(page=>profileCanAccessPage(profile,page));
  const actionButton=document.getElementById('mobile-nav-actions');
  const moreButton=document.getElementById('mobile-nav-more');
  if(actionButton)actionButton.disabled=!actionAllowed;
  if(moreButton)moreButton.disabled=!moreAllowed;
}

function buildColPicker(containerId,cols,renderFnName){
  const el=document.getElementById(containerId);if(!el)return;
  el.innerHTML=cols.filter(c=>!c.fixed).map(c=>{
    const label=renderFnName==='renderProducts'&&typeof productColumnLabel==='function'?productColumnLabel(c):(c.label||c.key);
    return`<label class="col-item"><input type="checkbox" ${c.visible?'checked':''} data-col-key="${c.key}" data-render="${renderFnName}" onchange="onColToggle(this)">${label}</label>`;
  }).join('');
}
function onColToggle(cb){
  const key=cb.dataset.colKey;
  const columnSets={renderProducts:PROD_COLS,renderInventoryTable:INV_COLS,renderOrders:ORD_COLS,renderSuppliers:SUP_COLS};
  const cols=columnSets[cb.dataset.render]||[];
  const c=cols.find(x=>x.key===key);
  if(c)c.visible=cb.checked;
  ({renderProducts,renderInventoryTable,renderOrders,renderSuppliers}[cb.dataset.render])();
}

function refreshLiveInventoryIfVisible(){
  if(document.getElementById('page-live-inventory')?.classList.contains('active'))renderLiveInventoryPage();
}

const MOBILE_ACTION_PAGES=['inventory','orders','usage','reports'];
const MOBILE_MORE_PAGES=['products','insights','suppliers','settings'];

function closeMobileNavMenus(){
  document.querySelectorAll('.mobile-nav-popover.open').forEach(menu=>menu.classList.remove('open'));
  ['actions','more'].forEach(group=>document.getElementById(`mobile-nav-${group}`)?.setAttribute('aria-expanded','false'));
}

function toggleMobileNavMenu(group,event){
  event?.stopPropagation();
  const menu=document.getElementById(`mobile-${group}-menu`);
  const trigger=document.getElementById(`mobile-nav-${group}`);
  if(!menu||!trigger)return;
  const shouldOpen=!menu.classList.contains('open');
  closeMobileNavMenus();
  if(shouldOpen){menu.classList.add('open');trigger.setAttribute('aria-expanded','true');}
}

function mobileNavigate(page){
  closeMobileNavMenus();
  showPage(page);
}

function mobileNavGroupForPage(page){
  if(page==='dashboard')return'home';
  if(page==='live-inventory')return'live';
  if(MOBILE_ACTION_PAGES.includes(page))return'actions';
  if(MOBILE_MORE_PAGES.includes(page))return'more';
  return'home';
}

function resetMobileNavTrigger(group){
  const trigger=document.getElementById(`mobile-nav-${group}`);if(!trigger)return;
  if(!trigger.dataset.defaultIcon)trigger.dataset.defaultIcon=trigger.querySelector('.mobile-nav-icon')?.innerHTML||'';
  const defaults={actions:'Actions',more:'More'};
  const icon=trigger.querySelector('.mobile-nav-icon');const label=trigger.querySelector(':scope > span:last-child');
  if(icon)icon.innerHTML=trigger.dataset.defaultIcon;
  if(label)label.textContent=defaults[group];
}
function setMobileNavTriggerPage(group,page){
  const trigger=document.getElementById(`mobile-nav-${group}`);
  const source=document.querySelector(`#mobile-${group}-menu [data-mobile-page="${page}"]`);
  if(!trigger||!source)return;
  const icon=trigger.querySelector('.mobile-nav-icon');const label=trigger.querySelector(':scope > span:last-child');
  if(icon)icon.innerHTML=source.querySelector(':scope > span:first-child')?.innerHTML||icon.innerHTML;
  if(label)label.textContent=source.querySelector('strong')?.textContent||label.textContent;
}

function updateMobileNavigation(page){
  const group=mobileNavGroupForPage(page);
  resetMobileNavTrigger('actions');resetMobileNavTrigger('more');
  if(group==='actions'||group==='more')setMobileNavTriggerPage(group,page);
  document.querySelectorAll('.mobile-nav-item').forEach(item=>{
    const active=item.id===`mobile-nav-${group}`;
    item.classList.toggle('active',active);
    if(active)item.setAttribute('aria-current','page');else item.removeAttribute('aria-current');
  });
  document.querySelectorAll('.mobile-nav-popover [data-mobile-page]').forEach(item=>item.classList.toggle('active',item.dataset.mobilePage===page));
}

function updateMobileNavOverflow(){
  const sidebar=document.querySelector('.sidebar');if(!sidebar)return;
  if(window.innerWidth>820){sidebar.classList.remove('has-overflow-left','has-overflow-right');return;}
  const maxScroll=Math.max(sidebar.scrollWidth-sidebar.clientWidth,0);
  sidebar.classList.toggle('has-overflow-left',sidebar.scrollLeft>4);
  sidebar.classList.toggle('has-overflow-right',sidebar.scrollLeft<maxScroll-4);
}
function revealActiveMobileNav(item){
  if(!item)return;
  updateMobileNavigation(item.id.replace('nav-',''));
}
function initMobileNavigation(){
  const activePage=document.querySelector('.page.active')?.id?.replace('page-','')||'dashboard';
  updateMobileNavigation(activePage);
  const nav=document.querySelector('.mobile-nav');
  if(nav&&!nav.dataset.navigationBound){
    nav.dataset.navigationBound='true';
    nav.addEventListener('click',event=>{
      const control=event.target.closest('button');
      if(!control||control.disabled)return;
      if(control.dataset.mobilePage){mobileNavigate(control.dataset.mobilePage);return;}
      if(control.id==='mobile-nav-actions')toggleMobileNavMenu('actions',event);
      else if(control.id==='mobile-nav-more')toggleMobileNavMenu('more',event);
    });
  }
  window.addEventListener('resize',()=>{if(window.innerWidth>820)closeMobileNavMenus();});
}

function recoverMobileNavTap(event){
  if(window.innerWidth>820||document.querySelector('.modal-overlay.open')||event.target.closest('.mobile-nav'))return;
  const nav=document.querySelector('.mobile-nav');
  if(!nav)return;
  const bounds=nav.getBoundingClientRect();
  if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)return;
  const destinations=['mobile-nav-home','mobile-nav-actions','mobile-nav-live','mobile-nav-more'];
  const column=Math.max(0,Math.min(3,Math.floor((event.clientX-bounds.left)/(bounds.width/4))));
  const destination=document.getElementById(destinations[column]);
  if(!destination||destination.disabled)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  destination.click();
}

function showPage(name,options={}){
  const profile=currentProfile();
  const profileOnlySettings=options.profileOnly&&name==='settings';
  if(!profileOnlySettings&&!profileCanAccessPage(profile,name)){
    toast('You do not have access to that area.',true);
    name=profile.permissions.pages[0]||'dashboard';
  }
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>{n.classList.remove('active');n.removeAttribute('aria-current');});
  document.getElementById('page-'+name).classList.add('active');
  const activeNav=document.getElementById('nav-'+name);
  activeNav.classList.add('active');
  activeNav.setAttribute('aria-current','page');
  revealActiveMobileNav(activeNav);
  renderAccessControlledNav();
  pendingEdits={};selectedProds.clear();
  if(name==='products'){buildColPicker('prod-col-checks',PROD_COLS,'renderProducts');renderProducts();}
  else if(name==='live-inventory')renderLiveInventoryPage();
  else if(name==='inventory'){buildColPicker('inv-col-checks',INV_COLS,'renderInventoryTable');renderInventoryTable();}
  else if(name==='orders'){buildColPicker('ord-col-checks',ORD_COLS,'renderOrders');renderOrders();}
  else if(name==='usage')renderUsagePage();
  else if(name==='insights')renderInsights();
  else if(name==='suppliers'){buildColPicker('sup-col-checks',SUP_COLS,'renderSuppliers');renderSuppliers();}
  else if(name==='reports'){renderReportHeader();renderReport();populateValueDates();renderValueReport();renderOrdersReport();}
  else if(name==='settings'){
    if(window.innerWidth<=820)document.getElementById('settings-app')?.classList.remove('detail-open');
    renderSettings();
  }
  else if(name==='dashboard')renderDashboard();
  annotateResponsiveTables(document.getElementById('page-'+name));
}

function annotateResponsiveTables(root=document){
  root.querySelectorAll('table').forEach(table=>{
    const headings=Array.from(table.querySelectorAll('thead th')).map(cell=>cell.textContent.trim());
    table.querySelectorAll('tbody tr').forEach(row=>{
      Array.from(row.children).forEach((cell,index)=>{
        if(cell.matches('td')&&!cell.hasAttribute('data-mobile-label'))cell.setAttribute('data-mobile-label',headings[index]||'');
      });
    });
  });
}

function closeModal(id){
  if(typeof beforeModalClose==='function'&&beforeModalClose(id)===false)return;
  if(id==='modal-inventory-template-upload'&&typeof resetInventoryTemplatePreview==='function')resetInventoryTemplatePreview();
  const modal=document.getElementById(id);
  modal.classList.remove('open');
  modal.style.zIndex='';
}
function openModal(id){
  const modal=document.getElementById(id);
  const openModals=[...document.querySelectorAll('.modal-overlay.open')];
  const topZ=openModals.reduce((max,item)=>Math.max(max,parseInt(item.style.zIndex,10)||2500),2500);
  modal.style.zIndex=String(topZ+10);
  modal.classList.add('open');
}
document.querySelectorAll('.modal-overlay').forEach(ov=>ov.addEventListener('click',e=>{if(e.target===ov)closeModal(ov.id);}));
document.addEventListener('click',recoverMobileNavTap,true);
document.addEventListener('click',event=>{
  if(!event.target.closest('.mobile-nav'))closeMobileNavMenus();
});
document.addEventListener('keydown',event=>{if(event.key==='Escape')closeMobileNavMenus();});
window.addEventListener('load',()=>{
  initMobileNavigation();
  annotateResponsiveTables();
});

// PRODUCTS — fixed checkbox logic
