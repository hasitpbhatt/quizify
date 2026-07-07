import type {
  CanvasNode, CanvasEdge, Session, ConceptData, QuizData, NoteData,
  SummaryData, Persona, Attempt,
} from '@/shared/types';
import type { OutlineData, ConceptQuiz } from '@/lib/llm/outlineParser';
import type { QuizItem, ContentResponse } from '@/lib/llm/contentParser';
import type { SummaryResponse } from '@/lib/llm/summaryParser';
import type { GradeResult } from '@/lib/llm/gradeParser';

let _counter = 0;
export function resetCounter() { _counter = 0; }
function seq(prefix = ''): string {
  _counter++;
  return `${prefix}${_counter}`;
}

export function makePersona(overrides?: Persona): Persona {
  return overrides ?? 'curious';
}

export function makeAttempt(overrides?: Partial<Attempt>): Attempt {
  return {
    timestamp: Date.now(),
    given: 'test answer',
    grade: 'correct',
    ...overrides,
  };
}

export function makeQuizData(overrides?: Partial<QuizData>): QuizData {
  return {
    kind: 'quiz',
    parentConceptId: 'concept-1',
    format: 'multipleChoice',
    prompt: 'What is 2+2?',
    options: ['3', '4', '5', '6'],
    correctAnswer: '4',
    rationale: 'Basic arithmetic.',
    attempts: [],
    state: 'untested',
    ...overrides,
  };
}

export function makeConceptData(overrides?: Partial<ConceptData>): ConceptData {
  return {
    kind: 'concept',
    index: 0,
    title: 'Test Concept',
    explanation: 'A test concept explanation.',
    example: 'Test example.',
    ...overrides,
  };
}

export function makeNoteData(overrides?: Partial<NoteData>): NoteData {
  return {
    kind: 'note',
    text: 'A test note.',
    ...overrides,
  };
}

export function makeSummaryData(overrides?: Partial<SummaryData>): SummaryData {
  return {
    kind: 'summary',
    recap: ['Key takeaway 1', 'Key takeaway 2'],
    finalQuiz: [makeQuizData()],
    ...overrides,
  };
}

export function makeCanvasNode(overrides?: Partial<CanvasNode>): CanvasNode {
  return {
    id: seq('node-'),
    type: 'concept',
    position: { x: 100, y: 100 },
    data: makeConceptData(),
    ...overrides,
  };
}

export function makeCanvasEdge(overrides?: Partial<CanvasEdge>): CanvasEdge {
  return {
    id: seq('edge-'),
    source: 'node-a',
    target: 'node-b',
    type: 'wiggly',
    ...overrides,
  };
}

export function makeSession(overrides?: Partial<Session>): Session {
  const id = seq('session-');
  const now = Date.now();
  return {
    id,
    name: 'example.com',
    url: 'https://example.com',
    hostname: 'example.com',
    persona: 'student',
    createdAt: now,
    updatedAt: now,
    nodes: [makeCanvasNode({ id: `${id}-n1` })],
    edges: [],
    scores: {},
    ...overrides,
  };
}

export function makeConceptQuiz(overrides?: Partial<ConceptQuiz>): ConceptQuiz {
  return {
    format: 'mcq',
    question: 'Test question?',
    options: ['A', 'B', 'C', 'D'],
    answer: 'B',
    explanation: 'B is correct.',
    ...overrides,
  };
}

export function makeOutlineData(overrides?: Partial<OutlineData>): OutlineData {
  return {
    title: 'Test Canvas',
    summary: 'A test summary.',
    concepts: [
      { id: 'concept-1', title: 'Concept 1', explanation: 'Explanation 1', quiz: makeConceptQuiz() },
      { id: 'concept-2', title: 'Concept 2', explanation: 'Explanation 2', quiz: makeConceptQuiz({ format: 'true-false' }) },
    ],
    ...overrides,
  };
}

export function makeQuizItem(overrides?: Partial<QuizItem>): QuizItem {
  return {
    format: 'multipleChoice',
    prompt: 'Test question?',
    options: ['Option A', 'Option B', 'Option C', 'Option D'],
    blankedSentence: null,
    items: null,
    correctAnswer: 'Option B',
    acceptableAnswers: null,
    rationale: 'Option B is correct.',
    ...overrides,
  };
}

export function makeContentResponse(overrides?: Partial<ContentResponse>): ContentResponse {
  return {
    detail: { explanation: 'A detailed explanation.', example: 'An example.' },
    quizzes: [makeQuizItem(), makeQuizItem({ format: 'trueFalse' })],
    ...overrides,
  };
}

export function makeSummaryResponse(overrides?: Partial<SummaryResponse>): SummaryResponse {
  return {
    recap: ['Point 1', 'Point 2', 'Point 3'],
    finalQuiz: [makeQuizItem(), makeQuizItem({ format: 'trueFalse' })],
    ...overrides,
  };
}

export function makeGradeResult(overrides?: Partial<GradeResult>): GradeResult {
  return {
    grade: 'correct',
    rationale: 'Good answer.',
    idealAnswer: 'The ideal answer.',
    ...overrides,
  };
}

export function mockFetchResponse(data: unknown, status = 200, ok?: boolean): Response {
  return {
    ok: ok ?? (status >= 200 && status < 300),
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(typeof data === 'string' ? data : JSON.stringify(data)),
    headers: new Headers({ 'Content-Type': 'application/json' }),
    blob: () => Promise.resolve(new Blob([typeof data === 'string' ? data : JSON.stringify(data)])),
  } as Response;
}
