import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CanvasNode, CanvasEdge } from '@/shared/types';
import { makeQuizItem, makeContentResponse, makeSummaryResponse, resetCounter } from '../factories';

const mockExecute = vi.hoisted(() => vi.fn());
vi.mock('@/lib/llm/promptTask', () => ({
  executePromptTask: mockExecute,
}));

const mockUpdateCurrent = vi.hoisted(() => vi.fn());
vi.mock('@/shared/stores/sessionStore', () => ({
  useSessionStore: {
    getState: () => ({ updateCurrent: mockUpdateCurrent }),
  },
}));

vi.mock('@/shared/stores/toastStore', () => ({
  useToastStore: {
    getState: () => ({ add: vi.fn() }),
  },
}));

import {
  quizItemToQuizData,
  createMutex,
  pushConceptShells,
  runWithConcurrency,
  processOneConcept,
  runContentPhase,
  pushSummary,
  runPipeline,
  type ConceptInfo,
} from '@/lib/pipeline';
import type { Persona } from '@/shared/types';

beforeEach(() => {
  resetCounter();
  vi.clearAllMocks();
  mockExecute.mockReset();
  mockUpdateCurrent.mockReset();
  mockExecute.mockResolvedValue(makeContentResponse());
});

describe('quizItemToQuizData', () => {
  it('wraps a QuizItem with metadata', () => {
    const item = makeQuizItem({ format: 'shortAnswer', prompt: 'Q?' });
    const data = quizItemToQuizData(item, 'concept-1');

    expect(data.kind).toBe('quiz');
    expect(data.parentConceptId).toBe('concept-1');
    expect(data.attempts).toEqual([]);
    expect(data.state).toBe('untested');
    expect(data.format).toBe('shortAnswer');
    expect(data.prompt).toBe('Q?');
  });
});

describe('createMutex', () => {
  it('serializes concurrent async work', async () => {
    const mutex = createMutex();
    const order: number[] = [];

    const [, ,] = await Promise.all([
      mutex(async () => { const r = 1; await Promise.resolve(); order.push(r); return r; }),
      mutex(async () => { const r = 2; await Promise.resolve(); order.push(r); return r; }),
      mutex(async () => { const r = 3; await Promise.resolve(); order.push(r); return r; }),
    ]);

    expect(order).toEqual([1, 2, 3]);
  });
});

// ---------------------------------------------------------------------------
// pushConceptShells
// ---------------------------------------------------------------------------

describe('pushConceptShells', () => {
  it('pushes one shell node per concept with correct structure', () => {
    const nodes: CanvasNode[] = [];
    const concepts = [
      { id: 'c1', title: 'One', explanation: 'Exp 1' },
      { id: 'c2', title: 'Two', explanation: 'Exp 2' },
    ];

    pushConceptShells(nodes, concepts, 'https://example.com');

    expect(nodes).toHaveLength(2);

    const n0 = nodes[0];
    expect(n0.id).toBe('c1');
    expect(n0.type).toBe('concept');
    expect(n0.data).toMatchObject({
      kind: 'concept',
      index: 0,
      title: 'One',
      explanation: 'Exp 1',
      example: 'Loading...',
      sourceUrl: 'https://example.com',
    });

    const n1 = nodes[1];
    expect(n1.id).toBe('c2');
    expect(n1.data).toMatchObject({ index: 1, title: 'Two' });
  });

  it('omits sourceUrl when not provided', () => {
    const nodes: CanvasNode[] = [];
    pushConceptShells(nodes, [{ id: 'c1', title: 'T', explanation: 'E' }]);
    expect((nodes[0].data as unknown as Record<string, unknown>).sourceUrl).toBeUndefined();
  });
});



// ---------------------------------------------------------------------------
// runWithConcurrency
// ---------------------------------------------------------------------------

describe('runWithConcurrency', () => {
  it('runs all items in parallel when concurrency >= length', async () => {
    const items = [{ id: 'a', title: 'A', explanation: '' }, { id: 'b', title: 'B', explanation: '' }];
    const order: string[] = [];

    await runWithConcurrency(items, 5, async (item) => {
      await Promise.resolve();
      order.push(item.id);
    });

    expect(order.sort()).toEqual(['a', 'b']);
  });

  it('runs with bounded workers when concurrency < length', async () => {
    const items = Array.from({ length: 4 }, (_, i) => ({ id: `${i}`, title: `${i}`, explanation: '' }));
    let active = 0;
    let maxActive = 0;

    await runWithConcurrency(items, 2, async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active--;
    });

    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it('propagates abort errors', async () => {
    const items = [{ id: 'a', title: 'A', explanation: '' }];
    const abortErr = new DOMException('Aborted', 'AbortError');

    await expect(
      runWithConcurrency(items, 5, async () => { throw abortErr; }),
    ).rejects.toThrow('Aborted');
  });

  it('re-throws non-abort errors', async () => {
    const items = [{ id: 'a', title: 'A', explanation: '' }];

    await expect(
      runWithConcurrency(items, 5, async () => { throw new Error('boom'); }),
    ).rejects.toThrow('boom');
  });
});

// ---------------------------------------------------------------------------
// processOneConcept (LLM-dependent)
// ---------------------------------------------------------------------------

describe('processOneConcept', () => {
  const concept = { id: 'c1', title: 'Test Concept', explanation: 'Initial explanation' };
  const topic = 'Test Topic';
  const persona: Persona = 'curious';

  function setup(existingNodes: CanvasNode[] = []): {
    nodes: CanvasNode[];
    edges: CanvasEdge[];
    generated: ConceptInfo[];
    persist: ReturnType<typeof vi.fn>;
    notify: ReturnType<typeof vi.fn>;
  } {
    const nodes = existingNodes.length ? [...existingNodes] : [{ id: 'c1', type: 'concept' as const, position: { x: 0, y: 0 }, data: { kind: 'concept' as const, index: 0, title: 'Test Concept', explanation: 'Initial', example: 'Loading...' } }];
    const edges: CanvasEdge[] = [];
    const generated: ConceptInfo[] = [];
    const persist = vi.fn().mockResolvedValue(undefined);
    const notify = vi.fn();
    return { nodes, edges, generated, persist, notify };
  }

  it('calls executePromptTask and updates the concept node', async () => {
    mockExecute.mockResolvedValueOnce(makeContentResponse({
      detail: { explanation: 'Deep explanation', example: 'Great example' },
      quizzes: [
        makeQuizItem({ format: 'multipleChoice', prompt: 'Q1?' }),
        makeQuizItem({ format: 'trueFalse', prompt: 'Q2?' }),
      ],
    }));

    const { nodes, edges, generated, persist, notify } = setup();
    const tail = await processOneConcept(nodes, edges, generated, concept, 0, topic, persona, undefined, persist, notify);

    expect(tail).toBe('c1');
    expect(generated).toEqual([{ id: 'c1', title: 'Test Concept', explanation: 'Deep explanation', example: 'Great example' }]);
    expect((nodes[0].data as unknown as Record<string, unknown>).explanation).toBe('Deep explanation');
    expect((nodes[0].data as unknown as Record<string, unknown>).example).toBe('Great example');

    expect(nodes).toHaveLength(3);
    expect(nodes[1].id).toBe('c1-quiz-0');
    expect(nodes[1].type).toBe('quiz');
    expect((nodes[1].data as unknown as Record<string, unknown>).kind).toBe('quiz');
    expect(nodes[2].id).toBe('c1-quiz-1');

    expect(persist).toHaveBeenCalledOnce();
  });

  it('re-throws on abort', async () => {
    const { nodes, edges, generated, persist, notify } = setup();
    const signal = AbortSignal.abort();

    await expect(
      processOneConcept(nodes, edges, generated, concept, 0, topic, persona, signal, persist, notify),
    ).rejects.toThrow('Aborted');
  });

  it('returns null and notifies on non-abort error', async () => {
    mockExecute.mockRejectedValueOnce(new Error('API error'));

    const { nodes, edges, generated, persist, notify } = setup();
    const tail = await processOneConcept(nodes, edges, generated, concept, 0, topic, persona, undefined, persist, notify);

    expect(tail).toBeNull();
    expect(persist).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith('error', expect.stringContaining('Test Concept'), expect.any(String));
  });
});

// ---------------------------------------------------------------------------
// runContentPhase
// ---------------------------------------------------------------------------

describe('runContentPhase', () => {
  it('processes all concepts and sends progress notifications', async () => {
    const concepts = [
      { id: 'c1', title: 'One', explanation: 'E1' },
      { id: 'c2', title: 'Two', explanation: 'E2' },
    ];
    const nodes: CanvasNode[] = concepts.map(c => ({ id: c.id, type: 'concept' as const, position: { x: 0, y: 0 }, data: { kind: 'concept' as const, index: 0, title: c.title, explanation: c.explanation, example: '' } }));
    const edges: CanvasEdge[] = [];
    const generated: ConceptInfo[] = [];
    const tails: (string | null)[] = [];
    const persist = vi.fn().mockResolvedValue(undefined);
    const notify = vi.fn();

    mockExecute.mockResolvedValue(makeContentResponse({
      detail: { explanation: 'X', example: 'Y' },
      quizzes: [makeQuizItem({ format: 'multipleChoice', prompt: 'Q?' })],
    }));

    await runContentPhase(nodes, edges, generated, tails, concepts, 'Topic', 'curious' as Persona, undefined, persist, notify);

    expect(generated).toHaveLength(2);
    expect(tails).toEqual(['c1', 'c2']);
    expect(notify).toHaveBeenCalledWith('detail', expect.stringContaining('2/2'));
  });
});

// ---------------------------------------------------------------------------
// pushSummary
// ---------------------------------------------------------------------------

describe('pushSummary', () => {
  it('creates summary node and edge from last chain tail', async () => {
    mockExecute.mockResolvedValueOnce(makeSummaryResponse({
      recap: ['Takeaway 1'],
      finalQuiz: [makeQuizItem({ prompt: 'Final?' })],
    }));

    const nodes: CanvasNode[] = [];
    const generated: ConceptInfo[] = [{ id: 'c1', title: 'T', explanation: 'E', example: 'Ex' }];
    const persist = vi.fn().mockResolvedValue(undefined);
    const notify = vi.fn();

    await pushSummary(nodes, generated, 'Topic', 'curious' as Persona, undefined, persist, notify);

    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).toBe('__summary__');
    expect(nodes[0].type).toBe('summary');

    const data = nodes[0].data as unknown as Record<string, unknown>;
    expect(data.kind).toBe('summary');
    expect((data as any).recap).toEqual(['Takeaway 1']);
    expect((data as any).finalQuiz).toHaveLength(1);

    expect(persist).toHaveBeenCalledOnce();
    expect(notify).toHaveBeenCalledWith('summary', expect.any(String));
  });

  it('does nothing when no concepts generated', async () => {
    const nodes: CanvasNode[] = [];
    const persist = vi.fn().mockResolvedValue(undefined);
    const notify = vi.fn();

    await pushSummary(nodes, [], 'Topic', 'curious' as Persona, undefined, persist, notify);

    expect(nodes).toHaveLength(0);
    expect(persist).not.toHaveBeenCalled();
  });

  it('handles LLM failure gracefully (non-fatal)', async () => {
    mockExecute.mockRejectedValueOnce(new Error('Summary API down'));

    const nodes: CanvasNode[] = [];
    const generated: ConceptInfo[] = [{ id: 'c1', title: 'T', explanation: 'E', example: 'Ex' }];
    const persist = vi.fn().mockResolvedValue(undefined);
    const notify = vi.fn();

    await expect(
      pushSummary(nodes, generated, 'Topic', 'curious' as Persona, undefined, persist, notify),
    ).resolves.toBeUndefined();

    expect(nodes).toHaveLength(0);
    expect(persist).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith('error', expect.any(String), expect.any(String));
  });
});

// ---------------------------------------------------------------------------
// runPipeline (full integration)
// ---------------------------------------------------------------------------

describe('runPipeline', () => {
  const concepts = [
    { id: 'c1', title: 'One', explanation: 'E1' },
    { id: 'c2', title: 'Two', explanation: 'E2' },
  ];

  function contentFor(title: string) {
    return makeContentResponse({
      detail: { explanation: `Deep ${title}`, example: `Eg ${title}` },
      quizzes: [makeQuizItem({ format: 'multipleChoice', prompt: `Q ${title}?` })],
    });
  }

  it('orchestrates all phases and returns nodes/edges', async () => {
    mockExecute
      .mockResolvedValueOnce(contentFor('One'))
      .mockResolvedValueOnce(contentFor('Two'))
      .mockResolvedValueOnce(makeSummaryResponse({
        recap: ['R1'],
        finalQuiz: [makeQuizItem({ prompt: 'Final?' })],
      }));

    const onProgress = vi.fn();
    const result = await runPipeline('Test Title', concepts, 'curious' as Persona, 'https://example.com', onProgress);

    expect(result.nodes.length).toBeGreaterThan(0);

    const shellIds = result.nodes.filter(n => n.type === 'concept').map(n => n.id);
    expect(shellIds).toEqual(['c1', 'c2']);

    const quizIds = result.nodes.filter(n => n.type === 'quiz').map(n => n.id);
    expect(quizIds).toContain('c1-quiz-0');
    expect(quizIds).toContain('c2-quiz-0');

    const summaryNodes = result.nodes.filter(n => n.type === 'summary');
    expect(summaryNodes).toHaveLength(1);
    const summaryData = summaryNodes[0].data as unknown as Record<string, unknown>;
    expect(summaryData.kind).toBe('summary');
    expect((summaryData as any).finalQuiz).toHaveLength(1);

    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ step: 'done', label: 'Lesson ready!' }),
    );
  });

  it('completes even when summary LLM fails', async () => {
    mockExecute
      .mockResolvedValueOnce(contentFor('One'))
      .mockResolvedValueOnce(contentFor('Two'))
      .mockRejectedValueOnce(new Error('Summary fail'));

    const result = await runPipeline('Test', concepts, 'curious' as Persona);

    expect(result.nodes.some(n => n.type === 'summary')).toBe(false);
  });
});
