// Browser port of RapidLaTeXOCR preprocessing and greedy decoding (MIT).
// See THIRD_PARTY_NOTICES.md. All inference stays inside this worker.
import * as ort from './vendor/ort/ort.wasm.min.mjs';
ort.env.wasm.numThreads=1;ort.env.wasm.wasmPaths=new URL('./vendor/ort/',self.location.href).href;
let ready;
async function load(){
 return ready ||= (async()=>{
  const options={executionProviders:['wasm'],graphOptimizationLevel:'all'};
  const sessions={};
  for(const name of ['image_resizer','encoder','decoder']){postMessage({status:`Loading local equation model (${name})…`});sessions[name]=await ort.InferenceSession.create(`/vendor/latex-ocr/${name}.onnx`,options);}
  const response=await fetch('/vendor/latex-ocr/tokenizer.json');if(!response.ok)throw Error('Could not load equation vocabulary.');
  const tokenizer=await response.json();sessions.vocab=Object.fromEntries(Object.entries(tokenizer.model.vocab).map(([token,id])=>[id,token]));return sessions;
 })();
}
function canvas(w,h){const c=new OffscreenCanvas(Math.max(1,w),Math.max(1,h));const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);return c;}
function resize(input,w,h,filter='bilinear'){
 w=Math.max(1,w);h=Math.max(1,h);
 const source=input.getContext('2d').getImageData(0,0,input.width,input.height).data;
 const kernel=x=>{x=Math.abs(x);if(filter==='bilinear')return Math.max(0,1-x);if(x===0)return 1;if(x>=3)return 0;return Math.sin(Math.PI*x)*Math.sin(Math.PI*x/3)/(Math.PI*Math.PI*x*x/3);};
 function weights(before,after){const scale=before/after,stretch=Math.max(1,scale),support=(filter==='bilinear'?1:3)*stretch;return Array.from({length:after},(_,i)=>{const center=(i+.5)*scale,start=Math.max(0,Math.floor(center-support+.5)),end=Math.min(before,Math.floor(center+support+.5)),list=[];let sum=0;for(let j=start;j<end;j++){const weight=kernel((j+.5-center)/stretch);list.push([j,weight]);sum+=weight;}return list.map(([j,weight])=>[j,weight/sum]);});}
 const horizontal=weights(input.width,w),vertical=weights(input.height,h),middle=new Uint8ClampedArray(w*input.height);
 for(let y=0;y<input.height;y++)for(let x=0;x<w;x++){let value=0;for(const [j,weight]of horizontal[x])value+=source[(y*input.width+j)*4]*weight;middle[y*w+x]=Math.round(value);}
 const out=canvas(w,h),data=out.getContext('2d').createImageData(w,h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){let value=0;for(const[j,weight]of vertical[y])value+=middle[j*w+x]*weight;const i=(y*w+x)*4;data.data[i]=data.data[i+1]=data.data[i+2]=Math.round(value);data.data[i+3]=255;}
 out.getContext('2d').putImageData(data,0,0);return out;
}
function pad(input){
 const w=input.width,h=input.height,data=input.getContext('2d').getImageData(0,0,w,h);const gray=new Float32Array(w*h);let min=255,max=0,sum=0;
 for(let i=0;i<gray.length;i++){const p=i*4;gray[i]=.299*data.data[p]+.587*data.data[p+1]+.114*data.data[p+2];min=Math.min(min,gray[i]);max=Math.max(max,gray[i]);}
 if(max-min<1)throw Error('Empty equation region.');
 for(let i=0;i<gray.length;i++){gray[i]=(gray[i]-min)/(max-min)*255;sum+=gray[i];}
 const invert=sum/gray.length<128;let left=w,right=0,top=h,bottom=0;
 for(let i=0;i<gray.length;i++){const value=Math.floor(invert?255-gray[i]:gray[i]);const p=i*4;data.data[p]=data.data[p+1]=data.data[p+2]=value;data.data[p+3]=255;if(value<128){const x=i%w,y=Math.floor(i/w);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}}
 const normalized=canvas(w,h);normalized.getContext('2d').putImageData(data,0,0);
 const width=right-left+1,height=bottom-top+1,out=canvas(Math.ceil(width/32)*32,Math.ceil(height/32)*32);out.getContext('2d').drawImage(normalized,left,top,width,height,0,0,width,height);return out;
}
function minmax(input){const ratio=Math.max(input.width/672,input.height/192);let out=ratio>1?resize(input,Math.floor(input.width/ratio),Math.floor(input.height/ratio)):input;if(out.width<32||out.height<32){const padded=canvas(Math.max(32,out.width),Math.max(32,out.height));padded.getContext('2d').drawImage(out,0,0);out=padded;}return out;}
function tensor(input){const data=input.getContext('2d').getImageData(0,0,input.width,input.height).data;const values=new Float32Array(input.width*input.height);for(let i=0;i<values.length;i++)values[i]=(data[4*i]/255-.7931)/.1738;return new ort.Tensor('float32',values,[1,1,input.height,input.width]);}
function argmax(data,start=0){let index=start;for(let i=start+1;i<data.length;i++)if(data[i]>data[index])index=i;return index-start;}
async function recognize(image){
 const model=await load();const input=canvas(image.width,image.height);input.getContext('2d').putImageData(image,0,0);
 const initial=minmax(pad(input));let ratio=1,w=initial.width,h=initial.height,final;
 for(let i=0;i<10;i++){h=Math.max(1,Math.floor(h*ratio));final=pad(minmax(resize(initial,w,h,ratio>1?'bilinear':'lanczos')));const value=tensor(final),result=await model.image_resizer.run({input:value});const width=(argmax(result.output.data)+1)*32;value.dispose();result.output.dispose();if(width===final.width)break;ratio=width/final.width;w=width;}
 const value=tensor(final);const encoded=await model.encoder.run({input:value});value.dispose();const context=encoded.output,ids=[1];let ended=false;
 try{
  for(let i=0;i<512;i++){
   const x=new ort.Tensor('int64',BigInt64Array.from(ids,BigInt),[1,ids.length]),mask=new ort.Tensor('bool',new Uint8Array(ids.length).fill(1),[1,ids.length]);
   const result=await model.decoder.run({x,mask,context});const logits=result.output.data,next=argmax(logits,logits.length-8000);x.dispose();mask.dispose();result.output.dispose();
   if(next===2){ended=true;break;}ids.push(next);
  }
 }finally{context.dispose();}
 if(!ended)throw Error('Equation recognition exceeded its length limit.');
 const tex=ids.slice(1).map(id=>model.vocab[id]||'').join('').replaceAll('Ġ',' ').replace(/\[(?:EOS|BOS|PAD)\]/g,'').trim();if(!tex)throw Error('No TeX recognized.');return tex;
}
self.onmessage=async event=>{try{postMessage({tex:await recognize(event.data.image)});}catch(error){postMessage({error:error.message||'Local equation recognition failed.'});}};
