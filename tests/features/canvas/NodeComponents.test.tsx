import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConceptNode } from '@/features/canvas/nodes/ConceptNode';
import { QuizNode } from '@/features/canvas/nodes/QuizNode';
import { SummaryNode } from '@/features/canvas/nodes/SummaryNode';
import { NoteNode } from '@/features/canvas/nodes/NoteNode';
import { useSessionStore } from '@/shared/stores/sessionStore';
import { useNotebookStore } from '@/shared/stores/notebookStore';
import * as factories from '../../shared/factories';
import type { CanvasNode } from '@/shared/types';

beforeEach(() => {
  useSessionStore.setState({ sessions: [], currentId: null, loaded: false });
  useNotebookStore.setState({ notebookMode: false, ttsPlaying: false, ttsPaused: false, segmentIndex: 0, totalSegments: 0 });
});

// ── ConceptNode ──────────────────────────────────────────

describe('ConceptNode', () => {
  it('renders title and explanation', () => {
    const node = factories.mockConceptNode();
    render(
      <ConceptNode
        id={node.id}
        data={node.data as import('@/shared/types').ConceptData}
        currentConceptIndex={0}
        isGenerating={false}
        onClick={() => {}}
      />,
    );

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
    const { container } = render(
      <ConceptNode
        id={node.id}
        data={node.data as import('@/shared/types').ConceptData}
        currentConceptIndex={0}
        isGenerating={false}
        onClick={() => {}}
      />,
    );

    const nodeDiv = container.querySelector('[class*="node"]');
    expect(nodeDiv?.className).toContain('loading');
  });

  it('renders full content with skipTyping when concept index < currentConceptIndex', () => {
    useNotebookStore.setState({ notebookMode: true, ttsPlaying: false, ttsPaused: false, segmentIndex: 0, totalSegments: 0 });
    const node = factories.mockConceptNode({
      data: {
        kind: 'concept',
        index: 0,
        title: 'Test Title',
        explanation: 'Full explanation text that should not be truncated.',
        example: 'Some example.',
      },
    });

    render(
      <ConceptNode
        id={node.id}
        data={node.data as import('@/shared/types').ConceptData}
        currentConceptIndex={1}
        isGenerating={false}
        onClick={() => {}}
      />,
    );

    expect(screen.getByText('Test Title')).toBeInTheDocument();
    expect(screen.getByText('Full explanation text that should not be truncated.')).toBeInTheDocument();
  });

  it('shows locked badge when concept index > currentConceptIndex', () => {
    const node = factories.mockConceptNode({
      data: {
        kind: 'concept',
        index: 2,
        title: 'Advanced',
        explanation: 'Too advanced.',
        example: 'N/A',
      },
    });

    render(
      <ConceptNode
        id={node.id}
        data={node.data as import('@/shared/types').ConceptData}
        currentConceptIndex={1}
        isGenerating={false}
        onClick={() => {}}
      />,
    );

    expect(screen.getByText('Locked')).toBeInTheDocument();
  });

  it('shows generation error for failed concepts', () => {
    const node = factories.mockConceptNode({
      data: {
        kind: 'concept',
        index: 0,
        title: 'Failed',
        explanation: 'N/A',
        example: 'N/A',
        generationStatus: 'failed',
      },
    });

    render(
      <ConceptNode
        id={node.id}
        data={node.data as import('@/shared/types').ConceptData}
        currentConceptIndex={0}
        isGenerating={false}
        onClick={() => {}}
      />,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});

// ── ConceptNode TTS ────────────────────────────────────

describe('ConceptNode TTS', () => {
  it('renders the Listen button', () => {
    const node = factories.mockConceptNode();
    render(
      <ConceptNode
        id={node.id}
        data={node.data as import('@/shared/types').ConceptData}
        currentConceptIndex={0}
        isGenerating={false}
        onClick={() => {}}
      />,
    );
    expect(screen.getByText('Listen')).toBeInTheDocument();
  });

  it('falls back to Web Speech when server TTS is unavailable', async () => {
    const speakSpy = vi.spyOn(window.speechSynthesis, 'speak');
    const node = factories.mockConceptNode();

    render(
      <ConceptNode
        id={node.id}
        data={node.data as import('@/shared/types').ConceptData}
        currentConceptIndex={0}
        isGenerating={false}
        onClick={() => {}}
      />,
    );

    // The fetch to /api/tts will fail (no server), triggering the Web Speech fallback
    const btn = screen.getByText('Listen');
    fireEvent.click(btn);

    await vi.waitFor(() => {
      expect(speakSpy).toHaveBeenCalled();
    }, { timeout: 3000 });
  });

  it('disables the button while loading (before response)', async () => {
    // Stub fetch to hang so we can observe the loading state
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(() => new Promise<never>(() => {}));

    const node = factories.mockConceptNode();
    render(
      <ConceptNode
        id={node.id}
        data={node.data as import('@/shared/types').ConceptData}
        currentConceptIndex={0}
        isGenerating={false}
        onClick={() => {}}
      />,
    );

    fireEvent.click(screen.getByText('Listen'));

    expect(screen.getByTitle('Listen')).toBeDisabled();
    globalThis.fetch = originalFetch;
  });
});

// ── QuizNode ──────────────────────────────────────────

describe('QuizNode', () => {
  it('renders quiz prompt and state badge', () => {
    const node = factories.mockQuizNode('concept-1');

    render(
      <QuizNode
        id={node.id}
        data={node.data as import('@/shared/types').QuizData}
        currentConceptIndex={0}
        revealed={true}
        onClick={() => {}}
      />,
    );

    expect(screen.getByText('What is a qubit?')).toBeInTheDocument();
    expect(screen.getByText('untested')).toBeInTheDocument();
  });

  it('shows attempt count', () => {
    const node = factories.mockQuizNode('concept-1', {
      data: {
        kind: 'quiz',
        parentConceptId: 'concept-1',
        format: 'multipleChoice',
        prompt: 'Test?',
        options: ['A', 'B'],
        correctAnswer: 'A',
        rationale: 'R',
        attempts: [{ timestamp: 1, given: 'A', grade: 'correct' }],
        state: 'correct',
      },
    });

    render(
      <QuizNode
        id={node.id}
        data={node.data as import('@/shared/types').QuizData}
        currentConceptIndex={0}
        revealed={true}
        onClick={() => {}}
      />,
    );

    expect(screen.getByText('1 attempt')).toBeInTheDocument();
  });

  it('shows format label', () => {
    const node = factories.mockQuizNode('concept-1');
    render(
      <QuizNode
        id={node.id}
        data={node.data as import('@/shared/types').QuizData}
        currentConceptIndex={0}
        revealed={true}
        onClick={() => {}}
      />,
    );

    expect(screen.getByText('Multiple Choice')).toBeInTheDocument();
  });
});

// ── SummaryNode ──────────────────────────────────────────

describe('SummaryNode', () => {
  it('renders recap items', () => {
    const summaryNode: CanvasNode = {
      id: '__summary__',
      type: 'summary',
      data: {
        kind: 'summary',
        recap: ['Takeaway 1', 'Takeaway 2'],
        finalQuiz: [],
      },
    };

    render(
      <SummaryNode
        id={summaryNode.id}
        data={summaryNode.data as import('@/shared/types').SummaryData}
        onClick={() => {}}
      />,
    );

    expect(screen.getByText('Takeaway 1')).toBeInTheDocument();
    expect(screen.getByText('Takeaway 2')).toBeInTheDocument();
  });

  it('shows quiz count', () => {
    const summaryNode: CanvasNode = {
      id: '__summary__',
      type: 'summary',
      data: {
        kind: 'summary',
        recap: ['R'],
        finalQuiz: [
          {
            kind: 'quiz',
            parentConceptId: '__summary__',
            format: 'multipleChoice',
            prompt: 'Final?',
            options: ['A', 'B'],
            correctAnswer: 'A',
            rationale: 'R',
            attempts: [],
            state: 'untested',
          },
        ],
      },
    };

    render(
      <SummaryNode
        id={summaryNode.id}
        data={summaryNode.data as import('@/shared/types').SummaryData}
        onClick={() => {}}
      />,
    );

    expect(screen.getByText('1 final quiz question')).toBeInTheDocument();
  });

  it('displays mastery results when available', () => {
    const summaryNode: CanvasNode = {
      id: '__summary__',
      type: 'summary',
      data: {
        kind: 'summary',
        recap: ['R'],
        finalQuiz: [],
        results: { masteryPct: 85, conceptsMastered: 3, conceptsShaky: 1, conceptsUntested: 0, perConcept: {} },
      },
    };

    render(
      <SummaryNode
        id={summaryNode.id}
        data={summaryNode.data as import('@/shared/types').SummaryData}
        onClick={() => {}}
      />,
    );

    expect(screen.getByText('85%')).toBeInTheDocument();
    expect(screen.getByText('Mastery')).toBeInTheDocument();
  });
});

// ── NoteNode ──────────────────────────────────────────

describe('NoteNode', () => {
  it('renders note text', () => {
    const noteNode: CanvasNode = {
      id: 'note-1',
      type: 'note',
      data: { kind: 'note', text: 'My note' },
    };

    render(<NoteNode id={noteNode.id} data={noteNode.data as import('@/shared/types').NoteData} />);

    expect(screen.getByText('My note')).toBeInTheDocument();
    expect(screen.getByText('Edit')).toBeInTheDocument();
  });

  it('starts editing when text is empty', () => {
    const noteNode: CanvasNode = {
      id: 'note-empty',
      type: 'note',
      data: { kind: 'note', text: '' },
    };

    render(<NoteNode id={noteNode.id} data={noteNode.data as import('@/shared/types').NoteData} />);

    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('shows linked concept badge', () => {
    const noteNode: CanvasNode = {
      id: 'note-linked',
      type: 'note',
      data: { kind: 'note', text: 'Linked note', linkedConceptId: 'concept-1' },
    };

    render(<NoteNode id={noteNode.id} data={noteNode.data as import('@/shared/types').NoteData} />);

    expect(screen.getByText(/Linked to concept-1/)).toBeInTheDocument();
  });


});
