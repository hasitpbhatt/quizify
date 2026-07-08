import { describe, it, expect } from 'vitest';
import { sessionFilename, sortedNodes, formatDate } from '@/lib/export/types';
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

function conceptNode(id: string, index: number): CanvasNode {
  return { id, type: 'concept', position: { x: 0, y: 0 }, data: { kind: 'concept', index, title: `C${index}`, explanation: '', example: '' } };
}

function quizNode(id: string, parentConceptId: string): CanvasNode {
  return { id, type: 'quiz', position: { x: 0, y: 100 }, data: { kind: 'quiz', parentConceptId, format: 'multipleChoice', prompt: 'Q?', options: ['A', 'B'], correctAnswer: 'A', rationale: 'R', attempts: [], state: 'untested' } };
}

function noteNode(id: string, linkedConceptId?: string): CanvasNode {
  return { id, type: 'note', position: { x: 0, y: 200 }, data: { kind: 'note', text: 'A note', linkedConceptId } };
}

function summaryNode(id: string): CanvasNode {
  return { id, type: 'summary', position: { x: 0, y: 300 }, data: { kind: 'summary', recap: ['K1'], finalQuiz: [] } };
}

describe('sessionFilename', () => {
  it('builds filename from session name and date', () => {
    const session = makeSession({ name: 'My Article', createdAt: 1700000000000 });
    const name = sessionFilename(session, 'md');
    expect(name).toMatch(/^My-Article-\d{4}-\d{2}-\d{2}\.md$/);
  });

  it('strips special characters from name', () => {
    const session = makeSession({ name: 'Hello! @World #2024' });
    const name = sessionFilename(session, 'json');
    expect(name).toMatch(/^Hello-World-2024-\d{4}-\d{2}-\d{2}\.json$/);
  });

  it('truncates long names to 60 chars', () => {
    const session = makeSession({ name: 'A'.repeat(100) });
    const name = sessionFilename(session, 'md');
    const prefix = name.split('-')[0];
    expect(prefix.length).toBeLessThanOrEqual(60);
  });

  it('uses the supplied extension', () => {
    const session = makeSession();
    expect(sessionFilename(session, 'png')).toMatch(/\.png$/);
    expect(sessionFilename(session, 'json')).toMatch(/\.json$/);
    expect(sessionFilename(session, 'md')).toMatch(/\.md$/);
  });
});

describe('formatDate', () => {
  it('returns a formatted date string', () => {
    const result = formatDate(1700000000000);
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
    expect(result).toContain('2024');
  });

  it('handles current timestamp', () => {
    const now = Date.now();
    const result = formatDate(now);
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });
});

describe('sortedNodes', () => {
  it('returns empty array for empty session', () => {
    expect(sortedNodes(makeSession())).toEqual([]);
  });

  it('orders concepts by index then quizzes by Y position', () => {
    const c0 = conceptNode('c0', 0);
    const c1 = conceptNode('c1', 1);
    const q0 = quizNode('q0', 'c0');
    const session = makeSession({ nodes: [c1, q0, c0] });
    const result = sortedNodes(session);
    expect(result.map(n => n.id)).toEqual(['c0', 'q0', 'c1']);
  });

  it('places notes after their linked concept', () => {
    const c0 = conceptNode('c0', 0);
    const n0 = noteNode('n0', 'c0');
    const session = makeSession({ nodes: [n0, c0] });
    const result = sortedNodes(session);
    expect(result.map(n => n.id)).toEqual(['c0', 'n0']);
  });

  it('places summary last with its quizzes', () => {
    const c0 = conceptNode('c0', 0);
    const sum = summaryNode('sum');
    const sq = quizNode('sq', '__summary__');
    const session = makeSession({ nodes: [sq, sum, c0] });
    const result = sortedNodes(session);
    expect(result[result.length - 2].id).toBe('sum');
    expect(result[result.length - 1].id).toBe('sq');
  });

  it('places orphan notes at the end', () => {
    const c0 = conceptNode('c0', 0);
    const orphan = noteNode('orphan');
    const session = makeSession({ nodes: [orphan, c0] });
    const result = sortedNodes(session);
    expect(result[result.length - 1].id).toBe('orphan');
  });
});
