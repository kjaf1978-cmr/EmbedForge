// Phase 0 spike: run Pico SDK RP2350-ARM blink/busy on picoem rp2350-emu; poll GPIO25.
use rp2350_emu::{Config, Emulator};
use std::time::Instant;
fn main() {
    let a: Vec<String> = std::env::args().collect();
    let fw = std::fs::read(&a[1]).unwrap();
    let secs: f64 = a.get(2).map(|s| s.parse().unwrap()).unwrap_or(1.0);
    let mut emu = Emulator::new(Config::default());
    let rom = std::fs::read("../0x4D44_picoem/roms/rp2350/bootrom-combined.bin").unwrap();
    emu.load_bootrom(&rom);
    emu.load_flash(&fw);
    emu.reset();
    emu.core_mut(1).halt();
    let hz = 150e6; let target = (secs * hz) as u64;
    let t0 = Instant::now(); let mut last = 2u8; let mut edges = vec![];
    while emu.cycles() < target {
        if let Err(e) = emu.run(10_000) { println!("error: {:?} at cycle {}", e, emu.cycles()); break; }
        let v = ((emu.peek(0xd000_0010) >> 25) & 1) as u8;
        if v != last { edges.push(format!("{:.3}ms:{}", emu.cycles() as f64 / hz * 1e3, v)); last = v; }
    }
    let wall = t0.elapsed().as_secs_f64();
    println!("{{\"emuSeconds@150MHz\":{:.3},\"wall\":{:.3},\"ratio\":{:.3},\"MHz\":{:.1},\"pc\":\"{:#x}\"}}",
        emu.cycles() as f64 / hz, wall, emu.cycles() as f64 / hz / wall, emu.cycles() as f64 / wall / 1e6, emu.core(0).regs.pc());
    println!("sys_clk_hz={} pc0 samples", emu.bus.sys_clk_hz());
    println!("gpio25 edges: {:?}", &edges[..edges.len().min(8)]);
}
