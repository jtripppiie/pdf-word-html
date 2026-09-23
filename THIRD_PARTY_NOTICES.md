# Equation recognition

The browser inference code in `public/ocr-worker.mjs` is adapted from RapidLaTeXOCR 0.0.9. The bundled model weights are from its v0.0.0 release and derive from LaTeX-OCR. URLs and SHA-256 checksums are pinned in `ocr-models.json`.

- https://github.com/RapidAI/RapidLaTeXOCR
- https://github.com/lukas-blecher/LaTeX-OCR
- ONNX Runtime Web: https://github.com/microsoft/onnxruntime (MIT; license included in npm package)

## RapidLaTeXOCR

MIT License

Copyright (c) 2023 RapidAI

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


## LaTeX-OCR

MIT License

Copyright (c) 2021 Lukas Blecher

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Word document conversion

- Mammoth 1.12.3, BSD-2-Clause: https://github.com/mwilliamson/mammoth.js. The full license is distributed at `/vendor/mammoth-LICENSE.txt`.
- JSZip 3.10.2, dual MIT/GPLv3; used under the MIT license: https://github.com/Stuk/jszip. The full license is distributed at `/vendor/jszip-LICENSE.txt`.

## Automatic local PDF parser

- MinerU 4.0.5: https://github.com/opendatalab/MinerU — MinerU Open Source License, based on Apache 2.0 with additional commercial thresholds and online-service attribution conditions. The distributed license is copied in `licenses/MinerU-LICENSE.md`; automatic-parser mode displays MinerU attribution.
- CPU layout/OCR/formula/table assets: https://huggingface.co/opendatalab/MinerU-4_models_onnx — exact revision and checksums are recorded in `pdf-parser-models.json`; upstream provenance is retained in `licenses/MinerU-model-provenance.json`. Original PaddlePaddle/PaddleOCR and model-specific licenses remain applicable.
- Docling CodeFormulaV2: https://huggingface.co/docling-project/CodeFormulaV2 — CDLA-Permissive-2.0; revision `ecedbe111d15c2dc60bfd4a823cbe80127b58af4`.
- Python inference dependencies are installed separately in `.pdf-runtime`. Their packages retain their upstream license files. None of these Python models are bundled into the static browser-only Cloud Run image.
