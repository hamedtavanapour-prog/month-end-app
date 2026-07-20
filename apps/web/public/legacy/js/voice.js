// voice.js — OpenAI transcription-backed voice input for counts and orders.

let voiceRecorder=null;
let voiceStream=null;
let voiceContext=null;
let voiceActive=false;
let voiceFinal='';
let voiceChunks=[];
let voiceStartedAt=0;
let voicePendingTranscript='';
let voiceReviewPending=false;
let voicePreviousFocus=null;

function voiceHints(){
  return{
    products:'Say product name + par: "Disaronno 2, Jameson 4"',
    inventory:'Say product + count: "Absolut 3, goose 2, tank 4"',
    orders:'Say product + qty: "Absolut 6, Heineken 2"'
  };
}

function voiceLabels(){
  return{
    products:'Record Par Levels',
    inventory:'Record Inventory Count',
    orders:'Record Order Quantities'
  };
}

function setVoiceButtons(activeContext){
  ['products','orders','inventory'].forEach(context=>{
    const button=document.getElementById('voice-btn-'+context);
    if(button)button.classList.toggle('listening',context===activeContext);
  });
}

function setVoiceModal(text){
  const hints=voiceHints();
  const labels=voiceLabels();
  document.getElementById('voice-ctx-label').textContent=labels[voiceContext]||'Listening...';
  document.getElementById('voice-hint').textContent=hints[voiceContext]||'';
  document.getElementById('voice-live').textContent=text||'Listening...';
  const modal=document.getElementById('voice-modal');
  const opening=!modal.classList.contains('open');
  modal.classList.add('open');
  modal.setAttribute('aria-hidden','false');
  setVoiceBlocking(true);
  if(opening)setTimeout(()=>document.getElementById('voice-stop')?.focus(),0);
}

function setVoiceBlocking(active){
  document.body.classList.toggle('voice-ui-open',active);
  document.querySelector('.app')?.toggleAttribute('inert',active);
  document.querySelectorAll('.modal-overlay.open').forEach(overlay=>overlay.toggleAttribute('inert',active));
}

function setVoiceActionState(state){
  const stop=document.getElementById('voice-stop');
  const cancel=document.getElementById('voice-cancel');
  const modal=document.getElementById('voice-modal');
  const reviewField=document.getElementById('voice-review-field');
  const status=document.getElementById('voice-status-label');
  if(!stop||!cancel)return;
  modal.dataset.state=state;
  if(reviewField)reviewField.hidden=state!=='review';
  if(state==='recording'){
    stop.textContent='Stop & Review';
    stop.className='btn btn-danger';
    stop.disabled=false;
    cancel.textContent='Cancel Voice';
    cancel.style.display='inline-flex';
    cancel.disabled=false;
    if(status)status.textContent='Microphone active';
  }else if(state==='transcribing'){
    stop.textContent='Transcribing...';
    stop.className='btn btn-secondary';
    stop.disabled=true;
    cancel.style.display='none';
    if(status)status.textContent='Preparing your review';
  }else if(state==='review'){
    stop.textContent='Apply Transcription';
    stop.className='btn btn-primary';
    stop.disabled=false;
    cancel.textContent='Discard';
    cancel.style.display='inline-flex';
    cancel.disabled=false;
    if(status)status.textContent='Ready to review';
  }
}

function preferredAudioMime(){
  const options=['audio/webm;codecs=opus','audio/webm','audio/mp4'];
  return options.find(type=>window.MediaRecorder&&MediaRecorder.isTypeSupported(type))||'';
}

function reviewVoiceTranscript(transcript){
  const cleaned=String(transcript||'').trim();
  if(!cleaned){
    resetVoiceState();
    toast('Nothing heard.',true);
    return;
  }
  voiceFinal=cleaned;
  voicePendingTranscript=cleaned;
  voiceReviewPending=true;
  voiceRecorder=null;
  setVoiceButtons(null);
  setVoiceModal(cleaned);
  document.getElementById('voice-ctx-label').textContent='Review Transcription';
  document.getElementById('voice-hint').textContent='Check or correct the text, then apply it or discard it.';
  document.getElementById('voice-review-text').value=cleaned;
  setVoiceActionState('review');
  setTimeout(()=>document.getElementById('voice-review-text')?.focus(),0);
}

async function toggleVoice(ctx){
  if(voiceActive){
    stopVoice();
    return;
  }
  voiceContext=ctx;
  voiceFinal='';
  voiceChunks=[];
  voicePendingTranscript='';
  voiceReviewPending=false;
  await startVoice();
}

async function startVoice(){
  if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){
    toast('Voice recording needs a browser with microphone recording support.',true);
    return;
  }

  try{
    voiceStream=await navigator.mediaDevices.getUserMedia({audio:true});
    const mimeType=preferredAudioMime();
    voiceRecorder=new MediaRecorder(voiceStream,mimeType?{mimeType}:undefined);
    voiceRecorder.ondataavailable=event=>{
      if(event.data&&event.data.size>0)voiceChunks.push(event.data);
    };
    voiceRecorder.onerror=event=>{
      toast('Mic error: '+(event.error?.message||'recording failed'),true);
      resetVoiceState();
    };
    voiceRecorder.onstop=transcribeVoiceRecording;
    voiceStartedAt=Date.now();
    voiceActive=true;
    voicePreviousFocus=document.activeElement;
    setVoiceButtons(voiceContext);
    setVoiceModal('Listening... Click Stop & Review when finished.');
    setVoiceActionState('recording');
    voiceRecorder.start();
  }catch(error){
    toast('Microphone permission is required for voice.',true);
    resetVoiceState();
  }
}

function stopVoice(){
  if(voiceReviewPending){
    applyPendingVoiceTranscript();
    return;
  }
  if(!voiceActive)return;
  voiceActive=false;
  setVoiceButtons(null);
  setVoiceModal('Transcribing...');
  setVoiceActionState('transcribing');
  if(voiceRecorder&&voiceRecorder.state!=='inactive'){
    voiceRecorder.stop();
  }else{
    transcribeVoiceRecording();
  }
}

function resetVoiceState(){
  voiceActive=false;
  const recorder=voiceRecorder;
  voiceRecorder=null;
  if(recorder&&recorder.state!=='inactive'){
    recorder.onstop=null;
    try{recorder.stop();}catch(error){}
  }
  if(voiceStream){
    voiceStream.getTracks().forEach(track=>track.stop());
    voiceStream=null;
  }
  setVoiceButtons(null);
  const modal=document.getElementById('voice-modal');
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden','true');
  setVoiceBlocking(false);
  setVoiceActionState('recording');
  const previousFocus=voicePreviousFocus;
  voicePreviousFocus=null;
  setTimeout(()=>previousFocus?.focus?.(),0);
}

function cancelVoice(){
  voicePendingTranscript='';
  voiceReviewPending=false;
  resetVoiceState();
  toast('Voice cancelled.');
}

async function transcribeVoiceRecording(){
  const chunks=voiceChunks;
  voiceChunks=[];
  const stream=voiceStream;
  voiceStream=null;
  if(stream)stream.getTracks().forEach(track=>track.stop());

  if(Date.now()-voiceStartedAt<400||!chunks.length){
    resetVoiceState();
    toast('Nothing heard.',true);
    return;
  }

  const type=chunks[0]?.type||preferredAudioMime()||'audio/webm';
  const audio=new Blob(chunks,{type});
  try{
    const form=new FormData();
    const extension=type.includes('mp4')?'m4a':type.includes('ogg')?'ogg':'webm';
    form.append('audio',audio,`count-recording.${extension}`);
    const products=voiceContext==='inventory'&&typeof currentRoomProducts==='function'?currentRoomProducts():state.products;
    const vocabulary=[...new Set(products.flatMap(product=>[product.name,product.inventoryName].filter(Boolean)))].join(', ');
    form.append('vocabulary',vocabulary.slice(0,6000));
    const response=await fetch('/api/transcribe',{
      method:'POST',
      body:form
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||'Transcription failed.');

    const transcript=String(data.text||'').trim();
    voiceFinal=transcript;
    if(!transcript){
      resetVoiceState();
      toast('No speech detected.',true);
      return;
    }
    reviewVoiceTranscript(transcript);
  }catch(error){
    resetVoiceState();
    toast(error.message||'Voice transcription failed.',true);
  }
}

function applyPendingVoiceTranscript(){
  const transcript=String(document.getElementById('voice-review-text')?.value||voicePendingTranscript).trim();
  if(!transcript){toast('Enter or keep some transcription text before applying.',true);document.getElementById('voice-review-text')?.focus();return;}
  voicePendingTranscript='';
  voiceReviewPending=false;
  resetVoiceState();
  applyVoiceTranscript(transcript);
}

function blockClicksBehindVoice(event){
  const modal=document.getElementById('voice-modal');
  if(!modal?.classList.contains('open')||event.target?.closest?.('#voice-modal'))return;
  event.preventDefault();
  event.stopImmediatePropagation();
}
['pointerdown','touchstart','mousedown','click'].forEach(type=>document.addEventListener(type,blockClicksBehindVoice,true));
document.addEventListener('keydown',event=>{
  const modal=document.getElementById('voice-modal');
  if(event.key!=='Escape'||!modal?.classList.contains('open'))return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if(modal.dataset.state!=='transcribing')cancelVoice();
},true);

function applyVoiceTranscript(text){
  const t=String(text||'').trim();
  if(!t){
    toast('Nothing heard.',true);
    return;
  }
  const parsed=parseVoice(t);
  if(!parsed.length){
    toast('Could not parse: '+t,true);
    return;
  }
  if(voiceContext==='products')applyVoiceProducts(parsed);
  else if(voiceContext==='inventory')applyVoiceInventory(parsed);
  else if(voiceContext==='orders')applyVoiceOrders(parsed);
}

const NUMS={zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,thirty:30,forty:40,fifty:50,sixty:60,a:1,an:1,half:0.5};
function w2n(s){if(!s)return null;s=s.trim();const d=parseFloat(s);if(!isNaN(d))return d;const low=s.toLowerCase();if(low.includes('half'))return 0.5;if(low.includes('quarter'))return 0.25;const ws=low.split(/\s+/);let t=0,c=0;for(const w of ws){const n=NUMS[w];if(n===undefined)continue;if(w==='hundred')c=(c||1)*100;else c+=n;}return(t+c)||null;}
function parseVoice(text){
  const qtyWord='[\\d.]+|a|an|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|half|quarter';
  const chunks=text.replace(/\band then\b/gi,',').replace(/\bthen\b/gi,',').replace(/[,;]+/g,',').replace(/\s{2,}/g,' ').trim().split(',').map(s=>s.trim()).filter(Boolean);
  const res=[];
  for(const chunk of chunks){
    const sn=chunk.match(new RegExp(`^(${qtyWord})\\s+(.+)$`,'i'));
    const en=chunk.match(new RegExp(`^(.+?)\\s+(${qtyWord})$`,'i'));
    let ns=null,qs='1';
    if(sn){
      ns=sn[2];
      qs=sn[1];
    }else if(en){
      ns=en[1];
      qs=en[2];
    }else ns=chunk;
    ns=(ns||'').replace(/\bpar\b/gi,'').trim();
    if(!ns)continue;
    const qty=w2n(qs);
    res.push({nameStr:ns,qty:qty!==null?qty:1});
  }
  return res;
}
function normStr(s){return s.toLowerCase().replace(/[''`]/g,'').replace(/[éèê]/g,'e').replace(/[àâ]/g,'a').replace(/[ôö]/g,'o').replace(/[üùû]/g,'u').replace(/[ç]/g,'c').replace(/[ñ]/g,'n').replace(/\byr\b/g,'').replace(/\byear\b/g,'').replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();}
function normalizeVoiceNumberWords(value){
  const words=normStr(value).split(' ').filter(Boolean);
  const out=[];
  for(let i=0;i<words.length;i++){
    const word=words[i];
    const n=NUMS[word];
    if(n!==undefined&&Number.isInteger(n)&&!['a','an'].includes(word)){
      const next=NUMS[words[i+1]];
      if(n>=20&&n<100&&next>0&&next<10){
        out.push(String(n+next));
        i++;
      }else out.push(String(n));
    }else out.push(word);
  }
  return out.join(' ');
}
function voiceNameTokens(value){return normalizeVoiceNumberWords(value).split(' ').filter(Boolean);}
function voiceNumberTokens(value){return voiceNameTokens(value).filter(token=>/^\d+(?:\.\d+)?$/.test(token));}
function voiceProductNames(product){
  return[product.name,product.inventoryName,...String(product.aliases||'').split(',').map(alias=>alias.trim()).filter(Boolean)].map(normalizeVoiceNumberWords).filter(Boolean);
}
function voiceEditDistance(left,right){
  const a=String(left||''),b=String(right||'');
  const row=Array.from({length:b.length+1},(_,index)=>index);
  for(let i=1;i<=a.length;i++){
    let previous=row[0];
    row[0]=i;
    for(let j=1;j<=b.length;j++){
      const saved=row[j];
      row[j]=Math.min(row[j]+1,row[j-1]+1,previous+(a[i-1]===b[j-1]?0:1));
      previous=saved;
    }
  }
  return row[b.length];
}
function voiceWordSimilarity(queryWord,candidateWord){
  if(queryWord===candidateWord)return 1;
  if(Math.min(queryWord.length,candidateWord.length)>=3&&(candidateWord.startsWith(queryWord)||queryWord.startsWith(candidateWord))){
    return Math.min(queryWord.length,candidateWord.length)/Math.max(queryWord.length,candidateWord.length);
  }
  if(Math.min(queryWord.length,candidateWord.length)<4)return 0;
  const similarity=1-voiceEditDistance(queryWord,candidateWord)/Math.max(queryWord.length,candidateWord.length);
  return similarity>=0.6?similarity:0;
}
function voiceTokenScore(queryName,candidateName){
  if(queryName===candidateName)return 1;
  const generic=new Set(['vodka','rum','gin','scotch','irish','rye','whisky','whiskey','tequila','aperitif','liqueur','wine','beer']);
  const qTokens=queryName.split(' ').filter(token=>token&&!/^\d+(?:\.\d+)?$/.test(token)&&!generic.has(token));
  const cTokens=candidateName.split(' ').filter(token=>token&&!/^\d+(?:\.\d+)?$/.test(token)&&!generic.has(token));
  if(!qTokens.length||!cTokens.length)return 0;
  const queryCoverage=qTokens.reduce((sum,token)=>sum+Math.max(...cTokens.map(candidate=>voiceWordSimilarity(token,candidate))),0)/qTokens.length;
  const candidateCoverage=cTokens.reduce((sum,token)=>sum+Math.max(...qTokens.map(query=>voiceWordSimilarity(query,token))),0)/cTokens.length;
  return(queryCoverage+candidateCoverage)/2;
}
function voiceProductMatch(query,products){
  const q=normalizeVoiceNumberWords(query);
  if(!q)return null;
  const qNums=voiceNumberTokens(q);
  const candidates=[];
  products.forEach(product=>{
    voiceProductNames(product).forEach(name=>{
      const nameNums=voiceNumberTokens(name);
      if(qNums.length&&qNums.some(num=>!nameNums.includes(num)))return;
      if(!qNums.length&&nameNums.length&&q.split(' ').some(token=>/^\d/.test(token)))return;
      const score=voiceTokenScore(q,name);
      if(score>=0.6)candidates.push({product,score,name});
    });
  });
  candidates.sort((a,b)=>b.score-a.score||a.name.length-b.name.length||a.product.name.localeCompare(b.product.name));
  const best=candidates[0];
  if(!best)return null;
  const close=candidates.filter(candidate=>candidate.product.id!==best.product.id&&best.score-candidate.score<0.08);
  if(close.length&&best.score<1)return{ambiguous:true,query,candidates:[best,...close].slice(0,3)};
  return{product:best.product,score:best.score};
}
function fuzzyMatch(query,products){const q=normStr(query);if(!q)return null;for(const p of products){const aliases=(p.aliases||'').split(',').map(a=>normStr(a.trim())).filter(Boolean);if(aliases.includes(q))return{product:p,score:1};}for(const p of products){if(normStr(p.name)===q)return{product:p,score:1};}let best=null,bestScore=0;for(const p of products){const allNames=[normStr(p.name),...(p.aliases||'').split(',').map(a=>normStr(a.trim())).filter(Boolean)];for(const name of allNames){if(name.includes(q)||q.includes(name)){const score=Math.min(q.length,name.length)/Math.max(q.length,name.length);if(score>bestScore){bestScore=score;best=p;}}const qw=q.split(' ').filter(w=>w.length>1),nw=name.split(' ').filter(w=>w.length>1);let ov=0;for(const w of qw){if(nw.some(n=>n===w||n.startsWith(w)||w.startsWith(n)))ov++;}if(qw.length>0){const s2=ov/Math.max(qw.length,nw.length);if(s2>bestScore){bestScore=s2;best=p;}}}}return bestScore>=0.25?{product:best,score:bestScore}:null;}
function applyVoiceProducts(parsed){let m=0;const updated=new Set(),um=[];parsed.forEach(({nameStr,qty})=>{const r=fuzzyMatch(nameStr,state.products);if(r){r.product.par=qty;updated.add(r.product.id);m++;}else um.push(nameStr);});if(m){save();renderProducts();document.querySelectorAll('#prod-tbody tr[data-id]').forEach(row=>{if(updated.has(row.dataset.id)){row.classList.remove('voice-updated');void row.offsetWidth;row.classList.add('voice-updated');}});toast(`Voice: ${m} par level${m>1?'s':''} updated.`);}if(um.length)setTimeout(()=>toast('No match: '+um.join(', '),true),700);}
function applyVoiceInventory(parsed){let m=0;const um=[],amb=[],updated=[];const products=typeof currentRoomProducts==='function'?currentRoomProducts():state.products;parsed.forEach(({nameStr,qty})=>{const r=voiceProductMatch(nameStr,products);if(r&&!r.ambiguous){liveInvCounts[r.product.id]=qty;updated.push(r.product.id);m++;}else if(r?.ambiguous)amb.push(`${nameStr} (${r.candidates.map(candidate=>candidate.product.name).join(' / ')})`);else um.push(nameStr);});if(m){renderInvRows(true);updated.forEach(productId=>{const row=document.getElementById('row-'+productId);if(row){expandInventorySectionElement(row.closest('.inv-count-section'));row.classList.remove('voice-updated');void row.offsetWidth;row.classList.add('voice-updated');}});document.getElementById('row-'+updated[0])?.scrollIntoView({behavior:'smooth',block:'center'});toast(`Voice: ${m} count${m>1?'s':''} filled.`);}else updateInvProgress();if(amb.length)setTimeout(()=>toast('Ambiguous: '+amb.join(', '),true),700);else if(um.length)setTimeout(()=>toast('No match: '+um.join(', '),true),700);}
function applyVoiceOrders(parsed){const lines=[];const um=[];parsed.forEach(({nameStr,qty})=>{const r=fuzzyMatch(nameStr,state.products);if(r)lines.push({productId:r.product.id,productName:r.product.name,productNumber:r.product.sku||r.product.id,sku:r.product.sku||'',qty,unit:r.product.unit||'',unitSize:'',unitPrice:r.product.cost||0,deposit:0});else um.push(nameStr);});if(!lines.length){toast('No products matched.',true);return;}resetOrderModal();editingOrderId=null;document.getElementById('ord-modal-title').textContent='New Voice Invoice';document.getElementById('om-date').value=today();document.getElementById('om-invoice').value='Voice Invoice - '+new Date().toLocaleDateString('en-CA');document.getElementById('om-status').value='Draft';document.getElementById('om-notes').value=um.length?'Unmatched: '+um.join(', '):'';document.getElementById('order-lines').innerHTML='';lines.forEach(l=>addOrderLine(l));updateOrderTotal();openModal('modal-order');toast(`Voice: ${lines.length} line${lines.length>1?'s':''} added.`);if(um.length)setTimeout(()=>toast('No match: '+um.join(', '),true),800);}
