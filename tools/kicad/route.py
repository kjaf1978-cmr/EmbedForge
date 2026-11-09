#!/usr/bin/env python3
"""Route a board exported by export.ts and make its fabrication files (decision D43).

    python3 tools/kicad/route.py <dir> [--passes N]

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
    the errors (severity error) by kind and the number of unconnected items."""
    import pcbnew, re
    from collections import Counter
    b = pcbnew.LoadBoard(pcb_path)
    pcbnew.WriteDRCReport(b, report, pcbnew.EDA_UNITS_MILLIMETRES, True)
    text = open(report).read()
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
        run(['xvfb-run', '-a', 'java', '-jar', FREEROUTING, '-de', dsn, '-do', ses, '-mp', passes, '-mt', '1'],
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
    if split and 0 < split < zones['w']:
        # stage 1: the mains nets alone, kept out of the control zone (every other pad without
        # its net, so the router leaves it), so the mains wiring stays on its side
        a = pcbnew.LoadBoard(pcb)
        for pad in a.GetPads():
            if pad.GetNetClassName() != 'Mains':
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
    routed = os.path.join(d, 'routed.kicad_pcb')
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
        board.Save(routed)
        errors, unconnected, kinds = drc(routed, os.path.join(d, 'drc.rpt'))
    print(f'DRC: {len(errors)} errors {dict(kinds)}, {unconnected} unconnected', flush=True)
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


if __name__ == '__main__':
    main()
