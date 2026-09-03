import re
import urllib.request

html = urllib.request.urlopen("https://ritual-circles.vercel.app", timeout=30).read().decode()
m = re.search(r"/assets/index-([A-Za-z0-9_-]+)\.js", html)
print("bundle:", m.group(0) if m else "none")
if not m:
    raise SystemExit(1)
js = urllib.request.urlopen("https://ritual-circles.vercel.app" + m.group(0), timeout=30).read().decode(
    "utf-8", "replace"
)
print("circleDetails.full in bundle:", "circleDetails.full" in js)
print("home.confirmed count:", js.count("home.confirmed"))
# minified may use circleDetails as object
print("Full not Confirmed fix hint:", "circleDetails.full" in js or "Full" in js)
