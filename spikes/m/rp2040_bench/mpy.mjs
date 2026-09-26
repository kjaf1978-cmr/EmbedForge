// Phase 0 spike: MicroPython (built from v1.26.1 source) on rp2040js via USB CDC.
// Sends a user-style script in paste mode; measures emulated vs wall time.
import fs from 'fs';
import { Simulator, USBCDC, GPIOPinState, ConsoleLogger, LogLevel } from 'rp2040js';
import { bootromB1 } from './bootrom.mjs';
const sim = new Simulator(); const mcu = sim.rp2040; const clock = sim.clock;
mcu.logger = new ConsoleLogger(LogLevel.Error);
mcu.loadBootrom(bootromB1);
mcu.flash.set(fs.readFileSync(process.argv[2]), 0);
mcu.core.PC = 0x10000000;
const script = fs.readFileSync(process.argv[3], 'utf8');
const cdc = new USBCDC(mcu.usbCtrl);
let out = '', sent = false, tStart = 0, emuStart = 0;
const edges = [];
mcu.gpio[25].addListener((s) => edges.push(`${(clock.nanos/1e6).toFixed(2)}:${s===GPIOPinState.High?1:0}`));
cdc.onDeviceConnected = () => { cdc.sendSerialByte(13); };
cdc.onSerialData = (v) => { out += Buffer.from(v).toString('latin1'); };
const cycleNanos = 8; const t0 = process.hrtime.bigint();
let instr = 0;
while (clock.nanos < 120e9) {
  for (let i = 0; i < 100000; i++) {
    if (mcu.core.waiting) clock.tick(clock.nanosToNextAlarm);
    else { clock.tick(mcu.core.executeInstruction() * cycleNanos); instr++; }
  }
  if (!sent && out.includes('>>> ')) {
    sent = true; tStart = process.hrtime.bigint(); emuStart = clock.nanos;
    for (const b of Buffer.from('\x05' + script + '\x04')) cdc.sendSerialByte(b);
  }
  if (sent && /^SCRIPT-DONE\r?$/m.test(out)) break;
}
const t1 = process.hrtime.bigint();
const wall = Number(t1 - tStart) / 1e9, emu = (clock.nanos - emuStart) / 1e9;
console.log(JSON.stringify({ bootEmuMs: +(emuStart/1e6).toFixed(1), bootWallS: +(Number(tStart - t0)/1e9).toFixed(2),
  scriptEmuS: +emu.toFixed(3), scriptWallS: +wall.toFixed(3), ratio: +(emu / wall).toFixed(3) }));
console.log('LED edges(ms):', edges.slice(-6).join(' '));
console.log(out.split('\n').filter(l => /^R /.test(l)).join('\n'));
