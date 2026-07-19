const isDev = typeof process !== 'undefined' && process.env.NODE_ENV !== 'production';

let callCount = 0;
let lastReset = Date.now();

export function resetCallCounter(): void {
  callCount = 0;
  lastReset = Date.now();
}

export function countCall(): void {
  callCount++;
}

export function getCallCount(): number {
  return callCount;
}

export function getCallsPerMinute(): number {
  const elapsed = (Date.now() - lastReset) / 1000 / 60;
  return elapsed > 0 ? Math.round(callCount / elapsed) : 0;
}

export function logPerf(label: string, elapsedMs?: number): void {
  if (!isDev) return;
  const msg = elapsedMs !== undefined
    ? `[perf] ${label}: ${elapsedMs}ms`
    : `[perf] ${label}`;
  console.log(msg);
}

const marks: Record<string, number> = {};

export function startMark(key: string): void {
  marks[key] = performance.now();
}

export function endMark(key: string): number {
  const start = marks[key];
  if (start === undefined) return 0;
  const elapsed = performance.now() - start;
  logPerf(key, Math.round(elapsed));
  delete marks[key];
  return elapsed;
}

export async function time<T>(label: string, fn: () => Promise<T>): Promise<T> {
  startMark(label);
  try {
    return await fn();
  } finally {
    endMark(label);
  }
}
