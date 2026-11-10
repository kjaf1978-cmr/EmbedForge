#!/usr/bin/env python3
"""One connection Freerouting left, found on a grid (a maze router for single links):
    python3 tools/kicad/link.py <routing-dir> <net> <x0> <y0> <x1> <y1> [width] [grid]
On the routed board before its post copper (routed-pre.kicad_pcb), with the post copper the
design already has, every copper item of another net is an obstacle grown by its clearance (the
larger of its class's and the default, an insulation class's distance from apart.json) plus half
the new track's width; A* then searches from (x0, y0) to (x1, y1) on both layers, a via costing
as much as 8 mm of track. Prints the path as the design's post copper (tracks and vias, JSON).
Check it with route.py --post-only before using it: the grid's diagonal steps and the pads'
outlines are approximated (0.2 mm of margin covers them)."""
import heapq, json, math, os, sys
import pcbnew

d, net = sys.argv[1], sys.argv[2]
A = (float(sys.argv[3]), float(sys.argv[4])); B = (float(sys.argv[5]), float(sys.argv[6]))
W = float(sys.argv[7]) if len(sys.argv) > 7 else 0.3
G = float(sys.argv[8]) if len(sys.argv) > 8 else 0.25
VIA = 0.8
MARGIN = 0.2

pro = json.load(open(os.path.join(d, 'board.kicad_pro')))
classes = {c['name']: c for c in pro['net_settings']['classes']}
default_clr = classes['Default']['clearance']
apart = {a['cls']: a['mm'] for a in json.load(open(os.path.join(d, 'apart.json')))} if os.path.exists(os.path.join(d, 'apart.json')) else {}
zones = json.load(open(os.path.join(d, 'zones.json')))
# the board's project beside it, or KiCad gives every net the default class
import shutil  # noqa: E402
for ext in ('kicad_dru', 'kicad_pro'):
    if os.path.exists(os.path.join(d, 'board.' + ext)):
        shutil.copy(os.path.join(d, 'board.' + ext), os.path.join(d, 'routed-pre.' + ext))
b = pcbnew.LoadBoard(os.path.join(d, 'routed-pre.kicad_pcb'))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from route import apply_post  # noqa: E402
if zones.get('post'):
    apply_post(b, {'tracks': zones['post'].get('tracks') or [], 'vias': zones['post'].get('vias') or []})
mm = pcbnew.ToMM
my_cls = b.FindNet(net).GetNetClassName() if b.FindNet(net) else 'Default'


def need(other_cls):
    """The distance an item of other_cls needs from the new copper."""
    c = max(classes.get(other_cls, classes['Default'])['clearance'], classes.get(my_cls, classes['Default'])['clearance'])
    for k in (other_cls, my_cls):
        if k in apart and other_cls != my_cls:
            c = max(c, apart[k])
    return c + MARGIN


NX, NY = int(zones['w'] / G) + 1, int(zones['h'] / G) + 1
LAYERS = [pcbnew.F_Cu, pcbnew.B_Cu]
# per layer: the new track's centre may not lie here (blocked) / a via's centre may not (vblocked)
blocked = [bytearray(NX * NY) for _ in LAYERS]
vblocked = [bytearray(NX * NY) for _ in LAYERS]


def seg_dist(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    L = dx * dx + dy * dy
    t = 0 if L == 0 else max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / L))
    return math.hypot(px - ax - t * dx, py - ay - t * dy)


def mark(li, x0, y0, x1, y1, dist, reach):
    """Cells within the box (grown by reach) whose distance to the item (dist(x, y)) is short."""
    i0, i1 = max(0, int((x0 - reach) / G)), min(NX - 1, int((x1 + reach) / G) + 1)
    j0, j1 = max(0, int((y0 - reach) / G)), min(NY - 1, int((y1 + reach) / G) + 1)
    bl, vb = blocked[li], vblocked[li]
    for j in range(j0, j1 + 1):
        y = j * G
        for i in range(i0, i1 + 1):
            k = j * NX + i
            if bl[k] and vb[k]:
                continue
            r = dist(i * G, y)
            if r < reach_t:
                bl[k] = 1
            if r < reach_v:
                vb[k] = 1


for t in b.GetTracks():
    if t.GetNetname() == net:
        continue
    c = need(t.GetNetClassName())
    reach_t, reach_v = c + W / 2, c + VIA / 2
    s, e, hw = t.GetStart(), t.GetEnd(), mm(t.GetWidth()) / 2
    ax, ay, bx, by = mm(s.x), mm(s.y), mm(e.x), mm(e.y)
    for li, L in enumerate(LAYERS):
        if t.IsOnLayer(L):
            mark(li, min(ax, bx) - hw, min(ay, by) - hw, max(ax, bx) + hw, max(ay, by) + hw,
                 lambda x, y: seg_dist(x, y, ax, ay, bx, by) - hw, max(reach_t, reach_v))
for fp in b.GetFootprints():
    for pad in fp.Pads():
        if pad.GetNetname() == net and pad.GetNetCode() > 0:
            continue
        c = need(pad.GetNetClassName() if pad.GetNetCode() > 0 else 'Default')
        reach_t, reach_v = c + W / 2, c + VIA / 2
        p, sz = pad.GetPosition(), pad.GetSize()
        cx, cy, hx, hy = mm(p.x), mm(p.y), mm(sz.x) / 2, mm(sz.y) / 2
        ang = math.radians(pad.GetOrientationDegrees())
        ca, sa = math.cos(ang), math.sin(ang)
        if pad.GetShape() in (pcbnew.PAD_SHAPE_CIRCLE,):
            f = lambda x, y, cx=cx, cy=cy, r=hx: math.hypot(x - cx, y - cy) - r
        elif pad.GetShape() == pcbnew.PAD_SHAPE_OVAL:
            # a segment along the long side, with the short half-width as radius
            if hx >= hy:
                ux, uy, r, h = ca, -sa, hy, hx - hy
            else:
                ux, uy, r, h = sa, ca, hx, hy - hx
            f = lambda x, y, cx=cx, cy=cy, ux=ux, uy=uy, r=r, h=h: seg_dist(x, y, cx - ux * h, cy - uy * h, cx + ux * h, cy + uy * h) - r
        else:
            # a rectangle (rounded rectangles counted square: on the safe side)
            def f(x, y, cx=cx, cy=cy, hx=hx, hy=hy, ca=ca, sa=sa):
                dx, dy = x - cx, y - cy
                u, v = dx * ca - dy * sa, dx * sa + dy * ca
                ex, ey = max(abs(u) - hx, 0), max(abs(v) - hy, 0)
                return math.hypot(ex, ey) if ex or ey else -min(hx - abs(u), hy - abs(v))
        R = math.hypot(hx, hy)
        # a drilled hole blocks every layer (the via's barrel and the track keep their distance)
        for li, L in enumerate(LAYERS):
            if pad.IsOnLayer(L) or pad.GetAttribute() in (pcbnew.PAD_ATTRIB_PTH, pcbnew.PAD_ATTRIB_NPTH):
                mark(li, cx - R, cy - R, cx + R, cy + R, f, max(reach_t, reach_v))
# the board's edge (and the 1 mm the fab wants)
for li in range(2):
    for j in range(NY):
        for i in range(NX):
            x, y = i * G, j * G
            e = min(x, y, zones['w'] - x, zones['h'] - y)
            if e < 1 + W / 2:
                blocked[li][j * NX + i] = 1
            if e < 1 + VIA / 2:
                vblocked[li][j * NX + i] = 1


def cell(p):
    return (round(p[0] / G), round(p[1] / G))


def layers_at(p):
    """The copper layers (0 F.Cu, 1 B.Cu) where the net's copper lies at p: a path must start and
    end there (ending on the other layer would leave the link unjoined)."""
    out = set()
    pt = pcbnew.VECTOR2I(pcbnew.FromMM(p[0]), pcbnew.FromMM(p[1]))
    for t in b.GetTracks():
        if t.GetNetname() == net and t.HitTest(pt, pcbnew.FromMM(0.05)):
            out |= {li for li, L in enumerate(LAYERS) if t.IsOnLayer(L)}
    for fp in b.GetFootprints():
        for pad in fp.Pads():
            if pad.GetNetname() == net and pad.HitTest(pt):
                out |= {li for li, L in enumerate(LAYERS) if pad.IsOnLayer(L)}
    return out or {0, 1}


s, g = cell(A), cell(B)
LS, LG = layers_at(A), layers_at(B)
VIA_COST = 8 / G
start = [(0, s), (1, s)]
for li in range(2):
    # the ends are pads or tracks of the net: their own cells free (only those: freeing around
    # them let the path start too close to a neighbour)
    for (i, j) in (s, g):
        for dj in range(0, 1):
            for di in range(0, 1):
                k = (j + dj) * NX + i + di
                if 0 <= k < NX * NY:
                    blocked[li][k] = 0
h = lambda i, j: math.hypot(i - g[0], j - g[1])
# the state carries the direction of the last step: each turn costs a cell, so the path takes few
# bends rather than a staircase
TURN = 1.0
steps = [(1, 0, 1), (-1, 0, 1), (0, 1, 1), (0, -1, 1), (1, 1, 1.4142), (1, -1, 1.4142), (-1, 1, 1.4142), (-1, -1, 1.4142)]
openq, came, cost = [], {}, {}
for li in LS:
    st = (li, s, -1)
    cost[st] = 0
    heapq.heappush(openq, (h(*s), 0, st))
found = None
while openq:
    f_, c_, node = heapq.heappop(openq)
    li, (i, j), dr = node
    if c_ > cost.get(node, 1e18):
        continue
    if (i, j) == g and li in LG:
        found = node; break
    nxt = []
    for n_, (di, dj, w) in enumerate(steps):
        ni, nj = i + di, j + dj
        if 0 <= ni < NX and 0 <= nj < NY and not blocked[li][nj * NX + ni]:
            nxt.append(((li, (ni, nj), n_), w + (TURN if dr not in (-1, n_) else 0)))
    k = j * NX + i
    if not vblocked[0][k] and not vblocked[1][k]:
        nxt.append(((1 - li, (i, j), -1), VIA_COST))
    for n, w in nxt:
        nc = c_ + w
        if nc < cost.get(n, 1e18):
            cost[n] = nc; came[n] = node
            heapq.heappush(openq, (nc + h(*n[1]), nc, n))
if not found:
    print('NONE'); sys.exit(1)
path = [found]
while path[-1] in came:
    path.append(came[path[-1]])
path = [(li, ij) for li, ij, _ in reversed(path)]
# the path as tracks (collinear steps merged) and vias; its ends exactly on A and B
tracks, vias, cur = [], [], None
for n, (li, (i, j)) in enumerate(path):
    p = [round(i * G, 3), round(j * G, 3)]
    if cur is None or cur['layer'] != ('F.Cu', 'B.Cu')[li]:
        if cur is not None:
            vias.append({'net': net, 'at': p})
        cur = {'net': net, 'layer': ('F.Cu', 'B.Cu')[li], 'width': W, 'pts': [p]}
        tracks.append(cur)
    else:
        pts = cur['pts']
        if len(pts) >= 2 and (pts[-1][0] - pts[-2][0]) * (p[1] - pts[-1][1]) == (pts[-1][1] - pts[-2][1]) * (p[0] - pts[-1][0]):
            pts[-1] = p
        else:
            pts.append(p)
tracks = [t for t in tracks if len(t['pts']) > 1]


def in_tht_pad(p):
    pt = pcbnew.VECTOR2I(pcbnew.FromMM(p[0]), pcbnew.FromMM(p[1]))
    return any(pad.GetNetname() == net and pad.GetAttribute() == pcbnew.PAD_ATTRIB_PTH and pad.HitTest(pt)
               for fp in b.GetFootprints() for pad in fp.Pads())


# a via inside a through-hole pad of the net is not needed (the pad joins the layers) and its hole
# would sit on the pad's
vias = [v for v in vias if not in_tht_pad(v['at'])]
tracks[0]['pts'].insert(0, list(A)); tracks[-1]['pts'].append(list(B))
print(json.dumps({'tracks': tracks, 'vias': vias}))
