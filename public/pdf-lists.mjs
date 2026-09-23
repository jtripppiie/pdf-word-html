// Recover list structure when layout recognition returns bullet paragraphs.
// A standalone leading TeX bullet is a marker, not an article equation.
export function listMarker(block,{knownList=false}={}){
 if(!['text','ref_text'].includes(block.type)||!Array.isArray(block.content))return null;
 const index=block.content.findIndex(s=>s.type!=='text'||s.content.trim());if(index<0)return null;
 const span=block.content[index];
 if(span.type==='equation_inline'&&/^\\(?:bullet|textbullet)$/.test(span.content.trim()))return {kind:'ul',index,math:true};
 if(span.type!=='text')return null;
 const text=block.content.slice(index).map(s=>s.type==='text'?s.content:'\u0000').join('');
 const bullet=text.match(knownList?/^\s*[•●▪◦‣⁃-]\s*/:/^\s*[•●▪◦‣⁃]\s*/);if(bullet)return {kind:'ul',index,length:bullet[0].length};
 const number=text.match(/^\s*(\d{1,3})[.)]\s+/);if(number)return {kind:'ol',index,length:number[0].length,value:+number[1]};
 return null;
}
export function stripListMarker(block,marker){
 const child=structuredClone(block);if(!marker)return child;
 if(marker.math)child.content.splice(marker.index,1);
 else {let left=marker.length;for(let i=marker.index;i<child.content.length&&left;i++){const span=child.content[i];if(span.type!=='text')break;const count=Math.min(left,span.content.length);span.content=span.content.slice(count);left-=count;}}
 const first=child.content.find(s=>s.type!=='text'||s.content.trim());if(first?.type==='text')first.content=first.content.trimStart();
 return child;
}
export function recoverLists(blocks){
 const markers=blocks.map(block=>listMarker(block)),out=[];let stack=[];
 for(let i=0;i<blocks.length;i++){
  const block=blocks[i],marker=markers[i],x=block.bbox?.[0]??0;
  // Numbered prose is ambiguous: require a consecutive neighboring item at
  // the same indentation. Existing semantic list blocks need no such inference.
  const orderedPeer=marker?.kind!=='ol'||[-1,1].some(direction=>{
   for(let at=i+direction;at>=0&&at<blocks.length;at+=direction){
    const other=markers[at],peer=blocks[at],px=peer.bbox?.[0]??0;
    if(!other||px<x-.015)return false;
    if(Math.abs(px-x)<.015)return other.kind==='ol'&&other.value===marker.value+direction;
   }
   return false;
  });
  if(!marker||!orderedPeer){stack=[];out.push(block);continue;}
  while(stack.length&&x<stack.at(-1).x-.015)stack.pop();
  let current=stack.at(-1);
  if(!current||x>current.x+.015||current.kind!==marker.kind||(marker.kind==='ol'&&marker.value!==current.last+1)){
   const list={type:'list',list_kind:marker.kind,start:marker.value,content:[]};
   if(current&&x>current.x+.015){const parent=current.list.content.at(-1);(parent.nested_lists??=[]).push(list);}
   else {if(current){stack.pop();current=stack.at(-1);}if(current){const parent=current.list.content.at(-1);(parent.nested_lists??=[]).push(list);}else out.push(list);}
   current={list,x,kind:marker.kind,last:marker.value};stack.push(current);
  }
  current.list.content.push(stripListMarker(block,marker));current.last=marker.value;
 }
 return out;
}
