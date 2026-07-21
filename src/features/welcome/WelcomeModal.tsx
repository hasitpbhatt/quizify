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
} from 'lucide-react';
import { PersonaCard } from './PersonaCard';
import { useWelcomeState, EXAMPLE_CHIPS } from './useWelcomeState';
import { useSessionStore } from '@/shared/stores/sessionStore';
import type { Persona, Session } from '@/shared/types';
import styles from './WelcomeModal.module.css';

const PERSONA_ICONS: Record<string, typeof Sparkles> = {
  curious: Sparkles,
  student: GraduationCap,
  professional: Briefcase,
  expert: Microscope,
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
  icon: typeof Sparkles;
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
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'recent' | 'name' | 'concepts'>('recent');

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
        s.nodes.filter((n) => n.data.kind === 'concept').length;
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
    onGenerate(url.trim());
  };

  const pickExample = (chipUrl: string) => {
    setUrl(chipUrl);
    setExampleUrl(chipUrl);
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.ambient} aria-hidden />

      <main
        className={styles.modal}
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
            <span>Learn anything, visually</span>
          </div>
          <h1 id="welcome-heading" className={styles.heading}>
            Turn any topic into a canvas you actually remember.
          </h1>
          <p className={styles.subheading}>
            Paste a URL or type a topic and Quizify breaks it into concepts, quizzes, and a final
            recap — laid out on an infinite canvas. It then reads them to you in a calm Notebook
            view (press Esc anytime to switch to the canvas graph).
          </p>
        </header>

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
            <button
              className={styles.generateBtn}
              disabled={!submitEnabled}
              onClick={handleSubmit}
              type="button"
              title={submitDisabledReason ?? undefined}
            >
              <span>Generate</span>
              <ArrowRight size={16} />
            </button>
          </div>
          {persona && submitDisabledReason && (
            <p className={styles.generateHint}>{submitDisabledReason}</p>
          )}
          <div className={styles.chips}>
            {EXAMPLE_CHIPS.map((chip) => (
              <button
                key={chip.label}
                className={`${styles.chip} ${exampleUrl === chip.url ? styles.chipActive : ''}`}
                onClick={() => pickExample(chip.url)}
                type="button"
              >
                {chip.label}
              </button>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <label className={styles.label}>How should we teach you?</label>
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
          <p className={styles.personaHint}>
            {persona
              ? `Depth & quiz difficulty tuned to the ${PERSONAS.find((p) => p.value === persona)?.label.toLowerCase()} in you.`
              : 'We\u2019ll match the depth and quiz style to your pick.'}
          </p>
        </section>

        {sessions.length > 0 && (
          <section className={styles.sessionsSection}>
            <div className={styles.sessionsHeader}>
              <label className={styles.label}>Recent sessions</label>
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
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className={styles.sortSelect}
                >
                  <option value="recent">Recent</option>
                  <option value="name">Name</option>
                  <option value="concepts">Concepts</option>
                </select>
              </div>
            </div>
            <div className={styles.sessionList}>
              {filteredSessions.map((s, idx) => {
                const Icon = PERSONA_ICONS[s.persona] ?? Sparkles;
                const nodesList = s.nodes || [];
                const conceptCount = nodesList.filter((n) => n.data?.kind === 'concept').length;
                const quizNodes = nodesList.filter((n) => n.data?.kind === 'quiz');
                const answeredQuizzes = quizNodes.filter(
                  (n) => (n.data as any)?.state !== 'untested',
                );
                const masteredQuizzes = quizNodes.filter(
                  (n) =>
                    (n.data as any)?.state === 'correct' || (n.data as any)?.state === 'mastered',
                );
                const masteryPct =
                  quizNodes.length > 0
                    ? Math.round((masteredQuizzes.length / quizNodes.length) * 100)
                    : null;
                return (
                  <div
                    key={s.id}
                    className={styles.sessionCard}
                    onClick={() => {
                      onSelectSession(s.id);
                      setConfirmingDelete(null);
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectSession(s.id);
                      }
                    }}
                  >
                    {idx === 0 && sortBy === 'recent' && !searchQuery && (
                      <span className={styles.resumeBadge}>Resume</span>
                    )}
                    <Icon size={16} />
                    <div className={styles.sessionInfo}>
                      <span className={styles.sessionName}>{s.name}</span>
                      <span className={styles.sessionMeta}>
                        {s.hostname && (
                          <>
                            <Globe size={11} />
                            <span>{s.hostname}</span>
                            <span className={styles.sessionDot}>·</span>
                          </>
                        )}
                        <Clock size={11} />
                        <span>{relativeTime(new Date(s.updatedAt))}</span>
                        {conceptCount > 0 && (
                          <>
                            <span className={styles.sessionDot}>·</span>
                            <span>
                              {conceptCount} concept{conceptCount !== 1 ? 's' : ''}
                            </span>
                          </>
                        )}
                        {masteryPct !== null && answeredQuizzes.length > 0 && (
                          <>
                            <span className={styles.sessionDot}>·</span>
                            <span
                              style={{
                                color:
                                  masteryPct >= 80
                                    ? 'var(--success)'
                                    : masteryPct >= 50
                                      ? 'var(--warning)'
                                      : 'var(--text-tertiary)',
                              }}
                            >
                              {masteryPct}% mastered
                            </span>
                          </>
                        )}
                      </span>
                    </div>
                    <button
                      className={styles.sessionDelete}
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmingDelete(s.id);
                      }}
                      aria-label={`Delete session ${s.name}`}
                      type="button"
                    >
                      <X size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </main>

      {confirmingDelete &&
        (() => {
          const sessionToDelete = sessions.find((s) => s.id === confirmingDelete);
          return (
            <div className={styles.dialogOverlay} onClick={() => setConfirmingDelete(null)}>
              <div
                className={styles.dialogModal}
                onClick={(e) => e.stopPropagation()}
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="delete-dialog-title"
                aria-describedby="delete-dialog-desc"
              >
                <h2 id="delete-dialog-title" className={styles.dialogTitle}>
                  Delete Session
                </h2>
                <p id="delete-dialog-desc" className={styles.dialogDesc}>
                  Are you sure you want to delete the session "
                  {sessionToDelete?.name || 'this session'}"? This action cannot be undone.
                </p>
                <div className={styles.dialogButtons}>
                  <button
                    className={styles.dialogCancelBtn}
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
              </div>
            </div>
          );
        })()}
    </div>
  );
}
