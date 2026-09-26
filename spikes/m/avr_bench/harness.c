// libsimavr harness: attach component models via IRQs, run N emulated seconds, time it.
#include <stdio.h>
#include <stdlib.h>
#include <time.h>
#include "sim_avr.h"
#include "sim_elf.h"
#include "avr_ioport.h"
#include "avr_adc.h"
#include "avr_uart.h"
#include "avr_timer.h"
#include "sim_vcd_file.h"
static avr_t *avr;
static int nedges; static double edges[16];
static void led_cb(avr_irq_t *irq, uint32_t v, void *p) {   // "LED model"
  if (nedges < 16) edges[nedges] = avr->cycle / 16e6 * 1e3; nedges++; }
static int nuart; static char ubuf[256];
static void uart_cb(avr_irq_t *irq, uint32_t v, void *p) { if (nuart < 255) ubuf[nuart] = v; nuart++; }
static int npwm; static uint32_t lastpwm;
static void pwm_cb(avr_irq_t *irq, uint32_t v, void *p) { npwm++; lastpwm = v; }
static void adc_trig(avr_irq_t *irq, uint32_t v, void *p) { // "potentiometer model": 2.5 V on ADC0
  avr_raise_irq(avr_io_getirq(avr, AVR_IOCTL_ADC_GETIRQ, ADC_IRQ_ADC0), 2500); }
int main(int argc, char **argv) {
  elf_firmware_t f = {0};
  double secs = argc > 2 ? atof(argv[2]) : 5; int vcd = argc > 3;
  elf_read_firmware(argv[1], &f);
  avr = avr_make_mcu_by_name("atmega328p"); avr_init(avr);
  f.frequency = 16000000; avr_load_firmware(avr, &f); avr->frequency = 16000000;
  avr_irq_register_notify(avr_io_getirq(avr, AVR_IOCTL_IOPORT_GETIRQ('B'), 5), led_cb, NULL);
  avr_irq_register_notify(avr_io_getirq(avr, AVR_IOCTL_UART_GETIRQ('0'), UART_IRQ_OUTPUT), uart_cb, NULL);
  avr_irq_register_notify(avr_io_getirq(avr, AVR_IOCTL_TIMER_GETIRQ('1'), TIMER_IRQ_OUT_PWM0), pwm_cb, NULL);
  avr_irq_register_notify(avr_io_getirq(avr, AVR_IOCTL_ADC_GETIRQ, ADC_IRQ_OUT_TRIGGER), adc_trig, NULL);
  avr_vcd_t v;
  if (vcd) { avr_vcd_init(avr, "trace.vcd", &v, 1000);
    avr_vcd_add_signal(&v, avr_io_getirq(avr, AVR_IOCTL_IOPORT_GETIRQ('B'), 5), 1, "LED");
    avr_vcd_add_signal(&v, avr_io_getirq(avr, AVR_IOCTL_IOPORT_GETIRQ('B'), 1), 1, "OC1A");
    avr_vcd_start(&v); }
  uint64_t target = (uint64_t)(secs * 16e6);
  struct timespec a, b; clock_gettime(CLOCK_MONOTONIC, &a);
  int st = cpu_Running;
  while (avr->cycle < target && st != cpu_Done && st != cpu_Crashed) st = avr_run(avr);
  clock_gettime(CLOCK_MONOTONIC, &b);
  if (vcd) avr_vcd_stop(&v);
  double wall = (b.tv_sec - a.tv_sec) + (b.tv_nsec - a.tv_nsec) / 1e9;
  printf("{\"emuSeconds\":%.3f,\"wallSeconds\":%.3f,\"ratioEmuToReal\":%.2f,\"emuMHz\":%.1f,\"ledEdges\":%d,\"pwmEvents\":%d,\"lastOCR1A\":%u,\"state\":%d}\n",
    avr->cycle / 16e6, wall, avr->cycle / 16e6 / wall, avr->cycle / wall / 1e6, nedges, npwm, lastpwm, st);
  printf("LED edges ms:"); for (int i = 0; i < 8 && i < nedges; i++) printf(" %.3f", edges[i]); printf("\n");
  ubuf[nuart < 255 ? nuart : 255] = 0; printf("UART(%d bytes) head: %.120s\n", nuart, ubuf);
  return 0;
}
