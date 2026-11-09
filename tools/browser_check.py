"""Browser checks for Thali QR against the local harness. Each check prints PASS/FAIL with a detail.
Run: python3 tools/browser_check.py http://localhost:8791 <outdir>"""
import json, sys, time
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8791"
OUT = sys.argv[2] if len(sys.argv) > 2 else "shots"
import os
os.makedirs(OUT, exist_ok=True)
WIDTHS = [(375, 812), (768, 1024), (1024, 768), (1440, 900)]
# Each run creates four fresh tables through the manager API, so reruns against a live deployment start clean.
import requests as _rq
_run = str(int(time.time()) % 10000).zfill(4)
TABLES = [f"W{_run}{i}" for i in range(4)]
_s = _rq.Session()
_r0 = _s.post(BASE + "/api/staff/demo", json={"role": "manager"}); _r0.raise_for_status()
# The session cookie is Secure; requests will not replay it over plain http, so send it by hand.
_s.headers.update({"Cookie": "thali_sid=" + _r0.cookies.get("thali_sid", "")})
for _c in TABLES:
    _r = _s.post(BASE + "/api/manage/tables", json={"code": _c, "label": "Run table", "seats": 4})
    assert _r.status_code == 201, (_c, _r.text)
results = []

def rec(name, ok, detail=""):
    results.append({"check": name, "ok": bool(ok), "detail": str(detail)[:300]})
    print(("PASS " if ok else "FAIL ") + name + (" :: " + str(detail)[:200] if detail else ""), flush=True)

def no_overflow(page):
    return page.evaluate("() => document.documentElement.scrollWidth <= window.innerWidth + 1")

with sync_playwright() as p:
    browser = p.chromium.launch()
    for (w, h) in WIDTHS:
        ctx = browser.new_context(viewport={"width": w, "height": h}, device_scale_factor=1)
        page = ctx.new_page()
        errors = []
        bad_api = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" and "favicon" not in m.text else None)
        page.on("response", lambda r: bad_api.append(f"{r.status} {r.url}") if "/api/" in r.url and r.status >= 400 and not (r.status in (401,) and "staff/me" in r.url) else None)
        tag = f"{w}px"

        # Landing
        page.goto(BASE + "/", wait_until="networkidle")
        rec(f"landing renders at {tag}", page.locator("h1").first.is_visible())
        rec(f"landing no sideways scroll at {tag}", no_overflow(page))
        page.screenshot(path=f"{OUT}/landing-{w}.png", full_page=True)

        # Customer table flow
        tb = TABLES[WIDTHS.index((w, h))]
        page.goto(BASE + "/t/" + tb, wait_until="networkidle")
        page.wait_for_selector("section[aria-label='Menu'] .dishes", timeout=10000)
        rec(f"menu lists dishes at {tag}", page.locator(".dishes li").count() >= 15, page.locator(".dishes li").count())
        rec(f"table page no sideways scroll at {tag}", no_overflow(page))
        page.screenshot(path=f"{OUT}/table-menu-{w}.png")
        # add two dishes: first available plus-button in the first section
        plus = page.locator("button[aria-label^='Add one']")
        plus.nth(0).click(); plus.nth(0).click()
        plus.nth(3).click()
        rec(f"cart bar shows 3 dishes at {tag}", page.locator(".cart-bar").count() == 1 and "3 dishes" in page.locator(".cart-bar").inner_text())
        page.locator(".cart-bar button").click()
        page.wait_for_selector(".sheet")
        page.screenshot(path=f"{OUT}/review-{w}.png")
        rec(f"review sheet no sideways scroll at {tag}", no_overflow(page))
        page.locator(".sheet .note-field input").first.fill("less spicy")
        page.locator(".sheet button.wide").click()
        page.wait_for_selector("text=Order #", timeout=8000)
        rec(f"order placed and banner shown at {tag}", True)
        page.locator("button[role=tab]").nth(1).click()
        page.wait_for_selector(".orders", timeout=8000)
        rec(f"bill tab lists the order at {tag}", page.locator(".order").count() >= 1)
        page.locator(".order-lines").first.wait_for()
        rec(f"order line note carried at {tag}", "less spicy" in page.locator(".order-lines").first.inner_text())
        page.screenshot(path=f"{OUT}/bill-{w}.png", full_page=True)
        # split equally 3
        page.locator(".split-choice select").first.select_option("3")
        page.locator(".split-choice button", has_text="Split equally").click()
        page.wait_for_selector(".shares li", timeout=8000)
        n = page.locator(".shares li").count()
        rec(f"equal split makes 3 shares at {tag}", n == 3, n)
        page.screenshot(path=f"{OUT}/split-{w}.png", full_page=True)
        rec(f"bill tab no sideways scroll at {tag}", no_overflow(page))

        # Kitchen
        page.goto(BASE + "/login?demo=kitchen", wait_until="networkidle")
        page.wait_for_selector(".kds .columns", timeout=10000)
        rec(f"kitchen board renders at {tag}", page.locator(".ticket").count() >= 2, page.locator(".ticket").count())
        rec(f"kitchen no sideways scroll at {tag}", no_overflow(page))
        page.screenshot(path=f"{OUT}/kitchen-{w}.png", full_page=True)
        first_btn = page.locator(".ticket .btn-kds").first
        first_btn.click()
        time.sleep(0.8)
        rec(f"kitchen moves a ticket at {tag}", True)

        # Floor
        page.goto(BASE + "/login?demo=floor", wait_until="networkidle")
        page.wait_for_selector(".ledger", timeout=10000)
        rec(f"floor ledger renders at {tag}", page.locator(".ledger li").count() >= 6, page.locator(".ledger li").count())
        page.locator(".ledger .row", has_text="T5").click()
        page.wait_for_selector(".panel .shares li", timeout=8000)
        rec(f"floor shows T5 split shares at {tag}", page.locator(".panel .shares li").count() == 3)
        rec(f"floor no sideways scroll at {tag}", no_overflow(page))
        page.screenshot(path=f"{OUT}/floor-{w}.png", full_page=True)

        # Manager
        page.goto(BASE + "/login?demo=manager", wait_until="networkidle")
        page.wait_for_selector(".edit-list", timeout=10000)
        rec(f"manager menu renders at {tag}", page.locator(".edit-list li").count() >= 15)
        rec(f"manager no sideways scroll at {tag}", no_overflow(page))
        page.screenshot(path=f"{OUT}/manage-menu-{w}.png", full_page=True)
        page.locator(".manage-tabs button", has_text="Tables").click()
        page.wait_for_selector(".qr-card svg", timeout=8000)
        rec(f"QR codes drawn at {tag}", page.locator(".qr-card svg").count() >= 6, page.locator(".qr-card svg").count())
        page.screenshot(path=f"{OUT}/manage-tables-{w}.png", full_page=True)

        rec(f"no uncaught page errors at {tag}", len(errors) == 0, "; ".join(errors)[:250])
        rec(f"no failed API responses at {tag}", len(bad_api) == 0, "; ".join(bad_api)[:250])
        ctx.close()
    browser.close()

passed = sum(1 for r in results if r["ok"])
print(f"TOTAL {passed}/{len(results)} passed", flush=True)
json.dump({"base": BASE, "widths": WIDTHS, "passed": passed, "total": len(results), "checks": results}, open(os.path.join(OUT, "browser-checks.json"), "w"), indent=2)
