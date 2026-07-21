import type { Session, ConceptData, QuizData, SummaryData, NoteData } from '@/shared/types';
import { downloadBlob, sessionFilename, sortedNodes, formatDate } from './types';

function escapeMd(text: string): string {
  return text.replace(/([*_~`#])/g, '\\$1');
}

function formatQuiz(quiz: QuizData): string {
  const lines: string[] = [];
  const formatLabel = quiz.format
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
  lines.push(`**${escapeMd(quiz.prompt)}**  _(${formatLabel})_`);
  lines.push('');

  if (quiz.options && quiz.options.length > 0) {
    for (const opt of quiz.options) {
      lines.push(`- ${escapeMd(opt)}`);
    }
    lines.push('');
  }

  if (quiz.blankedSentence) {
    lines.push(`> ${escapeMd(quiz.blankedSentence)}`);
    lines.push('');
  }

  if (quiz.items && quiz.items.length > 0) {
    for (let i = 0; i < quiz.items.length; i++) {
      lines.push(`${i + 1}. ${escapeMd(quiz.items[i])}`);
    }
    lines.push('');
  }

  lines.push(`**Answer:** ${escapeMd(quiz.correctAnswer)}`);
  if (quiz.acceptableAnswers && quiz.acceptableAnswers.length > 0) {
    lines.push(`_Acceptable:_ ${quiz.acceptableAnswers.map((a) => escapeMd(a)).join(', ')}`);
  }
  lines.push('');
  lines.push(`> ${escapeMd(quiz.rationale)}`);
  lines.push('');

  return lines.join('\n');
}

function formatConcept(concept: ConceptData): string {
  const lines: string[] = [];
  lines.push(`## ${escapeMd(concept.title)}`);
  lines.push('');
  lines.push(escapeMd(concept.explanation));
  lines.push('');
  if (concept.example) {
    lines.push(`**Example:** ${escapeMd(concept.example)}`);
    lines.push('');
  }
  return lines.join('\n');
}

function formatSummary(summary: SummaryData): string {
  const lines: string[] = [];
  lines.push('## Summary');
  lines.push('');
  for (const item of summary.recap) {
    lines.push(`- ${escapeMd(item)}`);
  }
  lines.push('');
  if (summary.finalQuiz.length > 0) {
    lines.push(
      `### Final Quiz (${summary.finalQuiz.length} question${summary.finalQuiz.length !== 1 ? 's' : ''})`,
    );
    lines.push('');
    for (const quiz of summary.finalQuiz) {
      lines.push(formatQuiz(quiz));
    }
  }
  if (summary.results) {
    lines.push(`**Mastery:** ${summary.results.masteryPct}%`);
    lines.push('');
  }
  return lines.join('\n');
}

function formatNote(note: NoteData): string {
  if (!note.text.trim()) return '';
  return `> _Note:_ ${escapeMd(note.text)}\n`;
}

export function exportSessionMarkdown(session: Session): string {
  const lines: string[] = [];

  lines.push(`# ${escapeMd(session.name)}`);
  lines.push('');
  lines.push(
    `**Source:** ${session.url}  ·  **Date:** ${formatDate(session.createdAt)}  ·  **Persona:** ${session.persona}`,
  );
  lines.push('');
  lines.push('---');
  lines.push('');

  const ordered = sortedNodes(session);

  for (const node of ordered) {
    if (node.data.kind === 'concept') {
      lines.push(formatConcept(node.data as ConceptData));
    } else if (node.data.kind === 'quiz') {
      lines.push(formatQuiz(node.data as QuizData));
    } else if (node.data.kind === 'summary') {
      lines.push(formatSummary(node.data as SummaryData));
    } else if (node.data.kind === 'note') {
      const text = formatNote(node.data as NoteData);
      if (text) lines.push(text);
    }
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

export function downloadSessionMarkdown(session: Session) {
  const md = exportSessionMarkdown(session);
  const blob = new Blob([md], { type: 'text/markdown' });
  downloadBlob(blob, sessionFilename(session, 'md'));
}
