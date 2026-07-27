// export-tools.js — Excel/CSV export and printable views for each section.

function xlProducts(){
  closeAllMenus();
  const lastInv=state.inventories[0];
  const isBar=productDepartmentView==='bar';
  const rows=[['Workspace','Product Name','Inventory Name','Alternate','Category','Subcategory',isBar?'Default Packaging':'Default Unit',isBar?'Packaging Cost':'Default Unit Cost','Par','Last Count','SKU','Notes','Suppliers',isBar?'Packaging Options':'Unit Options']];
  state.products.filter(p=>productInDepartment(p,productDepartmentView)).forEach(p=>{
    normalizeProductUnits(p);
    const lc=p.lastCount??(lastInv?lastInv.items[p.id]??'':'');
    const sups=(p.suppliers||[]).map(sid=>{const s=state.suppliers.find(x=>x.id===sid);return s?s.name:null;}).filter(Boolean).join(', ');
    const units=p.units.map(u=>`${u.unit}${u.unitSize?' '+u.unitSize:''}${u.sku?' SKU '+u.sku:''} @ ${u.cost||0}${u.par?' par '+u.par:''}`).join('; ');
    rows.push([departmentName(productDepartmentView),p.name,p.inventoryName||'',p.aliases||'',p.category,p.subcategory||'',p.unit,p.cost||0,p.par||0,lc!==''&&lc!==null?+lc:'',p.sku||'',p.notes||'',sups,units]);
  });
  xlDown([{name:`${departmentName(productDepartmentView)} Products`,rows}],`${productDepartmentView}_products_${today()}.xlsx`);
}
function xlInventorySummary(){
  closeAllMenus();
  const rows=[['Date','Label','Rooms','Room Names','Items Counted','Missing','Total Value']];
  state.inventories.forEach(inv=>{
    if(typeof normalizeInventoryRooms==='function')normalizeInventoryRooms(inv);
    const total=Object.entries(inv.items).reduce((s,[id,q])=>{const p=getProduct(id);return s+(p?p.cost*q:0);},0);
    rows.push([inv.date,inv.label||'',inv.rooms?.length||1,(inv.rooms||[]).map(room=>room.name).join(', '),Object.keys(inv.items).length,state.products.length-Object.keys(inv.items).length,+total.toFixed(2)]);
  });
  xlDown([{name:'Count Filings',rows}],`counts_${today()}.xlsx`);
}
function xlOrders(){
  closeAllMenus();
  const s1=[['Date','Invoice #','Supplier','Lines','Total','HST','Delivery Fee','Agency Fee','Fuel Charge','Refund/Credit','Status','Notes']];
  state.orders.forEach(raw=>{const o=normalizeOrder(raw);s1.push([o.date,o.invoiceNumber,o.supplier,o.lines.length,+orderTotal(o).toFixed(2),moneyValue(o.hst),moneyValue(o.deliveryFee),moneyValue(o.agencyFee),moneyValue(o.fuelCharge),o.isRefund?'Yes':'No',o.status,o.notes||'']);});
  const s2=[['Date','Invoice #','Supplier','Product','Product #','SKU','Qty','Unit','Unit Size','Unit Price','Deposit','Line Total']];
  state.orders.forEach(raw=>{const o=normalizeOrder(raw);o.lines.forEach(l=>{s2.push([o.date,o.invoiceNumber,o.supplier,l.productName||'',l.productNumber||'',l.sku||'',l.qty,l.unit||'',l.unitSize||'',moneyValue(l.unitPrice),moneyValue(l.deposit),+lineTotal(l).toFixed(2)]);});});
  xlDown([{name:'Orders Summary',rows:s1},{name:'Order Lines',rows:s2}],`orders_${today()}.xlsx`);
}
function xlUsage(){
  closeAllMenus();
  const usage=computeUsage();
  const rows=[['Product','Category','Subcategory','Unit','Avg/Week','Avg/Month','Total Used','Data Points']];
  state.products.forEach(p=>{const u=usage[p.id];const avgW=u&&u.days>0?+((u.total/u.days)*7).toFixed(2):0;const avgM=u&&u.days>0?+((u.total/u.days)*30).toFixed(2):0;rows.push([p.name,p.category,p.subcategory||'',p.unit,avgW,avgM,u?+u.total.toFixed(2):0,u?u.periods:0]);});
  xlDown([{name:'Usage',rows}],`usage_${today()}.xlsx`);
}
function xlReports(){
  closeAllMenus();
  const period=document.getElementById('rep-period').value;const pd=period==='weekly'?7:30;const usage=computeUsage();
  const u=[['Product','Category','Sub','Unit',`Avg/${period==='weekly'?'Week':'Month'}`,'Total Used']];
  state.products.forEach(p=>{const uu=usage[p.id];const avg=uu&&uu.days>0?+((uu.total/uu.days)*pd).toFixed(2):0;u.push([p.name,p.category,p.subcategory||'',p.unit,avg,uu?+uu.total.toFixed(2):0]);});
  const sheets=[{name:'Usage',rows:u}];
  const lastInv=state.inventories[0];
  if(lastInv){const v=[['Product','Category','Sub','Qty','Unit','Unit Cost','Value']];let tot=0;Object.entries(lastInv.items).forEach(([pid,qty])=>{const p=getProduct(pid);if(!p)return;const val=+(p.cost*qty).toFixed(2);tot+=val;v.push([p.name,p.category,p.subcategory||'',qty,p.unit,p.cost||0,val]);});v.push(['','','','','','TOTAL',+tot.toFixed(2)]);sheets.push({name:(`Value ${lastInv.date}`).slice(0,31),rows:v});}
  const oh=[['Date','Invoice #','Supplier','Product','Product #','SKU','Qty','Unit Price','Total']];state.orders.forEach(raw=>{const o=normalizeOrder(raw);o.lines.forEach(l=>{oh.push([o.date,o.invoiceNumber,o.supplier,l.productName||'',l.productNumber||'',l.sku||'',l.qty,moneyValue(l.unitPrice),+lineTotal(l).toFixed(2)]);});});sheets.push({name:'Order History',rows:oh});
  xlDown(sheets,`report_${today()}.xlsx`);
}
function xlSuppliers(){
  closeAllMenus();
  const rows=[['Name','Contact','Email','Phone','Website','Lead Days','Min Spend','Min Qty','Notes','Linked Products']];
  state.suppliers.forEach(s=>{const prods=(s.products||[]).map(id=>{const p=getProduct(id);return p?p.name:null;}).filter(Boolean).join('; ');rows.push([s.name,s.contact||'',s.email||'',s.phone||'',s.website||'',s.leadDays||0,s.minSpend||0,s.minQty||0,s.notes||'',prods]);});
  xlDown([{name:'Suppliers',rows}],`suppliers_${today()}.xlsx`);
}
function xlDashboard(){
  closeAllMenus();
  const lastInv=state.inventories[0];let totalVal=0;if(lastInv)Object.entries(lastInv.items).forEach(([id,qty])=>{const p=getProduct(id);if(p)totalVal+=p.cost*qty;});
  const rows=[['Metric','Value'],['Total Products',state.products.length],['Last Count',lastInv?lastInv.date:'—'],['Inventory Value ($)',+totalVal.toFixed(2)],['Orders',state.orders.length],['Suppliers',state.suppliers.length],['Counts Filed',state.inventories.length]];
  xlDown([{name:'Dashboard',rows}],`dashboard_${today()}.xlsx`);
}

function printPage(title,pageId){closeAllMenus();const pageEl=document.getElementById(pageId);if(!pageEl)return;const tableHTML=pageEl.querySelector('.table-wrap')?.outerHTML||'';const statHTML=pageEl.querySelector('.stat-grid')?.outerHTML||'';const w=window.open('','_blank','width=1000,height=750');w.document.write(`<!DOCTYPE html><html><head><title>${title}</title><style>body{font-family:Arial,sans-serif;padding:20px;font-size:12px;}h2{margin:0 0 4px;}p{margin:0 0 14px;color:#666;font-size:11px;}table{width:100%;border-collapse:collapse;}th{background:#333;color:#fff;padding:7px;text-align:left;font-size:11px;}td{padding:6px 7px;border-bottom:1px solid #ddd;}tr:nth-child(even) td{background:#f9f9f9;}.stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:16px;}.stat-card{border:1px solid #ccc;border-radius:6px;padding:12px;}.stat-card .label{font-size:10px;color:#888;text-transform:uppercase;}.stat-card .value{font-size:20px;font-weight:700;}</style></head><body><h2>Keg Bar — ${title}</h2><p>Exported ${new Date().toLocaleDateString('en-CA')}</p>${statHTML}${tableHTML}<script>window.onload=function(){window.print();}<\/script></body></html>`);w.document.close();}
function printTable(title,subtitle,headers,rows){
  const w=window.open('','_blank','width=1100,height=800');
  if(!w){toast('Allow pop-ups to open the PDF report.',true);return;}
  const safe=value=>escapeHtml(String(value??''));
  const th=`<tr>${headers.map(header=>`<th>${safe(header)}</th>`).join('')}</tr>`;
  const tb=rows.map(row=>`<tr>${row.map(cell=>`<td>${safe(cell)}</td>`).join('')}</tr>`).join('');
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${safe(title)}</title><style>@page{size:landscape;margin:14mm;}*{box-sizing:border-box;}body{margin:0;color:#17202a;font-family:Arial,sans-serif;font-size:10px;}h1{margin:0 0 5px;font-size:20px;}p{margin:0 0 16px;color:#59636e;font-size:9px;line-height:1.45;}table{width:100%;border-collapse:collapse;}thead{display:table-header-group;}tr{break-inside:avoid;}th{background:#26313d;color:#fff;padding:7px 6px;text-align:left;font-size:9px;}td{padding:6px;border-bottom:1px solid #dfe3e7;}tr:nth-child(even) td{background:#f6f7f8;}td:nth-child(4),td:nth-child(6),td:nth-child(7),td:nth-child(8),th:nth-child(4),th:nth-child(6),th:nth-child(7),th:nth-child(8){text-align:right;}@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact;}}</style></head><body><h1>${safe(title)}</h1><p>${safe(subtitle)}</p><table><thead>${th}</thead><tbody>${tb}</tbody></table><script>window.onload=function(){window.print();}<\/script></body></html>`);
  w.document.close();
}
