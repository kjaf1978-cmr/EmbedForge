import queue, threading
from gpiozero import LED
led = LED(13); q = queue.Queue()
def worker():
    while True:
        try:
            q.get(timeout=2)
        except queue.Empty:
            led.toggle()
threading.Thread(target=worker, daemon=True).start()
from signal import pause
pause()
