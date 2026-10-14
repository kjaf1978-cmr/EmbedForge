// The board model (UI-10, PCB-01, PCB-07, VER-09): templates, placement geometry, the
// schematic-to-board update, pad nets, copper connectivity and the ratsnest.
import { describe, expect, it } from 'vitest';
import { deck, type Spec } from './deck';
import { boardPads, newBoard, onBoard, place, syncBoard, TEMPLATES, type Board } from '../src/pcb/board';
import { ratsnest, segSegDist } from '../src/pcb/ratsnest';
import { FOOTPRINTS } from '../src/pcb/footprint';
import { fromFiles, toFiles } from '../src/eda/project';

const near = (x: number, want: number, tol = 1e-9) => expect(Math.abs(x - want), `${x} vs ${want}`).toBeLessThanOrEqual(tol);
const divider: Spec[] = [['vdc', { value: '10' }, { '1': 'A', '2': 'GND' }], ['resistor', { value: '1k' }, { '1': 'A', '2': 'OUT' }], ['resistor', { value: '1k' }, { '1': 'OUT', '2': 'GND' }]];

describe('board outlines (PCB-01)', () => {
  it('Raspberry Pi HAT+: 65 × 56.5 mm, four M2.5 holes 58 × 49 mm apart, 3.5 mm from the edges', () => {
    const b = newBoard('rpi-hat');
    expect([b.outline.w, b.outline.h]).toEqual([65, 56.5]);
    const xs = b.outline.holes.map((h) => h.x), ys = b.outline.holes.map((h) => h.y);
    near(Math.max(...xs) - Math.min(...xs), 58); near(Math.max(...ys) - Math.min(...ys), 49);
    near(Math.min(...xs), 3.5); near(Math.min(...ys), 3.5);
  });
  it('Arduino Uno shield: 68.58 × 53.34 mm (2.7 × 2.1 in), holes on the board', () => {
    const b = newBoard('uno-shield');
    expect([b.outline.w, b.outline.h]).toEqual([68.58, 53.34]);
    for (const h of b.outline.holes) { expect(h.x).toBeGreaterThan(0); expect(h.x).toBeLessThan(68.58); expect(h.y).toBeGreaterThan(0); expect(h.y).toBeLessThan(53.34); }
    expect(TEMPLATES.map((t) => t.id)).toEqual(['custom', 'uno-shield', 'mega-shield', 'rpi-hat', 'rpi-phat']);
  });
});

describe('placement geometry', () => {
  it('rotation is counter-clockwise seen from the top; the bottom side mirrors', () => {
    const pl = { ref: 'R1', x: 10, y: 10, rot: 0 as const, side: 'top' as const };
    expect(place(pl, 5, 0)).toEqual([15, 10]);
    expect(place({ ...pl, rot: 90 }, 5, 0)).toEqual([10, 5]);
    expect(place({ ...pl, rot: 180 }, 5, 0)).toEqual([5, 10]);
    expect(place({ ...pl, rot: 270 }, 5, 0)).toEqual([10, 15]);
    expect(place({ ...pl, side: 'bottom' }, 5, 0)).toEqual([5, 10]);
  });
});

describe('schematic to board (PCB-07, VER-09)', () => {
  it('every part with a footprint is added below the outline; power symbols are not; pads take the nets of their pins', () => {
    const { sheet, refs } = deck(divider);
    const { board, added, removed } = syncBoard(sheet, newBoard());
    expect(added.sort()).toEqual([...refs].sort());
    expect(removed).toEqual([]);
    for (const pl of board.parts) expect(pl.y).toBeGreaterThan(board.outline.h);
    const pads = boardPads(sheet, board);
    expect(pads.length).toBe(6);
    const r1 = pads.filter((p) => p.ref === refs[1]).map((p) => [p.pad.id, p.net]);
    expect(r1).toEqual([['1', 'A'], ['2', 'OUT']]);
    expect(pads.filter((p) => p.ref === refs[0]).map((p) => p.net)).toEqual(['A', 'GND']);
  });
  it('a part deleted on the schematic leaves the board; kept parts keep their place', () => {
    const { sheet, refs } = deck(divider);
    let { board } = syncBoard(sheet, newBoard());
    board = { ...board, parts: board.parts.map((p) => (p.ref === refs[1] ? { ...p, x: 20, y: 20 } : p)) };
    const smaller = { ...sheet, parts: sheet.parts.filter((p) => p.ref !== refs[2]) };
    const r = syncBoard(smaller, board);
    expect(r.removed).toEqual([refs[2]]);
    expect(r.board.parts.find((p) => p.ref === refs[1])).toMatchObject({ x: 20, y: 20 });
  });
  it('a logic gate package connects pin 14 to its supply rail and pin 7 to ground', () => {
    const { sheet, refs } = deck([['and2', { value: '+5V' }, { '1': 'A', '2': 'B', '3': 'Y' }]]);
    const { board } = syncBoard(sheet, newBoard());
    const pads = boardPads(sheet, board).filter((p) => p.ref === refs[0]);
    expect(pads.find((p) => p.pad.id === '14')!.net).toBe('+5V');
    expect(pads.find((p) => p.pad.id === '7')!.net).toBe('GND');
    expect(pads.find((p) => p.pad.id === '3')!.net).toBe('Y');
    expect(pads.find((p) => p.pad.id === '4')!.net).toBeNull();
  });
  it('the board is saved with the project (geometry.json, views.pcb)', () => {
    const { sheet } = deck(divider);
    const s = { ...sheet, board: syncBoard(sheet, newBoard('rpi-hat')).board };
    const files = JSON.parse(JSON.stringify(toFiles('B', s)));
    expect(files['geometry.json'].views.pcb.outline.template).toBe('rpi-hat');
    expect(fromFiles(files).sheet.board).toEqual(s.board);
  });
});

describe('ratsnest and copper connectivity', () => {
  const setup = () => {
    const { sheet, refs } = deck(divider);
    let board: Board = syncBoard(sheet, newBoard()).board;
    // put the parts on the board in a column
    board = { ...board, parts: board.parts.map((p, k) => ({ ...p, x: 20, y: 10 + 12 * k })) };
    return { sheet, refs, board };
  };
  it('without tracks every net needs (pads − 1) connections; three nets of two pads: three air wires', () => {
    const { sheet, board } = setup();
    const r = ratsnest(boardPads(sheet, board), board);
    expect(r.airwires.map((a) => a.net).sort()).toEqual(['A', 'GND', 'OUT']);
    expect(r.shorts).toEqual([]);
  });
  it('a track between the two OUT pads completes that net; a track from OUT to A is a short', () => {
    const { sheet, board } = setup();
    const pads = boardPads(sheet, board);
    const out = pads.filter((p) => p.net === 'OUT'), a = pads.filter((p) => p.net === 'A');
    const t = (id: string, net: string, p: typeof pads[number], q: typeof pads[number]) => ({ id, net, layer: 'F' as const, width: 0.5, pts: [[p.x, p.y], [q.x, q.y]] as [number, number][] });
    const routed = { ...board, tracks: [t('t1', 'OUT', out[0], out[1])] };
    expect(ratsnest(pads, routed).airwires.map((x) => x.net).sort()).toEqual(['A', 'GND']);
    const shorted = { ...board, tracks: [t('t2', 'OUT', out[0], a[0])] };
    expect(ratsnest(pads, shorted).shorts.map((s) => s.nets)).toEqual([['A', 'OUT']]);
    // a track on the bottom layer still joins through-hole pads, and a via joins the layers
    const bottom = { ...board, tracks: [{ ...t('t3', 'OUT', out[0], out[1]), layer: 'B' as const }] };
    expect(ratsnest(pads, bottom).airwires.length).toBe(2);
  });
  it('the two pads of a push-button contact are joined inside it: no air wire between them', () => {
    const { sheet } = deck([['vdc', { value: '5' }, { '1': 'A', '2': 'GND' }], ['button', {}, { '1': 'A', '2': 'B' }], ['resistor', { value: '1k' }, { '1': 'B', '2': 'GND' }]]);
    const board = syncBoard(sheet, newBoard()).board;
    const r = ratsnest(boardPads(sheet, board), board);
    // A: V1.+ to the button (one wire), B: the button to R (one wire), GND: V1.− to R
    expect(r.airwires.map((a) => a.net).sort()).toEqual(['A', 'B', 'GND']);
  });
  it('segment distance: crossing segments touch; parallel ones are their gap apart', () => {
    expect(segSegDist([0, 0], [10, 10], [0, 10], [10, 0])).toBe(0);
    near(segSegDist([0, 0], [10, 0], [0, 3], [10, 3]), 3);
    near(segSegDist([0, 0], [10, 0], [12, 0], [20, 0]), 2);
  });
  it('a footprint is on the board when its whole courtyard is inside the outline', () => {
    const b = newBoard();
    const fp = FOOTPRINTS['R_Axial_0207'];
    expect(onBoard({ ref: 'R1', x: 20, y: 20, rot: 0, side: 'top' }, fp, b)).toBe(true);
    expect(onBoard({ ref: 'R1', x: 2, y: 20, rot: 0, side: 'top' }, fp, b)).toBe(false);
    expect(onBoard({ ref: 'R1', x: 20, y: 2, rot: 90, side: 'top' }, fp, b)).toBe(false);
  });
});
