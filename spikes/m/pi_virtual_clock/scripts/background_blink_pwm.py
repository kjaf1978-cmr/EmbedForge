from gpiozero import LED, PWMLED
from signal import pause

LED(22).blink(on_time=0.25, off_time=0.75)
PWMLED(18).pulse(fade_in_time=1, fade_out_time=1)
pause()
