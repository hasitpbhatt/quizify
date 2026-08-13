import type { Persona } from '@/shared/types';

export async function fetchVoiceFeedback(opts: {
  conceptTitle: string;
  question: string;
  answer: string;
  grade: 'correct' | 'partial' | 'incorrect';
  rationale?: string;
  persona?: Persona;
}): Promise<string> {
  try {
    const res = await fetch('/api/voice-feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opts),
    });

    if (!res.ok) {
      return opts.grade === 'correct'
        ? "That's correct! Great understanding."
        : "Let's review this concept carefully.";
    }

    const data = (await res.json()) as { feedback?: string };
    return (
      data.feedback ||
      (opts.grade === 'correct'
        ? 'Spot on! You understood that concept.'
        : 'Not quite right. Let’s try again.')
    );
  } catch {
    return opts.grade === 'correct'
      ? 'Great job, that is correct!'
      : 'Let’s check the explanation again.';
  }
}
