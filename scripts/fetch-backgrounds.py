"""Download landscape candidates from Lorem Picsum (Unsplash licence) at 1920x1080.
Usage: python scripts/fetch-backgrounds.py OUT_DIR ID [ID ...]"""
import json
import sys
import urllib.request
from pathlib import Path

out = Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=True)
credits = []
for pid in sys.argv[2:]:
    with urllib.request.urlopen(f"https://picsum.photos/id/{pid}/info", timeout=20) as r:
        info = json.load(r)
    urllib.request.urlretrieve(f"https://picsum.photos/id/{pid}/1920/1080.jpg", out / f"{pid}.jpg")
    credits.append(f"{pid}: {info['author']} - {info['url']}")
    print(pid, info["author"])
(out / "credits-candidates.txt").write_text("\n".join(credits) + "\n", encoding="utf-8")
