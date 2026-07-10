
export interface TtsSegment {
  nodeId: string;
  text: string;
}

export interface TtsCallbacks {
  onSegmentStart?: (nodeId: string) => void;
  onCharProgress?: (nodeId: string, charIndex: number) => void;
  onSegmentEnd?: (nodeId: string) => void;
  onQueueEnd?: () => void;
}

type TtsState = 'idle' | 'playing' | 'paused' | 'stopped';

interface TtsSubscription {
  id: string;
  nodeId: string;
  onSegmentStart?: (nodeId: string) => void;
  onCharProgress?: (nodeId: string, charIndex: number) => void;
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

  // ==================== Public API ====================

  enqueue(segment: TtsSegment): void {
    this.queue.push(segment);
  }

  enqueueMultiple(segments: TtsSegment[]): void {
    this.queue.push(...segments);
  }

  clearQueue(): void {
    this.queue = [];
  }

  start(): void {
    if (this.queue.length === 0 || this.state === 'playing') return;
    this.currentIdx = -1;
    this.playNext();
  }

  pause(): void {
    if (this.state !== 'playing') return;
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.pause();
    }
    this.state = 'paused';
  }

  resume(): void {
    if (this.state !== 'paused') return;
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
    this.state = 'playing';
  }

  stop(): void {
    this.cleanup();
    this.state = 'stopped';
    this.currentIdx = -1;
    this.queue = [];
    this.callbacks.onQueueEnd?.();
  }

  skip(): void {
    const current = this.queue[this.currentIdx];
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

  subscribe(nodeId: string, cb: {
    onSegmentStart?: (nodeId: string) => void;
    onCharProgress?: (nodeId: string, charIndex: number) => void;
    onSegmentEnd?: (nodeId: string) => void;
  }): string {
    const id = Math.random().toString(36).slice(2);
    this.subscriptions.push({ id, nodeId, ...cb });
    return id;
  }

  unsubscribe(subId: string): void {
    this.subscriptions = this.subscriptions.filter(s => s.id !== subId);
  }

  hasSegment(nodeId: string): boolean {
    return this.queue.some(s => s.nodeId === nodeId);
  }

  finishSegment(nodeId: string): void {
    this.notifySegmentEnd(nodeId);
  }

  // ==================== Internal ====================

  private notifySegmentStart(nodeId: string): void {
    this.subscriptions.forEach(s => {
      if (s.nodeId === nodeId) {
        s.onSegmentStart?.(nodeId);
      }
    });
    this.callbacks.onSegmentStart?.(nodeId);
  }

  private notifyCharProgress(nodeId: string, charIndex: number): void {
    this.subscriptions.forEach(s => {
      if (s.nodeId === nodeId) {
        s.onCharProgress?.(nodeId, charIndex);
      }
    });
    this.callbacks.onCharProgress?.(nodeId, charIndex);
  }

  private notifySegmentEnd(nodeId: string): void {
    this.subscriptions.forEach(s => {
      if (s.nodeId === nodeId) {
        s.onSegmentEnd?.(nodeId);
      }
    });
    this.callbacks.onSegmentEnd?.(nodeId);
  }

  private async playNext(): Promise<void> {
    this.currentIdx++;
    if (this.currentIdx >= this.queue.length) {
      this.state = 'idle';
      this.callbacks.onQueueEnd?.();
      return;
    }

    const segment = this.queue[this.currentIdx];
    this.state = 'playing';
    this.charCount = 0;
    this.notifySegmentStart(segment.nodeId);

    // Rely solely on browser SpeechSynthesis for simplicity and stability
    this.playSpeechSynthesis(segment);
  }

  private playSpeechSynthesis(segment: TtsSegment): void {
    const utterance = new SpeechSynthesisUtterance(segment.text);
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
      console.warn('[ttsManager] SpeechSynthesis error:', event.error);
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
    window.speechSynthesis.cancel();
  }
}

export const ttsManager = new TtsManagerSingleton();
