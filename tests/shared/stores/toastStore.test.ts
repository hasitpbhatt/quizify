import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useToastStore } from '@/shared/stores/toastStore';

describe('toastStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useToastStore.setState({ toasts: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with empty toasts', () => {
    expect(useToastStore.getState().toasts).toEqual([]);
  });

  it('adds a toast with default type "info"', () => {
    const id = useToastStore.getState().add('Hello');
    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].message).toBe('Hello');
    expect(toasts[0].type).toBe('info');
    expect(toasts[0].id).toBe(id);
  });

  it('adds a toast with specified type', () => {
    useToastStore.getState().add('Error!', 'error');
    expect(useToastStore.getState().toasts[0].type).toBe('error');
  });

  it('removes a toast by id', () => {
    const id = useToastStore.getState().add('Toast');
    expect(useToastStore.getState().toasts).toHaveLength(1);
    useToastStore.getState().remove(id);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('auto-removes a toast after 4 seconds', () => {
    useToastStore.getState().add('Auto dismiss');
    expect(useToastStore.getState().toasts).toHaveLength(1);
    vi.advanceTimersByTime(4000);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('does not remove other toasts when one is removed', () => {
    const id1 = useToastStore.getState().add('First');
    useToastStore.getState().add('Second');
    useToastStore.getState().remove(id1);
    expect(useToastStore.getState().toasts).toHaveLength(1);
    expect(useToastStore.getState().toasts[0].message).toBe('Second');
  });

  it('handles remove of non-existent id gracefully', () => {
    expect(() => useToastStore.getState().remove('non-existent')).not.toThrow();
  });
});
