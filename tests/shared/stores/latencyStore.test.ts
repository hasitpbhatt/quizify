import { describe, it, expect, beforeEach } from 'vitest';
import { useLatencyStore } from '@/shared/stores/latencyStore';

describe('latencyStore', () => {
  beforeEach(() => {
    useLatencyStore.setState({
      entries: [],
      callCount: 0,
      rpm: 0,
      visible: false,
      overallStart: null,
    });
  });

  it('starts with default values', () => {
    const s = useLatencyStore.getState();
    expect(s.entries).toEqual([]);
    expect(s.callCount).toBe(0);
    expect(s.visible).toBe(false);
    expect(s.overallStart).toBeNull();
  });

  it('startStage creates an entry', () => {
    useLatencyStore.getState().startStage('fetch', 'Fetching...');
    const s = useLatencyStore.getState();
    expect(s.entries).toHaveLength(1);
    expect(s.entries[0].stage).toBe('fetch');
    expect(s.entries[0].label).toBe('Fetching...');
    expect(s.entries[0].startTime).toBeGreaterThan(0);
    expect(s.entries[0].endTime).toBeUndefined();
  });

  it('startStage updates label for an existing running stage', () => {
    useLatencyStore.getState().startStage('detail', 'Generating (0/2)...');
    useLatencyStore.getState().startStage('detail', 'Generating (1/2)...');
    const s = useLatencyStore.getState();
    expect(s.entries).toHaveLength(1);
    expect(s.entries[0].label).toBe('Generating (1/2)...');
  });

  it('endStage marks the latest entry of that stage with endTime', () => {
    useLatencyStore.getState().startStage('fetch', 'Fetching...');
    useLatencyStore.getState().endStage('fetch');
    const s = useLatencyStore.getState();
    expect(s.entries[0].endTime).toBeGreaterThan(0);
  });

  it('startStage creates separate entries for different stages', () => {
    useLatencyStore.getState().startStage('fetch', 'Fetching...');
    useLatencyStore.getState().endStage('fetch');
    useLatencyStore.getState().startStage('outline', 'Outlining...');
    const s = useLatencyStore.getState();
    expect(s.entries).toHaveLength(2);
    expect(s.entries[0].stage).toBe('fetch');
    expect(s.entries[1].stage).toBe('outline');
  });

  it('endStage is a no-op when stage does not exist', () => {
    useLatencyStore.getState().endStage('nonexistent');
    expect(useLatencyStore.getState().entries).toEqual([]);
  });

  it('reset clears entries, counters, and sets overallStart', () => {
    useLatencyStore.getState().startStage('fetch', 'f');
    useLatencyStore.getState().endStage('fetch');
    useLatencyStore.getState().reset();
    const s = useLatencyStore.getState();
    expect(s.entries).toEqual([]);
    expect(s.callCount).toBe(0);
    expect(s.overallStart).toBeGreaterThan(0);
  });

  it('setVisible toggles visibility', () => {
    useLatencyStore.getState().setVisible(true);
    expect(useLatencyStore.getState().visible).toBe(true);
    useLatencyStore.getState().setVisible(false);
    expect(useLatencyStore.getState().visible).toBe(false);
  });

  it('tick reads callCount and rpm from perf', () => {
    useLatencyStore.getState().tick();
    const s = useLatencyStore.getState();
    expect(typeof s.callCount).toBe('number');
    expect(typeof s.rpm).toBe('number');
  });
});
