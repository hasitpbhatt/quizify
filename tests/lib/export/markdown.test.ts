import { describe, it, expect } from 'vitest';
import { exportSessionMarkdown } from '@/lib/export/markdown';
import type { Session, CanvasNode } from '@/shared/types';

function makeSession(overrides?: Partial<Session>): Session {
  return {
    id: 's1',
    name: 'Test Article',
    url: 'https://example.com',
    hostname: 'example.com',
    persona: 'student',
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    nodes: [],
    edges: [],
    scores: {},
    ...overrides,
  };
}

function conceptNode(id: string, index: number, title: string): CanvasNode {
  return { id, type: 'concept', position: { x: 0, y: 0 }, data: { kind: 'concept', index, title, explanation: 'Detailed explanation.', example: 'An example.' } };
}

function quizNode(id: string, parentConceptId: string): CanvasNode {
  return { id, type: 'quiz', position: { x: 0, y: 0 }, data: { kind: 'quiz', parentConceptId, format: 'multipleChoice', prompt: 'What is 2+2?', options: ['3', '4', '5'], correctAnswer: '4', rationale: 'Basic math.', attempts: [], state: 'untested' } };
}

function summaryNode(id: string): CanvasNode {
  return { id, type: 'summary', position: { x: 0, y: 0 }, data: { kind: 'summary', recap: ['Key point 1', 'Key point 2'], finalQuiz: [] } };
}

function noteNode(id: string, text: string, linkedConceptId?: string): CanvasNode {
  return { id, type: 'note', position: { x: 0, y: 0 }, data: { kind: 'note', text, linkedConceptId } };
}

describe('exportSessionMarkdown', () => {
  it('includes session name as heading', () => {
    const session = makeSession();
    const md = exportSessionMarkdown(session);
    expect(md).toContain('# Test Article');
  });

  it('includes source URL and persona', () => {
    const session = makeSession();
    const md = exportSessionMarkdown(session);
    expect(md).toContain('https://example.com');
    expect(md).toContain('student');
  });

  it('renders concept nodes with heading and explanation', () => {
    const session = makeSession({ nodes: [conceptNode('c1', 0, 'My Concept')] });
    const md = exportSessionMarkdown(session);
    expect(md).toContain('## My Concept');
    expect(md).toContain('Detailed explanation.');
    expect(md).toContain('An example.');
  });

  it('renders quiz nodes with prompt and answer', () => {
    const session = makeSession({ nodes: [quizNode('q1', 'c1')] });
    const md = exportSessionMarkdown(session);
    expect(md).toContain('What is 2+2?');
    expect(md).toContain('**Answer:** 4');
    expect(md).toContain('Basic math.');
    expect(md).toContain('Multiple Choice');
  });

  it('renders summary nodes with recap bullets', () => {
    const session = makeSession({ nodes: [summaryNode('s1')] });
    const md = exportSessionMarkdown(session);
    expect(md).toContain('## Summary');
    expect(md).toContain('- Key point 1');
    expect(md).toContain('- Key point 2');
  });

  it('renders note nodes as blockquotes', () => {
    const session = makeSession({ nodes: [noteNode('n1', 'My personal note')] });
    const md = exportSessionMarkdown(session);
    expect(md).toContain('> _Note:_ My personal note');
  });

  it('skips empty notes', () => {
    const session = makeSession({ nodes: [noteNode('n1', '')] });
    const md = exportSessionMarkdown(session);
    expect(md).not.toContain('> _Note:_');
  });

  it('escapes markdown special characters in titles', () => {
    const session = makeSession({ nodes: [conceptNode('c1', 0, 'Star * Wars')] });
    const md = exportSessionMarkdown(session);
    expect(md).toContain('Star \\* Wars');
  });

  it('separates nodes with horizontal rules', () => {
    const session = makeSession({ nodes: [conceptNode('c1', 0, 'A'), quizNode('q1', 'c1')] });
    const md = exportSessionMarkdown(session);
    const hrCount = (md.match(/---/g) || []).length;
    expect(hrCount).toBeGreaterThanOrEqual(2);
  });

  it('handles ordering quiz format label', () => {
    const node: CanvasNode = { id: 'q1', type: 'quiz', position: { x: 0, y: 0 }, data: { kind: 'quiz', parentConceptId: 'c1', format: 'ordering', prompt: 'Order the steps', correctAnswer: 'A,B,C', rationale: 'R', items: ['A', 'B', 'C'], attempts: [], state: 'untested' } };
    const session = makeSession({ nodes: [node] });
    const md = exportSessionMarkdown(session);
    expect(md).toContain('Ordering');
    expect(md).toContain('1. A');
    expect(md).toContain('2. B');
  });

  it('renders fillBlank with blankedSentence', () => {
    const node: CanvasNode = { id: 'q1', type: 'quiz', position: { x: 0, y: 0 }, data: { kind: 'quiz', parentConceptId: 'c1', format: 'fillBlank', prompt: 'Fill in the blank', correctAnswer: 'world', rationale: 'R', blankedSentence: 'Hello ___!', acceptableAnswers: ['world', 'earth'], attempts: [], state: 'untested' } };
    const session = makeSession({ nodes: [node] });
    const md = exportSessionMarkdown(session);
    expect(md).toContain('Hello ___!');
    expect(md).toContain('_Acceptable:_ earth');
  });

  it('renders summary with final quiz count', () => {
    const fq: CanvasNode = { id: 'fq', type: 'quiz', position: { x: 0, y: 0 }, data: { kind: 'quiz', parentConceptId: '__summary__', format: 'trueFalse', prompt: 'Is the sky blue?', correctAnswer: 'True', rationale: 'R', options: ['True', 'False'], attempts: [], state: 'untested' } };
    const session = makeSession({ nodes: [summaryNode('s1'), fq] });
    const md = exportSessionMarkdown(session);
    expect(md).toContain('Final Quiz');
  });
});
