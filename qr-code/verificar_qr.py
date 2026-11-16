import sys
from pathlib import Path
import cv2, numpy as np
from PIL import Image
pasta = Path(sys.argv[1])
URL = 'https://casamento-aminah-luis.virtusprompt.workers.dev'
from PIL import ImageFilter
dets = [cv2.QRCodeDetector(), cv2.QRCodeDetectorAruco()]
def ler(im):
    n = 0
    for b in [0, 1.5]:
        a = cv2.cvtColor(np.array((im.filter(ImageFilter.GaussianBlur(b)) if b else im).convert('RGB')), cv2.COLOR_RGB2BGR)
        for d in dets:
            try: t, *_ = d.detectAndDecode(a)
            except Exception: t = ''
            n += t == URL
    return n
for nome in ['qr-aminah-luis.png', 'qr-aminah-luis-transparente.png', 'qr-convite-aminah-luis.png']:
    im = Image.open(pasta / nome)
    if im.mode == 'RGBA':
        fundo = Image.new('RGB', im.size, (243, 219, 185)); fundo.paste(im, (0, 0), im); im = fundo
    for w in [im.width, 600, 300, 200]:
        r = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
        print(f'{nome:34} {w:>5}px  {ler(r)}/4')
