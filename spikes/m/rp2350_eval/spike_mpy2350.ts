// Phase 0 spike: MicroPython RP2350 (ARM) on rp2350js via USB CDC.
import { RP2350 } from './src';
import { USBCDC } from './src/usb/cdc';
import { ConsoleLogger, LogLevel } from './src/utils/logging';
import fs from 'fs';
const mcu = new RP2350({ coreArch: 'arm' } as any);
mcu.logger = new ConsoleLogger(LogLevel.Error);
(mcu as any).loadFirmware(process.argv[2]);
const script = fs.readFileSync(process.argv[3], 'utf8');
const cdc = new USBCDC(mcu.usbCtrl);
let out = '', sent = false, tStart = 0n, emuStart = 0;
const edges: string[] = [];
mcu.gpio[25].addListener((s: number) => edges.push(`${(mcu.clock.nanos/1e6).toFixed(2)}:${s}`));
cdc.onDeviceConnected = () => { cdc.sendSerialByte(13); };
cdc.onSerialData = (v: Uint8Array, len: number) => { out += Buffer.from(v.subarray(0, len ?? v.length)).toString('latin1'); };
const t0 = process.hrtime.bigint();
while (mcu.clock.nanos < 60e9) {
  for (let i = 0; i < 100000; i++) mcu.step();
  if (!sent && out.includes('>>> ')) { sent = true; tStart = process.hrtime.bigint(); emuStart = mcu.clock.nanos;
    for (const b of Buffer.from('\x05' + script + '\x04')) cdc.sendSerialByte(b); }
  if (sent && /^SCRIPT-DONE\r?$/m.test(out)) break;
  if (Number(process.hrtime.bigint() - t0) / 1e9 > 240) { console.log('TIMEOUT; output tail:', JSON.stringify(out.slice(-300))); break; }
}
const wall = Number(process.hrtime.bigint() - tStart) / 1e9, emu = (mcu.clock.nanos - emuStart) / 1e9;
console.log(JSON.stringify({ sent, bootEmuMs: +(emuStart/1e6).toFixed(1), scriptEmuS: +emu.toFixed(3), scriptWallS: +wall.toFixed(3), ratio: +(emu/wall).toFixed(3) }));
console.log('LED edges:', edges.slice(-6).join(' '));
console.log(out.split('\n').filter(l => /^R |Error|Traceback/.test(l)).join('\n'));
