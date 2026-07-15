// spreadsheet.js — XLSX + CSV export helpers. Loads SheetJS from a CDN with a graceful CSV fallback.
// (Classic script sharing global scope; load order defined in index.html.)

function loadXLSXFallback(){
  var s=document.createElement('script');
  s.src='https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js';
  s.onerror=function(){console.error('Both SheetJS CDNs failed. CSV fallback will be used.');};
  document.head.appendChild(s);
}
// Guaranteed CSV export that always works — used if XLSX unavailable
function exportCSV(filename, rows){
  var csv=rows.map(function(r){
    return r.map(function(c){
      var v=c==null?'':String(c);
      if(v.includes(',')|| v.includes('"')|| v.includes('\n'))v='"'+v.replace(/"/g,'""')+'"';
      return v;
    }).join(',');
  }).join('\r\n');
  var blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'});
  var url=URL.createObjectURL(blob);
  var a=document.createElement('a');
  a.href=url;a.download=filename.replace('.xlsx','.csv');
  document.body.appendChild(a);a.click();
  setTimeout(function(){URL.revokeObjectURL(url);document.body.removeChild(a);},100);
}
// Wrapper — uses real XLSX if loaded, CSV otherwise
function xlDown(sheets, filename){
  if(typeof XLSX!=='undefined' && typeof XLSX.writeFile==='function'){
    try{
      var wb=XLSX.utils.book_new();
      sheets.forEach(function(s){
        var ws=XLSX.utils.aoa_to_sheet(s.rows);
        // Auto column widths
        if(s.rows.length){
          ws['!cols']=s.rows[0].map(function(_,ci){
            var max=10;
            s.rows.forEach(function(r){if(r[ci]!=null){var l=String(r[ci]).length;if(l>max)max=l;}});
            return{wch:Math.min(max+2,60)};
          });
        }
        XLSX.utils.book_append_sheet(wb,ws,s.name.slice(0,31));
      });
      XLSX.writeFile(wb,filename);
      toast('Downloaded: '+filename);
    }catch(e){
      toast('XLSX error — downloading as CSV instead.',true);
      exportCSV(filename,sheets[0].rows);
    }
  } else {
    toast('Excel library loading — downloading as CSV.',true);
    exportCSV(filename,sheets[0].rows);
  }
}
