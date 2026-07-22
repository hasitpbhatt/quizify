export type Persona = 'curious' | 'student' | 'professional' | 'expert';

export type Theme = 'light' | 'dark' | 'auto';

export type QuizFormat =
  'multipleChoice' | 'trueFalse' | 'shortAnswer' | 'freeText' | 'fillBlank' | 'ordering';

export type QuizState =
  'untested' | 'inProgress' | 'correct' | 'partial' | 'incorrect' | 'mastered';

export type NodeKind = 'concept' | 'quiz' | 'note' | 'summary';
export type SourceProvenance = 'fetched' | 'topic-generated' | 'legacy-unknown';
export type ConceptGenerationStatus = 'generating' | 'ready' | 'failed' | 'skipped';

export const SUMMARY_NODE_ID = '__summary__';

export interface Attempt {
  timestamp: number;
  given: string | string[];
  grade: 'correct' | 'partial' | 'incorrect';
  rationale?: string;
  idealAnswer?: string;
}

export interface QuizData {
  kind: 'quiz';
  parentConceptId: string;
  format: QuizFormat;
  prompt: string;
  options?: string[];
  blankedSentence?: string;
  items?: string[];
  correctAnswer: string;
  acceptableAnswers?: string[];
  rationale: string;
  attempts: Attempt[];
  bestScore?: number;
  state: QuizState;
}

export interface ConceptData {
  kind: 'concept';
  index: number;
  title: string;
  explanation: string;
  example: string;
  streaming?: boolean;
  generationStatus?: ConceptGenerationStatus;
  generationError?: string;
  sourceReference?: string;
  sourceUrl?: string;
}

export interface NoteData {
  kind: 'note';
  text: string;
  linkedConceptId?: string;
}

export interface SummaryData {
  kind: 'summary';
  recap: string[];
  finalQuiz: QuizData[];
  results?: SummaryResults;
}

export interface SummaryResults {
  masteryPct: number;
  conceptsMastered: number;
  conceptsShaky: number;
  conceptsUntested: number;
  perConcept: Record<string, QuizState>;
}

export type NodeData = ConceptData | QuizData | NoteData | SummaryData;

export interface CanvasNode {
  id: string;
  type: NodeKind;
  position: { x: number; y: number };
  data: NodeData;
  draggable?: boolean;
  selected?: boolean;
}

export interface CanvasEdge {
  id: string;
  source: string;
  target: string;
  type?: string;
}

export interface Session {
  /** Lightweight learner memory used for resume and review decisions. */
  lastConceptId?: string;
  completedConceptIds?: string[];
  nextReviewAtByConceptId?: Record<string, number>;
  lastActivityAt?: number;
  id: string;
  name: string;
  url: string;
  hostname: string;
  sourceProvenance?: SourceProvenance;
  persona: Persona;
  createdAt: number;
  updatedAt: number;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  scores: Record<string, { best: number; attempts: number }>;
}

export interface GenerationProgress {
  total: number;
  completed: number;
  failed: number;
  status: 'idle' | 'generating' | 'cancelling' | 'done' | 'error';
  error?: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
