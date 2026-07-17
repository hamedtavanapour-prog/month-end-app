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
    const profile={
      id:user.id,
      name:user.name||'Team member',
      email:user.email||'',
      role:user.role||'staff',
      status:'active',
      permissions:{pages:Object.keys(access.pages||{}).filter(key=>access.pages[key]),rooms:[]},
      archived:false
    };

    window.currentProfile=()=>profile;
    window.profileCanAccessPage=(_profile,page)=>allowedPage(page);
    window.profileCanManageProfiles=()=>Boolean(access.canManageUsers);
    window.openCurrentProfileSettings=()=>{window.top.location.href=access.canManageUsers?'/app/team':'/app';};
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
    });

    document.querySelectorAll('[data-settings-key="profiles"]').forEach(button=>{
      button.textContent='';
      button.innerHTML='<span class="settings-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><path d="M3 20c0-4 2.5-6 6-6s6 2 6 6M16 5a3 3 0 0 1 0 6M17 14c2.6.4 4 2.3 4 5"/></svg></span><span>Users & Access</span>';
      button.onclick=()=>{window.top.location.href='/app/team';};
      button.style.display=access.canManageUsers?'flex':'none';
    });
    const accountButton=document.querySelector('.settings-account');
    if(accountButton)accountButton.onclick=()=>{window.top.location.href=access.canManageUsers?'/app/team':'/app';};
    const menuButtons=document.querySelectorAll('#profile-menu button');
    if(menuButtons[0]){menuButtons[0].textContent=access.canManageUsers?'Manage users & access':'My account';menuButtons[0].onclick=window.openCurrentProfileSettings;}

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

  window.addEventListener('load',loadAccess);
})();
