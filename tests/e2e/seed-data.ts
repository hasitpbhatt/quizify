import type { Page } from '@playwright/test';

// Must match src/lib/db/db.ts DB_VERSION
const DB_VERSION = 2;

// Pipeline position constants (mirrors src/lib/pipeline.ts)
const COL_WIDTH = 480;
const GAP_COL = 80;
const GAP_ROW = 85;
const PAIR_WIDTH = 1040;
const START_Y = 100;

export const SEED_SESSION_ID = 'e2e-canvas-restore';

export function createSeedSession() {
  const id = SEED_SESSION_ID;
  const now = Date.now();

  const concepts = [
    {
      id: `${id}-c1`,
      title: 'Light-Dependent Reactions',
      explanation:
        'These reactions require sunlight and occur in the thylakoid membranes. They split water molecules, releasing oxygen, and produce ATP and NADPH.',
      example: 'Like a solar panel charging a battery.',
    },
    {
      id: `${id}-c2`,
      title: 'Calvin Cycle',
      explanation:
        'The Calvin cycle uses ATP and NADPH from the light reactions to fix carbon dioxide into glucose. It occurs in the stroma of chloroplasts.',
      example: 'Like an assembly line building sugar molecules.',
    },
    {
      id: `${id}-c3`,
      title: 'Chlorophyll',
      explanation:
        'Chlorophyll is the green pigment that absorbs light energy, primarily red and blue wavelengths, while reflecting green light.',
      example: 'Like a solar cell tuned to specific light frequencies.',
    },
  ];

  const conceptNodes = concepts.map((c, i) => ({
    id: c.id,
    type: 'concept' as const,
    position: { x: 100 + i * PAIR_WIDTH, y: START_Y + 100 },
    data: {
      kind: 'concept' as const,
      index: i,
      title: c.title,
      explanation: c.explanation,
      example: c.example,
      generationStatus: 'ready' as const,
    },
    draggable: true,
  }));

  const quizNodes: Array<{
    id: string;
    type: 'quiz';
    position: { x: number; y: number };
    data: {
      kind: 'quiz';
      parentConceptId: string;
      format: 'multipleChoice' | 'trueFalse';
      prompt: string;
      options: string[];
      correctAnswer: string;
      rationale: string;
      attempts: never[];
      state: 'untested';
    };
    draggable: true;
  }> = [];

  const edges: Array<{
    id: string;
    source: string;
    target: string;
    type: 'wiggly';
  }> = [];

  concepts.forEach((c, i) => {
    const cursorX = 100 + i * PAIR_WIDTH;

    for (let qi = 0; qi < 2; qi++) {
      const qId = `${c.id}-quiz-${qi}`;
      const isMcq = qi === 0;
      quizNodes.push({
        id: qId,
        type: 'quiz',
        position: { x: cursorX + COL_WIDTH + GAP_COL, y: START_Y + qi * (130 + 28 + GAP_ROW) },
        data: {
          kind: 'quiz',
          parentConceptId: c.id,
          format: isMcq ? 'multipleChoice' : 'trueFalse',
          prompt: isMcq
            ? `What is the primary output of ${c.title}?`
            : `True or false: ${c.title} occurs in all plants.`,
          options: isMcq ? ['ATP', 'Glucose', 'Oxygen', 'Water'] : ['True', 'False'],
          correctAnswer: isMcq ? 'ATP' : 'True',
          rationale: 'Based on the concept explanation.',
          attempts: [],
          state: 'untested',
        },
        draggable: true,
      });

      edges.push({
        id: `edge-${c.id}-${qId}`,
        source: c.id,
        target: qId,
        type: 'wiggly',
      });
    }
  });

  // Chain edges between concepts
  for (let i = 0; i < concepts.length - 1; i++) {
    const lastQuizId = `${concepts[i].id}-quiz-1`;
    const nextConceptId = concepts[i + 1].id;
    edges.push({
      id: `edge-${lastQuizId}-${nextConceptId}`,
      source: lastQuizId,
      target: nextConceptId,
      type: 'wiggly',
    });
  }

  const nodes = [...conceptNodes, ...quizNodes];

  return {
    id,
    name: 'Photosynthesis',
    url: 'https://en.wikipedia.org/wiki/Photosynthesis',
    hostname: 'en.wikipedia.org',
    persona: 'curious' as const,
    createdAt: now,
    updatedAt: now,
    nodes,
    edges,
    scores: {} as Record<string, never>,
  };
}

export async function seedDatabase(page: Page): Promise<void> {
  const session = createSeedSession();
  await page.evaluate(({ data, version }) => {
    return new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('quizify', version);
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('source_cache')) {
          db.createObjectStore('source_cache', { keyPath: 'url' });
        }
        if (!db.objectStoreNames.contains('sessions')) {
          db.createObjectStore('sessions', { keyPath: 'id' });
        }
      };
      request.onsuccess = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const tx = db.transaction('sessions', 'readwrite');
        tx.objectStore('sessions').put(data);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      };
      request.onerror = () => reject(request.error);
    });
  }, { data: session, version: DB_VERSION });
}


