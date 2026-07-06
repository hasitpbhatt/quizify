const PARAGRAPH_SPLIT = /\n\s*\n/;
const TARGET_CHARS = 18_000;
const SOFT_MAX = 22_000;

export function truncateByParagraphs(text: string): string {
  const paragraphs = text.split(PARAGRAPH_SPLIT).filter((p) => p.trim().length > 0);

  const result: string[] = [];
  let total = 0;

  for (const p of paragraphs) {
    if (total + p.length > SOFT_MAX && total >= TARGET_CHARS) break;
    result.push(p);
    total += p.length;
  }

  return result.join('\n\n');
}
