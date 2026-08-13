import { useState, useEffect, useRef } from 'react';
import { ttsManager } from '@/lib/llm/ttsManager';
import { transcribeAudio } from '@/lib/llm/stt';
import { fetchVoiceFeedback } from '@/lib/llm/voiceTutor';
import { localGrade } from '@/features/quiz/quizGrading';
import type { CanvasNode, ConceptData, QuizData, Persona } from '@/shared/types';
import { useGoalStore } from '@/shared/stores/goalStore';

interface VoiceTutorModeProps {
  nodes: CanvasNode[];
  sessionId: string;
  persona: Persona;
  onClose: () => void;
}

type Step =
  'narrating_concept' | 'asking_quiz' | 'listening' | 'transcribing' | 'grading' | 'feedback';

// If TTS is blocked/stalled, advance anyway so the user is never trapped on a
// silent screen.
const SAFETY_ADVANCE_MS = 12000;

export function VoiceTutorMode({ nodes, sessionId, persona, onClose }: VoiceTutorModeProps) {
  const conceptNodes = nodes.filter((n) => n.data.kind === 'concept');
  const [conceptIndex, setConceptIndex] = useState(0);
  const [step, setStep] = useState<Step>('narrating_concept');
  const [transcript, setTranscript] = useState('');
  const [feedbackText, setFeedbackText] = useState('');
  const [gradeResult, setGradeResult] = useState<'correct' | 'partial' | 'incorrect' | null>(null);

  const stepRef = useRef(step);
  stepRef.current = step;
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => {
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];
  };
  const later = (fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms);
    timersRef.current.push(t);
  };

  const currentConcept = conceptNodes[conceptIndex]?.data as ConceptData | undefined;
  const currentQuiz = currentConcept
    ? (nodes.find(
        (n) =>
          n.data.kind === 'quiz' &&
          (n.data as QuizData).parentConceptId === conceptNodes[conceptIndex].id,
      )?.data as QuizData | undefined)
    : undefined;
  // Keep latest quiz/concept available to async callbacks without stale closures.
  const currentQuizRef = useRef<QuizData | undefined>(undefined);
  currentQuizRef.current = currentQuiz;
  const currentConceptRef = useRef<ConceptData | undefined>(undefined);
  currentConceptRef.current = currentConcept;
  const conceptIndexRef = useRef(conceptIndex);
  conceptIndexRef.current = conceptIndex;

  const advanceConcept = () => {
    if (conceptIndexRef.current + 1 < conceptNodes.length) {
      setConceptIndex((i) => i + 1);
    } else {
      onClose();
    }
  };

  const proceedFromConcept = () => {
    if (stepRef.current !== 'narrating_concept') return;
    if (currentQuizRef.current) setStep('asking_quiz');
    else advanceConcept();
  };

  const advanceAfterFeedback = () => {
    if (stepRef.current !== 'feedback') return;
    advanceConcept();
  };

  // Step 1: Speak Concept Explanation (best-effort; never blocks progression)
  useEffect(() => {
    const concept = conceptNodes[conceptIndex]?.data as ConceptData | undefined;
    if (!concept) return;

    setStep('narrating_concept');
    setTranscript('');
    setFeedbackText('');
    setGradeResult(null);

    const quiz = conceptNodes[conceptIndex]
      ? (nodes.find(
          (n) =>
            n.data.kind === 'quiz' &&
            (n.data as QuizData).parentConceptId === conceptNodes[conceptIndex].id,
        )?.data as QuizData | undefined)
      : undefined;

    const advance = () => {
      if (stepRef.current !== 'narrating_concept') return;
      if (quiz) setStep('asking_quiz');
      else advanceConcept();
    };

    const textToSpeak = `${concept.title}. ${concept.explanation}`;
    ttsManager.clearQueue();
    ttsManager.enqueue({ nodeId: 'vt_concept', text: textToSpeak });
    ttsManager.setCallbacks({ onQueueEnd: advance });
    ttsManager.start();

    // Safety net: if TTS is blocked (autoplay policy, no audio device, etc.)
    // the window must still advance to the question. The user can also tap
    // "Skip intro" to continue immediately.
    later(advance, SAFETY_ADVANCE_MS);

    return () => {
      clearTimers();
      ttsManager.stop();
    };
  }, [conceptIndex]);

  // Step 2: Speak Quiz Prompt (best-effort; mic is started via user gesture)
  useEffect(() => {
    if (step !== 'asking_quiz' || !currentQuizRef.current) return;

    ttsManager.clearQueue();
    ttsManager.enqueue({
      nodeId: 'vt_quiz',
      text: `Here is a question: ${currentQuizRef.current.prompt}`,
    });
    ttsManager.setCallbacks({});
    ttsManager.start();
  }, [step]);

  const startListening = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });

        setStep('transcribing');
        const text = await transcribeAudio(blob, 'webm');
        if (text) {
          setTranscript(text);
          processAnswer(text);
        } else {
          setTranscript('(No speech detected)');
          processAnswer('');
        }
      };

      mediaRecorder.start(200);
      setStep('listening');
    } catch {
      // Mic unavailable / denied — let the user retry from the question screen.
      setStep('asking_quiz');
    }
  };

  const stopListening = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const processAnswer = async (givenText: string) => {
    const quiz = currentQuizRef.current;
    const concept = currentConceptRef.current;
    if (!quiz || !concept) return;

    setStep('grading');
    const grade = localGrade(quiz, givenText).grade;

    setGradeResult(grade);

    // Save concept mastery in goal store
    await useGoalStore
      .getState()
      .updateConceptMastery(
        sessionId,
        conceptNodes[conceptIndexRef.current].id,
        grade,
        'immediate',
      );

    // Generate spoken feedback
    const feedback = await fetchVoiceFeedback({
      conceptTitle: concept.title,
      question: quiz.prompt,
      answer: givenText,
      grade,
      rationale: quiz.rationale,
      persona,
    });

    setFeedbackText(feedback);
    setStep('feedback');

    // Speak feedback
    ttsManager.clearQueue();
    ttsManager.enqueue({ nodeId: 'vt_feedback', text: feedback });
    ttsManager.setCallbacks({ onQueueEnd: advanceAfterFeedback });
    ttsManager.start();

    // Safety net in case feedback TTS never completes.
    later(advanceAfterFeedback, SAFETY_ADVANCE_MS);
  };

  useEffect(() => {
    return () => {
      clearTimers();
      ttsManager.stop();
    };
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(17, 17, 27, 0.95)',
        backdropFilter: 'blur(16px)',
        zIndex: 2000,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        color: '#cdd6f4',
      }}
    >
      {/* Top Header */}
      <div style={{ position: 'absolute', top: 24, right: 24 }}>
        <button
          onClick={onClose}
          style={{
            background: 'rgba(255,255,255,0.1)',
            border: 'none',
            color: '#cdd6f4',
            width: 36,
            height: 36,
            borderRadius: '50%',
            cursor: 'pointer',
            fontSize: 18,
          }}
        >
          ✕
        </button>
      </div>

      {/* Concept Progress */}
      <div
        style={{
          fontSize: 13,
          textTransform: 'uppercase',
          letterSpacing: 1,
          color: '#a6adc8',
          marginBottom: 12,
        }}
      >
        Voice Tutor Mode · Concept {conceptIndex + 1} of {conceptNodes.length}
      </div>

      {/* Main Avatar & Visual Pulse */}
      <div
        style={{
          width: 120,
          height: 120,
          borderRadius: '50%',
          background:
            step === 'listening'
              ? 'radial-gradient(circle, #f38ba8 0%, #11111b 70%)'
              : 'radial-gradient(circle, #89b4fa 0%, #11111b 70%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: step === 'listening' ? '0 0 30px #f38ba8' : '0 0 30px #89b4fa',
          marginBottom: 28,
          transition: 'all 0.4s ease',
        }}
      >
        <span style={{ fontSize: 48 }}>
          {step === 'listening'
            ? '🎙️'
            : step === 'transcribing'
              ? '⏳'
              : step === 'feedback'
                ? '💡'
                : '🗣️'}
        </span>
      </div>

      {/* Content Text Card */}
      <div
        style={{
          maxWidth: 600,
          width: '100%',
          textAlign: 'center',
          background: 'rgba(255,255,255,0.05)',
          padding: 24,
          borderRadius: 16,
          border: '1px solid rgba(255,255,255,0.1)',
          marginBottom: 32,
        }}
      >
        <h2 style={{ margin: '0 0 12px 0', fontSize: 22, fontWeight: 700 }}>
          {currentConcept?.title || 'Loading concept...'}
        </h2>

        {step === 'narrating_concept' && (
          <p style={{ margin: 0, color: '#a6adc8', fontSize: 15, lineHeight: 1.6 }}>
            {currentConcept?.explanation}
          </p>
        )}

        {(step === 'asking_quiz' || step === 'listening' || step === 'transcribing') &&
          currentQuiz && (
            <div>
              <div style={{ fontSize: 13, color: '#89b4fa', fontWeight: 600, marginBottom: 6 }}>
                QUESTION
              </div>
              <p style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>{currentQuiz.prompt}</p>
            </div>
          )}

        {transcript && (
          <div
            style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.1)' }}
          >
            <span style={{ fontSize: 12, color: '#a6adc8' }}>YOUR SPOKEN ANSWER:</span>
            <p style={{ margin: '4px 0 0 0', fontSize: 15, fontStyle: 'italic' }}>"{transcript}"</p>
          </div>
        )}

        {step === 'feedback' && (
          <div style={{ marginTop: 16 }}>
            <span
              style={{
                fontSize: 13,
                fontWeight: 700,
                color:
                  gradeResult === 'correct'
                    ? '#a6e3a1'
                    : gradeResult === 'partial'
                      ? '#f9e2af'
                      : '#f38ba8',
              }}
            >
              RESULT: {gradeResult?.toUpperCase()}
            </span>
            <p style={{ margin: '8px 0 0 0', fontSize: 16 }}>{feedbackText}</p>
          </div>
        )}
      </div>

      {/* Action Controls */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
        {step === 'narrating_concept' && (
          <button
            onClick={proceedFromConcept}
            style={{
              padding: '12px 28px',
              borderRadius: 24,
              border: '1px solid rgba(255,255,255,0.2)',
              background: 'transparent',
              color: '#cdd6f4',
              cursor: 'pointer',
              fontSize: 15,
            }}
          >
            Skip intro ▶
          </button>
        )}

        {step === 'asking_quiz' && (
          <>
            <button
              onClick={startListening}
              style={{
                padding: '12px 28px',
                borderRadius: 24,
                border: 'none',
                background: '#89b4fa',
                color: '#11111b',
                fontWeight: 700,
                cursor: 'pointer',
                fontSize: 15,
              }}
            >
              🎙️ Speak your answer
            </button>
            <button
              onClick={advanceConcept}
              style={{
                padding: '12px 28px',
                borderRadius: 24,
                border: '1px solid rgba(255,255,255,0.2)',
                background: 'transparent',
                color: '#a6adc8',
                cursor: 'pointer',
                fontSize: 15,
              }}
            >
              Skip question
            </button>
          </>
        )}

        {step === 'listening' && (
          <button
            onClick={stopListening}
            style={{
              padding: '12px 28px',
              borderRadius: 24,
              border: 'none',
              background: '#f38ba8',
              color: '#11111b',
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: 15,
            }}
          >
            ⏹ Done Speaking
          </button>
        )}

        {step === 'transcribing' && (
          <div style={{ color: '#a6adc8', fontSize: 15 }}>Listening… transcribing your answer</div>
        )}
      </div>
    </div>
  );
}
