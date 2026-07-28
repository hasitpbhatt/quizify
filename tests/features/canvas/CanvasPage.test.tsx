import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CanvasPage } from '@/features/canvas/CanvasPage';
import { useSessionStore } from '@/shared/stores/sessionStore';
import { useNotebookStore } from '@/shared/stores/notebookStore';
import * as sessionsDb from '@/lib/db/sessionsDb';
import * as factories from '../../shared/factories';
import type { CanvasNode, ConceptData, QuizData } from '@/shared/types';

function renderCanvas(overrides: Partial<React.ComponentProps<typeof CanvasPage>> = {}) {
  return render(<CanvasPage {...overrides} />);
}

beforeEach(() => {
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

describe('CanvasPage', () => {

  it('shows empty state when no session exists', async () => {
    renderCanvas();
    await waitFor(() => {
      expect(screen.getByText(/We couldn.t load this lesson/)).toBeInTheDocument();
    });
  });

  it('shows building state while generating with no nodes yet', async () => {
    const session = factories.mockSession([], []);
    await sessionsDb.putSession(session);
    useSessionStore.setState({ sessions: [session], currentId: session.id, loaded: true });

    render(<CanvasPage isGenerating progress={{ stage: 'detail', label: 'Generating content (0/3 done…)' }} />);

    await waitFor(() => {
      expect(screen.getByText('Building your lesson')).toBeInTheDocument();
      expect(screen.getByText('Generating content (0/3 done…)')).toBeInTheDocument();
    });
    expect(screen.queryByText('No lesson data yet.')).not.toBeInTheDocument();
  });

  it('shows empty state when session has no nodes', async () => {
    const session = factories.mockSession([], []);
    await sessionsDb.putSession(session);
    useSessionStore.setState({ sessions: [session], currentId: session.id, loaded: true });

    renderCanvas();
    await waitFor(() => {
      expect(screen.getByText(/We couldn.t load this lesson/)).toBeInTheDocument();
    });
  });

  it('renders concept and quiz nodes', async () => {
    const concept = factories.mockConceptNode();
    const quiz = factories.mockQuizNode(concept.id);
    const edge = factories.mockEdge(concept.id, quiz.id);
    const session = factories.mockSession([concept, quiz], [edge]);
    await sessionsDb.putSession(session);
    useSessionStore.setState({ sessions: [session], currentId: session.id, loaded: true });
    useNotebookStore.getState().markTypingComplete(concept.id);

    renderCanvas();

    await waitFor(() => {
      expect(screen.getByText('Quantum Computing')).toBeInTheDocument();
    });
    expect(screen.getByText('What is a qubit?')).toBeInTheDocument();
  });

  it('stores correct edge data in the session', async () => {
    const concept = factories.mockConceptNode();
    const quiz = factories.mockQuizNode(concept.id);
    const edge = factories.mockEdge(concept.id, quiz.id);
    const session = factories.mockSession([concept, quiz], [edge]);
    await sessionsDb.putSession(session);
    useSessionStore.setState({ sessions: [session], currentId: session.id, loaded: true });
    useNotebookStore.getState().markTypingComplete(concept.id);

    renderCanvas();

    await waitFor(() => {
      expect(screen.getByText('Quantum Computing')).toBeInTheDocument();
    });

    const state = useSessionStore.getState();
    const current = state.sessions.find(s => s.id === state.currentId);
    expect(current?.edges ?? []).toHaveLength(1);
    expect((current?.edges ?? [])[0].source).toBe(concept.id);
    expect((current?.edges ?? [])[0].target).toBe(quiz.id);
    expect((current?.edges ?? [])[0].type).toBe('wiggly');
  });

  it('opens quiz modal when clicking a quiz node', async () => {
    const concept = factories.mockConceptNode();
    const quiz = factories.mockQuizNode(concept.id);
    const session = factories.mockSession([concept, quiz], [factories.mockEdge(concept.id, quiz.id)]);
    await sessionsDb.putSession(session);
    useSessionStore.setState({ sessions: [session], currentId: session.id, loaded: true });
    useNotebookStore.getState().markTypingComplete(concept.id);

    renderCanvas();

    await waitFor(() => expect(screen.getByText('Quantum Computing')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('What is a qubit?')).toBeInTheDocument());

    // Click the quiz node button wrapper — matches the a11y-first role="button" pattern
    screen.getByRole('button', { name: /Quiz:/ }).click();

    await waitFor(() => {
      expect(screen.getByText('Multiple Choice')).toBeInTheDocument();
      expect(screen.getByText('Quantum bit')).toBeInTheDocument();
    });
  });



  describe('orientation cue', () => {
    function setNotebookMode() {
      useNotebookStore.setState({
        notebookMode: true,
        ttsPlaying: false,
        ttsPaused: false,
        currentSegmentNodeId: null,
        segmentIndex: 0,
        totalSegments: 0,
        completedTypingNodeIds: {},
      });
    }

    function buildSession() {
      const concept = factories.mockConceptNode();
      const quiz = factories.mockQuizNode(concept.id, {
        data: {
          kind: 'quiz',
          parentConceptId: concept.id,
          format: 'multipleChoice',
          prompt: 'Q?',
          options: ['A', 'B'],
          correctAnswer: 'A',
          rationale: 'R',
          attempts: [],
          state: 'untested',
        } as import('@/shared/types').QuizData,
      });
      const session = factories.mockSession([concept, quiz], [factories.mockEdge(concept.id, quiz.id)]);
      return session;
    }

    async function setupSession(session: ReturnType<typeof buildSession>) {
      await sessionsDb.putSession(session);
      useSessionStore.setState({ sessions: [session], currentId: session.id, loaded: true });
    }

    beforeEach(() => {
      window.sessionStorage.clear();
    });

    it('shows the first-open orientation cue in notebook mode after 450ms and dismisses it', async () => {
      setNotebookMode();
      const session = buildSession();
      await setupSession(session);

      renderCanvas();

      await waitFor(() => {
        expect(screen.getByText('Start here')).toBeInTheDocument();
      }, { timeout: 2000 });

      await act(async () => { screen.getByText('Got it').click(); });

      expect(screen.queryByText('Start here')).not.toBeInTheDocument();
      expect(window.sessionStorage.getItem(`quizify:nbintro:${session.id}`)).toBe('seen');
    });

    it('does not show the cue when already seen', async () => {
      setNotebookMode();
      const session = buildSession();
      window.sessionStorage.setItem(`quizify:nbintro:${session.id}`, 'seen');
      await setupSession(session);

      renderCanvas();

      await waitFor(() => {
        expect(screen.queryByText('Start here')).not.toBeInTheDocument();
      });
    });


  });

  describe('learning cue', () => {
    function setNotebookMode() {
      useNotebookStore.setState({
        notebookMode: true,
        ttsPlaying: false,
        ttsPaused: false,
        currentSegmentNodeId: null,
        segmentIndex: 0,
        totalSegments: 0,
        completedTypingNodeIds: {},
      });
    }

    function buildSessionWithProgress(
      conceptCount: number,
      quizPerConcept: number,
      completedConceptIndices: number[],
      lastConceptIndex: number | null,
      nextReviewAtByConceptId: Record<string, number> = {},
    ) {
      const now = Date.now();
      const nodes: CanvasNode[] = [];
      const edges: import('@/shared/types').CanvasEdge[] = [];
      for (let ci = 0; ci < conceptCount; ci++) {
        const c = factories.mockConceptNode({
          id: `c${ci}`,
          data: { kind: 'concept', index: ci, title: `Concept ${ci}`, explanation: '', example: '' } as ConceptData,
        });
        nodes.push(c);
        const isCompleted = completedConceptIndices.includes(ci);
        for (let qi = 0; qi < quizPerConcept; qi++) {
          const q = factories.mockQuizNode(c.id, {
            id: `q${ci}-${qi}`,
            data: {
              kind: 'quiz',
              parentConceptId: c.id,
              format: 'multipleChoice',
              prompt: `Quiz ${ci}-${qi}?`,
              options: ['A', 'B'],
              correctAnswer: 'A',
              rationale: 'R',
              attempts: isCompleted ? [{ timestamp: 1, given: 'A', grade: 'correct' as const, rationale: 'R', idealAnswer: 'A' }] : [],
              state: isCompleted ? 'correct' : 'untested',
            } as QuizData,
          });
          nodes.push(q);
          edges.push(factories.mockEdge(c.id, q.id));
        }
      }
      const completedIds = completedConceptIndices.map(i => `c${i}`);
      const lastId = lastConceptIndex != null ? `c${lastConceptIndex}` : null;
      return {
        session: factories.mockSession(nodes, edges, {
          lastConceptId: lastId ?? undefined,
          completedConceptIds: completedIds,
          nextReviewAtByConceptId,
          lastActivityAt: now,
        }),
      };
    }

    async function setupSession(session: ReturnType<typeof factories.mockSession>) {
      await sessionsDb.putSession(session);
      useSessionStore.setState({ sessions: [session], currentId: session.id, loaded: true });
    }

    beforeEach(() => {
      window.sessionStorage.clear();
    });

    /** Helper: dismiss the orientation cue so the learning cue can surface. */
    async function dismissOrientation() {
      await waitFor(() => {
        expect(screen.getByText('Got it')).toBeInTheDocument();
      }, { timeout: 2000 });
      await act(async () => { screen.getByText('Got it').click(); });
    }

    it('shows continue cue when lastConceptId is incomplete', async () => {
      setNotebookMode();
      const { session } = buildSessionWithProgress(3, 1, [], 0);
      await setupSession(session);

      renderCanvas();
      await dismissOrientation();

      await waitFor(() => {
        expect(screen.getByText(/Continue with Concept 0/)).toBeInTheDocument();
      }, { timeout: 2000 });
      expect(screen.getByText('Continue')).toBeInTheDocument();
    });

    it('shows review cue when a concept is due for review', async () => {
      setNotebookMode();
      const now = Date.now();
      const { session } = buildSessionWithProgress(3, 1, [0], 1, { c1: now - 1000 });
      await setupSession(session);

      renderCanvas();

      await waitFor(() => {
        expect(screen.getByText('A quick review is ready')).toBeInTheDocument();
      }, { timeout: 2000 });
      expect(screen.getByText('Review now')).toBeInTheDocument();
    });

    it('shows start cue when no lastConceptId', async () => {
      setNotebookMode();
      const { session } = buildSessionWithProgress(3, 1, [], null);
      await setupSession(session);

      renderCanvas();
      await dismissOrientation();

      await waitFor(() => {
        expect(screen.getByText(/Begin with Concept 0/)).toBeInTheDocument();
      }, { timeout: 2000 });
      expect(screen.getByText('Start lesson')).toBeInTheDocument();
    });

    it('does not show the learning cue when already dismissed', async () => {
      setNotebookMode();
      const { session } = buildSessionWithProgress(3, 1, [], 0);
      window.sessionStorage.setItem(`quizify:learningcue:${session.id}`, 'dismissed');
      await setupSession(session);

      renderCanvas();

      await waitFor(() => {
        expect(screen.queryByText(/Continue with/)).not.toBeInTheDocument();
      });
    });

    it('dismisses the cue when the dismiss button is clicked', async () => {
      setNotebookMode();
      const { session } = buildSessionWithProgress(3, 1, [], 0);
      await setupSession(session);

      renderCanvas();
      await dismissOrientation();

      await waitFor(() => {
        expect(screen.getByText('Continue')).toBeInTheDocument();
      }, { timeout: 2000 });

      await act(async () => {
        screen.getByLabelText('Dismiss').click();
      });

      expect(screen.queryByText(/Continue with/)).not.toBeInTheDocument();
    });

    it('shows concept progress indicator', async () => {
      setNotebookMode();
      const { session } = buildSessionWithProgress(3, 1, [0], 1);
      await setupSession(session);

      renderCanvas();

      await waitFor(() => {
        const el = document.querySelector('.notebookConceptProgress');
        expect(el).toBeTruthy();
        expect(el?.textContent).toMatch(/Concept.*2.*of.*3/);
      }, { timeout: 2000 });
    });
  });

  describe('z-index layering regression', () => {
    function readCss(filename: string): string {
      const root = resolve(__dirname, '../../..');
      return readFileSync(resolve(root, 'src', filename), 'utf-8');
    }

    function extractZIndex(css: string, selector: string): number | null {
      const regex = new RegExp(
        selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^}]*z-index\\s*:\\s*(\\d+)',
        'i',
      );
      const match = css.match(regex);
      return match ? parseInt(match[1], 10) : null;
    }

    function extractBottom(css: string, selector: string): string | null {
      const regex = new RegExp(
        selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^}]*bottom\\s*:\\s*([^;]+)',
        'i',
      );
      const match = css.match(regex);
      return match ? match[1].trim() : null;
    }

    function extractTop(css: string, selector: string): string | null {
      const regex = new RegExp(
        selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^}]*top\\s*:\\s*([^;]+)',
        'i',
      );
      const match = css.match(regex);
      return match ? match[1].trim() : null;
    }

    it('quiz overlay z-index must exceed notebookControls z-index', () => {
      const quizCss = readCss('features/quiz/QuizInteraction.module.css');
      const summaryCss = readCss('features/quiz/SummaryQuizInteraction.module.css');
      const notebookCss = readCss('styles/notebook.css');

      const quizZ = extractZIndex(quizCss, '.overlay');
      const summaryZ = extractZIndex(summaryCss, '.overlay');
      const controlsZ = extractZIndex(notebookCss, '.notebookControls');

      expect(quizZ).toBeGreaterThanOrEqual(200);
      expect(summaryZ).toBeGreaterThanOrEqual(200);
      expect(controlsZ).toBeLessThanOrEqual(100);
      expect(quizZ!).toBeGreaterThan(controlsZ!);
      expect(summaryZ!).toBeGreaterThan(controlsZ!);
    });

    it('continueToQuiz button must clear notebookControls bottom offset', () => {
      const canvasCss = readCss('features/canvas/CanvasPage.module.css');
      const notebookCss = readCss('styles/notebook.css');

      const continueBottom = extractBottom(canvasCss, '.continueToQuiz');
      const controlsBottom = extractBottom(notebookCss, '.notebookControls');

      expect(continueBottom).toBeTruthy();
      expect(controlsBottom).toBeTruthy();

      const continuePx = parseInt(continueBottom!, 10);
      const controlsPx = parseInt(controlsBottom!, 10);

      expect(continuePx).toBeGreaterThan(controlsPx);
    });

    it('notebookLearningCue must not overlap notebookOrientation', () => {
      const notebookCss = readCss('styles/notebook.css');

      const orientationTop = extractTop(notebookCss, '.notebookOrientation');
      const learningTop = extractTop(notebookCss, '.notebookLearningCue');

      expect(orientationTop).toBeTruthy();
      expect(learningTop).toBeTruthy();

      const orientationPx = parseInt(orientationTop!, 10);
      const learningPx = parseInt(learningTop!, 10);

      // Orientation cue is ~80px tall (16px padding * 2 + content).
      // Learning cue must start below orientation cue's bottom.
      expect(learningPx).toBeGreaterThanOrEqual(orientationPx + 80);
    });
  });

});
