"""Headless UI smoke test (gate G4): visit every screen, collect console errors, save screenshots.

Requires the server running with the built front-end (``uvicorn server.main:app --port 8000``) and Playwright
(uses the system Microsoft Edge via channel="msedge"; no browser download).
Usage: python scripts/smoke_ui.py [--url http://127.0.0.1:8000] [--mission]
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
SHOTS = ROOT / "docs" / "figures" / "screens"
SCREENS = [("1", "mission"), ("2", "qrng"), ("3", "teleport"), ("4", "dj"), ("5", "game"), ("6", "hardware"), ("7", "report")]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://127.0.0.1:8000")
    ap.add_argument("--mission", action="store_true", help="also run a full mission and screenshot the end state")
    ap.add_argument("--width", type=int, default=1900)
    ap.add_argument("--height", type=int, default=860)
    a = ap.parse_args()
    SHOTS.mkdir(parents=True, exist_ok=True)
    errors: list[str] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge", headless=True, args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        page = browser.new_page(viewport={"width": a.width, "height": a.height})
        page.on("console", lambda m: errors.append(f"[{m.type}] {m.text}") if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(f"[pageerror] {e}"))
        page.goto(a.url)
        page.wait_for_timeout(1500)
        page.keyboard.press("Space")  # skip boot
        page.wait_for_timeout(2500)
        page.screenshot(path=str(SHOTS / "title.png"))
        page.get_by_text("NEW MISSION").click()  # first visit opens the guide
        page.wait_for_timeout(1200)
        page.screenshot(path=str(SHOTS / "guide.png"))
        page.get_by_text("Skip").click()
        page.wait_for_timeout(800)
        page.keyboard.press("h")
        page.wait_for_timeout(700)
        page.screenshot(path=str(SHOTS / "help.png"))
        page.keyboard.press("Escape")
        page.wait_for_timeout(500)
        for key, name in SCREENS:
            page.keyboard.press(key)
            page.wait_for_timeout(4500 if name in ("qrng", "dj", "teleport") else 2500)
            page.screenshot(path=str(SHOTS / f"{name}.png"))
            print(f"  screenshot {name}")
        if a.mission:
            page.keyboard.press("1")
            page.wait_for_timeout(800)
            page.get_by_role("button", name="4×").click()
            page.get_by_role("button", name="LAUNCH MISSION").click()
            page.wait_for_timeout(5000)
            page.screenshot(path=str(SHOTS / "mission_midrun.png"))
            page.wait_for_function("() => document.body.innerText.includes('RELAUNCH')", timeout=90_000)
            page.wait_for_timeout(1500)
            page.screenshot(path=str(SHOTS / "mission_done.png"))
            print("  mission completed")
        browser.close()
    real = [e for e in errors if "favicon" not in e]
    print(f"console errors: {len(real)}")
    for e in real[:30]:
        print("  ", e[:300])
    return 1 if real else 0


if __name__ == "__main__":
    sys.exit(main())
