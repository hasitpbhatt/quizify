import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CanvasNode, CanvasEdge } from '@/shared/types';
import { makeQuizItem, makeContentResponse, makeQuizItemArray, makeSummaryResponse, resetCounter, makeCanvasNode, makeQuizData } from '../factories';

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

const mockGenerateConceptImage = vi.hoisted(() => vi.fn());
const mockRunCodeWorkbench = vi.hoisted(() => vi.fn());
vi.mock('@/lib/llm/agents', () => ({
  generateConceptImage: mockGenerateConceptImage,
  runCodeWorkbench: mockRunCodeWorkbench,
}));

const mockPutImage = vi.hoisted(() => vi.fn());
vi.mock('@/lib/db/imagesDb', () => ({
  putImage: mockPutImage,
}));

const mockSessionsDbGetSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/db/sessionsDb', () => ({
  getSession: mockSessionsDbGetSession,
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
  generateQuizForConcept,
  enrichConceptWithCode,
  enrichConceptWithImage,
  enrichConceptWithAgents,
  pushSummary,
  runPipeline,
  createRateLimitState,
  type ConceptInfo,
  type RateLimitState,
} from '@/lib/pipeline';
import type { Persona } from '@/shared/types';

beforeEach(() => {
  resetCounter();
  vi.clearAllMocks();
  mockExecute.mockReset();
  mockUpdateCurrent.mockReset();
  mockExecute.mockResolvedValue(makeContentResponse());
  mockGenerateConceptImage.mockResolvedValue({
    blob: new Blob(['img'], { type: 'image/jpeg' }),
    mime: 'image/jpeg',
    fileName: 'diagram.jpg',
    conversationId: 'conv_img',
  });
  mockRunCodeWorkbench.mockResolvedValue({
    text: '',
    code: undefined,
    codeOutput: undefined,
    conversationId: 'conv_code',
  });
  mockPutImage.mockResolvedValue(undefined);
  mockSessionsDbGetSession.mockResolvedValue(undefined);
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

    await runWithConcurrency(items, () => 5, async (item) => {
      await Promise.resolve();
      order.push(item.id);
    });

    expect(order.sort()).toEqual(['a', 'b']);
  });

  it('runs with bounded workers when concurrency < length', async () => {
    const items = Array.from({ length: 4 }, (_, i) => ({ id: `${i}`, title: `${i}`, explanation: '' }));
    let active = 0;
    let maxActive = 0;

    await runWithConcurrency(items, () => 2, async () => {
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
      runWithConcurrency(items, () => 5, async () => { throw abortErr; }),
    ).rejects.toThrow('Aborted');
  });

  it('re-throws non-abort errors', async () => {
    const items = [{ id: 'a', title: 'A', explanation: '' }];

    await expect(
      runWithConcurrency(items, () => 5, async () => { throw new Error('boom'); }),
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
    rateLimitState: RateLimitState;
  } {
    const nodes = existingNodes.length ? [...existingNodes] : [{ id: 'c1', type: 'concept' as const, position: { x: 0, y: 0 }, data: { kind: 'concept' as const, index: 0, title: 'Test Concept', explanation: 'Initial', example: 'Loading...' } }];
    const edges: CanvasEdge[] = [];
    const generated: ConceptInfo[] = [];
    const persist = vi.fn().mockResolvedValue(undefined);
    const notify = vi.fn();
    const rateLimitState = createRateLimitState();
    return { nodes, edges, generated, persist, notify, rateLimitState };
  }

  it('calls executePromptTask and updates the concept node', async () => {
    mockExecute.mockResolvedValueOnce(makeContentResponse({
      detail: { explanation: 'Deep explanation', example: 'Great example' },
    }));

    const { nodes, edges, generated, persist, notify, rateLimitState } = setup();
    const tail = await processOneConcept(nodes, edges, generated, concept, 0, topic, persona, undefined, persist, notify, rateLimitState);

    expect(tail).toBe('c1');
    expect(generated).toEqual([{ id: 'c1', title: 'Test Concept', explanation: 'Deep explanation', example: 'Great example' }]);
    expect((nodes[0].data as unknown as Record<string, unknown>).explanation).toBe('Deep explanation');
    expect((nodes[0].data as unknown as Record<string, unknown>).example).toBe('Great example');

    // processOneConcept no longer creates quiz nodes
    expect(nodes).toHaveLength(1);

    expect(persist).toHaveBeenCalledOnce();
  });

  it('re-throws on abort', async () => {
    const { nodes, edges, generated, persist, notify, rateLimitState } = setup();
    const signal = AbortSignal.abort();

    await expect(
      processOneConcept(nodes, edges, generated, concept, 0, topic, persona, signal, persist, notify, rateLimitState),
    ).rejects.toThrow('Aborted');
  });

  it('returns null and notifies on non-abort error', async () => {
    mockExecute.mockRejectedValue(new Error('API error'));

    const { nodes, edges, generated, persist, notify, rateLimitState } = setup();
    const tail = await processOneConcept(nodes, edges, generated, concept, 0, topic, persona, undefined, persist, notify, rateLimitState);

    expect(tail).toBeNull();
    expect(persist).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith('error', expect.stringContaining('Test Concept'), expect.any(String));
  });

  it('tracks 429 retries and bumps contentModelIndex', async () => {
    mockExecute.mockRejectedValue(new Error('Rate limited'));

    const { nodes, edges, generated, persist, notify, rateLimitState } = setup();
    await processOneConcept(nodes, edges, generated, concept, 0, topic, persona, undefined, persist, notify, rateLimitState);

    expect(rateLimitState.consecutive429s).toBeGreaterThanOrEqual(1);
    expect(rateLimitState.contentModelIndex).toBeGreaterThanOrEqual(1);
    expect(rateLimitState.last429At).toBeGreaterThan(0);
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
    const rateLimitState = createRateLimitState();

    mockExecute.mockResolvedValue(makeContentResponse({
      detail: { explanation: 'X', example: 'Y' },
    }));

    await runContentPhase(nodes, edges, generated, tails, concepts, 'Topic', 'curious' as Persona, undefined, persist, notify, rateLimitState);

    expect(generated).toHaveLength(2);
    expect(tails).toEqual(['c1', 'c2']);
    expect(notify).toHaveBeenCalledWith('detail', expect.stringContaining('2/2'));
  });

  it('processes concepts with parallelism, not strictly sequentially', async () => {
    const concepts = [
      { id: 'c1', title: 'One', explanation: 'E1' },
      { id: 'c2', title: 'Two', explanation: 'E2' },
      { id: 'c3', title: 'Three', explanation: 'E3' },
    ];
    let active = 0;
    let maxActive = 0;
    mockExecute.mockImplementation(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active--;
      return makeContentResponse();
    });

    const nodes: CanvasNode[] = concepts.map((c, i) => ({
      id: c.id,
      type: 'concept' as const,
      position: { x: 0, y: 0 },
      data: { kind: 'concept' as const, index: i, title: c.title, explanation: c.explanation, example: '' },
    }));
    const edges: CanvasEdge[] = [];
    const generated: ConceptInfo[] = [];
    const tails: (string | null)[] = [];
    const persist = vi.fn().mockResolvedValue(undefined);
    const notify = vi.fn();

    await runContentPhase(nodes, edges, generated, tails, concepts, 'Topic', 'curious' as Persona, undefined, persist, notify, createRateLimitState());

    expect(maxActive).toBeGreaterThan(1);
    expect(generated).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// generateQuizForConcept
// ---------------------------------------------------------------------------

function conceptNode(id: string, index: number): CanvasNode {
  return {
    id,
    type: 'concept' as const,
    position: { x: 0, y: 0 },
    data: { kind: 'concept' as const, index, title: id, explanation: 'E', example: '' },
  };
}

const c1Info: ConceptInfo = { id: 'c1', title: 'One', explanation: 'E1', example: 'Ex1' };

describe('generateQuizForConcept', () => {
  it('splices quiz nodes right after the concept and persists once', async () => {
    mockExecute.mockResolvedValue(makeQuizItemArray(2));

    const nodes = [conceptNode('c1', 0)];
    const persist = vi.fn().mockResolvedValue(undefined);

    await generateQuizForConcept(
      nodes, c1Info, 'Topic', 'curious' as Persona, undefined, persist, createRateLimitState(),
    );

    expect(nodes.map((n) => n.id)).toEqual(['c1', 'c1-quiz-0', 'c1-quiz-1']);
    expect(persist).toHaveBeenCalledOnce();
  });

  it('does nothing when concept info is missing', async () => {
    const nodes = [conceptNode('c1', 0)];
    const persist = vi.fn().mockResolvedValue(undefined);

    await generateQuizForConcept(
      nodes, undefined, 'Topic', 'curious' as Persona, undefined, persist, createRateLimitState(),
    );

    expect(mockExecute).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
  });

  it('is idempotent — skips concepts that already have quizzes', async () => {
    const nodes = [
      conceptNode('c1', 0),
      makeCanvasNode({ id: 'c1-quiz-0', type: 'quiz', data: makeQuizData({ parentConceptId: 'c1' }) }),
    ];
    const persist = vi.fn().mockResolvedValue(undefined);

    await generateQuizForConcept(
      nodes, c1Info, 'Topic', 'curious' as Persona, undefined, persist, createRateLimitState(),
    );

    expect(mockExecute).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
  });

  it('handles quiz LLM failure gracefully (non-fatal)', async () => {
    mockExecute.mockRejectedValue(new Error('Quiz API down'));

    const nodes = [conceptNode('c1', 0)];
    const persist = vi.fn().mockResolvedValue(undefined);

    await expect(
      generateQuizForConcept(
        nodes, c1Info, 'Topic', 'curious' as Persona, undefined, persist, createRateLimitState(),
      ),
    ).resolves.toBeUndefined();

    expect(nodes).toHaveLength(1);
    expect(persist).toHaveBeenCalledOnce();
  });

  it('ignores non-array task output instead of crashing', async () => {
    mockExecute.mockResolvedValue(makeContentResponse());

    const nodes = [conceptNode('c1', 0)];
    const persist = vi.fn().mockResolvedValue(undefined);

    await generateQuizForConcept(
      nodes, c1Info, 'Topic', 'curious' as Persona, undefined, persist, createRateLimitState(),
    );

    expect(nodes).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// enrichConceptWithCode / enrichConceptWithImage / enrichConceptWithAgents
// ---------------------------------------------------------------------------

describe('enrichConceptWithCode', () => {
  it('splices a workbench note after the concept when code+output present', async () => {
    mockRunCodeWorkbench.mockResolvedValue({
      text: '',
      code: 'print(6*7)',
      codeOutput: '42',
      conversationId: 'conv_code',
    });

    const nodes = [conceptNode('c1', 0)];
    await enrichConceptWithCode(nodes, c1Info, 'Topic', 'sess1', undefined);

    expect(nodes.map((n) => n.id)).toEqual(['c1', 'c1-workbench']);
    expect(nodes[1].type).toBe('note');
    const note = nodes[1].data as { kind: string; linkedConceptId?: string; text: string };
    expect(note.kind).toBe('note');
    expect(note.linkedConceptId).toBe('c1');
    expect(note.text).toContain('print(6*7)');
    expect(note.text).toContain('42');
  });

  it('does not splice when the model did not produce code', async () => {
    const nodes = [conceptNode('c1', 0)];
    await enrichConceptWithCode(nodes, c1Info, 'Topic', 'sess1', undefined);
    expect(nodes).toHaveLength(1);
  });

  it('is non-fatal on agents failure', async () => {
    mockRunCodeWorkbench.mockRejectedValue(new Error('agents down'));
    const nodes = [conceptNode('c1', 0)];
    await expect(
      enrichConceptWithCode(nodes, c1Info, 'Topic', 'sess1', undefined),
    ).resolves.toBeUndefined();
    expect(nodes).toHaveLength(1);
  });

  it('skips when concept info is missing', async () => {
    const nodes = [conceptNode('c1', 0)];
    await enrichConceptWithCode(nodes, undefined, 'Topic', 'sess1', undefined);
    expect(mockRunCodeWorkbench).not.toHaveBeenCalled();
  });
});

describe('enrichConceptWithImage', () => {
  it('stores the blob and splices an image node after the concept', async () => {
    mockGenerateConceptImage.mockResolvedValue({
      blob: new Blob(['img'], { type: 'image/png' }),
      mime: 'image/png',
      fileName: 'diagram.jpg',
      conversationId: 'conv_img',
    });

    const nodes = [conceptNode('c1', 0)];
    await enrichConceptWithImage(nodes, c1Info, 'Topic', 'sess1', undefined);

    expect(mockPutImage).toHaveBeenCalledWith('sess1', 'c1-diagram', expect.any(Blob), 'image/png');
    expect(nodes.map((n) => n.id)).toEqual(['c1', 'c1-diagram']);
    const img = nodes[1].data as { kind: string; mime: string; caption?: string; blobKey: string };
    expect(img.kind).toBe('image');
    expect(img.mime).toBe('image/png');
    expect(img.blobKey).toBe('sess1:c1-diagram');
    expect(img.caption).toContain('One');
  });

  it('is non-fatal when agents fail', async () => {
    mockGenerateConceptImage.mockRejectedValue(new Error('agents down'));
    const nodes = [conceptNode('c1', 0)];
    await expect(
      enrichConceptWithImage(nodes, c1Info, 'Topic', 'sess1', undefined),
    ).resolves.toBeUndefined();
    expect(nodes).toHaveLength(1);
    expect(mockPutImage).not.toHaveBeenCalled();
  });

  it('is non-fatal when blob storage fails (does not splice node)', async () => {
    mockPutImage.mockRejectedValue(new Error('storage full'));
    const nodes = [conceptNode('c1', 0)];
    await enrichConceptWithImage(nodes, c1Info, 'Topic', 'sess1', undefined);
    expect(nodes).toHaveLength(1);
  });
});

describe('enrichConceptWithAgents', () => {
  it('runs code then image and persists once', async () => {
    mockRunCodeWorkbench.mockResolvedValue({
      code: 'print(1)', codeOutput: '1', conversationId: 'conv_code',
    });
    mockGenerateConceptImage.mockResolvedValue({
      blob: new Blob(['x'], { type: 'image/jpeg' }),
      mime: 'image/jpeg',
      fileName: 'a.jpg',
      conversationId: 'conv_img',
    });

    const nodes = [conceptNode('c1', 0)];
    const persist = vi.fn().mockResolvedValue(undefined);
    await enrichConceptWithAgents(nodes, c1Info, 'Topic', 'sess1', undefined, persist);

    // code workbench note + image node spliced after the concept
    expect(nodes.map((n) => n.id)).toEqual(['c1', 'c1-workbench', 'c1-diagram']);
    expect(persist).toHaveBeenCalledOnce();
  });

  it('does nothing when concept info is missing', async () => {
    const persist = vi.fn().mockResolvedValue(undefined);
    await enrichConceptWithAgents([], undefined, 'Topic', 'sess1', undefined, persist);
    expect(mockRunCodeWorkbench).not.toHaveBeenCalled();
    expect(mockGenerateConceptImage).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
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

    await pushSummary(nodes, generated, 'Topic', 'curious' as Persona, undefined, persist, notify, createRateLimitState());

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

    await pushSummary(nodes, [], 'Topic', 'curious' as Persona, undefined, persist, notify, createRateLimitState());

    expect(nodes).toHaveLength(0);
    expect(persist).not.toHaveBeenCalled();
  });

  it('handles LLM failure gracefully (non-fatal)', async () => {
    mockExecute.mockRejectedValue(new Error('Summary API down'));

    const nodes: CanvasNode[] = [];
    const generated: ConceptInfo[] = [{ id: 'c1', title: 'T', explanation: 'E', example: 'Ex' }];
    const persist = vi.fn().mockResolvedValue(undefined);
    const notify = vi.fn();

    await expect(
      pushSummary(nodes, generated, 'Topic', 'curious' as Persona, undefined, persist, notify, createRateLimitState()),
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
    });
  }

  it('orchestrates all phases and returns nodes/edges', async () => {
    // Dispatch by task id instead of call order — quiz generation is now
    // interleaved with content inside runContentPhase, so the invocation order
    // is nondeterministic across concurrent workers.
    mockExecute.mockImplementation((task: { id: string }, _opts: unknown, input: unknown) => {
      switch (task.id) {
        case 'content':
          return Promise.resolve(contentFor((input as { title: string }).title));
        case 'quiz':
          return Promise.resolve(makeQuizItemArray(2));
        case 'summary':
          return Promise.resolve(
            makeSummaryResponse({ recap: ['R1'], finalQuiz: [makeQuizItem({ prompt: 'Final?' })] }),
          );
        default:
          return Promise.resolve(makeContentResponse());
      }
    });

    const onProgress = vi.fn();
    const result = await runPipeline('Test Title', concepts, 'curious' as Persona, 'https://example.com', onProgress);

    expect(result.nodes.length).toBeGreaterThan(0);

    const shellIds = result.nodes.filter(n => n.type === 'concept').map(n => n.id);
    expect(shellIds).toEqual(['c1', 'c2']);

    const quizIds = result.nodes.filter(n => n.type === 'quiz').map(n => n.id);
    expect(quizIds).toContain('c1-quiz-0');
    expect(quizIds).toContain('c1-quiz-1');
    expect(quizIds).toContain('c2-quiz-0');
    expect(quizIds).toContain('c2-quiz-1');

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
    mockExecute.mockImplementation((task: { id: string }, _opts: unknown, input: unknown) => {
      if (task.id === 'summary') return Promise.reject(new Error('Summary fail'));
      if (task.id === 'quiz') return Promise.resolve(makeQuizItemArray(2));
      if (task.id === 'content')
        return Promise.resolve(contentFor((input as { title: string }).title));
      return Promise.resolve(makeContentResponse());
    });

    const result = await runPipeline('Test', concepts, 'curious' as Persona);

    expect(result.nodes.some(n => n.type === 'summary')).toBe(false);
    // Quiz nodes still present even when summary fails
    expect(result.nodes.filter(n => n.type === 'quiz')).toHaveLength(4);
  });
});
