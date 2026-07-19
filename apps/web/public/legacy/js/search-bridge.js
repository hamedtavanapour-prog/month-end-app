// Forwards the desktop shortcut when focus is on the Next.js host rather than inside the workspace iframe.
document.addEventListener('keydown',event=>{
  if(!(event.metaKey||event.ctrlKey)||event.key.toLowerCase()!=='k')return;
  const frame=document.querySelector('iframe.legacy-frame');
  if(!frame?.contentWindow)return;
  event.preventDefault();
  frame.contentWindow.postMessage({type:'month-end:open-master-search'},window.location.origin);
});
