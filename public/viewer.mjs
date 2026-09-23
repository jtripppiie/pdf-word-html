export class PdfViewer {
 constructor(container,status,onPosition=()=>{}) {
  this.container=container;this.status=status;this.onPosition=onPosition;this.version=0;this.pending=Promise.resolve();
  container.addEventListener('scroll',()=>{if(this.frame)return;this.frame=requestAnimationFrame(()=>{this.frame=null;const position=this.position();if(position){this.markCurrent(position.number);this.onPosition(position);}});});
 }
 async clear(){
  this.version++;this.observer?.disconnect();
  this.renderTask?.cancel();await this.pending.catch(()=>{});
  if(this.task)await this.task.destroy().catch(()=>{});
  this.task=null;this.pdf=null;this.elements=[];this.container.replaceChildren();this.container.scrollTop=0;
 }
 async attach(task,pdf){
  await this.clear();this.task=task;this.pdf=pdf;
  const first=await pdf.getPage(1),viewport=first.getViewport({scale:1});
  const width=Math.max(200,this.container.clientWidth-24);
  for(let number=1;number<=pdf.numPages;number++){
   const element=document.createElement('div');element.className='pdf-sheet';element.dataset.page=number;element.style.aspectRatio=`${viewport.width} / ${viewport.height}`;
   element.setAttribute('aria-label',`PDF page ${number}`);this.elements.push(element);this.container.append(element);
  }
  this.observer=new IntersectionObserver(entries=>{for(const entry of entries){if(entry.isIntersecting)this.render(Number(entry.target.dataset.page));else if(!entry.target.dataset.rendering)entry.target.replaceChildren();}},{root:this.container,rootMargin:'400px'});
  this.elements.forEach(element=>this.observer.observe(element));
 }
 render(number,force=false){
  const version=this.version;
  this.pending=this.pending.catch(()=>{}).then(async()=>{
   if(version!==this.version||!this.pdf)return;
   const element=this.elements[number-1];if(!element||element.querySelector('canvas'))return;
   if(!force&&(element.offsetTop+element.offsetHeight<this.container.scrollTop-400||element.offsetTop>this.container.scrollTop+this.container.clientHeight+400))return;
   element.dataset.rendering='true';
   try{
    const page=await this.pdf.getPage(number);if(version!==this.version)return;
    const natural=page.getViewport({scale:1}),width=Math.max(200,element.clientWidth),viewport=page.getViewport({scale:Math.min(2,width/natural.width*(devicePixelRatio||1))});
    element.style.aspectRatio=`${natural.width} / ${natural.height}`;
    const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);element.append(canvas);
    this.renderTask=page.render({canvasContext:canvas.getContext('2d'),viewport});await this.renderTask.promise;this.markCurrent(this.position()?.number||number);
   }catch(error){if(error.name!=='RenderingCancelledException')this.status.textContent=`Could not render PDF page ${number}.`;}
   finally{delete element.dataset.rendering;this.renderTask=null;}
  });return this.pending;
 }
 position(){
  if(!this.pdf||!this.elements?.length)return null;
  const top=this.container.scrollTop+40;
  let element=this.elements[0];for(const candidate of this.elements){if(candidate.offsetTop>top)break;element=candidate;}
  return {number:Number(element.dataset.page),ratio:Math.max(0,Math.min(1,(top-element.offsetTop)/element.offsetHeight))};
 }
 markCurrent(number){
  this.container.querySelector('#pdf-canvas')?.removeAttribute('id');const canvas=this.elements[number-1]?.querySelector('canvas');if(canvas)canvas.id='pdf-canvas';
  this.status.textContent=`PDF page ${number} of ${this.pdf.numPages}`;
 }
 async show(number,ratio=0){
  if(!this.pdf)return;
  await this.render(number,true);const element=this.elements[number-1];if(!element)return;
  this.container.scrollTop=Math.max(0,element.offsetTop+ratio*element.offsetHeight-40);this.markCurrent(number);
 }
}
