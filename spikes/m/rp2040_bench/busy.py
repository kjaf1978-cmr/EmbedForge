import time
t0 = time.ticks_us(); n = 0
while time.ticks_diff(time.ticks_us(), t0) < 2000000:
    n += 1
print('R busy iterations_in_2s_emulated', n)
print('SCRIPT-DONE')
