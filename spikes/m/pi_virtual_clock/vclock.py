"""Phase 0 spike — not application code.

Deterministic virtual clock for running unmodified gpiozero scripts (MockFactory) on a PC.

Model: every Python thread started after install() is "managed". Emulated time only advances
when *all* managed threads are blocked in a virtual wait (time.sleep, gpiozero's Event.wait,
signal.pause). The clock then jumps to the earliest pending wake-up (discrete-event simulation).
A thread that polls the clock in a tight loop (busy wait) is charged `poll_tick` of emulated
time per read once it has made `busy_threshold` reads without blocking.
"""
import heapq, itertools, signal, sys, threading, time, types, builtins

_real_Condition, _real_Lock = threading.Condition, threading.Lock


class EmulationEnd(BaseException):
    """Raised inside virtual waits when emulated time reaches the end of the run."""


class _Waiter:
    __slots__ = ("woken",)

    def __init__(self):
        self.woken = False


class VirtualClock:
    def __init__(self, end=None, poll_tick=1e-6, busy_threshold=1000, epoch=1_700_000_000.0):
        self.now = 0.0
        self.end = end
        self.epoch = epoch
        self.poll_tick = poll_tick
        self.busy_threshold = busy_threshold
        self.cv = _real_Condition(_real_Lock())
        self.heap = []
        self.seq = itertools.count()
        self.runnable = 1            # the main thread
        self.ended = False
        self.all_waiters = set()
        self.reads = {}              # thread id -> clock reads since last block
        self.advances = 0

    # ---- core scheduler (call with self.cv held) ----
    def _wake(self, w):
        if not w.woken:
            w.woken = True
            self.runnable += 1

    def _advance(self):
        while self.runnable == 0 and not self.ended:
            while self.heap and self.heap[0][2].woken:
                heapq.heappop(self.heap)
            if not self.heap:            # everyone blocked with no timer: nothing more can happen
                self._finish()
                break
            t, _, w = heapq.heappop(self.heap)
            if self.end is not None and t > self.end:
                self.now = self.end
                self._finish()
                break
            if t > self.now:
                self.now = t
            self.advances += 1
            self._wake(w)
        self.cv.notify_all()

    def _finish(self):
        self.ended = True
        for w in list(self.all_waiters):
            self._wake(w)

    def _block(self, wake_at=None, event=None):
        if self.ended:
            raise EmulationEnd()
        w = _Waiter()
        self.all_waiters.add(w)
        if wake_at is not None:
            heapq.heappush(self.heap, (wake_at, next(self.seq), w))
        if event is not None:
            event._waiters.add(w)
        self.reads[threading.get_ident()] = 0
        self.runnable -= 1
        self._advance()
        while not w.woken:
            self.cv.wait()
        self.all_waiters.discard(w)
        if event is not None:
            event._waiters.discard(w)
        if self.ended:
            raise EmulationEnd()

    # ---- patched primitives ----
    def sleep(self, secs):
        with self.cv:
            self._block(self.now + max(0.0, float(secs)))

    def _read(self):
        with self.cv:
            tid = threading.get_ident()
            n = self.reads.get(tid, 0) + 1
            self.reads[tid] = n
            if n > self.busy_threshold and self.poll_tick:   # busy-wait: charge emulated time
                self.now += self.poll_tick
                while self.heap and self.heap[0][0] <= self.now:
                    self._wake(heapq.heappop(self.heap)[2])
                if self.end is not None and self.now >= self.end:
                    self._finish()
                    raise EmulationEnd()
            return self.now

    def monotonic(self):
        return self._read()

    def time(self):
        return self.epoch + self._read()

    def pause(self):
        with self.cv:
            self._block(None)

    def schedule(self, at, fn):
        """Run fn() at emulated time `at` in a managed stimulus thread."""
        def body():
            self.sleep(at - self.now)
            fn()
        threading.Thread(target=body, daemon=True, name=f"stimulus@{at}").start()


class VEvent:
    """threading.Event replacement whose timed waits follow the virtual clock."""
    clock = None

    def __init__(self):
        self._flag = False
        self._waiters = set()

    def is_set(self):
        return self._flag
    isSet = is_set

    def set(self):
        c = self.clock
        with c.cv:
            self._flag = True
            for w in list(self._waiters):
                c._wake(w)
            self._waiters.clear()
            c.cv.notify_all()

    def clear(self):
        with self.clock.cv:
            self._flag = False

    def wait(self, timeout=None):
        c = self.clock
        with c.cv:
            if self._flag:
                return True
            c._block(None if timeout is None else c.now + max(0.0, timeout), event=self)
            return self._flag


def install(clock):
    """Patch time/signal/threading so that code imported *afterwards* runs on `clock`."""
    VEvent.clock = clock
    time.sleep = clock.sleep
    time.monotonic = clock.monotonic
    time.perf_counter = clock.monotonic
    time.time = clock.time
    time.monotonic_ns = lambda: int(clock.monotonic() * 1e9)
    time.time_ns = lambda: int(clock.time() * 1e9)
    signal.pause = clock.pause

    real_start = threading.Thread.start

    def start(self):
        orig_run = self.run

        def run():
            try:
                orig_run()
            except EmulationEnd:
                pass
            finally:
                with clock.cv:
                    clock.runnable -= 1
                    clock._advance()
        self.run = run
        with clock.cv:
            clock.runnable += 1
        real_start(self)
    threading.Thread.start = start

    # User scripts that do `from threading import Event` get the virtual Event.
    proxy = types.ModuleType("threading")
    proxy.__dict__.update(threading.__dict__)
    proxy.Event = VEvent
    real_import = builtins.__import__

    def _import(name, globals=None, locals=None, fromlist=(), level=0):
        if name == "threading" and globals is not None and \
                globals.get("__name__", "").split(".")[0] in ("__main__", "gpiozero", "user_script"):
            return proxy
        return real_import(name, globals, locals, fromlist, level)
    builtins.__import__ = _import


def install_asyncio(clock):
    """Virtual-time asyncio: the selector never blocks in real time; an idle wait with a
    timeout becomes a virtual sleep (the pattern used by the `looptime` pytest plugin)."""
    import asyncio, selectors

    class VSelector(selectors.DefaultSelector):
        def select(self, timeout=None):
            ready = super().select(0)
            if ready or timeout == 0:
                return ready
            if timeout is None:
                clock.pause()
            else:
                clock.sleep(timeout)
            return super().select(0)

    class VLoop(asyncio.SelectorEventLoop):
        def __init__(self):
            super().__init__(VSelector())

        def time(self):
            return clock.now

    class Policy(asyncio.DefaultEventLoopPolicy):
        def new_event_loop(self):
            return VLoop()
    asyncio.set_event_loop_policy(Policy())


def install_sysfs(clock, models):
    """Overlay selected sysfs/devfs paths (IIO, 1-Wire) with behavioural models.
    `models` maps an absolute path to fn(now) -> str, or raises OSError (e.g. EIO for a
    failed DHT11 read, as the dht11 kernel driver does)."""
    import io, os
    real_open, real_exists, real_listdir = builtins.open, os.path.exists, os.listdir

    def _open(file, mode="r", *a, **k):
        p = os.fspath(file) if not isinstance(file, int) else None
        if p in models and "w" not in mode:
            text = models[p](clock.now)
            return io.BytesIO(text.encode()) if "b" in mode else io.StringIO(text)
        return real_open(file, mode, *a, **k)
    builtins.open = _open
    os.path.exists = lambda p: os.fspath(p) in models or any(
        m.startswith(os.fspath(p).rstrip("/") + "/") for m in models) or real_exists(p)

    def _listdir(p="."):
        pre = os.fspath(p).rstrip("/") + "/"
        names = {m[len(pre):].split("/")[0] for m in models if m.startswith(pre)}
        return sorted(names) if names else real_listdir(p)
    os.listdir = _listdir
