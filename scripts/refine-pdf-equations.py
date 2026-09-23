"""Second recognition pass for complex displays; no document-specific lookup."""
import json,os,re,sys,time
from pathlib import Path
os.environ.setdefault('HF_HOME',str(Path(__file__).resolve().parent.parent/'.pdf-runtime/formula-models'))

MODEL='docling-project/CodeFormulaV2'
REVISION='ecedbe111d15c2dc60bfd4a823cbe80127b58af4'

def group(text,start):
    while start<len(text) and text[start].isspace():start+=1
    if start>=len(text) or text[start]!='{':return None
    depth=1;i=start+1
    while i<len(text):
        if text[i]=='\\':i+=2;continue
        if text[i]=='{':depth+=1
        if text[i]=='}':
            depth-=1
            if depth==0:return start,i+1,text[start+1:i]
        i+=1
    return None

def labels(tex):
    found=[]
    for match in re.finditer(r'\\underbrace\s*',tex):
        body=group(tex,match.end())
        if not body:continue
        i=body[1]
        while i<len(tex) and tex[i].isspace():i+=1
        if i<len(tex) and tex[i]=='_':
            label=group(tex,i+1)
            if label:found.append(label)
    return found

def preserve_labels(tex,first_pass):
    # Long explanatory labels are text, not algebra. Keep the first pass's
    # complete label when the second recognizer drops a line from an underbrace.
    source,target=labels(first_pass),labels(tex)
    if len(source)!=len(target):return tex
    for old,new in reversed(list(zip(source,target))):
        label=old[2]
        if len(re.findall(r'(?<![A-Za-z])[a-z](?![A-Za-z])',label))<15:continue
        source_words=re.split(r'\\(?:,|:|;|atop|quad|qquad)',label)
        if len(source_words)<3:continue
        tex=tex[:new[0]]+'{'+label+'}'+tex[new[1]:]
    return tex

def normalize_tex(tex):
    # Collapse an empty nested script base emitted by the decoder, preserving
    # its actual script. This does not alter powers with a nonempty base.
    tex=re.sub(r'\^\s*\{\s*\^\s*(\{[^{}]*\})\s*\}',r'^\1',tex)
    if '\\begin' not in tex and ('&' in tex or '\\\\' in tex):
        tags=re.findall(r'\\tag\s*\{[^}]*\}',tex)
        tex=re.sub(r'\\tag\s*\{[^}]*\}','',tex)
        tex='\\begin{aligned}'+tex+'\\end{aligned}'+''.join(tags)
    return tex

def balanced_groups(tex):
    depth=0;i=0
    while i<len(tex):
        if tex[i]=='\\':i+=2;continue
        if tex[i]=='{':depth+=1
        elif tex[i]=='}':
            depth-=1
            if depth<0:return False
        i+=1
    return depth==0

def main():
    import torch
    from PIL import Image
    from transformers import AutoProcessor,AutoModelForImageTextToText
    request=Path(sys.argv[1]);jobs=json.loads(request.read_text())
    torch.set_num_threads(int(os.getenv('PDF_FORMULA_THREADS','4')))
    processor=AutoProcessor.from_pretrained(MODEL,revision=REVISION,local_files_only=True)
    model=AutoModelForImageTextToText.from_pretrained(MODEL,revision=REVISION,torch_dtype=torch.float32,attn_implementation='sdpa',local_files_only=True).eval()
    prompt=processor.apply_chat_template([{'role':'user','content':[{'type':'image'},{'type':'text','text':'<formula>'}]}],add_generation_prompt=True)
    results=[]
    for index,job in enumerate(jobs):
        started=time.monotonic();tex=None
        for attempt,path in enumerate([job['image'],job.get('retry_image')]):
            if not path:continue
            if attempt:print(json.dumps({'status':f'Retrying equation {index+1} at higher resolution…'}),flush=True)
            with Image.open(path) as source:image=source.convert('RGB')
            inputs=processor(text=prompt,images=[image],return_tensors='pt')
            with torch.inference_mode():output=model.generate(**inputs,max_new_tokens=1536,do_sample=False,use_cache=True)
            raw=processor.batch_decode(output[:,inputs['input_ids'].shape[1]:],skip_special_tokens=False)[0]
            candidate=re.sub(r'<loc_\d+>','',raw.split('</formula>')[0]).strip()
            if '</formula>' in raw and candidate and balanced_groups(candidate):tex=candidate;break
        if tex is None:raise ValueError('Equation recognition returned malformed TeX after automatic retry.')
        tex=normalize_tex(preserve_labels(tex,job['first_pass']))
        tags=re.findall(r'\\tag\s*\{([^}]+)\}',job['first_pass'])
        if tags and not re.search(r'\\tag\s*\{',tex):tex+='\\tag{'+tags[-1]+'}'
        results.append({'page':job['page'],'index':job['index'],'key':job.get('key'),'tex':tex,'seconds':round(time.monotonic()-started,2)})
        print(json.dumps({'status':f'Checking complex or small-print equation {index+1} of {len(jobs)}…'}),flush=True)
        Path(sys.argv[2]).write_text(json.dumps(results))

if __name__=='__main__':main()
