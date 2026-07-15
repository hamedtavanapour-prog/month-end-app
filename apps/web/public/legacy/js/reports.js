// reports.js — value/orders reports and the dashboard.

function switchRepTab(tab){['usage','value','rorders'].forEach(t=>{const selected=t===tab;const button=document.getElementById('rtab-'+t);button.classList.toggle('active',selected);button.setAttribute('aria-pressed',selected?'true':'false');document.getElementById('rep-'+t).style.display=selected?'block':'none';});if(tab==='value'){populateValueDates();renderValueReport();}if(tab==='rorders')renderOrdersReport();if(tab==='usage')renderReport();}
function renderReport(){const period=document.getElementById('rep-period').value;const cat=document.getElementById('rep-cat').value;const sub=document.getElementById('rep-sub').value;const usage=computeUsage();const pd=period==='weekly'?7:30;const{col,dir}=sortState.report;let rows=state.products.filter(p=>(!cat||p.category===cat)&&(!sub||p.subcategory===sub)).map(p=>{const u=usage[p.id];const avg=u&&u.days>0?(u.total/u.days)*pd:0;return{p,avg,total:u?u.total:0,name:p.name,category:p.category,subcategory:p.subcategory};});rows=sortArr(rows,col,dir);const maxAvg=rows.reduce((m,r)=>Math.max(m,r.avg),1);const tbody=document.getElementById('rep-tbody');if(!rows.length){tbody.innerHTML=`<tr><td colspan="6" style="text-align:center;color:var(--text-muted)">File two+ inventory counts to see usage.</td></tr>`;return;}tbody.innerHTML=rows.map(({p,avg,total})=>`<tr><td><strong>${productNameLink(p)}</strong></td><td>${catBadge(p.category)}</td><td>${subBadge(p.subcategory)}</td><td>${avg>0?avg.toFixed(2):'—'}</td><td>${total>0?total.toFixed(2):'—'}</td><td style="min-width:80px;"><div class="usage-bar-bg"><div class="usage-bar" style="width:${avg>0?(avg/maxAvg*100).toFixed(1):0}%"></div></div></td></tr>`).join('');}
function populateValueDates(){const sel=document.getElementById('rep-inv-date');sel.innerHTML='<option value="">— Select —</option>'+state.inventories.map(inv=>`<option value="${inv.id}">${fmtDate(inv.date)}${inv.label?' — '+inv.label:''}</option>`).join('');}
function renderValueReport(){const id=document.getElementById('rep-inv-date').value;const inv=id?state.inventories.find(i=>i.id===id):null;if(!inv){document.getElementById('val-tbody').innerHTML='';document.getElementById('val-stats').innerHTML='';return;}let total=0;const bycat={};const rows=Object.entries(inv.items).map(([pid,qty])=>{const p=getProduct(pid);if(!p||qty===0)return'';const val=p.cost*qty;total+=val;bycat[p.category]=(bycat[p.category]||0)+val;return`<tr><td>${productNameLink(p)}</td><td>${catBadge(p.category)}</td><td>${qty}</td><td>${p.cost>0?fmt(p.cost):'—'}</td><td><strong>${fmt(val)}</strong></td></tr>`;}).join('');document.getElementById('val-tbody').innerHTML=rows||`<tr><td colspan="5" style="color:var(--text-muted)">No items.</td></tr>`;document.getElementById('val-stats').innerHTML=Object.entries(bycat).map(([c,v])=>`<div class="stat-card"><div class="label">${c}</div><div class="value">${fmt(v)}</div><div class="sub">${((v/total)*100).toFixed(1)}%</div></div>`).join('')+`<div class="stat-card"><div class="label">Total</div><div class="value">${fmt(total)}</div></div>`;}
function renderOrdersReport(){const tbody=document.getElementById('rep-ord-tbody');if(!state.orders.length){tbody.innerHTML=`<tr><td colspan="6" style="text-align:center;color:var(--text-muted)">No orders.</td></tr>`;return;}const rows=[];state.orders.forEach(raw=>{const o=normalizeOrder(raw);o.lines.forEach(l=>{const product=l.sku||l.productNumber||'(no SKU)';rows.push(`<tr><td>${fmtDate(o.date)}</td><td>${o.invoiceNumber||'—'}</td><td>${product}</td><td>${l.qty||'—'}</td><td>${fmt(l.unitPrice)}</td><td>${fmt(lineTotal(l))}</td></tr>`);});});tbody.innerHTML=rows.join('')||`<tr><td colspan="6" style="color:var(--text-muted)">No lines.</td></tr>`;}

function dashboardSetupState(workspace){
  const activeDepartments=(workspace.departments||[]).filter(department=>!department.archived);
  const activeProducts=(workspace.products||[]).filter(product=>!product.archived);
  const activeRooms=(workspace.rooms||[]).filter(room=>!room.archived);
  return[
    {key:'departments',label:'Confirm departments',detail:'Organize shared items for Bar, Kitchen, and other teams.',complete:activeDepartments.length>0,page:'settings',section:'departments'},
    {key:'products',label:'Review products',detail:'Add products or confirm the starter catalog is right for you.',complete:activeProducts.length>0,page:'products'},
    {key:'rooms',label:'Build your floor plan',detail:'Choose which products belong in each counting room.',complete:activeRooms.length>0,page:'settings',section:'floor-plan'},
    {key:'count',label:'File your first count',detail:'Create a baseline for live inventory and reporting.',complete:(workspace.inventories||[]).length>0,page:'inventory',action:'count'}
  ];
}
function openDashboardSetupStep(key){
  const step=dashboardSetupState(state).find(item=>item.key===key);
  if(!step)return;
  if(!profileCanAccessPage(currentProfile(),step.page)){toast('You do not have access to that area.',true);return;}
  showPage(step.page);
  if(step.section)setSettingsSection(step.section);
  if(step.action==='count')openInventoryRoomSelect();
}
function renderDashboardOnboarding(){
  const container=document.getElementById('dashboard-onboarding');
  if(!container)return;
  const steps=dashboardSetupState(state);
  const completed=steps.filter(step=>step.complete).length;
  const firstCountFiled=steps.find(step=>step.key==='count')?.complete;
  container.hidden=!!firstCountFiled;
  if(firstCountFiled)return;
  const progress=document.getElementById('dashboard-onboarding-progress');
  progress.textContent=`${completed} of ${steps.length} complete`;
  const summary=document.getElementById('dashboard-onboarding-summary');
  summary.textContent=completed? 'Your workspace is taking shape. Finish the remaining steps when you are ready.':'Start here to prepare a clear, reliable first count.';
  document.getElementById('dashboard-onboarding-steps').innerHTML=steps.map((step,index)=>{
    const allowed=profileCanAccessPage(currentProfile(),step.page);
    const status=step.complete?'Complete':index===steps.findIndex(item=>!item.complete)?'Next':'Not started';
    return`<button type="button" class="dashboard-onboarding-step ${step.complete?'complete':''}" onclick="openDashboardSetupStep('${step.key}')" ${allowed?'':`disabled title="You do not have access to this area."`}>
      <span class="dashboard-step-marker" aria-hidden="true">${step.complete?'✓':index+1}</span>
      <span class="dashboard-step-copy"><strong>${step.label}</strong><small>${step.detail}</small></span>
      <span class="dashboard-step-status">${status}${allowed?' →':''}</span>
    </button>`;
  }).join('');
}
function renderDashboard(){
  renderDashboardOnboarding();
  const lastInv=state.inventories[0];let totalVal=0;if(lastInv)Object.entries(lastInv.items).forEach(([id,qty])=>{const p=getProduct(id);if(p)totalVal+=p.cost*qty;});
  const low=lastInv?state.products.filter(p=>p.par>0&&(lastInv.items[p.id]??Infinity)<=p.par).length:0;
  const usage=computeUsage();let atRisk=0;if(lastInv){state.products.forEach(p=>{const u=usage[p.id];const stock=lastInv.items[p.id]??null;if(u&&u.days>0&&stock!==null){const avgD=u.total/u.days;const dL=avgD>0?stock/avgD:Infinity;if(dL<=7)atRisk++;}});}
  document.getElementById('dash-stats').innerHTML=`<div class="stat-card"><div class="label">Products</div><div class="value">${state.products.length}</div></div><div class="stat-card"><div class="label">Last Count</div><div class="value" style="font-size:1rem;">${lastInv?fmtDate(lastInv.date):'—'}</div><div class="sub">${lastInv?lastInv.label||'':''}</div></div><div class="stat-card"><div class="label">Count Value</div><div class="value">${fmt(totalVal)}</div></div><div class="stat-card"><div class="label">Low / At Par</div><div class="value" style="color:${low>0?'var(--danger)':'var(--success)'}">${low}</div></div><div class="stat-card"><div class="label">Runout ≤7 Days</div><div class="value" style="color:${atRisk>0?'var(--danger)':'var(--success)'}">${atRisk}</div></div><div class="stat-card"><div class="label">Suppliers</div><div class="value">${state.suppliers.length}</div></div><div class="stat-card"><div class="label">Orders</div><div class="value">${state.orders.length}</div></div><div class="stat-card"><div class="label">Counts Filed</div><div class="value">${state.inventories.length}</div></div>`;
  const tbody=document.getElementById('dash-inv-tbody');const recent=state.inventories.slice(0,5);
  if(!recent.length){tbody.innerHTML=`<tr><td colspan="5" style="text-align:center;color:var(--text-muted)">No counts yet.</td></tr>`;return;}
  tbody.innerHTML=recent.map(inv=>{const t=Object.entries(inv.items).reduce((s,[id,q])=>{const p=getProduct(id);return s+(p?p.cost*q:0);},0);return`<tr><td>${fmtDate(inv.date)}</td><td>${inv.label||'—'}</td><td>${Object.keys(inv.items).length}</td><td>${fmt(t)}</td><td><button class="btn btn-secondary btn-sm" onclick="viewInventory('${inv.id}')">View</button></td></tr>`;}).join('');
}

// EXCEL / CSV EXPORTS
// All use the xlDown() wrapper defined in <head>
// which handles both XLSX and CSV fallback automatically
