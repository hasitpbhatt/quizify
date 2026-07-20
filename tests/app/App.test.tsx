import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { App } from '@/app/App';
import { useSettingsStore } from '@/shared/stores/settingsStore';

const mockFetchSourceContent = vi.hoisted(() => vi.fn());
vi.mock('@/lib/fetchSourceContent', () => ({
  fetchSourceContent: mockFetchSourceContent,
}));

const mockExecutePromptTask = vi.hoisted(() => vi.fn());
vi.mock('@/lib/llm/promptTask', () => ({
  executePromptTask: mockExecutePromptTask,
}));

const mockOutlineTask = vi.hoisted(() => ({
  id: 'outline',
  buildSystem: vi.fn(() => 'sys'),
  buildUser: vi.fn(() => 'user'),
  parse: vi.fn(() => ({
    title: 'Test Canvas',
    concepts: [
      { id: 'c1', title: 'Concept 1', explanation: 'E1', quiz: { format: 'mcq', question: 'Q?', options: ['A', 'B'], answer: 'A', explanation: 'R' } },
    ],
  })),
}));
vi.mock('@/lib/tasks/outlineTask', () => ({
  outlineTask: mockOutlineTask,
}));

const mockRunPipeline = vi.hoisted(() => vi.fn());
vi.mock('@/lib/pipeline', () => ({
  runPipeline: mockRunPipeline,
}));

const mockToastAdd = vi.hoisted(() => vi.fn());
vi.mock('@/shared/stores/toastStore', () => ({
  useToastStore: {
    getState: () => ({ add: mockToastAdd }),
  },
}));

const mockTheme = vi.hoisted(() => vi.fn());
vi.mock('@/app/useTheme', () => ({
  useTheme: mockTheme,
}));

vi.mock('@/features/welcome/WelcomeModal', () => ({
  WelcomeModal: ({
    onGenerate,
    error,
    onClearError,
    sessions,
    onSelectSession,
  }: {
    onGenerate: (url: string) => void;
    error?: string;
    onClearError: () => void;
    sessions: unknown[];
    onSelectSession: (id: string) => void;
  }) => (
    <div data-testid="welcome-modal">
      <span data-testid="error-display">{error ?? ''}</span>
      <span data-testid="session-count">{sessions.length}</span>
      <button data-testid="generate-btn" onClick={() => onGenerate('https://example.com')}>
        Generate
      </button>
      {sessions.length > 0 && (
        <button data-testid="select-session" onClick={() => onSelectSession('session-1')}>
          Select Session
        </button>
      )}
      <button data-testid="clear-error" onClick={onClearError}>Clear Error</button>
    </div>
  ),
}));

vi.mock('@/features/toolbar/Toolbar', () => ({
  Toolbar: ({ onNewSession }: { onNewSession: () => void }) => (
    <div data-testid="toolbar">
      <button data-testid="new-session-btn" onClick={onNewSession}>New</button>
    </div>
  ),
}));

vi.mock('@/features/canvas/CanvasPage', () => ({
  CanvasPage: ({ onHome }: { onHome: () => void }) => (
    <div data-testid="canvas-page">
      <button data-testid="home-btn" onClick={onHome}>Home</button>
    </div>
  ),
}));

vi.mock('@/app/ProgressScreen', () => ({
  ProgressScreen: ({ onCancel }: { onCancel: () => void }) => (
    <div data-testid="progress-screen">
      <button data-testid="cancel-btn" onClick={onCancel}>Cancel</button>
    </div>
  ),
}));

vi.mock('@/app/Toaster', () => ({
  Toaster: () => <div data-testid="toaster" />,
}));

vi.mock('@/lib/components/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode; fallback: any }) => {
    const MockErrorBoundary = ({ children: c }: { children: React.ReactNode }) => <>{c}</>;
    return <MockErrorBoundary>{children}</MockErrorBoundary>;
  },
}));

const mockSessionStore = vi.hoisted(() => {
  let currentId: string | null = null;
  let sessions: unknown[] = [];
  const load = vi.fn().mockResolvedValue(undefined);
  const select = vi.fn().mockImplementation(async (id: string) => { currentId = id; });
  const create = vi.fn().mockResolvedValue({ id: 'new-session', name: 'Test', url: 'https://example.com', hostname: 'example.com', persona: 'student', createdAt: Date.now(), updatedAt: Date.now(), nodes: [], edges: [], scores: {} });
  
  const fn = vi.fn().mockImplementation((selector) => {
    const state = { load, select, create, currentId, sessions, loaded: true };
    return selector ? selector(state) : state;
  });

  return Object.assign(fn, {
    load,
    select,
    create,
    getState: () => ({ load, select, create, currentId, sessions, loaded: true }),
    setState: (s: Record<string, unknown>) => {
      if ('currentId' in s) currentId = s.currentId as string | null;
      if ('sessions' in s) sessions = s.sessions as unknown[];
    },
    subscribe: vi.fn(() => vi.fn()),
    getInitialState: () => ({ sessions: [], currentId: null, loaded: false, load: vi.fn(), select: vi.fn(), create: vi.fn(), updateCurrent: vi.fn(), remove: vi.fn(), addNote: vi.fn() }),
  });
});

vi.mock('@/shared/stores/sessionStore', () => ({
  useSessionStore: mockSessionStore,
}));

const mockSetNotebookMode = vi.hoisted(() => vi.fn());
const mockNotebookSetState = vi.hoisted(() => vi.fn());
vi.mock('@/shared/stores/notebookStore', () => ({
  useNotebookStore: {
    getState: () => ({ setNotebookMode: mockSetNotebookMode }),
    setState: mockNotebookSetState,
  },
}));

// sessionStorage mock
const sessionStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(window, 'sessionStorage', { value: sessionStorageMock, writable: true });

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorageMock.clear();
  useSettingsStore.setState({
    persona: 'student',
  });
  mockFetchSourceContent.mockReset();
  mockExecutePromptTask.mockReset();
  mockRunPipeline.mockReset();
  mockSetNotebookMode.mockReset();
  mockNotebookSetState.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('App', () => {
  it('renders welcome modal by default', () => {
    render(<App />);
    expect(screen.getByTestId('welcome-modal')).toBeInTheDocument();
  });

  it('renders Toaster', () => {
    render(<App />);
    expect(screen.getByTestId('toaster')).toBeInTheDocument();
  });

  it('transitions to progress then canvas on generate', async () => {
    mockFetchSourceContent.mockResolvedValue({ url: 'https://example.com', content: 'source text' });
    mockExecutePromptTask.mockResolvedValue({
      title: 'Test Canvas',
      concepts: [{ id: 'c1', title: 'C1', explanation: 'E1', quiz: { format: 'mcq', question: 'Q?', options: ['A', 'B'], answer: 'A', explanation: 'R' } }],
    });
    mockRunPipeline.mockResolvedValue({ nodes: [], edges: [] });

    render(<App />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('generate-btn'));
    });

    // After pipeline completes, should be on canvas
    await waitFor(() => {
      expect(screen.getByTestId('canvas-page')).toBeInTheDocument();
    });
  });

  it('shows progress screen during fetch', async () => {
    mockFetchSourceContent.mockImplementation(() => new Promise(() => {})); // Never resolves
    mockExecutePromptTask.mockRejectedValue(new Error('should not reach'));

    render(<App />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('generate-btn'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('progress-screen')).toBeInTheDocument();
    });

    // Should have toolbar and cancel button
    expect(screen.getByTestId('toolbar')).toBeInTheDocument();
    expect(screen.getByTestId('cancel-btn')).toBeInTheDocument();
  });

  it('returns to welcome on cancel', async () => {
    mockFetchSourceContent.mockImplementation(() => new Promise(() => {}));

    render(<App />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('generate-btn'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('progress-screen')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('cancel-btn'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('welcome-modal')).toBeInTheDocument();
    });
  });

  it('shows error on generation failure', async () => {
    mockFetchSourceContent.mockRejectedValue(new Error('Failed to fetch URL'));

    render(<App />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('generate-btn'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('welcome-modal')).toBeInTheDocument();
      expect(screen.getByTestId('error-display').textContent).toContain('Failed to fetch URL');
    });
  });

  it('does not start generation when persona is missing', async () => {
    useSettingsStore.setState({ persona: null as any });

    render(<App />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('generate-btn'));
    });

    expect(screen.getByTestId('welcome-modal')).toBeInTheDocument();
    expect(mockFetchSourceContent).not.toHaveBeenCalled();
  });

  it('silently handles AbortError', async () => {
    mockFetchSourceContent.mockRejectedValue(new DOMException('Aborted', 'AbortError'));

    render(<App />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('generate-btn'));
    });

    // Should return to welcome without error message
    await waitFor(() => {
      expect(screen.getByTestId('welcome-modal')).toBeInTheDocument();
    });
    expect(screen.getByTestId('error-display').textContent).toBe('');
  });

  it('clears error on clear-error click', async () => {
    mockFetchSourceContent.mockRejectedValueOnce(new Error('Some error'));
    mockFetchSourceContent.mockRejectedValueOnce(new Error('Some error'));

    render(<App />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('generate-btn'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('error-display').textContent).toContain('Some error');
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('clear-error'));
    });

    expect(screen.getByTestId('error-display').textContent).toBe('');
  });

  it('transitions to canvas on session select', async () => {
    mockSessionStore.setState({ sessions: [{ id: 'session-1' }], currentId: null });

    render(<App />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('select-session'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('canvas-page')).toBeInTheDocument();
    });
  });

  it('returns to welcome when home button is clicked on canvas', async () => {
    mockFetchSourceContent.mockResolvedValue({ url: 'https://example.com', content: 'source text' });
    mockExecutePromptTask.mockResolvedValue({
      title: 'Test',
      concepts: [{ id: 'c1', title: 'C1', explanation: 'E1', quiz: { format: 'mcq', question: 'Q?', options: ['A'], answer: 'A', explanation: 'R' } }],
    });
    mockRunPipeline.mockResolvedValue({ nodes: [], edges: [] });

    render(<App />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('generate-btn'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('canvas-page')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('home-btn'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('welcome-modal')).toBeInTheDocument();
    });
  });

  it('restores canvas from sessionStorage on mount', async () => {
    sessionStorageMock.setItem('quizify:page', 'canvas');
    sessionStorageMock.setItem('quizify:currentId', 'existing-session');
    mockSessionStore.setState({ currentId: 'existing-session', sessions: [{ id: 'existing-session' }] });

    render(<App />);

    await vi.waitFor(() => {
      expect(screen.getByTestId('canvas-page')).toBeInTheDocument();
    });
  });

  it('enables notebook mode on successful session select', async () => {
    mockSessionStore.setState({ sessions: [{ id: 'session-1' }], currentId: null });

    render(<App />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('select-session'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('canvas-page')).toBeInTheDocument();
    });
    expect(mockSetNotebookMode).toHaveBeenCalledWith(true);
  });

  it('restores graph view when saved notebook preference is "graph"', async () => {
    sessionStorageMock.setItem('quizify:page', 'canvas');
    sessionStorageMock.setItem('quizify:currentId', 'existing-session');
    sessionStorageMock.setItem('quizify:notebookMode:existing-session', 'graph');
    mockSessionStore.setState({ currentId: 'existing-session', sessions: [{ id: 'existing-session' }] });

    render(<App />);

    await vi.waitFor(() => {
      expect(screen.getByTestId('canvas-page')).toBeInTheDocument();
    });
    expect(mockSetNotebookMode).toHaveBeenCalledWith(false);
  });

  it('selects session honoring saved graph preference', async () => {
    sessionStorageMock.setItem('quizify:notebookMode:session-1', 'graph');
    mockSessionStore.setState({ sessions: [{ id: 'session-1' }], currentId: null });

    render(<App />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('select-session'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('canvas-page')).toBeInTheDocument();
    });
    expect(mockSetNotebookMode).toHaveBeenCalledWith(false);
  });

  it('enables notebook mode before createSession during generate', async () => {
    mockFetchSourceContent.mockResolvedValue({ url: 'https://example.com', content: 'source text' });
    mockExecutePromptTask.mockResolvedValue({
      title: 'Test Canvas',
      concepts: [{ id: 'c1', title: 'C1', explanation: 'E1', quiz: { format: 'mcq', question: 'Q?', options: ['A', 'B'], answer: 'A', explanation: 'R' } }],
    });
    mockRunPipeline.mockResolvedValue({ nodes: [], edges: [] });

    render(<App />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('generate-btn'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('canvas-page')).toBeInTheDocument();
    });
    expect(mockNotebookSetState).toHaveBeenCalledWith({ notebookMode: true, completedTypingNodeIds: {} });
    expect(mockSessionStore.create).toHaveBeenCalled();

    // Notebook mode must be enabled before create resolves so the canvas mounts cleanly.
    const setOrder = mockNotebookSetState.mock.invocationCallOrder[0] ?? 0;
    const createOrder = mockSessionStore.create.mock.invocationCallOrder[0] ?? Infinity;
    expect(setOrder).toBeLessThan(createOrder);
  });
});
