"""Gera os QR codes do site do casamento (Aminah & Luís) com a identidade do convite."""
import sys
from pathlib import Path

import segno
from PIL import Image, ImageDraw, ImageFont

URL = 'https://casamento-aminah-luis.virtusprompt.workers.dev'
PROJ = Path(sys.argv[1])
OUT = PROJ / 'qr-code'
FONTS = Path(sys.argv[2])
OUT.mkdir(exist_ok=True)

VERDE = (62, 81, 60)
BEGE = (243, 219, 185)
PAPEL = (255, 251, 244)
OLIVA = (153, 150, 124)

qr = segno.make(URL, error='q', micro=False)
M = [[bool(v) for v in row] for row in qr.matrix]
N = len(M)
print('versão', qr.version, 'erro', qr.error, 'módulos', N)


# Estilo: cantos suaves mas discretos. Arredondar mais (pontos/olhos redondos) falhou nos testes de leitura.
GAP, RAIO, OLHO = 0.0, 0.15, 0.0


def finder(r, c):
    return (r < 7 and c < 7) or (r < 7 and c >= N - 7) or (r >= N - 7 and c < 7)


def desenhar_qr(tamanho, cor, fundo, margem=4):
    """QR com módulos arredondados e olhos em quadrado de cantos suaves. Desenha a 4x e reduz (antialias)."""
    esc = 4
    total = N + 2 * margem
    m = tamanho * esc / total
    im = Image.new('RGBA', (tamanho * esc, tamanho * esc), fundo)
    d = ImageDraw.Draw(im)
    o = margem * m
    for r in range(N):
        for c in range(N):
            if M[r][c] and not finder(r, c):
                x, y = o + c * m, o + r * m
                g = m * GAP
                d.rounded_rectangle([x + g, y + g, x + m - g, y + m - g], radius=m * RAIO, fill=cor)
    for r0, c0 in [(0, 0), (0, N - 7), (N - 7, 0)]:
        x, y = o + c0 * m, o + r0 * m
        d.rounded_rectangle([x, y, x + 7 * m, y + 7 * m], radius=m * OLHO, fill=cor)
        d.rounded_rectangle([x + m, y + m, x + 6 * m, y + 6 * m], radius=m * OLHO * 0.7, fill=fundo if fundo[3] else (0, 0, 0, 0))
        d.rounded_rectangle([x + 2 * m, y + 2 * m, x + 5 * m, y + 5 * m], radius=m * 0.9, fill=cor)
    return im.resize((tamanho, tamanho), Image.LANCZOS)


# Para o anel branco dos "olhos" em fundo transparente, desenhar com fundo e recortar depois.
def qr_transparente(tamanho, cor):
    base = desenhar_qr(tamanho, cor + (255,), (255, 255, 255, 255))
    px = base.load()
    out = Image.new('RGBA', base.size)
    po = out.load()
    for y in range(base.height):
        for x in range(base.width):
            r, g, b, _ = px[x, y]
            # alfa a partir da distância ao branco (mantém o antialias)
            a = max(0, min(255, round(255 * (1 - (r + g + b) / 3 / 255) / (1 - sum(cor) / 3 / 255))))
            po[x, y] = cor + (a,)
    return out


# 1) Só o QR, verde em branco
desenhar_qr(2000, VERDE + (255,), (255, 255, 255, 255)).convert('RGB').save(OUT / 'qr-aminah-luis.png', dpi=(300, 300))
# 2) Só o QR, verde em fundo transparente (para pôr por cima de outros designs claros)
qr_transparente(2000, VERDE).save(OUT / 'qr-aminah-luis-transparente.png', dpi=(300, 300))


# 3) Cartão com a identidade do convite
def fonte(nome, tam, **eixos):
    f = ImageFont.truetype(str(FONTS / nome), tam)
    if eixos:
        f.set_variation_by_axes([eixos.get('opsz', 100), eixos.get('wght', 400)])
    return f


def texto_centrado(d, y, partes, largura, entre=18):
    """partes = [(texto, fonte, cor, espaçamento_letras)] na mesma linha, centradas."""
    def medir(t, f, esp):
        return sum(f.getlength(ch) for ch in t) + esp * max(0, len(t) - 1)

    total = sum(medir(t, f, e) for t, f, _, e in partes) + entre * (len(partes) - 1)
    x = (largura - total) / 2
    for t, f, cor, esp in partes:
        for ch in t:
            d.text((x, y), ch, font=f, fill=cor, anchor='ls')
            x += f.getlength(ch) + esp
        x += entre - esp


W, H = 1500, 2100
card = Image.new('RGB', (W, H), BEGE)
d = ImageDraw.Draw(card)

# moldura fina
d.rounded_rectangle([46, 46, W - 46, H - 46], radius=28, outline=VERDE, width=3)
d.rounded_rectangle([62, 62, W - 62, H - 62], radius=20, outline=OLIVA, width=1)

# ornamento do site (traço claro sobre verde) recolorido a verde
orn = Image.open(PROJ / 'public/img/ornament.webp').convert('RGB')
ow = 760
orn = orn.resize((ow, round(orn.height * ow / orn.width)), Image.LANCZOS)
alfa = Image.new('L', orn.size)
pa, po = alfa.load(), orn.load()
for y in range(orn.height):
    for x in range(orn.width):
        r, g, b = po[x, y]
        lum = (r + g + b) / 3
        pa[x, y] = max(0, min(255, round((lum - 68) * 255 / (225 - 68))))
camada = Image.new('RGB', orn.size, VERDE)
card.paste(camada, ((W - ow) // 2, 170), alfa)
y_orn_fim = 170 + orn.height

titulo = fonte('Imbue[opsz,wght].ttf', 150, opsz=100, wght=400)
script = fonte('PinyonScript-Regular.ttf', 120)
caps = fonte('Marcellus-Regular.ttf', 44)
caps_g = fonte('Marcellus-Regular.ttf', 54)
corpo = fonte('Questrial-Regular.ttf', 40)
corpo_p = fonte('Questrial-Regular.ttf', 32)

y = y_orn_fim + 200
texto_centrado(d, y, [('AMINAH', titulo, VERDE, 6), ('e', script, VERDE, 0), ('LUÍS', titulo, VERDE, 6)], W, entre=40)
y += 100
texto_centrado(d, y, [('05 · 09 · 2027', caps, OLIVA, 8)], W)

# painel do QR
qs = 860
py = y + 106
pad = 36  # folga para o QR (quadrado) não cortar os cantos arredondados do painel
d.rounded_rectangle([(W - qs) // 2 - pad, py - pad, (W + qs) // 2 + pad, py + qs + pad], radius=44, fill=PAPEL, outline=OLIVA, width=2)
qimg = desenhar_qr(qs, VERDE + (255,), PAPEL + (255,), margem=3)
card.paste(qimg.convert('RGB'), ((W - qs) // 2, py))

y = py + qs + pad + 115
texto_centrado(d, y, [('CONFIRMA A TUA PRESENÇA', caps_g, VERDE, 7)], W)
y += 70
texto_centrado(d, y, [('até 15 de julho de 2027', corpo, VERDE, 1)], W)
y += 100
texto_centrado(d, y, [('Aponta a câmara do telemóvel ao código', corpo_p, OLIVA, 1)], W)

card.save(OUT / 'qr-convite-aminah-luis.png', dpi=(300, 300))
print('ok', sorted(p.name for p in OUT.iterdir()))
