// usage.js — usage upload/compute, insights, par-level helpers.

const USAGE_COLUMN_PATTERNS={
  product:[/^product$/,/^productname$/,/^item$/,/^itemname$/,/^description$/,/^desc$/,/^name$/,/product.*description/,/item.*description/],
  sku:[/^sku$/,/^code$/,/^sku.*code$/,/^product.*#$/,/^product.*number$/,/^item.*#$/,/^item.*number$/],
  size:[/^size$/,/^unit.*size$/,/^bottle.*size$/,/^pkg.*size$/,/^package.*size$/],
  actualUsage:[/^actual.*usage$/,/^usage$/,/^used$/,/^qty.*used$/,/^quantity.*used$/,/^actual$/,/^actual.*used$/],
  begin:[/^begin$/,/^beginning$/,/^start.*inventory$/,/^begin.*inventory$/,/^opening$/,/^opening.*inventory$/],
  end:[/^end$/,/^ending$/,/^end.*inventory$/,/^ending.*inventory$/,/^closing$/,/^closing.*inventory$/,/^finish$/,/^finished$/],
  purch:[/^purch$/,/^purchase$/,/^purchases$/,/^purchased$/,/^qty.*purch/,/^quantity.*purch/,/^received$/],
  periodStart:[/^period.*start$/,/^start.*date$/,/^from$/,/^from.*date$/,/^date.*from$/],
  periodEnd:[/^period.*end$/,/^end.*date$/,/^to$/,/^to.*date$/,/^date.*to$/]
};

function cleanUsageHeader(value){
  return String(value??'').trim().toLowerCase().replace(/[#/()$.,:-]/g,' ').replace(/\s+/g,' ').trim();
}

function compactUsageHeader(value){
  return cleanUsageHeader(value).replace(/[^a-z0-9]/g,'');
}

function usageCell(row,index){
  return index===undefined||index<0?'':row[index];
}

function usageNumber(value){
  if(value===null||value===undefined||value==='')return '';
  if(typeof value==='number')return isNaN(value)?'':value;
  const cleaned=String(value).replace(/,/g,'').match(/-?\d+(?:\.\d+)?/);
  return cleaned?parseFloat(cleaned[0]):'';
}

function usageDate(value){
  if(value===null||value===undefined||value==='')return '';
  if(value instanceof Date&&!isNaN(value))return value.toISOString().slice(0,10);
  if(typeof value==='number'&&value>20000&&value<90000){
    const date=new Date(Math.round((value-25569)*86400000));
    return date.toISOString().slice(0,10);
  }
  const raw=String(value).trim();
  if(!raw)return '';
  if(!/\d/.test(raw))return '';
  const parsed=new Date(raw);
  if(!isNaN(parsed))return parsed.toISOString().slice(0,10);
  if(typeof normalDate==='function'){
    try{
      const normalized=normalDate(raw);
      if(normalized&&/^\d{4}-\d{2}-\d{2}$/.test(normalized))return normalized;
    }catch(error){
      return '';
    }
  }
  return '';
}

function usageReportYear(rows){
  const text=rows.slice(0,20).map(row=>row.join(' ')).join(' ');
  const years=[...text.matchAll(/\b(20\d{2})\b/g)].map(match=>match[1]);
  return years[0]||String(new Date().getFullYear());
}

function usageDateWithYear(value,year=usageReportYear([])){
  const raw=String(value||'').trim();
  if(!raw)return '';
  const monthNames='jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december';
  let match=raw.match(new RegExp(`\\b(${monthNames})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`,'i'));
  if(match&&typeof monthNumber==='function'){
    const month=monthNumber(match[1]);
    if(month)return `${year}-${month}-${match[2].padStart(2,'0')}`;
  }
  match=raw.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthNames})\\b`,'i'));
  if(match&&typeof monthNumber==='function'){
    const month=monthNumber(match[2]);
    if(month)return `${year}-${month}-${match[1].padStart(2,'0')}`;
  }
  const direct=usageDate(raw.replace(/(\d{1,2})(?:st|nd|rd|th)\b/gi,'$1'));
  if(direct)return direct;
  return '';
}

function usageDatesInText(text,year){
  const raw=String(text||'');
  const dates=[];
  const patterns=[
    /\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b/g,
    /\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b/g,
    /\b[A-Za-z]{3,}\s+\d{1,2}(?:st|nd|rd|th)?(?:['’]?\s*\d{2,4})?\b/g,
    /\b\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3,}(?:\s+\d{2,4})?\b/g
  ];
  patterns.forEach(pattern=>{
    [...raw.matchAll(pattern)].forEach(match=>{
      const date=usageDateWithYear(match[0],year);
      if(date&&!dates.includes(date))dates.push(date);
    });
  });
  return dates;
}

function usageReportPeriodFromHeader(rows,headerIndex=16){
  const limit=Math.max(1,Math.min(rows.length,(headerIndex||16)+1));
  const text=rows.slice(0,limit).map(row=>row.join(' ')).join('\n');
  const datePattern=`(\\d{1,2}[-/]\\d{1,2}[-/]\\d{2,4}|\\d{4}[-/]\\d{1,2}[-/]\\d{1,2}|[A-Za-z]{3,}\\s+\\d{1,2}(?:st|nd|rd|th)?(?:['’]?\\s*\\d{2,4})?|\\d{1,2}(?:st|nd|rd|th)?\\s+[A-Za-z]{3,}(?:\\s+\\d{2,4})?)`;
  const timePattern='(?:\\s+\\d{1,2}:\\d{2}(?::\\d{2})?\\s*(?:AM|PM)?)?';
  const range=text.match(new RegExp(`${datePattern}${timePattern}\\s*(?:-|–|to)\\s*${datePattern}${timePattern}`,'i'));
  if(!range)return{start:'',end:''};
  const year=usageReportYear(rows);
  const start=usageDateWithYear(range[1],year);
  const end=usageDateWithYear(range[2],year);
  return{start,end:end||start};
}

function usageColumnScore(row){
  const headers=row.map(compactUsageHeader).filter(Boolean);
  const joined=headers.join(' ');
  let score=0;
  ['product','item','description'].forEach(word=>{if(joined.includes(word))score+=2;});
  ['actualusage','usage','used'].forEach(word=>{if(joined.includes(word))score+=2;});
  ['begin','beginning','opening'].forEach(word=>{if(joined.includes(word))score++;});
  ['end','ending','closing'].forEach(word=>{if(joined.includes(word))score++;});
  ['purch','purchase','purchased'].forEach(word=>{if(joined.includes(word))score++;});
  return score;
}

function findUsageHeaderRow(rows){
  let bestIndex=0;
  let bestScore=-1;
  rows.slice(0,30).forEach((row,index)=>{
    const score=usageColumnScore(row);
    if(score>bestScore){
      bestScore=score;
      bestIndex=index;
    }
  });
  return bestIndex;
}

function findUsageColumn(headers,type){
  const patterns=USAGE_COLUMN_PATTERNS[type]||[];
  const cleaned=headers.map(cleanUsageHeader);
  const compacted=headers.map(compactUsageHeader);
  for(let i=0;i<cleaned.length;i++){
    if(patterns.some(pattern=>pattern.test(cleaned[i])||pattern.test(compacted[i])))return i;
  }
  return -1;
}

function usageColumnMap(headers){
  return Object.keys(USAGE_COLUMN_PATTERNS).reduce((map,type)=>{
    map[type]=findUsageColumn(headers,type);
    return map;
  },{});
}

function inferUsagePeriod(rows,headerIndex){
  const headerRange=usageReportPeriodFromHeader(rows,headerIndex);
  if(headerRange.start||headerRange.end)return headerRange;
  const year=usageReportYear(rows);
  const headerText=rows.slice(0,Math.min(headerIndex,16)).map(row=>row.join(' ')).join('\n');
  const startMatch=headerText.match(/(?:start|begin|from)\s*(?:date)?\s*[:#-]?\s*([A-Za-z]{3,}\s+\d{1,2}(?:st|nd|rd|th)?(?:['’]?\s*\d{2,4})?|\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3,}(?:\s+\d{2,4})?|\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2})/i);
  const endMatch=headerText.match(/(?:end|finish|to)\s*(?:date)?\s*[:#-]?\s*([A-Za-z]{3,}\s+\d{1,2}(?:st|nd|rd|th)?(?:['’]?\s*\d{2,4})?|\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3,}(?:\s+\d{2,4})?|\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2})/i);
  const labelledStart=startMatch?usageDateWithYear(startMatch[1],year):'';
  const labelledEnd=endMatch?usageDateWithYear(endMatch[1],year):'';
  if(labelledStart||labelledEnd)return{start:labelledStart,end:labelledEnd||labelledStart};
  const values=usageDatesInText(headerText,year);
  return{
    start:values[0]||'',
    end:values[1]||values[0]||''
  };
}

function usageVariantChoices(){
  return state.products.flatMap(product=>{
    normalizeProductUnits(product);
    const names=[product.name,product.inventoryName,...String(product.aliases||'').split(',').map(item=>item.trim()).filter(Boolean)].filter(Boolean);
    return product.units.map(unit=>({
      product,
      unit,
      names,
      nameKeys:names.map(normMatch).filter(Boolean),
      skuKeys:[unit.sku,product.sku,product.id].map(normMatch).filter(Boolean),
      sizeKey:usageSizeKey(unit.unitSize||unit.unit||product.unit)
    }));
  });
}

function usageSizeKey(value){
  return normMatch(String(value||'').replace(/\b(litre|liter|litres|liters)\b/gi,'l').replace(/\bmillilitre|milliliter|millilitres|milliliters\b/gi,'ml'));
}

function bestUsageMatch(matches,sizeKey){
  if(!matches.length)return null;
  const sized=sizeKey?matches.find(match=>usageSizeKey(match.choice.unit.unitSize||match.choice.unit.unit||match.choice.product.unit)===sizeKey):null;
  const selected=sized||matches[0];
  return{
    product:selected.choice.product,
    unit:selected.choice.unit,
    sizeMatched:!sizeKey||!!sized||!selected.choice.sizeKey
  };
}

function matchUsageProduct({name,sku,size}){
  const nameKey=normMatch(name);
  const skuKey=normMatch(sku);
  const sizeKey=usageSizeKey(size);
  const choices=usageVariantChoices();
  let matches=[];

  if(skuKey){
    matches=choices.filter(choice=>choice.skuKeys.includes(skuKey)).map(choice=>({choice,score:100,key:skuKey}));
    const skuMatch=bestUsageMatch(matches,sizeKey);
    if(skuMatch)return skuMatch;
  }
  if(nameKey){
    matches=choices.filter(choice=>choice.nameKeys.includes(nameKey)).map(choice=>({choice,score:100,key:nameKey}));
    const exactMatch=bestUsageMatch(matches,sizeKey);
    if(exactMatch)return exactMatch;
  }
  // Similar or partial names are suggestions only. They must be approved in
  // the import review instead of being linked automatically.
  return null;
}

function usageProductDefaultUnit(product){
  normalizeProductUnits(product);
  return product.units.find(unit=>unit.unitSize||unit.unit||unit.sku)||product.units[0]||{};
}

const FOODTRAK_USAGE_MAIN_HEADINGS=new Set(['Entree','Liquor','Wine','Beer','Misc','Supplies Non Inv','Not Applicable']);
const FOODTRAK_USAGE_SUBHEADINGS=new Set([
  'Meat','Seafood','Appie','Dessert','Dairy','Produce','Starch','Sauces','Grocery','Subrecipes','Bread',
  'Canadian Whiskey','Scotch/Irish Whiskey','Gin','Vodka','Rum','Liqueurs','Aperitifs','Tequila',
  'Red','Red -LCBO Purch','White/Rose','White/Rose -LCBO Purch','Champagne/Sparkling','Champagne/Sparking -LCBO Purch',
  'Draft','Bottled Beer','Coolers Wine Liqour Malt','Inventoried Supplies','Deposits','Local Marketing'
]);

function foodtrakUsageHeading(row){
  const text=(row||[]).map(cell=>String(cell||'').replace(/\s+/g,' ').trim()).filter(Boolean).join(' ').trim();
  if(FOODTRAK_USAGE_MAIN_HEADINGS.has(text))return{level:'main',name:text};
  if(FOODTRAK_USAGE_SUBHEADINGS.has(text))return{level:'sub',name:text};
  return null;
}

function parseUsageReportRows(rows,fileName){
  const headerIndex=findUsageHeaderRow(rows);
  const headers=rows[headerIndex]||[];
  const col=usageColumnMap(headers);
  const inferredPeriod=inferUsagePeriod(rows,headerIndex);
  const parsed=[];
  let reportCategory='';
  let reportSubcategory='';

  if(col.product<0&&col.sku<0){
    throw new Error('Could not find a Product, Item, SKU, or Code column.');
  }

  rows.slice(headerIndex+1).forEach((row,index)=>{
    const heading=foodtrakUsageHeading(row);
    if(heading){
      if(heading.level==='main'){
        reportCategory=heading.name;
        reportSubcategory='';
      }else reportSubcategory=heading.name;
      return;
    }
    const productName=String(usageCell(row,col.product)).trim();
    const sku=String(usageCell(row,col.sku)).trim();
    const unitSize=String(usageCell(row,col.size)).trim();
    if(/^profit\s*center\s*:?$/i.test(productName)||/^profit\s*center\s+sales\s*:?$/i.test(productName))return;
    if(!productName&&!sku)return;

    const actual=usageNumber(usageCell(row,col.actualUsage));
    const begin=usageNumber(usageCell(row,col.begin));
    const end=usageNumber(usageCell(row,col.end));
    const purch=usageNumber(usageCell(row,col.purch));
    const calculated=begin!==''||end!==''||purch!==''?Math.max(0,(parseFloat(begin)||0)+(parseFloat(purch)||0)-(parseFloat(end)||0)):'';
    const qty=actual!==''?actual:calculated;
    if(qty==='')return;

    const match=matchUsageProduct({name:productName,sku,size:unitSize});
    const periodYear=usageReportYear(rows);
    const periodStart=usageDateWithYear(usageCell(row,col.periodStart),periodYear)||inferredPeriod.start;
    const periodEnd=usageDateWithYear(usageCell(row,col.periodEnd),periodYear)||inferredPeriod.end;

    parsed.push({
      productId:match?match.product.id:null,
      productName:productName||sku,
      reportProductName:productName,
      sku,
      unitSize:unitSize||match?.unit?.unitSize||match?.unit?.unit||match?.product?.unit||'',
      qty,
      actualUsage:actual,
      begin,
      end,
      purch,
      periodStart,
      periodEnd,
      reportCategory,
      reportSubcategory,
      matched:!!match,
      matchedName:match?match.product.name:null,
      sizeMatched:match?match.sizeMatched:false,
      sourceFile:fileName,
      importedAt:new Date().toISOString(),
      sourceOrder:index
    });
  });

  return parsed;
}

function completeUsageRowsForProducts(rows,fileName,periodStart='',periodEnd=''){
  const byProduct=new Set(rows.filter(row=>row.matched&&row.productId).map(row=>row.productId));
  const completed=[...rows];
  state.products.forEach(product=>{
    if(byProduct.has(product.id))return;
    const unit=usageProductDefaultUnit(product);
    completed.push({
      productId:product.id,
      productName:product.name,
      reportProductName:product.name,
      sku:unit.sku||product.sku||'',
      unitSize:unit.unitSize||unit.unit||product.unit||'',
      qty:0,
      actualUsage:0,
      begin:'',
      end:'',
      purch:'',
      periodStart,
      periodEnd,
      matched:true,
      matchedName:product.name,
      sizeMatched:true,
      sourceFile:fileName,
      importedAt:new Date().toISOString(),
      generated:true
    });
  });
  return completed;
}

function validUsageDate(value){
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value||''))?value:'';
}

function usagePeriodFromRows(rows=[],fallbackStart='',fallbackEnd=''){
  const starts=[];
  const ends=[];
  const fallbackS=validUsageDate(fallbackStart);
  const fallbackE=validUsageDate(fallbackEnd);
  if(fallbackS)starts.push(fallbackS);
  if(fallbackE&&(!fallbackS||fallbackE>=fallbackS))ends.push(fallbackE);
  rows.forEach(row=>{
    const start=validUsageDate(row.periodStart);
    const end=validUsageDate(row.periodEnd);
    if(start)starts.push(start);
    if(end&&(!start||end>=start))ends.push(end);
  });
  starts.sort();
  ends.sort();
  const start=starts[0]||'';
  const end=ends[ends.length-1]||start;
  return{start,end};
}

function inventoryEntryTemplateItemsFromRows(rows){
  const seen=new Set();
  const items=[];
  rows
    .filter(row=>row&&row.productId)
    .sort((a,b)=>(Number.isFinite(a.sourceOrder)?a.sourceOrder:Number.MAX_SAFE_INTEGER)-(Number.isFinite(b.sourceOrder)?b.sourceOrder:Number.MAX_SAFE_INTEGER))
    .forEach((row,index)=>{
      if(seen.has(row.productId))return;
      const product=getProduct(row.productId);
      if(!product)return;
      seen.add(row.productId);
      items.push({
        productId:row.productId,
        productName:product.name,
        reportProductName:row.reportProductName||row.productName||product.name,
        section:row.section||'',
        sourceOrder:Number.isFinite(row.sourceOrder)?row.sourceOrder:index
      });
    });
  return items.map((item,index)=>({...item,sourceOrder:index}));
}

function saveInventoryEntryTemplateFromRows(fileName,rows,source='template'){
  const items=inventoryEntryTemplateItemsFromRows(rows);
  state.inventoryEntryTemplate=items.length?{
    sourceFile:fileName,
    uploadedAt:new Date().toISOString(),
    source,
    items
  }:null;
  return items.length;
}

function openInventoryTemplateUploadModal(){
  resetInventoryTemplatePreview();
  const status=document.getElementById('inventory-template-status');
  const applied=state.inventoryEntryTemplate;
  if(applied?.items?.length){
    pendingInventoryEntryTemplate={
      sourceFile:applied.sourceFile||'Current template',
      source:applied.source||'template',
      items:applied.items.map((item,index)=>({...item,sourceOrder:index}))
    };
    renderInventoryTemplatePreview();
  }
  renderInventoryTemplateImportReview();
  if(status)status.textContent=applied?.items?.length
    ?`Current applied order is shown below. Upload a file to analyze and replace this preview.`
    :'Upload a file to analyze and preview its product order.';
  openModal('modal-inventory-template-upload');
}

function resetInventoryTemplatePreview(){
  pendingInventoryEntryTemplate=null;
  draggedInventoryTemplateIndex=null;
  const preview=document.getElementById('inventory-template-preview');
  if(preview)preview.hidden=true;
  const list=document.getElementById('inventory-template-list');
  if(list)list.innerHTML='';
  const search=document.getElementById('inventory-template-search');
  if(search)search.value='';
  const summary=document.getElementById('inventory-template-import-summary');
  if(summary)summary.hidden=true;
  const unmatched=document.getElementById('inventory-template-unmatched');
  if(unmatched)unmatched.hidden=true;
  const unmatchedGroups=document.getElementById('inventory-template-unmatched-groups');
  if(unmatchedGroups)unmatchedGroups.innerHTML='';
}

function selectedInventoryTemplateItems(){
  const pending=pendingInventoryEntryTemplate;
  if(!pending)return[];
  if(!Array.isArray(pending.groups))return pending.items||[];
  return pending.groups
    .map((group,groupIndex)=>({group,groupIndex}))
    .filter(({group})=>group.selected)
    .sort((a,b)=>a.group.sourceOrder-b.group.sourceOrder)
    .map(({group,groupIndex})=>({
      productId:group.productId||'',
      productName:group.productName,
      reportProductName:group.sourceNames[0]||group.productName,
      section:group.section||'',
      sourceOrder:group.sourceOrder,
      groupIndex
    }));
}

function inventoryTemplateImportCounts(){
  const pending=pendingInventoryEntryTemplate;
  const groups=pending?.groups||[];
  return{
    rows:pending?.extractedCount||0,
    sections:pending?.sectionCount||0,
    matched:groups.filter(group=>group.productId).length,
    unmatched:groups.filter(group=>!group.productId).length,
    selectedNew:groups.filter(group=>!group.productId&&group.selected).length,
    newUnits:groups.filter(group=>group.productId&&group.selected).reduce((sum,group)=>sum+group.newUnits.length,0)
  };
}

function renderInventoryTemplateImportSummary(){
  const summary=document.getElementById('inventory-template-import-summary');
  const groups=pendingInventoryEntryTemplate?.groups;
  if(!summary)return;
  summary.hidden=!groups;
  if(!groups)return;
  const counts=inventoryTemplateImportCounts();
  summary.innerHTML=`
    <div><strong>${counts.rows}</strong><span>rows extracted</span></div>
    <div><strong>${counts.sections}</strong><span>headers</span></div>
    <div><strong>${counts.matched}</strong><span>matched products</span></div>
    <div><strong>${counts.newUnits}</strong><span>units to add</span></div>
    <div><strong>${counts.unmatched}</strong><span>unmatched products</span></div>
  `;
}

function renderInventoryTemplateImportReview(){
  renderInventoryTemplateImportSummary();
  const panel=document.getElementById('inventory-template-unmatched');
  const wrap=document.getElementById('inventory-template-unmatched-groups');
  const groups=pendingInventoryEntryTemplate?.groups;
  if(!panel||!wrap){return;}
  if(!groups){panel.hidden=true;wrap.innerHTML='';return;}
  const unitGroups=groups.map((group,index)=>({group,index})).filter(({group})=>group.productId&&group.newUnits.length);
  const unmatched=groups.map((group,index)=>({group,index})).filter(({group})=>!group.productId);
  const bySection=new Map();
  unmatched.forEach(entry=>{
    const section=entry.group.section||'Uncategorized';
    if(!bySection.has(section))bySection.set(section,[]);
    bySection.get(section).push(entry);
  });
  panel.hidden=false;
  wrap.innerHTML=`
    <details class="inventory-template-review-group">
      <summary><span>Different units found</span><strong>${unitGroups.reduce((sum,entry)=>sum+entry.group.newUnits.length,0)}</strong></summary>
      ${unitGroups.length?`<div class="inventory-template-review-list">${unitGroups.map(({group,index})=>`
        <div class="inventory-template-review-row unit-update">
          <span><strong>${escapeHtml(group.productName)}</strong><small>Matched existing product</small></span>
          <span class="inventory-template-unit-list">${group.newUnits.map(unit=>`<em>${escapeHtml(unit)}</em>`).join('')}</span>
          <button class="btn btn-secondary btn-sm inventory-template-add-unit" type="button" onclick="addInventoryTemplateUnits(${index})">Add unit</button>
        </div>`).join('')}</div>`:`<div class="inventory-template-no-units"><strong>No missing units in this analysis.</strong><span>Every analyzed unit already exists on its matched product. Units are now added only when you press Add unit.</span></div>`}
    </details>
    ${[...bySection.entries()].map(([section,entries])=>`<details class="inventory-template-review-group">
      <summary><span class="inventory-template-section-select"><input type="checkbox" data-section-select="${escapeHtml(section)}" aria-label="Select all ${escapeHtml(section)} unmatched products" ${entries.every(entry=>entry.group.selected)?'checked':''} onclick="event.stopPropagation()" onchange="toggleInventoryTemplateSection(this.dataset.section,this.checked)"><span>${escapeHtml(section)}</span></span><strong>${entries.length} unmatched</strong></summary>
      <div class="inventory-template-review-list">${entries.map(({group,index})=>`
        <label class="inventory-template-review-row">
          <input type="checkbox" ${group.selected?'checked':''} onchange="toggleInventoryTemplateGroup(${index},this.checked)">
          <span><strong>${escapeHtml(group.productName)}</strong><small>${escapeHtml(group.category)} · ${escapeHtml(group.subcategory)}</small></span>
          <span class="inventory-template-unit-list">${group.units.map(unit=>`<em>${escapeHtml(unit)}</em>`).join('')}</span>
        </label>`).join('')}</div>
    </details>`).join('')}
    ${unmatched.length?`<div class="inventory-template-review-actions">
      <button class="btn btn-secondary btn-sm" type="button" onclick="selectAllInventoryTemplateUnmatched(true)">Select all unmatched products</button>
      <button class="btn btn-secondary btn-sm" type="button" onclick="selectAllInventoryTemplateUnmatched(false)">Unselect all</button>
      <button class="btn btn-primary btn-sm" id="inventory-template-add-selected" type="button" onclick="addSelectedInventoryTemplateProducts()" ${unmatched.some(entry=>entry.group.selected)?'':'disabled'}>Add selected items</button>
    </div>`:''}
  `;
  [...bySection.entries()].forEach(([section])=>syncInventoryTemplateSectionCheckbox(section));
}

function toggleInventoryTemplateGroup(index,selected){
  const group=pendingInventoryEntryTemplate?.groups?.[index];
  if(!group)return;
  group.selected=!!selected;
  renderInventoryTemplateImportSummary();
  renderInventoryTemplatePreview();
  syncInventoryTemplateSectionCheckbox(group.section);
  const addSelected=document.getElementById('inventory-template-add-selected');
  if(addSelected)addSelected.disabled=!(pendingInventoryEntryTemplate?.groups||[]).some(item=>!item.productId&&item.selected);
}

function syncInventoryTemplateSectionCheckbox(section){
  const checkbox=[...document.querySelectorAll('[data-section-select]')].find(input=>input.dataset.sectionSelect===section);
  if(!checkbox)return;
  const groups=(pendingInventoryEntryTemplate?.groups||[]).filter(group=>!group.productId&&group.section===section);
  const selected=groups.filter(group=>group.selected).length;
  checkbox.checked=groups.length>0&&selected===groups.length;
  checkbox.indeterminate=selected>0&&selected<groups.length;
}

function syncInventoryTemplateSectionRows(section,selected){
  const checkbox=[...document.querySelectorAll('[data-section-select]')].find(input=>input.dataset.sectionSelect===section);
  const details=checkbox?.closest('.inventory-template-review-group');
  if(!details)return;
  details.querySelectorAll('.inventory-template-review-list input[type="checkbox"]').forEach(input=>{
    input.checked=!!selected;
  });
}

function toggleInventoryTemplateSection(section,selected){
  const groups=(pendingInventoryEntryTemplate?.groups||[]).filter(group=>!group.productId&&group.section===section);
  groups.forEach(group=>{group.selected=!!selected;});
  syncInventoryTemplateSectionRows(section,selected);
  syncInventoryTemplateSectionCheckbox(section);
  renderInventoryTemplateImportSummary();
  renderInventoryTemplatePreview();
  const addSelected=document.getElementById('inventory-template-add-selected');
  if(addSelected)addSelected.disabled=!(pendingInventoryEntryTemplate?.groups||[]).some(group=>!group.productId&&group.selected);
}

function selectAllInventoryTemplateUnmatched(selected){
  (pendingInventoryEntryTemplate?.groups||[]).forEach(group=>{if(!group.productId)group.selected=!!selected;});
  renderInventoryTemplateImportReview();
  renderInventoryTemplatePreview();
}

function createInventoryTemplateProduct(group,sourceFile){
  const units=group.units.map(unit=>inventoryTemplateUnitDescriptor(unit,group.category));
  const primary=units[0]||{unit:'unit',unitSize:'',sku:'',cost:0,par:0};
  const product={
    id:uid(),name:group.productName,inventoryName:group.productName,aliases:group.sourceNames.slice(1).join(','),departments:[group.category==='Food'?'kitchen':'bar'],
    category:group.category,subcategory:group.subcategory,unit:primary.unit,units,
    cost:0,par:0,sku:'',notes:`Imported from ${sourceFile}`,suppliers:[],lastCount:null,archived:false
  };
  state.products.push(product);
  group.productId=product.id;
  group.productName=product.name;
  group.newUnits=[];
  group.selected=true;
  removeInventoryTemplateGroupFromBacklog(group);
  return product;
}

function addInventoryTemplateUnits(index){
  const group=pendingInventoryEntryTemplate?.groups?.[index];
  const product=group?.productId?getProduct(group.productId):null;
  if(!group||!product||!group.newUnits.length){toast('No new unit is available for this product.',true);return;}
  const existingKeys=new Set(normalizeProductUnits(product).map(unit=>inventoryTemplateUnitKey(unit.unitSize||unit.unit)));
  let added=0;
  group.newUnits.forEach(rawUnit=>{
    const key=inventoryTemplateUnitKey(rawUnit);
    if(!key||existingKeys.has(key))return;
    product.units.push(inventoryTemplateUnitDescriptor(rawUnit,product.category));
    existingKeys.add(key);
    added++;
  });
  group.newUnits=[];
  save();
  renderInventoryTemplateImportReview();
  renderInventoryTemplatePreview();
  showPage('products');
  renderProducts();
  openProductView(product.id);
  toast(`${added} unit${added===1?'':'s'} added to ${product.name}.`);
}

function addSelectedInventoryTemplateProducts(){
  const pending=pendingInventoryEntryTemplate;
  const selected=(pending?.groups||[]).filter(group=>!group.productId&&group.selected);
  if(!selected.length){toast('Select at least one unmatched product first.',true);return;}
  selected.forEach(group=>createInventoryTemplateProduct(group,pending.sourceFile));
  save();
  renderInventoryTemplateImportReview();
  renderInventoryTemplatePreview();
  toast(`Added ${selected.length} product${selected.length===1?'':'s'} to Products and the order preview.`);
}

function renderInventoryTemplatePreview(){
  const preview=document.getElementById('inventory-template-preview');
  const list=document.getElementById('inventory-template-list');
  const count=document.getElementById('inventory-template-preview-count');
  const items=selectedInventoryTemplateItems();
  const query=(document.getElementById('inventory-template-search')?.value||'').trim().toLowerCase();
  const visibleItems=items
    .map((item,index)=>({item,index}))
    .filter(({item})=>!query||[item.productName,item.reportProductName].some(value=>String(value||'').toLowerCase().includes(query)));
  if(!preview||!list)return;
  preview.hidden=!items.length;
  if(count)count.textContent=query?`${visibleItems.length} of ${items.length} products`:`${items.length} product${items.length===1?'':'s'}`;
  let renderedSection='';
  list.innerHTML=visibleItems.map(({item,index})=>{
    const section=item.section&&item.section!==renderedSection?`<div class="inventory-template-section-row"><span>${escapeHtml(item.section)}</span></div>`:'';
    if(item.section)renderedSection=item.section;
    return`${section}<div class="inventory-template-row" draggable="true" ondragstart="startInventoryTemplateDrag(${index})" ondragover="event.preventDefault()" ondrop="dropInventoryTemplateRow(${index})">
      <span class="inventory-template-drag" title="Drag to reorder">⋮⋮</span>
      <strong class="inventory-template-position">${index+1}</strong>
      <span class="inventory-template-product"><strong>${escapeHtml(item.productName)}</strong>${item.reportProductName&&item.reportProductName!==item.productName?`<small>Matched from ${escapeHtml(item.reportProductName)}</small>`:''}</span>
      <span class="inventory-template-row-actions">
        <button type="button" class="remove" aria-label="Remove ${escapeHtml(item.productName)}" title="Remove" onclick="removeInventoryTemplateItem(${index})">✕</button>
      </span>
    </div>`;
  }).join('')||'<div class="inventory-template-empty">No items match your search.</div>';
}

function reorderInventoryTemplateItem(fromIndex,toIndex){
  const pending=pendingInventoryEntryTemplate;
  const items=selectedInventoryTemplateItems();
  if(!items||fromIndex===toIndex||fromIndex<0||toIndex<0||fromIndex>=items.length||toIndex>=items.length)return;
  if(Array.isArray(pending?.groups)){
    const orderedGroups=items.map(item=>pending.groups[item.groupIndex]);
    const orderSlots=orderedGroups.map(group=>group.sourceOrder).sort((a,b)=>a-b);
    const [group]=orderedGroups.splice(fromIndex,1);
    orderedGroups.splice(toIndex,0,group);
    orderedGroups.forEach((entry,index)=>{entry.sourceOrder=orderSlots[index];});
    renderInventoryTemplatePreview();
    return;
  }
  const storedItems=pending?.items;
  const [item]=storedItems.splice(fromIndex,1);
  storedItems.splice(toIndex,0,item);
  storedItems.forEach((entry,index)=>{entry.sourceOrder=index;});
  renderInventoryTemplatePreview();
}

function removeInventoryTemplateItem(index){
  const pending=pendingInventoryEntryTemplate;
  const items=selectedInventoryTemplateItems();
  if(!items||index<0||index>=items.length)return;
  if(Array.isArray(pending?.groups)){
    pending.groups[items[index].groupIndex].selected=false;
    renderInventoryTemplateImportSummary();
    renderInventoryTemplatePreview();
    return;
  }
  pending.items.splice(index,1);
  pending.items.forEach((entry,itemIndex)=>{entry.sourceOrder=itemIndex;});
  if(!items.length){
    resetInventoryTemplatePreview();
    document.getElementById('inventory-template-status').textContent='No products remain in the preview. Upload the file again to restart.';
    return;
  }
  renderInventoryTemplatePreview();
}

function startInventoryTemplateDrag(index){
  draggedInventoryTemplateIndex=index;
}

function dropInventoryTemplateRow(index){
  if(draggedInventoryTemplateIndex===null)return;
  const fromIndex=draggedInventoryTemplateIndex;
  draggedInventoryTemplateIndex=null;
  reorderInventoryTemplateItem(fromIndex,index);
}

function discardInventoryTemplatePreview(){
  closeModal('modal-inventory-template-upload');
}

function applyInventoryTemplateChanges(){
  const pending=pendingInventoryEntryTemplate;
  const selected=selectedInventoryTemplateItems();
  if(!selected.length){toast('Select at least one product for the order.',true);return;}
  let productsAdded=0;
  if(Array.isArray(pending.groups)){
    pending.groups.filter(group=>group.selected).sort((a,b)=>a.sourceOrder-b.sourceOrder).forEach(group=>{
      let product=group.productId?getProduct(group.productId):null;
      if(!product){
        product=createInventoryTemplateProduct(group,pending.sourceFile);
        productsAdded++;
      }
    });
  }
  const appliedItems=Array.isArray(pending.groups)
    ?pending.groups.filter(group=>group.selected&&group.productId).sort((a,b)=>a.sourceOrder-b.sourceOrder).map((group,index)=>({productId:group.productId,productName:getProduct(group.productId)?.name||group.productName,reportProductName:group.sourceNames[0]||group.productName,section:group.section||'',sourceOrder:index}))
    :pending.items.map((item,index)=>({...item,sourceOrder:index}));
  state.inventoryEntryTemplate={
    sourceFile:pending.sourceFile,
    uploadedAt:new Date().toISOString(),
    source:'template',
    items:appliedItems
  };
  const count=state.inventoryEntryTemplate.items.length;
  const fileName=state.inventoryEntryTemplate.sourceFile;
  save();
  refreshLiveInventoryIfVisible();
  closeModal('modal-inventory-template-upload');
  toast(`Applied ${count} products${productsAdded?`, added ${productsAdded} new`:''} from ${fileName}.`);
}

function ensureUsageLogs(){
  if(!Array.isArray(state.usageLogs))state.usageLogs=[];
  if(state.usageLogs.length||!Array.isArray(state.uploadedUsage)||!state.uploadedUsage.length)return state.usageLogs;
  const rows=state.uploadedUsage;
  const period=usagePeriodFromRows(rows);
  state.usageLogs=[{
    id:uid(),
    fileName:rows[0]?.sourceFile||'Imported usage',
    periodStart:period.start,
    periodEnd:period.end,
    createdAt:rows[0]?.importedAt||new Date().toISOString(),
    archived:false,
    rows
  }];
  selectedUsageLogId=state.usageLogs[0].id;
  state.uploadedUsage=rows;
  return state.usageLogs;
}

function selectedUsageLog(){
  const logs=ensureUsageLogs();
  if(!logs.length)return null;
  let log=logs.find(item=>item.id===selectedUsageLogId);
  if(!log){
    log=logs[logs.length-1];
    selectedUsageLogId=log.id;
  }
  return log;
}

function usageLogRows(log=null){
  return (log||selectedUsageLog())?.rows||[];
}

function usageLogPeriod(log){
  const rows=usageLogRows(log);
  return usagePeriodFromRows(rows,log?.periodStart,log?.periodEnd);
}

function createUsageLog(fileName,rows,sourceFile=null){
  const period=usageLogPeriod({rows});
  const log={
    id:uid(),
    fileName,
    sourceFile,
    periodStart:period.start,
    periodEnd:period.end,
    createdAt:new Date().toISOString(),
    archived:false,
    rows
  };
  ensureUsageLogs().push(log);
  selectedUsageLogId=log.id;
  state.uploadedUsage=rows;
  return log;
}

function usageSourceFileSnapshot(file,arrayBuffer){
  const bytes=new Uint8Array(arrayBuffer);
  const chunks=[];
  const chunkSize=0x8000;
  for(let index=0;index<bytes.length;index+=chunkSize){
    chunks.push(String.fromCharCode(...bytes.subarray(index,index+chunkSize)));
  }
  const type=file.type||(/\.pdf$/i.test(file.name)?'application/pdf':'application/octet-stream');
  return{name:file.name,type,size:file.size||bytes.length,data:`data:${type};base64,${btoa(chunks.join(''))}`};
}

function usageLogHasSourceFile(log){
  return!!(log?.sourceFile?.data&&log.sourceFile.name);
}

function downloadUsageLogSource(id=selectedUsageLogId){
  const log=ensureUsageLogs().find(item=>item.id===id);
  if(!usageLogHasSourceFile(log)){
    toast('The original file was not saved for this older usage log.',true);
    return;
  }
  const link=document.createElement('a');
  link.href=log.sourceFile.data;
  link.download=log.sourceFile.name||log.fileName||'usage-report';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function bestUsageImportSuggestion(row){
  if(typeof fuzzyMatch!=='function')return null;
  const query=row.reportProductName||row.productName||row.sku||'';
  const result=fuzzyMatch(query,state.products.filter(product=>!product.archived));
  if(!result?.product||!Number.isFinite(result.score)||result.score<0.25)return null;
  return{productId:result.product.id,productName:result.product.name,score:result.score};
}

function inferFoodtrakUsageCategory(row){
  const name=row.reportProductName||row.productName||'';
  const unit=row.unitSize||'';
  const group=row.reportCategory||'';
  const subgroup=row.reportSubcategory||'';
  const nameInferred=inferInventoryTemplateCategory(name,unit,'Uncategorized');
  if(group==='Entree'||group==='Not Applicable')return{category:'Food',subcategory:'Other Food'};
  if(group==='Misc'||group==='Supplies Non Inv')return{category:'Supplies',subcategory:subgroup==='Inventoried Supplies'?'Smallwares':'Other Supplies'};
  if(group==='Wine'){
    if(nameInferred.category==='Wine')return nameInferred;
    if(/champagne|sparkling/i.test(subgroup))return{category:'Wine',subcategory:'Bubbles'};
    if(/white|rose/i.test(subgroup))return{category:'Wine',subcategory:'Other Whites'};
    return{category:'Wine',subcategory:'Other Reds'};
  }
  if(group==='Beer'){
    if(nameInferred.category==='Cider')return nameInferred;
    if(subgroup==='Coolers Wine Liqour Malt'&&nameInferred.category!=='Other')return nameInferred;
    return{category:'Beer',subcategory:subgroup==='Draft'?'Kegs':/can/i.test(unit)?'Cans':'Bottles'};
  }
  if(group==='Liquor'){
    const liquorMap={
      'Canadian Whiskey':{category:'Spirits',subcategory:'Rye'},
      'Gin':{category:'Spirits',subcategory:'Gin'},
      'Vodka':{category:'Spirits',subcategory:'Vodka'},
      'Rum':{category:'Spirits',subcategory:'Rum'},
      'Liqueurs':{category:'Liqueurs',subcategory:'Liqueurs'},
      'Aperitifs':{category:'Spirits',subcategory:'Aperitifs'},
      'Tequila':{category:'Spirits',subcategory:'Tequila'}
    };
    if(liquorMap[subgroup])return liquorMap[subgroup];
    if(subgroup==='Scotch/Irish Whiskey'){
      if(/jameson|irish|redbreast|bushmill/i.test(name))return{category:'Spirits',subcategory:'Irish Whiskey'};
      return{category:'Spirits',subcategory:/blend/i.test(name)?'Scotch (Blend)':'Scotch (Single)'};
    }
    return nameInferred.category==='Other'?{category:'Spirits',subcategory:'Other Spirits'}:nameInferred;
  }
  return nameInferred;
}

function usageImportReviewCategory(entry){
  return entry.row.reportCategory||entry.category||'Other';
}

function prepareUsageImport(fileName,sourceFile,rows){
  const entries=rows.map((row,index)=>{
    const inferred=inferFoodtrakUsageCategory(row);
    return{index,row,category:inferred.category,subcategory:inferred.subcategory,selected:false,suggestion:row.matched?null:bestUsageImportSuggestion(row)};
  });
  pendingUsageImport={fileName,sourceFile,rows,entries};
  return pendingUsageImport;
}

function unmatchedUsageImportEntries(){
  return(pendingUsageImport?.entries||[]).filter(entry=>!entry.row.matched||!entry.row.productId);
}

function usageImportCounts(){
  const rows=pendingUsageImport?.rows||[];
  const unmatched=unmatchedUsageImportEntries();
  return{rows:rows.length,matched:rows.length-unmatched.length,unmatched:unmatched.length};
}

function renderUsageImportReview(){
  const panel=document.getElementById('usage-import-review');
  const summary=document.getElementById('usage-import-summary');
  const wrap=document.getElementById('usage-import-unmatched-groups');
  if(!panel||!summary||!wrap)return;
  const pending=pendingUsageImport;
  panel.hidden=!pending;
  if(!pending){summary.innerHTML='';wrap.innerHTML='';return;}
  const counts=usageImportCounts();
  summary.innerHTML=`
    <div><strong>${counts.rows}</strong><span>rows extracted</span></div>
    <div><strong>${counts.matched}</strong><span>matched rows</span></div>
    <div><strong>${counts.unmatched}</strong><span>unmatched rows</span></div>
  `;
  const byCategory=new Map();
  unmatchedUsageImportEntries().forEach(entry=>{
    const category=usageImportReviewCategory(entry);
    if(!byCategory.has(category))byCategory.set(category,[]);
    byCategory.get(category).push(entry);
  });
  wrap.innerHTML=[...byCategory.entries()].map(([category,entries])=>`<details class="inventory-template-review-group">
    <summary><span class="inventory-template-section-select"><input type="checkbox" data-usage-category="${escapeHtml(category)}" aria-label="Select all ${escapeHtml(category)} unmatched products" onclick="event.stopPropagation()" onchange="toggleUsageImportCategory(this.dataset.usageCategory,this.checked)"><span>${escapeHtml(category)}</span></span><strong>${entries.length} unmatched</strong></summary>
    <div class="inventory-template-review-list">${entries.map(entry=>`
      <label class="inventory-template-review-row">
        <input type="checkbox" data-usage-entry="${entry.index}" ${entry.selected?'checked':''} onchange="toggleUsageImportEntry(${entry.index},this.checked)">
        <span><strong>${escapeHtml(entry.row.reportProductName||entry.row.productName||entry.row.sku||'Unnamed product')}</strong><small>${escapeHtml(entry.category)} · ${escapeHtml(entry.subcategory)}${entry.row.reportSubcategory?` · Source: ${escapeHtml(entry.row.reportSubcategory)}`:''} · ${escapeHtml(entry.row.unitSize||'unit')} · Usage ${usageDisplayNumber(usageRowQty(entry.row))}</small></span>
        <span class="usage-import-suggestion">${entry.suggestion?`<small>Possible match: ${escapeHtml(entry.suggestion.productName)}</small><button class="btn btn-secondary btn-sm" type="button" onclick="event.preventDefault();event.stopPropagation();useUsageImportSuggestion(${entry.index})">Use suggested match</button>`:'<small>No confident existing-product match</small>'}</span>
      </label>`).join('')}</div>
  </details>`).join('')||'<div class="inventory-template-empty">All extracted rows are matched.</div>';
  syncAllUsageImportControls();
}

function usageImportEntry(index){
  return(pendingUsageImport?.entries||[]).find(entry=>entry.index===index)||null;
}

function syncUsageImportCategory(category){
  const checkbox=[...document.querySelectorAll('[data-usage-category]')].find(input=>input.dataset.usageCategory===category);
  if(!checkbox)return;
  const entries=unmatchedUsageImportEntries().filter(entry=>usageImportReviewCategory(entry)===category);
  const selected=entries.filter(entry=>entry.selected).length;
  checkbox.checked=entries.length>0&&selected===entries.length;
  checkbox.indeterminate=selected>0&&selected<entries.length;
  const details=checkbox.closest('.inventory-template-review-group');
  details?.querySelectorAll('[data-usage-entry]').forEach(input=>{
    input.checked=!!usageImportEntry(parseInt(input.dataset.usageEntry,10))?.selected;
  });
}

function syncAllUsageImportControls(){
  document.querySelectorAll('[data-usage-category]').forEach(input=>syncUsageImportCategory(input.dataset.usageCategory));
  const unmatched=unmatchedUsageImportEntries();
  const add=document.getElementById('usage-import-add-selected');
  if(add)add.disabled=!unmatched.some(entry=>entry.selected);
  const create=document.getElementById('usage-import-create-log');
  if(create)create.textContent=unmatched.length?`Create Usage Log — skip ${unmatched.length} unmatched`:'Create Usage Log';
}

function toggleUsageImportEntry(index,selected){
  const entry=usageImportEntry(index);if(!entry)return;
  entry.selected=!!selected;
  syncUsageImportCategory(usageImportReviewCategory(entry));
  syncAllUsageImportControls();
}

function toggleUsageImportCategory(category,selected){
  unmatchedUsageImportEntries().filter(entry=>usageImportReviewCategory(entry)===category).forEach(entry=>{entry.selected=!!selected;});
  syncUsageImportCategory(category);
  syncAllUsageImportControls();
}

function selectAllUsageImportUnmatched(selected){
  unmatchedUsageImportEntries().forEach(entry=>{entry.selected=!!selected;});
  syncAllUsageImportControls();
}

function linkUsageImportRow(entry,product){
  entry.row.productId=product.id;
  entry.row.productName=product.name;
  entry.row.matchedName=product.name;
  entry.row.matched=true;
  const sizeKey=usageSizeKey(entry.row.unitSize);
  entry.row.sizeMatched=!sizeKey||normalizeProductUnits(product).some(unit=>usageSizeKey(unit.unitSize||unit.unit)===sizeKey);
  entry.selected=false;
}

function useUsageImportSuggestion(index){
  const entry=usageImportEntry(index);
  const product=entry?.suggestion?.productId?getProduct(entry.suggestion.productId):null;
  if(!entry||!product){toast('That suggested product is no longer available.',true);return;}
  linkUsageImportRow(entry,product);
  renderUsageImportReview();
  toast(`Matched ${entry.row.reportProductName||entry.row.productName} to ${product.name}.`);
}

function createUsageImportProduct(entry){
  const descriptor=inventoryTemplateUnitDescriptor(entry.row.unitSize||'unit',entry.category);
  descriptor.sku=entry.row.sku||descriptor.sku||'';
  const name=entry.row.reportProductName||entry.row.productName||entry.row.sku||'Imported product';
  const product={
    id:uid(),name,inventoryName:name,aliases:'',departments:[entry.category==='Food'?'kitchen':'bar'],category:entry.category||'Other',subcategory:entry.subcategory||'Misc',
    unit:descriptor.unit,units:[descriptor],cost:0,par:0,sku:descriptor.sku||'',
    notes:`Imported from ${pendingUsageImport?.fileName||'usage report'}`,suppliers:[],lastCount:null,archived:false
  };
  state.products.push(product);
  linkUsageImportRow(entry,product);
  return product;
}

function addSelectedUsageImportProducts(){
  const selected=unmatchedUsageImportEntries().filter(entry=>entry.selected);
  if(!selected.length){toast('Select at least one unmatched product first.',true);return;}
  selected.forEach(createUsageImportProduct);
  save();
  renderProducts();
  renderUsageImportReview();
  toast(`Added ${selected.length} separate product${selected.length===1?'':'s'}. No rows were merged.`);
}

function discardUsageImportReview(){
  pendingUsageImport=null;
  const panel=document.getElementById('usage-import-review');if(panel)panel.hidden=true;
  const zone=document.getElementById('usage-zone');if(zone)zone.hidden=false;
  const status=document.getElementById('usage-status');if(status)status.textContent='';
}

function finalizeUsageImport(){
  const pending=pendingUsageImport;if(!pending)return;
  const imported=pending.rows.filter(row=>row.matched&&row.productId)
    .sort((a,b)=>(Number.isFinite(a.sourceOrder)?a.sourceOrder:Number.MAX_SAFE_INTEGER)-(Number.isFinite(b.sourceOrder)?b.sourceOrder:Number.MAX_SAFE_INTEGER));
  if(!imported.length){toast('Match or add at least one product before creating the usage log.',true);return;}
  const skipped=unmatchedUsageImportEntries().length;
  const log=createUsageLog(pending.fileName,imported,pending.sourceFile);
  saveInventoryEntryTemplateFromRows(pending.fileName,imported,'usage');
  state.uploadedUsage=log.rows;
  save();
  pendingUsageImport=null;
  document.getElementById('usage-source').value='uploaded';
  renderUsagePage();
  refreshLiveInventoryIfVisible();
  closeModal('modal-usage-upload');
  openUsageLogView(log.id,false);
  toast(`Usage log created with ${imported.length} separate row${imported.length===1?'':'s'}${skipped?`; ${skipped} unmatched skipped by choice`:''}.`);
}

function usageDatesFromText(text){
  return usageDatesInText(text,String(new Date().getFullYear()));
}

function stripUsageDates(text){
  return String(text||'')
    .replace(/\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b/g,' ')
    .replace(/\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b/g,' ')
    .replace(/\b[A-Za-z]{3,}\s+\d{1,2}(?:st|nd|rd|th)?(?:['’]?\s*\d{2,4})?\b/gi,' ')
    .replace(/\b\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3,}(?:\s+\d{2,4})?\b/gi,' ');
}

function usageSizePattern(size){
  const compact=String(size||'').trim();
  if(!compact)return null;
  const escaped=compact.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/\s+/g,'\\s*');
  return new RegExp(escaped,'i');
}

function parseUsagePdfTextRows(rows,fileName){
  const lines=rows.map(row=>row.join(' ').replace(/\s+/g,' ').trim()).filter(Boolean);
  const parsed=[];
  const reportYear=usageReportYear(rows);
  const headerPeriod=usageReportPeriodFromHeader(rows,Math.min(rows.length,16));
  const inferredDates=usageDatesInText(lines.slice(0,12).join(' '),reportYear);

  lines.forEach((line,index)=>{
    const match=matchUsageProduct({name:line,sku:'',size:''});
    if(!match)return;

    const lineDates=usageDatesInText(line,reportYear);
    let numericText=stripUsageDates(line);
    const aliases=[match.product.name,match.product.inventoryName,...String(match.product.aliases||'').split(',')].map(item=>String(item||'').trim()).filter(Boolean);
    aliases.forEach(alias=>{
      numericText=numericText.replace(new RegExp(alias.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'ig'),' ');
    });
    if(match.unit?.unitSize){
      const sizePattern=usageSizePattern(match.unit.unitSize);
      if(sizePattern)numericText=numericText.replace(sizePattern,' ');
    }
    numericText=numericText.replace(/\b\d+(?:\.\d+)?\s*(?:ml|l|oz|g|kg)\b/ig,' ');

    const nums=[...numericText.matchAll(/-?\d+(?:\.\d+)?/g)].map(item=>parseFloat(item[0]));
    if(nums.length<1)return;

    const actual=nums[0];
    const begin=nums.length>1?nums[1]:'';
    const end=nums.length>2?nums[2]:'';
    const purch=nums.length>3?nums[3]:'';
    const periodStart=headerPeriod.start||lineDates[0]||inferredDates[0]||'';
    const periodEnd=headerPeriod.end||lineDates[1]||inferredDates[1]||inferredDates[0]||'';

    parsed.push({
      productId:match.product.id,
      productName:match.product.name,
      reportProductName:line,
      sku:match.unit?.sku||match.product.sku||'',
      unitSize:match.unit?.unitSize||match.unit?.unit||match.product.unit||'',
      qty:actual,
      actualUsage:actual,
      begin,
      end,
      purch,
      periodStart,
      periodEnd,
      matched:true,
      matchedName:match.product.name,
      sizeMatched:true,
      sourceFile:fileName,
      importedAt:new Date().toISOString(),
      sourceOrder:index
    });
  });

  return parsed;
}

function normalizePdfRows(rows){
  return rows.map(row=>row.map(cell=>String(cell||'').trim()).filter(Boolean)).filter(row=>row.length);
}

function splitPdfLine(line){
  const clean=String(line||'').replace(/\s+/g,' ').trim();
  if(!clean)return [];
  const spaced=String(line||'').trim().split(/\s{2,}|\t+/).map(cell=>cell.trim()).filter(Boolean);
  return spaced.length>1?spaced:[clean];
}

function pdfTextFallbackRows(text){
  return text.split(/\r?\n/).map(splitPdfLine).filter(row=>row.length);
}

function groupPdfTextItems(items){
  const rows=[];
  const sorted=items
    .map(item=>({text:String(item.str||'').trim(),x:item.transform?.[4]||0,y:item.transform?.[5]||0}))
    .filter(item=>item.text)
    .sort((a,b)=>Math.abs(b.y-a.y)>3?b.y-a.y:a.x-b.x);

  sorted.forEach(item=>{
    let row=rows.find(candidate=>Math.abs(candidate.y-item.y)<=3);
    if(!row){
      row={y:item.y,items:[]};
      rows.push(row);
    }
    row.items.push(item);
  });

  return rows
    .sort((a,b)=>b.y-a.y)
    .map(row=>row.items.sort((a,b)=>a.x-b.x).map(item=>item.text));
}

async function readUsagePdfRows(arrayBuffer){
  const pdfjs=window.pdfjsLib;
  if(!pdfjs)throw new Error('PDF reader did not load. Refresh and try again.');
  if(pdfjs.GlobalWorkerOptions&&!pdfjs.GlobalWorkerOptions.workerSrc){
    pdfjs.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  }

  const doc=await pdfjs.getDocument({data:arrayBuffer}).promise;
  const rows=[];
  const textLines=[];
  for(let pageNum=1;pageNum<=doc.numPages;pageNum++){
    const page=await doc.getPage(pageNum);
    const content=await page.getTextContent();
    const pageRows=groupPdfTextItems(content.items);
    rows.push(...pageRows);
    pageRows.forEach(row=>textLines.push(row.join(' ')));
  }

  const normalized=normalizePdfRows(rows);
  if(normalized.some(row=>usageColumnScore(row)>0))return normalized;
  const fallback=pdfTextFallbackRows(textLines.join('\n'));
  if(fallback.length)return fallback;
  throw new Error('No readable text was found in this PDF. If it is scanned, OCR support will be needed.');
}

function readUsageSpreadsheetRows(arrayBuffer){
  if(typeof XLSX==='undefined')throw new Error('Excel library did not load. Try again.');
  const wb=XLSX.read(arrayBuffer,{type:'array',cellDates:true});
  const ws=wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:false});
}

async function readUsageReportRows(file,arrayBuffer){
  if(file.type==='application/pdf'||/\.pdf$/i.test(file.name))return readUsagePdfRows(arrayBuffer);
  return readUsageSpreadsheetRows(arrayBuffer);
}

function handleUsageUpload(e){
  const file=e.target.files[0];
  if(!file)return;
  const status=document.getElementById('usage-status');
  status.textContent='Reading usage report...';

  const reader=new FileReader();
  reader.onload=async ev=>{
    try{
      const sourceFile=usageSourceFileSnapshot(file,ev.target.result);
      const rows=await readUsageReportRows(file,ev.target.result);
      let matched=parseUsageReportRows(rows,file.name);
      if((file.type==='application/pdf'||/\.pdf$/i.test(file.name))&&!matched.some(row=>row.matched)){
        matched=parseUsagePdfTextRows(rows,file.name);
      }
      if(!matched.length){
        status.textContent=`No usage rows could be extracted from ${file.name}.`;
        return;
      }
      prepareUsageImport(file.name,sourceFile,matched);
      const counts=usageImportCounts();
      if(!counts.unmatched){
        finalizeUsageImport();
      }else{
        document.getElementById('usage-zone').hidden=true;
        status.textContent=`Analyzed ${file.name}: ${counts.matched} matched rows and ${counts.unmatched} unmatched rows. Review the unmatched products below; no rows were merged.`;
        renderUsageImportReview();
      }
    }catch(err){
      status.textContent='Error reading usage report: '+err.message;
    }finally{
      e.target.value='';
    }
  };
  reader.readAsArrayBuffer(file);
}

function inventoryTemplateUnitKey(value){
  return usageSizeKey(String(value||'').replace(/\s+/g,''));
}

function strictInventoryTemplateMatch(name,unit){
  const nameKey=normMatch(name);
  if(!nameKey)return null;
  const sizeKey=inventoryTemplateUnitKey(unit);
  const choices=usageVariantChoices();
  let matches=choices.filter(choice=>choice.nameKeys.includes(nameKey)).map(choice=>({choice,score:100,key:nameKey}));
  if(!matches.length){
    const withoutType=normMatch(String(name||'').replace(/^(vodka|rum|gin|scotch|irish|rye|whisky|tequila|aperitif|liqueur|wine)\s+/i,''));
    if(withoutType&&withoutType!==nameKey){
      matches=choices.filter(choice=>choice.nameKeys.includes(withoutType)).map(choice=>({choice,score:90,key:withoutType}));
    }
  }
  return bestUsageMatch(matches,sizeKey);
}

function foodtrakInventoryChromeRow(cells){
  const text=cells.join(' ').replace(/\s+/g,' ').trim();
  return !text||
    /^\d{1,2}\/\d{1,2}\/\d{4}.*Page\s+\d+\s+of\s+\d+/i.test(text)||
    /^(Keg ON|Inventory Form|Sequence Order\b|Printed Name\b|Signature\b|Date\b|Inventory Date\b|Personnel\b|Comment:?\b|Item Name\b|Quant\b|Unit\b|Notes\b)/i.test(text)||
    /FOOD-TRAK.*System|All Rights Reserved|Registered Trademark/i.test(text);
}

function cleanInventoryTemplateSection(value){
  return String(value||'').replace(/\(\s*continued\s*\)/ig,'').replace(/\s+/g,' ').trim();
}

function parseFoodtrakInventoryRows(rows,fileName){
  const extracted=[];
  let section='Uncategorized';
  rows.forEach(row=>{
    const cells=(row||[]).map(cell=>String(cell||'').replace(/\s+/g,' ').trim()).filter(Boolean);
    if(foodtrakInventoryChromeRow(cells))return;
    const joined=cells.join(' ');
    if(cells.some(cell=>/\(\s*continued\s*\)/i.test(cell))){
      const heading=cleanInventoryTemplateSection(cells.find(cell=>!/\(\s*continued\s*\)/i.test(cell)&&!/^503$/.test(cell))||'');
      if(heading)section=heading;
      return;
    }
    if(cells.length===1){
      const heading=cleanInventoryTemplateSection(cells[0]);
      if(/^503$/.test(heading)||/^\d+$/.test(heading))return;
      section=heading;
      return;
    }
    if(/^503$/.test(cells[0])||/^503\s*\(\*\)$/.test(joined)){
      section='Supplies';
      return;
    }
    const productName=cells[0];
    const unit=cells[cells.length-1];
    if(!productName||!unit||/^(Printed Name|Item Name|Inventory Date)$/i.test(productName))return;
    extracted.push({
      productName,
      unit,
      section,
      sourceFile:fileName,
      sourceOrder:extracted.length
    });
  });
  return extracted;
}

function inferInventoryTemplateCategory(name,unit,section){
  const text=String(name||'').toLowerCase();
  const unitText=String(unit||'').toLowerCase();
  if(section==='Supplies')return{category:'Supplies',subcategory:'Smallwares'};
  if(section&&section!=='Bar Main'&&section!=='Uncategorized'){
    const subcategory=(SUBCATS.Food||[]).includes(section)?section:'Other Food';
    return{category:'Food',subcategory};
  }
  if(/^liqueur\b/.test(text))return{category:'Liqueurs',subcategory:'Liqueurs'};
  if(/\b(cider|strongbow)\b/.test(text))return{category:'Cider',subcategory:/can/.test(unitText)?'Cans':'Bottles'};
  if(/\(dft\)|\b(keg|lager|beer|guinness|stella|bud|heineken|corona|carling|burdock|bench|jutsu|porter|sour)\b/.test(text)){
    const subcategory=/\(dft\)|kg|\d+l/.test(text+' '+unitText)?'Kegs':/can/.test(unitText)?'Cans':'Bottles';
    return{category:'Beer',subcategory};
  }
  const spiritMatch=text.match(/^(vodka|rum|gin|scotch|irish|rye|whisky|tequila|aperitif)\b/);
  if(spiritMatch){
    const subcategories={vodka:'Vodka',rum:'Rum',gin:'Gin',scotch:'Scotch (Single)',irish:'Irish Whiskey',rye:'Rye',whisky:'Rye',tequila:'Tequila',aperitif:'Aperitifs'};
    return{category:'Spirits',subcategory:subcategories[spiritMatch[1]]};
  }
  if(/\b(pinot|merlot|cabernet|shiraz|syrah|grenache|malbec|tempranillo|sangiovese|barolo|valpolicella|amarone|rioja|prosecco|champagne|chardonnay|sauvignon|riesling|viognier|rose|rosé|wine|brut|baco noir)\b/.test(text)){
    let subcategory='Other Reds';
    if(/pinot grigio|pinot gris/.test(text))subcategory='Pinot Gris / Grigio';
    else if(/pinot noir/.test(text))subcategory='Pinot Noir';
    else if(/sauvignon/.test(text))subcategory='Sauvignon Blanc';
    else if(/chardonnay/.test(text))subcategory='Chardonnay';
    else if(/prosecco|champagne|brut|sparkling/.test(text))subcategory='Bubbles';
    else if(/rose|rosé/.test(text))subcategory='Rosé';
    else if(/shiraz|syrah/.test(text))subcategory='Syrah / Shiraz';
    else if(/cabernet|merlot/.test(text))subcategory='Cabernet & Blends';
    return{category:'Wine',subcategory};
  }
  return{category:'Other',subcategory:'Misc'};
}

function inventoryTemplateUnitDescriptor(rawUnit,category='Other'){
  const raw=String(rawUnit||'').trim()||'unit';
  const lower=raw.toLowerCase();
  const direct=/^(can|bottle|keg|each|piece|lb|kg|doz|serv|por|recipe|skewer)$/i.test(raw);
  let unit=direct?lower:'unit';
  if(!direct&&['Spirits','Liqueurs','Wine'].includes(category))unit='bottle';
  else if(!direct&&['Beer','Cider'].includes(category))unit=/kg|\bl\b|lt/i.test(lower)?'keg':'bottle';
  else if(!direct&&/^cs\//i.test(lower))unit='case';
  return{unit,unitSize:direct?'':raw,sku:'',cost:0,par:0};
}

function inventoryTemplateBacklogKey(value){
  return normMatch(value);
}

function inventoryTemplateBacklogItem(name){
  const key=inventoryTemplateBacklogKey(name);
  return(state.importBacklog||[]).find(item=>item.key===key)||null;
}

function removeInventoryTemplateGroupFromBacklog(group){
  if(!Array.isArray(state.importBacklog))state.importBacklog=[];
  const keys=new Set((group.sourceNames||[group.productName]).map(inventoryTemplateBacklogKey).filter(Boolean));
  state.importBacklog=state.importBacklog.filter(item=>!keys.has(item.key));
}

function mergeInventoryTemplateBacklog(groups,sourceFile){
  if(!Array.isArray(state.importBacklog))state.importBacklog=[];
  const now=new Date().toISOString();
  groups.filter(group=>!group.productId).forEach(group=>{
    const key=inventoryTemplateBacklogKey(group.sourceNames[0]||group.productName);
    if(!key)return;
    let item=state.importBacklog.find(entry=>entry.key===key);
    if(!item){
      item={
        id:uid(),key,name:group.productName,units:[],category:group.category,subcategory:group.subcategory,
        sections:[],sourceFiles:[],firstSeenAt:now,lastSeenAt:now,seenCount:0
      };
      state.importBacklog.push(item);
    }
    group.units.forEach(unit=>{if(!item.units.some(existing=>inventoryTemplateUnitKey(existing)===inventoryTemplateUnitKey(unit)))item.units.push(unit);});
    if(group.section&&!item.sections.includes(group.section))item.sections.push(group.section);
    if(sourceFile&&!item.sourceFiles.includes(sourceFile))item.sourceFiles.push(sourceFile);
    item.category=group.category||item.category||'Other';
    item.subcategory=group.subcategory||item.subcategory||'Misc';
    item.lastSeenAt=now;
    item.seenCount=(parseInt(item.seenCount,10)||0)+1;
  });
}

function buildInventoryTemplateGroups(entries){
  const groups=[];
  const byKey=new Map();
  entries.forEach(entry=>{
    const match=strictInventoryTemplateMatch(entry.productName,entry.unit);
    const key=match?`product:${match.product.id}`:`new:${normMatch(entry.productName)}`;
    let group=byKey.get(key);
    if(!group){
      const saved=match?null:inventoryTemplateBacklogItem(entry.productName);
      const inferred=match?{category:match.product.category||'Other',subcategory:match.product.subcategory||'Misc'}:saved?{category:saved.category,subcategory:saved.subcategory}:inferInventoryTemplateCategory(entry.productName,entry.unit,entry.section);
      group={
        key,productId:match?.product.id||null,productName:match?.product.name||entry.productName,
        sourceNames:[],units:[],newUnits:[],section:entry.section||'Uncategorized',
        category:inferred.category,subcategory:inferred.subcategory,sourceOrder:entry.sourceOrder,
        selected:!!match
      };
      byKey.set(key,group);
      groups.push(group);
    }
    if(!group.sourceNames.includes(entry.productName))group.sourceNames.push(entry.productName);
    if(entry.unit&&!group.units.some(unit=>inventoryTemplateUnitKey(unit)===inventoryTemplateUnitKey(entry.unit)))group.units.push(entry.unit);
    group.sourceOrder=Math.min(group.sourceOrder,entry.sourceOrder);
  });
  groups.forEach(group=>{
    if(!group.productId)return;
    const product=getProduct(group.productId);
    const existingKeys=new Set(normalizeProductUnits(product).map(unit=>inventoryTemplateUnitKey(unit.unitSize||unit.unit)));
    group.newUnits=group.units.filter(unit=>!existingKeys.has(inventoryTemplateUnitKey(unit)));
  });
  return groups.sort((a,b)=>a.sourceOrder-b.sourceOrder);
}

function parseInventoryTemplateRows(rows,fileName){
  const headerIndex=findUsageHeaderRow(rows);
  const headers=rows[headerIndex]||[];
  const col=usageColumnMap(headers);
  const parsed=[];
  const hasHeader=col.product>=0||col.sku>=0;
  const dataRows=hasHeader&&headerIndex>=0&&headerIndex<rows.length-1?rows.slice(headerIndex+1):rows;
  dataRows.forEach((row,index)=>{
    const productName=String(usageCell(row,col.product)).trim()||row.join(' ').trim();
    const sku=String(usageCell(row,col.sku)).trim();
    const unitSize=String(usageCell(row,col.size)).trim();
    if(!productName&&!sku)return;
    const match=strictInventoryTemplateMatch(productName,unitSize);
    parsed.push({
      productId:match?.product.id||null,
      productName:match?.product.name||productName,
      reportProductName:productName||sku,
      sku,
      unitSize:unitSize||match.unit?.unitSize||match.unit?.unit||match.product.unit||'',
      matched:!!match,
      matchedName:match?.product.name||null,
      sizeMatched:match?.sizeMatched||false,
      section:'Imported',
      sourceFile:fileName,
      importedAt:new Date().toISOString(),
      sourceOrder:index
    });
  });
  return parsed;
}

function handleInventoryTemplateUpload(e){
  const file=e.target.files[0];
  if(!file)return;
  const status=document.getElementById('inventory-template-status');
  status.textContent='Reading inventory entry template...';

  const reader=new FileReader();
  reader.onload=async ev=>{
    try{
      const rows=await readUsageReportRows(file,ev.target.result);
      const isPdf=file.type==='application/pdf'||/\.pdf$/i.test(file.name);
      const extracted=isPdf?parseFoodtrakInventoryRows(rows,file.name):parseInventoryTemplateRows(rows,file.name).map((row,index)=>({productName:row.reportProductName,unit:row.unitSize||'unit',section:row.section||'Imported',sourceFile:file.name,sourceOrder:index}));
      if(!extracted.length){
        resetInventoryTemplatePreview();
        status.textContent=`No inventory items could be extracted from ${file.name}.`;
        return;
      }
      const groups=buildInventoryTemplateGroups(extracted);
      groups.filter(group=>group.productId).forEach(removeInventoryTemplateGroupFromBacklog);
      mergeInventoryTemplateBacklog(groups,file.name);
      pendingInventoryEntryTemplate={
        sourceFile:file.name,source:'template',groups,
        extractedCount:extracted.length,
        sectionCount:new Set(extracted.map(row=>row.section)).size
      };
      const counts=inventoryTemplateImportCounts();
      save();
      status.textContent=`Analyzed ${file.name}: ${counts.rows} rows across ${counts.sections} headers. Review matches and select any unmatched products to add.`;
      renderInventoryTemplateImportReview();
      renderInventoryTemplatePreview();
    }catch(err){
      status.textContent='Error reading template: '+err.message;
    }finally{
      e.target.value='';
    }
  };
  reader.readAsArrayBuffer(file);
}

function computeUsage(){
  const sorted=[...state.inventories].sort((a,b)=>a.date>b.date?1:-1);
  const usage={};
  for(let i=1;i<sorted.length;i++){
    const prev=sorted[i-1],curr=sorted[i];
    const days=(new Date(curr.date)-new Date(prev.date))/86400000;
    if(days<=0)continue;
    const po=state.orders.filter(o=>o.date>prev.date&&o.date<=curr.date&&o.status==='Received');
    state.products.forEach(p=>{
      const used=Math.max(0,(prev.items[p.id]||0)+po.reduce((s,o)=>s+o.lines.filter(l=>l.productId===p.id).reduce((ss,l)=>ss+l.qty,0),0)-(curr.items[p.id]||0));
      if(!usage[p.id])usage[p.id]={total:0,days:0,periods:0};
      usage[p.id].total+=used;
      usage[p.id].days+=days;
      usage[p.id].periods++;
    });
  }
  return usage;
}

function computeUploadedUsage(){
  const usage={};
  usageLogRows().filter(r=>r.matched&&r.productId).forEach(r=>{
    if(!usage[r.productId]){
      let days=7;
      if(r.periodStart&&r.periodEnd){
        const start=new Date(r.periodStart);
        const end=new Date(r.periodEnd);
        if(!isNaN(start)&&!isNaN(end)&&end>=start)days=((end-start)/86400000)+1;
      }
      usage[r.productId]={total:0,days,periods:1};
    }
    usage[r.productId].total+=parseFloat(r.qty)||0;
  });
  return usage;
}

function usageProductOptions(selectedId=''){
  return'<option value="">Unmatched</option>'+state.products.map(product=>`<option value="${product.id}" ${product.id===selectedId?'selected':''}>${escapeHtml(product.name)}</option>`).join('');
}

function usageRowQty(row){
  if(row.actualUsage!==''&&row.actualUsage!==null&&row.actualUsage!==undefined)return parseFloat(row.actualUsage)||0;
  return Math.max(0,(parseFloat(row.begin)||0)+(parseFloat(row.purch)||0)-(parseFloat(row.end)||0));
}

function usageDisplayNumber(value){
  if(value===''||value===null||value===undefined)return'—';
  const number=parseFloat(value);
  if(!Number.isFinite(number))return escapeHtml(value);
  return number.toLocaleString('en-CA',{useGrouping:false,maximumFractionDigits:2});
}

function openUsageLogView(id,edit=false){
  selectedUsageLogId=id;
  usageLogEditMode=!!edit;
  const log=selectedUsageLog();
  state.uploadedUsage=log?.rows||[];
  const source=document.getElementById('usage-source');
  if(source)source.value='uploaded';
  const detailSearch=document.getElementById('usage-detail-search');
  if(detailSearch)detailSearch.value='';
  renderUsageLogs();
  renderUsageSummaryOnly();
  renderUploadedUsageDetails();
  openModal('modal-usage-log-detail');
}

function selectUsageLog(id){
  openUsageLogView(id,false);
}

function editUsageLog(id){
  openUsageLogView(id,true);
  setTimeout(()=>document.querySelector('#modal-usage-log-detail input, #modal-usage-log-detail select')?.focus(),0);
}

function renderUsageLogs(){
  const tbody=document.getElementById('usage-log-tbody');
  if(!tbody)return;
  const logs=ensureUsageLogs();
  const status=document.getElementById('usage-log-status-f')?.value||'active';
  const visibleLogs=logs.filter(log=>status==='all'||(status==='archived'?!!log.archived:!log.archived));
  if(!visibleLogs.length){
    tbody.innerHTML='<tr><td colspan="6" style="text-align:center;color:var(--text-muted);">No usage logs yet.</td></tr>';
    return;
  }
  tbody.innerHTML=[...visibleLogs].sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||'')).map((log,index)=>{
    const period=usageLogPeriod(log);
    const matched=usageLogRows(log).filter(row=>row.matched&&row.productId);
    const total=matched.reduce((sum,row)=>sum+usageRowQty(row),0);
    const classes=['usage-log-row'];
    const menuId=`usage-log-actions-${index}`;
    if(log.id===selectedUsageLogId)classes.push('row-selected');
    if(log.archived)classes.push('archived-row');
    return`<tr class="${classes.join(' ')}" onclick="openUsageLogView('${log.id}')">
      <td><strong>${period.start||'—'} to ${period.end||'—'}</strong>${log.archived?' <span class="sub-badge">Archived</span>':''}</td>
      <td>${escapeHtml(log.fileName||'Usage upload')}</td>
      <td>${matched.length}</td>
      <td>${total.toFixed(2)}</td>
      <td>${log.createdAt?new Date(log.createdAt).toLocaleString():'—'}</td>
      <td onclick="event.stopPropagation();">
        <div class="drop-wrap">
          <button class="btn btn-secondary btn-sm icon-btn" onclick="toggleMenu('${menuId}')" title="Usage log actions">...</button>
          <div class="drop-menu" id="${menuId}">
            <button onclick="closeAllMenus();downloadUsageLogSource('${log.id}')">Download source file</button>
            <button onclick="closeAllMenus();editUsageLog('${log.id}')">Edit</button>
            <button onclick="closeAllMenus();archiveUsageLog('${log.id}',${log.archived?'false':'true'})">${log.archived?'Restore':'Archive'}</button>
            <button onclick="closeAllMenus();deleteUsageLog('${log.id}')">Delete</button>
          </div>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function renderUploadedUsageDetails(){
  const tbody=document.getElementById('usage-upload-tbody');
  const thead=document.getElementById('usage-upload-thead');
  const actions=document.getElementById('usage-log-actions');
  const header=document.getElementById('usage-detail-header');
  const periodFields=document.getElementById('usage-log-period-fields');
  const card=document.getElementById('usage-upload-detail-card');
  if(!tbody||!card||!thead||!actions||!periodFields||!header)return;
  const log=selectedUsageLog();
  const rows=usageLogRows(log);
  if(!log){
    tbody.innerHTML='';
    return;
  }
  const period=usageLogPeriod(log);
  const start=log.periodStart||period.start||'';
  const end=log.periodEnd||period.end||'';
  const totalUsage=rows.reduce((sum,row)=>sum+usageRowQty(row),0);
  header.classList.toggle('pinned',usageLogHeaderPinned);
  document.getElementById('usage-detail-title').textContent=log.fileName||'Usage Log';
  periodFields.innerHTML=usageLogEditMode?`
    <div class="usage-detail-meta edit">
      <div class="form-group"><label>Start Date</label><input type="date" id="usage-log-start" value="${escapeHtml(start)}" onchange="saveUsageLogEdits()"></div>
      <div class="form-group"><label>End Date</label><input type="date" id="usage-log-end" value="${escapeHtml(end)}" onchange="saveUsageLogEdits()"></div>
      <div class="invoice-detail-field"><div class="label">Products</div><div class="value">${rows.length}</div></div>
      <div class="invoice-detail-field"><div class="label">Total Usage</div><div class="value">${totalUsage.toFixed(2)}</div></div>
      <div class="invoice-detail-field"><div class="label">Imported</div><div class="value">${log.createdAt?new Date(log.createdAt).toLocaleString():'—'}</div></div>
    </div>
  `:`
    <div class="invoice-detail-meta usage-detail-meta">
      <div class="invoice-detail-field"><div class="label">Start Date</div><div class="value">${start||'—'}</div></div>
      <div class="invoice-detail-field"><div class="label">End Date</div><div class="value">${end||'—'}</div></div>
      <div class="invoice-detail-field"><div class="label">Products</div><div class="value">${rows.length}</div></div>
      <div class="invoice-detail-field"><div class="label">Total Usage</div><div class="value">${totalUsage.toFixed(2)}</div></div>
      <div class="invoice-detail-field"><div class="label">Imported</div><div class="value">${log.createdAt?new Date(log.createdAt).toLocaleString():'—'}</div></div>
    </div>
  `;
  thead.innerHTML=usageLogEditMode
    ?'<tr><th>Product</th><th>Unit / Size</th><th>Actual Usage</th><th>Begin</th><th>End</th><th>Purch</th><th>Match</th><th></th></tr>'
    :'<tr><th>Product</th><th>Unit / Size</th><th>Actual Usage</th><th>Begin</th><th>End</th><th>Purch</th><th>Match</th></tr>';
  tbody.innerHTML=rows.map((row,index)=>usageLogEditMode?`
    <tr data-usage-search="${escapeHtml(usageLogRowSearchText(row))}">
      <td><select data-usage-index="${index}" data-field="productId" onchange="saveUsageLogEdits()">${usageProductOptions(row.productId)}</select></td>
      <td><input type="text" data-usage-index="${index}" data-field="unitSize" value="${escapeHtml(row.unitSize||'')}" oninput="saveUsageLogEdits()"></td>
      <td><input type="number" step="0.01" data-usage-index="${index}" data-field="actualUsage" value="${row.actualUsage!==''?escapeHtml(row.actualUsage):''}" oninput="saveUsageLogEdits()"></td>
      <td><input type="number" step="0.01" data-usage-index="${index}" data-field="begin" value="${row.begin!==''?escapeHtml(row.begin):''}" oninput="saveUsageLogEdits()"></td>
      <td><input type="number" step="0.01" data-usage-index="${index}" data-field="end" value="${row.end!==''?escapeHtml(row.end):''}" oninput="saveUsageLogEdits()"></td>
      <td><input type="number" step="0.01" data-usage-index="${index}" data-field="purch" value="${row.purch!==''?escapeHtml(row.purch):''}" oninput="saveUsageLogEdits()"></td>
      <td>${row.matched&&row.productId?'Matched':'Unmatched'}${row.sizeMatched?'':' <span class="sub-badge">size review</span>'}</td>
      <td><button class="btn btn-ghost-danger btn-sm" onclick="deleteUsageLogRow(${index})">×</button></td>
    </tr>
  `:`
    <tr data-usage-search="${escapeHtml(usageLogRowSearchText(row))}">
      <td><strong>${row.productId?productNameLink(row.productId):escapeHtml(row.matchedName||row.productName||'—')}</strong></td>
      <td>${escapeHtml(row.unitSize||'—')}</td>
      <td>${usageDisplayNumber(row.actualUsage)}</td>
      <td>${usageDisplayNumber(row.begin)}</td>
      <td>${usageDisplayNumber(row.end)}</td>
      <td>${usageDisplayNumber(row.purch)}</td>
      <td>${row.matched&&row.productId?'Matched':'Unmatched'}${row.sizeMatched?'':' <span class="sub-badge">size review</span>'}</td>
    </tr>
  `).join('')+`<tr id="usage-detail-no-results" hidden><td colspan="${usageLogEditMode?8:7}" class="empty-cell">No products match your search.</td></tr>`;
  actions.innerHTML=usageLogEditMode?`
    <button class="btn btn-secondary" onclick="toggleUsageLogHeaderPin()">${usageLogHeaderPinned?'Unpin':'Pin'}</button>
    <button class="btn btn-secondary" onclick="setUsageLogEditMode(false)">Done</button>
    <button class="btn btn-secondary" onclick="addUsageLogRow()">+ Add Row</button>
    <button class="btn btn-secondary" onclick="downloadUsageLogSource('${log.id}')">Download File</button>
    <button class="btn btn-secondary" onclick="archiveUsageLog('${log.id}',${log.archived?'false':'true'})">${log.archived?'Restore':'Archive'}</button>
    <button class="btn btn-ghost-danger" onclick="deleteUsageLog('${log.id}',true)">Delete</button>
  `:`
    <button class="btn btn-secondary" onclick="toggleUsageLogHeaderPin()">${usageLogHeaderPinned?'Unpin':'Pin'}</button>
    <button class="btn btn-secondary" onclick="downloadUsageLogSource('${log.id}')">Download File</button>
    <button class="btn btn-secondary" onclick="setUsageLogEditMode(true)">Edit</button>
    <button class="btn btn-secondary" onclick="archiveUsageLog('${log.id}',${log.archived?'false':'true'})">${log.archived?'Restore':'Archive'}</button>
    <button class="btn btn-ghost-danger" onclick="deleteUsageLog('${log.id}',true)">Delete</button>
  `;
  filterUsageLogDetailRows();
}

function usageLogRowSearchText(row){
  const product=row.productId?getProduct(row.productId):null;
  return[
    product?.name,
    row.matchedName,
    row.productName,
    row.reportProductName,
    row.unitSize,
    row.matched&&row.productId?'matched':'unmatched',
    row.sizeMatched?'':'size review'
  ].filter(Boolean).join(' ').toLowerCase();
}

function filterUsageLogDetailRows(){
  const query=(document.getElementById('usage-detail-search')?.value||'').trim().toLowerCase();
  const rows=[...document.querySelectorAll('#usage-upload-tbody tr[data-usage-search]')];
  let visible=0;
  rows.forEach(row=>{
    const match=!query||(row.dataset.usageSearch||'').includes(query);
    row.hidden=!match;
    if(match)visible++;
  });
  const empty=document.getElementById('usage-detail-no-results');
  if(empty)empty.hidden=!query||visible>0;
}

function toggleUsageLogHeaderPin(){
  usageLogHeaderPinned=!usageLogHeaderPinned;
  renderUploadedUsageDetails();
}

function setUsageLogEditMode(edit){
  usageLogEditMode=!!edit;
  renderUploadedUsageDetails();
  if(edit)setTimeout(()=>document.querySelector('#modal-usage-log-detail input, #modal-usage-log-detail select')?.focus(),0);
}

function saveUsageLogEdits(){
  const log=selectedUsageLog();
  if(!log)return;
  log.periodStart=document.getElementById('usage-log-start')?.value||'';
  log.periodEnd=document.getElementById('usage-log-end')?.value||'';
  document.querySelectorAll('#usage-upload-tbody [data-usage-index]').forEach(input=>{
    const row=log.rows[parseInt(input.dataset.usageIndex,10)];
    if(!row)return;
    const field=input.dataset.field;
    row[field]=input.value;
  });
  log.rows.forEach(row=>{
    const product=getProduct(row.productId);
    row.matched=!!product;
    row.matchedName=product?.name||null;
    row.productName=product?.name||row.productName||'';
    if(!row.reportProductName)row.reportProductName=row.productName;
    row.qty=usageRowQty(row);
    row.periodStart=log.periodStart||row.periodStart||'';
    row.periodEnd=log.periodEnd||row.periodEnd||'';
  });
  state.uploadedUsage=log.rows;
  save();
  renderUsageLogs();
  renderUsageSummaryOnly();
  refreshLiveInventoryIfVisible();
}

function renderUsageSummaryOnly(){
  const source=document.getElementById('usage-source').value;
  const cat=document.getElementById('usage-cat-f').value;
  const usage=source==='uploaded'?computeUploadedUsage():computeUsage();
  const rows=state.products.filter(p=>!cat||p.category===cat).map(p=>{
    const u=usage[p.id];
    const avgW=u&&u.days>0?(u.total/u.days)*7:0;
    const avgM=u&&u.days>0?(u.total/u.days)*30:0;
    return{p,avgW,avgM,dp:u?u.periods:0};
  }).sort((a,b)=>b.avgW-a.avgW);
  const maxW=rows.reduce((m,r)=>Math.max(m,r.avgW),1);
  const tbody=document.getElementById('usage-tbody');
  if(!rows.length){
    tbody.innerHTML=`<tr><td colspan="7" style="text-align:center;color:var(--text-muted);">No data.</td></tr>`;
    return;
  }
  tbody.innerHTML=rows.map(({p,avgW,avgM,dp})=>`<tr><td><strong>${productNameLink(p)}</strong></td><td>${catBadge(p.category)}</td><td>${escapeHtml(p.unit||'')}</td><td>${avgW>0?avgW.toFixed(2):'—'}</td><td>${avgM>0?avgM.toFixed(2):'—'}</td><td>${dp}</td><td style="min-width:80px;"><div class="usage-bar-bg"><div class="usage-bar" style="width:${avgW>0?(avgW/maxW*100).toFixed(1):0}%"></div></div></td></tr>`).join('');
}

function addUsageLogRow(){
  const log=selectedUsageLog();
  if(!log)return;
  log.rows.push({productId:'',productName:'',reportProductName:'',sku:'',unitSize:'',qty:0,actualUsage:'',begin:'',end:'',purch:'',periodStart:log.periodStart||'',periodEnd:log.periodEnd||'',matched:false,matchedName:null,sizeMatched:true,sourceFile:log.fileName,importedAt:new Date().toISOString()});
  state.uploadedUsage=log.rows;
  save();
  renderUsageLogs();
  renderUsageSummaryOnly();
  renderUploadedUsageDetails();
  refreshLiveInventoryIfVisible();
}

function deleteUsageLogRow(index){
  const log=selectedUsageLog();
  if(!log)return;
  log.rows.splice(index,1);
  state.uploadedUsage=log.rows;
  save();
  renderUsageLogs();
  renderUsageSummaryOnly();
  renderUploadedUsageDetails();
  refreshLiveInventoryIfVisible();
}

function deleteSelectedUsageLog(){
  const log=selectedUsageLog();
  if(!log)return;
  deleteUsageLog(log.id,true);
}

function archiveUsageLog(id,archived=true){
  const log=ensureUsageLogs().find(item=>item.id===id);
  if(!log)return;
  log.archived=archived;
  save();
  closeModal('modal-usage-log-detail');
  renderUsagePage();
  refreshLiveInventoryIfVisible();
  toast(archived?'Usage log archived.':'Usage log restored.');
}

function deleteUsageLog(id,fromModal=false){
  const log=ensureUsageLogs().find(item=>item.id===id);
  if(!log||!confirm('Delete this usage log?'))return;
  state.usageLogs=ensureUsageLogs().filter(item=>item.id!==id);
  const nextLog=state.usageLogs.at(-1)||null;
  selectedUsageLogId=nextLog?.id||null;
  state.uploadedUsage=nextLog?.rows||[];
  save();
  if(fromModal||document.getElementById('modal-usage-log-detail')?.classList.contains('open'))closeModal('modal-usage-log-detail');
  renderUsagePage();
  refreshLiveInventoryIfVisible();
}

function renderUsageSummaryShell(){
  const body=document.getElementById('usage-summary-body');
  const toggle=document.getElementById('usage-summary-toggle');
  if(!body||!toggle)return;
  body.style.display=usageSummaryExpanded?'block':'none';
  toggle.textContent=usageSummaryExpanded?'Collapse':'Expand';
}

function toggleUsageSummary(){
  usageSummaryExpanded=!usageSummaryExpanded;
  renderUsageSummaryShell();
}

function renderUsagePage(){
  ensureUsageLogs();
  renderUsageLogs();
  renderUsageSummaryShell();
  renderUsageSummaryOnly();
}

function renderInsights(){
  const usage=computeUsage();
  const lastInv=state.inventories[0];
  const alerts=[],suggestions=[];
  state.products.forEach(p=>{
    const u=usage[p.id];
    const avgW=u&&u.days>0?(u.total/u.days)*7:null;
    const stock=lastInv?lastInv.items[p.id]??null:null;
    if(avgW&&avgW>0&&stock!==null){
      const dL=Math.floor((stock/avgW)*7);
      const sups=state.suppliers.filter(s=>s.products&&s.products.includes(p.id));
      const maxLead=sups.length>0?Math.max(...sups.map(s=>s.leadDays||0)):0;
      const urg=maxLead+1;
      if(dL<=urg)alerts.push({type:'danger',icon:'🚨',name:p.name,msg:`Runout in ~<strong>${dL} day${dL!==1?'s':''}</strong>. Stock: ${stock}. Avg weekly: ${avgW.toFixed(2)}.${maxLead?` Lead: ${maxLead}d.`:''}`});
      else if(dL<=urg*3)alerts.push({type:'warning',icon:'⚠️',name:p.name,msg:`Running low — ~<strong>${dL} days</strong> remaining.`});
    }
    if(stock!==null&&p.par>0&&stock<=p.par&&!alerts.some(a=>a.name===p.name))alerts.push({type:'warning',icon:'📦',name:p.name,msg:`At or below par (stock: ${stock}, par: ${p.par}).`});
    if(avgW&&avgW>0){
      const sups=state.suppliers.filter(s=>s.products&&s.products.includes(p.id));
      const lead=sups.length>0?Math.max(...sups.map(s=>s.leadDays||0)):3;
      const suggested=Math.ceil((avgW/7)*(lead+7));
      const diff=suggested-(p.par||0);
      if(Math.abs(diff)>=1)suggestions.push({p,currentPar:p.par||0,suggested,avgW,reason:diff>0?`Usage exceeds par buffer (+${diff})`:`Par may be too high (−${Math.abs(diff)})`});
    }
  });
  document.getElementById('insights-alerts').innerHTML=alerts.length?alerts.map(a=>`<div class="alert-card ${a.type}"><div class="alert-icon">${a.icon}</div><div class="alert-body"><strong>${productNameLink(state.products.find(p=>p.name===a.name),a.name)}</strong><p>${a.msg}</p></div></div>`).join(''):`<div class="card" style="margin-bottom:18px;"><p style="color:var(--success);font-weight:600;">✅ No critical alerts.</p></div>`;
  document.getElementById('insights-tbody').innerHTML=suggestions.length?suggestions.map(({p,currentPar,suggested,avgW,reason})=>`<tr><td><strong>${productNameLink(p)}</strong></td><td>${catBadge(p.category)}</td><td>${currentPar}</td><td>${avgW.toFixed(2)} / wk</td><td><strong style="color:${suggested>currentPar?'var(--warning)':'var(--success)'}">${suggested}</strong></td><td style="font-size:0.78rem;color:var(--text-muted);">${reason}</td><td><button class="btn btn-primary btn-sm" onclick="applyPar('${p.id}',${suggested})">Apply ${suggested}</button></td></tr>`).join(''):`<tr><td colspan="7" style="text-align:center;color:var(--text-muted);">No adjustments suggested.</td></tr>`;
}

function applyPar(pid,v){
  const i=state.products.findIndex(p=>p.id===pid);
  if(i===-1)return;
  state.products[i].par=v;
  save();
  renderInsights();
  toast(`Par updated to ${v}.`);
}
