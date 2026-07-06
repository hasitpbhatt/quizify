import { useState, useCallback, useEffect, useRef } from 'react';
import { useTheme } from './useTheme';
import { useSettingsStore } from '@/shared/stores/settingsStore';
import { useSessionStore } from '@/shared/stores/sessionStore';
import { WelcomeModal } from '@/features/welcome/WelcomeModal';
import { Toolbar } from '@/features/toolbar/Toolbar';
import { CanvasPage } from '@/features/canvas/CanvasPage';
import { ReactFlowProvider } from '@xyflow/react';
import { ProgressScreen } from './ProgressScreen';
import { fetchSourceContent } from '@/lib/fetchSourceContent';
import { chat } from '@/lib/llm/chat';
import { getProviderConfig } from '@/lib/llm/providers';
import { buildOutlineSystemPrompt, buildOutlineUserMessage } from '@/lib/prompts/outline';
import { parseOutline } from '@/lib/llm/outlineParser';
import { runPipeline, type PipelineStep } from '@/lib/pipeline';

export type JourneyStage = 'fetch' | 'outline' | PipelineStep;
export type JourneyState = 'pending' | 'active' | 'done' | 'error';

export interface JourneyProgress {
  stage: JourneyStage;
  label: string;
}

function extractHostname(url: string): string {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return url.split('/')[0] || url;
  }
}

export function App() {
  useTheme();
  const [page, setPage] = useState<'welcome' | 'progress' | 'canvas'>('welcome');
  const [progress, setProgress] = useState<JourneyProgress>({ stage: 'fetch', label: 'Reading the source…' });
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { load: loadSessions, currentId } = useSessionStore();

  // Restore canvas page on tab reload, and always load sessions on mount
  useEffect(() => {
    const savedPage = sessionStorage.getItem('quizify:page');
    const savedId = sessionStorage.getItem('quizify:currentId');
    const needsRestore = savedPage === 'canvas' && savedId;

    (async () => {
      await loadSessions();
      if (needsRestore) {
        const { select } = useSessionStore.getState();
        await select(savedId);
        if (useSessionStore.getState().currentId) {
          setPage('canvas');
        }
      }
    })();
  }, [loadSessions]);

  // Persist page to sessionStorage (skip 'progress' — can't resume mid-flight)
  useEffect(() => {
    if (page === 'progress') return;
    if (page === 'canvas') {
      sessionStorage.setItem('quizify:page', 'canvas');
    } else {
      sessionStorage.removeItem('quizify:page');
    }
  }, [page]);

  // Persist currentId to sessionStorage for crash-recovery
  useEffect(() => {
    if (currentId) {
      sessionStorage.setItem('quizify:currentId', currentId);
    } else {
      sessionStorage.removeItem('quizify:currentId');
    }
  }, [currentId]);

  // Re-hydrate sessions when the tab becomes visible (handles stale IDB connection)
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'visible') loadSessions();
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [loadSessions]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setProgress({ stage: 'fetch', label: 'Reading the source…' });
    setError(null);
    setPage('welcome');
  }, []);

  const handleGenerate = useCallback(async (url: string) => {
    const { apiKey, jinaToken, persona, provider } = useSettingsStore.getState();
    const cfg = getProviderConfig(provider);
    if ((cfg.requiresApiKey && !apiKey) || !persona) return;

    const abortController = new AbortController();
    abortRef.current = abortController;
    setError(null);
    setPage('progress');

    try {
      // Stage 1 — fetch the source
      setProgress({ stage: 'fetch', label: 'Reading the source…' });
      const src = await fetchSourceContent(url, { apiKey, jinaToken, persona, provider });

      if (abortController.signal.aborted) throw new DOMException('Aborted', 'AbortError');

      // Stage 2 — outline
      setProgress({ stage: 'outline', label: 'Sketching an outline…' });
      const messages = [
        { role: 'system' as const, content: buildOutlineSystemPrompt(persona, url) },
        { role: 'user' as const, content: buildOutlineUserMessage(src.content) },
      ];
      const res = await chat(messages, { apiKey, provider, responseFormat: 'json', signal: abortController.signal });
      const outline = parseOutline(res.content);

      if (abortController.signal.aborted) throw new DOMException('Aborted', 'AbortError');

      // Stage 3+ — pipeline (detail, quiz, summary, build)
      const { create: createSession, select } = useSessionStore.getState();
      const session = await createSession({ url: src.url, hostname: extractHostname(src.url), persona });
      // Re-select in case a concurrent store update cleared currentId.
      await select(session.id);
      
      // Navigate to canvas early so we can stream nodes in real-time
      setPage('canvas');

      await runPipeline(
        outline.title,
        outline.concepts.map(c => ({ id: c.id, title: c.title, explanation: c.explanation })),
        persona,
        apiKey,
        provider,
        src.url,
        (p) => { setProgress({ stage: p.step, label: p.label }); },
        abortController.signal,
      );

      if (abortController.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      await select(session.id);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.error('[app] generate failed:', err);
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setPage('welcome');
    } finally {
      abortRef.current = null;
    }
  }, []);

  if (page === 'progress') {
    return (
      <>
        <Toolbar />
        <ProgressScreen
          progress={progress}
          error={error}
          onCancel={handleCancel}
        />
      </>
    );
  }

  if (page === 'canvas') {
    return (
      <>
        <Toolbar />
        <ReactFlowProvider>
          <CanvasPage />
        </ReactFlowProvider>
      </>
    );
  }

  return <WelcomeModal onGenerate={handleGenerate} error={error ?? undefined} onClearError={() => setError(null)} />;
}
