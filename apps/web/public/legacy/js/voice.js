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
let voiceRecordingTimer=null;
let voiceTranscriptionController=null;
let voiceRecordedMs=0;
let voiceSegmentStartedAt=0;
let inventoryTranscribeHistory=[];
let recountTranscribeHistory=[];
const VOICE_MAX_RECORDING_MS=2*60*1000;
const VOICE_TRANSCRIPTION_TIMEOUT_MS=45*1000;

function voiceHints(){
  return{
    products:'Say product name + par: "Disaronno 2, Jameson 4"',
    inventory:'Set with “Absolut 2,” add with “add 3 Absolut,” or deduct with “remove 1 Absolut.” Pause whenever you need to look around.',
    'count-extra':'Say one or more product names to find and select them.',
    recount:'Call out product names: "Absolut, goose, Jameson"',
    orders:'Say product + qty: "Absolut 6, Heineken 2"'
  };
}

function voiceLabels(){
  return{
    products:'Record Par Levels',
    inventory:'Record Inventory Count',
    'count-extra':'Find Unlisted Items',
    recount:'Select Re-count Products',
    orders:'Record Order Quantities'
  };
}

function setVoiceButtons(activeContext){
  ['products','orders','inventory','recount','count-extra'].forEach(context=>{
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
  updateVoiceItemCount(text);
  const modal=document.getElementById('voice-modal');
  const opening=!modal.classList.contains('open');
  modal.classList.add('open');
  modal.setAttribute('aria-hidden','false');
  setVoiceBlocking(true);
  if(opening)setTimeout(()=>document.getElementById('voice-stop')?.focus(),0);
}

function voiceParsedItemCount(text){
  return['inventory','recount','count-extra'].includes(voiceContext)?parseVoice(String(text||'')).length:0;
}
function updateVoiceItemCount(text=document.getElementById('voice-review-text')?.value||''){
  const counter=document.getElementById('voice-item-counter');
  const value=document.getElementById('voice-item-count');
  if(!counter||!value)return;
  counter.hidden=!['inventory','recount','count-extra'].includes(voiceContext);
  const label=document.getElementById('voice-item-counter-label');
  if(label)label.textContent=document.getElementById('voice-modal')?.dataset.state==='review'?'Items ready':'Items detected';
  value.textContent=String(voiceParsedItemCount(text));
}
function resetInventoryTranscribeHistory(){
  inventoryTranscribeHistory=[];
  renderTranscribeHistory();
}
function addInventoryTranscribeHistory(type,title,text){
  if(voiceContext!=='inventory'&&!currentCountRoomLock)return;
  inventoryTranscribeHistory.push({type,title,text:String(text||''),time:new Date()});
  renderTranscribeHistory();
}
function addRecountTranscribeHistory(type,title,text){
  recountTranscribeHistory.push({type,title,text:String(text||''),time:new Date()});
  renderTranscribeHistory('recount');
}
function activeTranscribeHistory(context){return context==='recount'?recountTranscribeHistory:inventoryTranscribeHistory;}
function renderTranscribeHistory(context=voiceContext==='recount'?'recount':'inventory'){
  const history=activeTranscribeHistory(context);
  const list=document.getElementById('transcribe-history-list');
  const button=document.getElementById(context==='recount'?'recount-transcribe-history-button':'transcribe-history-button');
  if(button)button.textContent=`Transcribe History${history.length?` (${history.length})`:''}`;
  if(!list)return;
  document.getElementById('transcribe-history-title').textContent=context==='recount'?'Re-count Transcribe History':'Transcribe History';
  list.innerHTML=history.length?history.map(entry=>`<div class="transcribe-history-entry ${entry.type}"><strong>${escapeHtml(entry.title)}</strong><p>${escapeHtml(entry.text)}</p><time>${entry.time.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</time></div>`).join(''):`<div class="empty-cell">No transcription activity ${context==='recount'?'for this re-count selection':'in this room'} yet.</div>`;
}
function openTranscribeHistory(context='inventory'){renderTranscribeHistory(context);openModal('modal-transcribe-history');}

function setVoiceBlocking(active){
  document.body.classList.toggle('voice-ui-open',active);
  document.querySelector('.app')?.toggleAttribute('inert',active);
  document.querySelectorAll('.modal-overlay.open').forEach(overlay=>overlay.toggleAttribute('inert',active));
  if(typeof syncBlockingUiState==='function')syncBlockingUiState();
}

function setVoiceActionState(state){
  const stop=document.getElementById('voice-stop');
  const cancel=document.getElementById('voice-cancel');
  const modal=document.getElementById('voice-modal');
  const reviewField=document.getElementById('voice-review-field');
  const status=document.getElementById('voice-status-label');
  const pause=document.getElementById('voice-pause');
  const redo=document.getElementById('voice-redo');
  if(!stop||!cancel)return;
  modal.dataset.state=state;
  updateVoiceItemCount(state==='review'?document.getElementById('voice-review-text')?.value:'');
  if(reviewField)reviewField.hidden=state!=='review';
  if(pause)pause.hidden=!['recording','paused'].includes(state);
  if(redo)redo.hidden=state!=='review';
  if(state==='recording'){
    stop.textContent='Stop & Review';
    stop.className='btn btn-danger';
    stop.disabled=false;
    cancel.textContent='Cancel Voice';
    cancel.style.display='inline-flex';
    cancel.disabled=false;
    if(status)status.textContent='Microphone active';
  }else if(state==='paused'){
    stop.textContent='Stop & Review';
    stop.className='btn btn-danger';
    stop.disabled=false;
    cancel.textContent='Cancel Voice';
    cancel.style.display='inline-flex';
    cancel.disabled=false;
    if(pause)pause.textContent='Resume';
    if(status)status.textContent='Recording paused';
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
  if(pause&&state==='recording')pause.textContent='Pause';
}

function scheduleVoiceRecordingLimit(){
  clearTimeout(voiceRecordingTimer);
  const remaining=Math.max(0,VOICE_MAX_RECORDING_MS-voiceRecordedMs);
  voiceRecordingTimer=setTimeout(()=>{
    if(!voiceActive)return;
    toast('Two-minute recording limit reached. Preparing your review.');
    stopVoice();
  },remaining);
}

function preferredAudioMime(){
  const options=['audio/webm;codecs=opus','audio/webm','audio/mp4'];
  return options.find(type=>window.MediaRecorder&&MediaRecorder.isTypeSupported(type))||'';
}

function reviewVoiceTranscript(transcript){
  const cleaned=String(transcript||'').trim();
  if(!cleaned){
    if(voiceContext==='inventory')addInventoryTranscribeHistory('unmatched','Nothing transcribed','No speech was detected.');
    if(voiceContext==='recount')addRecountTranscribeHistory('unmatched','Nothing transcribed','No speech was detected.');
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
  if(voiceContext==='inventory')addInventoryTranscribeHistory('transcript','Transcription',cleaned);
  if(voiceContext==='recount')addRecountTranscribeHistory('transcript','Transcription',cleaned);
  updateVoiceItemCount(cleaned);
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
    voiceRecordedMs=0;
    voiceSegmentStartedAt=voiceStartedAt;
    voiceActive=true;
    voicePreviousFocus=document.activeElement;
    setVoiceButtons(voiceContext);
    setVoiceModal('Listening... Click Stop & Review when finished.');
    setVoiceActionState('recording');
    voiceRecorder.start();
    scheduleVoiceRecordingLimit();
  }catch(error){
    toast('Microphone permission is required for voice.',true);
    resetVoiceState();
  }
}

function toggleVoicePause(){
  if(!voiceActive||!voiceRecorder)return;
  if(voiceRecorder.state==='recording'){
    voiceRecorder.pause();
    voiceRecordedMs+=Date.now()-voiceSegmentStartedAt;
    clearTimeout(voiceRecordingTimer);
    voiceRecordingTimer=null;
    setVoiceModal('Paused. Resume when you are ready to continue counting.');
    setVoiceActionState('paused');
  }else if(voiceRecorder.state==='paused'){
    voiceRecorder.resume();
    voiceSegmentStartedAt=Date.now();
    setVoiceModal('Listening... Click Pause if you need another moment.');
    setVoiceActionState('recording');
    scheduleVoiceRecordingLimit();
  }
}

function stopVoice(){
  if(voiceReviewPending){
    applyPendingVoiceTranscript();
    return;
  }
  if(!voiceActive)return;
  if(voiceRecorder?.state==='recording')voiceRecordedMs+=Date.now()-voiceSegmentStartedAt;
  voiceActive=false;
  clearTimeout(voiceRecordingTimer);
  voiceRecordingTimer=null;
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
  clearTimeout(voiceRecordingTimer);
  voiceRecordingTimer=null;
  if(voiceTranscriptionController){
    voiceTranscriptionController.abort();
    voiceTranscriptionController=null;
  }
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
  if(voiceContext==='inventory'&&voicePendingTranscript)addInventoryTranscribeHistory('unmatched','Transcription discarded',voicePendingTranscript);
  if(voiceContext==='recount'&&voicePendingTranscript)addRecountTranscribeHistory('unmatched','Transcription discarded',voicePendingTranscript);
  voicePendingTranscript='';
  voiceReviewPending=false;
  resetVoiceState();
  toast('Voice cancelled.');
}

async function redoVoice(){
  if(!voiceReviewPending)return;
  if(voiceContext==='inventory'&&voicePendingTranscript)addInventoryTranscribeHistory('unmatched','Transcription redone',voicePendingTranscript);
  if(voiceContext==='recount'&&voicePendingTranscript)addRecountTranscribeHistory('unmatched','Transcription redone',voicePendingTranscript);
  const previousFocus=voicePreviousFocus;
  voicePendingTranscript='';
  voiceReviewPending=false;
  voiceFinal='';
  voiceChunks=[];
  await startVoice();
  voicePreviousFocus=previousFocus;
}

async function transcribeVoiceRecording(){
  const chunks=voiceChunks;
  voiceChunks=[];
  const stream=voiceStream;
  voiceStream=null;
  if(stream)stream.getTracks().forEach(track=>track.stop());

  if(voiceRecordedMs<400||!chunks.length){
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
    const products=voiceContext==='count-extra'&&typeof currentRoomProducts==='function'?state.products.filter(product=>!product.archived&&!new Set(currentRoomProducts().map(item=>item.id)).has(product.id)):voiceContext==='recount'&&typeof recountSelectableProducts==='function'?recountSelectableProducts():state.products;
    const vocabulary=[...new Set(products.flatMap(product=>[product.name,product.inventoryName].filter(Boolean)))].join(', ');
    form.append('vocabulary',vocabulary.slice(0,6000));
    const controller=new AbortController();
    voiceTranscriptionController=controller;
    const timeout=setTimeout(()=>controller.abort(),VOICE_TRANSCRIPTION_TIMEOUT_MS);
    let response;
    try{
      response=await fetch('/api/transcribe',{
        method:'POST',
        body:form,
        signal:controller.signal
      });
    }finally{
      clearTimeout(timeout);
      if(voiceTranscriptionController===controller)voiceTranscriptionController=null;
    }
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||'Transcription failed.');

    const transcript=String(data.text||'').trim();
    voiceFinal=transcript;
    if(!transcript){
      if(voiceContext==='inventory')addInventoryTranscribeHistory('unmatched','Nothing transcribed','No speech was detected.');
      if(voiceContext==='recount')addRecountTranscribeHistory('unmatched','Nothing transcribed','No speech was detected.');
      resetVoiceState();
      toast('No speech detected.',true);
      return;
    }
    reviewVoiceTranscript(transcript);
  }catch(error){
    if(voiceContext==='inventory')addInventoryTranscribeHistory('unmatched','Transcription failed',error?.name==='AbortError'?'The recording took too long to transcribe.':error.message||'Voice transcription failed.');
    if(voiceContext==='recount')addRecountTranscribeHistory('unmatched','Transcription failed',error?.name==='AbortError'?'The recording took too long to transcribe.':error.message||'Voice transcription failed.');
    resetVoiceState();
    toast(error?.name==='AbortError'?'Voice transcription took too long. Try a shorter recording.':error.message||'Voice transcription failed.',true);
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
    if(voiceContext==='inventory')addInventoryTranscribeHistory('unmatched','Transcription not applied',t);
    if(voiceContext==='recount')addRecountTranscribeHistory('unmatched','Transcription not applied',t);
    toast('Could not parse: '+t,true);
    return;
  }
  if(voiceContext==='products')applyVoiceProducts(parsed);
  else if(voiceContext==='inventory')applyVoiceInventory(parsed);
  else if(voiceContext==='count-extra')applyVoiceCountExtra(parsed);
  else if(voiceContext==='recount')applyVoiceRecount(parsed);
  else if(voiceContext==='orders')applyVoiceOrders(parsed);
}

const NUMS=window.MonthEndVoiceCommands.NUMS;
const w2n=window.MonthEndVoiceCommands.wordsToNumber;
const parseVoice=window.MonthEndVoiceCommands.parseVoice;
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
function applyVoiceInventory(parsed){
  let matched=0,changed=0;
  const unmatched=[],ambiguous=[],updated=[],applied=[];
  const products=typeof currentRoomProducts==='function'?currentRoomProducts():state.products;
  parsed.forEach(({nameStr,qty,operation='set'})=>{
    let result=voiceProductMatch(nameStr,products);
    if(!result){
      const recognized=voiceProductMatch(nameStr,state.products.filter(product=>!product.archived));
      if(recognized&&!recognized.ambiguous){
        const roomName=currentInventoryRoom()?.name||'this room';
        const productName=recognized.product.inventoryName||recognized.product.name;
        if(window.confirm(`${productName} is not listed in ${roomName}, but it was recognized as a product. Add it to this room for this count only?`)){
          addCountExtraProducts([recognized.product.id],{closePicker:false});
          result=recognized;
        }else{
          unmatched.push(`${productName} (not added to ${roomName})`);
          return;
        }
      }else if(recognized?.ambiguous)result=recognized;
    }
    if(result&&!result.ambiguous){
      const previous=Number.parseFloat(liveInvCounts[result.product.id]);
      const current=Number.isFinite(previous)?previous:0;
      let resolvedOperation=operation;
      if(operation==='set'&&Number.isFinite(previous)){
        const add=window.confirm(`${result.product.inventoryName||result.product.name} already has a count of ${previous}. Select OK to add ${qty}, or Cancel to replace it with ${qty}.`);
        resolvedOperation=add?'add':'set';
      }
      const next=window.MonthEndVoiceCommands.applyCountOperation(current,qty,resolvedOperation);
      liveInvCounts[result.product.id]=next;
      updated.push(result.product.id);
      if(next!==current)changed++;
      if(resolvedOperation==='add')applied.push(`${result.product.name}: ${current} + ${qty} = ${next}`);
      else if(resolvedOperation==='subtract')applied.push(`${result.product.name}: ${current} − ${qty} = ${next}`);
      else applied.push(`${result.product.name}: ${next}`);
      matched++;
    }else if(result?.ambiguous){
      ambiguous.push(`${nameStr}: ${result.candidates.map(candidate=>candidate.product.name).join(' / ')}`);
    }else unmatched.push(nameStr);
  });
  if(applied.length)addInventoryTranscribeHistory('applied',`${applied.length} item${applied.length===1?'':'s'} applied`,applied.join('\n'));
  if(ambiguous.length)addInventoryTranscribeHistory('ambiguous',`${ambiguous.length} ambiguous item${ambiguous.length===1?'':'s'}`,ambiguous.join('\n'));
  if(unmatched.length)addInventoryTranscribeHistory('unmatched',`${unmatched.length} item${unmatched.length===1?'':'s'} not applied`,unmatched.join('\n'));
  if(matched){
    renderInvRows(true);
    updated.forEach(productId=>{
      const row=document.getElementById('row-'+productId);
      if(row){expandInventorySectionElement(row.closest('.inv-count-section'));row.classList.remove('voice-updated');void row.offsetWidth;row.classList.add('voice-updated');}
    });
    document.getElementById('row-'+updated[0])?.scrollIntoView({behavior:'smooth',block:'center'});
    toast(`Voice: ${changed} item${changed===1?'':'s'} changed${matched!==changed?` (${matched} recognized)`:''}.`);
  }else updateInvProgress();
  if(ambiguous.length)setTimeout(()=>toast('Ambiguous: '+ambiguous.join(', '),true),700);
  else if(unmatched.length)setTimeout(()=>toast('No match: '+unmatched.join(', '),true),700);
}
function applyVoiceCountExtra(parsed){
  const assigned=new Set(typeof currentRoomProducts==='function'?currentRoomProducts().map(product=>product.id):[]);
  const products=state.products.filter(product=>!product.archived&&!assigned.has(product.id));
  const selected=[],ambiguous=[],unmatched=[];
  parsed.forEach(({nameStr})=>{
    const whole=voiceProductMatch(nameStr,products);
    const names=!whole&&/\s+and\s+/i.test(nameStr)?nameStr.split(/\s+and\s+/i).map(value=>value.trim()).filter(Boolean):[nameStr];
    names.forEach(name=>{
      const result=name===nameStr?whole:voiceProductMatch(name,products);
      if(result&&!result.ambiguous){
        countExtraSelectedProductIds.add(result.product.id);
        expandedCountExtraCategories.add(countExtraCategoryToken(result.product.category||'Other'));
        selected.push(result.product.inventoryName||result.product.name);
      }else if(result?.ambiguous)ambiguous.push(`${name}: ${result.candidates.map(candidate=>candidate.product.name).join(' / ')}`);
      else unmatched.push(name);
    });
  });
  renderCountExtraProductPicker();
  toast(selected.length?`Voice: ${selected.length} item${selected.length===1?'':'s'} selected.`:'No unlisted items were selected.',!selected.length);
  if(ambiguous.length||unmatched.length)setTimeout(()=>toast(`${ambiguous.length+unmatched.length} item${ambiguous.length+unmatched.length===1?' needs':'s need'} review.`,true),700);
}
function applyVoiceRecount(parsed){
  const products=recountSelectableProducts();
  const applied=[],ambiguous=[],unmatched=[];
  parsed.forEach(({nameStr})=>{
    const result=voiceProductMatch(nameStr,products);
    if(result&&!result.ambiguous){recountSelectedProductIds.add(result.product.id);applied.push(result.product.name);}
    else if(result?.ambiguous)ambiguous.push(`${nameStr}: ${result.candidates.map(candidate=>candidate.product.name).join(' / ')}`);
    else unmatched.push(nameStr);
  });
  if(applied.length)addRecountTranscribeHistory('applied',`${applied.length} product${applied.length===1?'':'s'} selected`,applied.join('\n'));
  if(ambiguous.length)addRecountTranscribeHistory('ambiguous',`${ambiguous.length} ambiguous product${ambiguous.length===1?'':'s'}`,ambiguous.join('\n'));
  if(unmatched.length)addRecountTranscribeHistory('unmatched',`${unmatched.length} product${unmatched.length===1?'':'s'} missed`,unmatched.join('\n'));
  renderRecountProductSelector();
  toast(applied.length?`Voice: ${applied.length} product${applied.length===1?'':'s'} selected.`:'No products were selected.',!applied.length);
  if(ambiguous.length||unmatched.length)setTimeout(()=>toast(`${ambiguous.length+unmatched.length} product${ambiguous.length+unmatched.length===1?' was':'s were'} not applied. Check Transcribe History.`,true),700);
}
function applyVoiceOrders(parsed){const lines=[];const um=[];parsed.forEach(({nameStr,qty})=>{const r=fuzzyMatch(nameStr,state.products);if(r)lines.push({productId:r.product.id,productName:r.product.name,productNumber:r.product.sku||r.product.id,sku:r.product.sku||'',qty,unit:r.product.unit||'',unitSize:'',unitPrice:r.product.cost||0,deposit:0});else um.push(nameStr);});if(!lines.length){toast('No products matched.',true);return;}resetOrderModal();editingOrderId=null;document.getElementById('ord-modal-title').textContent='New Voice Invoice';document.getElementById('om-date').value=today();document.getElementById('om-invoice').value='Voice Invoice - '+new Date().toLocaleDateString('en-CA');document.getElementById('om-status').value='Draft';document.getElementById('om-notes').value=um.length?'Unmatched: '+um.join(', '):'';document.getElementById('order-lines').innerHTML='';lines.forEach(l=>addOrderLine(l));updateOrderTotal();openModal('modal-order');toast(`Voice: ${lines.length} line${lines.length>1?'s':''} added.`);if(um.length)setTimeout(()=>toast('No match: '+um.join(', '),true),800);}
