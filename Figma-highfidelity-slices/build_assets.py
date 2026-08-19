# -*- coding: utf-8 -*-
"""
Nebula Edition (方案 B) 切图资源生成器
- 单一声明式 icon spec 同时产出 SVG（矢量源）与 PNG（@1x/@2x/@3x 位图）
- PNG 通过 Pillow 以 12x 超采样渲染后 LANCZOS 下采样，保证抗锯齿清晰
- 输出目录：assets/svg/<group>/<name>.svg  +  assets/png/@Nx/<group>__<name>.png
"""
import os
import math
from PIL import Image, ImageDraw

BASE = 24          # 设计基准 viewBox
SS = 12            # 超采样倍数 -> 内部 288px
STROKE = 1.6       # 基准描边宽度（viewBox 24 下）
INK = "#e9e6ff"    # 图标默认描边色（深紫白，匹配深色主题）
VIOLET = "#a78bfa"

ROOT = os.path.dirname(os.path.abspath(__file__))
SVG_DIR = os.path.join(ROOT, "assets", "svg")
PNG_DIR = os.path.join(ROOT, "assets", "png")

# 基元类型
#  L  x1 y1 x2 y2                 -> 直线
#  R  x y w h rx                  -> 圆角矩形（描边）
#  C  cx cy r                     -> 圆（描边）
#  Cf cx cy r                     -> 实心圆（填充）
#  A  cx cy r a0 a1               -> 圆弧（度数，PIL 系：0=3点,90=下）
#  P  [x1,y1,x2,y2,...]           -> 折线（开放）
#  Pg [x1,y1,...]                 -> 多边形（闭合描边）

ICONS = [
    # ---------------- common ----------------
    {"key": "brand-mark", "group": "common", "fill": True, "color": VIOLET,
     "prims": [("Cf", 12, 12, 7)]},
    {"key": "sparkle", "group": "common", "color": INK,
     "prims": [("Pg", [12,3, 14,10, 21,12, 14,14, 12,21, 10,14, 3,12, 10,10])]},
    {"key": "close", "group": "common", "color": INK,
     "prims": [("L", 6,6, 18,18), ("L", 18,6, 6,18)]},
    {"key": "check", "group": "common", "color": INK,
     "prims": [("P", [5,12, 10,17, 19,7])]},
    {"key": "chevron-down", "group": "common", "color": INK,
     "prims": [("P", [6,9, 12,15, 18,9])]},
    {"key": "plus", "group": "common", "color": INK,
     "prims": [("L", 12,5, 12,19), ("L", 5,12, 19,12)]},

    # ---------------- nav ----------------
    {"key": "back", "group": "nav", "color": INK,
     "prims": [("P", [14,6, 8,12, 14,18]), ("L", 8,12, 20,12)]},
    {"key": "search", "group": "nav", "color": INK,
     "prims": [("C", 10,10, 7), ("L", 16,16, 21,21)]},
    {"key": "filter", "group": "nav", "color": INK,
     "prims": [("P", [4,5, 20,5, 13,13, 13,19]), ("L", 11,19, 15,19)]},
    {"key": "arrange", "group": "nav", "color": INK,
     "prims": [("R", 4,4, 16,16, 2), ("L", 4,12, 20,12), ("L", 12,4, 12,20)]},
    {"key": "thumbmap", "group": "nav", "color": INK,
     "prims": [("R", 4,6, 16,12, 2), ("L", 8,6, 8,18), ("L", 16,6, 16,18), ("L", 4,12, 20,12)]},

    # ---------------- capture（底部输入模式） ----------------
    {"key": "image", "group": "capture", "color": INK,
     "prims": [("R", 3,4.5, 18,15, 2), ("Cf", 8.5,10, 1.5),
               ("P", [3,16, 8,11, 12,15, 15,12, 21,18])]},
    {"key": "audio", "group": "capture", "color": INK,
     "prims": [("R", 9,3, 6,11, 3), ("A", 12,11, 7, 0, 180), ("L", 12,18, 12,21)]},
    {"key": "camera", "group": "capture", "color": INK,
     "prims": [("R", 3,7, 18,13, 2), ("R", 8,5, 8,3, 1), ("C", 12,13, 3.5)]},
    {"key": "record", "group": "capture", "color": INK,
     "prims": [("R", 9,3, 6,11, 3), ("A", 12,11, 7, 0, 180),
               ("L", 12,18, 12,21), ("Cf", 19,5.5, 1.6)]},

    # ---------------- timeline（白板 / 视图 / 选择） ----------------
    {"key": "view-board", "group": "timeline", "color": INK,
     "prims": [("R", 4,4, 16,16, 2), ("L", 4,12, 20,12), ("L", 12,4, 12,20)]},
    {"key": "view-nebula", "group": "timeline", "color": INK,
     "prims": [("Pg", [12,3, 14,10, 21,12, 14,14, 12,21, 10,14, 3,12, 10,10])]},
    {"key": "arrow-right", "group": "timeline", "color": INK,
     "prims": [("L", 6,12, 18,12), ("P", [13,7, 18,12, 13,17])]},
    {"key": "sticky-note", "group": "timeline", "color": INK,
     "prims": [("R", 4,3, 16,18, 2), ("L", 8,9, 16,9), ("L", 8,13, 16,13)]},
    {"key": "ai-spark", "group": "timeline", "color": VIOLET,
     "prims": [("Pg", [12,4, 13.2,10.5, 20,12, 13.2,13.5, 12,20, 10.8,13.5, 4,12, 10.8,10.5])]},
]

# 灵感类型色板（6 色，供参考；前端优先用 CSS 变量）
TYPE_SWATCHES = [
    ("gray",   "#8d8879", "先不分类"),
    ("violet", "#a78bfa", "想法"),
    ("blue",   "#7dd3fc", "引用"),
    ("rose",   "#f9a8d4", "随感"),
    ("mint",   "#86efac", "待办"),
    ("amber",  "#fcd34d", "案例"),
]


def prim_to_svg(p, color, stroke):
    t = p[0]
    if t == "L":
        return f'<line x1="{p[1]}" y1="{p[2]}" x2="{p[3]}" y2="{p[4]}"/>'
    if t == "R":
        return f'<rect x="{p[1]}" y="{p[2]}" width="{p[3]}" height="{p[4]}" rx="{p[5]}"/>'
    if t == "C":
        return f'<circle cx="{p[1]}" cy="{p[2]}" r="{p[3]}"/>'
    if t == "Cf":
        return f'<circle cx="{p[1]}" cy="{p[2]}" r="{p[3]}" fill="{color}" stroke="none"/>'
    if t == "A":
        cx, cy, r, a0, a1 = p[1], p[2], p[3], p[4], p[5]
        x0 = cx + r * math.cos(math.radians(a0))
        y0 = cy + r * math.sin(math.radians(a0))
        x1 = cx + r * math.cos(math.radians(a1))
        y1 = cy + r * math.sin(math.radians(a1))
        large = 1 if abs(a1 - a0) > 180 else 0
        sweep = 1 if a1 > a0 else 0
        return (f'<path d="M {x0:.2f} {y0:.2f} A {r} {r} 0 {large} {sweep} '
                f'{x1:.2f} {y1:.2f}"/>')
    if t == "P":
        c = p[1] if isinstance(p[1], (list, tuple)) else p[1:]
        pts = " ".join(f"{c[i]},{c[i+1]}" for i in range(0, len(c) - 1, 2))
        return f'<polyline points="{pts}"/>'
    if t == "Pg":
        c = p[1] if isinstance(p[1], (list, tuple)) else p[1:]
        pts = " ".join(f"{c[i]},{c[i+1]}" for i in range(0, len(c) - 1, 2))
        return f'<polygon points="{pts}"/>'
    return ""


def write_svg(icon):
    color = icon.get("color", INK)
    # 顶层 <svg> 默认 fill="none"（描边图标），不重复拼接。
    body = "\n      ".join(prim_to_svg(p, color, STROKE) for p in icon["prims"])
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {BASE} {BASE}" '
        f'width="{BASE}" height="{BASE}" fill="none" '
        f'stroke="{color}" stroke-width="{STROKE}" '
        f'stroke-linecap="round" stroke-linejoin="round">\n'
        f'      {body}\n'
        f'</svg>\n'
    )
    path = os.path.join(SVG_DIR, icon["group"], icon["key"] + ".svg")
    with open(path, "w", encoding="utf-8") as f:
        f.write(svg)
    return path


CURRENT_KEY = ""


def draw_prim(draw, p, color, w):
    t = p[0]
    S = SS
    if t == "L":
        draw.line([p[1]*S, p[2]*S, p[3]*S, p[4]*S], fill=color, width=w, joint="curve")
    elif t == "R":
        draw.rounded_rectangle(
            [p[1]*S, p[2]*S, (p[1]+p[3])*S, (p[2]+p[4])*S],
            radius=p[5]*S, outline=color, width=w)
    elif t == "C":
        r = p[3]*S
        draw.ellipse([p[1]*S-r, p[2]*S-r, p[1]*S+r, p[2]*S+r],
                     outline=color, width=w)
    elif t == "Cf":
        r = p[3]*S
        draw.ellipse([p[1]*S-r, p[2]*S-r, p[1]*S+r, p[2]*S+r], fill=color)
    elif t == "A":
        cx, cy, r, a0, a1 = p[1], p[2], p[3], p[4], p[5]
        x0, y0, x1, y1 = cx*S-r*S, cy*S-r*S, cx*S+r*S, cy*S+r*S
        draw.arc([x0, y0, x1, y1], a0, a1, fill=color, width=w)
    elif t == "P":
        c = p[1] if isinstance(p[1], (list, tuple)) else p[1:]
        pts = [(c[i]*S, c[i+1]*S) for i in range(0, len(c) - 1, 2)]
        if len(pts) >= 2:
            draw.line(pts, fill=color, width=w, joint="curve")
        else:
            print(f"  [warn] {CURRENT_KEY} P degenerate: {p}")
    elif t == "Pg":
        c = p[1] if isinstance(p[1], (list, tuple)) else p[1:]
        pts = [(c[i]*S, c[i+1]*S) for i in range(0, len(c) - 1, 2)]
        if len(pts) >= 2:
            draw.line(pts + [pts[0]], fill=color, width=w, joint="curve")
        else:
            print(f"  [warn] {CURRENT_KEY} Pg degenerate: {p}")


def render_png(icon):
    global CURRENT_KEY
    CURRENT_KEY = icon["key"]
    color = icon.get("color", INK)
    size = BASE * SS
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    w = max(1, int(STROKE * SS))
    for p in icon["prims"]:
        draw_prim(draw, p, color, w)
    # Pillow 不支持 ellipse 的 width 抗锯齿外扩，简单缩小 1px 描边误差可接受
    targets = {"@1x": 24, "@2x": 48, "@3x": 72}
    out_paths = []
    for tag, tgt in targets.items():
        small = img.resize((tgt, tgt), Image.LANCZOS)
        path = os.path.join(PNG_DIR, tag, f'{icon["group"]}__{icon["key"]}.png')
        small.save(path)
        out_paths.append(path)
    return out_paths


def write_type_swatches():
    # SVG sprite：6 个色点 + 文字标签（SVG 端可选，前端无需依赖）
    circles = []
    for i, (name, hexc, label) in enumerate(TYPE_SWATCHES):
        cx = 14 + i * 28
        circles.append(
            f'  <g>\n'
            f'    <circle cx="{cx}" cy="14" r="10" fill="{hexc}"/>\n'
            f'    <text x="{cx}" y="40" text-anchor="middle" '
            f'font-family="PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif" '
            f'font-size="9" fill="#8d8879">{label}</text>\n'
            f'  </g>'
        )
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 182 50" '
        'width="182" height="50">\n' + "\n".join(circles) + "\n</svg>\n"
    )
    path = os.path.join(SVG_DIR, "capture", "type-swatches.svg")
    with open(path, "w", encoding="utf-8") as f:
        f.write(svg)
    # PNG 端：仅纯色圆（避免依赖系统 CJK 字体）；色名由 切图清单.md 提供
    sw = 182 * SS
    sh = 28 * SS
    img = Image.new("RGBA", (sw, sh), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for i, (name, hexc, label) in enumerate(TYPE_SWATCHES):
        cx = (14 + i * 28) * SS
        cy = 14 * SS
        r = 10 * SS
        d.ellipse([cx-r, cy-r, cx+r, cy+r], fill=hexc)
    base_h = 28
    for tag, tgt in {"@1x": 182, "@2x": 364, "@3x": 546}.items():
        out_h = max(24, int(tgt * base_h / 182))
        out = img.resize((tgt, out_h), Image.LANCZOS)
        out.save(os.path.join(PNG_DIR, tag, "capture__type-swatches.png"))
    return path


def main():
    os.makedirs(SVG_DIR, exist_ok=True)
    os.makedirs(PNG_DIR, exist_ok=True)
    for g in ("common", "nav", "capture", "timeline"):
        os.makedirs(os.path.join(SVG_DIR, g), exist_ok=True)
    for tag in ("@1x", "@2x", "@3x"):
        os.makedirs(os.path.join(PNG_DIR, tag), exist_ok=True)

    svg_count = png_count = 0
    for ic in ICONS:
        write_svg(ic)
        svg_count += 1
        outs = render_png(ic)
        png_count += len(outs)
    write_type_swatches()
    svg_count += 1
    png_count += 3
    print(f"OK  SVG={svg_count}  PNG={png_count}")


if __name__ == "__main__":
    main()
