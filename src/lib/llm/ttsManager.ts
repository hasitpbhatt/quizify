import { debugLog } from '@/lib/debug';

export interface TtsSegment {
  nodeId: string;
  text: string;
}

export interface TtsCallbacks {
  onSegmentStart?: (nodeId: string) => void;
  onCharProgress?: (nodeId: string, charIndex: number, text?: string) => void;
  onSegmentEnd?: (nodeId: string) => void;
  onQueueEnd?: () => void;
}

export type TtsState = 'idle' | 'playing' | 'paused' | 'stopped';

interface TtsSubscription {
  id: string;
  nodeId: string;
  onSegmentStart?: (nodeId: string) => void;
  onCharProgress?: (nodeId: string, charIndex: number, text?: string) => void;
  onSegmentEnd?: (nodeId: string) => void;
}

class TtsManagerSingleton {
  private queue: TtsSegment[] = [];
  private currentIdx = -1;
  private state: TtsState = 'idle';

  private callbacks: TtsCallbacks = {};
  private subscriptions: TtsSubscription[] = [];

  private charCount = 0;
  private utterance: SpeechSynthesisUtterance | null = null;
  private currentText: string = '';
  /** Speech rate (0.5–2) applied to each utterance. */
  private rate = 1;

  /** Feature-detect speechSynthesis at construction time */
  readonly speechSynthesisAvailable: boolean;

  /** Tracks segments that have already ended, for idempotent finishSegment */
  private endedSegments: Set<string>;
  private stateListeners: Array<(state: TtsState) => void>;

  constructor() {
    this.speechSynthesisAvailable = typeof window !== 'undefined' && 'speechSynthesis' in window;
    this.endedSegments = new Set();
    this.stateListeners = [];
  }

  // ==================== Public API ====================

  enqueue(segment: TtsSegment): void {
    this.queue.push(segment);
    debugLog('log', 'tts', 'enqueue 1 segment queue=%d node=%s', this.queue.length, segment.nodeId);
  }

  enqueueMultiple(segments: TtsSegment[]): void {
    this.queue.push(...segments);
    debugLog('log', 'tts', 'enqueue %d segments queue=%d', segments.length, this.queue.length);
  }

  clearQueue(): void {
    this.queue = [];
    this.endedSegments.clear();
    this.currentText = '';
  }

  start(): void {
    if (this.queue.length === 0 || this.state === 'playing') return;
    this.currentIdx = -1;
    debugLog('log', 'tts', 'start queue=%d', this.queue.length);
    this.playNext();
  }

  pause(): void {
    if (this.state !== 'playing') return;
    debugLog('log', 'tts', 'state playing → paused');
    if (this.speechSynthesisAvailable && window.speechSynthesis.speaking) {
      window.speechSynthesis.pause();
    }
    this.state = 'paused';
    this.notifyStateListeners();
  }

  resume(): void {
    if (this.state !== 'paused') return;
    debugLog('log', 'tts', 'state paused → playing');
    if (this.speechSynthesisAvailable && window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
    this.state = 'playing';
    this.notifyStateListeners();
  }

  stop(): void {
    debugLog('log', 'tts', 'state %s → stopped', this.state);
    this.cleanup();
    this.state = 'stopped';
    this.notifyStateListeners();
    this.currentIdx = -1;
    this.queue = [];
    this.endedSegments.clear();
    this.callbacks.onQueueEnd?.();
  }

  skip(): void {
    const current = this.queue[this.currentIdx];
    debugLog('log', 'tts', 'skip idx=%d', this.currentIdx);
    this.cleanup();
    if (current) {
      this.notifySegmentEnd(current.nodeId);
    }
    this.playNext();
  }

  get currentSegmentId(): string | null {
    return this.currentIdx >= 0 && this.currentIdx < this.queue.length
      ? this.queue[this.currentIdx].nodeId
      : null;
  }

  get currentQueueIndex(): number {
    return this.currentIdx;
  }

  get queueLength(): number {
    return this.queue.length;
  }

  get isPlaying(): boolean {
    return this.state === 'playing';
  }

  get isPaused(): boolean {
    return this.state === 'paused';
  }

  get isIdle(): boolean {
    return this.state === 'idle';
  }

  setCallbacks(cb: Partial<TtsCallbacks>): void {
    this.callbacks = { ...this.callbacks, ...cb };
  }

  /** Set the narration speech rate (clamped to a sane 0.5–2 range). */
  setRate(rate: number): void {
    this.rate = Math.min(2, Math.max(0.5, rate));
  }

  subscribe(
    nodeId: string,
    cb: {
      onSegmentStart?: (nodeId: string) => void;
      onCharProgress?: (nodeId: string, charIndex: number) => void;
      onSegmentEnd?: (nodeId: string) => void;
    },
  ): string {
    const id =
      crypto.randomUUID?.() ??
      nodeId + '-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    this.subscriptions.push({ id, nodeId, ...cb });
    return id;
  }

  unsubscribe(subId: string): void {
    this.subscriptions = this.subscriptions.filter((s) => s.id !== subId);
  }

  subscribeState(listener: (state: TtsState) => void): () => void {
    this.stateListeners.push(listener);
    // Immediately invoke with current state
    listener(this.state);
    return () => {
      this.stateListeners = this.stateListeners.filter((l) => l !== listener);
    };
  }

  hasSegment(nodeId: string): boolean {
    return this.queue.some((s) => s.nodeId === nodeId);
  }

  finishSegment(nodeId: string): void {
    if (this.endedSegments.has(nodeId)) return;
    this.notifySegmentEnd(nodeId);
  }

  /**
   * Public hook for non-audio typing paths (e.g. the fallback interval in
   * useTypingAnimation when SpeechSynthesis isn't emitting boundary events)
   * to broadcast character progress to subscribers. CanvasPage's boundary-driven
   * viewport refit listens to this via subscribe(nodeId, { onCharProgress }).
   */
  emitCharProgress(nodeId: string, charIndex: number): void {
    this.notifyCharProgress(nodeId, charIndex);
  }

  // ==================== Internal ====================

  private notifySegmentStart(nodeId: string): void {
    this.subscriptions.forEach((s) => {
      if (s.nodeId === nodeId) {
        s.onSegmentStart?.(nodeId);
      }
    });
    this.callbacks.onSegmentStart?.(nodeId);
  }

  private notifyCharProgress(nodeId: string, charIndex: number): void {
    this.subscriptions.forEach((s) => {
      if (s.nodeId === nodeId) {
        s.onCharProgress?.(nodeId, charIndex, this.currentText);
      }
    });
    this.callbacks.onCharProgress?.(nodeId, charIndex, this.currentText);
  }

  private notifyStateListeners(): void {
    this.stateListeners.forEach((l) => l(this.state));
  }

  private notifySegmentEnd(nodeId: string): void {
    this.endedSegments.add(nodeId);
    this.subscriptions.forEach((s) => {
      if (s.nodeId === nodeId) {
        s.onSegmentEnd?.(nodeId);
      }
    });
    this.callbacks.onSegmentEnd?.(nodeId);
  }

  private playNext(): void {
    this.currentIdx++;
    if (this.currentIdx >= this.queue.length) {
      this.state = 'idle';
      this.notifyStateListeners();
      this.callbacks.onQueueEnd?.();
      return;
    }

    const segment = this.queue[this.currentIdx];
    this.state = 'playing';
    this.notifyStateListeners();
    this.charCount = 0;
    this.currentText = segment.text;
    debugLog(
      'log',
      'tts',
      'segment start node=%s idx=%d/%d text_len=%d',
      segment.nodeId,
      this.currentIdx,
      this.queue.length,
      segment.text.length,
    );
    this.notifySegmentStart(segment.nodeId);

    if (!this.speechSynthesisAvailable) {
      // Simulate completion when browser speech synthesis is unavailable
      setTimeout(() => {
        this.notifyCharProgress(segment.nodeId, segment.text.length);
        this.notifySegmentEnd(segment.nodeId);
        this.playNext();
      }, 50);
      return;
    }

    this.playSpeechSynthesis(segment);
  }

  private playSpeechSynthesis(segment: TtsSegment): void {
    const utterance = new SpeechSynthesisUtterance(segment.text);
    utterance.rate = this.rate;
    this.utterance = utterance;

    utterance.onboundary = (event) => {
      if (event.name === 'word') {
        this.charCount = event.charIndex + event.charLength;
        this.notifyCharProgress(segment.nodeId, this.charCount);
      }
    };

    utterance.onend = () => {
      this.notifyCharProgress(segment.nodeId, segment.text.length);
      this.notifySegmentEnd(segment.nodeId);
      this.cleanupSpeech();
      this.playNext();
    };

    utterance.onerror = (event) => {
      debugLog('error', 'tts', 'SpeechSynthesis error event=%s', event.error);
      this.cleanupSpeech();
      this.notifySegmentEnd(segment.nodeId);
      this.playNext();
    };

    window.speechSynthesis.speak(utterance);
  }

  private cleanupSpeech(): void {
    if (this.utterance) {
      this.utterance.onboundary = null;
      this.utterance.onend = null;
      this.utterance.onerror = null;
      this.utterance = null;
    }
  }

  private cleanup(): void {
    this.cleanupSpeech();
    if (this.speechSynthesisAvailable) {
      window.speechSynthesis.cancel();
    }
  }
}

export const ttsManager = new TtsManagerSingleton();
