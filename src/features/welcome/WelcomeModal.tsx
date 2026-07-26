import { useState, useEffect, useMemo } from 'react';
import {
  Sparkles,
  GraduationCap,
  Briefcase,
  Microscope,
  ArrowRight,
  Globe,
  X,
  Clock,
  ChevronDown,
  BookOpen,
  Link2,
  Lightbulb,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { PersonaCard } from './PersonaCard';
import { useWelcomeState, EXAMPLE_CHIPS } from './useWelcomeState';
import { useSessionStore } from '@/shared/stores/sessionStore';
import { AccessibleDialog } from '@/lib/components/AccessibleDialog';
import {
  getNextLearningAction,
  normalizeLearningProgress,
  type NextLearningAction,
} from '@/shared/learningProgress';
import type { ConceptData, Persona, Session } from '@/shared/types';
import styles from './WelcomeModal.module.css';

const PERSONA_ICONS: Record<Persona, LucideIcon> = {
  curious: Sparkles,
  student: GraduationCap,
  professional: Briefcase,
  expert: Microscope,
};

const CHIP_ICON_MAP: Record<string, React.ElementType> = {
  'https://en.wikipedia.org/wiki/Photosynthesis': BookOpen,
  'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function':
    Link2,
  'agentic AI': Lightbulb,
};

const LABEL_PREFIX_MAP: Record<string, string> = {
  'https://en.wikipedia.org/wiki/Photosynthesis': 'Read',
  'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function':
    'Read',
  'agentic AI': 'Explore',
};

function relativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

function getSessionNextAction(session: Session): NextLearningAction | null {
  const conceptIds = session.nodes
    .filter((node) => node.data?.kind === 'concept')
    .sort((a, b) => {
      const ai = a.data.kind === 'concept' ? (a.data as ConceptData).index : 0;
      const bi = b.data.kind === 'concept' ? (b.data as ConceptData).index : 0;
      return ai - bi;
    })
    .map((node) => node.id);
  if (conceptIds.length === 0) return null;
  const progress = normalizeLearningProgress(
    session.lastConceptId,
    session.completedConceptIds,
    session.nextReviewAtByConceptId,
    session.lastActivityAt,
  );
  return getNextLearningAction(progress, conceptIds);
}

function actionLabel(action: NextLearningAction): string {
  switch (action.kind) {
    case 'complete':
      return 'Review lesson';
    case 'review':
      return 'Review due';
    case 'continue':
      return 'Continue';
    case 'start':
      return 'Start';
  }
}

function formatConceptProgress(session: Session): string {
  const conceptIds = session.nodes.filter((node) => node.data?.kind === 'concept').map((n) => n.id);
  const total = conceptIds.length;
  if (total === 0) return '';
  const done = (session.completedConceptIds ?? []).filter((id) => conceptIds.includes(id)).length;
  if (done >= total) return 'Completed';
  return `${done} of ${total} concepts done`;
}

function SessionCard({
  session,
  onSelect,
  onDelete,
  badge,
}: {
  session: Session;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  badge?: string;
}) {
  const Icon = PERSONA_ICONS[session.persona] ?? Sparkles;
  const nodesList = session.nodes || [];
  const conceptCount = nodesList.filter((n) => n.data?.kind === 'concept').length;
  const progressLabel = formatConceptProgress(session);

  return (
    <div className={styles.sessionCardRow}>
      <button
        className={styles.sessionCard}
        onClick={() => onSelect(session.id)}
        type="button"
        aria-label={`Open session ${session.name}`}
      >
        {badge && <span className={styles.resumeBadge}>{badge}</span>}
        <ArrowRight size={14} className={styles.sessionCardArrow} />
        <Icon size={16} />
        <div className={styles.sessionInfo}>
          <span className={styles.sessionName}>{session.name}</span>
          <span className={styles.sessionMeta}>
            {session.hostname && (
              <>
                <Globe size={11} />
                <span>{session.hostname}</span>
                <span className={styles.sessionDot}>·</span>
              </>
            )}
            <Clock size={11} />
            <span>{relativeTime(new Date(session.updatedAt))}</span>
            {conceptCount > 0 && (
              <>
                <span className={styles.sessionDot}>·</span>
                <span>
                  {conceptCount} concept
                  {conceptCount !== 1 ? 's' : ''}
                </span>
              </>
            )}
            {progressLabel && (
              <>
                <span className={styles.sessionDot}>·</span>
                <span
                  style={{
                    color:
                      progressLabel === 'Completed'
                        ? 'var(--feedback-success-text)'
                        : 'var(--text-secondary)',
                  }}
                >
                  {progressLabel}
                </span>
              </>
            )}
          </span>
        </div>
      </button>
      <button
        className={styles.sessionDelete}
        onClick={() => onDelete(session.id)}
        aria-label={`Delete session ${session.name}`}
        type="button"
      >
        <X size={14} />
      </button>
    </div>
  );
}

interface WelcomeModalProps {
  onGenerate: (url: string) => void;
  error?: string;
  onClearError?: () => void;
  sessions: Session[];
  onSelectSession: (id: string) => void;
}

const PERSONAS: {
  value: Persona;
  label: string;
  sublabel: string;
  description: string;
  icon: LucideIcon;
}[] = [
  {
    value: 'curious',
    label: 'Curious',
    sublabel: 'beginner',
    description: 'Plain language & analogies',
    icon: Sparkles,
  },
  {
    value: 'student',
    label: 'Student',
    sublabel: 'textbook',
    description: 'Exam-style questions',
    icon: GraduationCap,
  },
  {
    value: 'professional',
    label: 'Professional',
    sublabel: 'practical',
    description: 'Applied scenarios',
    icon: Briefcase,
  },
  {
    value: 'expert',
    label: 'Expert',
    sublabel: 'terse',
    description: 'Edge cases & depth',
    icon: Microscope,
  },
];

export function WelcomeModal({
  onGenerate,
  error,
  onClearError,
  sessions,
  onSelectSession,
}: WelcomeModalProps) {
  const { url, persona, setUrl, setPersona, submitEnabled, submitDisabledReason } =
    useWelcomeState();
  const { remove: removeSession } = useSessionStore();
  const [exampleUrl, setExampleUrl] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [showSessions, setShowSessions] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'recent' | 'name' | 'concepts'>('recent');
  const [storageAcknowledged, setStorageAcknowledged] = useState(() => {
    try {
      return localStorage.getItem('quizify:storage-disclosure') === 'true';
    } catch {
      return false;
    }
  });
  const [dismissedStorage, setDismissedStorage] = useState(false);

  const resumeSession = useMemo(() => {
    const withContent = sessions.filter((session) =>
      session.nodes.some((node) => node.data?.kind === 'concept'),
    );
    withContent.sort((a, b) => b.updatedAt - a.updatedAt);
    const incomplete = withContent.find((session) => {
      const action = getSessionNextAction(session);
      return action?.kind !== 'complete';
    });
    return incomplete ?? withContent[0] ?? null;
  }, [sessions]);

  const resumeAction = resumeSession ? getSessionNextAction(resumeSession) : null;

  const filteredSessions = useMemo(() => {
    let result = [...sessions];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.hostname && s.hostname.toLowerCase().includes(q)) ||
          s.url.toLowerCase().includes(q),
      );
    }
    if (sortBy === 'recent') {
      result.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    } else if (sortBy === 'name') {
      result.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'concepts') {
      const getConceptCount = (s: (typeof sessions)[0]) =>
        s.nodes.filter((n) => n.data?.kind === 'concept').length;
      result.sort((a, b) => getConceptCount(b) - getConceptCount(a));
    }
    return result;
  }, [sessions, searchQuery, sortBy]);

  // Focus trap for WelcomeModal and Delete Confirmation Modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const activeModal =
        document.querySelector('[role="alertdialog"]') || document.querySelector('[role="dialog"]');
      if (!activeModal) return;

      const focusableSelectors =
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
      const focusableElements = Array.from(
        activeModal.querySelectorAll(focusableSelectors),
      ) as HTMLElement[];
      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          lastElement.focus();
          e.preventDefault();
        }
      } else {
        if (document.activeElement === lastElement) {
          firstElement.focus();
          e.preventDefault();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [confirmingDelete]);

  const handleSubmit = () => {
    if (!submitEnabled) return;
    if (!storageAcknowledged) {
      try {
        localStorage.setItem('quizify:storage-disclosure', 'true');
      } catch {
        // storage unavailable
      }
      setStorageAcknowledged(true);
    }
    onGenerate(url.trim());
  };

  const pickExample = (chipUrl: string) => {
    setUrl(chipUrl);
    setExampleUrl(chipUrl);
  };

  const showStorageNotice = !storageAcknowledged && !dismissedStorage && !error;

  return (
    <div className={styles.overlay}>
      <div className={styles.ambient} aria-hidden />

      <main
        className={`${styles.modal} ${showSessions && sessions.length > 0 ? styles.modalWide : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-heading"
      >
        {error && (
          <div className={styles.errorBanner} role="alert">
            <span>{error}</span>
            <button
              className={styles.errorDismiss}
              onClick={onClearError}
              aria-label="Dismiss"
              type="button"
            >
              &times;
            </button>
          </div>
        )}

        <header className={styles.hero}>
          <div className={styles.eyebrow}>
            <Sparkles size={14} />
            <span>Quizify · Learn anything, visually</span>
          </div>
          <h1 id="welcome-heading" className={styles.heading}>
            Turn any topic into a guided lesson you actually remember.
          </h1>
          <p className={styles.subheading}>
            Paste a URL or topic. Quizify builds a guided, interactive lesson — concepts, quizzes,
            and a recap.
          </p>
        </header>

        {/* URL input is the primary conversion action — sits directly below the hero,
            before persona, so new visitors see the input first. Returning users
            find the resume card further down. */}
        <section className={styles.section}>
          <label className={styles.label} htmlFor="url-input">
            What do you want to learn?
          </label>
          <div className={styles.inputRow}>
            <input
              id="url-input"
              className={styles.urlInput}
              type="text"
              placeholder="Paste a URL or type a topic — e.g. an article link or 'agentic AI'"
              value={url}
              autoFocus
              onChange={(e) => {
                setUrl(e.target.value);
                setExampleUrl('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSubmit();
              }}
              autoComplete="off"
              spellCheck={false}
            />
            {/* Show a hint on hover + a helper text below when the button
                is disabled so users always know why they can't submit. */}
            <button
              className={styles.generateBtn}
              disabled={!submitEnabled}
              onClick={handleSubmit}
              type="button"
              title={
                !submitEnabled ? (submitDisabledReason ?? undefined) : 'Press Enter to generate'
              }
            >
              <span>Generate</span>
              <ArrowRight size={16} />
            </button>
          </div>
          {!submitEnabled && submitDisabledReason && (
            <p className={styles.generateHint}>{submitDisabledReason}</p>
          )}
          {showStorageNotice && (
            <div className={styles.storageNotice}>
              <p role="note">
                Lessons are saved locally in this browser (IndexedDB). They are not synced to the
                cloud.
              </p>
              <button
                className={styles.storageDismiss}
                onClick={() => {
                  setDismissedStorage(true);
                  setStorageAcknowledged(true);
                }}
                aria-label="Dismiss"
                type="button"
              >
                <X size={14} />
              </button>
            </div>
          )}
          <div className={styles.chips}>
            {EXAMPLE_CHIPS.map((chip) => {
              const ChipIcon = CHIP_ICON_MAP[chip.url];
              const prefix = LABEL_PREFIX_MAP[chip.url] ?? 'Try';
              return (
                <button
                  key={chip.url}
                  className={`${styles.chip} ${exampleUrl === chip.url ? styles.chipActive : ''}`}
                  onClick={() => pickExample(chip.url)}
                  type="button"
                >
                  {ChipIcon && <ChipIcon size={12} />}
                  <span>
                    {prefix}: {chip.label.split(': ').pop()}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <div className={styles.personaRow}>
          <span className={styles.personaLabel}>Teaching style:</span>
          <div className={styles.personaGrid} role="radiogroup" aria-label="Teaching style">
            {PERSONAS.map((p) => (
              <PersonaCard
                key={p.value}
                persona={p.value}
                label={p.label}
                sublabel={p.sublabel}
                description={p.description}
                icon={p.icon}
                selected={persona === p.value}
                onSelect={setPersona}
              />
            ))}
          </div>
        </div>

        {resumeSession && (
          <section className={styles.resumeSection}>
            <div className={styles.resumeLabel}>Pick up where you left off</div>
            <div
              className={styles.resumeCard}
              onClick={() => onSelectSession(resumeSession.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectSession(resumeSession.id);
                }
              }}
            >
              <div className={styles.resumeBody}>
                <span className={styles.resumeName}>{resumeSession.name}</span>
                <span className={styles.resumeMeta}>
                  {resumeSession.hostname && (
                    <>
                      <Globe size={11} />
                      <span>{resumeSession.hostname}</span>
                      <span className={styles.sessionDot}>·</span>
                    </>
                  )}
                  {formatConceptProgress(resumeSession) || 'In progress'}
                  {' · '}
                  {relativeTime(new Date(resumeSession.updatedAt))}
                </span>
              </div>
              <span className={styles.resumeAction}>
                {resumeAction ? actionLabel(resumeAction) : 'Continue'}
                <ArrowRight size={14} />
              </span>
            </div>
          </section>
        )}

        {sessions.length > 5 && showSessions && (
          <section className={styles.sessionsSection}>
            <div className={styles.sessionsHeader}>
              <div className={styles.sessionControls}>
                <input
                  type="text"
                  placeholder="Search sessions..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={styles.searchBar}
                />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'recent' | 'name' | 'concepts')}
                  className={styles.sortSelect}
                >
                  <option value="recent">Recent</option>
                  <option value="name">Name</option>
                  <option value="concepts">Concepts</option>
                </select>
              </div>
            </div>
            <div className={styles.sessionList}>
              {filteredSessions.map((s) => (
                <SessionCard
                  key={s.id}
                  session={s}
                  onSelect={onSelectSession}
                  onDelete={(id) => setConfirmingDelete(id)}
                />
              ))}
            </div>
          </section>
        )}

        {sessions.length > 0 && (
          <>
            <button
              className={styles.sessionToggle}
              onClick={() => setShowSessions(!showSessions)}
              type="button"
            >
              <span>
                {showSessions ? 'Hide past sessions' : `Past sessions (${sessions.length})`}
              </span>
              <ChevronDown size={14} className={showSessions ? styles.chevronOpen : undefined} />
            </button>
            {/* When sessions <=5, show simple list without search/sort */}
            {showSessions && sessions.length <= 5 && (
              <section className={styles.sessionsSection}>
                <div className={styles.sessionList}>
                  {sessions.map((s, idx) => {
                    const action = getSessionNextAction(s);
                    const badge =
                      idx === 0 &&
                      sortBy === 'recent' &&
                      !searchQuery &&
                      action &&
                      action.kind !== 'complete'
                        ? actionLabel(action)
                        : undefined;
                    return (
                      <SessionCard
                        key={s.id}
                        session={s}
                        onSelect={onSelectSession}
                        onDelete={(id) => setConfirmingDelete(id)}
                        badge={badge}
                      />
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}
      </main>

      {confirmingDelete && (
        <AccessibleDialog
          role="alertdialog"
          labelledBy="delete-dialog-title"
          describedBy="delete-dialog-desc"
          onClose={() => setConfirmingDelete(null)}
          overlayClassName={styles.dialogOverlay}
          panelClassName={styles.dialogModal}
          initialFocusSelector=".welcome-delete-cancel"
        >
          <h2 id="delete-dialog-title" className={styles.dialogTitle}>
            Delete Session
          </h2>
          <p id="delete-dialog-desc" className={styles.dialogDesc}>
            Are you sure you want to delete the session "
            {sessions.find((s) => s.id === confirmingDelete)?.name || 'this session'}"? This action
            cannot be undone.
          </p>
          <div className={styles.dialogButtons}>
            <button
              className={`${styles.dialogCancelBtn} welcome-delete-cancel`}
              onClick={() => setConfirmingDelete(null)}
              type="button"
            >
              Cancel
            </button>
            <button
              className={styles.dialogConfirmBtn}
              onClick={() => {
                if (confirmingDelete) {
                  removeSession(confirmingDelete);
                  setConfirmingDelete(null);
                }
              }}
              type="button"
            >
              Delete
            </button>
          </div>
        </AccessibleDialog>
      )}
    </div>
  );
}
