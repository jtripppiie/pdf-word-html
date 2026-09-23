"""Local, automatic math recognition evaluation. No reviewed-equation lookup."""
import json,time,os,sys
from pathlib import Path
os.environ.setdefault('HF_HOME','/tmp/pdf-formula-v2-models')
import torch
from PIL import Image
from transformers import AutoProcessor,AutoModelForImageTextToText
MODEL='docling-project/CodeFormulaV2'
REVISION='ecedbe111d15c2dc60bfd4a823cbe80127b58af4'
torch.set_num_threads(4)
print('Loading official CodeFormulaV2 model',flush=True)
processor=AutoProcessor.from_pretrained(MODEL,revision=REVISION)
model=AutoModelForImageTextToText.from_pretrained(MODEL,revision=REVISION,torch_dtype=torch.float32,attn_implementation='sdpa').eval()
results=[]
cases=sys.argv[1:] or ['27:1','27:2','26:11','26:12','26:13','26:7','21:4','21:17','21:1+2','32:21']
for case in cases:
 page,numbers=case.split(':');page=int(page);numbers=[int(n) for n in numbers.split('+')];number=numbers[0]
 entries=json.load(open(f'output/formula-eval-inputs/page{page}-review.json'));b=dict(entries[number-1]['bounds'])
 for other in numbers[1:]:
  for key in b:b[key]=(min if key in ['left','top'] else max)(b[key],entries[other-1]['bounds'][key])
 img=Image.open(f'output/formula-eval-inputs/page{page}.png').convert('RGB').crop(tuple(round(b[k]*2) for k in ['left','top','right','bottom']))
 # Source render is 144 DPI; the model card specifies 120 DPI.
 img=img.resize((round(img.width*120/144),round(img.height*120/144)))
 messages=[{'role':'user','content':[{'type':'image'},{'type':'text','text':'<formula>'}]}]
 prompt=processor.apply_chat_template(messages,add_generation_prompt=True)
 inputs=processor(text=prompt,images=[img],return_tensors='pt');start=time.monotonic()
 with torch.inference_mode():out=model.generate(**inputs,max_new_tokens=768,do_sample=False,use_cache=True)
 tex=processor.batch_decode(out[:,inputs['input_ids'].shape[1]:],skip_special_tokens=False)[0]
 result={'page':page,'item':numbers,'seconds':round(time.monotonic()-start,2),'raw_output':tex};results.append(result);print(json.dumps(result),flush=True)
 Path('output/formula-v2-extra-evaluation.json' if sys.argv[1:] else 'output/formula-v2-evaluation.json').write_text(json.dumps({'model':MODEL,'revision':REVISION,'results':results},indent=2))
