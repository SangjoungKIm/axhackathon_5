"""Embed the inspection extension without recompiling or restyling the supplied app."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent


def build():
    path = ROOT/'index.html'
    html = path.read_text()
    html = re.sub(r'<style id="inspection-031-style">.*?</style>', '', html, flags=re.S)
    html = re.sub(r'<script id="inspection-031-script">.*?</script>', '', html, flags=re.S)
    html = re.sub(r'<script id="single-site-config">.*?</script>', '', html, flags=re.S)
    css = (ROOT/'frontend/inspection_flow.css').read_text()
    script = (ROOT/'frontend/inspection_flow.js').read_text()
    config = (ROOT/'frontend/site_config.js').read_text()
    sim = (ROOT/'frontend/sim.js').read_text()
    html, count = re.subn(r'<script>/\* AX 발전소 — 시뮬레이션 데이터 엔진.*?</script>',
                          lambda _: '<script>'+sim+'</script>', html, count=1, flags=re.S)
    if count != 1:
        raise ValueError('Expected one simulation data source')
    if '</script' in script.lower():
        raise ValueError('Unexpected script closing tag')
    marker = '<script>const START_MIN='
    if html.count(marker) != 1:
        raise ValueError('Expected one supplied App entry point')
    # Keep the specifically requested inspection on the first assignment page.
    old = "const list=Object.values(ops.inspections).filter(i=>sites.includes(i.site)).sort((a,b)=>b.id.localeCompare(a.id));"
    new = "const list=Object.values(ops.inspections).filter(i=>sites.includes(i.site)).sort((a,b)=>a.id===b.id?0:a.id==='INS-2026-031'?-1:b.id==='INS-2026-031'?1:b.id.localeCompare(a.id));"
    if old not in html and new not in html:
        raise ValueError('Expected supplied inspection list')
    html = html.replace(old, new, 1)
    html = html.replace("setCtxSite('');", "setCtxSite('YA');")
    html = html.replace('</head>', '<style id="inspection-031-style">'+css+'</style></head>')
    html = html.replace(marker, '<script id="single-site-config">'+config+'</script><script id="inspection-031-script">'+script+'</script>'+marker)
    path.write_text(html)


if __name__ == '__main__':
    build()
