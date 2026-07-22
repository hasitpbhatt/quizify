import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ReactFlowProvider, Position } from '@xyflow/react';
import { ConceptNode } from '@/features/canvas/nodes/ConceptNode';
import { QuizNode } from '@/features/canvas/nodes/QuizNode';
import { SummaryNode } from '@/features/canvas/nodes/SummaryNode';
import { NoteNode } from '@/features/canvas/nodes/NoteNode';
import { WigglyEdge } from '@/features/canvas/edges/WigglyEdge';
import { useSessionStore } from '@/shared/stores/sessionStore';
import { useNotebookStore } from '@/shared/stores/notebookStore';
import * as sessionsDb from '@/lib/db/sessionsDb';
import * as factories from '../../shared/factories';
import type { CanvasNode, CanvasEdge } from '@/shared/types';
import type { NodeProps, EdgeProps } from '@xyflow/react';

function createNodeProps(canvasNode: CanvasNode, overrides: Partial<NodeProps> = {}): NodeProps {
  return {
    id: canvasNode.id,
    type: canvasNode.type,
    data: canvasNode.data as unknown as Record<string, unknown>,
    position: canvasNode.position,
    selected: canvasNode.selected ?? false,
    dragging: false,
    zIndex: 0,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    ...overrides,
  } as unknown as NodeProps;
}

function createEdgeProps(edge: CanvasEdge, overrides: Partial<EdgeProps> = {}): EdgeProps {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceX: 100,
    sourceY: 200,
    targetX: 400,
    targetY: 200,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    selected: false,
    type: 'wiggly' as const,
    sourceHandleId: null,
    targetHandleId: null,
    markerStart: undefined,
    markerEnd: undefined,
    data: {},
    label: undefined,
    labelStyle: undefined,
    labelShowBg: undefined,
    labelBgStyle: undefined,
    labelBgPadding: undefined,
    labelBgBorderRadius: undefined,
    style: {},
    animated: false,
    hidden: false,
    curvature: 0.55,
    ...overrides,
  } as unknown as EdgeProps;
}

beforeEach(() => {
  useSessionStore.setState({ sessions: [], currentId: null, loaded: false });
  useNotebookStore.setState({ notebookMode: false, ttsPlaying: false, ttsPaused: false, segmentIndex: 0, totalSegments: 0 });
});

// ── ConceptNode ──────────────────────────────────────────

describe('ConceptNode', () => {
  it('renders title and explanation', () => {
    const node = factories.mockConceptNode();
    render(<ReactFlowProvider><ConceptNode {...createNodeProps(node)} /></ReactFlowProvider>);

    expect(screen.getByText('Quantum Computing')).toBeInTheDocument();
    expect(screen.getByText('Uses qubits instead of classical bits.')).toBeInTheDocument();
    expect(screen.getByText('Listen')).toBeInTheDocument();
  });

  it('shows loading class when example is Loading...', () => {
    const node = factories.mockConceptNode({
      data: {
        kind: 'concept',
        index: 0,
        title: 'Test',
        explanation: 'Test explanation.',
        example: 'Loading...',
        generationStatus: 'generating',
      },
    });
    const { container } = render(<ReactFlowProvider><ConceptNode {...createNodeProps(node)} /></ReactFlowProvider>);

    const nodeDiv = container.querySelector('[class*="node"]');
    expect(nodeDiv?.className).toContain('loading');
  });

  it('renders full content in notebook mode with skipTyping', () => {
    useNotebookStore.setState({ notebookMode: true, ttsPlaying: false, ttsPaused: false, segmentIndex: 0, totalSegments: 0 });
    const node = factories.mockConceptNode({
      data: {
        kind: 'concept',
        index: 0,
        title: 'Quantum Computing',
        explanation: 'Uses qubits instead of classical bits.',
        example: 'Superposition example.',
      },
    });
    render(<ReactFlowProvider><ConceptNode {...createNodeProps(node, { data: { ...node.data, skipTyping: true } as any })} /></ReactFlowProvider>);

    expect(screen.getByText('Quantum Computing')).toBeInTheDocument();
    expect(screen.getByText('Uses qubits instead of classical bits.')).toBeInTheDocument();
    expect(screen.queryByText('Listen')).not.toBeInTheDocument();
  });
});

// ── QuizNode ─────────────────────────────────────────────

describe('QuizNode', () => {
  it('renders quiz prompt and format label', () => {
    const concept = factories.mockConceptNode();
    const quiz = factories.mockQuizNode(concept.id);
    render(<ReactFlowProvider><QuizNode {...createNodeProps(quiz)} /></ReactFlowProvider>);

    expect(screen.getByText('What is a qubit?')).toBeInTheDocument();
    expect(screen.getByText('Multiple Choice')).toBeInTheDocument();
  });

  it('shows click to answer when no attempts', () => {
    const concept = factories.mockConceptNode();
    const quiz = factories.mockQuizNode(concept.id);
    render(<ReactFlowProvider><QuizNode {...createNodeProps(quiz)} /></ReactFlowProvider>);

    expect(screen.getByText('click to answer')).toBeInTheDocument();
  });

  it('shows correct state badge', () => {
    const concept = factories.mockConceptNode();
    const quiz = factories.mockQuizNode(concept.id, {
      data: {
        kind: 'quiz',
        parentConceptId: concept.id,
        format: 'multipleChoice' as const,
        prompt: 'Test?',
        options: ['A', 'B', 'C', 'D'],
        correctAnswer: 'A',
        rationale: 'Explanation.',
        attempts: [{ timestamp: 1, given: 'A', grade: 'correct' as const, rationale: 'OK', idealAnswer: 'A' }],
        state: 'correct' as const,
      },
    });
    render(<ReactFlowProvider><QuizNode {...createNodeProps(quiz)} /></ReactFlowProvider>);

    expect(screen.getByText('correct')).toBeInTheDocument();
    expect(screen.getByText('1 attempt')).toBeInTheDocument();
  });

  it('shows incorrect state badge', () => {
    const concept = factories.mockConceptNode();
    const quiz = factories.mockQuizNode(concept.id, {
      data: {
        kind: 'quiz',
        parentConceptId: concept.id,
        format: 'multipleChoice' as const,
        prompt: 'Test?',
        options: ['A', 'B', 'C', 'D'],
        correctAnswer: 'A',
        rationale: 'Explanation.',
        attempts: [{ timestamp: 1, given: 'B', grade: 'incorrect' as const, rationale: 'Nope', idealAnswer: 'A' }],
        state: 'incorrect' as const,
      },
    });
    render(<ReactFlowProvider><QuizNode {...createNodeProps(quiz)} /></ReactFlowProvider>);

    expect(screen.getByText('incorrect')).toBeInTheDocument();
  });

  it('shows mastered state badge', () => {
    const concept = factories.mockConceptNode();
    const quiz = factories.mockQuizNode(concept.id, {
      data: {
        kind: 'quiz',
        parentConceptId: concept.id,
        format: 'multipleChoice' as const,
        prompt: 'Test?',
        options: ['A', 'B', 'C', 'D'],
        correctAnswer: 'A',
        rationale: 'Explanation.',
        attempts: [
          { timestamp: 1, given: 'A', grade: 'correct' as const, rationale: 'OK', idealAnswer: 'A' },
          { timestamp: 2, given: 'A', grade: 'correct' as const, rationale: 'OK', idealAnswer: 'A' },
        ],
        state: 'mastered' as const,
      },
    });
    render(<ReactFlowProvider><QuizNode {...createNodeProps(quiz)} /></ReactFlowProvider>);

    expect(screen.getByText('mastered')).toBeInTheDocument();
    expect(screen.getByText('2 attempts')).toBeInTheDocument();
  });

  it('renders trueFalse format', () => {
    const concept = factories.mockConceptNode();
    const quiz = factories.mockQuizNode(concept.id, {
      data: {
        kind: 'quiz',
        parentConceptId: concept.id,
        format: 'trueFalse' as const,
        prompt: 'Is this true?',
        options: ['True', 'False'],
        correctAnswer: 'True',
        rationale: 'Because.',
        attempts: [],
        state: 'untested' as const,
      },
    });
    render(<ReactFlowProvider><QuizNode {...createNodeProps(quiz)} /></ReactFlowProvider>);

    expect(screen.getByText('True False')).toBeInTheDocument();
    expect(screen.getByText('Is this true?')).toBeInTheDocument();
  });
});

// ── SummaryNode ──────────────────────────────────────────

describe('SummaryNode', () => {
  it('renders recap items and final quiz button', () => {
    const node: CanvasNode = {
      id: '__summary__',
      type: 'summary',
      position: { x: 0, y: 0 },
      data: {
        kind: 'summary',
        recap: ['Key insight one.', 'Key insight two.'],
        finalQuiz: [{
          kind: 'quiz' as const,
          format: 'multipleChoice' as const,
          prompt: 'Final Q?',
          options: ['A', 'B', 'C', 'D'],
          correctAnswer: 'A',
          rationale: 'R.',
          attempts: [],
          state: 'untested' as const,
          parentConceptId: '',
        }],
      },
    };
    render(<ReactFlowProvider><SummaryNode {...createNodeProps(node)} /></ReactFlowProvider>);

    expect(screen.getByText('Summary')).toBeInTheDocument();
    expect(screen.getByText('Key insight one.')).toBeInTheDocument();
    expect(screen.getByText('Key insight two.')).toBeInTheDocument();
    expect(screen.getByText('1 final quiz question')).toBeInTheDocument();
    expect(screen.getByText('Take Final Quiz')).toBeInTheDocument();
  });

  it('shows results when available', () => {
    const node: CanvasNode = {
      id: '__summary__',
      type: 'summary',
      position: { x: 0, y: 0 },
      data: {
        kind: 'summary',
        recap: ['Insight.'],
        finalQuiz: [],
        results: { masteryPct: 60, conceptsMastered: 3, conceptsShaky: 1, conceptsUntested: 1, perConcept: {} },
      },
    };
    render(<ReactFlowProvider><SummaryNode {...createNodeProps(node)} /></ReactFlowProvider>);

    expect(screen.getByText('60%')).toBeInTheDocument();
    expect(screen.getByText('Mastery')).toBeInTheDocument();
    expect(screen.queryByText('Take Final Quiz')).not.toBeInTheDocument();
  });

  it('renders multiple final quiz questions with plural', () => {
    const node: CanvasNode = {
      id: '__summary__',
      type: 'summary',
      position: { x: 0, y: 0 },
      data: {
        kind: 'summary',
        recap: ['Insight.'],
        finalQuiz: [
          {
            kind: 'quiz' as const,
            format: 'multipleChoice' as const,
            prompt: 'Q1?',
            options: ['A', 'B'],
            correctAnswer: 'A',
            rationale: 'R.',
            attempts: [],
            state: 'untested' as const,
            parentConceptId: '',
          },
          {
            kind: 'quiz' as const,
            format: 'trueFalse' as const,
            prompt: 'Q2?',
            options: ['True', 'False'],
            correctAnswer: 'True',
            rationale: 'R.',
            attempts: [],
            state: 'untested' as const,
            parentConceptId: '',
          },
        ],
      },
    };
    render(<ReactFlowProvider><SummaryNode {...createNodeProps(node)} /></ReactFlowProvider>);

    expect(screen.getByText('2 final quiz questions')).toBeInTheDocument();
  });
});

// ── NoteNode ─────────────────────────────────────────────

describe('NoteNode', () => {
  it('renders note text', () => {
    const node: CanvasNode = {
      id: 'note-1',
      type: 'note',
      position: { x: 0, y: 0 },
      data: { kind: 'note', text: 'My study note.' },
    };
    render(<ReactFlowProvider><NoteNode {...createNodeProps(node)} /></ReactFlowProvider>);

    expect(screen.getByText('My study note.')).toBeInTheDocument();
  });

  it('enters edit mode on double-click', () => {
    const node: CanvasNode = {
      id: 'note-1',
      type: 'note',
      position: { x: 0, y: 0 },
      data: { kind: 'note', text: 'My note.' },
    };
    render(<ReactFlowProvider><NoteNode {...createNodeProps(node)} /></ReactFlowProvider>);

    const textDiv = screen.getByText('My note.');
    fireEvent.doubleClick(textDiv.closest('[class*="node"]')!);

    const textarea = document.querySelector('textarea');
    expect(textarea).toBeInTheDocument();
    expect(textarea).toHaveValue('My note.');
  });

  it('saves note on blur after editing', async () => {
    const node: CanvasNode = {
      id: 'note-1',
      type: 'note',
      position: { x: 0, y: 0 },
      data: { kind: 'note', text: 'Original note.' },
    };
    const session = factories.mockSession([node], []);
    await sessionsDb.putSession(session);
    useSessionStore.setState({ sessions: [session], currentId: session.id, loaded: true });

    const { container } = render(<ReactFlowProvider><NoteNode {...createNodeProps(node)} /></ReactFlowProvider>);

    const nodeDiv = container.querySelector('[class*="node"]')!;
    fireEvent.doubleClick(nodeDiv);

    const textarea = document.querySelector('textarea')!;
    fireEvent.change(textarea, { target: { value: 'Updated note.' } });
    fireEvent.blur(textarea);

    await waitFor(async () => {
      const state = useSessionStore.getState();
      const current = state.sessions.find(s => s.id === session.id);
      const noteNode = current?.nodes.find(n => n.id === 'note-1');
      expect(noteNode).toBeDefined();
      const noteData = noteNode!.data as { kind: string; text: string };
      expect(noteData.text).toBe('Updated note.');
    });
  });

  it('cancels edit on Escape', () => {
    const node: CanvasNode = {
      id: 'note-1',
      type: 'note',
      position: { x: 0, y: 0 },
      data: { kind: 'note', text: 'Original note.' },
    };
    const { container } = render(<ReactFlowProvider><NoteNode {...createNodeProps(node)} /></ReactFlowProvider>);

    const nodeDiv = container.querySelector('[class*="node"]')!;
    fireEvent.doubleClick(nodeDiv);

    const textarea = document.querySelector('textarea')!;
    fireEvent.change(textarea, { target: { value: 'Changed text.' } });
    fireEvent.keyDown(textarea, { key: 'Escape' });

    expect(screen.getByText('Original note.')).toBeInTheDocument();
  });

  it('deletes note on delete button click', async () => {
    const node: CanvasNode = {
      id: 'note-1',
      type: 'note',
      position: { x: 0, y: 0 },
      data: { kind: 'note', text: 'Delete me.' },
    };
    const session = factories.mockSession([node], []);
    await sessionsDb.putSession(session);
    useSessionStore.setState({ sessions: [session], currentId: session.id, loaded: true });
    const { container } = render(<ReactFlowProvider><NoteNode {...createNodeProps(node)} /></ReactFlowProvider>);

    const deleteBtn = container.querySelector('[title="Delete note"]')!;
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      const state = useSessionStore.getState();
      const current = state.sessions.find(s => s.id === session.id);
      expect(current?.nodes).toHaveLength(0);
    });
  });
});

// ── WigglyEdge ───────────────────────────────────────────

describe('WigglyEdge', () => {
  it('renders SVG element', () => {
    const edge = factories.mockEdge('source-1', 'target-1');
    const { container } = render(
      <svg>
        <WigglyEdge {...createEdgeProps(edge)} />
      </svg>,
    );

    const path = container.querySelector('path');
    expect(path).toBeInTheDocument();
    expect(path).toHaveAttribute('d');
  });

  it('renders roughjs-generated path inside g element', () => {
    const edge = factories.mockEdge('source-1', 'target-1');
    const { container } = render(
      <svg>
        <WigglyEdge {...createEdgeProps(edge)} />
      </svg>,
    );

    const g = container.querySelector('g');
    expect(g).toBeInTheDocument();
    // roughjs should have appended a child path to the g element
    expect(g?.children.length).toBeGreaterThanOrEqual(1);
  });

  it('changes stroke color when selected', () => {
    const edge = factories.mockEdge('source-1', 'target-1');
    const { container } = render(
      <svg>
        <WigglyEdge {...createEdgeProps(edge, { selected: true })} />
      </svg>,
    );

    const g = container.querySelector('g');
    const roughPath = g?.querySelector('path');
    expect(roughPath).toBeInTheDocument();
    expect(roughPath?.getAttribute('stroke')).toBe('var(--accent)');
  });
});
