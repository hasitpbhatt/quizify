import { useState } from 'react';
import { Sparkles, GraduationCap, Briefcase, Microscope, Eye, EyeOff, ArrowRight, ChevronDown, Key, Cpu, Globe } from 'lucide-react';
import { PersonaCard } from './PersonaCard';
import { useWelcomeState, EXAMPLE_CHIPS } from './useWelcomeState';
import { useSettingsStore } from '@/shared/stores/settingsStore';
import { PROVIDERS } from '@/lib/llm/providers';
import type { LlmProvider, Persona } from '@/shared/types';
import styles from './WelcomeModal.module.css';

interface WelcomeModalProps {
  onGenerate: (url: string) => void;
  error?: string;
  onClearError?: () => void;
}

const PERSONAS: { value: Persona; label: string; sublabel: string; description: string; icon: typeof Sparkles }[] = [
  { value: 'curious', label: 'Curious', sublabel: 'beginner', description: 'Plain language & analogies', icon: Sparkles },
  { value: 'student', label: 'Student', sublabel: 'textbook', description: 'Exam-style questions', icon: GraduationCap },
  { value: 'professional', label: 'Professional', sublabel: 'practical', description: 'Applied scenarios', icon: Briefcase },
  { value: 'expert', label: 'Expert', sublabel: 'terse', description: 'Edge cases & depth', icon: Microscope },
];

export function WelcomeModal({ onGenerate, error, onClearError }: WelcomeModalProps) {
  const { url, persona, provider, setUrl, setApiKey, setPersona, setProvider, submitEnabled, submitDisabledReason } = useWelcomeState();
  const { jinaToken, apiKey, setJinaToken } = useSettingsStore();
  const [showKey, setShowKey] = useState(false);
  const [showJina, setShowJina] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [exampleUrl, setExampleUrl] = useState('');

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

      <main className={styles.modal}>
        {error && (
          <div className={styles.errorBanner} role="alert">
            <span>{error}</span>
            <button className={styles.errorDismiss} onClick={onClearError} aria-label="Dismiss" type="button">&times;</button>
          </div>
        )}
        <header className={styles.hero}>
          <div className={styles.eyebrow}>
            <Sparkles size={14} />
            <span>Learn anything, visually</span>
          </div>
          <h1 className={styles.heading}>Turn any topic into a canvas you actually remember.</h1>
          <p className={styles.subheading}>
            Paste a URL or type a topic and Quizify breaks it into concepts, quizzes, and a final recap — laid out on an infinite canvas.
          </p>
        </header>

        <section className={styles.section}>
          <label className={styles.label} htmlFor="url-input">What do you want to learn?</label>
          <div className={styles.inputRow}>
            <input
              id="url-input"
              className={styles.urlInput}
              type="text"
              placeholder="Paste a URL or type a topic — e.g. an article link or 'agentic AI'"
              value={url}
              onChange={(e) => { setUrl(e.target.value); setExampleUrl(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
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
          <div className={styles.personaGrid}>
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
              ? `Depth & quiz difficulty tuned to the ${PERSONAS.find(p => p.value === persona)?.label.toLowerCase()} in you.`
              : 'We’ll match the depth and quiz style to your pick.'}
          </p>
        </section>

        <section className={styles.settingsSection}>
          <button
            className={styles.settingsToggle}
            onClick={() => setShowSettings(v => !v)}
            aria-expanded={showSettings}
            type="button"
          >
            <span className={styles.settingsToggleLead}>
              <Key size={14} />
              <span>API keys</span>
            </span>
            <span className={styles.settingsToggleTrail}>
              {apiKey.length > 0 ? (
                <span className={styles.badgeOk}>Set</span>
              ) : (
                <span className={styles.badgeWarn}>Required</span>
              )}
              <ChevronDown size={14} className={showSettings ? styles.chevronOpen : ''} />
            </span>
          </button>

          {showSettings && (
            <div className={styles.settingsPanel}>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>AI Provider</label>
                <div className={styles.providerRow}>
                  {(Object.values(PROVIDERS) as Array<typeof PROVIDERS[LlmProvider]>).map((p) => (
                    <button
                      key={p.name}
                      className={`${styles.providerBtn} ${provider === p.name ? styles.providerBtnActive : ''}`}
                      onClick={() => setProvider(p.name)}
                      type="button"
                    >
                      {p.name === 'default' ? <Globe size={14} /> : p.name === 'nvidia' ? <Cpu size={14} /> : <Sparkles size={14} />}
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {PROVIDERS[provider].requiresApiKey ? (
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>{PROVIDERS[provider].apiKeyLabel}</label>
                  <div className={styles.inputWrapper}>
                    <input
                      className={styles.monoInput}
                      type={showKey ? 'text' : 'password'}
                      placeholder={PROVIDERS[provider].apiKeyPlaceholder}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <button
                      className={styles.toggleBtn}
                      onClick={() => setShowKey((v) => !v)}
                      aria-label={showKey ? 'Hide key' : 'Show key'}
                      type="button"
                    >
                      {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <p className={styles.fieldHint}>
                    Stored only on this device. Get a free key from{' '}
                    <a className={styles.mutedLink} href={PROVIDERS[provider].signupUrl} target="_blank" rel="noopener noreferrer">{PROVIDERS[provider].signupUrl.replace(/^https?:\/\//, '')}</a>.
                  </p>
                </div>
              ) : (
                <p className={styles.fieldHint}>{PROVIDERS[provider].apiKeyHint}</p>
              )}

              <div className={styles.field}>
                <label className={styles.fieldLabel}>
                  Jina Reader key{' '}
                  <span className={styles.optional}>(optional)</span>
                </label>
                <div className={styles.inputWrapper}>
                  <input
                    className={styles.monoInput}
                    type={showJina ? 'text' : 'password'}
                    placeholder="Lifts rate limits"
                    value={jinaToken}
                    onChange={(e) => setJinaToken(e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button
                    className={styles.toggleBtn}
                    onClick={() => setShowJina((v) => !v)}
                    aria-label={showJina ? 'Hide token' : 'Show token'}
                    type="button"
                  >
                    {showJina ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <p className={styles.fieldHint}>Get a free one at jina.ai/apikey.</p>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
