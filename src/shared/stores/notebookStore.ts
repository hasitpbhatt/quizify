import { create } from 'zustand';
import type { TtsState } from '@/lib/llm/ttsManager';

interface NotebookState {
  notebookMode: boolean;
  ttsPlaying: boolean;
  ttsPaused: boolean;
  currentSegmentNodeId: string | null;
  segmentIndex: number;
  totalSegments: number;

  setNotebookMode: (on: boolean) => void;
  toggleNotebookMode: () => void;
  setCurrentSegment: (nodeId: string | null, index?: number, total?: number) => void;
  syncTtsState: (state: TtsState) => void;
}

export const useNotebookStore = create<NotebookState>((set) => ({
  notebookMode: false,
  ttsPlaying: false,
  ttsPaused: false,
  currentSegmentNodeId: null,
  segmentIndex: 0,
  totalSegments: 0,

  setNotebookMode: (on) => set({ notebookMode: on }),
  toggleNotebookMode: () => set((s) => ({ notebookMode: !s.notebookMode })),

  setCurrentSegment: (nodeId, index, total) =>
    set({
      currentSegmentNodeId: nodeId,
      segmentIndex: index ?? 0,
      totalSegments: total ?? 0,
    }),

  // Single source of truth for TTS state; maps TtsState to dual booleans
  syncTtsState: (state) => set({
    ttsPlaying: state === 'playing',
    ttsPaused: state === 'paused',
  }),
}));