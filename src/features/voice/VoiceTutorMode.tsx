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

export function VoiceTutorMode({ nodes, sessionId, persona, onClose }: VoiceTutorModeProps) {
  const conceptNodes = nodes.filter((n) => n.data.kind === 'concept');
  const [conceptIndex, setConceptIndex] = useState(0);
  const [step, setStep] = useState<Step>('narrating_concept');
  const [transcript, setTranscript] = useState('');
  const [feedbackText, setFeedbackText] = useState('');
  const [gradeResult, setGradeResult] = useState<'correct' | 'partial' | 'incorrect' | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const currentConcept = conceptNodes[conceptIndex]?.data as ConceptData | undefined;
  const currentQuiz = currentConcept
    ? (nodes.find(
        (n) =>
          n.data.kind === 'quiz' &&
          (n.data as QuizData).parentConceptId === conceptNodes[conceptIndex].id,
      )?.data as QuizData | undefined)
    : undefined;

  // Step 1: Speak Concept Explanation
  useEffect(() => {
    if (!currentConcept) return;

    setStep('narrating_concept');
    setTranscript('');
    setFeedbackText('');
    setGradeResult(null);

    const textToSpeak = `${currentConcept.title}. ${currentConcept.explanation}`;
    ttsManager.clearQueue();
    ttsManager.enqueue({ nodeId: 'vt_concept', text: textToSpeak });

    ttsManager.setCallbacks({
      onQueueEnd: () => {
        if (currentQuiz) {
          setStep('asking_quiz');
        } else {
          // Advance concept if no quiz
          if (conceptIndex + 1 < conceptNodes.length) {
            setConceptIndex((i) => i + 1);
          }
        }
      },
    });

    ttsManager.start();

    return () => {
      ttsManager.stop();
    };
  }, [conceptIndex, currentConcept]);

  // Step 2: Speak Quiz Prompt
  useEffect(() => {
    if (step !== 'asking_quiz' || !currentQuiz) return;

    ttsManager.clearQueue();
    ttsManager.enqueue({ nodeId: 'vt_quiz', text: `Here is a question: ${currentQuiz.prompt}` });
    ttsManager.setCallbacks({
      onQueueEnd: () => {
        startListening();
      },
    });
    ttsManager.start();
  }, [step, currentQuiz]);

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
      setStep('asking_quiz');
    }
  };

  const stopListening = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const processAnswer = async (givenText: string) => {
    if (!currentQuiz || !currentConcept) return;

    setStep('grading');
    const grade = localGrade(currentQuiz, givenText).grade;

    setGradeResult(grade);

    // Save concept mastery in goal store
    await useGoalStore
      .getState()
      .updateConceptMastery(sessionId, conceptNodes[conceptIndex].id, grade, 'immediate');

    // Generate spoken feedback
    const feedback = await fetchVoiceFeedback({
      conceptTitle: currentConcept.title,
      question: currentQuiz.prompt,
      answer: givenText,
      grade,
      rationale: currentQuiz.rationale,
      persona,
    });

    setFeedbackText(feedback);
    setStep('feedback');

    // Speak feedback
    ttsManager.clearQueue();
    ttsManager.enqueue({ nodeId: 'vt_feedback', text: feedback });
    ttsManager.setCallbacks({
      onQueueEnd: () => {
        // Advance to next concept after 2s
        setTimeout(() => {
          if (conceptIndex + 1 < conceptNodes.length) {
            setConceptIndex((i) => i + 1);
          } else {
            onClose();
          }
        }, 2000);
      },
    });
    ttsManager.start();
  };

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
      <div>
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
      </div>
    </div>
  );
}
