from machine import Pin, ADC, PWM
import time
led = Pin(25, Pin.OUT); pwm = PWM(Pin(15)); pwm.freq(1000); adc = ADC(26)
t0 = time.ticks_ms()
for i in range(10):
    led.toggle(); pwm.duty_u16(i * 6000); a = adc.read_u16()
    time.sleep_ms(500)
print('R blink elapsed_ms', time.ticks_diff(time.ticks_ms(), t0), 'adc', a)
print('SCRIPT-DONE')
