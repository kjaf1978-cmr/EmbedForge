# Typical Pi OS script for the dht11 device-tree overlay (dtoverlay=dht11,gpiopin=4)
import time
BASE = "/sys/bus/iio/devices/iio:device0/"
while True:
    try:
        with open(BASE + "in_temp_input") as f:
            t = int(f.read()) / 1000
        with open(BASE + "in_humidityrelative_input") as f:
            h = int(f.read()) / 1000
        print(f"R {time.monotonic():.1f} T={t} H={h}")
    except OSError as e:
        print(f"R {time.monotonic():.1f} read error {e.errno}")
    time.sleep(2)
