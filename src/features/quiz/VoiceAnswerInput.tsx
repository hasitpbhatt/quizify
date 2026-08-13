import { useState, useRef, useEffect } from 'react';
import { transcribeAudio } from '@/lib/llm/stt';

interface VoiceAnswerInputProps {
  onTranscribed: (text: string) => void;
  disabled?: boolean;
}

export function VoiceAnswerInput({ onTranscribed, disabled }: VoiceAnswerInputProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const startRecording = async () => {
    if (disabled || isRecording || isTranscribing) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });

        if (blob.size < 100) return; // Too short / empty

        setIsTranscribing(true);
        const transcript = await transcribeAudio(blob, 'webm');
        setIsTranscribing(false);

        if (transcript && transcript.trim()) {
          onTranscribed(transcript.trim());
        }
      };

      mediaRecorder.start(200);
      setIsRecording(true);
    } catch (err) {
      console.error('Microphone access failed:', err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  return (
    <button
      type="button"
      onClick={isRecording ? stopRecording : startRecording}
      disabled={disabled || isTranscribing}
      title={isRecording ? 'Click to stop recording' : 'Click to answer with voice'}
      style={{
        padding: '8px 14px',
        borderRadius: 8,
        border: isRecording ? '2px solid #f38ba8' : '1px solid rgba(255,255,255,0.2)',
        background: isRecording
          ? 'rgba(243, 139, 168, 0.2)'
          : isTranscribing
            ? 'rgba(137, 180, 250, 0.2)'
            : 'rgba(255,255,255,0.08)',
        color: isRecording ? '#f38ba8' : '#cdd6f4',
        cursor: disabled || isTranscribing ? 'not-allowed' : 'pointer',
        fontSize: 13,
        fontWeight: 600,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        transition: 'all 0.2s ease',
      }}
    >
      {isTranscribing ? (
        <>⏳ Transcribing...</>
      ) : isRecording ? (
        <>🔴 Recording (click to stop)</>
      ) : (
        <>🎙️ Answer by voice</>
      )}
    </button>
  );
}
