import { create } from 'zustand';
import type { TtsState } from '@/lib/llm/ttsManager';

interface NotebookState {
  notebookMode: boolean;
  ttsPlaying: boolean;
  ttsPaused: boolean;
  currentSegmentNodeId: string | null;
  segmentIndex: number;
  totalSegments: number;
  completedTypingNodeIds: Record<string, true>;

  setCurrentSegment: (nodeId: string | null, index?: number, total?: number) => void;
  syncTtsState: (state: TtsState) => void;
  markTypingComplete: (nodeId: string) => void;
  hasTypingCompleted: (nodeId: string) => boolean;
  /**
   * Clear the typing-completion cache. Node ids are NOT session-scoped
   * (concept ids like 'binary-search' repeat across lessons), so this MUST run
   * on every session switch/generation start — otherwise a shared concept id
   * makes the new lesson's typewriter/narration silently never start.
   */
  resetTypingForSession: () => void;
}

export const useNotebookStore = create<NotebookState>((set, get) => ({
  // Notebook is the sole lesson surface.
  notebookMode: true,
  ttsPlaying: false,
  ttsPaused: false,
  currentSegmentNodeId: null,
  segmentIndex: 0,
  totalSegments: 0,
  completedTypingNodeIds: {},

  setCurrentSegment: (nodeId, index, total) =>
    set({
      currentSegmentNodeId: nodeId,
      segmentIndex: index ?? 0,
      totalSegments: total ?? 0,
    }),

  markTypingComplete: (nodeId) =>
    set((state) =>
      state.completedTypingNodeIds[nodeId]
        ? {}
        : { completedTypingNodeIds: { ...state.completedTypingNodeIds, [nodeId]: true } },
    ),

  hasTypingCompleted: (nodeId) => Boolean(get().completedTypingNodeIds[nodeId]),

  resetTypingForSession: () => set({ completedTypingNodeIds: {} }),

  // Single source of truth for TTS state; maps TtsState to dual booleans
  syncTtsState: (state) =>
    set({
      ttsPlaying: state === 'playing',
      ttsPaused: state === 'paused',
    }),
}));
