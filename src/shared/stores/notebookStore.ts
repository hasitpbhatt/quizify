import { create } from 'zustand';

interface NotebookState {
  notebookMode: boolean;
  ttsPlaying: boolean;
  ttsPaused: boolean;
  currentSegmentNodeId: string | null;
  segmentIndex: number;
  totalSegments: number;

  setNotebookMode: (on: boolean) => void;
  setTtsPlaying: (v: boolean) => void;
  setTtsPaused: (v: boolean) => void;
  setCurrentSegment: (nodeId: string | null, index?: number, total?: number) => void;
}

export const useNotebookStore = create<NotebookState>((set) => ({
  notebookMode: false,
  ttsPlaying: false,
  ttsPaused: false,
  currentSegmentNodeId: null,
  segmentIndex: 0,
  totalSegments: 0,

  setNotebookMode: (on) => set({ notebookMode: on }),

  setTtsPlaying: (v) => set({ ttsPlaying: v }),

  setTtsPaused: (v) => set({ ttsPaused: v }),

  setCurrentSegment: (nodeId, index, total) =>
    set({
      currentSegmentNodeId: nodeId,
      segmentIndex: index ?? 0,
      totalSegments: total ?? 0,
    }),
}));
