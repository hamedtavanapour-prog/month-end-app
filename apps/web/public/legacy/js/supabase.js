// supabase.js — authenticated compatibility bridge.
// The legacy interface remains unchanged while persistence is handled by the
// new organization-scoped Next.js + Supabase foundation.

let cloudReady=false, _pushTimer=null;
// Pull the saved state from Supabase. Returns the data object, null if the
// row is empty, or undefined if the request failed (offline / error).
async function cloudLoad(){
  try{
    const r=await fetch(WORKSPACE_STATE_ENDPOINT,{credentials:'same-origin',cache:'no-store'});
    if(!r.ok)throw new Error('HTTP '+r.status);
    const payload=await r.json();
    return payload.data||null;
  }catch(e){console.error('Cloud load failed:',e);return undefined;}
}
// Upsert the full state to Supabase (keyed on the single 'main' row).
async function cloudPush(){
  try{
    const data=typeof compactStateForStorage==='function'?compactStateForStorage():state;
    const r=await fetch(WORKSPACE_STATE_ENDPOINT,{
      method:'PUT',
      credentials:'same-origin',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(data)
    });
    if(!r.ok)throw new Error('HTTP '+r.status);
    return true;
  }catch(e){console.error('Cloud push failed:',e);return false;}
}
// Debounced so rapid edits collapse into one network write.
function cloudPushDebounced(){
  if(!cloudReady)return;
  clearTimeout(_pushTimer);
  _pushTimer=setTimeout(cloudPush,800);
}
// Critical saves (such as finishing a count) must not report success while a
// debounced cloud write is still pending.
async function cloudPushNow(){
  if(!cloudReady)return true;
  clearTimeout(_pushTimer);
  _pushTimer=null;
  return cloudPush();
}
