import type { CanvasNode, CanvasEdge, Session, Persona } from '@/shared/types';

export function mockConceptNode(overrides: Partial<CanvasNode> = {}): CanvasNode {
  const id = `concept-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  return {
    id,
    type: 'concept',
    position: { x: 0, y: 150 },
    data: {
      kind: 'concept',
      index: 0,
      title: 'Quantum Computing',
      explanation: 'Uses qubits instead of classical bits.',
      example: 'Superposition example.',
    },
    draggable: true,
    ...overrides,
  };
}

export function mockQuizNode(parentConceptId: string, overrides: Partial<CanvasNode> = {}): CanvasNode {
  return {
    id: `quiz-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type: 'quiz',
    position: { x: 400, y: 150 },
    data: {
      kind: 'quiz',
      parentConceptId,
      format: 'multipleChoice',
      prompt: 'What is a qubit?',
      options: ['Classical bit', 'Quantum bit', 'Byte', 'Nibble'],
      correctAnswer: 'Quantum bit',
      rationale: 'A qubit is the fundamental unit of quantum information.',
      attempts: [],
      state: 'untested',
    },
    draggable: true,
    ...overrides,
  };
}

export function mockEdge(source: string, target: string): CanvasEdge {
  return { id: `edge-${source}-${target}`, source, target, type: 'wiggly' };
}

export function mockSession(nodes: CanvasNode[], edges: CanvasEdge[]): Session {
  return {
    id: crypto.randomUUID(),
    name: 'Quantum Computing',
    url: 'https://en.wikipedia.org/wiki/Quantum_computing',
    hostname: 'en.wikipedia.org',
    persona: 'student' as Persona,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    nodes,
    edges,
    scores: {},
  };
}
