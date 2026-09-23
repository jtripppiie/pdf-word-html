"""Supplement visual layout detection with embedded PDF math-font object bounds.

Text objects remain available even when their ToUnicode mapping is empty or corrupt.
These bounds are recognition inputs only; the export remains TeX.
"""
import ctypes
import re
import pypdfium2 as pdfium

MATH_FONT = re.compile(r'math|symbol|stix|cmmi|cmsy|cmex|mtextra|msam|msbm', re.I)

def intersection(a, b):
    return max(0, min(a[2],b[2])-max(a[0],b[0])) * max(0,min(a[3],b[3])-max(a[1],b[1]))

def union(a,b):
    return [min(a[0],b[0]),min(a[1],b[1]),max(a[2],b[2]),max(a[3],b[3])]

def math_bounds(page):
    x0,y0,x1,y1=page.get_bbox(); width,height=x1-x0,y1-y0
    rotation=page.get_rotation()
    def point(x,y):
        x-=x0;y-=y0
        if rotation==90:return y,x
        if rotation==180:return width-x,y
        if rotation==270:return height-y,width-x
        return x,height-y
    boxes=[];textpage=page.get_textpage()
    for obj in page.get_objects(filter=[pdfium.raw.FPDF_PAGEOBJ_TEXT],textpage=textpage):
        if obj.level:continue
        font=pdfium.raw.FPDFTextObj_GetFont(obj)
        buffer=ctypes.create_string_buffer(512)
        pdfium.raw.FPDFFont_GetBaseFontName(font,buffer,len(buffer))
        if not MATH_FONT.search(buffer.value.decode(errors='replace')):continue
        if re.fullmatch(r'[\s.,;:!?]+',obj.extract()):continue
        left,bottom,right,top=obj.get_bounds()
        if right-left<.05 or top-bottom<.05:continue
        points=[point(left,bottom),point(right,top)]
        box=[min(p[0] for p in points),min(p[1] for p in points),max(p[0] for p in points),max(p[1] for p in points)]
        if not any(sum(abs(a-b) for a,b in zip(box,old))<.1 for old in boxes):boxes.append(box)
    textpage.close()
    return boxes

def install_math_regions(source):
    from mineru.backend.analysis.pdf import window
    original=window._process_text_and_formulas
    build_inputs=window._build_formula_inputs
    def inputs(layouts):
        result=build_inputs(layouts)
        for layout,items in zip(layouts,result):
            extras={tuple(x['bbox']) for x in layout if x.get('portal_native')}
            for item in items:item['portal_native']=tuple(item['bbox']) in extras
        return result
    window._build_formula_inputs=inputs
    pdf=pdfium.PdfDocument(source)
    regions={};formula_regions={}
    def process(images,pages,models,parse_mode,effort,context,layouts,*args,**kwargs):
        added=0
        for image,page,layout,page_models in zip(images,pages,layouts,models):
            index=page._idx
            if index not in regions:
                native=pdf[index]
                try:
                    regions[index]=(math_bounds(native),native.get_size())
                finally:native.close()
            bounds,size=regions[index]
            sx=image['img_pil'].width/size[0];sy=image['img_pil'].height/size[1]
            # The layout detector sometimes calls an inline formula inside a
            # footnote another footnote. Restore containment before text mapping.
            footnotes=[item for item in layout if item.get('label')=='footnote']
            nested=[]
            for item in footnotes:
                box=item['bbox'];area=(box[2]-box[0])*(box[3]-box[1])
                if any(parent is not item and intersection(box,parent['bbox'])>area*.9 and (parent['bbox'][2]-parent['bbox'][0])*(parent['bbox'][3]-parent['bbox'][1])>area*2.5 for parent in footnotes):
                    item['label']='inline_formula';nested.append(box)
            if nested:
                normalized=[[b[0]/image['img_pil'].width,b[1]/image['img_pil'].height,b[2]/image['img_pil'].width,b[3]/image['img_pil'].height] for b in nested]
                page_models[:]=[m for m in page_models if not (str(m.get('type'))=='page_footnote' and any(max(abs(a-b) for a,b in zip(m.get('bbox',[]),n))<.003 for n in normalized))]
            existing=[item['bbox'] for item in layout if item.get('label') in ('inline_formula','display_formula')]
            candidates=[]
            for box in bounds:
                pixels=[box[0]*sx,box[1]*sy,box[2]*sx,box[3]*sy]
                area=(pixels[2]-pixels[0])*(pixels[3]-pixels[1])
                if any(intersection(pixels,old)>=area*.5 for old in existing):continue
                # Avoid interpreting chart annotations and logos as prose equations.
                center=((pixels[0]+pixels[2])/2,(pixels[1]+pixels[3])/2)
                if not any(item.get('label') in ('text','footnote','paragraph_title','doc_title') and item['bbox'][0]<=center[0]<=item['bbox'][2] and item['bbox'][1]<=center[1]<=item['bbox'][3] for item in layout):continue
                candidates.append(pixels)
            groups=[{'box':item['bbox'],'native':False} for item in layout if item.get('label')=='inline_formula']
            for box in sorted(candidates,key=lambda b:(b[1],b[0])):
                candidate={'box':box,'native':True};changed=True
                while changed:
                    changed=False
                    for other in list(groups):
                        a,b=candidate['box'],other['box']
                        gap=max(a[0]-b[2],b[0]-a[2],0)
                        vertical=min(a[3],b[3])-max(a[1],b[1])
                        overlap=min(a[2],b[2])-max(a[0],b[0])
                        if (gap<4.5*sx and vertical>0) or (overlap>0 and vertical>-2*sy):
                            candidate={'box':union(a,b),'native':candidate['native'] and other['native']};groups.remove(other);changed=True
                groups.append(candidate)
            layout[:]=[item for item in layout if item.get('label')!='inline_formula']
            for group in groups:
                box=group['box']
                # Include accents and white margin without capturing adjacent prose.
                margin=.5 if group['native'] else 0
                padded=[max(0,box[0]-sx*margin),max(0,box[1]-sy),min(image['img_pil'].width,box[2]+sx*margin),min(image['img_pil'].height,box[3]+sy)]
                layout.append({'label':'inline_formula','bbox':padded,'score':1.0,'index':len(layout),'portal_native':group['native']})
                added+=int(group['native'])
        if not any(item.get('label') in ('inline_formula','display_formula') for layout in layouts for item in layout):
            return original(images,pages,models,parse_mode,effort,context,layouts,*args,**kwargs)
        mfr=context.mfr_model
        if not getattr(mfr,'portal_normalized',False):
            recognize=mfr.batch_predict
            def batch(*a,**kw):
                result=recognize(*a,**kw)
                for items,(page_number,width,height) in zip(result,mfr.portal_context):
                    for item in items:
                        if item.get('portal_native'):item['latex']=re.sub(r'\s*[.,;:]\s*$','',item.get('latex','')).strip()
                        box=item['bbox']
                        formula_regions.setdefault(page_number,[]).append({'tex':item.get('latex',''),'display':item.get('label')=='display_formula','bbox':[box[0]/width,box[1]/height,box[2]/width,box[3]/height]})
                return result
            mfr.batch_predict=batch;mfr.portal_normalized=True
        mfr.portal_context=[(p._idx,i['img_pil'].width,i['img_pil'].height) for p,i in zip(pages,images)]
        if added:print(__import__('json').dumps({'status':f'Recovering {added} additional inline math regions from PDF font geometry…'}),flush=True)
        return original(images,pages,models,parse_mode,effort,context,layouts,*args,**kwargs)
    window._process_text_and_formulas=process
    return pdf,formula_regions
