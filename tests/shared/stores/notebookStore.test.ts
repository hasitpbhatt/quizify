import { describe, it, expect } from 'vitest';
import { useNotebookStore } from '@/shared/stores/notebookStore';

describe('notebookStore', () => {
  beforeEach(() => {
    useNotebookStore.setState({
      notebookMode: true,
      ttsPlaying: false,
      ttsPaused: false,
      currentSegmentNodeId: null,
      segmentIndex: 0,
      totalSegments: 0,
      completedTypingNodeIds: {},
    });
  });

  it('starts with notebookMode on by default (notebook is the primary surface)', () => {
    expect(useNotebookStore.getState().notebookMode).toBe(true);
  });

  it('syncTtsState maps playing state', () => {
    useNotebookStore.getState().syncTtsState('playing');
    const state = useNotebookStore.getState();
    expect(state.ttsPlaying).toBe(true);
    expect(state.ttsPaused).toBe(false);
  });

  it('syncTtsState maps paused state', () => {
    useNotebookStore.getState().syncTtsState('paused');
    const state = useNotebookStore.getState();
    expect(state.ttsPlaying).toBe(false);
    expect(state.ttsPaused).toBe(true);
  });

  it('syncTtsState maps idle/stopped state', () => {
    useNotebookStore.getState().syncTtsState('idle');
    const state = useNotebookStore.getState();
    expect(state.ttsPlaying).toBe(false);
    expect(state.ttsPaused).toBe(false);
  });

  it('setCurrentSegment sets nodeId, index, and total', () => {
    useNotebookStore.getState().setCurrentSegment('node-1', 2, 5);
    const state = useNotebookStore.getState();
    expect(state.currentSegmentNodeId).toBe('node-1');
    expect(state.segmentIndex).toBe(2);
    expect(state.totalSegments).toBe(5);
  });

  it('setCurrentSegment defaults index and total when omitted', () => {
    useNotebookStore.getState().setCurrentSegment('node-2');
    const state = useNotebookStore.getState();
    expect(state.currentSegmentNodeId).toBe('node-2');
    expect(state.segmentIndex).toBe(0);
    expect(state.totalSegments).toBe(0);
  });
});

describe('notebookStore — typing completion cache', () => {
  beforeEach(() => {
    useNotebookStore.setState({ completedTypingNodeIds: {} });
  });

  it('completedTypingNodeIds starts empty', () => {
    expect(useNotebookStore.getState().completedTypingNodeIds).toEqual({});
  });

  it('hasTypingCompleted returns false for an unknown node', () => {
    expect(useNotebookStore.getState().hasTypingCompleted('node-x')).toBe(false);
  });

  it('markTypingComplete records the node as completed', () => {
    useNotebookStore.getState().markTypingComplete('n1');
    expect(useNotebookStore.getState().hasTypingCompleted('n1')).toBe(true);
    expect(useNotebookStore.getState().completedTypingNodeIds.n1).toBe(true);
  });

  it('markTypingComplete does not affect other nodes', () => {
    useNotebookStore.getState().markTypingComplete('n1');
    useNotebookStore.getState().markTypingComplete('n2');
    expect(useNotebookStore.getState().hasTypingCompleted('n1')).toBe(true);
    expect(useNotebookStore.getState().hasTypingCompleted('n2')).toBe(true);
    expect(useNotebookStore.getState().hasTypingCompleted('n3')).toBe(false);
  });

  it('markTypingComplete is idempotent — second call is a no-op set', () => {
    useNotebookStore.getState().markTypingComplete('n1');
    const afterFirst = useNotebookStore.getState().completedTypingNodeIds;

    // Calling mark again should not produce a new object (state stays referentially stable).
    useNotebookStore.getState().markTypingComplete('n1');
    const afterSecond = useNotebookStore.getState().completedTypingNodeIds;

    expect(afterSecond).toBe(afterFirst);
    expect(useNotebookStore.getState().hasTypingCompleted('n1')).toBe(true);
  });

  it('markTypingComplete twice in a row does not throw and remains complete', () => {
    expect(() => {
      useNotebookStore.getState().markTypingComplete('n1');
      useNotebookStore.getState().markTypingComplete('n1');
    }).not.toThrow();
    expect(useNotebookStore.getState().hasTypingCompleted('n1')).toBe(true);
  });
});
