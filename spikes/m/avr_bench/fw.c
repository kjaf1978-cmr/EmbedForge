// Arduino-style ATmega328P workload at 16 MHz: Timer0 1 kHz tick ISR (millis),
// busy-polling loop (like Arduino delay/millis), ADC read, Timer1 PWM on OC1A (PB1),
// LED on PB5 toggled every 500 ms, USART 115200 print.
#include <avr/io.h>
#include <avr/interrupt.h>
#include <stdio.h>
volatile uint32_t ms;
ISR(TIMER0_COMPA_vect) { ms++; }
static int uputc(char c, FILE *f) { while (!(UCSR0A & _BV(UDRE0))); UDR0 = c; return 0; }
static FILE uout = FDEV_SETUP_STREAM(uputc, NULL, _FDEV_SETUP_WRITE);
static uint32_t millis(void) { uint32_t m; cli(); m = ms; sei(); return m; }
int main(void) {
  DDRB = _BV(PB5) | _BV(PB1);
  TCCR0A = _BV(WGM01); OCR0A = 249; TCCR0B = _BV(CS01) | _BV(CS00); TIMSK0 = _BV(OCIE0A); // 1 kHz
  TCCR1A = _BV(COM1A1) | _BV(WGM11); TCCR1B = _BV(WGM13) | _BV(WGM12) | _BV(CS10); ICR1 = 15999; // 1 kHz PWM
  ADMUX = _BV(REFS0); ADCSRA = _BV(ADEN) | 7;
  UBRR0 = 8; UCSR0B = _BV(TXEN0); stdout = &uout;   // ~115200 baud @16MHz
  sei();
  uint32_t next = 0; uint8_t led = 0;
  for (;;) {
    ADCSRA |= _BV(ADSC); while (ADCSRA & _BV(ADSC));
    uint16_t a = ADC;
    OCR1A = (uint32_t)a * 15999 / 1023;
    uint32_t now = millis();
    if (now >= next) {
      next += 500; led ^= 1;
      if (led) PORTB |= _BV(PB5); else PORTB &= ~_BV(PB5);
      printf("t=%lu a=%u\n", now, a);
    }
  }
}
