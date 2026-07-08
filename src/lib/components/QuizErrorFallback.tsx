interface QuizErrorFallbackProps {
  onClose?: () => void;
}

export function QuizErrorFallback({ onClose }: QuizErrorFallbackProps) {
  return (
    <div
      style={{
        padding: '16px 20px',
        borderRadius: 8,
        border: '1px dashed var(--border, #e0e0e0)',
        background: 'var(--bg-elevated, #fafafa)',
        fontSize: 13,
        fontFamily: 'var(--font-ui, sans-serif)',
        color: 'var(--text-secondary, #888)',
        textAlign: 'center',
      }}
    >
      <div style={{ marginBottom: 8 }}>Quiz failed to load</div>
      {onClose && (
        <button
          onClick={onClose}
          style={{
            padding: '4px 12px',
            borderRadius: 4,
            border: '1px solid var(--border, #e0e0e0)',
            background: 'transparent',
            cursor: 'pointer',
            fontSize: 12,
            color: 'var(--text-secondary, #888)',
          }}
        >
          Close
        </button>
      )}
    </div>
  );
}
