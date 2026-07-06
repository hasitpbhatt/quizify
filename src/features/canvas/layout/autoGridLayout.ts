export type LayoutNodeInput = {
  id: string;
  type: 'concept' | 'quiz' | 'summary';
  data: { kind: string };
};

export type LayoutNodeOutput = {
  id: string;
  position: { x: number; y: number };
};

export type LayoutResult = {
  nodes: LayoutNodeOutput[];
};

const CONCEPT_WIDTH = 380;
const CONCEPT_HEIGHT = 300;
const QUIZ_HEIGHT = 220;
const COLUMN_GAP = 160;
const ROW_GAP = 120;
const PADDING_X = 80;
const PADDING_Y = 80;
const ROWS_PER_COLUMN = 4;

export function autoGridLayout(items: LayoutNodeInput[]): LayoutResult {
  const result: LayoutNodeOutput[] = [];
  let summaryNode: LayoutNodeInput | undefined;

  // Group items by concept (concept followed by its quiz nodes)
  const concepts: string[] = [];
  const groups = new Map<string, LayoutNodeInput[]>();

  for (const item of items) {
    if (item.type === 'concept') {
      concepts.push(item.id);
      groups.set(item.id, [item]);
    } else if (item.type === 'quiz') {
      const buf = item.data as { kind: string; parentConceptId?: string };
      const parentId = buf.parentConceptId;
      const targetId = parentId && groups.has(parentId) ? parentId : concepts[concepts.length - 1];
      const group = groups.get(targetId);
      if (group) {
        group.push(item);
      }
    } else if (item.type === 'summary') {
      summaryNode = item;
    }
  }

  concepts.forEach((conceptId, index) => {
    const group = groups.get(conceptId);
    if (!group) return;

    const column = Math.floor(index / ROWS_PER_COLUMN);
    const row = index % ROWS_PER_COLUMN;

    const baseX = PADDING_X + column * (CONCEPT_WIDTH + COLUMN_GAP);
    const baseY = PADDING_Y + row * (CONCEPT_HEIGHT + QUIZ_HEIGHT + ROW_GAP);

    group.forEach((item, itemIndex) => {
      result.push({
        id: item.id,
        position: {
          x: baseX,
          y: baseY + itemIndex * (item.type === 'concept' ? 0 : QUIZ_HEIGHT + 8),
        },
      });
    });
  });

  // Place summary node at the end
  if (summaryNode) {
    const lastGroupIndex = concepts.length - 1;
    const lastColumn = Math.floor(lastGroupIndex / ROWS_PER_COLUMN);
    const lastRow = lastGroupIndex % ROWS_PER_COLUMN;

    let sx: number;
    let sy: number;

    if (lastRow + 1 < ROWS_PER_COLUMN) {
      // Place in the next row of the last column
      sx = PADDING_X + lastColumn * (CONCEPT_WIDTH + COLUMN_GAP);
      sy = PADDING_Y + (lastRow + 1) * (CONCEPT_HEIGHT + QUIZ_HEIGHT + ROW_GAP);
    } else {
      // Start a new column
      sx = PADDING_X + (lastColumn + 1) * (CONCEPT_WIDTH + COLUMN_GAP);
      sy = PADDING_Y;
    }

    result.push({
      id: summaryNode.id,
      position: { x: sx, y: sy },
    });
  }

  return { nodes: result };
}
