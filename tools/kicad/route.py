#!/usr/bin/env python3
"""Route a board exported by export.ts and make its fabrication files (decision D43).

    python3 tools/kicad/route.py <dir> [--passes N] [--oit percent]

<dir> holds board.kicad_pcb and board.kicad_pro. Steps: Specctra DSN export, Freerouting in
batch mode (under xvfb-run, it needs a display), SES import, KiCad's design rule check
(drc.json), then Gerber, drill, position and BOM files under <dir>/fab with a zip for the fab.
"""
import json, os, subprocess, sys, zipfile

FREEROUTING = os.environ.get('FREEROUTING', '/opt/freerouting/freerouting.jar')


def run(cmd, **kw):
    print('$', ' '.join(cmd), flush=True)
    return subprocess.run(cmd, check=True, **kw)


def drc(pcb_path, report):
    """KiCad's design rule check (pcbnew.WriteDRCReport: kicad-cli has no DRC before KiCad 8):
    the errors (severity error) by kind and the number of unconnected items. Each check runs in a
    process of its own: a second check in one process kept the first board's results (a path
    reported clean crossed three nets)."""
    import re
    from collections import Counter
    run_drc(pcb_path, report)
    text = open(report).read()
    # the independent clearance check: its findings count as errors too
    import shlex, subprocess as sp
    here = os.path.dirname(os.path.abspath(__file__))
    ap = os.path.join(os.path.dirname(os.path.abspath(pcb_path)), 'apart.json')
    out = sp.run(['bash', '-c', f"cd {shlex.quote(here)} && python3 route.py --geo-check {shlex.quote(os.path.abspath(pcb_path))} {shlex.quote(ap)} 2>/dev/null | tail -1"],
                 capture_output=True, text=True).stdout.strip()
    geo = json.loads(out) if out.startswith('[') else ['geo check failed to run']
    if geo:
        text += ''.join(f'\n[geo_clearance]: {g}\n    Severity: error\n' for g in geo)
        open(report, 'a').write(''.join(f'\n[geo_clearance]: {g}\n    Severity: error\n' for g in geo))
    blocks = re.split(r'\n(?=\[)', text)
    errors = [bl for bl in blocks if bl.startswith('[') and 'Severity: error' in bl]
    kinds = Counter(bl[1:bl.index(']')] for bl in errors)
    m = re.search(r'\*\* Found (\d+) unconnected pads \*\*', text)
    return errors, int(m.group(1)) if m else 0, kinds


def sexpr(text):
    """A small S-expression reader (Specctra session files)."""
    import re
    toks = re.findall(r'"(?:[^"\\]|\\.)*"|[()]|[^\s()"]+', text)
    stack, cur = [], []
    for t in toks:
        if t == '(':
            stack.append(cur); cur = []
        elif t == ')':
            done, cur = cur, stack.pop(); cur.append(done)
        else:
            cur.append(t[1:-1] if t.startswith('"') else t)
    return cur[0]


def import_ses(board, ses_path, lock=False):
    """The routes of a Freerouting session into the board: KiCad 7's ImportSpecctraSES works
    only on the board open in the editor. Session units: resolution (um 10 = 0.1 um), y up."""
    import pcbnew, re
    tree = sexpr(open(ses_path).read())
    routes = next(x for x in tree if isinstance(x, list) and x and x[0] == 'routes')
    res = next(x for x in routes if isinstance(x, list) and x[0] == 'resolution')
    per_mm = {'um': 1000, 'mm': 1, 'mil': 1 / 0.0254}[res[1]] * float(res[2])
    nm = lambda v: int(round(float(v) / per_mm * 1e6))
    layers = {'F.Cu': pcbnew.F_Cu, 'B.Cu': pcbnew.B_Cu}
    net_out = next(x for x in routes if isinstance(x, list) and x[0] == 'network_out')
    tracks = vias = 0
    for net in net_out[1:]:
        if not (isinstance(net, list) and net[0] == 'net'):
            continue
        ni = board.FindNet(net[1])
        for item in net[2:]:
            if not isinstance(item, list):
                continue
            if item[0] == 'wire':
                path = next(x for x in item[1:] if isinstance(x, list) and x[0] == 'path')
                layer, width, pts = path[1], nm(path[2]), path[3:]
                xy = [(nm(pts[k]), -nm(pts[k + 1])) for k in range(0, len(pts) - 1, 2)]
                for a, b in zip(xy, xy[1:]):
                    t = pcbnew.PCB_TRACK(board)
                    t.SetStart(pcbnew.VECTOR2I(*a)); t.SetEnd(pcbnew.VECTOR2I(*b))
                    t.SetWidth(width); t.SetLayer(layers[layer])
                    if ni: t.SetNet(ni)
                    t.SetLocked(lock)
                    board.Add(t); tracks += 1
            elif item[0] == 'via':
                m = re.search(r'_(\d+):(\d+)_um', item[1])
                v = pcbnew.PCB_VIA(board)
                v.SetPosition(pcbnew.VECTOR2I(nm(item[2]), -nm(item[3])))
                v.SetWidth(int(m.group(1)) * 1000 if m else 800000); v.SetDrill(int(m.group(2)) * 1000 if m else 400000)
                v.SetLayerPair(pcbnew.F_Cu, pcbnew.B_Cu)
                if ni: v.SetNet(ni)
                v.SetLocked(lock)
                board.Add(v); vias += 1
    print(f'imported {tracks} track segments, {vias} vias', flush=True)


def add_class_class(dsn, apart_json):
    """The insulation distances (apart.json: a class and its distance to every other class) as
    Specctra class_class rules, which Freerouting honours; KiCad's export writes only per-class
    clearances."""
    import re
    if not os.path.exists(apart_json):
        return
    apart = json.load(open(apart_json))
    text = open(dsn).read()
    res = re.search(r'\(resolution um (\d+)\)', text)
    per_mm = 1000 * int(res.group(1)) if res else 10000
    classes = re.findall(r'\(class (\S+)', text[text.index('(network'):])
    rules = []
    for a in apart:
        for c in classes:
            if c != a['cls']:
                rules.append(f'    (class_class (classes {a["cls"]} {c}) (rule (clearance {int(a["mm"] * per_mm)})))')
    if not rules:
        return
    k = text.index('\n  (wiring')
    close = text.rindex(')', 0, k)
    text = text[:close] + '\n'.join(rules) + '\n  ' + text[close:]
    open(dsn, 'w').write(text)
    print(f'class_class rules: {len(rules)}', flush=True)


def keepout(board, x0, y0, x1, y1):
    """A rule area on both copper layers where no track or via may go."""
    import pcbnew
    z = pcbnew.ZONE(board)
    z.SetIsRuleArea(True)
    z.SetDoNotAllowTracks(True); z.SetDoNotAllowVias(True); z.SetDoNotAllowCopperPour(True)
    z.SetDoNotAllowPads(False); z.SetDoNotAllowFootprints(False)
    ls = pcbnew.LSET(); ls.AddLayer(pcbnew.F_Cu); ls.AddLayer(pcbnew.B_Cu)
    z.SetLayerSet(ls)
    o = z.Outline(); o.NewOutline()
    for x, y in ((x0, y0), (x1, y0), (x1, y1), (x0, y1)):
        o.Append(pcbnew.FromMM(x), pcbnew.FromMM(y))
    board.Add(z)
    return z


def apply_post(board, post):
    """Copper added after the autorouter (layouts.ts `post`): pours (thermal reliefs, 0.8 mm or
    their clearance) and tracks."""
    import pcbnew
    layer = {'F.Cu': pcbnew.F_Cu, 'B.Cu': pcbnew.B_Cu}
    mm = lambda x, y: pcbnew.VECTOR2I(pcbnew.FromMM(x), pcbnew.FromMM(y))
    for zd in (post or {}).get('zones') or []:
        z = pcbnew.ZONE(board); z.SetLayer(layer[zd['layer']]); z.SetNet(board.FindNet(zd['net']))
        z.SetLocalClearance(pcbnew.FromMM(zd.get('clearance', 0.8))); z.SetMinThickness(pcbnew.FromMM(0.5))
        z.SetPadConnection(pcbnew.ZONE_CONNECTION_FULL if zd.get('solid') else pcbnew.ZONE_CONNECTION_THERMAL)
        z.SetThermalReliefGap(pcbnew.FromMM(0.8)); z.SetThermalReliefSpokeWidth(pcbnew.FromMM(0.8))
        z.SetAssignedPriority(5)
        o = z.Outline(); o.NewOutline()
        for x, y in zd['pts']:
            o.Append(pcbnew.FromMM(x), pcbnew.FromMM(y))
        board.Add(z)
    for vd in (post or {}).get('vias') or []:
        v = pcbnew.PCB_VIA(board); v.SetNet(board.FindNet(vd['net'])); v.SetPosition(mm(*vd['at']))
        v.SetWidth(pcbnew.FromMM(vd.get('size', 0.8))); v.SetDrill(pcbnew.FromMM(vd.get('drill', 0.4))); v.SetLocked(True)
        board.Add(v)
    for td in (post or {}).get('tracks') or []:
        for (x0, y0), (x1, y1) in zip(td['pts'], td['pts'][1:]):
            t = pcbnew.PCB_TRACK(board); t.SetLayer(layer[td['layer']]); t.SetNet(board.FindNet(td['net']))
            t.SetWidth(pcbnew.FromMM(td['width'])); t.SetStart(mm(x0, y0)); t.SetEnd(mm(x1, y1)); t.SetLocked(True)
            board.Add(t)
    return bool(post)


def freeroute(board, d, tag, passes, apart=True):
    """Freerouting on a board (DSN out, SES back); returns the session file."""
    import pcbnew
    dsn, ses = os.path.join(d, tag + '.dsn'), os.path.join(d, tag + '.ses')
    if not pcbnew.ExportSpecctraDSN(board, dsn):
        sys.exit('DSN export failed')
    if apart:
        add_class_class(dsn, os.path.join(d, 'apart.json'))
    if not ('--reuse' in sys.argv and os.path.exists(ses)):
        if os.path.exists(ses):
            os.remove(ses)
        # --oit N: stop the route optimisation when a pass improves by less than N % (it ran
        # for an hour on the inverter's power board after routing it in 12 s)
        oit = ['-oit', sys.argv[sys.argv.index('--oit') + 1]] if '--oit' in sys.argv else []
        run(['xvfb-run', '-a', 'java', '-jar', FREEROUTING, '-de', dsn, '-do', ses, '-mp', passes, '-mt', '1', *oit],
            stdout=open(os.path.join(d, tag + '-freerouting.log'), 'w'), stderr=subprocess.STDOUT, cwd=d)
    if not os.path.exists(ses):
        sys.exit(f'Freerouting wrote no session file ({tag}-freerouting.log)')
    return ses


def main():
    d = os.path.abspath(sys.argv[1])
    passes = sys.argv[sys.argv.index('--passes') + 1] if '--passes' in sys.argv else '20'
    import pcbnew
    pcb = os.path.join(d, 'board.kicad_pcb')
    zones = json.load(open(os.path.join(d, 'zones.json'))) if os.path.exists(os.path.join(d, 'zones.json')) else {}
    split = zones.get('split') or 0
    routed = os.path.join(d, 'routed.kicad_pcb')
    pre = os.path.join(d, 'routed-pre.kicad_pcb')
    if '--post-only' in sys.argv:
        # the routed board kept from the last run (before its post copper): only the post copper,
        # the fill, the DRC and the fabrication files again. The board's project beside it first:
        # without it KiCad fills with the default clearance, not the net classes'
        import shutil
        for ext in ('kicad_dru', 'kicad_pro'):
            if os.path.exists(os.path.join(d, 'board.' + ext)):
                shutil.copy(os.path.join(d, 'board.' + ext), os.path.join(d, 'routed-pre.' + ext))
        board = pcbnew.LoadBoard(pre)
        apply_post(board, zones.get('post'))
        pcbnew.ZONE_FILLER(board).Fill(board.Zones())
        board.Save(routed)
        return finish(d, routed, fab='--no-fab' not in sys.argv)
    if split and 0 < split < zones['w']:
        # stage 1: the mains nets alone, kept out of the control zone (every other pad without
        # its net, so the router leaves it), so the mains wiring stays on its side
        a = pcbnew.LoadBoard(pcb)
        # the mains zone's classes, as export.ts sorts them (Mains and HV): only Mains here left
        # the high-voltage nets to no stage at all (300 connections unrouted on the HF control)
        for pad in a.GetPads():
            if pad.GetNetClassName() not in ('Mains', 'HV'):
                pad.SetNetCode(0)
        keepout(a, split + 1, 0, zones['w'], zones['h'])
        for x0, y0, x1, y1 in zones.get('keep1', []):
            keepout(a, x0, y0, x1, y1)
        a.Save(os.path.join(d, 'stage1.kicad_pcb'))
        a = pcbnew.LoadBoard(os.path.join(d, 'stage1.kicad_pcb'))
        ses1 = freeroute(a, d, 'stage1', passes, apart=False)
        # stage 2: the whole board with the mains tracks locked; the other nets kept out of the
        # mains zone but for the boundary column (relays, transformer connectors), where KiCad's
        # check holds them 3.2 mm from the mains (a class-to-class rule made Freerouting run for
        # more than an hour)
        b = pcbnew.LoadBoard(pcb)
        import_ses(b, ses1, lock=True)
        edge = zones.get('edge') or split
        if edge > 2:
            keepout(b, 0, 0, edge, zones['h'])
        for x0, y0, x1, y1 in zones.get('keep2', []):
            keepout(b, x0, y0, x1, y1)
        b.Save(os.path.join(d, 'stage2.kicad_pcb'))
        b = pcbnew.LoadBoard(os.path.join(d, 'stage2.kicad_pcb'))
        ses = freeroute(b, d, 'stage2', passes, apart=False)
        # stage 2's session leaves out the locked wiring: the mains from stage 1, the rest from 2
        board = pcbnew.LoadBoard(pcb)
        import_ses(board, ses1, lock=True)
        import_ses(board, ses)
    else:
        board = pcbnew.LoadBoard(pcb)
        ses = freeroute(board, d, 'board', passes, apart=True)
        board = pcbnew.LoadBoard(pcb)
        import_ses(board, ses)
    # the high-current bars (D45: tracks of 3 mm and wider): the solder mask opened along them (0.5 mm
    # narrower than the track) for a soldered copper bar
    bars = 0
    for t in board.GetTracks():
        if t.GetClass() == 'PCB_TRACK' and t.GetWidth() >= pcbnew.FromMM(3):
            m = pcbnew.PCB_SHAPE(board)
            m.SetShape(pcbnew.SHAPE_T_SEGMENT)
            m.SetStart(t.GetStart()); m.SetEnd(t.GetEnd())
            m.SetWidth(max(t.GetWidth() - pcbnew.FromMM(0.5), pcbnew.FromMM(1)))
            m.SetLayer(pcbnew.F_Mask if t.GetLayer() == pcbnew.F_Cu else pcbnew.B_Mask)
            board.Add(m); bars += 1
    if bars:
        print(f'solder mask opened on {bars} bar segments', flush=True)
    filler = pcbnew.ZONE_FILLER(board)
    filler.Fill(board.Zones())
    board.Save(routed)
    # the custom rules go with the routed board's project (KiCad looks for <name>.kicad_dru)
    import shutil
    for ext in ('kicad_dru', 'kicad_pro'):
        src = os.path.join(d, 'board.' + ext)
        if os.path.exists(src):
            shutil.copy(src, os.path.join(d, 'routed.' + ext))
    errors, unconnected, kinds = drc(routed, os.path.join(d, 'drc.rpt'))
    if unconnected:
        # stage 3: what the two stages left, with everything routed so far locked and no keepouts;
        # the insulation distance as a class-to-class rule (slow on a whole board, quick for a net)
        print(f'stage 3: {unconnected} connections left', flush=True)
        c = pcbnew.LoadBoard(routed)
        for t in c.GetTracks():
            t.SetLocked(True)
        c.Save(os.path.join(d, 'stage3.kicad_pcb'))
        c = pcbnew.LoadBoard(os.path.join(d, 'stage3.kicad_pcb'))
        ses3 = freeroute(c, d, 'stage3', passes, apart=True)
        board = pcbnew.LoadBoard(routed)
        import_ses(board, ses3)
        # the pours again around stage 3's tracks (filled before them, they would overlap them)
        pcbnew.ZONE_FILLER(board).Fill(board.Zones())
        board.Save(routed)
    import shutil
    shutil.copy(routed, pre)
    if zones.get('post'):
        board = pcbnew.LoadBoard(routed)
        apply_post(board, zones['post'])
        pcbnew.ZONE_FILLER(board).Fill(board.Zones())
        board.Save(routed)
    finish(d, routed)


def finish(d, routed, fab=True):
    import shutil
    for ext in ('kicad_dru', 'kicad_pro'):
        src = os.path.join(d, 'board.' + ext)
        if os.path.exists(src):
            shutil.copy(src, os.path.join(d, 'routed.' + ext))
    errors, unconnected, kinds = drc(routed, os.path.join(d, 'drc.rpt'))
    print(f'DRC: {len(errors)} errors {dict(kinds)}, {unconnected} unconnected', flush=True)
    if not fab:
        json.dump({'drc_errors': len(errors), 'kinds': kinds, 'unconnected': unconnected}, open(os.path.join(d, 'summary.json'), 'w'))
        return
    fab = os.path.join(d, 'fab')
    os.makedirs(fab, exist_ok=True)
    run(['kicad-cli', 'pcb', 'export', 'gerbers', '-o', fab + '/', '--layers', 'F.Cu,B.Cu,F.SilkS,B.SilkS,F.Mask,B.Mask,Edge.Cuts', routed])
    run(['kicad-cli', 'pcb', 'export', 'drill', '-o', fab + '/', '--format', 'excellon', '--generate-map', '--map-format', 'pdf', routed])
    run(['kicad-cli', 'pcb', 'export', 'pos', '-o', os.path.join(fab, 'positions.csv'), '--format', 'csv', '--units', 'mm', routed])
    with zipfile.ZipFile(os.path.join(d, 'fabrication.zip'), 'w', zipfile.ZIP_DEFLATED) as z:
        for f in sorted(os.listdir(fab)):
            z.write(os.path.join(fab, f), f)
    json.dump({'drc_errors': len(errors), 'kinds': kinds, 'unconnected': unconnected, 'errors': [e.split('\n')[0] for e in errors][:50]},
              open(os.path.join(d, 'summary.json'), 'w'), indent=1)


def run_drc(pcb_path, report):
    """One check in a process of its own, started through bash: a check started directly from a
    Python process (subprocess) skipped KiCad 7's copper clearance test, and a second check in one
    process kept the first one's results (a board with 12 clearance errors came back clean, found
    while checking a post-routing track). geo_check is the second opinion that guards against it."""
    import subprocess
    here = os.path.dirname(os.path.abspath(__file__))
    import shlex
    cmd = f"cd {shlex.quote(here)} && python3 route.py --drc-only {shlex.quote(os.path.abspath(pcb_path))} {shlex.quote(os.path.abspath(report))}"
    subprocess.run(['bash', '-c', cmd], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def geo_check(pcb_path, apart_json=None):
    """An independent clearance check, a second opinion to KiCad's: every two copper items of
    different nets (tracks, vias, pads, filled zones; a pad without a net counts as a net of its
    own) on a common layer must be at least the larger of their classes' clearances apart, and an
    insulation class (apart.json) its distance from every other class. KiCad 7's scripted DRC left
    the clearance test out on some boards without a word."""
    import pcbnew
    from collections import defaultdict
    b = pcbnew.LoadBoard(pcb_path)
    apart = {a['cls']: pcbnew.FromMM(a['mm']) for a in (json.load(open(apart_json)) if apart_json and os.path.exists(apart_json) else [])}
    nets = b.GetNetInfo()
    def cls_of(code):
        if code <= 0:
            return 'Default'
        n = nets.GetNetItem(code)
        return n.GetNetClassName() if n else 'Default'
    def clr_of(code):
        if code <= 0:
            return b.GetDesignSettings().m_MinClearance
        n = nets.GetNetItem(code)
        try:
            return n.GetNetClass().GetClearance()
        except Exception:
            return b.GetDesignSettings().m_MinClearance
    layers = [pcbnew.F_Cu, pcbnew.B_Cu]
    items = []  # (layer, key, net code, class, clearance, shape, bbox)
    nc = [0]
    def add(item, code, key, layer, shape):
        bb = shape.BBox()
        items.append((layer, key, code, cls_of(code), clr_of(code), shape, (bb.GetX(), bb.GetY(), bb.GetRight(), bb.GetBottom()), item))
    for t in b.GetTracks():
        for L in layers:
            if t.IsOnLayer(L):
                add(t, t.GetNetCode(), ('n', t.GetNetCode()), L, t.GetEffectiveShape(L))
    for fp in b.GetFootprints():
        for pad in fp.Pads():
            code = pad.GetNetCode()
            key = ('n', code) if code > 0 else ('nc', fp.GetReference(), pad.GetNumber())
            for L in layers:
                if pad.IsOnLayer(L):
                    add(pad, code, key, L, pad.GetEffectiveShape(L))
    zones = []
    for z in b.Zones():
        if z.GetIsRuleArea():
            continue
        for L in layers:
            if z.IsOnLayer(L) and z.HasFilledPolysForLayer(L):
                zones.append((L, z.GetNetCode(), z.GetFilledPolysList(L)))
    # 5 mm grid buckets
    G = pcbnew.FromMM(5)
    grid = defaultdict(list)
    for k, it in enumerate(items):
        x0, y0, x1, y1 = it[6]
        for gx in range(x0 // G, x1 // G + 1):
            for gy in range(y0 // G, y1 // G + 1):
                grid[(it[0], gx, gy)].append(k)
    def need(a, b2):
        c = max(a[4], b2[4])
        if a[3] in apart and b2[3] != a[3]:
            c = max(c, apart[a[3]])
        if b2[3] in apart and a[3] != b2[3]:
            c = max(c, apart[b2[3]])
        return c
    seen, bad = set(), []
    for cell in grid.values():
        for i in range(len(cell)):
            for j in range(i + 1, len(cell)):
                a, b2 = items[cell[i]], items[cell[j]]
                if a[1] == b2[1] or (cell[i], cell[j]) in seen:
                    continue
                seen.add((cell[i], cell[j]))
                c = need(a, b2)
                if a[6][0] - c > b2[6][2] or b2[6][0] - c > a[6][2] or a[6][1] - c > b2[6][3] or b2[6][1] - c > a[6][3]:
                    continue
                if a[5].Collide(b2[5], c - 1):
                    bad.append(f"{pcbnew.LayerName(a[0]) if hasattr(pcbnew, 'LayerName') else a[0]}: {a[7].GetClass()} [{nets.GetNetItem(a[2]).GetNetname() if a[2] > 0 else 'no net'}] / {b2[7].GetClass()} [{nets.GetNetItem(b2[2]).GetNetname() if b2[2] > 0 else 'no net'}] closer than {pcbnew.ToMM(c):.2f} mm")
    # filled zones against the items of other nets: the zone's fill as polygons, each item as
    # segments (a track's centre line widened by half its width, a via's centre, a pad's outline)
    for L, code, polys in zones:
        zb = polys.BBox()
        zc = (L, None, code, cls_of(code), clr_of(code), None, None, None)
        for it in items:
            if it[0] != L or it[2] == code:
                continue
            c = need(zc, it)
            x0, y0, x1, y1 = it[6]
            if x1 < zb.GetX() - c or x0 > zb.GetRight() + c or y1 < zb.GetY() - c or y0 > zb.GetBottom() + c:
                continue
            obj = it[7]; k = obj.GetClass(); hit = False
            if k == 'PCB_TRACK':
                hit = polys.Collide(pcbnew.SEG(obj.GetStart(), obj.GetEnd()), c + obj.GetWidth() // 2 - 1)
            elif k == 'PCB_VIA':
                hit = polys.Collide(obj.GetPosition(), c + obj.GetWidth() // 2 - 1)
            elif k == 'PAD':
                pp = obj.GetEffectivePolygon()
                for o in range(pp.OutlineCount()):
                    ch = pp.COutline(o)
                    for e in range(ch.SegmentCount()):
                        if polys.Collide(ch.CSegment(e), c - 1):
                            hit = True; break
                    if hit:
                        break
            if hit:
                bad.append(f"zone [{nets.GetNetItem(code).GetNetname() if code > 0 else 'no net'}] / {k} [{nets.GetNetItem(it[2]).GetNetname() if it[2] > 0 else 'no net'}] closer than {pcbnew.ToMM(c):.2f} mm")
    return bad


def drc_only(pcb_path, report):
    import pcbnew
    b = pcbnew.LoadBoard(pcb_path)
    pcbnew.WriteDRCReport(b, report, pcbnew.EDA_UNITS_MILLIMETRES, True)


if __name__ == '__main__':
    if sys.argv[1] == '--drc-only':
        drc_only(sys.argv[2], sys.argv[3])
    elif sys.argv[1] == '--geo-check':
        bad = geo_check(sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
        print(json.dumps(bad))
    else:
        main()
