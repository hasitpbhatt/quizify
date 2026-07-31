import { useState, useCallback, useEffect, useRef } from 'react';
import { useTheme } from './useTheme';
import { useSettingsStore } from '@/shared/stores/settingsStore';
import { useSessionStore } from '@/shared/stores/sessionStore';
import { useNotebookStore } from '@/shared/stores/notebookStore';
import { WelcomeModal } from '@/features/welcome/WelcomeModal';
import { Toolbar } from '@/features/toolbar/Toolbar';
import { CanvasPage } from '@/features/canvas/CanvasPage';

import { ProgressScreen } from './ProgressScreen';
import { Toaster } from './Toaster';
import { fetchSourceContent } from '@/lib/fetchSourceContent';
import { executePromptTask } from '@/lib/llm/promptTask';
import { outlineTask } from '@/lib/tasks/outlineTask';
import { runPipeline, type PipelineStep } from '@/lib/pipeline';
import { useToastStore } from '@/shared/stores/toastStore';
import { isDebugMode } from '@/lib/debug';
import { useLatencyStore } from '@/shared/stores/latencyStore';
import { LatencyPanel } from './LatencyPanel';
import { ErrorBoundary } from '@/lib/components/ErrorBoundary';
import { trackEvent } from '@/lib/analytics/events';
import type { SourceProvenance } from '@/shared/types';
import '@/styles/global.css';

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
  const [progress, setProgress] = useState<JourneyProgress>({
    stage: 'fetch',
    label: 'Reading the source\u2026',
  });
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const reachedCanvasRef = useRef(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const { load: loadSessions, sessions, currentId, select } = useSessionStore();
  const [previewData, setPreviewData] = useState<{
    title: string;
    snippet: string;
    provenance: SourceProvenance;
    url: string;
    onConfirm: () => void;
    onCancel: () => void;
  } | null>(null);

  // Restore canvas page on tab reload, and always load sessions on mount
  useEffect(() => {
    const savedPage = sessionStorage.getItem('quizify:page');
    const savedId = sessionStorage.getItem('quizify:currentId');
    const needsRestore = savedPage === 'canvas' && savedId;

    (async () => {
      await loadSessions();
      if (needsRestore) {
        if (!savedId) return;
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

  // Warn only while generation is actually in flight. Canvas changes are
  // continuously persisted, so warning on every visit creates alert fatigue.
  useEffect(() => {
    if (!isGenerating) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isGenerating]);

  // Abort in-flight pipeline on unmount (navigating away mid-generation)
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  const goWelcome = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setProgress({ stage: 'fetch', label: 'Reading the source\u2026' });
    setError(null);
    setPreviewData(null);
    setPage('welcome');
  }, []);

  const handleCancel = goWelcome;

  const handleSelectSession = useCallback(
    (id: string) => {
      trackEvent('lesson_resumed', { sessionId: id });
      select(id);
      setPage('canvas');
    },
    [select],
  );

  const handleGenerate = useCallback(async (url: string) => {
    const { persona } = useSettingsStore.getState();
    if (!persona) return;

    trackEvent('generation_started', { source: url });

    const abortController = new AbortController();
    abortRef.current = abortController;
    reachedCanvasRef.current = false;
    setIsGenerating(true);
    setError(null);
    setPage('progress');

    const latency = useLatencyStore.getState();
    latency.reset();
    latency.setVisible(isDebugMode());

    try {
      // Stage 1 — fetch the source
      latency.startStage('fetch', 'Reading the source\u2026');
      setProgress({ stage: 'fetch', label: 'Reading the source\u2026' });
      const src = await fetchSourceContent(url, { persona, signal: abortController.signal });
      latency.endStage('fetch');

      if (abortController.signal.aborted) throw new DOMException('Aborted', 'AbortError');

      // Fetched pages continue automatically. Only generated/unknown cached
      // material needs an explicit trust checkpoint.
      const isTest = typeof process !== 'undefined' && process.env.NODE_ENV === 'test';
      if (!isTest && src.provenance !== 'fetched') {
        await new Promise<void>((resolve, reject) => {
          let title = '';
          const lines = src.content.split('\n');
          for (const line of lines) {
            const match = line.match(/^#+\s+(.+)$/);
            if (match) {
              title = match[1].trim();
              break;
            }
          }
          if (!title) {
            title = extractHostname(src.url);
          }

          let cleanText = src.content
            .replace(/[#*`_]/g, '')
            .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
            .trim();
          const sentences = cleanText.split(/[.!?]\s+/);
          const snippet = sentences.slice(0, 3).join('. ') + (sentences.length > 3 ? '...' : '.');

          const onConfirm = () => {
            setPreviewData(null);
            resolve();
          };
          const onCancel = () => {
            setPreviewData(null);
            handleCancel();
            reject(new DOMException('Aborted', 'AbortError'));
          };

          setPreviewData({
            title,
            snippet,
            provenance: src.provenance,
            url: src.url,
            onConfirm,
            onCancel,
          });
        });
      }

      if (abortController.signal.aborted) throw new DOMException('Aborted', 'AbortError');

      // Stage 2 — outline
      latency.startStage('outline', 'Sketching an outline\u2026');
      setProgress({ stage: 'outline', label: 'Sketching an outline\u2026' });
      const outline = await executePromptTask(
        outlineTask,
        {
          persona,
          signal: abortController.signal,
          context: { url },
          onRetry: (info) =>
            useToastStore
              .getState()
              .add(`API busy, retrying\u2026 (${info.attempt + 1}/${info.maxRetries + 1})`),
        },
        src.content,
      );
      latency.endStage('outline');

      if (abortController.signal.aborted) throw new DOMException('Aborted', 'AbortError');

      // Stage 3+ — pipeline (detail, quiz, summary, build)
      const { create: createSession, select } = useSessionStore.getState();
      useNotebookStore.setState({ notebookMode: true, completedTypingNodeIds: {} });
      const session = await createSession({
        url: src.url,
        hostname: extractHostname(src.url),
        name: outline.title,
        sourceProvenance: src.provenance,
        persona,
      });
      if (useSessionStore.getState().currentId === session.id) {
        await select(session.id);
      }

      // Navigate to canvas early so we can stream nodes in real-time
      reachedCanvasRef.current = true;
      setPage('canvas');

      let pipelineStage = '';
      await runPipeline(
        outline.title,
        outline.concepts.map((c) => ({ id: c.id, title: c.title, explanation: c.explanation })),
        persona,
        src.url,
        (p) => {
          setProgress({ stage: p.step, label: p.label });
          if (p.step !== pipelineStage) {
            if (pipelineStage) latency.endStage(pipelineStage);
            pipelineStage = p.step;
          }
          latency.startStage(p.step, p.label);
        },
        abortController.signal,
        session.id,
      );

      if (pipelineStage) latency.endStage(pipelineStage);
      latency.startStage('done', 'Canvas ready!');
      latency.endStage('done');

      if (abortController.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      if (useSessionStore.getState().currentId === session.id) {
        await select(session.id);
      }
      trackEvent('generation_completed', { sessionId: session.id });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setPage('welcome');
        return;
      }
      console.error('[app] generate failed:', err);
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      setError(msg);
      if (reachedCanvasRef.current) {
        useToastStore.getState().add(`Generation paused: ${msg}`);
      } else {
        setPage('welcome');
      }
    } finally {
      setIsGenerating(false);
      abortRef.current = null;
    }
  }, []);

  const { theme, setTheme } = useSettingsStore();
  const cycleTheme = () => {
    const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'auto' : 'light';
    setTheme(next);
  };
  const main =
    page === 'progress' ? (
      <div key="progress" className="pageEnter">
        <Toolbar
          isGenerating={isGenerating}
          onCancelGeneration={handleCancel}
          onCycleTheme={cycleTheme}
        />
        <ProgressScreen
          progress={progress}
          error={error}
          onCancel={handleCancel}
          previewData={previewData}
        />
      </div>
    ) : page === 'canvas' ? (
      <div key="canvas" className={isGenerating ? 'pageEnterInstant' : 'pageEnter'}>
        <Toolbar
          isGenerating={isGenerating}
          onCancelGeneration={handleCancel}
          onCycleTheme={cycleTheme}
        />
        <CanvasPage progress={progress} isGenerating={isGenerating} onHome={goWelcome} />
      </div>
    ) : (
      <div key="welcome" className="pageEnter">
        <WelcomeModal
          onGenerate={handleGenerate}
          error={error ?? undefined}
          onClearError={() => setError(null)}
          sessions={sessions}
          onSelectSession={handleSelectSession}
        />
      </div>
    );

  return (
    <ErrorBoundary
      name="App"
      fallback={(error: Error, reset: () => void) => (
        <div style={{ padding: 40, textAlign: 'center', fontFamily: 'var(--font-ui, sans-serif)' }}>
          <h2 style={{ marginBottom: 8 }}>Something went wrong</h2>
          <p style={{ color: 'var(--text-secondary, #888)', marginBottom: 16 }}>{error.message}</p>
          <button
            onClick={() => {
              reset();
              window.location.reload();
            }}
            style={{
              padding: '8px 20px',
              borderRadius: 6,
              border: 'none',
              background: 'var(--accent, #4f46e5)',
              color: '#fff',
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            Reload
          </button>
        </div>
      )}
    >
      {main}
      {import.meta.env.DEV && <LatencyPanel />}
      <Toaster />
    </ErrorBoundary>
  );
}
