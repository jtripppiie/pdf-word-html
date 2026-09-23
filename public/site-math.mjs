// The destination site enables $...$ math. Generated equations use \(...\)
// and \[...\]. Isolate prose dollar signs so they display without JavaScript
// and cannot become math delimiters when the site's MathJax runs.
export function siteMathHtml(html,{escapedOnly=false}={}){
 if(!html.includes('$'))return html;
 const doc=new DOMParser().parseFromString(html,'text/html');
 const walker=doc.createTreeWalker(doc.body,NodeFilter.SHOW_TEXT),nodes=[];let node;
 while(node=walker.nextNode())if(!node.parentElement.closest('script,style,code,pre,math,.tex2jax_ignore'))nodes.push(node);
 for(const node of nodes){
  const pattern=/\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]|\\+\$|\$/g;
  const text=node.textContent,fragment=doc.createDocumentFragment();let match,last=0,changed=false;
  while(match=pattern.exec(text)){
   fragment.append(text.slice(last,match.index));const token=match[0];
   if(/^\\+\$$/.test(token)||token==='$'&&!escapedOnly){const span=doc.createElement('span');span.className='tex2jax_ignore';span.textContent='$';fragment.append(span);changed=true;}
   else fragment.append(token);
   last=pattern.lastIndex;
  }
  if(changed){fragment.append(text.slice(last));node.replaceWith(fragment);}
 }
 return doc.body.innerHTML;
}
