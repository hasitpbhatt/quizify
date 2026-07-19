import { useState, useCallback, useEffect, useRef } from 'react';
import { useTheme } from './useTheme';
import { useSettingsStore } from '@/shared/stores/settingsStore';
import { useSessionStore } from '@/shared/stores/sessionStore';
import { useNotebookStore } from '@/shared/stores/notebookStore';
import { WelcomeModal } from '@/features/welcome/WelcomeModal';
import { Toolbar } from '@/features/toolbar/Toolbar';
import { CanvasPage } from '@/features/canvas/CanvasPage';
import { ReactFlowProvider } from '@xyflow/react';
import { ProgressScreen } from './ProgressScreen';
import { Toaster } from './Toaster';
import { fetchSourceContent } from '@/lib/fetchSourceContent';
import { executePromptTask } from '@/lib/llm/promptTask';
import { outlineTask } from '@/lib/tasks/outlineTask';
import { getProviderConfig } from '@/lib/llm/providers';
import { runPipeline, type PipelineStep } from '@/lib/pipeline';
import { useToastStore } from '@/shared/stores/toastStore';
import { ErrorBoundary } from '@/lib/components/ErrorBoundary';
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
  const [progress, setProgress] = useState<JourneyProgress>({ stage: 'fetch', label: 'Reading the source…' });
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { load: loadSessions, sessions, currentId, select } = useSessionStore();
  const [previewData, setPreviewData] = useState<{
    title: string;
    snippet: string;
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

  // Abort in-flight pipeline on unmount (navigating away mid-generation)
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setProgress({ stage: 'fetch', label: 'Reading the source…' });
    setError(null);
    setPreviewData(null);
    setPage('welcome');
  }, []);

  const handleSelectSession = useCallback((id: string) => {
    useNotebookStore.getState().setNotebookMode(true);
    select(id);
    setPage('canvas');
  }, [select]);

  const handleGenerate = useCallback(async (url: string) => {
    const { apiKey, persona, provider } = useSettingsStore.getState();
    const cfg = getProviderConfig(provider);
    if ((cfg.requiresApiKey && !apiKey) || !persona) return;

    const abortController = new AbortController();
    abortRef.current = abortController;
    setError(null);
    setPage('progress');

    try {
      // Stage 1 — fetch the source
      setProgress({ stage: 'fetch', label: 'Reading the source\u2026' });
      const src = await fetchSourceContent(url, { apiKey, persona, provider, signal: abortController.signal });

      if (abortController.signal.aborted) throw new DOMException('Aborted', 'AbortError');

      // Intercept with Preview so user commits knowingly (skip in test mode)
      const isTest = typeof process !== 'undefined' && process.env.NODE_ENV === 'test';
      if (!isTest) {
        await new Promise<void>((resolve, reject) => {
          // Try to find a markdown header (# title) or fallback to hostname
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

          // Clean common markdown markup for snippet display
          let cleanText = src.content
            .replace(/[#*`_]/g, '')
            .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
            .trim();
          const sentences = cleanText.split(/[.!?]\s+/);
          const snippet = sentences.slice(0, 3).join('. ') + (sentences.length > 3 ? '...' : '.');

          setPreviewData({
            title,
            snippet,
            onConfirm: () => {
              setPreviewData(null);
              resolve();
            },
            onCancel: () => {
              setPreviewData(null);
              handleCancel();
              reject(new DOMException('Aborted', 'AbortError'));
            }
          });
        });
      }

      if (abortController.signal.aborted) throw new DOMException('Aborted', 'AbortError');

      // Stage 2 — outline
      setProgress({ stage: 'outline', label: 'Sketching an outline…' });
      const outline = await executePromptTask(outlineTask, {
        apiKey, provider, persona, signal: abortController.signal,
        context: { url },
        onRetry: (info) => useToastStore.getState().add(`API busy, retrying… (${info.attempt + 1}/${info.maxRetries + 1})`),
      }, src.content);

      if (abortController.signal.aborted) throw new DOMException('Aborted', 'AbortError');

      // Stage 3+ — pipeline (detail, quiz, summary, build)
      const { create: createSession, select } = useSessionStore.getState();
      useNotebookStore.getState().setNotebookMode(true);
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
      if (err instanceof DOMException && err.name === 'AbortError') {
        setPage('welcome');
        return;
      }
      console.error('[app] generate failed:', err);
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      setError(msg);
      // Non-destructive recovery: if transitioned to canvas, stay on canvas to keep partial nodes
      if (page === 'canvas') {
        useToastStore.getState().add(`Generation paused: ${msg}`);
      } else {
        setPage('welcome');
      }
    } finally {
      abortRef.current = null;
    }
  }, []);

  const main = page === 'progress' ? (
    <div key="progress" className="pageEnter">
      <Toolbar onNewSession={() => setPage('welcome')} />
      <ProgressScreen
        progress={progress}
        error={error}
        onCancel={handleCancel}
        previewData={previewData}
      />
    </div>
  ) : page === 'canvas' ? (
    <div key="canvas" className="pageEnter">
      <Toolbar onNewSession={() => setPage('welcome')} />
      <ReactFlowProvider><CanvasPage progress={progress} onHome={() => setPage('welcome')} /></ReactFlowProvider>
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
            onClick={() => { reset(); window.location.reload(); }}
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
      <Toaster />
    </ErrorBoundary>
  );
}
