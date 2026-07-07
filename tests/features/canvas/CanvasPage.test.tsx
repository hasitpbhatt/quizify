import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { CanvasPage } from '@/features/canvas/CanvasPage';
import { useSessionStore } from '@/shared/stores/sessionStore';
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
  useSessionStore.setState({ sessions: [], currentId: null, loaded: false });
});

afterEach(() => {
  useSessionStore.setState({ sessions: [], currentId: null, loaded: false });
});

describe('CanvasPage', () => {

  it('shows empty state when no session exists', async () => {
    renderCanvas();
    await waitFor(() => {
      expect(screen.getByText('No canvas data yet. Generate an outline first.')).toBeInTheDocument();
    });
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

});
