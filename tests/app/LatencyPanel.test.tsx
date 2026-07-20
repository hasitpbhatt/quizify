import { it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { LatencyPanel } from '@/app/LatencyPanel';
import { useLatencyStore } from '@/shared/stores/latencyStore';

beforeEach(() => {
  useLatencyStore.setState({
    entries: [],
    callCount: 0,
    rpm: 0,
    visible: false,
    overallStart: null,
  });
});

it('returns null when visible is false', () => {
  const { container } = render(<LatencyPanel />);
  expect(container.firstChild).toBeNull();
});

it('returns null when overallStart is null even if visible', () => {
  useLatencyStore.getState().setVisible(true);
  const { container } = render(<LatencyPanel />);
  expect(container.firstChild).toBeNull();
});

it('renders the panel when visible and generating', () => {
  useLatencyStore.getState().setVisible(true);
  useLatencyStore.getState().reset(); // sets overallStart
  const { container } = render(<LatencyPanel />);
  // The panel mounts and shows meta info
  expect(container.textContent).toContain('LLM calls');
  expect(container.textContent).toContain('Rate');
});

it('shows stage entries', () => {
  useLatencyStore.getState().setVisible(true);
  useLatencyStore.getState().reset();
  useLatencyStore.getState().startStage('fetch', 'Reading the source...');
  useLatencyStore.getState().endStage('fetch');
  useLatencyStore.getState().startStage('outline', 'Sketching an outline...');

  render(<LatencyPanel />);
  expect(screen.getByText('Reading the source...')).toBeTruthy();
  expect(screen.getByText('Sketching an outline...')).toBeTruthy();
});

it('setVisible(false) hides the panel', () => {
  useLatencyStore.getState().setVisible(true);
  useLatencyStore.getState().reset();
  const { rerender, container } = render(<LatencyPanel />);
  expect(container.firstChild).not.toBeNull();

  act(() => { useLatencyStore.getState().setVisible(false); });
  rerender(<LatencyPanel />);
  expect(container.firstChild).toBeNull();
});
