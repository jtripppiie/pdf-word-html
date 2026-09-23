"""Correct italic-only heading guesses using the original PDF's font evidence."""
import ctypes
import math
import re
from collections import Counter
import pypdfium2 as pdfium

NUMBERED = re.compile(r'^(?:\d+(?:\.\d+)*[.)]?|[A-Z][.)]|[IVX]+[.)])\s+\S')

def source_runs(page):
    x0,y0,x1,y1=page.get_bbox();width,height=x1-x0,y1-y0
    displayed_width,displayed_height=page.get_size();rotation=page.get_rotation()
    def point(x,y):
        x-=x0;y-=y0
        if rotation==90:return y,x
        if rotation==180:return width-x,y
        if rotation==270:return height-y,width-x
        return x,height-y
    runs=[];textpage=page.get_textpage()
    try:
        for obj in page.get_objects(filter=[pdfium.raw.FPDF_PAGEOBJ_TEXT],textpage=textpage):
            if obj.level:continue
            text=obj.extract().strip()
            if not text:continue
            font=pdfium.raw.FPDFTextObj_GetFont(obj);buffer=ctypes.create_string_buffer(512)
            pdfium.raw.FPDFFont_GetBaseFontName(font,buffer,len(buffer));name=buffer.value.decode(errors='replace')
            flags=pdfium.raw.FPDFFont_GetFlags(font)
            size=ctypes.c_float();pdfium.raw.FPDFTextObj_GetFontSize(obj,ctypes.byref(size));matrix=obj.get_matrix()
            size=abs(size.value)*math.hypot(matrix.c,matrix.d)
            left,bottom,right,top=obj.get_bounds();a,b=point(left,bottom),point(right,top)
            runs.append({'text':text,'x':(a[0]+b[0])/2/displayed_width,'y':(a[1]+b[1])/2/displayed_height,
                         'size':size,'italic':bool(flags&64) or bool(re.search('italic|oblique',name,re.I)),
                         'bold':bool(flags&262144) or bool(re.search('bold|black|heavy|demi',name,re.I))})
    finally:textpage.close()
    return runs

def inside(run,box):
    return box and box[0]-.002<=run['x']<=box[2]+.002 and box[1]-.002<=run['y']<=box[3]+.002

def correct_page(blocks,runs):
    prose=[b.get('bbox') for b in blocks if b['type'] in ('text','ref_text')]
    sizes=Counter()
    for run in runs:
        if any(inside(run,b) for b in prose):sizes[round(run['size'],1)]+=len(run['text'])
    if not sizes:return
    body_size=sizes.most_common(1)[0][0]
    for block in blocks:
        if block['type']!='paragraph_title':continue
        matched=[r for r in runs if inside(r,block.get('bbox'))]
        if not matched:continue
        total=sum(len(r['text']) for r in matched)
        italic=sum(len(r['text']) for r in matched if r['italic'])/total
        bold=sum(len(r['text']) for r in matched if r['bold'])/total
        size=sum(r['size']*len(r['text']) for r in matched)/total
        text=''.join(s.get('content','') for s in block.get('content',[]) if s.get('type')=='text').strip()
        # Italics are emphasis unless another heading signal is present.
        # Preserve bold, larger, or explicitly numbered section headings.
        if italic>=.85 and bold<.2 and size<=body_size*1.1 and not NUMBERED.match(text):
            block['type']='text';block.pop('level',None)
            for span in block.get('content',[]):
                if span.get('type')=='text' and 'italic' not in span.get('styles',[]):span['styles']=[*span.get('styles',[]),'italic']

def correct_headings(source,payload):
    with pdfium.PdfDocument(source) as pdf:
        for entry in payload['pages']:
            if not any(b['type']=='paragraph_title' for b in entry['blocks']):continue
            page=pdf[entry['page_idx']]
            try:correct_page(entry['blocks'],source_runs(page))
            finally:page.close()
