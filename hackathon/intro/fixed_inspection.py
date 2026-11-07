"""The explicitly pinned testload_1 map is never rebuilt by video uploads."""
import hashlib
import json
from pathlib import Path

FIXTURE = Path(__file__).resolve().parent/'fixtures'/'testload_1'


def fixed_map():
    manifest = json.loads((FIXTURE/'manifest.json').read_text())
    content = (FIXTURE/'layout.json').read_bytes()
    if hashlib.sha256(content).hexdigest() != manifest['sha256']:
        raise ValueError('고정 지도의 무결성 검사에 실패했습니다.')
    return {**manifest, 'layout': json.loads(content)}
