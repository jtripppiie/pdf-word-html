// Read note markers directly from PDF text geometry, before equation grouping
// can absorb a small raised number into a neighboring formula.
export function nativeNoteReferences(items,viewport,transform,bodySize,blocks){
 const labels=new Set(blocks.filter(b=>b.type==='page_footnote').map(b=>b.content?.[0]?.content?.match(/^\s*(\d{1,3})(?:\s|[.)])/u)?.[1]).filter(Boolean));
 if(!labels.size)return [];
 const words=items.filter(item=>item.str?.trim()).map(item=>{const t=transform(viewport.transform,item.transform);return {text:item.str,x:t[4],y:t[5],size:Math.hypot(t[2],t[3]),width:item.width*viewport.scale};});
 return words.flatMap((word,index)=>{
  const marker=word.text.trim();if(!labels.has(marker)||word.size>=bodySize*.9)return [];
  const x=word.x/viewport.width,y=word.y/viewport.height;
  if(blocks.some(b=>b.type==='page_footnote'&&b.bbox&&x>=b.bbox[0]-.005&&x<=b.bbox[2]+.005&&y>=b.bbox[1]-.005&&y<=b.bbox[3]+.005))return [];
  const before=words.slice(Math.max(0,index-8),index).filter(w=>!(labels.has(w.text.trim())&&w.size<bodySize*.9)).map(w=>w.text).join(' ').trim().slice(-160);
  return [{marker,x,y,before}];
 });
}
