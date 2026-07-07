import { useSettingsStore } from '@/shared/stores/settingsStore';

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

class TtsManagerSingleton {
  private queue: TtsSegment[] = [];
  private currentIdx = -1;
  private state: TtsState = 'idle';

  private callbacks: TtsCallbacks = {};

  // Audio element for Mistral Voxtral
  private audioEl: HTMLAudioElement | null = null;
  private audioUrl: string | null = null;
  private rafId: number | null = null;
  private charCount = 0;
  private charsPerMs = 0;
  private startTime = 0;

  // SpeechSynthesis fallback
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
    if (this.audioEl && !this.audioEl.paused) {
      this.audioEl.pause();
    } else if (window.speechSynthesis.speaking) {
      window.speechSynthesis.pause();
    }
    this.state = 'paused';
  }

  resume(): void {
    if (this.state !== 'paused') return;
    if (this.audioEl && this.audioEl.paused) {
      this.audioEl.play();
    } else if (window.speechSynthesis.paused) {
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
      this.callbacks.onSegmentEnd?.(current.nodeId);
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

  // ==================== Internal ====================

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
    this.charsPerMs = 0;
    this.callbacks.onSegmentStart?.(segment.nodeId);

    // Try Mistral Voxtral first
    const blob = await this.fetchTtsBlob(segment.text);
    if (blob) {
      await this.playAudioBlob(blob, segment);
    } else {
      this.playSpeechSynthesis(segment);
    }
  }

  private async fetchTtsBlob(text: string): Promise<Blob | null> {
    const { apiKey, provider } = useSettingsStore.getState();
    if (!apiKey || provider !== 'mistral') return null;

    try {
      const res = await fetch('https://api.mistral.ai/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'voxtral-mini-tts-2603',
          input: text,
        }),
      });

      if (!res.ok) {
        console.warn('[ttsManager] Mistral TTS failed, falling back:', await res.text());
        return null;
      }

      return await res.blob();
    } catch (err) {
      console.error('[ttsManager] Mistral TTS network error:', err);
      return null;
    }
  }

  private async playAudioBlob(blob: Blob, segment: TtsSegment): Promise<void> {
    const url = URL.createObjectURL(blob);
    this.audioUrl = url;
    const audio = new Audio(url);
    this.audioEl = audio;

    // Wait for metadata to get duration
    await new Promise<void>((resolve) => {
      audio.addEventListener('loadedmetadata', () => resolve(), { once: true });
      audio.addEventListener('error', () => resolve(), { once: true });
      audio.load();
    });

    if (audio.duration && isFinite(audio.duration) && audio.duration > 0) {
      this.charsPerMs = segment.text.length / (audio.duration * 1000);
    }

    audio.onended = () => {
      this.callbacks.onCharProgress?.(segment.nodeId, segment.text.length);
      this.callbacks.onSegmentEnd?.(segment.nodeId);
      this.cleanup();
      this.playNext();
    };

    audio.onerror = () => {
      console.warn('[ttsManager] Audio playback error, skipping segment');
      this.cleanup();
      this.callbacks.onSegmentEnd?.(segment.nodeId);
      this.playNext();
    };

    this.startTime = performance.now();

    try {
      await audio.play();
    } catch {
      // Autoplay blocked — fallback to SpeechSynthesis
      this.cleanupAudio();
      this.playSpeechSynthesis(segment);
      return;
    }

    // RAF loop for character progress
    const tick = () => {
      if (this.state !== 'playing') return;
      if (audio.paused || audio.ended) return;

      const elapsed = performance.now() - this.startTime;
      const estimatedChars = Math.min(
        Math.floor(elapsed * this.charsPerMs),
        segment.text.length,
      );
      if (estimatedChars !== this.charCount) {
        this.charCount = estimatedChars;
        this.callbacks.onCharProgress?.(segment.nodeId, estimatedChars);
      }
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private playSpeechSynthesis(segment: TtsSegment): void {
    const utterance = new SpeechSynthesisUtterance(segment.text);
    this.utterance = utterance;

    utterance.onboundary = (event) => {
      if (event.name === 'word') {
        this.charCount = event.charIndex + event.charLength;
        this.callbacks.onCharProgress?.(segment.nodeId, this.charCount);
      }
    };

    utterance.onend = () => {
      this.callbacks.onCharProgress?.(segment.nodeId, segment.text.length);
      this.callbacks.onSegmentEnd?.(segment.nodeId);
      this.cleanupSpeech();
      this.playNext();
    };

    utterance.onerror = (event) => {
      console.warn('[ttsManager] SpeechSynthesis error:', event.error);
      this.cleanupSpeech();
      this.callbacks.onSegmentEnd?.(segment.nodeId);
      this.playNext();
    };

    window.speechSynthesis.speak(utterance);
  }

  private cleanupAudio(): void {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.audioEl) {
      this.audioEl.pause();
      this.audioEl.onended = null;
      this.audioEl.onerror = null;
      this.audioEl = null;
    }
    if (this.audioUrl) {
      URL.revokeObjectURL(this.audioUrl);
      this.audioUrl = null;
    }
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
    this.cleanupAudio();
    this.cleanupSpeech();
    window.speechSynthesis.cancel();
  }
}

export const ttsManager = new TtsManagerSingleton();
