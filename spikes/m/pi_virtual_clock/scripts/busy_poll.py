import time
from gpiozero import LED

led = LED(5)
t0 = time.monotonic()
while time.monotonic() - t0 < 3:
    pass
led.on()
while True:
    time.sleep(1)
