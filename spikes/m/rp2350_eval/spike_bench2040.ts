// Phase 0 spike: RP2040 mode of c1570/rp2350js on the same Pico SDK binaries.
import { RP2040 } from './src';
import { ConsoleLogger, LogLevel } from './src/utils/logging';
const [image, secs] = process.argv.slice(2);
const mcu: any = new (RP2040 as any)();
mcu.logger = new ConsoleLogger(LogLevel.Error);
let uart = ''; mcu.uart[0].onByte = (b: number) => { uart += String.fromCharCode(b); };
const edges: string[] = [];
mcu.gpio[25].addListener((s: number) => edges.push(`${(mcu.clock.nanos/1e6).toFixed(3)}:${s}`));
mcu.loadFirmware(image);
const t0 = process.hrtime.bigint(); const target = Number(secs) * 1e9;
while (mcu.clock.nanos < target) mcu.step();
const wall = Number(process.hrtime.bigint() - t0) / 1e9;
console.log(JSON.stringify({ image, emu: Number(secs), wall: +wall.toFixed(3), ratio: +(Number(secs)/wall).toFixed(3), edges: edges.slice(0, 5) }));
console.log('UART:', JSON.stringify(uart.slice(0, 80)));
