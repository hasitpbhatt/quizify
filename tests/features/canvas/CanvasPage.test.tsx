import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { CanvasPage } from '@/features/canvas/CanvasPage';
import { useSessionStore } from '@/shared/stores/sessionStore';
import { useNotebookStore } from '@/shared/stores/notebookStore';
import * as sessionsDb from '@/lib/db/sessionsDb';
import * as factories from '../../shared/factories';

function renderCanvas() {
  return render(
    <ReactFlowProvider>
      <CanvasPage />
    </ReactFlowProvider>,
  );
}

beforeEach(() => {
  // The graph-rendering tests below assert against rendering without any
  // notebook-mode interaction (TTS, typewriter). Force graph mode so the
  // existing tests don't fight the notebook-by-default behavior. Tests
  // that explicitly exercise notebook mode reset this themselves.
  useNotebookStore.setState({
    notebookMode: false,
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
      expect(screen.getByText('No canvas data yet. Generate an outline first.')).toBeInTheDocument();
    });
  });

  it('shows building state while generating with no nodes yet', async () => {
    const session = factories.mockSession([], []);
    await sessionsDb.putSession(session);
    useSessionStore.setState({ sessions: [session], currentId: session.id, loaded: true });

    render(
      <ReactFlowProvider>
        <CanvasPage isGenerating progress={{ stage: 'detail', label: 'Generating content (0/3 done…)' }} />
      </ReactFlowProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Building your canvas')).toBeInTheDocument();
      expect(screen.getByText('Generating content (0/3 done…)')).toBeInTheDocument();
    });
    expect(screen.queryByText('No canvas data yet. Generate an outline first.')).not.toBeInTheDocument();
  });

  it('shows empty state when session has no nodes', async () => {
    const session = factories.mockSession([], []);
    await sessionsDb.putSession(session);
    useSessionStore.setState({ sessions: [session], currentId: session.id, loaded: true });

    renderCanvas();
    await waitFor(() => {
      expect(screen.getByText('No canvas data yet. Generate an outline first.')).toBeInTheDocument();
    });
  });

  it('renders concept and quiz nodes', async () => {
    const concept = factories.mockConceptNode();
    const quiz = factories.mockQuizNode(concept.id);
    const edge = factories.mockEdge(concept.id, quiz.id);
    const session = factories.mockSession([concept, quiz], [edge]);
    await sessionsDb.putSession(session);
    useSessionStore.setState({ sessions: [session], currentId: session.id, loaded: true });

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

    renderCanvas();

    await waitFor(() => {
      expect(screen.getByText('Quantum Computing')).toBeInTheDocument();
    });

    const state = useSessionStore.getState();
    const current = state.sessions.find(s => s.id === state.currentId);
    expect(current?.edges).toHaveLength(1);
    expect(current?.edges[0].source).toBe(concept.id);
    expect(current?.edges[0].target).toBe(quiz.id);
    expect(current?.edges[0].type).toBe('wiggly');
  });

  it('opens quiz modal when clicking a quiz node', async () => {
    const concept = factories.mockConceptNode();
    const quiz = factories.mockQuizNode(concept.id);
    const session = factories.mockSession([concept, quiz], [factories.mockEdge(concept.id, quiz.id)]);
    await sessionsDb.putSession(session);
    useSessionStore.setState({ sessions: [session], currentId: session.id, loaded: true });

    renderCanvas();

    await waitFor(() => expect(screen.getByText('Quantum Computing')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('What is a qubit?')).toBeInTheDocument());

    // Click the quiz node text — React Flow's onNodeClick fires via click event
    screen.getByText('What is a qubit?').click();

    await waitFor(() => {
      expect(screen.getByText('Multiple Choice')).toBeInTheDocument();
      expect(screen.getByText('Quantum bit')).toBeInTheDocument();
    });
  });

  it('adds a note node when clicking the Add note button', async () => {
    const concept = factories.mockConceptNode();
    const session = factories.mockSession([concept], []);
    await sessionsDb.putSession(session);
    useSessionStore.setState({ sessions: [session], currentId: session.id, loaded: true });

    renderCanvas();

    await waitFor(() => expect(screen.getByText('Quantum Computing')).toBeInTheDocument());

    screen.getByTitle('Add note').click();

    await waitFor(() => {
      expect(document.querySelectorAll('.react-flow__node-note')).toHaveLength(1);
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
      const session = factories.mockSession([factories.mockConceptNode()], []);
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

    it('does not show the cue in graph mode', async () => {
      const session = buildSession();
      await setupSession(session);

      renderCanvas();

      await waitFor(() => {
        expect(screen.queryByText('Start here')).not.toBeInTheDocument();
      });
    });
  });

});
