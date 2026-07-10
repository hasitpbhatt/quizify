import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockSettingsStore = vi.hoisted(() => ({
  getState: vi.fn(() => ({ apiKey: '', provider: 'default' })),
}));
vi.mock('@/shared/stores/settingsStore', () => ({
  useSettingsStore: mockSettingsStore,
}));

import { ttsManager } from '@/lib/llm/ttsManager';

beforeEach(() => {
  // Reset singleton state between tests by calling stop
  ttsManager.stop();
  ttsManager['state'] = 'idle';
  ttsManager['callbacks'] = {};
  ttsManager['subscriptions'] = [];
  vi.clearAllMocks();
  mockSettingsStore.getState.mockReturnValue({ apiKey: '', provider: 'default' });
});

afterEach(() => {
  ttsManager.stop();
});

describe('state machine', () => {
  it('starts as idle', () => {
    expect(ttsManager.isIdle).toBe(true);
    expect(ttsManager.isPlaying).toBe(false);
    expect(ttsManager.isPaused).toBe(false);
  });

  it('transitions to playing when started with queued items', () => {
    ttsManager.enqueue({ nodeId: 'n1', text: 'hello' });
    ttsManager.start();
    expect(ttsManager.isIdle).toBe(false);
    expect(ttsManager.isPlaying).toBe(true);
  });

  it('does nothing when started with empty queue', () => {
    ttsManager.start();
    expect(ttsManager.isIdle).toBe(true);
    expect(ttsManager.queueLength).toBe(0);
  });

  it('does nothing when started while already playing', () => {
    ttsManager.enqueue({ nodeId: 'n1', text: 'hello' });
    ttsManager.start();
    ttsManager.start();
    expect(ttsManager.isPlaying).toBe(true);
  });
});

describe('pause / resume', () => {
  it('pauses when playing', () => {
    ttsManager.enqueue({ nodeId: 'n1', text: 'hello' });
    ttsManager.start();
    ttsManager.pause();
    expect(ttsManager.isPaused).toBe(true);
    expect(ttsManager.isPlaying).toBe(false);
  });

  it('resumes when paused', () => {
    ttsManager.enqueue({ nodeId: 'n1', text: 'hello' });
    ttsManager.start();
    ttsManager.pause();
    ttsManager.resume();
    expect(ttsManager.isPlaying).toBe(true);
    expect(ttsManager.isPaused).toBe(false);
  });

  it('pause does nothing when not playing', () => {
    ttsManager.pause();
    expect(ttsManager.isPaused).toBe(false);
  });

  it('resume does nothing when not paused', () => {
    ttsManager.resume();
    expect(ttsManager.isPlaying).toBe(false);
  });
});

describe('stop', () => {
  it('clears queue and resets state', () => {
    ttsManager.enqueue({ nodeId: 'n1', text: 'hello' });
    ttsManager.start();
    ttsManager.stop();

    expect(ttsManager.isPlaying).toBe(false);
    expect(ttsManager.isIdle).toBe(false);
    expect(ttsManager.queueLength).toBe(0);
    expect(ttsManager.currentQueueIndex).toBe(-1);
  });

  it('calls onQueueEnd callback', () => {
    const onQueueEnd = vi.fn();
    ttsManager.setCallbacks({ onQueueEnd });
    ttsManager.enqueue({ nodeId: 'n1', text: 'hello' });
    ttsManager.stop();
    expect(onQueueEnd).toHaveBeenCalledOnce();
  });
});

describe('enqueue / clearQueue', () => {
  it('enqueues a single segment', () => {
    ttsManager.enqueue({ nodeId: 'n1', text: 'hello' });
    expect(ttsManager.queueLength).toBe(1);
  });

  it('enqueues multiple segments', () => {
    ttsManager.enqueueMultiple([
      { nodeId: 'n1', text: 'hello' },
      { nodeId: 'n2', text: 'world' },
    ]);
    expect(ttsManager.queueLength).toBe(2);
  });

  it('clears the queue', () => {
    ttsManager.enqueueMultiple([
      { nodeId: 'n1', text: 'hello' },
      { nodeId: 'n2', text: 'world' },
    ]);
    ttsManager.clearQueue();
    expect(ttsManager.queueLength).toBe(0);
  });
});

describe('currentSegmentId', () => {
  it('returns null when queue is empty', () => {
    expect(ttsManager.currentSegmentId).toBeNull();
  });

  it('returns the id of the current segment after start', () => {
    ttsManager.enqueue({ nodeId: 'n1', text: 'hello' });
    ttsManager.start();
    expect(ttsManager.currentSegmentId).toBe('n1');
  });

  it('returns null when index is out of bounds', () => {
    ttsManager['queue'] = [{ nodeId: 'n1', text: 'hello' }];
    ttsManager['currentIdx'] = 5;
    expect(ttsManager.currentSegmentId).toBeNull();
  });
});

describe('subscribe / unsubscribe', () => {
  it('returns a subscription ID', () => {
    const id = ttsManager.subscribe('n1', {});
    expect(id).toBeTruthy();
    expect(typeof id).toBe('string');
  });

  it('calls onSegmentStart when segment starts', () => {
    const onStart = vi.fn();
    ttsManager.subscribe('n1', { onSegmentStart: onStart });
    ttsManager['notifySegmentStart']('n1');
    expect(onStart).toHaveBeenCalledWith('n1');
  });

  it('does not call onSegmentStart for non-matching node', () => {
    const onStart = vi.fn();
    ttsManager.subscribe('n1', { onSegmentStart: onStart });
    ttsManager['notifySegmentStart']('n2');
    expect(onStart).not.toHaveBeenCalled();
  });

  it('calls onCharProgress with nodeId and charIndex', () => {
    const onProgress = vi.fn();
    ttsManager.subscribe('n1', { onCharProgress: onProgress });
    ttsManager['notifyCharProgress']('n1', 5);
    expect(onProgress).toHaveBeenCalledWith('n1', 5);
  });

  it('calls onSegmentEnd when segment ends', () => {
    const onEnd = vi.fn();
    ttsManager.subscribe('n1', { onSegmentEnd: onEnd });
    ttsManager['notifySegmentEnd']('n1');
    expect(onEnd).toHaveBeenCalledWith('n1');
  });

  it('removes subscription on unsubscribe', () => {
    const onStart = vi.fn();
    const id = ttsManager.subscribe('n1', { onSegmentStart: onStart });
    ttsManager.unsubscribe(id);
    ttsManager['notifySegmentStart']('n1');
    expect(onStart).not.toHaveBeenCalled();
  });

  it('calls global callbacks alongside subscriptions', () => {
    const subStart = vi.fn();
    const cbStart = vi.fn();
    ttsManager.subscribe('n1', { onSegmentStart: subStart });
    ttsManager.setCallbacks({ onSegmentStart: cbStart });
    ttsManager['notifySegmentStart']('n1');
    expect(subStart).toHaveBeenCalledWith('n1');
    expect(cbStart).toHaveBeenCalledWith('n1');
  });
});

describe('hasSegment', () => {
  it('returns true when a segment exists for the node', () => {
    ttsManager.enqueue({ nodeId: 'n1', text: 'hello' });
    expect(ttsManager.hasSegment('n1')).toBe(true);
  });

  it('returns false when no segment exists for the node', () => {
    ttsManager.enqueue({ nodeId: 'n1', text: 'hello' });
    expect(ttsManager.hasSegment('n2')).toBe(false);
  });
});

describe('finishSegment', () => {
  it('notifies onSegmentEnd for the given node', () => {
    const onEnd = vi.fn();
    ttsManager.subscribe('n1', { onSegmentEnd: onEnd });
    ttsManager.finishSegment('n1');
    expect(onEnd).toHaveBeenCalledWith('n1');
  });
});

describe('SpeechSynthesis path', () => {
  it('calls SpeechSynthesis when provider is not mistral', async () => {
    mockSettingsStore.getState.mockReturnValue({ apiKey: '', provider: 'nvidia' });

    const speakSpy = vi.spyOn(window.speechSynthesis, 'speak');

    ttsManager.enqueue({ nodeId: 'n1', text: 'hello' });
    ttsManager.start();

    await vi.waitFor(() => {
      expect(speakSpy).toHaveBeenCalled();
    }, { timeout: 2000 });
  });

  it('calls SpeechSynthesis when no api key is set', async () => {
    mockSettingsStore.getState.mockReturnValue({ apiKey: '', provider: 'mistral' });

    const speakSpy = vi.spyOn(window.speechSynthesis, 'speak');

    ttsManager.enqueue({ nodeId: 'n1', text: 'hello' });
    ttsManager.start();

    await vi.waitFor(() => {
      expect(speakSpy).toHaveBeenCalled();
    }, { timeout: 2000 });
  });
});

describe('skip', () => {
  it('advances to next segment and notifies end of current', () => {
    const onEnd = vi.fn();
    const onQueueEnd = vi.fn();

    ttsManager.subscribe('n1', { onSegmentEnd: onEnd });
    ttsManager.setCallbacks({ onQueueEnd });

    ttsManager.enqueueMultiple([
      { nodeId: 'n1', text: 'hello' },
      { nodeId: 'n2', text: 'world' },
    ]);
    ttsManager.start();

    expect(ttsManager.currentSegmentId).toBe('n1');

    ttsManager.skip();

    expect(onEnd).toHaveBeenCalledWith('n1');
  });

  it('triggers queue end when skipping past last segment', () => {
    const onQueueEnd = vi.fn();
    ttsManager.setCallbacks({ onQueueEnd });

    ttsManager.enqueue({ nodeId: 'n1', text: 'hello' });
    ttsManager.start();

    ttsManager.skip();

    expect(onQueueEnd).toHaveBeenCalled();
  });
});

describe('setCallbacks', () => {
  it('merges with existing callbacks', () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();

    ttsManager.setCallbacks({ onSegmentStart: cb1 });
    ttsManager.setCallbacks({ onQueueEnd: cb2 });

    ttsManager['notifySegmentStart']('n1');
    expect(cb1).toHaveBeenCalled();

    ttsManager['callbacks'].onQueueEnd?.();
    expect(cb2).toHaveBeenCalled();
  });
});
