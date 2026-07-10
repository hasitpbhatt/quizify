import { describe, it, expect } from 'vitest';
import { useNotebookStore } from '@/shared/stores/notebookStore';

describe('notebookStore', () => {
  beforeEach(() => {
    useNotebookStore.setState({
      notebookMode: false,
      ttsPlaying: false,
      ttsPaused: false,
      currentSegmentNodeId: null,
      segmentIndex: 0,
      totalSegments: 0,
    });
  });

  it('starts with notebookMode off', () => {
    expect(useNotebookStore.getState().notebookMode).toBe(false);
  });

  it('setNotebookMode(true) enables notebook mode', () => {
    useNotebookStore.getState().setNotebookMode(true);
    expect(useNotebookStore.getState().notebookMode).toBe(true);
  });

  it('toggleNotebookMode flips the mode', () => {
    useNotebookStore.getState().toggleNotebookMode();
    expect(useNotebookStore.getState().notebookMode).toBe(true);
    useNotebookStore.getState().toggleNotebookMode();
    expect(useNotebookStore.getState().notebookMode).toBe(false);
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
