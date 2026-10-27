"""Render docs/REPORT.md to docs/REPORT.pdf (Markdown -> HTML + MathJax -> PDF via headless Edge/Playwright).

MathJax is loaded from a CDN at build time only; the resulting PDF is self-contained.
"""

from __future__ import annotations

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


def main() -> None:
    md_text = (DOCS / "REPORT.md").read_text(encoding="utf-8")
    body = markdown.markdown(md_text, extensions=["tables", "pymdownx.arithmatex"],
                             extension_configs={"pymdownx.arithmatex": {"generic": True}})
    html = f"""<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style>
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
        page.pdf(path=str(DOCS / "REPORT.pdf"), format="A4", print_background=True,
                 margin={"top": "14mm", "bottom": "14mm", "left": "12mm", "right": "12mm"})
        b.close()
    tmp.unlink()
    print("wrote", DOCS / "REPORT.pdf")


if __name__ == "__main__":
    main()
