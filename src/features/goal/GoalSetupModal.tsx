import React, { useState } from 'react';
import { useGoalStore } from '@/shared/stores/goalStore';

interface GoalSetupModalProps {
  onComplete: (goalId: string) => void;
  onSkip: () => void;
}

export function GoalSetupModal({ onComplete, onSkip }: GoalSetupModalProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [examDateStr, setExamDateStr] = useState('');
  const [dailyMinutes, setDailyMinutes] = useState(20);
  const [confidence, setConfidence] = useState<'low' | 'medium' | 'high'>('medium');

  const createGoal = useGoalStore((s) => s.createGoal);

  const subjects = [
    'Biology',
    'Psychology',
    'History',
    'Business',
    'Law',
    'Computer Science',
    'Other',
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const examDate = examDateStr ? new Date(examDateStr).getTime() : undefined;
    const goal = await createGoal({
      title,
      subject: subject || undefined,
      examDate,
      dailyMinutes,
      confidence,
    });

    onComplete(goal.id);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 20,
      }}
    >
      <div
        style={{
          background: 'var(--bg-surface, #1e1e2e)',
          color: 'var(--text-primary, #cdd6f4)',
          borderRadius: 16,
          padding: 32,
          maxWidth: 520,
          width: '100%',
          boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
          border: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 24,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Set a Learning Goal</h2>
          <button
            onClick={onSkip}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary, #a6adc8)',
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            Skip for now
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {step === 1 && (
            <div>
              <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 600 }}>
                What are you studying or preparing for?
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Cell Biology Midterm, Macroeconomics 101"
                required
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: 8,
                  border: '1px solid rgba(255,255,255,0.2)',
                  background: 'rgba(0,0,0,0.2)',
                  color: '#fff',
                  fontSize: 15,
                  marginBottom: 16,
                }}
              />

              <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 600 }}>
                Subject Tag (Optional)
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
                {subjects.map((sub) => (
                  <button
                    key={sub}
                    type="button"
                    onClick={() => setSubject(sub === subject ? '' : sub)}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 20,
                      border: '1px solid rgba(255,255,255,0.2)',
                      background: subject === sub ? 'var(--accent, #89b4fa)' : 'transparent',
                      color: subject === sub ? '#11111b' : '#cdd6f4',
                      cursor: 'pointer',
                      fontSize: 13,
                    }}
                  >
                    {sub}
                  </button>
                ))}
              </div>

              <button
                type="button"
                disabled={!title.trim()}
                onClick={() => setStep(2)}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: 8,
                  border: 'none',
                  background: title.trim() ? 'var(--accent, #89b4fa)' : '#45475a',
                  color: title.trim() ? '#11111b' : '#a6adc8',
                  fontWeight: 600,
                  fontSize: 15,
                  cursor: title.trim() ? 'pointer' : 'not-allowed',
                }}
              >
                Next: Target Date & Pacing →
              </button>
            </div>
          )}

          {step === 2 && (
            <div>
              <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 600 }}>
                Target Date / Exam Date (Optional)
              </label>
              <input
                type="date"
                value={examDateStr}
                onChange={(e) => setExamDateStr(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: 8,
                  border: '1px solid rgba(255,255,255,0.2)',
                  background: 'rgba(0,0,0,0.2)',
                  color: '#fff',
                  fontSize: 15,
                  marginBottom: 20,
                }}
              />

              <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 600 }}>
                Daily Study Target: {dailyMinutes} mins
              </label>
              <input
                type="range"
                min="5"
                max="60"
                step="5"
                value={dailyMinutes}
                onChange={(e) => setDailyMinutes(Number(e.target.value))}
                style={{ width: '100%', marginBottom: 24 }}
              />

              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: 8,
                    border: '1px solid rgba(255,255,255,0.2)',
                    background: 'transparent',
                    color: '#cdd6f4',
                    cursor: 'pointer',
                  }}
                >
                  ← Back
                </button>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  style={{
                    flex: 2,
                    padding: '12px',
                    borderRadius: 8,
                    border: 'none',
                    background: 'var(--accent, #89b4fa)',
                    color: '#11111b',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Next: Confidence →
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <label style={{ display: 'block', marginBottom: 12, fontSize: 14, fontWeight: 600 }}>
                How confident do you feel starting out?
              </label>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  gap: 12,
                  marginBottom: 28,
                }}
              >
                {(
                  [
                    { key: 'low', label: '🟥 Shaky', desc: 'Need deep explanations' },
                    { key: 'medium', label: '🟨 Okay', desc: 'Balanced pace' },
                    { key: 'high', label: '🟩 Confident', desc: 'Fast diagnostic pace' },
                  ] as const
                ).map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setConfidence(c.key)}
                    style={{
                      padding: 12,
                      borderRadius: 10,
                      border:
                        confidence === c.key
                          ? '2px solid var(--accent, #89b4fa)'
                          : '1px solid rgba(255,255,255,0.1)',
                      background:
                        confidence === c.key ? 'rgba(137, 180, 250, 0.15)' : 'rgba(0,0,0,0.2)',
                      color: '#cdd6f4',
                      cursor: 'pointer',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{c.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary, #a6adc8)' }}>
                      {c.desc}
                    </div>
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: 8,
                    border: '1px solid rgba(255,255,255,0.2)',
                    background: 'transparent',
                    color: '#cdd6f4',
                    cursor: 'pointer',
                  }}
                >
                  ← Back
                </button>
                <button
                  type="submit"
                  style={{
                    flex: 2,
                    padding: '12px',
                    borderRadius: 8,
                    border: 'none',
                    background: 'var(--accent, #89b4fa)',
                    color: '#11111b',
                    fontWeight: 700,
                    fontSize: 15,
                    cursor: 'pointer',
                  }}
                >
                  🚀 Create Goal & Add Source
                </button>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
