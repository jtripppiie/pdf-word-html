"""Local CPU PDF parser. No remote document APIs or document-specific corrections."""
import json
import os
import sys
from pathlib import Path

os.environ.setdefault('MINERU_PROCESSING_WINDOW_SIZE', '8')
os.environ.setdefault('MINERU_TABLE_DEVICE', 'cpu')
os.environ.setdefault('MINERU_INTRA_OP_NUM_THREADS', '4')

def progress(message):
    print(json.dumps({'status': message}), flush=True)

def main():
    import pypdfium2
    source, destination = map(Path, sys.argv[1:3])
    with pypdfium2.PdfDocument(source) as pdf:
        count = len(pdf)
        if count > 100 or count < 1:
            raise ValueError('PDFs must contain between 1 and 100 pages.')
    progress(f'Recognizing text, inline math, display equations, and tables across {count} pages…')
    from mineru.parser import parse
    import importlib.util
    spec=importlib.util.spec_from_file_location('pdf_math_regions',Path(__file__).with_name('pdf-math-regions.py'))
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    math_source,formula_regions=module.install_math_regions(source)
    try:
        result = parse(source, tier='basic', ocr_mode='auto', image_analysis=False, page_range='')
    finally:
        math_source.close()
    payload = json.loads(result.to_json())
    del result
    formula_python=os.environ.get('PDF_FORMULA_PYTHON')
    if formula_python:
        # Release the first model set before loading the second recognizer.
        from mineru.model.runtime.hybrid import AtomModelSingleton,HybridLocalModelContextSingleton
        AtomModelSingleton._models.clear();HybridLocalModelContextSingleton._models.clear()
        import gc
        gc.collect()
        from mineru.model.runtime.memory import trim_process_heap
        trim_process_heap()
        spec=importlib.util.spec_from_file_location('pdf_quality_pass',Path(__file__).with_name('pdf-quality-pass.py'))
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        module.refine(source,payload,formula_python,formula_regions)
    def remove_image_payloads(value):
        if isinstance(value, dict):
            for key in ('image_base64', 'image_path', 'image_url'):
                value.pop(key, None)
            for child in value.values():
                remove_image_payloads(child)
        elif isinstance(value, list):
            for child in value:
                remove_image_payloads(child)
    remove_image_payloads(payload)
    spec=importlib.util.spec_from_file_location('pdf_heading_styles',Path(__file__).with_name('pdf-heading-styles.py'))
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    module.correct_headings(source,payload)
    destination.write_text(json.dumps(payload), encoding='utf-8')
    progress('Preparing editable HTML…')

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'error': str(error)}), flush=True)
        sys.exit(1)
