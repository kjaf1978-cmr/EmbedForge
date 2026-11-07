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


def import_ses(board, ses_path):
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
                    board.Add(t); tracks += 1
            elif item[0] == 'via':
                m = re.search(r'_(\d+):(\d+)_um', item[1])
                v = pcbnew.PCB_VIA(board)
                v.SetPosition(pcbnew.VECTOR2I(nm(item[2]), -nm(item[3])))
                v.SetWidth(int(m.group(1)) * 1000 if m else 800000); v.SetDrill(int(m.group(2)) * 1000 if m else 400000)
                v.SetLayerPair(pcbnew.F_Cu, pcbnew.B_Cu)
                if ni: v.SetNet(ni)
                board.Add(v); vias += 1
    print(f'imported {tracks} track segments, {vias} vias', flush=True)


def main():
    d = os.path.abspath(sys.argv[1])
    passes = sys.argv[sys.argv.index('--passes') + 1] if '--passes' in sys.argv else '20'
    import pcbnew
    pcb = os.path.join(d, 'board.kicad_pcb')
    board = pcbnew.LoadBoard(pcb)
    dsn, ses = os.path.join(d, 'board.dsn'), os.path.join(d, 'board.ses')
    if not pcbnew.ExportSpecctraDSN(board, dsn):
        sys.exit('DSN export failed')
    if '--reuse' in sys.argv and os.path.exists(ses):
        pass
    else:
      if os.path.exists(ses):
        os.remove(ses)
      run(['xvfb-run', '-a', 'java', '-jar', FREEROUTING, '-de', dsn, '-do', ses, '-mp', passes, '-mt', '1'],
        stdout=open(os.path.join(d, 'freerouting.log'), 'w'), stderr=subprocess.STDOUT)
    if not os.path.exists(ses):
        sys.exit('Freerouting wrote no session file (see freerouting.log)')
    board = pcbnew.LoadBoard(pcb)
    import_ses(board, ses)
    filler = pcbnew.ZONE_FILLER(board)
    filler.Fill(board.Zones())
    routed = os.path.join(d, 'routed.kicad_pcb')
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
