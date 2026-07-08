interface CanvasErrorFallbackProps {
  error: Error;
  onReset: () => void;
  onHome: () => void;
}

export function CanvasErrorFallback({ error, onReset, onHome }: CanvasErrorFallbackProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        padding: 32,
        fontFamily: 'var(--font-ui, sans-serif)',
        color: 'var(--text-primary, #333)',
      }}
    >
      <span style={{ fontSize: 32, marginBottom: 8 }}>&#9888;</span>
      <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 600 }}>Canvas encountered an error</h2>
      <p style={{ margin: '0 0 4px', fontSize: 13, color: 'var(--text-secondary, #888)', textAlign: 'center' }}>
        Something went wrong while rendering the canvas.
      </p>
      <p style={{ margin: '0 0 16px', fontSize: 11, color: 'var(--text-tertiary, #aaa)', maxWidth: 400, textAlign: 'center' }}>
        {error.message}
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={onHome}
          style={{
            padding: '6px 16px',
            borderRadius: 6,
            border: '1px solid var(--border, #e0e0e0)',
            background: 'var(--bg-elevated, #fff)',
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          Return to home
        </button>
        <button
          onClick={onReset}
          style={{
            padding: '6px 16px',
            borderRadius: 6,
            border: 'none',
            background: 'var(--accent, #4f46e5)',
            color: '#fff',
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
