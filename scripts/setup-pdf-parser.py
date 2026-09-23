"""Download the pinned public CPU models. This never reads or uploads documents."""
import hashlib
import json
import os
from pathlib import Path
os.environ.setdefault('HF_HUB_DISABLE_XET', '1')
from huggingface_hub import snapshot_download

root = Path(__file__).resolve().parent.parent
manifest = json.loads((root / 'pdf-parser-models.json').read_text())
destination = root / '.pdf-runtime/models/MinerU-4_models_onnx'
snapshot_download(repo_id=manifest['repository'], revision=manifest['revision'],
                  allow_patterns=list(manifest['files']), local_dir=destination)
for name, expected in manifest['files'].items():
    digest = hashlib.sha256()
    with (destination / name).open('rb') as handle:
        for chunk in iter(lambda: handle.read(8 * 1024 * 1024), b''):
            digest.update(chunk)
    if digest.hexdigest() != expected:
        raise RuntimeError(f'Model checksum mismatch: {name}')
print('CPU parser models downloaded and verified.')
