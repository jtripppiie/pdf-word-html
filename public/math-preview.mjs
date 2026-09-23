let ready;
function loadMathJax(){
 return ready ||= new Promise((resolve,reject)=>{
  window.MathJax={startup:{typeset:false},tex:{packages:['base','ams'],maxBuffer:10000},svg:{fontCache:'none'},options:{enableMenu:false}};
  const script=document.createElement('script');script.src='/vendor/mathjax/tex-svg.js';
  script.onload=()=>window.MathJax.startup.promise.then(()=>resolve(window.MathJax),reject);
  script.onerror=()=>{ready=null;reject(new Error('Could not load the equation renderer.'));};document.head.append(script);
 });
}
export async function renderMath(doc){
 if(!doc?.body||! /\\[([$]/.test(doc.body.textContent))return;
 const math=/\\[([]/.test(doc.body.textContent)?await loadMathJax():null;
 const walker=doc.createTreeWalker(doc.body,NodeFilter.SHOW_TEXT),nodes=[];let node;
 while(node=walker.nextNode())if(!node.parentElement.closest('script,style,pre,code,mjx-container'))nodes.push(node);
 if(math){const style=math.startup.document.outputJax.styleSheet(math.startup.document);doc.head.append(doc.importNode(style,true));}
 for(const node of nodes){
  const pattern=/\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)|\\\$/g;let match,last=0;const fragment=doc.createDocumentFragment();
  while(match=pattern.exec(node.textContent)){
   fragment.append(node.textContent.slice(last,match.index));if(match[0]==='\\$'){fragment.append('$');last=pattern.lastIndex;continue;}const tex=match[1]??match[2];
   math.texReset();const result=await math.tex2svgPromise(tex,{display:match[1]!==undefined});
   const rendered=doc.importNode(result,true);rendered.setAttribute('aria-label',tex);fragment.append(rendered);last=pattern.lastIndex;
  }
  if(last){fragment.append(node.textContent.slice(last));node.replaceWith(fragment);}
 }
}

export async function validateTex(tex,display){
 const math=await loadMathJax();math.texReset();const result=await math.tex2svgPromise(tex,{display});
 if(result.querySelector('[data-mml-node="merror"]'))throw Error('MathJax could not read this TeX. Check the syntax before saving.');
}
