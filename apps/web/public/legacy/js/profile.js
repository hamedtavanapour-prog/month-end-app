// Personal profile workspace. Profile details live with the existing shared workspace state.
(function(){
  const DETAIL_DEFAULTS={
    preferredName:'',pronouns:'',birthday:'',bio:'',phone:'',addressLine1:'',addressLine2:'',city:'',region:'',postalCode:'',country:'',
    jobTitle:'',departmentId:'',employeeId:'',startDate:'',skills:'',language:'en',timezone:'America/Toronto',dateFormat:'MMM D, YYYY',
    defaultDepartmentId:'',notifyCounts:true,notifyOrders:true,notifySummary:false,avatarDataUrl:''
  };

  function normalizeDetails(details){
    const source=details&&typeof details==='object'?details:{};
    const normalized={...DETAIL_DEFAULTS};
    Object.keys(normalized).forEach(key=>{
      if(typeof normalized[key]==='boolean')normalized[key]=source[key]===undefined?normalized[key]:Boolean(source[key]);
      else normalized[key]=String(source[key]??normalized[key]);
    });
    return normalized;
  }

  function authIdentity(){return window.serverAccessContext?.user||null;}

  function findWorkspaceProfile(){
    const auth=authIdentity();
    const active=typeof currentProfile==='function'?currentProfile():null;
    const profiles=Array.isArray(state.profiles)?state.profiles:[];
    return profiles.find(profile=>profile.id===auth?.id||profile.userId===auth?.id)
      ||profiles.find(profile=>auth?.email&&String(profile.email||'').toLowerCase()===String(auth.email).toLowerCase())
      ||profiles.find(profile=>profile.id===active?.id)
      ||profiles.find(profile=>!profile.archived)
      ||null;
  }

  function editableProfile(){
    const workspaceProfile=findWorkspaceProfile();
    const active=typeof currentProfile==='function'?currentProfile():{};
    const auth=authIdentity()||{};
    return{
      ...(workspaceProfile||{}),
      id:workspaceProfile?.id||active?.id||auth.id||uid(),
      userId:workspaceProfile?.userId||auth.id||active?.userId||'',
      name:workspaceProfile?.name||active?.name||auth.name||'Team member',
      email:workspaceProfile?.email||active?.email||auth.email||'',
      role:workspaceProfile?.role||active?.role||auth.role||'Member',
      status:workspaceProfile?.status||'active',
      details:normalizeDetails(workspaceProfile?.details||active?.details)
    };
  }

  function initials(name){
    return String(name||'User').trim().split(/\s+/).slice(0,2).map(part=>part[0]?.toUpperCase()||'').join('')||'U';
  }

  function paintAvatar(element,profile){
    if(!element)return;
    const photo=profile?.details?.avatarDataUrl||'';
    element.textContent=photo?'':initials(profile?.details?.preferredName||profile?.name);
    element.style.backgroundImage=photo?`url("${photo.replace(/"/g,'%22')}")`:'';
    element.classList.toggle('has-photo',Boolean(photo));
  }

  function syncProfileChrome(profile=editableProfile()){
    const displayName=profile.details.preferredName||profile.name||'Team member';
    ['profile-avatar','settings-profile-avatar'].forEach(id=>paintAvatar(document.getElementById(id),profile));
    ['profile-name','profile-menu-name','settings-profile-title'].forEach(id=>{const element=document.getElementById(id);if(element)element.textContent=displayName;});
    ['profile-role','profile-menu-role'].forEach(id=>{const element=document.getElementById(id);if(element)element.textContent=[profile.details.jobTitle||profile.role,profile.email].filter(Boolean).join(' · ');});
  }

  function departments(){
    return (typeof activeDepartments==='function'?activeDepartments():(state.departments||[]).filter(item=>!item.archived));
  }

  function fillDepartmentSelect(id,value,emptyLabel){
    const select=document.getElementById(id);if(!select)return;
    select.innerHTML=`<option value="">${emptyLabel}</option>`+departments().map(item=>`<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('');
    select.value=value||'';
  }

  function setValue(id,value){const element=document.getElementById(id);if(element)element.value=value??'';}
  function setChecked(id,value){const element=document.getElementById(id);if(element)element.checked=Boolean(value);}
  function titleRole(role){return String(role||'Member').replace(/(^|[-_\s])\w/g,part=>part.toUpperCase()).replace(/[-_]/g,' ');}

  function renderProfilePage(){
    const form=document.getElementById('profile-edit-form');if(!form)return;
    const profile=editableProfile(),details=profile.details;
    paintAvatar(document.getElementById('profile-photo-preview'),profile);
    const remove=document.getElementById('profile-photo-remove');if(remove)remove.hidden=!details.avatarDataUrl;
    const fields={
      'profile-full-name':profile.name,'profile-preferred-name':details.preferredName,'profile-pronouns':details.pronouns,'profile-birthday':details.birthday,
      'profile-bio':details.bio,'profile-email':profile.email,'profile-phone':details.phone,'profile-address-line1':details.addressLine1,
      'profile-address-line2':details.addressLine2,'profile-city':details.city,'profile-region':details.region,'profile-postal-code':details.postalCode,
      'profile-country':details.country,'profile-job-title':details.jobTitle||profile.role,'profile-employee-id':details.employeeId,'profile-start-date':details.startDate,
      'profile-skills':details.skills,'profile-language':details.language,'profile-timezone':details.timezone,'profile-date-format':details.dateFormat
    };
    Object.entries(fields).forEach(([id,value])=>setValue(id,value));
    fillDepartmentSelect('profile-department',details.departmentId,'No home department');
    fillDepartmentSelect('profile-default-department',details.defaultDepartmentId,'Remember my last choice');
    setChecked('profile-notify-counts',details.notifyCounts);setChecked('profile-notify-orders',details.notifyOrders);setChecked('profile-notify-summary',details.notifySummary);
    const displayName=details.preferredName||profile.name;
    document.getElementById('profile-page-name').textContent=displayName;
    document.getElementById('profile-page-summary').textContent=[details.jobTitle||profile.role,departments().find(item=>item.id===details.departmentId)?.name].filter(Boolean).join(' · ')||'Keep your profile information up to date.';
    document.getElementById('profile-account-status').textContent=titleRole(profile.status||'active');
    document.getElementById('profile-account-role').textContent=titleRole(profile.role);
    document.getElementById('profile-signin-email').textContent=authIdentity()?.email||profile.email||'Not available';
    const canManage=typeof profileCanManageProfiles==='function'&&profileCanManageProfiles();
    ['profile-manage-access','profile-account-access-button'].forEach(id=>{const button=document.getElementById(id);if(button)button.hidden=!canManage;});
    const complete=[profile.name,profile.email,details.phone,details.jobTitle,details.departmentId,details.bio,details.avatarDataUrl,details.addressLine1].filter(Boolean).length;
    const percent=Math.round((complete/8)*100);
    document.getElementById('profile-completion-bar').style.width=`${percent}%`;
    document.getElementById('profile-completion-label').textContent=`${percent}% complete`;
    document.getElementById('profile-save-state').textContent='Changes save to your workspace profile.';
    resetProfileEditState();
    syncProfileChrome(profile);
  }

  function canManageProfileFields(){return typeof profileCanManageProfiles==='function'&&profileCanManageProfiles();}

  function setProfileEditActionsVisible(visible){
    ['profile-cancel-edit','profile-save-top','profile-save-bar'].forEach(id=>{const element=document.getElementById(id);if(element)element.hidden=!visible;});
  }

  function resetProfileEditState(){
    const form=document.getElementById('profile-edit-form');
    form?.querySelectorAll('input,select,textarea').forEach(control=>{control.disabled=true;});
    document.querySelectorAll('.profile-form-card.editing').forEach(card=>card.classList.remove('editing'));
    document.querySelectorAll('.profile-section-edit').forEach(button=>{button.classList.remove('active');button.setAttribute('aria-pressed','false');const label=button.querySelector('span');if(label)label.textContent='Edit';});
    const photoEditor=document.querySelector('.profile-photo-editor');
    photoEditor?.classList.remove('editing');
    const photoActions=photoEditor?.querySelector('.profile-photo-actions');if(photoActions)photoActions.hidden=true;
    setProfileEditActionsVisible(false);
  }

  function editProfileSection(sectionId,button,managerControlled=false){
    if(managerControlled&&!canManageProfileFields()){
      toast('This information is managed by your manager. Contact your manager to make changes.',true);
      document.getElementById('profile-work-managed-note')?.classList.add('attention');
      setTimeout(()=>document.getElementById('profile-work-managed-note')?.classList.remove('attention'),1600);
      return;
    }
    const section=document.getElementById(sectionId);if(!section)return;
    section.classList.add('editing');
    section.querySelectorAll('input,select,textarea').forEach(control=>{control.disabled=false;});
    button?.classList.add('active');button?.setAttribute('aria-pressed','true');
    const label=button?.querySelector('span');if(label)label.textContent='Editing';
    setProfileEditActionsVisible(true);
    section.querySelector('input:not([type="checkbox"]),select,textarea')?.focus();
  }

  function cancelProfileEditing(){renderProfilePage();toast('Unsaved profile changes were discarded.');}

  function toggleProfilePhotoEditor(){
    const editor=document.querySelector('.profile-photo-editor');if(!editor)return;
    const editing=!editor.classList.contains('editing');
    editor.classList.toggle('editing',editing);
    const actions=editor.querySelector('.profile-photo-actions');if(actions)actions.hidden=!editing;
  }

  function formDetails(existing){
    const value=id=>document.getElementById(id)?.value.trim()||'';
    const checked=id=>Boolean(document.getElementById(id)?.checked);
    const next=normalizeDetails({...existing,
      preferredName:value('profile-preferred-name'),pronouns:value('profile-pronouns'),birthday:value('profile-birthday'),bio:value('profile-bio'),
      phone:value('profile-phone'),addressLine1:value('profile-address-line1'),addressLine2:value('profile-address-line2'),city:value('profile-city'),
      region:value('profile-region'),postalCode:value('profile-postal-code'),country:value('profile-country'),jobTitle:value('profile-job-title'),
      departmentId:value('profile-department'),employeeId:value('profile-employee-id'),startDate:value('profile-start-date'),skills:value('profile-skills'),
      language:value('profile-language'),timezone:value('profile-timezone'),dateFormat:value('profile-date-format'),defaultDepartmentId:value('profile-default-department'),
      notifyCounts:checked('profile-notify-counts'),notifyOrders:checked('profile-notify-orders'),notifySummary:checked('profile-notify-summary')
    });
    if(!canManageProfileFields()){
      ['jobTitle','departmentId','employeeId','startDate'].forEach(key=>{next[key]=existing[key]||'';});
    }
    return next;
  }

  function saveCurrentProfile(event){
    event?.preventDefault();
    const profile=editableProfile();
    const name=document.getElementById('profile-full-name')?.value.trim()||'';
    const email=document.getElementById('profile-email')?.value.trim().toLowerCase()||'';
    if(!name){toast('Please add your full name.',true);document.getElementById('profile-full-name')?.focus();return;}
    const target=findWorkspaceProfile();
    const next={...profile,name,email,details:formDetails(profile.details)};
    if(target)Object.assign(target,next,{id:target.id,userId:target.userId||next.userId});
    else{if(!Array.isArray(state.profiles))state.profiles=[];state.profiles.push(next);}
    save();
    renderProfilePage();
    syncProfileChrome(next);
    document.getElementById('profile-save-state').textContent=`Saved ${new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}`;
    toast('Profile saved.');
  }

  function resizePhoto(file){
    return new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onerror=()=>reject(new Error('read'));
      reader.onload=()=>{
        const image=new Image();
        image.onerror=()=>reject(new Error('image'));
        image.onload=()=>{
          const size=320,scale=Math.max(size/image.width,size/image.height),width=image.width*scale,height=image.height*scale;
          const canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;
          canvas.getContext('2d').drawImage(image,(size-width)/2,(size-height)/2,width,height);
          resolve(canvas.toDataURL('image/jpeg',.82));
        };
        image.src=String(reader.result);
      };
      reader.readAsDataURL(file);
    });
  }

  async function handleProfilePhoto(event){
    const file=event?.target?.files?.[0];if(!file)return;
    if(!file.type.startsWith('image/')||file.size>8*1024*1024){toast('Choose a JPG, PNG, or WebP smaller than 8 MB.',true);event.target.value='';return;}
    try{
      const dataUrl=await resizePhoto(file),profile=editableProfile(),target=findWorkspaceProfile();
      profile.details.avatarDataUrl=dataUrl;
      if(target)target.details=normalizeDetails({...target.details,avatarDataUrl:dataUrl});
      else state.profiles.push(profile);
      save();renderProfilePage();toast('Profile photo updated.');
    }catch(error){toast('That photo could not be processed.',true);}
    event.target.value='';
  }

  function removeProfilePhoto(){
    const target=findWorkspaceProfile();if(!target)return;
    target.details=normalizeDetails({...target.details,avatarDataUrl:''});save();renderProfilePage();toast('Profile photo removed.');
  }

  function openUsersAndAccess(){closeAllMenus();window.top.location.href='/app/people';}
  function scrollProfileSection(id,button){
    document.getElementById(id)?.scrollIntoView({behavior:'smooth',block:'start'});
    document.querySelectorAll('.profile-section-nav button').forEach(item=>item.classList.toggle('active',item===button));
  }

  window.normalizeProfileDetails=normalizeDetails;
  window.renderProfilePage=renderProfilePage;
  window.syncProfileChrome=syncProfileChrome;
  window.saveCurrentProfile=saveCurrentProfile;
  window.handleProfilePhoto=handleProfilePhoto;
  window.removeProfilePhoto=removeProfilePhoto;
  window.editProfileSection=editProfileSection;
  window.cancelProfileEditing=cancelProfileEditing;
  window.toggleProfilePhotoEditor=toggleProfilePhotoEditor;
  window.openUsersAndAccess=openUsersAndAccess;
  window.scrollProfileSection=scrollProfileSection;
})();
