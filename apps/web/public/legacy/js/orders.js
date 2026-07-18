// orders.js — invoices, invoice items, and scan/OCR import.

const ORDER_STATUS_COLORS={
  Finished:'var(--success)',
  Received:'var(--success)',
  Partial:'var(--warning)',
  Draft:'var(--text-muted)',
  'Draft from Scan':'var(--accent)',
  Pending:'var(--text-muted)'
};

const ORDER_REQUIRED_FIELDS=[
  ['supplier','Supplier'],
  ['date','Date'],
  ['invoiceNumber','Invoice Number'],
  ['hst','HST'],
  ['totalPrice','Total Order Price']
];

const LINE_REQUIRED_FIELDS=[
  ['productName','Product'],
  ['productNumber','Product #'],
  ['sku','SKU'],
  ['qty','Quantity'],
  ['unit','Unit'],
  ['unitSize','Unit Size'],
  ['unitPrice','Unit Price'],
  ['deposit','Deposit']
];

let scanExtractedInvoice=null;

function escapeHtml(value){
  return String(value??'').replace(/[&<>"']/g,ch=>({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#39;'
  })[ch]);
}

function moneyValue(value){
  const num=parseFloat(String(value??'').replace(/[$,]/g,''));
  return isNaN(num)?0:num;
}

function requiredNumberFilled(value){
  return value!==''&&value!==null&&value!==undefined&&!isNaN(parseFloat(value));
}

function lineTotal(line){
  return (parseFloat(line.qty)||0)*(parseFloat(line.unitPrice)||parseFloat(line.cost)||0)+(parseFloat(line.deposit)||0);
}

function normMatch(value){
  return String(value||'').toLowerCase().replace(/[^a-z0-9]/g,'');
}

function productVariantOptions(product){
  normalizeProductUnits(product);
  return product.units.map(unit=>({...unit,product}));
}

function invoiceProductLabel(product,unit=null){
  const suffix=unit?.unitSize?` (${unit.unitSize})`:'';
  return `${product.name}${suffix}`;
}

function buildInvoiceProductOptions(){
  const list=document.getElementById('invoice-product-options');
  if(!list)return;
  const labels=state.products.flatMap(product=>{
    normalizeProductUnits(product);
    return product.units.map(unit=>invoiceProductLabel(product,unit));
  });
  list.innerHTML=[...new Set(labels)].map(label=>`<option value="${escapeHtml(label)}"></option>`).join('');
}

function invoiceProductChoices(){
  const seen=new Set();
  const choices=[];
  state.products.forEach(product=>{
    normalizeProductUnits(product);
    product.units.forEach(unit=>{
      const label=invoiceProductLabel(product,unit);
      const key=label.toLowerCase();
      if(seen.has(key))return;
      seen.add(key);
      choices.push({label,productId:product.id,sku:unit.sku||product.sku||'',unit:unit.unit||product.unit||'',unitSize:unit.unitSize||'',cost:unit.cost||product.cost||0});
    });
  });
  return choices.sort((a,b)=>a.label.localeCompare(b.label));
}

function findProductByInvoiceLabel(label){
  const clean=String(label||'').trim().toLowerCase();
  if(!clean)return null;
  for(const product of state.products){
    normalizeProductUnits(product);
    for(const unit of product.units){
      if(invoiceProductLabel(product,unit).toLowerCase()===clean)return{product,unit};
    }
    if(product.name.toLowerCase()===clean)return{product,unit:product.units[0]};
  }
  return null;
}

function findInvoiceProductMatch(line){
  const productCode=normMatch(line.productNumber);
  const sku=normMatch(line.sku);
  const productName=String(line.productName||'').trim();
  const lineName=normMatch(productName);
  const unitSize=normMatch(line.unitSize);
  const allVariants=state.products.flatMap(product=>productVariantOptions(product));

  const labelMatch=findProductByInvoiceLabel(productName);
  if(labelMatch){
    if(unitSize){
      const sameSize=allVariants.find(v=>v.product.id===labelMatch.product.id&&normMatch(v.unitSize)===unitSize);
      if(sameSize)return sameSize;
    }
    return{...labelMatch.unit,product:labelMatch.product};
  }

  let match=line.productId?allVariants.find(v=>v.product.id===line.productId&&(!unitSize||normMatch(v.unitSize)===unitSize)):null;
  if(match)return match;

  match=allVariants.find(v=>{
    const variantSku=normMatch(v.sku);
    const productSku=normMatch(v.product.sku);
    return variantSku&&(variantSku===sku||variantSku===productCode)||productSku&&(productSku===sku||productSku===productCode);
  });
  if(match)return match;

  match=allVariants.find(v=>{
    const catalogName=normMatch(v.product.name);
    const aliases=(v.product.aliases||'').split(',').map(normMatch).filter(Boolean);
    return lineName&&(catalogName&&lineName.includes(catalogName)||aliases.some(alias=>lineName.includes(alias)));
  });
  if(match&&unitSize){
    const sameSize=allVariants.find(v=>v.product.id===match.product.id&&normMatch(v.unitSize)===unitSize);
    if(sameSize)return sameSize;
  }
  if(match)return match;

  match=allVariants.find(v=>{
    const productName=normMatch(v.product.name);
    const aliases=(v.product.aliases||'').split(',').map(normMatch).filter(Boolean);
    const codes=[productCode,sku].filter(Boolean);
    return codes.some(code=>productName&&code.includes(productName)||aliases.some(alias=>code.includes(alias)));
  });
  if(match&&unitSize){
    const sameSize=allVariants.find(v=>v.product.id===match.product.id&&normMatch(v.unitSize)===unitSize);
    if(sameSize)return sameSize;
  }
  return match||null;
}

function enrichInvoiceLineFromProducts(line){
  const match=findInvoiceProductMatch(line);
  if(!match)return line;
  return{
    ...line,
    productId:match.product.id,
    productName:line.productName||invoiceProductLabel(match.product,match),
    productNumber:line.productNumber||match.sku||match.product.sku||match.product.id,
    sku:line.sku||match.sku||match.product.sku||'',
    unit:line.unit||match.unit||match.product.unit||'',
    unitSize:line.unitSize||match.unitSize||'',
    unitPrice:requiredNumberFilled(line.unitPrice)?line.unitPrice:match.cost||match.product.cost||0,
    par:line.par??match.par??match.product.par??0
  };
}

function orderLines(order){
  return Array.isArray(order?.lines)?order.lines:[];
}

function orderTotal(order){
  if(requiredNumberFilled(order?.totalPrice))return parseFloat(order.totalPrice);
  return orderLines(order).reduce((sum,line)=>sum+lineTotal(line),0);
}

function orderSupplier(order){
  return order?.supplier||order?.ref||'';
}

function orderInvoiceNumber(order){
  return order?.invoiceNumber||order?.ref||'';
}

function orderStatusColor(status){
  return ORDER_STATUS_COLORS[status]||'var(--text-muted)';
}

function normalizeLine(line={}){
  line=line||{};
  line=enrichInvoiceLineFromProducts(line);
  const matchedProduct=getProduct(line.productId);
  const qty=parseFloat(line.qty)||0;
  const deposit=parseFloat(line.deposit)||0;
  const scannedTotal=parseFloat(line.totalPrice)||0;
  const derivedUnitPrice=qty&&scannedTotal&&scannedTotal>deposit?((scannedTotal-deposit)/qty).toFixed(2):'';
  const unitPrice=requiredNumberFilled(line.unitPrice)?line.unitPrice:
    requiredNumberFilled(line.cost)?line.cost:
    requiredNumberFilled(derivedUnitPrice)?derivedUnitPrice:
    matchedProduct?.cost??'';
  return{
    productId:line.productId||'',
    productName:line.productName||matchedProduct?.name||'',
    productNumber:line.productNumber||line.productId||matchedProduct?.sku||'',
    sku:line.sku||matchedProduct?.sku||'',
    qty:line.qty??'',
    unit:line.unit||matchedProduct?.unit||'',
    unitSize:line.unitSize||'',
    unitPrice,
    deposit:line.deposit??0
  };
}

function normalizeOrder(order={}){
  return{
    id:order.id||uid(),
    supplier:order.supplier||order.ref||'',
    date:order.date||today(),
    invoiceNumber:order.invoiceNumber||order.ref||'',
    storeNumber:order.storeNumber||'',
    storeAddress:order.storeAddress||'',
    hst:order.hst??'',
    deliveryFee:order.deliveryFee??'',
    agencyFee:order.agencyFee??'',
    fuelCharge:order.fuelCharge??'',
    totalPrice:order.totalPrice??(order.total!==undefined?order.total:''),
    isRefund:!!order.isRefund,
    status:order.status||'Draft',
    notes:order.notes||'',
    lines:orderLines(order).map(normalizeLine),
    scanData:order.scanData||null,
    scanName:order.scanName||null,
    ocrText:order.ocrText||''
  };
}

function renderOrderHeader(cols){
  return '<tr>'+cols.map(col=>{
    if(!col.sort||col.key==='scan'||col.key==='actions')return`<th>${col.label}</th>`;
    return sortableTableHeader(col.label,'orders',col.sort);
  }).join('')+'</tr>';
}

function orderTableRows(){
  const rows=state.orders.map(raw=>{
    const order=normalizeOrder(raw);
    return{
      ...order,
      lines_count:order.lines.length,
      total:orderTotal(order)
    };
  });
  return sortArr(rows,sortState.orders.col,sortState.orders.dir);
}

function renderOrderCell(order,col){
  switch(col.key){
    case 'invoiceNumber':
      return`<td><strong>${orderInvoiceNumber(order)?escapeHtml(orderInvoiceNumber(order)):'—'}</strong></td>`;
    case 'supplier':
      return`<td>${orderSupplier(order)?escapeHtml(orderSupplier(order)):'—'}</td>`;
    case 'date':
      return`<td>${fmtDate(order.date)}</td>`;
    case 'ref':
      return`<td>${order.ref?escapeHtml(order.ref):'—'}</td>`;
    case 'lines':
      return`<td>${order.lines.length}</td>`;
    case 'total':
      return`<td>${order.isRefund?'-':''}${fmt(order.total)}</td>`;
    case 'status':
      return`<td><span class="order-status" style="color:${orderStatusColor(order.status)}">${escapeHtml(order.status||'Draft')}</span></td>`;
    case 'notes':
      return`<td class="order-notes">${order.notes?escapeHtml(order.notes):'—'}</td>`;
    case 'scan':
      return`<td>${order.scanData?`<button class="btn btn-secondary btn-sm" onclick="event.stopPropagation();viewScan('${order.id}')">View file</button>`:'—'}</td>`;
    case 'actions':
      return`<td><div class="order-actions"><button class="btn btn-secondary btn-sm" onclick="event.stopPropagation();openOrderModal('${order.id}')">Edit</button><button class="btn btn-ghost-danger btn-sm" onclick="event.stopPropagation();deleteOrder('${order.id}')">Delete</button></div></td>`;
    default:
      return'<td>—</td>';
  }
}

function renderOrders(){
  const visibleCols=ORD_COLS.filter(col=>col.visible);
  document.getElementById('ord-thead').innerHTML=renderOrderHeader(visibleCols);

  const tbody=document.getElementById('ord-tbody');
  const rows=orderTableRows();
  if(!rows.length){
    tbody.innerHTML=`<tr><td colspan="${visibleCols.length}"><div class="table-empty-state"><strong>Create your first order</strong><p>Record a supplier invoice, its products, quantities, and total to start tracking purchases.</p><button class="btn btn-primary" type="button" onclick="openOrderModal()">＋ Create first order</button></div></td></tr>`;
    return;
  }

  tbody.innerHTML=rows.map(order=>(
    `<tr onclick="viewOrderDetail('${order.id}')">${visibleCols.map(col=>renderOrderCell(order,col)).join('')}</tr>`
  )).join('');
}

function buildSupplierOptions(){
  const list=document.getElementById('supplier-options');
  if(!list)return;
  list.innerHTML=state.suppliers.map(supplier=>`<option value="${escapeHtml(supplier.name)}"></option>`).join('');
}

function clearValidation(){
  document.querySelectorAll('.field-warning').forEach(el=>el.classList.remove('field-warning'));
  const summary=document.getElementById('order-validation-summary');
  if(summary){
    summary.textContent='';
    summary.classList.remove('show');
  }
}

function resetOrderModal(){
  clearValidation();
  buildSupplierOptions();
  buildInvoiceProductOptions();
  editingOrderId=null;
  document.getElementById('om-supplier').value='';
  document.getElementById('om-date').value=today();
  document.getElementById('om-invoice').value='';
  document.getElementById('om-store-number').value='';
  document.getElementById('om-store-address').value='';
  document.getElementById('om-hst').value='';
  document.getElementById('om-delivery-fee').value='';
  document.getElementById('om-agency-fee').value='';
  document.getElementById('om-fuel-charge').value='';
  document.getElementById('om-total-price').value='';
  document.getElementById('om-refund').checked=false;
  document.getElementById('om-status').value='Draft';
  document.getElementById('om-notes').value='';
  document.getElementById('order-lines').innerHTML='';
}

function populateOrderModal(order){
  const invoice=normalizeOrder(order);
  clearValidation();
  buildSupplierOptions();
  buildInvoiceProductOptions();
  document.getElementById('om-supplier').value=invoice.supplier;
  document.getElementById('om-date').value=invoice.date;
  document.getElementById('om-invoice').value=invoice.invoiceNumber;
  document.getElementById('om-store-number').value=invoice.storeNumber;
  document.getElementById('om-store-address').value=invoice.storeAddress;
  document.getElementById('om-hst').value=invoice.hst;
  document.getElementById('om-delivery-fee').value=invoice.deliveryFee;
  document.getElementById('om-agency-fee').value=invoice.agencyFee;
  document.getElementById('om-fuel-charge').value=invoice.fuelCharge;
  document.getElementById('om-total-price').value=invoice.totalPrice;
  document.getElementById('om-refund').checked=invoice.isRefund;
  document.getElementById('om-status').value=invoice.status||'Draft';
  document.getElementById('om-notes').value=invoice.notes;
  document.getElementById('order-lines').innerHTML='';
  invoice.lines.forEach(line=>addOrderLine(line));
}

function openOrderModal(existingId=null){
  editingOrderId=existingId;
  document.getElementById('ord-modal-title').textContent=existingId?'Edit Invoice':'New Invoice';

  if(existingId){
    const order=state.orders.find(item=>item.id===existingId);
    if(!order){
      toast('Order not found.',true);
      return;
    }
    populateOrderModal(order);
  }else{
    resetOrderModal();
    addOrderLine();
  }

  updateOrderTotal();
  openModal('modal-order');
}

function addOrderLine(existingLine=null){
  const line=normalizeLine(existingLine);
  const container=document.getElementById('order-lines');
  const lineId=uid();
  const row=document.createElement('div');
  row.id='ol-'+lineId;
  row.className='order-line-row';
  row.setAttribute('role','group');
  row.setAttribute('aria-label','Invoice item');
  row.innerHTML=`
    <div class="invoice-product-search">
      <input type="text" data-field="productName" aria-label="Product" placeholder="Search product" value="${escapeHtml(line.productName)}" oninput="showInvoiceProductSuggestions(this)" onblur="hideInvoiceProductSuggestions(this)">
      <div class="invoice-product-menu"></div>
    </div>
    <input type="text" data-field="productNumber" aria-label="Product number" placeholder="Product #" value="${escapeHtml(line.productNumber)}" onblur="applyProductMatchToOrderLine(this)">
    <input type="text" data-field="sku" aria-label="SKU" placeholder="SKU" value="${escapeHtml(line.sku)}" onblur="applyProductMatchToOrderLine(this)">
    <input type="number" min="0" step="0.01" data-field="qty" aria-label="Quantity" placeholder="Qty" value="${escapeHtml(line.qty)}" oninput="updateOrderTotal()">
    <input type="text" data-field="unit" aria-label="Unit" placeholder="Unit" value="${escapeHtml(line.unit)}">
    <input type="text" data-field="unitSize" aria-label="Unit size" placeholder="Unit Size" value="${escapeHtml(line.unitSize)}" onblur="applyProductMatchToOrderLine(this)">
    <input type="number" min="0" step="0.01" data-field="unitPrice" aria-label="Unit price" placeholder="Unit $" value="${escapeHtml(line.unitPrice)}" oninput="updateOrderTotal()">
    <input type="number" min="0" step="0.01" data-field="deposit" aria-label="Deposit" placeholder="Deposit" value="${escapeHtml(line.deposit)}">
    <div class="order-line-total">$0.00</div>
    <button class="btn btn-ghost-danger btn-sm" type="button" aria-label="Remove invoice item" onclick="removeLine('ol-${lineId}')">Remove</button>
  `;
  container.appendChild(row);
  updateOrderTotal();
}

function showInvoiceProductSuggestions(input){
  const row=input.closest('.order-line-row');
  const menu=row?.querySelector('.invoice-product-menu');
  if(!menu)return;
  const query=normMatch(input.value);
  if(!query){
    menu.classList.remove('open');
    menu.innerHTML='';
    return;
  }
  const matches=invoiceProductChoices().filter(choice=>{
    return normMatch(choice.label).includes(query)||normMatch(choice.sku).includes(query)||normMatch(choice.unitSize).includes(query);
  }).slice(0,8);
  if(!matches.length){
    menu.innerHTML='<div class="invoice-product-empty">No matching products</div>';
    menu.classList.add('open');
    return;
  }
  menu.innerHTML=matches.map(choice=>`
    <button type="button" onclick="selectInvoiceProductSuggestion(this)" data-label="${escapeHtml(choice.label)}">
      <strong>${escapeHtml(choice.label)}</strong>
      <span>${escapeHtml(choice.sku||'No SKU')} · ${escapeHtml(choice.unit||'Unit')} ${choice.unitSize?escapeHtml(choice.unitSize):''} · ${fmt(choice.cost)}</span>
    </button>
  `).join('');
  menu.classList.add('open');
}

function hideInvoiceProductSuggestions(input){
  setTimeout(()=>{
    const menu=input.closest('.invoice-product-search')?.querySelector('.invoice-product-menu');
    if(menu)menu.classList.remove('open');
  },150);
}

function selectInvoiceProductSuggestion(button){
  const wrapper=button.closest('.invoice-product-search');
  const input=wrapper.querySelector('[data-field="productName"]');
  input.value=button.dataset.label||'';
  wrapper.querySelector('.invoice-product-menu').classList.remove('open');
  applyProductMatchToOrderLine(input);
}

function applyProductMatchToOrderLine(input){
  const row=input.closest('.order-line-row');
  if(!row)return;
  const current=readOrderLine(row);
  const enriched=enrichInvoiceLineFromProducts(current);
  if(!enriched.productId)return;
  row.querySelector('[data-field="productName"]').value=enriched.productName||'';
  row.querySelector('[data-field="productNumber"]').value=enriched.productNumber||'';
  row.querySelector('[data-field="sku"]').value=enriched.sku||'';
  row.querySelector('[data-field="unit"]').value=enriched.unit||'';
  row.querySelector('[data-field="unitSize"]').value=enriched.unitSize||'';
  row.querySelector('[data-field="unitPrice"]').value=enriched.unitPrice||0;
  updateOrderTotal();
  toast('Matched product unit from product data.');
}

function removeLine(id){
  const el=document.getElementById(id);
  if(el)el.remove();
  updateOrderTotal();
}

function readOrderLine(row){
  const line={};
  row.querySelectorAll('[data-field]').forEach(input=>{
    const key=input.dataset.field;
    line[key]=['qty','unitPrice','deposit'].includes(key)?input.value:input.value.trim();
  });
  line.totalPrice=lineTotal(line);
  return line;
}

function readOrderLines(){
  return[...document.querySelectorAll('#order-lines > div')].map(readOrderLine);
}

function updateOrderTotal(){
  const lines=readOrderLines();
  let lineSum=0;
  document.querySelectorAll('#order-lines > div').forEach(row=>{
    const line=readOrderLine(row);
    const total=lineTotal(line);
    lineSum+=total;
    const totalEl=row.querySelector('.order-line-total');
    if(totalEl)totalEl.textContent=fmt(total);
  });
  const explicitTotal=moneyValue(document.getElementById('om-total-price')?.value);
  const total=explicitTotal||lineSum;
  document.getElementById('order-total-disp').textContent=total?`Invoice Total: ${fmt(total)}`:'';
}

function readOrderForm(statusMode='draft'){
  const existing=editingOrderId?state.orders.find(order=>order.id===editingOrderId):null;
  const lines=readOrderLines();
  const status=statusMode==='finish'?'Finished':document.getElementById('om-status').value;
  return{
    id:editingOrderId||uid(),
    supplier:document.getElementById('om-supplier').value.trim(),
    date:document.getElementById('om-date').value,
    invoiceNumber:document.getElementById('om-invoice').value.trim(),
    storeNumber:document.getElementById('om-store-number').value.trim(),
    storeAddress:document.getElementById('om-store-address').value.trim(),
    hst:document.getElementById('om-hst').value,
    deliveryFee:document.getElementById('om-delivery-fee').value,
    agencyFee:document.getElementById('om-agency-fee').value,
    fuelCharge:document.getElementById('om-fuel-charge').value,
    totalPrice:document.getElementById('om-total-price').value,
    isRefund:document.getElementById('om-refund').checked,
    status,
    notes:document.getElementById('om-notes').value.trim(),
    lines,
    scanData:existing?.scanData||scanFileData||null,
    scanName:existing?.scanName||scanFileName||null,
    ocrText:existing?.ocrText||scanExtractedInvoice?.ocrText||''
  };
}

function markField(id){
  const el=document.getElementById(id);
  if(el)el.classList.add('field-warning');
}

function validateOrder(order){
  clearValidation();
  const missing=[];
  const fieldMap={
    supplier:'om-supplier',
    date:'om-date',
    invoiceNumber:'om-invoice',
    hst:'om-hst',
    totalPrice:'om-total-price'
  };

  ORDER_REQUIRED_FIELDS.forEach(([key,label])=>{
    const value=order[key];
    const filled=['hst','totalPrice'].includes(key)?requiredNumberFilled(value):!!String(value||'').trim();
    if(!filled){
      missing.push(label);
      markField(fieldMap[key]);
    }
  });

  if(!order.lines.length){
    missing.push('At least one invoice item');
  }

  order.lines.forEach((line,index)=>{
    const row=document.querySelectorAll('#order-lines > div')[index];
    LINE_REQUIRED_FIELDS.forEach(([key,label])=>{
      const value=line[key];
      const filled=['qty','unitPrice','deposit'].includes(key)?requiredNumberFilled(value):!!String(value||'').trim();
      if(!filled){
        missing.push(`Item ${index+1}: ${label}`);
        row?.querySelector(`[data-field="${key}"]`)?.classList.add('field-warning');
      }
    });
  });

  if(missing.length){
    const summary=document.getElementById('order-validation-summary');
    summary.textContent=`Missing required fields: ${missing.slice(0,8).join(', ')}${missing.length>8?'…':''}`;
    summary.classList.add('show');
  }
  return missing;
}

function saveOrder(mode='draft'){
  const order=readOrderForm(mode);
  if(mode==='finish'){
    const missing=validateOrder(order);
    if(missing.length){
      toast('Finish blocked: required fields are missing.',true);
      return;
    }
  }

  if(editingOrderId){
    const index=state.orders.findIndex(item=>item.id===editingOrderId);
    if(index===-1){
      toast('Order not found.',true);
      return;
    }
    state.orders[index]=order;
  }else{
    state.orders.push(order);
  }

  state.orders.sort((a,b)=>a.date<b.date?1:-1);
  save();
  closeModal('modal-order');
  renderOrders();
  refreshLiveInventoryIfVisible();
  toast(mode==='finish'?'Invoice finished.':'Draft saved.');
}

function deleteOrder(id){
  if(!confirm('Delete?'))return;
  state.orders=state.orders.filter(order=>order.id!==id);
  save();
  renderOrders();
  refreshLiveInventoryIfVisible();
  toast('Deleted.');
}

function openScanModal(){
  scanFileData=null;
  scanFileName=null;
  scanExtractedInvoice=null;
  document.getElementById('scan-preview').innerHTML='';
  document.getElementById('scan-fname').textContent='';
  document.getElementById('scan-status').textContent='';
  document.getElementById('scan-status').className='scan-status';
  document.getElementById('scan-file').value='';
  document.getElementById('scan-create-btn').disabled=true;
  document.getElementById('scan-date').value=today();
  document.getElementById('scan-ref').value='';
  openModal('modal-scan');
}

function onScanFileChosen(event){
  const file=event.target.files[0];
  if(file)processScanFile(file);
}

function renderScanPreview(file){
  const preview=document.getElementById('scan-preview');
  if(file.type.startsWith('image/')){
    preview.innerHTML=`<div class="scan-preview-img"><img src="${scanFileData}" alt="scan"></div>`;
  }else{
    preview.innerHTML=`<div class="scan-file-preview">${escapeHtml(file.name)}</div>`;
  }
}

function setScanStatus(message,type=''){
  const el=document.getElementById('scan-status');
  el.textContent=message;
  el.className='scan-status '+type;
}

async function processScanFile(file){
  if(file.size>10*1024*1024){
    toast('Max 10 MB.',true);
    return;
  }

  scanFileName=file.name;
  scanExtractedInvoice=null;
  document.getElementById('scan-fname').textContent=file.name;
  document.getElementById('scan-create-btn').disabled=true;

  const reader=new FileReader();
  reader.onload=async event=>{
    scanFileData=event.target.result;
    renderScanPreview(file);

    if(file.type.startsWith('image/')&&window.Tesseract){
      setScanStatus('Reading invoice image…');
      try{
        const result=await Tesseract.recognize(scanFileData,'eng');
        scanExtractedInvoice=parseInvoiceText(result.data.text||'');
        setScanStatus(scanReadMessage(scanExtractedInvoice),'success');
      }catch(error){
        scanExtractedInvoice={ocrText:'',lines:[]};
        setScanStatus('Could not read the image automatically. A blank draft will open for manual entry.','warning');
      }
    }else if(file.type.startsWith('image/')){
      scanExtractedInvoice={ocrText:'',lines:[]};
      setScanStatus('OCR library did not load. A blank draft will open for manual entry.','warning');
    }else{
      scanExtractedInvoice={ocrText:'',lines:[]};
      setScanStatus('PDF scan is attached. Automatic PDF reading is not available yet, so fill the draft manually.','warning');
    }

    document.getElementById('scan-create-btn').disabled=false;
  };
  reader.readAsDataURL(file);
}

function scanReadMessage(invoice){
  const typeLabel={
    lcbo:'LCBO invoice',
    'small-winemakers':'Small Winemakers invoice',
    generic:'invoice'
  }[invoice?.parserType||'generic'];
  const count=(invoice?.lines||[]).length;
  return `${typeLabel} recognized. Extracted ${count} item${count===1?'':'s'}. Review the draft before finishing.`;
}

function findMoneyAfter(text,patterns){
  const lines=text.split(/\r?\n/).map(line=>line.trim()).filter(Boolean).reverse();
  for(const line of lines){
    for(const pattern of patterns){
      const match=line.match(pattern);
      if(match)return moneyValue(match[1]);
    }
  }
  return '';
}

function parseInvoiceText(text){
  const lines=text.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
  const joined=lines.join('\n');
  const lower=joined.toLowerCase();
  if(isLikelyLcboText(lower,lines))return parseLcboInvoice(text,lines);
  if(lower.includes('small winemakers')||lower.includes('btl price ex hst')||lower.includes('winemakers collection'))return parseSmallWinemakersInvoice(text,lines);

  const firstTextLine=lines.find(line=>/[a-zA-Z]/.test(line))||'';
  const invoiceMatch=joined.match(/(?:invoice|inv)[\s#:.-]*([A-Z0-9-]{3,})/i);
  const dateMatch=joined.match(/(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{1,2}\s+[A-Z]{3,}\s+\d{2,4}|[A-Z][a-z]{2,}\s+\d{1,2}['’]?\d{2,4})/);
  const storeMatch=joined.match(/store\s*#?\s*([A-Z0-9-]+)/i);

  return{
    supplier:firstTextLine,
    date:dateMatch?normalDate(dateMatch[1]):'',
    invoiceNumber:invoiceMatch?invoiceMatch[1]:'',
    storeNumber:storeMatch?storeMatch[1]:'',
    storeAddress:'',
    hst:findMoneyAfter(joined,[/HST[^\d$-]*\$?\s*([\d,]+(?:\.\d{2})?)/i,/tax[^\d$-]*\$?\s*([\d,]+(?:\.\d{2})?)/i]),
    deliveryFee:findMoneyAfter(joined,[/delivery[^\d$-]*\$?\s*([\d,]+(?:\.\d{2})?)/i]),
    agencyFee:findMoneyAfter(joined,[/agen(?:cy|cy fee)?[^\d$-]*\$?\s*([\d,]+(?:\.\d{2})?)/i]),
    fuelCharge:findMoneyAfter(joined,[/fuel[^\d$-]*\$?\s*([\d,]+(?:\.\d{2})?)/i]),
    totalPrice:findMoneyAfter(joined,[/(?:total|amount due|balance due)[^\d$-]*\$?\s*([\d,]+(?:\.\d{2})?)/i]),
    lines:parseInvoiceLines(lines),
    ocrText:text,
    parserType:'generic'
  };
}

function isLikelyLcboText(lower,lines){
  if(lower.includes('lcbo')&&(lower.includes('sku')||lower.includes('units purchased')||lower.includes('gift cards')))return true;
  if(lower.includes('store number')&&lower.includes('licensee'))return true;
  const skuRows=lines.filter(line=>/^\s*\D?\s*\d{4,7}\s+[A-Z][A-Z0-9\s'.&-]{3,}/i.test(line));
  return skuRows.length>=2&&/total deposit|hst amount|units purchased/i.test(lines.join('\n'));
}

function monthNumber(name){
  const key=String(name||'').slice(0,3).toLowerCase();
  return{jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12'}[key]||'';
}

function normalDate(raw){
  if(!raw)return'';
  raw=String(raw).trim();
  let match=raw.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{2,4})$/);
  if(match){
    const month=monthNumber(match[2]);
    if(!month)return'';
    const year=match[3].length===2?'20'+match[3]:match[3];
    return `${year}-${month}-${match[1].padStart(2,'0')}`;
  }
  match=raw.match(/^([A-Za-z]{3,})\s+(\d{1,2})['’]?\s*(\d{2,4})$/);
  if(match){
    const month=monthNumber(match[1]);
    if(!month)return'';
    const year=match[3].length===2?'20'+match[3]:match[3];
    return `${year}-${month}-${match[2].padStart(2,'0')}`;
  }
  const clean=raw.replace(/\//g,'-');
  const parts=clean.split('-');
  if(parts[0].length===4)return clean;
  const year=parts[2].length===2?'20'+parts[2]:parts[2];
  const month=parts[0].padStart(2,'0');
  const day=parts[1].padStart(2,'0');
  return `${year}-${month}-${day}`;
}

function lineMoney(line){
  const match=String(line||'').match(/(-?\$?\s*[\d,]+\.\d{2})(?!.*-?\$?\s*[\d,]+\.\d{2})/);
  return match?moneyValue(match[1]):'';
}

function parseStoreAddressFromBlock(lines,startIndex,stopPatterns){
  const out=[];
  for(let i=startIndex;i<Math.min(lines.length,startIndex+6);i++){
    const line=lines[i];
    if(stopPatterns.some(pattern=>pattern.test(line)))break;
    out.push(line.replace(/^store\s+\d+\s*/i,'').trim());
  }
  return out.filter(Boolean).join(', ');
}

function findLargestMoney(lines,patterns){
  const values=[];
  lines.forEach(line=>{
    patterns.forEach(pattern=>{
      if(!pattern.test(line))return;
      const money=[...line.matchAll(/-?[\d,]+\.\d{2}/g)].map(match=>moneyValue(match[0])).filter(value=>value>0);
      values.push(...money);
    });
  });
  return values.length?Math.max(...values):'';
}

function parseLcboStoreNumber(joined){
  const match=joined.match(/\b(?:store|score)\s+(\d{3,4})\b/i);
  return match?match[1]:'';
}

function parseLcboStoreAddress(lines){
  const storeIndex=lines.findIndex(line=>/\b(?:store|score)\s+\d{3,4}\b/i.test(line));
  if(storeIndex<0)return'';

  const out=[];
  const stopPatterns=[/sold to/i,/customer/i,/date\/time/i,/phone/i,/units\s+sku/i,/coson/i,/som\s+\d+/i];
  for(let i=storeIndex;i<Math.min(lines.length,storeIndex+6);i++){
    let line=lines[i].trim();
    if(i>storeIndex&&stopPatterns.some(pattern=>pattern.test(line)))break;
    line=line.replace(/^.*?\b(?:store|score)\s+\d{3,4}\b\s*/i,'').trim();
    line=line.replace(/\bstore number\b.*$/i,'').trim();
    line=line.replace(/\b(?:fax|pan)\s+number\b.*$/i,'').trim();
    if(line&&!/^(store mgr|fax number|dir\.?de\.?succ)$/i.test(line))out.push(line);
  }

  return out.filter(Boolean).join(', ');
}

function estimateHstFromIncludedTotal(totalPrice,depositTotal=0){
  const total=parseFloat(totalPrice)||0;
  const deposits=parseFloat(depositTotal)||0;
  return total?(((total-deposits)*0.13)/1.13).toFixed(2):'';
}

function lcboBottleDepositForLine(line){
  const qty=parseFloat(line.qty)||0;
  return qty?(qty*0.20).toFixed(2):'';
}

function fillLcboDeposits(lines,totalDeposit){
  const fixed=lines.map(line=>({...line}));
  fixed.forEach(line=>{
    const qty=parseFloat(line.qty)||0;
    const deposit=parseFloat(line.deposit)||0;
    const total=parseFloat(line.totalPrice)||0;
    if(!qty)return;
    if(!requiredNumberFilled(line.deposit)||deposit>qty){
      line.deposit=lcboBottleDepositForLine(line);
    }
    if(total&&parseFloat(line.deposit)>total){
      line.deposit=lcboBottleDepositForLine(line);
    }
  });

  const expected=parseFloat(totalDeposit)||0;
  const current=fixed.reduce((sum,line)=>sum+(parseFloat(line.deposit)||0),0);
  if(expected&&Math.abs(current-expected)>0.02){
    const missing=fixed.filter(line=>!requiredNumberFilled(line.deposit));
    if(missing.length){
      const known=fixed.reduce((sum,line)=>sum+(requiredNumberFilled(line.deposit)?parseFloat(line.deposit):0),0);
      const share=(expected-known)/missing.length;
      missing.forEach(line=>line.deposit=Math.max(0,share).toFixed(2));
    }
  }
  return fixed;
}

function findLcboTotalPrice(lines,parsedLines){
  const direct=findLargestMoney(lines,[/^\s*total\b/i,/^\s*tom\.?\b/i,/purchase/i,/visa/i,/mastercard/i]);
  if(direct)return direct;
  const computed=parsedLines.reduce((sum,line)=>sum+lineTotal(line),0);
  return computed?computed.toFixed(2):'';
}

function parseLcboInvoice(text,lines){
  const joined=lines.join('\n');
  const dateMatch=joined.match(/(\d{1,2}\s+[A-Z]{3,}\s+\d{4})/i);
  const txnMatch=joined.match(/T[XR]N\s*#?\s*(\d+)/i)||joined.match(/Ref[:\s]+([A-Z0-9-]+)/i);
  const storeNumber=parseLcboStoreNumber(joined);
  const storeAddress=parseLcboStoreAddress(lines);
  const totalDeposit=findMoneyAfter(joined,[/total deposit[^\d-]*(-?[\d,]+\.\d{2})/i,/deposit paid[^\d-]*(-?[\d,]+\.\d{2})/i]);
  const parsedLines=fillLcboDeposits(parseLcboInvoiceLines(lines),totalDeposit);
  const totalPrice=findLcboTotalPrice(lines,parsedLines);
  const exactHst=findMoneyAfter(joined,[/hst amount[^\d-]*(-?[\d,]+\.\d{2})/i,/hst[^\d-]*(-?[\d,]+\.\d{2})/i]);
  const hst=exactHst||estimateHstFromIncludedTotal(totalPrice,totalDeposit);

  return{
    supplier:'LCBO',
    date:dateMatch?normalDate(dateMatch[1]):'',
    invoiceNumber:txnMatch?txnMatch[1]:'',
    storeNumber,
    storeAddress,
    hst,
    totalDeposit,
    deliveryFee:'',
    agencyFee:'',
    fuelCharge:'',
    totalPrice,
    lines:parsedLines,
    ocrText:text,
    hstEstimated:!exactHst&&!!totalPrice,
    parserType:'lcbo'
  };
}

function parseLcboInvoiceLines(lines){
  const itemLines=[];
  const rowBlocks=[];
  let current='';
  const startsItem=line=>/^\s*\d+\s+\d{4,7}\s+/.test(line);
  const stopsItems=line=>/^(total|total deposit|visa|units purchased|beer discount|hst|all returns|share your opinion)/i.test(line);
  lines.forEach(line=>{
    if(startsItem(line)){
      if(current)rowBlocks.push(current);
      current=line;
      return;
    }
    if(current){
      if(stopsItems(line)){
        rowBlocks.push(current);
        current='';
        return;
      }
      current+=' '+line;
    }
  });
  if(current)rowBlocks.push(current);

  rowBlocks.forEach(block=>{
    const line=block.replace(/\s+/g,' ').trim();
    const match=line.match(/^\s*(\d+)\s+(\d{4,7})\s+(.+?)\s+(\d{3,4})\s+(-?\d+\.\d{2})\s+(-?\d+\.\d{2})\s+(-?\d+\.\d{2})\s*$/);
    if(!match)return;
    const [,qty,sku,description,size,unitPrice,deposit,totalPrice]=match;
    itemLines.push({
      productName:description.replace(/\s+RETAIL\s+[-\d.]+.*$/i,'').trim(),
      productNumber:sku,
      sku,
      qty,
      unit:'bottle',
      unitSize:size.length===3||size.length===4?size+' ml':size,
      unitPrice,
      deposit,
      totalPrice
    });
  });
  return itemLines.length?itemLines:parseLooseLcboInvoiceLines(lines);
}

function parseLooseLcboInvoiceLines(lines){
  const items=[];
  const stop=/^(total|tom\.|visa|author|merchant|approved|units purchased|beer|hst|all returns|share|rules|deposit)/i;
  for(let i=0;i<lines.length;i++){
    const line=lines[i].replace(/\s+/g,' ').trim();
    const match=line.match(/^\s*([0-9sS«<]+)\s+(\d{4,7})\s+(.+)$/);
    if(!match)continue;
    const sku=match[2];
    let block=line;
    for(let j=i+1;j<Math.min(lines.length,i+3);j++){
      if(stop.test(lines[j]))break;
      if(/^\s*[0-9sS«<]?\s*\d{4,7}\s+/.test(lines[j]))break;
      block+=' '+lines[j].replace(/\s+/g,' ').trim();
    }
    const parsed=parseLooseLcboBlock(block,match[1],sku);
    if(parsed)items.push(parsed);
  }
  return items;
}

function parseLooseLcboBlock(block,qtyToken,sku){
  const qtyMap={s:'5',S:'5','«':'4','<':'4'};
  const qty=/^\d+$/.test(qtyToken)?qtyToken:(qtyMap[qtyToken]||'');
  let rest=block.replace(/^\s*[0-9sS«<]?\s*\d{4,7}\s+/,'');
  rest=rest.replace(/\b(RETAIL|REIL)\b.*$/i,'').trim();
  const priceBlock=block.replace(/\b(RETAIL|REIL)\b.*$/i,'');
  const nums=[...priceBlock.matchAll(/-?\d+(?:[.,:]\d{1,2})?/g)].map(m=>m[0].replace(',', '.').replace(':','.'));
  const moneyNums=nums.filter(n=>/^\d+\.\d{1,2}$/.test(n)).map(n=>Number(n).toFixed(2));
  const sizeMatch=block.match(/\b(750|1000|1140|375|200|1750)\b/);
  let totalPrice='';
  let deposit='';
  let unitPrice='';
  if(moneyNums.length>=3){
    unitPrice=moneyNums[moneyNums.length-3];
    deposit=moneyNums[moneyNums.length-2];
    totalPrice=moneyNums[moneyNums.length-1];
  }else if(moneyNums.length===2&&sizeMatch){
    unitPrice=moneyNums[0];
    deposit=moneyNums[1];
  }else if(moneyNums.length===2){
    deposit=moneyNums[0];
    totalPrice=moneyNums[1];
  }else if(moneyNums.length===1&&sizeMatch){
    unitPrice=moneyNums[0];
  }else if(moneyNums.length===1){
    totalPrice=moneyNums[0];
  }
  const name=rest.replace(/\b(750|1000|1140|375|200|1750)\b.*$/,'').replace(/\s+\d+[.,:]\d+.*$/,'').trim();
  if(!name||name.length<3)return null;
  return{
    productName:name,
    productNumber:sku,
    sku,
    qty,
    unit:'bottle',
    unitSize:sizeMatch?sizeMatch[1]+' ml':'',
    unitPrice,
    deposit,
    totalPrice
  };
}

function parseSmallWinemakersInvoice(text,lines){
  const joined=lines.join('\n');
  const invoiceMatch=joined.match(/Invoice Number\s+([A-Z0-9-]+)/i);
  const dateMatch=joined.match(/Invoice Date\s+([A-Za-z]{3,}\s+\d{1,2}['’]?\d{2,4})/i);
  const hst=findMoneyAfter(joined,[/total hst[^\d-]*(-?[\d,]+\.\d{2})/i,/hst[^\d-]*(-?[\d,]+\.\d{2})/i]);
  const deliveryFee=findMoneyAfter(joined,[/delivery charge[^\d-]*(-?[\d,]+\.\d{2})/i]);
  const totalPrice=findMoneyAfter(joined,[/total cost of order[^\d-]*(-?[\d,]+\.\d{2})/i,/amount owing[^\d-]*(-?[\d,]+\.\d{2})/i]);
  const totalDeposit=findMoneyAfter(joined,[/bottle deposits[^\d-]*(-?[\d,]+\.\d{2})/i]);
  const billedIndex=lines.findIndex(line=>/billed to/i.test(line));
  const storeAddress=billedIndex>=0?parseStoreAddressFromBlock(lines,billedIndex+1,[/invoice/i,/year\s+winery/i,/shipped to/i]):'';
  const parsedLines=parseSmallWinemakersLines(lines,totalDeposit);

  return{
    supplier:'The Small Winemakers Collection Inc.',
    date:dateMatch?normalDate(dateMatch[1]):'',
    invoiceNumber:invoiceMatch?invoiceMatch[1]:'',
    storeNumber:'',
    storeAddress,
    hst,
    deliveryFee,
    agencyFee:'',
    fuelCharge:'',
    totalPrice,
    lines:parsedLines,
    ocrText:text,
    parserType:'small-winemakers'
  };
}

function parseSmallWinemakersLines(lines,totalDeposit){
  const itemLines=[];
  const rowBlocks=[];
  let current='';
  const startsItem=line=>/^\s*20\d{2}\s+/.test(line);
  const stopsItems=line=>/^(shipped to|reg hst|net product cost|delivery charge|subtotal|total hst|bottle deposits|total cost|received by|payment terms)/i.test(line);
  lines.forEach(line=>{
    if(startsItem(line)){
      if(current)rowBlocks.push(current);
      current=line;
      return;
    }
    if(current){
      if(stopsItems(line)){
        rowBlocks.push(current);
        current='';
        return;
      }
      current+=' '+line;
    }
  });
  if(current)rowBlocks.push(current);

  rowBlocks.forEach(block=>{
    const line=block.replace(/\s+/g,' ').trim();
    const match=line.match(/^(\d{4})\s+(.+?)\s+(.+?)\s+(\d+\.\d{2})\s+(\d{4,7})\s+(\d+)\s+(\d+\.\d{2})\s+\$?\s*([\d,]+\.\d{2})\s*$/);
    if(!match)return;
    const [,year,winery,wine,lcboRelease,itemNumber,qty,unitPrice,totalPrice]=match;
    itemLines.push({
      productName:[winery,wine].join(' ').trim(),
      productNumber:itemNumber,
      sku:itemNumber,
      qty,
      unit:'bottle',
      unitSize:'',
      unitPrice,
      deposit:0,
      totalPrice,
      notes:`${year} vintage. LCBO rel price ${lcboRelease}.`
    });
  });
  const totalQty=itemLines.reduce((sum,line)=>sum+(parseFloat(line.qty)||0),0);
  const depositEach=totalQty&&totalDeposit?moneyValue(totalDeposit)/totalQty:0;
  if(depositEach)itemLines.forEach(line=>line.deposit=+depositEach.toFixed(2));
  return itemLines;
}

function parseInvoiceLines(lines){
  const itemLines=[];
  lines.forEach(line=>{
    const moneyMatches=[...line.matchAll(/\$?\s*(\d+(?:\.\d{2}))/g)].map(match=>match[1]);
    const tokens=line.replace(/\$/g,'').split(/\s+/).filter(Boolean);
    if(tokens.length<6||moneyMatches.length<2)return;
    const qtyOffset=tokens.slice(2).findIndex(token=>/^\d+(?:\.\d+)?$/.test(token));
    const qtyIndex=qtyOffset===-1?-1:qtyOffset+2;
    if(qtyIndex<2)return;
    const qty=tokens[qtyIndex];
    const unit=tokens[qtyIndex+1]||'';
    const unitSize=tokens[qtyIndex+2]||'';
    const unitPrice=moneyMatches.length>2?moneyMatches[moneyMatches.length-3]:moneyMatches[moneyMatches.length-2];
    const deposit=moneyMatches.length>2?moneyMatches[moneyMatches.length-2]:'0';
    const totalPrice=moneyMatches[moneyMatches.length-1];
    itemLines.push({
      productNumber:tokens[0]||'',
      sku:tokens[1]||'',
      qty,
      unit,
      unitSize,
      unitPrice,
      deposit,
      totalPrice
    });
  });
  return itemLines.slice(0,40);
}

function createOrderFromScan(){
  if(!scanFileData){
    toast('No file.',true);
    return;
  }

  const extracted=scanExtractedInvoice||{};
  const date=document.getElementById('scan-date').value||extracted.date||today();
  const ref=document.getElementById('scan-ref').value.trim();
  const normalizedLines=(extracted.lines||[]).map(normalizeLine);
  const itemTotal=normalizedLines.reduce((sum,line)=>sum+lineTotal(line),0);
  const extractedTotal=requiredNumberFilled(extracted.totalPrice)?parseFloat(extracted.totalPrice):0;
  const totalPrice=itemTotal&&itemTotal>extractedTotal?itemTotal.toFixed(2):(extracted.totalPrice??'');
  const hst=extracted.hstEstimated&&itemTotal&&itemTotal>extractedTotal?estimateHstFromIncludedTotal(totalPrice,extracted.totalDeposit):(extracted.hst??'');
  const order={
    id:uid(),
    supplier:extracted.supplier||'',
    date,
    invoiceNumber:extracted.invoiceNumber||ref||`Scan — ${scanFileName}`,
    storeNumber:extracted.storeNumber||'',
    storeAddress:extracted.storeAddress||'',
    hst,
    deliveryFee:extracted.deliveryFee??'',
    agencyFee:extracted.agencyFee??'',
    fuelCharge:extracted.fuelCharge??'',
    totalPrice,
    isRefund:false,
    status:'Draft from Scan',
    notes:`From scan: ${scanFileName}`,
    lines:normalizedLines,
    scanData:scanFileData,
    scanName:scanFileName,
    ocrText:extracted.ocrText||''
  };

  state.orders.push(order);
  state.orders.sort((a,b)=>a.date<b.date?1:-1);
  save();
  closeModal('modal-scan');
  renderOrders();
  toast('Draft created. Review required fields before finishing.');
  setTimeout(()=>openOrderModal(order.id),250);
}

function viewScan(id){
  const order=state.orders.find(item=>item.id===id);
  if(!order?.scanData)return;

  document.getElementById('view-scan-title').textContent=`Scan — ${orderInvoiceNumber(normalizeOrder(order))||id}`;
  const body=document.getElementById('view-scan-body');
  if(order.scanData.startsWith('data:image/')){
    body.innerHTML=`<img src="${order.scanData}" class="scan-view-img" alt="Order scan">`;
  }else{
    body.innerHTML=`<a href="${order.scanData}" download="${escapeHtml(order.scanName||'order.pdf')}" class="btn btn-primary">Download PDF</a>`;
  }
  openModal('modal-view-scan');
}

function detailField(label,value){
  return`<div class="invoice-detail-field"><div class="label">${label}</div><div class="value">${value?escapeHtml(value):'—'}</div></div>`;
}

function viewOrderDetail(id){
  const raw=state.orders.find(item=>item.id===id);
  if(!raw)return;
  const order=normalizeOrder(raw);
  const body=document.getElementById('order-detail-body');
  const rows=order.lines.map(line=>{
    const total=lineTotal(line);
    return`<tr><td>${escapeHtml(line.productName||'')}</td><td>${escapeHtml(line.productNumber)}</td><td>${escapeHtml(line.sku)}</td><td>${escapeHtml(line.qty)}</td><td>${escapeHtml(line.unit)}</td><td>${escapeHtml(line.unitSize)}</td><td>${fmt(line.unitPrice)}</td><td>${fmt(line.deposit)}</td><td>${fmt(total)}</td></tr>`;
  }).join('');
  body.innerHTML=`
    <div class="invoice-detail-head">
      <div class="invoice-detail-title">
        <h3 id="order-detail-title">${order.isRefund?'Refund / Credit':'Invoice'} ${order.invoiceNumber?escapeHtml(order.invoiceNumber):''}</h3>
        <p style="color:var(--text-muted);font-size:0.86rem;">${escapeHtml(order.supplier||'No supplier')}</p>
      </div>
      <div class="detail-heading-actions"><button class="icon-btn" type="button" aria-label="Edit invoice" title="Edit invoice" onclick="openOrderModal('${order.id}');closeModal('modal-order-detail')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l11-11-4-4L4 16v4Z"></path><path d="m13.5 6.5 4 4"></path></svg></button><button class="detail-close" type="button" aria-label="Close invoice detail" title="Close" onclick="closeModal('modal-order-detail')">&times;</button></div>
    </div>
    <div class="invoice-detail-meta">
      ${detailField('Invoice Number',order.invoiceNumber)}
      ${detailField('Supplier',order.supplier)}
      ${detailField('Date',fmtDate(order.date))}
      ${detailField('Total Price',(order.isRefund?'-':'')+fmt(orderTotal(order)))}
      ${detailField('HST',fmt(order.hst))}
      ${detailField('Delivery Fee',order.deliveryFee?fmt(order.deliveryFee):'')}
      ${detailField('Agency Fee',order.agencyFee?fmt(order.agencyFee):'')}
      ${detailField('Fuel Charge',order.fuelCharge?fmt(order.fuelCharge):'')}
      ${detailField('Store #',order.storeNumber)}
      ${detailField('Store Address',order.storeAddress)}
      ${detailField('Status',order.status)}
      ${detailField('Notes',order.notes)}
    </div>
    <div class="table-wrap"><table class="invoice-detail-table" aria-label="Invoice items">
      <thead><tr><th>Product</th><th>Product #</th><th>SKU</th><th>Qty</th><th>Unit</th><th>Unit Size</th><th>Unit Price</th><th>Deposit</th><th>Total</th></tr></thead>
      <tbody>${rows||'<tr><td colspan="9" class="empty-cell">No items entered.</td></tr>'}</tbody>
    </table></div>
  `;
  openModal('modal-order-detail');
}
