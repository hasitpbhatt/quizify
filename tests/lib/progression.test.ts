import { describe, it, expect } from 'vitest';
import { getUnlockedConceptIndex, getConceptIndex } from '@/lib/progression';
import type { CanvasNode } from '@/shared/types';

function conceptNode(id: string, index: number): CanvasNode {
  return { id, type: 'concept', position: { x: 0, y: 0 }, data: { kind: 'concept', index, title: `C${index}`, explanation: '', example: '' } };
}

function quizNode(id: string, parentConceptId: string, state: string): CanvasNode {
  return { id, type: 'quiz', position: { x: 0, y: 0 }, data: { kind: 'quiz', parentConceptId, format: 'multipleChoice', prompt: '', options: [], correctAnswer: '', rationale: '', attempts: [], state } as any };
}

describe('getUnlockedConceptIndex', () => {
  it('returns 0 when no concepts exist', () => {
    expect(getUnlockedConceptIndex([])).toBe(0);
  });

  it('returns 0 when first concept has no quizzes', () => {
    const nodes = [conceptNode('c1', 0), conceptNode('c2', 1)];
    expect(getUnlockedConceptIndex(nodes)).toBe(0);
  });

  it('returns 1 when first concept quizzes are all correct', () => {
    const nodes = [
      conceptNode('c1', 0),
      quizNode('q1', 'c1', 'correct'),
      conceptNode('c2', 1),
    ];
    expect(getUnlockedConceptIndex(nodes)).toBe(1);
  });

  it('returns 0 when first concept quiz is incorrect', () => {
    const nodes = [
      conceptNode('c1', 0),
      quizNode('q1', 'c1', 'incorrect'),
      conceptNode('c2', 1),
    ];
    expect(getUnlockedConceptIndex(nodes)).toBe(0);
  });

  it('returns 0 when first concept quiz is inProgress', () => {
    const nodes = [
      conceptNode('c1', 0),
      quizNode('q1', 'c1', 'inProgress'),
      conceptNode('c2', 1),
    ];
    expect(getUnlockedConceptIndex(nodes)).toBe(0);
  });

  it('returns concept count when all quizzes mastered', () => {
    const nodes = [
      conceptNode('c1', 0),
      quizNode('q1', 'c1', 'correct'),
      conceptNode('c2', 1),
      quizNode('q2', 'c2', 'correct'),
    ];
    expect(getUnlockedConceptIndex(nodes)).toBe(2);
  });

  it('stops at first concept with untested quiz', () => {
    const nodes = [
      conceptNode('c1', 0),
      quizNode('q1', 'c1', 'correct'),
      conceptNode('c2', 1),
      quizNode('q2', 'c2', 'untested'),
      conceptNode('c3', 2),
    ];
    expect(getUnlockedConceptIndex(nodes)).toBe(1);
  });

  it('requires all quizzes for a concept to be correct', () => {
    const nodes = [
      conceptNode('c1', 0),
      quizNode('q1', 'c1', 'correct'),
      quizNode('q2', 'c1', 'untested'),
      conceptNode('c2', 1),
    ];
    expect(getUnlockedConceptIndex(nodes)).toBe(0);
  });

  it('sorts concepts by index, not creation order', () => {
    const nodes = [
      conceptNode('c3', 2),
      conceptNode('c1', 0),
      quizNode('q1', 'c1', 'correct'),
      conceptNode('c2', 1),
    ];
    expect(getUnlockedConceptIndex(nodes)).toBe(1);
  });

  it('returns unlocked index when concept has no quizzes (auto-pass)', () => {
    const nodes = [
      conceptNode('c1', 0),
      conceptNode('c2', 1),
    ];
    expect(getUnlockedConceptIndex(nodes)).toBe(0);
  });
});

describe('getConceptIndex', () => {
  it('returns the index of a concept node by id', () => {
    const nodes = [conceptNode('c1', 0), conceptNode('c2', 5)];
    expect(getConceptIndex(nodes, 'c1')).toBe(0);
    expect(getConceptIndex(nodes, 'c2')).toBe(5);
  });

  it('returns -1 for non-existent id', () => {
    expect(getConceptIndex([conceptNode('c1', 0)], 'missing')).toBe(-1);
  });

  it('returns -1 when node exists but is not a concept', () => {
    const nodes = [quizNode('q1', 'c1', 'untested')];
    expect(getConceptIndex(nodes, 'q1')).toBe(-1);
  });

  it('returns -1 for empty nodes array', () => {
    expect(getConceptIndex([], 'anything')).toBe(-1);
  });
});
