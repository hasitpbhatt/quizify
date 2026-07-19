import { getProviderConfig } from './providers';
import type { LlmProvider } from '@/shared/types';

let tokens = 0;
let maxTokens = 0;
let lastRefill = Date.now();
let currentProvider: LlmProvider | null = null;

function getRpm(provider: LlmProvider): number {
  return getProviderConfig(provider).rpm;
}

function ensureBucket(provider: LlmProvider): void {
  if (currentProvider === provider) return;
  const rpm = getRpm(provider);
  maxTokens = Math.max(1, Math.round(rpm / 6));
  tokens = maxTokens;
  lastRefill = Date.now();
  currentProvider = provider;
}

function refill(): void {
  if (!currentProvider) return;
  const now = Date.now();
  const elapsed = now - lastRefill;
  const rpm = getRpm(currentProvider);
  const gained = Math.floor((elapsed / 60_000) * rpm);
  if (gained > 0) {
    tokens = Math.min(maxTokens, tokens + gained);
    lastRefill = now;
  }
}

export async function acquireToken(provider: LlmProvider): Promise<void> {
  ensureBucket(provider);
  refill();
  if (tokens > 0) {
    tokens--;
  }
}

export function releaseToken(): void {
  // Tokens are time-refilled.  No-op for a pure rate limiter.
}

export function resetRateLimiter(): void {
  tokens = 0;
  maxTokens = 0;
  lastRefill = Date.now();
  currentProvider = null;
}
