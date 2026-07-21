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

  setNotebookMode: (on: boolean) => void;
  toggleNotebookMode: () => void;
  setCurrentSegment: (nodeId: string | null, index?: number, total?: number) => void;
  syncTtsState: (state: TtsState) => void;
  markTypingComplete: (nodeId: string) => void;
  hasTypingCompleted: (nodeId: string) => boolean;
}

export const useNotebookStore = create<NotebookState>((set, get) => ({
  // Notebook is the primary product surface; graph view is the escape hatch.
  notebookMode: true,
  ttsPlaying: false,
  ttsPaused: false,
  currentSegmentNodeId: null,
  segmentIndex: 0,
  totalSegments: 0,
  completedTypingNodeIds: {},

  setNotebookMode: (on) => set({ notebookMode: on }),
  toggleNotebookMode: () => set((s) => ({ notebookMode: !s.notebookMode })),

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

  // Single source of truth for TTS state; maps TtsState to dual booleans
  syncTtsState: (state) =>
    set({
      ttsPlaying: state === 'playing',
      ttsPaused: state === 'paused',
    }),
}));
