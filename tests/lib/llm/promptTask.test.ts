import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Persona, ChatMessage } from '@/shared/types';

const mockChat = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<{ content: string }>>());
vi.mock('@/lib/llm/chat', () => ({
  chat: mockChat,
}));

import { executePromptTask, type PromptTask, type TaskOptions } from '@/lib/llm/promptTask';

interface TestResult {
  name: string;
  value: number;
}

function makeTask(overrides?: Partial<PromptTask<TestResult>>): PromptTask<TestResult> {
  return {
    id: 'test-task',
    buildSystem: (persona: Persona) => `You are a ${persona} assistant.`,
    buildUser: (input: unknown) => `Process: ${JSON.stringify(input)}`,
    parse: (raw: string) => JSON.parse(raw) as TestResult,
    ...overrides,
  };
}

function makeOpts(overrides?: Partial<TaskOptions>): TaskOptions {
  return {
    persona: 'student' as Persona,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockChat.mockReset();
});

describe('executePromptTask', () => {
  it('builds messages and returns parsed result', async () => {
    mockChat.mockResolvedValue({ content: '{"name":"Alice","value":42}' });

    const result = await executePromptTask(makeTask(), makeOpts(), { topic: 'math' });

    expect(result).toEqual({ name: 'Alice', value: 42 });
    expect(mockChat).toHaveBeenCalledOnce();
    const [messages] = mockChat.mock.calls[0] as [ChatMessage[], Record<string, unknown>];
    expect(messages[0]).toMatchObject({ role: 'system', content: 'You are a student assistant.' });
    expect(messages[1]).toMatchObject({ role: 'user', content: 'Process: {"topic":"math"}' });
  });

  it('passes model option to chat', async () => {
    mockChat.mockResolvedValue({ content: '{"name":"B","value":1}' });

    await executePromptTask(makeTask(), makeOpts({ model: 'custom-model' }), {});

    const [, opts] = mockChat.mock.calls[0] as [ChatMessage[], Record<string, unknown>];
    expect(opts.model).toBe('custom-model');
  });

  it('passes signal and responseFormat to chat', async () => {
    mockChat.mockResolvedValue({ content: '{}' });
    const ac = new AbortController();

    await executePromptTask(makeTask({ responseFormat: 'json' }), makeOpts({ signal: ac.signal }), {});

    const [, opts] = mockChat.mock.calls[0] as [ChatMessage[], Record<string, unknown>];
    expect(opts.responseFormat).toBe('json');
    expect(opts.signal).toBe(ac.signal);
  });

  it('passes onRetry to chat', async () => {
    mockChat.mockResolvedValue({ content: '{}' });
    const onRetry = vi.fn();

    await executePromptTask(makeTask(), makeOpts({ onRetry }), {});

    const [, opts] = mockChat.mock.calls[0] as [ChatMessage[], Record<string, unknown>];
    expect(opts.onRetry).toBe(onRetry);
  });

  it('passes onToken to chat', async () => {
    mockChat.mockResolvedValue({ content: '{}' });
    const onToken = vi.fn();

    await executePromptTask(makeTask(), makeOpts({ onToken }), {});

    const [, opts] = mockChat.mock.calls[0] as [ChatMessage[], Record<string, unknown>];
    expect(opts.onToken).toBe(onToken);
  });

  it('calls onParseRetry and re-prompts on first parse failure', async () => {
    mockChat
      .mockResolvedValueOnce({ content: 'not json' })
      .mockResolvedValueOnce({ content: '{"name":"B","value":2}' });
    const onParseRetry = vi.fn();

    const result = await executePromptTask(makeTask(), makeOpts({ onParseRetry }), {});

    expect(result).toEqual({ name: 'B', value: 2 });
    expect(mockChat).toHaveBeenCalledTimes(2);
    expect(onParseRetry).toHaveBeenCalledOnce();
    expect(onParseRetry.mock.calls[0][0]).toBe('not json');

    const [secondMessages] = mockChat.mock.calls[1] as [ChatMessage[], Record<string, unknown>];
    const lastMsg = secondMessages[secondMessages.length - 1];
    expect(lastMsg.role).toBe('user');
    expect(lastMsg.content).toContain('could not be parsed');
  });

  it('throws the original parse error after second parse failure', async () => {
    mockChat
      .mockResolvedValueOnce({ content: 'bad1' })
      .mockResolvedValueOnce({ content: 'bad2' });
    const onParseRetry = vi.fn();

    await expect(executePromptTask(makeTask(), makeOpts({ onParseRetry }), {})).rejects.toThrow(SyntaxError);
    expect(mockChat).toHaveBeenCalledTimes(2);
    expect(onParseRetry).toHaveBeenCalledTimes(2);
  });

  it('throws non-parse errors from chat', async () => {
    mockChat.mockRejectedValue(new Error('API error'));

    await expect(executePromptTask(makeTask(), makeOpts(), {})).rejects.toThrow('API error');
  });

  it('propagates AbortError from chat', async () => {
    mockChat.mockRejectedValue(new DOMException('Aborted', 'AbortError'));

    await expect(executePromptTask(makeTask(), makeOpts(), {})).rejects.toThrow(DOMException);
  });

  it('includes context in buildSystem call', async () => {
    const task = makeTask();
    const spy = vi.spyOn(task, 'buildSystem');

    mockChat.mockResolvedValue({ content: '{}' });
    await executePromptTask(task, makeOpts({ context: { url: 'https://example.com' } }), {});

    expect(spy).toHaveBeenCalledWith('student', { url: 'https://example.com' });
  });
});
