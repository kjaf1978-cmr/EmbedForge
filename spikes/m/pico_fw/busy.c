// CPU-bound workload: never sleeps; toggles GPIO25 every 100000 loop iterations.
#include <stdio.h>
#include "pico/stdlib.h"
int main(void) {
  stdio_init_all();
  gpio_init(25); gpio_set_dir(25, GPIO_OUT);
  volatile uint32_t acc = 1;
  for (uint32_t i = 0; ; i++) {
    acc = acc * 1664525u + 1013904223u;
    if ((i % 100000u) == 0) { gpio_xor_mask(1u << 25); }
    if ((i % 1000000u) == 0) printf("i=%lu t=%llu\n", (unsigned long)i, (unsigned long long)time_us_64());
  }
}
