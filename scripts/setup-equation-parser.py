"""Download the pinned formula model for offline, local CPU inference."""
import os
from pathlib import Path
root=Path(__file__).resolve().parent.parent
os.environ['HF_HOME']=str(root/'.pdf-runtime/formula-models')
os.environ.setdefault('HF_HUB_DISABLE_XET','1')
from huggingface_hub import snapshot_download
snapshot_download('docling-project/CodeFormulaV2',revision='ecedbe111d15c2dc60bfd4a823cbe80127b58af4',allow_patterns=['*.json','*.safetensors','*.jinja','*.txt','LICENSE*','README.md'])
print('Pinned equation recognition model ready for offline use.')
