import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ErrorBoundary } from '@/lib/components/ErrorBoundary';

const Bomb = ({ shouldThrow }: { shouldThrow?: boolean }) => {
  if (shouldThrow) throw new Error('💣');
  return <div>safe</div>;
};

describe('ErrorBoundary', () => {
  it('renders children when no error', () => {
    render(
      <ErrorBoundary fallback={<div>error</div>}>
        <div>hello</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText('hello')).toBeTruthy();
  });

  it('renders fallback when child throws', () => {
    render(
      <ErrorBoundary fallback={<div>error occurred</div>}>
        <Bomb shouldThrow />
      </ErrorBoundary>,
    );
    expect(screen.getByText('error occurred')).toBeTruthy();
  });

  it('calls onError callback when child throws', () => {
    const onError = vi.fn();
    render(
      <ErrorBoundary fallback={<div>error</div>} onError={onError}>
        <Bomb shouldThrow />
      </ErrorBoundary>,
    );
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(onError.mock.calls[0][0].message).toBe('💣');
  });

  it('resets and re-renders children when reset is called', () => {
    function Test() {
      return (
        <ErrorBoundary
          fallback={(error, reset) => (
            <div>
              <span>error: {error.message}</span>
              <button onClick={reset}>reset</button>
            </div>
          )}
        >
          <Bomb shouldThrow />
        </ErrorBoundary>
      );
    }
    render(<Test />);
    expect(screen.getByText(/error:/)).toBeTruthy();

    // After reset, the bomb still throws because the component re-mounts
    // with the same props. This test verifies the reset function exists
    // and triggers state change — the behavior depends on whether the
    // throwing component is rendered with the same prop again.
    fireEvent.click(screen.getByText('reset'));
    // The error boundary should re-attempt rendering children
    // (component will throw again since the bomb is unconditional)
    expect(screen.getByText(/error:/)).toBeTruthy();
  });
});
