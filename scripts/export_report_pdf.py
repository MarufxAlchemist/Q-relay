"""Render docs/REPORT.md to docs/REPORT.pdf (Markdown -> HTML + MathJax -> PDF via headless Edge/Playwright).

MathJax is loaded from a CDN at build time only; the resulting PDF is self-contained.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

import markdown
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"

CSS = """
body { font-family: 'Segoe UI', system-ui, sans-serif; font-size: 10pt; line-height: 1.36; color: #111; max-width: 780px; margin: auto; }
h1 { font-size: 19pt; border-bottom: 3px solid #e0287f; padding-bottom: 4px; }
h2 { font-size: 13.5pt; color: #0b7f91; border-bottom: 1px solid #ccc; margin-top: 18px; }
table { border-collapse: collapse; margin: 6px 0; font-size: 9.5pt; }
th, td { border: 1px solid #ccc; padding: 3px 6px; } th { background: #f0f4f8; }
img { max-width: 100%; max-height: 215px; display: block; margin: 6px auto; }
blockquote { border-left: 3px solid #e09a00; margin: 8px 0; padding: 2px 10px; background: #fff8e6; }
code { background: #f3f3f3; padding: 0 3px; border-radius: 3px; font-size: 9pt; }
"""


SPEAKER_CSS = """
blockquote.say { border-left-width: 5px; background: #f6f8fb; padding: 4px 12px; margin: 6px 0; }
blockquote.say p { margin: 4px 0; }
blockquote.maruf { border-color: #e0287f; } blockquote.maruf > p:first-child > strong:first-child { color: #e0287f; }
blockquote.parag { border-color: #0b7f91; } blockquote.parag > p:first-child > strong:first-child { color: #0b7f91; }
blockquote.vaibhav { border-color: #7c4ddb; } blockquote.vaibhav > p:first-child > strong:first-child { color: #7c4ddb; }
p.act { color: #8a5a00; font-size: 9.5pt; margin: 4px 0 4px 6px; }
h3 { font-size: 11.5pt; margin: 12px 0 4px; }
.pagebreak { page-break-before: always; }
"""


def tag_speakers(body: str) -> str:
    """`> **Maruf:** ...` blockquotes get a per-speaker class; `<p><em>[ ... ]</em></p>` lines become stage directions."""
    for name in ("Maruf", "Parag", "Vaibhav"):
        body = re.sub(rf"<blockquote>\s*<p><strong>{name}", f'<blockquote class="say {name.lower()}">\n<p><strong>{name}', body)
    return re.sub(r"<p><em>(\[.*?\])</em></p>", r'<p class="act">\1</p>', body, flags=re.S)


def main(src: str = "REPORT.md", out: str = "REPORT.pdf") -> None:
    md_text = (DOCS / src).read_text(encoding="utf-8")
    body = markdown.markdown(md_text, extensions=["tables", "pymdownx.arithmatex"],
                             extension_configs={"pymdownx.arithmatex": {"generic": True}})
    body = tag_speakers(body)
    html = f"""<!doctype html><html><head><meta charset="utf-8"><style>{CSS}{SPEAKER_CSS}</style>
<script>window.MathJax = {{ tex: {{ inlineMath: [['\\\\(', '\\\\)']], displayMath: [['\\\\[', '\\\\]']] }},
  startup: {{ pageReady: () => MathJax.startup.defaultPageReady().then(() => {{ document.body.dataset.ready = '1'; }}) }} }};</script>
<script src="https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-svg.js"></script></head><body>{body}</body></html>"""
    tmp = DOCS / "_report.html"
    tmp.write_text(html, encoding="utf-8")
    with sync_playwright() as p:
        b = p.chromium.launch(channel="msedge", headless=True)
        page = b.new_page()
        page.goto(tmp.as_uri())
        page.wait_for_selector("body[data-ready='1']", timeout=60_000)
        page.pdf(path=str(DOCS / out), format="A4", print_background=True,
                 margin={"top": "14mm", "bottom": "14mm", "left": "12mm", "right": "12mm"})
        b.close()
    tmp.unlink()
    print("wrote", DOCS / out)


if __name__ == "__main__":
    # usage: export_report_pdf.py [SOURCE.md OUTPUT.pdf]  (paths relative to docs/)
    main(*sys.argv[1:3])
