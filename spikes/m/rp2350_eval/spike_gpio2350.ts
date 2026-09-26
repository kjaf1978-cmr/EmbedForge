import { RP2350 } from './src';
import { ConsoleLogger, LogLevel } from './src/utils/logging';
const mcu = new RP2350({ coreArch: 'arm' } as any);
mcu.logger = new ConsoleLogger(LogLevel.Error);
(mcu as any).loadFirmware(process.argv[2]);
let last = -1; const ev: string[] = [];
const sio: any = (mcu as any).sio;
while (mcu.clock.nanos < 1.6e9) {
  for (let i = 0; i < 1000; i++) mcu.step();
  const v = (sio.gpioValue >>> 25) & 1;
  if (v !== last) { ev.push(`${(mcu.clock.nanos/1e6).toFixed(1)}ms:out=${v} oe=${(sio.gpioOutputEnable>>>25)&1} pinState=${mcu.gpio[25].value}`); last = v; }
}
console.log(ev.slice(0, 8).join('\n'));
