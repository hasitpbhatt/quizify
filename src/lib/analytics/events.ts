export type AnalyticsEvent =
  | 'generation_started'
  | 'generation_completed'
  | 'generation_partial'
  | 'lesson_resumed'
  | 'quiz_attempted'
  | 'quiz_retried'
  | 'concept_advanced'
  | 'review_opened'
  | 'export_succeeded'
  | 'export_failed';

interface EventPayload {
  sessionId?: string;
  conceptId?: string;
  format?: string;
  source?: string;
  detail?: string;
}

export function trackEvent(event: AnalyticsEvent, payload: EventPayload = {}): void {
  if (import.meta.env.DEV) {
    console.debug('[analytics]', event, payload);
  }
  try {
    const queue = JSON.parse(localStorage.getItem('quizify:analytics') ?? '[]') as Array<{
      event: AnalyticsEvent;
      payload: EventPayload;
      at: number;
    }>;
    queue.push({ event, payload, at: Date.now() });
    localStorage.setItem('quizify:analytics', JSON.stringify(queue.slice(-100)));
  } catch {
    /* storage unavailable */
  }
}
