import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, screen, fireEvent } from '@testing-library/react';
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

// Captured subscriptions, keyed by nodeId, so tests can fire callbacks.
const ttsSubs = vi.hoisted(() => new Map<string, Record<string, (...args: any[]) => void>>());

// Stable, inspectable ttsManager surface so each test can drive the
// gating effect in CanvasPage.tsx without exercising real TTS.
const ttsMock = vi.hoisted(() => ({
  currentSegmentId: null as string | null,
  isPlaying: false,
  isPaused: false,
  hasSegment: vi.fn((_id: string) => false),
  subscribe: vi.fn((nodeId: string, cbs?: Record<string, (...args: any[]) => void>) => {
    ttsSubs.set(nodeId, cbs ?? {});
    return 'sub-' + nodeId;
  }),
  unsubscribe: vi.fn(),
  subscribeState: vi.fn((_cb: unknown) => () => undefined),
  enqueue: vi.fn(),
  start: vi.fn(() => { ttsMockRef.isPlaying = true; }),
  stop: vi.fn(() => { ttsMockRef.isPlaying = false; ttsMockRef.isPaused = false; }),
  finishSegment: vi.fn(),
  emitCharProgress: vi.fn(),
  setRate: vi.fn(),
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

describe('CanvasPage — notebook-mode reduced-motion quiz reveal (NB-1)', () => {
  async function seedSessionWithConceptAndQuiz() {
    const concept = factories.mockConceptNode();
    const quiz = factories.mockQuizNode(concept.id);
    const edge = factories.mockEdge(concept.id, quiz.id);
    const session = factories.mockSession([concept, quiz], [edge]);
    await sessionsDb.putSession(session);
    useSessionStore.setState({ sessions: [session], currentId: session.id, loaded: true });
    return { session, concept, quiz };
  }

  let originalMatchMedia: typeof window.matchMedia;
  beforeEach(() => {
    originalMatchMedia = window.matchMedia;
    // Pretend the user prefers reduced motion so CanvasPage's
    // prefersReducedMotion ref captures `true` on first render.
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });
  afterEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: originalMatchMedia,
    });
  });

  it('reveals the active concept\'s quizzes without TTS narration under reduced-motion', async () => {
    const { quiz } = await seedSessionWithConceptAndQuiz();

    const { container } = renderCanvas();

    // Quiz node should be rendered (visible) even though TTS never started.
    await waitFor(() => {
      expect(container.querySelector(`.react-flow__node[data-id="${quiz.id}"]`)).not.toBeNull();
    });

    // No audio should have been enqueued or started under reduced-motion.
    expect(ttsMock.enqueue).not.toHaveBeenCalled();
    expect(ttsMock.start).not.toHaveBeenCalled();
  });
});

describe('CanvasPage — notebook-mode captions (NB-3)', () => {
  it('shows a caption reflecting the narrated text while TTS progresses', async () => {
    const { concept } = await seedSessionWithOneConcept();

    renderCanvas();

    // Fire the caption subscription's segment-start + char-progress callbacks.
    const captionSub = ttsSubs.get('__caption__');
    expect(captionSub).toBeDefined();
    captionSub!.onSegmentStart?.(concept.id);
    captionSub!.onCharProgress?.(concept.id, 5, 'Quantum Computing. Uses qubits');

    await waitFor(() => {
      const caption = document.querySelector('.notebookCaption');
      expect(caption).not.toBeNull();
      expect(caption?.textContent).toBe('Quantum Computing. Uses qubits');
    });

    // Ending the segment hides the caption.
    captionSub!.onSegmentEnd?.(concept.id);
    await waitFor(() => {
      expect(document.querySelector('.notebookCaption')).toBeNull();
    });
  });
});

describe('CanvasPage — notebook-mode outline/TOC (NB-5)', () => {
  it('renders a table-of-contents button and opens the outline with node titles', async () => {
    const concept = factories.mockConceptNode();
    const quiz = factories.mockQuizNode(concept.id);
    const session = factories.mockSession([concept, quiz], [factories.mockEdge(concept.id, quiz.id)]);
    await sessionsDb.putSession(session);
    useSessionStore.setState({ sessions: [session], currentId: session.id, loaded: true });
    useNotebookStore.setState({ notebookMode: true, completedTypingNodeIds: {} });

    renderCanvas();

    const contentsBtn = await screen.findByTitle('Table of contents');
    expect(contentsBtn).toBeInTheDocument();
    fireEvent.click(contentsBtn);

    const panel = await screen.findByRole('dialog', { name: 'Table of contents' });
    expect(panel).toBeInTheDocument();
    // The visible concept title should appear in the TOC (quizzes are hidden
    // until revealed in notebook mode, so they aren't listed yet).
    expect(screen.getByText('Quantum Computing')).toBeInTheDocument();
  });
});
