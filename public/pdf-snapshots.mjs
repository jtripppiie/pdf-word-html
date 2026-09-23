// Preserve charts and tables as source pixels. Equation blocks are never cropped.
export async function attachPdfSnapshots(page,blocks,{signal}={}){
 const bodies=[];
 function visit(block){
  if(['chart_body','image_body','table_body'].includes(block.type)){bodies.push(block);return;}
  if(['chart','image','table'].includes(block.type)&&!block.content.some(b=>b.type===`${block.type}_body`))block.content.push({type:`${block.type}_body`,bbox:block.bbox,content:''});
  if(Array.isArray(block.content))for(const child of block.content)visit(child);
 }
 blocks.forEach(visit);if(!bodies.length)return 0;
 const viewport=page.getViewport({scale:2}),canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
 if(signal?.aborted)throw new DOMException('Conversion cancelled.','AbortError');
 const task=page.render({canvasContext:canvas.getContext('2d'),viewport,background:'#ffffff'}),cancel=()=>task.cancel();signal?.addEventListener('abort',cancel,{once:true});
 try{
  await task.promise;
  for(const block of bodies){
   const b=block.bbox;if(!Array.isArray(b)||b.length!==4||!b.every(Number.isFinite))throw Error('A chart or table has no usable location in the PDF.');
   const left=Math.max(0,Math.floor(b[0]*canvas.width)-2),top=Math.max(0,Math.floor(b[1]*canvas.height)-2),right=Math.min(canvas.width,Math.ceil(b[2]*canvas.width)+2),bottom=Math.min(canvas.height,Math.ceil(b[3]*canvas.height)+2);
   if(right<=left||bottom<=top)throw Error('A chart or table has an invalid location in the PDF.');
   const crop=document.createElement('canvas');crop.width=right-left;crop.height=bottom-top;crop.getContext('2d').drawImage(canvas,left,top,crop.width,crop.height,0,0,crop.width,crop.height);
   block.snapshot={src:crop.toDataURL('image/png'),width:Math.round(crop.width/2),height:Math.round(crop.height/2)};crop.width=crop.height=0;
  }
 }catch(error){if(signal?.aborted)throw new DOMException('Conversion cancelled.','AbortError');throw error;}
 finally{signal?.removeEventListener('abort',cancel);canvas.width=canvas.height=0;}
 return bodies.length;
}
