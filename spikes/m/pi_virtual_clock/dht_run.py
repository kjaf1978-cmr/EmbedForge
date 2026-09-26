import sys, os, errno; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vclock, runpy
c = vclock.VirtualClock(end=12); vclock.install(c)
B = "/sys/bus/iio/devices/iio:device0/"
def temp(now):
    if int(now) % 6 == 4: raise OSError(errno.EIO, "DHT11 checksum/timeout (modelled)")
    return str(int((24.0 + 0.1 * now) * 1000))
vclock.install_sysfs(c, {B + "in_temp_input": temp, B + "in_humidityrelative_input": lambda now: "55000",
                         B + "name": lambda now: "dht11\n"})
try: runpy.run_path(os.path.join(os.path.dirname(__file__), "scripts/dht11_iio.py"), run_name="__main__")
except vclock.EmulationEnd: pass
