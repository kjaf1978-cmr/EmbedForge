// Phase 0 spike: run Pico SDK RP2350 (ARM) firmware on c1570/rp2350js; emulated vs wall time.
import { RP2350 } from './c1570_rp2350js/src';
import { ConsoleLogger, LogLevel } from './c1570_rp2350js/src/utils/logging';
const [image, emuSecondsArg, arch] = process.argv.slice(2);
const emuSeconds = Number(emuSecondsArg ?? 2);
const mcu = new RP2350({ coreArch: (arch ?? 'arm') as any, loadFirmware: undefined } as any);
mcu.logger = new ConsoleLogger(LogLevel.Error);
let uart = '';
mcu.uart[0].onByte = (b: number) => { uart += String.fromCharCode(b); };
const edges: string[] = [];
mcu.gpio[25].addListener((s: number) => edges.push(`${(mcu.clock.nanos / 1e6).toFixed(3)}:${s}`));
(mcu as any).loadFirmware(image);
const target = emuSeconds * 1e9;
const t0 = process.hrtime.bigint();
let steps = 0;
while (mcu.clock.nanos < target) { mcu.step(); steps++; }
const wall = Number(process.hrtime.bigint() - t0) / 1e9;
console.log(JSON.stringify({ image, emuSeconds, wallSeconds: +wall.toFixed(3),
  ratioEmuToReal: +(emuSeconds / wall).toFixed(3), steps, clkSys: (mcu as any).clkSys,
  gpio25Edges: edges.slice(0, 8) }));
console.log('UART head:', JSON.stringify(uart.slice(0, 160)));
