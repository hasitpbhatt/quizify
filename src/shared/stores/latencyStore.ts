import { create } from 'zustand';
import { getCallCount, getCallsPerMinute, resetCallCounter } from '@/lib/perf';

export interface StageEntry {
  stage: string;
  label: string;
  startTime: number;
  endTime?: number;
}

interface LatencyState {
  entries: StageEntry[];
  callCount: number;
  rpm: number;
  visible: boolean;
  overallStart: number | null;

  startStage: (stage: string, label: string) => void;
  endStage: (stage: string) => void;
  tick: () => void;
  reset: () => void;
  setVisible: (v: boolean) => void;
}

export const useLatencyStore = create<LatencyState>((set) => ({
  entries: [],
  callCount: 0,
  rpm: 0,
  visible: false,
  overallStart: null,

  startStage: (stage, label) =>
    set((state) => {
      const existing = state.entries.find((e) => e.stage === stage && !e.endTime);
      if (existing) {
        existing.label = label;
        return { entries: state.entries };
      }
      return {
        entries: [
          ...state.entries,
          { stage, label, startTime: performance.now() },
        ],
      };
    }),

  endStage: (stage) =>
    set((state) => {
      const entry = [...state.entries].reverse().find((e) => e.stage === stage && !e.endTime);
      if (!entry) return {};
      entry.endTime = performance.now();
      return { entries: [...state.entries] };
    }),

  tick: () =>
    set({
      callCount: getCallCount(),
      rpm: getCallsPerMinute(),
    }),

  reset: () => {
    resetCallCounter();
    set({
      entries: [],
      callCount: 0,
      rpm: 0,
      overallStart: performance.now(),
    });
  },

  setVisible: (visible) => set({ visible }),
}));
