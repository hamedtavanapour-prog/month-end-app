// columns.js — configurable table columns for the Products / Inventory / Orders views.

const PROD_COLS=[
  {key:'sel',label:'',visible:true,sort:null,fixed:true},
  {key:'name',label:'Product Name',visible:true,sort:'name',fixed:true},
  {key:'inventoryName',label:'Inventory Name',visible:true,sort:'inventoryName'},
  {key:'aliases',label:'Alternate',visible:false,sort:null},
  {key:'category',label:'Category',visible:true,sort:'category'},
  {key:'subcategory',label:'Subcategory',visible:true,sort:'subcategory'},
  {key:'unit',label:'Packaging',visible:true,sort:'unit'},
  {key:'cost',label:'Packaging Cost',visible:true,sort:'cost'},
  {key:'par',label:'Par',visible:true,sort:'par'},
  {key:'lastCount',label:'Last Count',visible:true,sort:'lastCount'},
  {key:'sku',label:'SKU',visible:false,sort:null},
  {key:'notes',label:'Notes',visible:false,sort:null},
  {key:'suppliers',label:'Suppliers',visible:true,sort:null},
  {key:'actions',label:'',visible:true,sort:null,fixed:true},
];
const INV_COLS=[
  {key:'date',label:'Date',visible:true,sort:'date'},
  {key:'label',label:'Label',visible:true,sort:'label'},
  {key:'rooms',label:'Rooms',visible:true,sort:'roomsCount'},
  {key:'counted',label:'Items Counted',visible:true,sort:'counted'},
  {key:'missing',label:'Missing',visible:true,sort:'missing'},
  {key:'value',label:'Total Value',visible:true,sort:'value'},
  {key:'actions',label:'',visible:true,sort:null,fixed:true},
];
const ORD_COLS=[
  {key:'invoiceNumber',label:'Invoice #',visible:true,sort:'invoiceNumber'},
  {key:'supplier',label:'Supplier',visible:true,sort:'supplier'},
  {key:'total',label:'Total Price',visible:true,sort:'total'},
  {key:'date',label:'Date',visible:true,sort:'date'},
  {key:'status',label:'Status',visible:false,sort:'status'},
  {key:'lines',label:'Lines',visible:false,sort:'lines_count'},
  {key:'notes',label:'Notes',visible:false,sort:null},
  {key:'scan',label:'Scan',visible:true,sort:null,fixed:true},
  {key:'actions',label:'Actions',visible:true,sort:null,fixed:true},
];
const SUP_COLS=[
  {key:'name',label:'Name',visible:true,sort:'name',fixed:true},
  {key:'contact',label:'Contact',visible:true,sort:'contact'},
  {key:'email',label:'Email',visible:true,sort:'email'},
  {key:'phone',label:'Phone',visible:true,sort:'phone'},
  {key:'leadDays',label:'Lead Days',visible:true,sort:'leadDays'},
  {key:'minimum',label:'Minimum',visible:true,sort:'minSpend'},
  {key:'products',label:'Products',visible:true,sort:'productCount'},
  {key:'actions',label:'',visible:true,sort:null,fixed:true},
];

document.addEventListener('click',e=>{if(!e.target.closest('.drop-wrap')&&!e.target.closest('.col-wrap'))closeAllMenus();});
