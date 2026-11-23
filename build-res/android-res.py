# Generates the Android launcher icons, notification icon and splash images from assets/icon.png.
# Run: python3 build-res/android-res.py  (needs Pillow). Output goes into android/app/src/main/res.
import os
from PIL import Image, ImageDraw
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, 'android/app/src/main/res')
src = Image.open(os.path.join(ROOT, 'assets/icon.png')).convert('RGBA')
BLUE = (36, 89, 214)
D = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}

def is_bg(p): return p[3] < 10 or (abs(p[0] - BLUE[0]) < 40 and abs(p[1] - BLUE[1]) < 40 and abs(p[2] - BLUE[2]) < 40)
fg = Image.new('RGBA', src.size, (0, 0, 0, 0))
px, fp = src.load(), fg.load()
for y in range(src.height):
    for x in range(src.width):
        if not is_bg(px[x, y]): fp[x, y] = px[x, y]

def save(img, folder, name):
    d = os.path.join(RES, folder); os.makedirs(d, exist_ok=True); img.save(os.path.join(d, name))

for k, s in D.items():
    n = round(48 * s)
    save(src.resize((n, n), Image.LANCZOS), 'mipmap-' + k, 'ic_launcher.png')
    r = Image.new('RGBA', (n * 4, n * 4), (0, 0, 0, 0)); dr = ImageDraw.Draw(r); dr.ellipse((0, 0, n * 4 - 1, n * 4 - 1), fill=BLUE + (255,))
    inner = fg.resize((n * 4, n * 4), Image.LANCZOS); r.alpha_composite(inner)
    save(r.resize((n, n), Image.LANCZOS), 'mipmap-' + k, 'ic_launcher_round.png')
    f = round(108 * s); sq = round(80 * s)
    can = Image.new('RGBA', (f, f), (0, 0, 0, 0)); can.alpha_composite(fg.resize((sq, sq), Image.LANCZOS), ((f - sq) // 2, (f - sq) // 2))
    save(can, 'mipmap-' + k, 'ic_launcher_foreground.png')
    # notification: white silhouette of the D (status bar icons must be single colour)
    m = Image.new('RGBA', src.size, (0, 0, 0, 0)); mp = m.load()
    for y in range(src.height):
        for x in range(src.width):
            p = px[x, y]
            if p[3] > 10 and p[0] > 200 and p[1] > 200 and p[2] > 200: mp[x, y] = (255, 255, 255, 255)
    box = m.getbbox(); m = m.crop(box)
    ni = round(24 * s); inner = round(20 * s)
    w = round(m.width * inner / max(m.size)); h = round(m.height * inner / max(m.size))
    can = Image.new('RGBA', (ni, ni), (0, 0, 0, 0)); can.alpha_composite(m.resize((w, h), Image.LANCZOS), ((ni - w) // 2, (ni - h) // 2))
    save(can, 'drawable-' + k, 'ic_stat_dsa.png')

with open(os.path.join(RES, 'values/ic_launcher_background.xml'), 'w') as fh:
    fh.write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#2459D6</color>\n</resources>\n')

# splash: logo in the middle of the app background, same sizes as the files Capacitor generated
for dirpath, _, files in os.walk(RES):
    if 'splash.png' in files:
        p = os.path.join(dirpath, 'splash.png'); w, h = Image.open(p).size
        img = Image.new('RGB', (w, h), (244, 245, 247)); L = round(min(w, h) * 0.22)
        img.paste(src.resize((L, L), Image.LANCZOS), ((w - L) // 2, (h - L) // 2), src.resize((L, L), Image.LANCZOS))
        img.save(p)
print('ok')
