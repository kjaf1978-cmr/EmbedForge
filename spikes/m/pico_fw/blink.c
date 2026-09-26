// Arduino-style workload: blink LED every 500 ms, PWM fade, ADC read, UART print.
#include <stdio.h>
#include "pico/stdlib.h"
#include "hardware/adc.h"
#include "hardware/pwm.h"
int main(void) {
  stdio_init_all();
  gpio_init(25); gpio_set_dir(25, GPIO_OUT);
  gpio_set_function(15, GPIO_FUNC_PWM);
  uint sl = pwm_gpio_to_slice_num(15);
  pwm_set_wrap(sl, 999); pwm_set_enabled(sl, true);
  adc_init(); adc_gpio_init(26); adc_select_input(0);
  for (int i = 0; ; i++) {
    gpio_put(25, i & 1);
    uint16_t a = adc_read();
    pwm_set_gpio_level(15, (i * 100) % 1000);
    printf("t=%llu a=%u\n", (unsigned long long)time_us_64(), a);
    sleep_ms(500);
  }
}
