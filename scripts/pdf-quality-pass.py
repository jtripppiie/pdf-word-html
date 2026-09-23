"""Render automatically located complex formulas for a stronger local recognizer."""
import json,os,re,subprocess,tempfile
from pathlib import Path
import pypdfium2

def clean_crop(image):
    # A tight inline crop can catch a clipped descender from the previous line.
    # Remove only tiny ink components cut by a horizontal image edge. Complete
    # accents and limits, surrounded by the crop's padding, are preserved.
    import cv2,numpy as np
    from PIL import Image
    pixels=np.array(image.convert('RGB'))
    mask=(cv2.cvtColor(pixels,cv2.COLOR_RGB2GRAY)<200).astype('uint8')
    _,components,stats,_=cv2.connectedComponentsWithStats(mask,8)
    height=mask.shape[0];ink=int(mask.sum())
    for index,(_,y,_,h,area) in enumerate(stats[1:],1):
        if (y==0 or y+h==height) and h<height*.25 and area<ink*.1:
            pixels[components==index]=255
    return Image.fromarray(pixels)

def refine(source,payload,python,formula_regions):
    with tempfile.TemporaryDirectory(prefix='pdf-equations-') as directory:
        root=Path(directory);jobs=[];targets={}
        pdf=pypdfium2.PdfDocument(source)
        compact=lambda text:re.sub(r'\s','',text)
        try:
            for page in payload['pages']:
                images={};used=set();regions=formula_regions.get(page['page_idx'],[])
                def crop(box,display,dpi,path):
                    if dpi not in images:
                        native=pdf[page['page_idx']]
                        try:images[dpi]=native.render(scale=dpi/72).to_pil().convert('RGB')
                        finally:native.close()
                    image=images[dpi];pad=(3 if display else 1)*dpi//120
                    bounds=(max(0,int(box[0]*image.width)-pad),max(0,int(box[1]*image.height)-pad),min(image.width,int(box[2]*image.width)+pad),min(image.height,int(box[3]*image.height)+pad))
                    clean_crop(image.crop(bounds)).save(path)
                def add(target,box,index,display):
                    key=str(len(jobs));path=root/f'{key}.png';retry=root/f'{key}-retry.png'
                    crop(box,display,120 if display else 240,path);crop(box,display,240 if display else 360,retry);targets[key]=target
                    jobs.append({'key':key,'page':page['page_idx'],'index':index,'image':str(path),'retry_image':str(retry),'first_pass':target['content'],'bbox':box,'display':display})
                def inline(items,block):
                    for span in items:
                        if isinstance(span.get('content'),list):inline(span['content'],block)
                        if span.get('type')!='equation_inline':continue
                        tex=compact(span['content'])
                        needs_check=(block['type']=='page_footnote' and len(tex)>=7) or bool(re.search(r'\\(?:frac|cfrac|dfrac|stackrel|overset|underset)',tex))
                        if not needs_check:continue
                        for i,region in enumerate(regions):
                            if i in used or region['display'] or compact(region['tex'])!=tex:continue
                            box=region['bbox'];cx=(box[0]+box[2])/2;cy=(box[1]+box[3])/2;b=block['bbox']
                            if b[0]-.003<=cx<=b[2]+.003 and b[1]-.003<=cy<=b[3]+.003:
                                used.add(i);add(span,box,block['index'],False);break
                for block in page['blocks']:
                    if block['type']!='equation':
                        if isinstance(block.get('content'),list):inline(block['content'],block)
                        continue
                    tex=compact(block['content'])
                    if len(tex)<=120 and not re.search(r'\\(?:bar|overline|begin|underbrace)',tex):continue
                    box=block['bbox']
                    # Original formula bounds exclude the separate equation number.
                    candidates=[r['bbox'] for r in regions if r['display'] and box[0]-.005<=(r['bbox'][0]+r['bbox'][2])/2<=box[2]+.005 and box[1]-.005<=(r['bbox'][1]+r['bbox'][3])/2<=box[3]+.005]
                    if len(candidates)==1:box=candidates[0]
                    add(block,box,block['index'],True)
                for image in images.values():image.close()
        finally:pdf.close()
        if not jobs:return
        request=root/'jobs.json';response=root/'results.json';request.write_text(json.dumps(jobs))
        env={**os.environ,'HF_HUB_OFFLINE':'1','HF_HOME':os.environ.get('PDF_FORMULA_MODEL_CACHE',str(Path(__file__).resolve().parent.parent/'.pdf-runtime/formula-models'))}
        subprocess.run([python,str(Path(__file__).with_name('refine-pdf-equations.py')),str(request),str(response)],env=env,check=True)
        results=json.loads(response.read_text())
        if len(results)!=len(jobs):raise RuntimeError('Complex equation recognition returned incomplete output.')
        for result in results:targets[result['key']]['content']=result['tex']
