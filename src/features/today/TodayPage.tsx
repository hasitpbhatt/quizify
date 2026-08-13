import { useMemo } from 'react';
import { useGoalStore } from '@/shared/stores/goalStore';
import { useSessionStore } from '@/shared/stores/sessionStore';
import type { LearningGoal, Session } from '@/shared/types';

interface TodayPageProps {
  onSelectSession: (id: string) => void;
  onNewGoal: () => void;
  onNewSource: () => void;
}

export function TodayPage({ onSelectSession, onNewGoal, onNewSource }: TodayPageProps) {
  const goals = useGoalStore((s) => s.goals);
  const getDueReviews = useGoalStore((s) => s.getDueReviews);
  const getGoalProgress = useGoalStore((s) => s.getGoalProgress);
  const sessions = useSessionStore((s) => s.sessions);

  const dueReviews = useMemo(() => getDueReviews(), [getDueReviews, sessions]);

  // Group due reviews by session
  const dueBySession = useMemo(() => {
    const map = new Map<string, { sessionName: string; count: number }>();
    for (const item of dueReviews) {
      const existing = map.get(item.sessionId) ?? { sessionName: item.sessionName, count: 0 };
      existing.count++;
      map.set(item.sessionId, existing);
    }
    return Array.from(map.entries()).map(([sessionId, data]) => ({
      sessionId,
      sessionName: data.sessionName,
      count: data.count,
    }));
  }, [dueReviews]);

  return (
    <div
      style={{
        maxWidth: 960,
        margin: '0 auto',
        padding: '32px 20px',
        color: 'var(--text-primary, #cdd6f4)',
        fontFamily: 'var(--font-ui, system-ui, sans-serif)',
      }}
    >
      {/* Header Banner */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 36,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 32, fontWeight: 800, letterSpacing: '-0.5px' }}>
            Today's Learning Inbox
          </h1>
          <p style={{ margin: '6px 0 0 0', color: 'var(--text-secondary, #a6adc8)', fontSize: 15 }}>
            {dueReviews.length > 0
              ? `You have ${dueReviews.length} concept${dueReviews.length === 1 ? '' : 's'} due for review today.`
              : 'All caught up on reviews! Ready to learn something new?'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={onNewGoal}
            style={{
              padding: '10px 18px',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.2)',
              background: 'transparent',
              color: '#cdd6f4',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            + New Goal
          </button>
          <button
            onClick={onNewSource}
            style={{
              padding: '10px 18px',
              borderRadius: 8,
              border: 'none',
              background: 'var(--accent, #89b4fa)',
              color: '#11111b',
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            + Add Material
          </button>
        </div>
      </div>

      {/* Due Reviews Section */}
      <div style={{ marginBottom: 40 }}>
        <h2
          style={{
            fontSize: 20,
            fontWeight: 700,
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span>📌</span> Due for Review ({dueReviews.length})
        </h2>

        {dueBySession.length === 0 ? (
          <div
            style={{
              padding: 28,
              borderRadius: 12,
              border: '1px dashed rgba(255,255,255,0.15)',
              textAlign: 'center',
              color: 'var(--text-secondary, #a6adc8)',
            }}
          >
            <p style={{ margin: 0, fontSize: 15 }}>
              🎉 No overdue concepts. Your durable memory is in great shape!
            </p>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 16,
            }}
          >
            {dueBySession.map((item) => (
              <div
                key={item.sessionId}
                style={{
                  padding: 20,
                  borderRadius: 12,
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <h3 style={{ margin: '0 0 6px 0', fontSize: 16, fontWeight: 600 }}>
                    {item.sessionName}
                  </h3>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary, #a6adc8)' }}>
                    {item.count} concept{item.count === 1 ? '' : 's'} due · ~
                    {Math.max(2, item.count * 2)} min review
                  </p>
                </div>

                <button
                  onClick={() => onSelectSession(item.sessionId)}
                  style={{
                    marginTop: 16,
                    padding: '8px 14px',
                    borderRadius: 6,
                    border: 'none',
                    background: 'var(--accent, #89b4fa)',
                    color: '#11111b',
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  Review Now →
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Active Goals Section */}
      <div style={{ marginBottom: 40 }}>
        <h2
          style={{
            fontSize: 20,
            fontWeight: 700,
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span>🎯</span> Active Learning Goals ({goals.length})
        </h2>

        {goals.length === 0 ? (
          <div
            style={{
              padding: 28,
              borderRadius: 12,
              border: '1px dashed rgba(255,255,255,0.15)',
              textAlign: 'center',
              color: 'var(--text-secondary, #a6adc8)',
            }}
          >
            <p style={{ margin: '0 0 12px 0', fontSize: 15 }}>
              No goals configured yet. Group your course materials under a goal for spaced review
              tracking.
            </p>
            <button
              onClick={onNewGoal}
              style={{
                padding: '8px 16px',
                borderRadius: 6,
                border: 'none',
                background: 'rgba(255,255,255,0.1)',
                color: '#cdd6f4',
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              + Create your first Goal
            </button>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: 16,
            }}
          >
            {goals.map((goal: LearningGoal) => {
              const progress = getGoalProgress(goal.id);
              const daysLeft = goal.examDate
                ? Math.max(0, Math.ceil((goal.examDate - Date.now()) / (1000 * 60 * 60 * 24)))
                : null;

              return (
                <div
                  key={goal.id}
                  style={{
                    padding: 20,
                    borderRadius: 12,
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      marginBottom: 8,
                    }}
                  >
                    <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{goal.title}</h3>
                    {daysLeft !== null && (
                      <span
                        style={{
                          fontSize: 12,
                          padding: '2px 8px',
                          borderRadius: 12,
                          background:
                            daysLeft <= 7 ? 'rgba(243, 139, 168, 0.2)' : 'rgba(137, 180, 250, 0.2)',
                          color: daysLeft <= 7 ? '#f38ba8' : '#89b4fa',
                          fontWeight: 600,
                        }}
                      >
                        {daysLeft}d left
                      </span>
                    )}
                  </div>

                  {goal.subject && (
                    <span
                      style={{
                        fontSize: 12,
                        color: 'var(--text-secondary, #a6adc8)',
                        display: 'block',
                        marginBottom: 12,
                      }}
                    >
                      📚 {goal.subject}
                    </span>
                  )}

                  {/* Progress Bar */}
                  <div style={{ marginBottom: 12 }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: 12,
                        marginBottom: 4,
                      }}
                    >
                      <span>Retention progress</span>
                      <span>{progress.pct}%</span>
                    </div>
                    <div
                      style={{
                        height: 6,
                        borderRadius: 3,
                        background: 'rgba(255,255,255,0.1)',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${progress.pct}%`,
                          background: 'var(--accent, #89b4fa)',
                          borderRadius: 3,
                          transition: 'width 0.3s ease',
                        }}
                      />
                    </div>
                  </div>

                  <div
                    style={{
                      fontSize: 13,
                      color: 'var(--text-secondary, #a6adc8)',
                      display: 'flex',
                      gap: 12,
                    }}
                  >
                    <span>✅ {progress.learned} concepts learned</span>
                    <span>·</span>
                    <span>📖 {goal.sessionIds.length} materials</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent Notebook Sessions */}
      <div>
        <h2
          style={{
            fontSize: 20,
            fontWeight: 700,
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span>📚</span> All Notebook Sessions ({sessions.length})
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sessions.slice(0, 5).map((session: Session) => (
            <div
              key={session.id}
              onClick={() => onSelectSession(session.id)}
              style={{
                padding: '12px 18px',
                borderRadius: 8,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                cursor: 'pointer',
                transition: 'background 0.2s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
            >
              <div>
                <span style={{ fontWeight: 600, fontSize: 15, marginRight: 12 }}>
                  {session.name}
                </span>
                <span style={{ fontSize: 13, color: 'var(--text-secondary, #a6adc8)' }}>
                  {(session.nodes ?? []).filter((n) => n.data.kind === 'concept').length} concepts
                </span>
              </div>
              <span style={{ fontSize: 13, color: 'var(--text-secondary, #a6adc8)' }}>
                {new Date(session.updatedAt).toLocaleDateString()} →
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
