// Expand the existing preview without reloading its content or scroll position.
export function setupFullscreen(panel, button, iframe) {
 let expanded=false;
 function update(value){
  expanded=value;
  panel.classList.toggle('expanded',value);
  document.body.classList.toggle('preview-expanded',value);
  button.textContent=value?'Exit full screen':'Full screen';
  button.setAttribute('aria-pressed',String(value));
 }
 async function close(){
  if(document.fullscreenElement===panel)await document.exitFullscreen().catch(()=>{});
  update(false);button.focus();
 }
 button.addEventListener('click',async()=>{
  if(expanded){await close();return;}
  update(true);
  // The same full-window layout works when browser fullscreen is unavailable.
  try{await panel.requestFullscreen?.();}catch{}
 });
 document.addEventListener('fullscreenchange',()=>{
  if(!document.fullscreenElement&&expanded){update(false);button.focus();}
 });
 const escape=event=>{if(event.key==='Escape'&&expanded){event.preventDefault();close();}};
 document.addEventListener('keydown',escape);
 iframe.addEventListener('load',()=>iframe.contentDocument?.addEventListener('keydown',escape));
 return ()=>expanded;
}
