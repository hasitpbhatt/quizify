import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MultipleChoice } from '@/features/quiz/formats/MultipleChoice';
import { TrueFalse } from '@/features/quiz/formats/TrueFalse';
import { ShortAnswer } from '@/features/quiz/formats/ShortAnswer';
import { FreeText } from '@/features/quiz/formats/FreeText';
import { FillBlank } from '@/features/quiz/formats/FillBlank';
import { Ordering } from '@/features/quiz/formats/Ordering';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('MultipleChoice', () => {
  const options = ['A', 'B', 'C'];

  it('renders all options', () => {
    render(<MultipleChoice options={options} disabled={false} onSubmit={vi.fn()} />);
    expect(screen.getByLabelText('A')).toBeInTheDocument();
    expect(screen.getByLabelText('B')).toBeInTheDocument();
    expect(screen.getByLabelText('C')).toBeInTheDocument();
  });

  it('calls onSubmit with selected option on submit click', () => {
    const onSubmit = vi.fn();
    render(<MultipleChoice options={options} disabled={false} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByLabelText('B'));
    fireEvent.click(screen.getByText('Submit'));
    expect(onSubmit).toHaveBeenCalledWith('B');
  });

  it('submit button is disabled when no option is selected', () => {
    render(<MultipleChoice options={options} disabled={false} onSubmit={vi.fn()} />);
    expect(screen.getByText('Submit')).toBeDisabled();
  });

  it('submit button is disabled when disabled prop is true', () => {
    render(<MultipleChoice options={options} disabled={true} onSubmit={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('A'));
    expect(screen.getByText('Submit')).toBeDisabled();
  });

  it('allows changing selection', () => {
    const onSubmit = vi.fn();
    render(<MultipleChoice options={options} disabled={false} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByLabelText('A'));
    fireEvent.click(screen.getByLabelText('C'));
    fireEvent.click(screen.getByText('Submit'));
    expect(onSubmit).toHaveBeenCalledWith('C');
  });
});

describe('TrueFalse', () => {
  it('renders True and False buttons', () => {
    render(<TrueFalse disabled={false} onSubmit={vi.fn()} />);
    expect(screen.getByText('True')).toBeInTheDocument();
    expect(screen.getByText('False')).toBeInTheDocument();
  });

  it('calls onSubmit with "true" when True is clicked', () => {
    const onSubmit = vi.fn();
    render(<TrueFalse disabled={false} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByText('True'));
    expect(onSubmit).toHaveBeenCalledWith('true');
  });

  it('calls onSubmit with "false" when False is clicked', () => {
    const onSubmit = vi.fn();
    render(<TrueFalse disabled={false} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByText('False'));
    expect(onSubmit).toHaveBeenCalledWith('false');
  });

  it('both buttons are disabled when disabled prop is true', () => {
    render(<TrueFalse disabled={true} onSubmit={vi.fn()} />);
    expect(screen.getByText('True')).toBeDisabled();
    expect(screen.getByText('False')).toBeDisabled();
  });

  it('does not call onSubmit when disabled', () => {
    const onSubmit = vi.fn();
    render(<TrueFalse disabled={true} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByText('True'));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('ShortAnswer', () => {
  it('renders input field with placeholder', () => {
    render(<ShortAnswer disabled={false} onSubmit={vi.fn()} />);
    expect(screen.getByPlaceholderText('Type your answer…')).toBeInTheDocument();
  });

  it('calls onSubmit with trimmed value on submit click', () => {
    const onSubmit = vi.fn();
    render(<ShortAnswer disabled={false} onSubmit={onSubmit} />);
    const input = screen.getByPlaceholderText('Type your answer…');
    fireEvent.change(input, { target: { value: '  hello  ' } });
    fireEvent.click(screen.getByText('Submit'));
    expect(onSubmit).toHaveBeenCalledWith('hello');
  });

  it('calls onSubmit on Enter key press', () => {
    const onSubmit = vi.fn();
    render(<ShortAnswer disabled={false} onSubmit={onSubmit} />);
    const input = screen.getByPlaceholderText('Type your answer…');
    fireEvent.change(input, { target: { value: 'answer' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledWith('answer');
  });

  it('submit button is disabled when input is empty', () => {
    render(<ShortAnswer disabled={false} onSubmit={vi.fn()} />);
    expect(screen.getByText('Submit')).toBeDisabled();
  });

  it('submit button is disabled when disabled prop is true', () => {
    render(<ShortAnswer disabled={true} onSubmit={vi.fn()} />);
    const input = screen.getByPlaceholderText('Type your answer…');
    fireEvent.change(input, { target: { value: 'answer' } });
    expect(screen.getByText('Submit')).toBeDisabled();
  });
});

describe('FreeText', () => {
  it('renders textarea with placeholder', () => {
    render(<FreeText disabled={false} onSubmit={vi.fn()} />);
    expect(screen.getByPlaceholderText('Write your answer in detail…')).toBeInTheDocument();
  });

  it('calls onSubmit with trimmed value on submit click', () => {
    const onSubmit = vi.fn();
    render(<FreeText disabled={false} onSubmit={onSubmit} />);
    const textarea = screen.getByPlaceholderText('Write your answer in detail…');
    fireEvent.change(textarea, { target: { value: '  detailed answer  ' } });
    fireEvent.click(screen.getByText('Submit'));
    expect(onSubmit).toHaveBeenCalledWith('detailed answer');
  });

  it('submit button is disabled when textarea is empty', () => {
    render(<FreeText disabled={false} onSubmit={vi.fn()} />);
    expect(screen.getByText('Submit')).toBeDisabled();
  });

  it('submit button is disabled when disabled prop is true', () => {
    render(<FreeText disabled={true} onSubmit={vi.fn()} />);
    const textarea = screen.getByPlaceholderText('Write your answer in detail…');
    fireEvent.change(textarea, { target: { value: 'answer' } });
    expect(screen.getByText('Submit')).toBeDisabled();
  });
});

describe('FillBlank', () => {
  const sentence = 'The sky is ___.';

  it('renders text before and after blank', () => {
    render(<FillBlank blankedSentence={sentence} disabled={false} onSubmit={vi.fn()} />);
    expect(screen.getByText((t) => t.includes('The sky is'))).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('renders an input for the blank', () => {
    render(<FillBlank blankedSentence={sentence} disabled={false} onSubmit={vi.fn()} />);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('calls onSubmit with filled value on submit click', () => {
    const onSubmit = vi.fn();
    render(<FillBlank blankedSentence={sentence} disabled={false} onSubmit={onSubmit} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'blue' } });
    fireEvent.click(screen.getByText('Submit'));
    expect(onSubmit).toHaveBeenCalledWith('blue');
  });

  it('submit button is disabled when blank is empty', () => {
    render(<FillBlank blankedSentence={sentence} disabled={false} onSubmit={vi.fn()} />);
    expect(screen.getByText('Submit')).toBeDisabled();
  });

  it('submit button is disabled when disabled prop is true', () => {
    render(<FillBlank blankedSentence={sentence} disabled={true} onSubmit={vi.fn()} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'blue' } });
    expect(screen.getByText('Submit')).toBeDisabled();
  });

  it('handles sentence without trailing text after blank', () => {
    render(<FillBlank blankedSentence="Fill ___" disabled={false} onSubmit={vi.fn()} />);
    expect(screen.getByText((t) => t.startsWith('Fill'))).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });
});

describe('Ordering', () => {
  const items = ['first', 'second', 'third'];

  it('renders all items', () => {
    render(<Ordering items={items} disabled={false} onSubmit={vi.fn()} />);
    expect(screen.getByText('first')).toBeInTheDocument();
    expect(screen.getByText('second')).toBeInTheDocument();
    expect(screen.getByText('third')).toBeInTheDocument();
  });

  it('calls onSubmit with the current order array on submit click', () => {
    const onSubmit = vi.fn();
    render(<Ordering items={items} disabled={false} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByText('Submit Order'));
    expect(onSubmit).toHaveBeenCalledOnce();
    const result = onSubmit.mock.calls[0][0];
    expect(result).toHaveLength(3);
    expect(result).toEqual(expect.arrayContaining(items));
  });

  it('submit button is disabled when disabled prop is true', () => {
    render(<Ordering items={items} disabled={true} onSubmit={vi.fn()} />);
    expect(screen.getByText('Submit Order')).toBeDisabled();
  });

  it('items are not draggable when disabled', () => {
    render(<Ordering items={items} disabled={true} onSubmit={vi.fn()} />);
    const itemDivs = screen.getByText('first').closest('[draggable]');
    expect(itemDivs).toHaveAttribute('draggable', 'false');
  });
});
