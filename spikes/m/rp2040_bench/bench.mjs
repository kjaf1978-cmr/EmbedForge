// Phase 0 spike: run a Pico SDK binary on rp2040js, measure emulated vs wall time.
import fs from 'fs';
import { Simulator, GPIOPinState, ConsoleLogger, LogLevel } from 'rp2040js';
import { bootromB1 } from './bootrom.mjs';

const [,, image, emuSecondsArg] = process.argv;
const emuSeconds = Number(emuSecondsArg ?? 5);
const sim = new Simulator();
const clock = sim.clock;
const mcu = sim.rp2040;
mcu.logger = new ConsoleLogger(LogLevel.Error);
mcu.loadBootrom(bootromB1);
mcu.flash.set(fs.readFileSync(image), 0);
mcu.adc.channelValues[0] = 2048;
let uart = '';
mcu.uart[0].onByte = (b) => { uart += String.fromCharCode(b); };
const edges = [];
mcu.gpio[25].addListener((s) => edges.push([clock.nanos / 1e6, s === GPIOPinState.High ? 1 : 0]));
mcu.core.PC = 0x10000000;

const cycleNanos = 1e9 / 125e6;
let instr = 0, skippedNanos = 0;
const target = emuSeconds * 1e9;
const t0 = process.hrtime.bigint();
while (clock.nanos < target) {
  if (mcu.core.waiting) {
    const d = clock.nanosToNextAlarm; skippedNanos += d; clock.tick(d);
  } else {
    const c = mcu.core.executeInstruction(); instr++; clock.tick(c * cycleNanos);
  }
}
const wall = Number(process.hrtime.bigint() - t0) / 1e9;
console.log(JSON.stringify({ image, emuSeconds, wallSeconds: +wall.toFixed(3),
  ratioEmuToReal: +(emuSeconds / wall).toFixed(3),
  instructions: instr, MIPS: +(instr / wall / 1e6).toFixed(2),
  fractionTimeSleeping: +(skippedNanos / target).toFixed(3),
  gpio25FirstEdgesMs: edges.slice(0, 8).map(([t, s]) => `${t.toFixed(3)}:${s}`) }));
console.log('UART head:', JSON.stringify(uart.slice(0, 200)));
