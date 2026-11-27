// Long simulations run synchronously in the test worker; while one runs, the worker cannot answer
// vitest's progress calls, which then time out ("Timeout calling onTaskUpdate") and fail the run
// although every test passed. A short pause before and after each test lets those calls through.
import { afterEach, beforeEach } from 'vitest';

const pause = () => new Promise<void>((r) => setTimeout(r, 20));
beforeEach(pause);
afterEach(pause);
