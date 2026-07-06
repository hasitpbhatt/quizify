import { useState, useCallback, useMemo } from 'react';
import styles from './SummaryQuizInteraction.module.css';
import type { QuizData } from '@/shared/types';
import { MultipleChoice } from './formats/MultipleChoice';
import { TrueFalse } from './formats/TrueFalse';
import { ShortAnswer } from './formats/ShortAnswer';
import { FreeText } from './formats/FreeText';
import { FillBlank } from './formats/FillBlank';
import { Ordering } from './formats/Ordering';

interface Props {
  sessionId: string;
  quizData: QuizData[];
  onClose: () => void;
  onRetake: () => void;
}

export function SummaryQuizInteraction({ sessionId, quizData, onClose, onRetake }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<boolean[]>(() => {
    const saved = sessionStorage.getItem(`summary-quiz-${sessionId}`);
    return saved ? JSON.parse(saved) : [];
  });
  const [showResults, setShowResults] = useState(false);

  const current = quizData[currentIndex];
  const total = quizData.length;
  const done = results.length;

  const handleAnswer = useCallback((correct: boolean) => {
    setResults(prev => {
      const next = [...prev];
      next[currentIndex] = correct;
      sessionStorage.setItem(`summary-quiz-${sessionId}`, JSON.stringify(next));
      return next;
    });
  }, [currentIndex, sessionId]);

  const goNext = useCallback(() => {
    if (currentIndex < total - 1) {
      setCurrentIndex(i => i + 1);
    }
  }, [currentIndex, total]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(i => i - 1);
    }
  }, [currentIndex]);

  const finishQuiz = useCallback(() => {
    setShowResults(true);
  }, []);

  const masteryPct = useMemo(() => {
    if (results.length === 0) return 0;
    return Math.round((results.filter(Boolean).length / results.length) * 100);
  }, [results]);

  const retakeAll = useCallback(() => {
    sessionStorage.removeItem(`summary-quiz-${sessionId}`);
    setResults([]);
    setCurrentIndex(0);
    setShowResults(false);
    onRetake();
  }, [sessionId, onRetake]);

  if (showResults) {
    const correct = results.filter(Boolean).length;
    const incorrect = results.filter(r => !r).length;
    const unattempted = total - results.length;

    return (
      <div className={styles.overlay} onClick={onClose}>
        <div className={styles.panel} onClick={e => e.stopPropagation()}>
          <div className={styles.resultsPanel}>
            <div className={styles.masteryPct}>{masteryPct}%</div>
            <div className={styles.masteryLabel}>Mastery</div>
            <div className={styles.breakdown}>
              <div>
                <div className={styles.breakdownGreen}>{correct}</div>
                <div className={styles.breakdownLabel}>Correct</div>
              </div>
              <div>
                <div className={styles.breakdownYellow}>{unattempted}</div>
                <div className={styles.breakdownLabel}>Unanswered</div>
              </div>
              <div>
                <div className={styles.breakdownRed}>{incorrect}</div>
                <div className={styles.breakdownLabel}>Incorrect</div>
              </div>
            </div>
            <div className={styles.actions}>
              <button className={styles.primaryBtn} onClick={retakeAll}>Retake All</button>
              <button className={styles.secondaryBtn} onClick={onClose}>Close</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!current) return null;

  const answered = results[currentIndex] !== undefined;

  const submitAnswer = (answer: string | string[]) => {
    const normalizedAnswer = Array.isArray(answer) ? answer.join('|') : answer;
    const correct = normalizedAnswer.trim().toLowerCase() === current.correctAnswer.trim().toLowerCase();
    handleAnswer(correct);
  };

  const submitOrdering = (answer: string[]) => {
    const correct = answer.join('|').toLowerCase() === current.correctAnswer.toLowerCase();
    handleAnswer(correct);
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={e => e.stopPropagation()}>
        <div className={styles.questionCounter}>
          Question {currentIndex + 1} of {total}
        </div>
        <div className={styles.prompt}>{current.prompt}</div>

        {current.format === 'multipleChoice' && (
          <MultipleChoice options={current.options ?? []} disabled={answered} onSubmit={submitAnswer} />
        )}
        {current.format === 'trueFalse' && (
          <TrueFalse disabled={answered} onSubmit={submitAnswer} />
        )}
        {current.format === 'shortAnswer' && (
          <ShortAnswer disabled={answered} onSubmit={submitAnswer} />
        )}
        {current.format === 'freeText' && (
          <FreeText disabled={answered} onSubmit={submitAnswer} />
        )}
        {current.format === 'fillBlank' && (
          <FillBlank blankedSentence={current.blankedSentence ?? ''} disabled={answered} onSubmit={submitAnswer} />
        )}
        {current.format === 'ordering' && (
          <Ordering items={current.items ?? []} disabled={answered} onSubmit={submitOrdering} />
        )}

        <div className={styles.nav}>
          <button className={styles.navBtn} onClick={goPrev} disabled={currentIndex === 0}>
            ← Previous
          </button>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-ui)' }}>
            {done} of {total} answered
          </span>
          {currentIndex < total - 1 ? (
            <button className={styles.navBtn} onClick={goNext} disabled={answered !== true}>
              Next →
            </button>
          ) : (
            <button className={styles.navBtn} style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }} onClick={finishQuiz}>
              Show Results
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
