import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { CanvasPage } from '@/features/canvas/CanvasPage';
import { useSessionStore } from '@/shared/stores/sessionStore';
import { useNotebookStore } from '@/shared/stores/notebookStore';
import * as sessionsDb from '@/lib/db/sessionsDb';
import type { ConceptData } from '@/shared/types';
import * as factories from '../../shared/factories';

// ttsMockRef holds runtime state that the mocked start/stop mutate so the
// gating effect's `ttsManager.isPlaying`/`isPaused` checks stay truthful.
const ttsMockRef = vi.hoisted(() => ({ isPlaying: false, isPaused: false }));

// Stable, inspectable ttsManager surface so each test can drive the
// gating effect in CanvasPage.tsx without exercising real TTS.
const ttsMock = vi.hoisted(() => ({
  currentSegmentId: null as string | null,
  isPlaying: false,
  isPaused: false,
  hasSegment: vi.fn((_id: string) => false),
  subscribe: vi.fn((_nodeId: string, _cbs?: unknown) => 'sub'),
  unsubscribe: vi.fn(),
  subscribeState: vi.fn((_cb: unknown) => () => undefined),
  enqueue: vi.fn(),
  start: vi.fn(() => { ttsMockRef.isPlaying = true; }),
  stop: vi.fn(() => { ttsMockRef.isPlaying = false; ttsMockRef.isPaused = false; }),
  finishSegment: vi.fn(),
  emitCharProgress: vi.fn(),
}));

// Make the mock's `isPlaying`/`isPaused` read through the ref so toggling
// state via ttsMock.start()/stop() is observable to the gating effect.
Object.defineProperty(ttsMock, 'isPlaying', {
  get() { return ttsMockRef.isPlaying; },
  configurable: true,
});
Object.defineProperty(ttsMock, 'isPaused', {
  get() { return ttsMockRef.isPaused; },
  configurable: true,
});

vi.mock('@/lib/llm/ttsManager', () => ({ ttsManager: ttsMock }));

function renderCanvas() {
  return render(
    <ReactFlowProvider>
      <CanvasPage />
    </ReactFlowProvider>,
  );
}

async function seedSessionWithOneConcept() {
  const concept = factories.mockConceptNode();
  const session = factories.mockSession([concept], []);
  await sessionsDb.putSession(session);
  useSessionStore.setState({ sessions: [session], currentId: session.id, loaded: true });
  return { session, concept };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Reset between tests so ttsMock state and call counts are clean.
  ttsMockRef.isPlaying = false;
  ttsMockRef.isPaused = false;
  ttsMock.currentSegmentId = null;
  ttsMock.hasSegment.mockReturnValue(false);
  useNotebookStore.setState({
    notebookMode: true,
    ttsPlaying: false,
    ttsPaused: false,
    currentSegmentNodeId: null,
    segmentIndex: 0,
    totalSegments: 0,
    completedTypingNodeIds: {},
  });
  useSessionStore.setState({ sessions: [], currentId: null, loaded: false });
});

afterEach(() => {
  useSessionStore.setState({ sessions: [], currentId: null, loaded: false });
  useNotebookStore.setState({ notebookMode: false, completedTypingNodeIds: {} });
});

describe('CanvasPage — notebook-mode TTS gating', () => {
  it('does not enqueue TTS when the concept has already finished typing', async () => {
    const { concept } = await seedSessionWithOneConcept();

    // Mark the concept as already completed BEFORE mount so the gating
    // effect early-returns on its very first run.
    useNotebookStore.getState().markTypingComplete(concept.id);

    renderCanvas();

    // Give the effects a tick to run; gating should have skipped.
    await waitFor(() => {
      expect(ttsMock.enqueue).not.toHaveBeenCalled();
    });
    expect(ttsMock.start).not.toHaveBeenCalled();
    expect(ttsMock.stop).not.toHaveBeenCalled();
  });

  it('does not enqueue TTS when ttsManager already has the segment enqueued', async () => {
    const { concept } = await seedSessionWithOneConcept();
    ttsMock.hasSegment.mockImplementation(id => id === concept.id);
    ttsMock.currentSegmentId = null;

    renderCanvas();

    await waitFor(() => {
      expect(ttsMock.enqueue).not.toHaveBeenCalled();
    });
  });

  it('does not enqueue TTS when ttsManager currentSegmentId matches the concept', async () => {
    const { concept } = await seedSessionWithOneConcept();
    ttsMock.currentSegmentId = concept.id;
    ttsMock.hasSegment.mockReturnValue(false);

    renderCanvas();

    await waitFor(() => {
      expect(ttsMock.enqueue).not.toHaveBeenCalled();
    });
  });

  it('enqueues TTS exactly once for the active concept when gating passes', async () => {
    const { concept } = await seedSessionWithOneConcept();
    const conceptData = concept.data as ConceptData;
    // No hasSegment, no currentSegmentId, no completedTyping → gate opens.

    renderCanvas();

    await waitFor(() => {
      expect(ttsMock.enqueue).toHaveBeenCalledTimes(1);
    });
    expect(ttsMock.enqueue).toHaveBeenCalledWith({
      nodeId: concept.id,
      text: `${conceptData.title}. ${conceptData.explanation}`,
    });
    expect(ttsMock.start).toHaveBeenCalledTimes(1);
    expect(ttsMock.stop).toHaveBeenCalledTimes(1);
  });
});
