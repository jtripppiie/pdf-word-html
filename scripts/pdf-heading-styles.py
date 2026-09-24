"""Correct italic-only heading guesses using the original PDF's font evidence."""
import ctypes
import unicodedata
from difflib import SequenceMatcher
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

def normalized_chars(text):
    chars=[];offsets=[]
    for i,char in enumerate(text):
        for normalized in unicodedata.normalize('NFKC',char).casefold():
            if normalized.isalnum():chars.append(normalized);offsets.append(i)
    return ''.join(chars),offsets


def recover_italics(blocks,runs):
    """Transfer only complete, confidently aligned native italic runs.

    Split text spans without rewriting text, links, existing styles or math.
    Ambiguous/unreadable source text is left unchanged.
    """
    for block in blocks:
        content=block.get('content')
        if not isinstance(content,list):continue
        if block.get('type') in ('table','chart','image','list','index'):
            recover_italics(content,runs);continue
        if block.get('type') in ('header','footer','page_number','equation'):continue
        native=[r for r in runs if inside(r,block.get('bbox'))]
        if not any(r['italic'] for r in native):continue
        leaves=[]
        def collect(spans):
            for span in spans:
                if span.get('type')=='hyperlink':collect(span.get('content',[]))
                elif span.get('type')=='text':leaves.append(span)
                else:leaves.append(None)  # Math/code are never styled by this pass.
        collect(content)
        target='';positions={}
        for span in leaves:
            if span is None:target+='\0';continue
            positions[id(span)]=len(target);target+=span.get('content','')
        target_key,offsets=normalized_chars(target)
        source_key='';italic_ranges=[]
        for run in native:
            key,_=normalized_chars(run['text']);start=len(source_key);source_key+=key
            if run['italic'] and len(key)>=2:italic_ranges.append((start,len(source_key)))
        if not source_key or not target_key:continue
        # Bound expensive matching on malformed/pathological blocks.
        if max(len(source_key),len(target_key))>20000:continue
        matcher=SequenceMatcher(None,source_key,target_key,autojunk=False)
        if matcher.ratio()<.9:continue
        mapping={}
        for match in matcher.get_matching_blocks():
            for i in range(match.size):mapping[match.a+i]=match.b+i
        selected=set()
        for start,end in italic_ranges:
            mapped=[mapping.get(i) for i in range(start,end)]
            if any(i is None for i in mapped):continue
            if mapped!=list(range(mapped[0],mapped[0]+len(mapped))):continue
            # Require unique matched context to avoid styling a repeated word
            # whose source location cannot be established.
            left=max(0,start-16);right=min(len(source_key),end+16)
            while left<start and mapping.get(left)!=mapped[0]-(start-left):left+=1
            while right>end and mapping.get(right-1)!=mapped[-1]+(right-end):right-=1
            context=source_key[left:right]
            if source_key.count(context)!=1 or target_key.count(context)!=1:continue
            first,last=offsets[mapped[0]],offsets[mapped[-1]]+1
            if '\0' not in target[first:last]:selected.update(range(first,last))
        def split(spans):
            output=[]
            for span in spans:
                if span.get('type')=='hyperlink':
                    span['content']=split(span.get('content',[]));output.append(span);continue
                if span.get('type')!='text' or 'italic' in span.get('styles',[]):output.append(span);continue
                text=span.get('content','');base=positions[id(span)]
                if not text:output.append(span);continue
                start=0;styled=base in selected
                for end in range(1,len(text)+1):
                    following=base+end in selected if end<len(text) else not styled
                    if following==styled:continue
                    part={**span,'content':text[start:end]}
                    if styled:part['styles']=[*span.get('styles',[]),'italic']
                    output.append(part);start=end;styled=following
            return output
        block['content']=split(content)


def correct_headings(source,payload):
    with pdfium.PdfDocument(source) as pdf:
        for entry in payload['pages']:
            page=pdf[entry['page_idx']]
            try:
                runs=source_runs(page)
                correct_page(entry['blocks'],runs)
                recover_italics(entry['blocks'],runs)
            finally:page.close()
