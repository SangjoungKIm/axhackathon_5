"""Start the dashboard and inference API on the GPU portal's port 8501."""
from pathlib import Path
import os
import sys

ROOT = Path(__file__).resolve().parent
PYTHON = ROOT / '.venv/bin/python'
if Path(sys.prefix) != ROOT / '.venv':
    os.execv(str(PYTHON), [str(PYTHON), str(Path(__file__).resolve())])
sys.path.insert(0, str(ROOT))
import uvicorn

if __name__ == '__main__':
    uvicorn.run('app:app', host='0.0.0.0', port=8501)
