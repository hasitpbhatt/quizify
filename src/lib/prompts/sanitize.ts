export function sanitizeForPrompt(input: string): string {
  return input
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/\|\|/g, '\\|\\|')
    .trim();
}
