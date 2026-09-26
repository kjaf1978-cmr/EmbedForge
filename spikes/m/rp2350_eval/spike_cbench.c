// Phase 0 spike: cts2c-transpiled rp2350js (C) throughput on the same Pico SDK binaries.
#include "build/transpile/rp2350js-c.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
static int nuart; static void on_uart(void* c, int32_t v) { (void)c; nuart++; }
int main(int argc, char** argv) {
  double secs = atof(argv[3]); int64_t target = (int64_t)(secs * 125e6);
  struct timespec a, b; int64_t cyc = 0;
  if (!strcmp(argv[1], "rp2040")) {
    RP2040Options o = {.loadFirmware = argv[2]}; RP2040* m = RP2040_new(&o);
    m->uart[0]->onByte_fn = on_uart;
    clock_gettime(CLOCK_MONOTONIC, &a);
    while ((cyc = (uint32_t)RP2040_cycles_get(m)) < target) RP2040_step(m);   // 32-bit counter: keep secs < 34
  } else {
    RP2350Options o = {.coreArch = "arm", .loadFirmware = argv[2]}; RP2350* m = RP2350_new(&o);
    m->uart[0]->onByte_fn = on_uart;
    clock_gettime(CLOCK_MONOTONIC, &a);
    while ((cyc = RP2350_cycles_get(m)) < target) RP2350_step(m);
  }
  clock_gettime(CLOCK_MONOTONIC, &b);
  double wall = (b.tv_sec - a.tv_sec) + (b.tv_nsec - a.tv_nsec) / 1e9;
  printf("{\"chip\":\"%s\",\"emu_s@125MHz\":%.3f,\"wall\":%.3f,\"ratio\":%.3f,\"uartBytes\":%d}\n", argv[1], cyc / 125e6, wall, cyc / 125e6 / wall, nuart);
}
