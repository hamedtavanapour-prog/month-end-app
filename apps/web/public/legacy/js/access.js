// Authenticated access bridge supplied by the new application foundation.
(function(){
  let access=null;

  function initials(name){
    return String(name||'User').trim().split(/\s+/).slice(0,2).map(part=>part[0]?.toUpperCase()||'').join('')||'U';
  }

  function allowedPage(page){
    return !access||access.pages?.[page]!==false;
  }

  function applyAccess(){
    if(!access)return;
    const user=access.user||{};
    const baseProfile={
      id:user.id,
      name:user.name||'Team member',
      email:user.email||'',
      role:user.role||'staff',
      status:'active',
      permissions:{pages:Object.keys(access.pages||{}).filter(key=>access.pages[key]),rooms:[]},
      archived:false
    };
    let profile=baseProfile;

    if(access.preferences?.theme&&typeof setTheme==='function')setTheme(access.preferences.theme,false);
    if(typeof setSettingsSidebarCollapsed==='function')setSettingsSidebarCollapsed(Boolean(access.preferences?.settingsSidebarCollapsed),false);
    if(Array.isArray(access.managers)){
      const savedProfiles=state.profiles||[];
      const managerProfiles=access.managers.map(manager=>{
        const saved=savedProfiles.find(item=>item.id===manager.id||item.userId===manager.userId||(item.email&&item.email===manager.email));
        return{...saved,id:manager.id,userId:manager.userId,name:saved?.name||manager.name,email:saved?.email||manager.email,role:manager.role,status:'active',archived:false,serverManaged:true,details:typeof normalizeProfileDetails==='function'?normalizeProfileDetails(saved?.details):saved?.details||{}};
      });
      const localProfiles=(state.profiles||[]).filter(item=>!item.serverManaged&&!managerProfiles.some(manager=>manager.id===item.id||manager.email===item.email));
      state.profiles=[...managerProfiles,...localProfiles];
      const savedCurrent=state.profiles.find(item=>item.userId===user.id||item.id===user.id||(item.email&&item.email===user.email));
      if(savedCurrent)profile={...baseProfile,...savedCurrent,id:user.id,userId:user.id,role:user.role||savedCurrent.role,details:typeof normalizeProfileDetails==='function'?normalizeProfileDetails(savedCurrent.details):savedCurrent.details||{}};
      if(typeof renderSettingsProfiles==='function')renderSettingsProfiles();
      if(typeof renderDepartmentSettings==='function')renderDepartmentSettings();
    }

    window.currentProfile=()=>{
      const saved=(state.profiles||[]).find(item=>item.userId===user.id||item.id===user.id||(item.email&&item.email===user.email));
      return saved?{...profile,...saved,id:user.id,userId:user.id,permissions:profile.permissions,details:typeof normalizeProfileDetails==='function'?normalizeProfileDetails(saved.details):saved.details||{}}:profile;
    };
    window.profileCanAccessPage=(_profile,page)=>allowedPage(page);
    window.profileCanManageProfiles=()=>Boolean(access.canManageUsers);
    window.openCurrentProfileSettings=()=>{closeAllMenus();if(typeof dismissSidebarHoverMenu==='function')dismissSidebarHoverMenu(document.querySelector('.profile-menu-wrap'));showPage('profile',{profileOnly:true});};
    window.logoutProfile=async()=>{
      try{await fetch('/api/sign-out',{method:'POST',credentials:'include'});}catch(e){}
      window.top.location.href='/login';
    };
    window.setCurrentProfile=()=>toast('Each person now signs in with their own account.',true);

    const avatar=document.getElementById('profile-avatar');
    const settingsAvatar=document.getElementById('settings-profile-avatar');
    if(avatar)avatar.textContent=initials(profile.name);
    if(settingsAvatar)settingsAvatar.textContent=initials(profile.name);
    ['profile-name','profile-menu-name','settings-profile-title'].forEach(id=>{
      const element=document.getElementById(id);if(element)element.textContent=profile.name;
    });
    ['profile-role','profile-menu-role'].forEach(id=>{
      const element=document.getElementById(id);if(element)element.textContent=`${profile.role} · ${profile.email}`;
    });

    document.querySelectorAll('.nav-item').forEach(item=>{
      const page=(item.id||'').replace('nav-','');
      if(!page)return;
      const allowed=allowedPage(page);
      item.classList.toggle('access-disabled',!allowed);
      item.style.display=allowed?'flex':'none';
      if(page==='settings')item.closest('.sidebar-settings-wrap').hidden=!allowed;
    });

    document.querySelectorAll('[data-settings-key="profiles"]').forEach(button=>{
      button.textContent='';
      button.innerHTML='<span class="settings-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><path d="M3 20c0-4 2.5-6 6-6s6 2 6 6M16 5a3 3 0 0 1 0 6M17 14c2.6.4 4 2.3 4 5"/></svg></span><span>Users & Access</span>';
      button.onclick=()=>{window.top.location.href='/app/people';};
      button.style.display=access.canManageUsers?'flex':'none';
    });
    document.querySelectorAll('[data-pos-integrations-link]').forEach(button=>{
      button.hidden=!access.canViewPosIntegrations;
      button.style.display=access.canViewPosIntegrations?'flex':'none';
    });
    const accountButton=document.querySelector('.settings-account');
    if(accountButton)accountButton.onclick=window.openCurrentProfileSettings;
    const myProfileButton=document.getElementById('profile-menu-my-profile');
    if(myProfileButton)myProfileButton.onclick=window.openCurrentProfileSettings;
    const manageUsersButton=document.getElementById('profile-menu-manage-users');
    if(manageUsersButton)manageUsersButton.hidden=!access.canManageUsers;
    if(typeof syncProfileChrome==='function')syncProfileChrome(profile);

    const active=document.querySelector('.page.active')?.id?.replace('page-','');
    if(active&&!allowedPage(active)){
      const first=Object.keys(access.pages||{}).find(page=>access.pages[page])||'dashboard';
      showPage(first);
    }
    if(typeof renderGeneralSettings==='function')renderGeneralSettings();
  }

  async function loadAccess(){
    try{
      const response=await fetch('/api/access-context',{credentials:'include',cache:'no-store'});
      if(response.status===401){window.top.location.href='/login';return;}
      if(!response.ok)return;
      access=await response.json();
      window.serverAccessContext=access;
      applyAccess();
    }catch(error){console.error('Could not load account access.',error);}
  }

  window.recordServerEvent=(event)=>localOnlyMode?Promise.resolve():fetch('/api/audit-events',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(event)}).catch(()=>null);

  window.addEventListener('load',loadAccess);
})();
