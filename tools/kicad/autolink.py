#!/usr/bin/env python3
"""Every connection a routed board still lacks, drawn by link.py one after another:
    python3 tools/kicad/autolink.py <routing-dir> [width] [--rounds N]
Reads the unconnected pairs from the board's DRC report (drc.rpt, from route.py --post-only),
finds each path on the grid (link.py: the board before its post copper plus the post copper so
far, so each path avoids the ones before it), adds it to zones.json's post copper, and checks the
whole with route.py --post-only --no-fab; repeats for what is still unconnected (N rounds, default
3). Prints the post copper (JSON) to put into the design. A pair link.py cannot join is skipped
and stays in the report."""
import json, os, re, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
d = os.path.abspath(sys.argv[1])
W = float(sys.argv[2]) if len(sys.argv) > 2 and not sys.argv[2].startswith('--') else 0.3
rounds = int(sys.argv[sys.argv.index('--rounds') + 1]) if '--rounds' in sys.argv else 3
zp = os.path.join(d, 'zones.json')


def drc():
    subprocess.run(['bash', '-c', f'cd {HERE} && python3 route.py "{d}" --post-only --no-fab'], capture_output=True)
    return json.load(open(os.path.join(d, 'summary.json')))


def pairs():
    """The unconnected pairs: (net, (x, y), (x, y)) from drc.rpt."""
    out, cur = [], None
    for line in open(os.path.join(d, 'drc.rpt')):
        if line.startswith('[unconnected_items]'):
            cur = []
            continue
        if cur is not None:
            m = re.match(r'\s+@\(([-\d.]+) mm, ([-\d.]+) mm\): .*\[([^\]]+)\]', line)
            if m:
                cur.append(((float(m.group(1)), float(m.group(2))), m.group(3)))
                if len(cur) == 2:
                    if cur[0][1] == cur[1][1]:
                        out.append((cur[0][1], cur[0][0], cur[1][0]))
                    cur = None
    return out


s = drc()
print('start:', s, flush=True)
for r in range(rounds):
    todo = pairs()
    if not todo:
        break
    done = 0
    for net, a, b in todo:
        res = subprocess.run(['python3', os.path.join(HERE, 'link.py'), d, net, str(a[0]), str(a[1]), str(b[0]), str(b[1]), str(W)], capture_output=True, text=True)
        if res.returncode != 0 or not res.stdout.strip().startswith('{'):
            print('no path:', net, a, b, flush=True)
            continue
        c = json.loads(res.stdout)
        z = json.load(open(zp))
        post = z.get('post') or {}
        post['tracks'] = (post.get('tracks') or []) + c['tracks']
        post['vias'] = (post.get('vias') or []) + c['vias']
        z['post'] = post
        json.dump(z, open(zp, 'w'))
        done += 1
    s = drc()
    print(f'round {r + 1}: {done} of {len(todo)} drawn;', s, flush=True)
    if not done:
        break
print(json.dumps(json.load(open(zp)).get('post')))
