#!/usr/bin/env python3
"""Copy a routed board into hardware/<design>/ (decision D43):
    python3 tools/kicad/package.py <design> <routing-dir>
The board, its project and rules under the design's name, the fabrication zip, the copper
render, the assembly drawing, the DRC report and, where the design has a panel, its wiring list."""
import os, shutil, subprocess, sys

def assembly(pcb, out):
    """The board's assembly drawing (PDF, black on white, scaled to fill the page): every part's
    outline with its reference and value (F.Fab), the silkscreen and the board outline; every
    part of these boards sits on the front."""
    code = f"""
import pcbnew, os, shutil
b = pcbnew.LoadBoard({pcb!r})
pc = pcbnew.PLOT_CONTROLLER(b)
po = pc.GetPlotOptions()
d = os.path.dirname({out!r}) or '.'
po.SetOutputDirectory(d)
po.SetAutoScale(True)
po.SetBlackAndWhite(True)
po.SetPlotFrameRef(False)
po.SetPlotValue(True)
po.SetPlotReference(True)
po.SetMirror(False)
po.SetUseAuxOrigin(False)
pc.OpenPlotfile('assembly', pcbnew.PLOT_FORMAT_PDF, 'Assembly drawing')
seq = pcbnew.LSEQ()
for l in (pcbnew.F_Fab, pcbnew.F_SilkS, pcbnew.Edge_Cuts):
    seq.push_back(l)
pc.PlotLayers(seq)
f = pc.GetPlotFileName()
pc.ClosePlot()
shutil.move(f, {out!r})
"""
    subprocess.run([sys.executable, '-c', code], check=True, capture_output=True)


if len(sys.argv) < 3:
    sys.exit('usage: package.py <design> <routing-dir>')
name, src = sys.argv[1], sys.argv[2]
dst = os.path.join(os.path.dirname(__file__), '..', '..', 'hardware', name)
os.makedirs(dst, exist_ok=True)
pairs = [('routed.kicad_pcb', f'{name}.kicad_pcb'), ('board.kicad_pro', f'{name}.kicad_pro'), ('board.kicad_dru', f'{name}.kicad_dru'),
         ('fabrication.zip', f'{name}-fabrication.zip'), ('drc.rpt', f'{name}-drc.rpt'), ('panel.csv', 'panel.csv'), ('bom.csv', f'{name}-bom.csv')]
for a, b in pairs:
    if os.path.exists(os.path.join(src, a)):
        shutil.copy(os.path.join(src, a), os.path.join(dst, b))
pro = os.path.join(dst, f'{name}.kicad_pro')
# read first, then write (opening for writing first emptied the file: every project was 0 bytes)
text = open(pro).read().replace('"board.kicad_pro"', f'"{name}.kicad_pro"')
open(pro, 'w').write(text)
shutil.copy(os.path.join(dst, '..', 'fp-lib-table'), os.path.join(dst, 'fp-lib-table'))
pcb = os.path.join(dst, f'{name}.kicad_pcb')
subprocess.run(['kicad-cli', 'pcb', 'export', 'pdf', '-o', os.path.join(dst, f'{name}-copper.pdf'), '--layers', 'F.Cu,B.Cu,F.SilkS,Edge.Cuts', '--exclude-value', pcb], check=True, capture_output=True)
subprocess.run(['pdftoppm', '-r', '80', '-png', '-singlefile', os.path.join(dst, f'{name}-copper.pdf'), os.path.join(dst, f'{name}-copper')], check=True)
# the assembly drawing: part outlines with reference and value (fabrication layer), silkscreen and outline
assembly(pcb, os.path.join(dst, f'{name}-assembly.pdf'))
# a panel list only if the design has one (an empty file otherwise)
pl = os.path.join(dst, 'panel.csv')
if os.path.exists(pl) and len(open(pl).read().strip().splitlines()) <= 1:
    os.remove(pl)
print('packaged', dst)
