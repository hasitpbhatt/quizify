import { describe, it, expect, vi } from 'vitest';
import { exportSessionJson } from '@/lib/export/json';
import type { Session } from '@/shared/types';

describe('exportSessionJson', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:mock'), revokeObjectURL: vi.fn() });
    document.body.innerHTML = '';
  });

  it('produces valid JSON blob and triggers download', () => {
    const session: Session = {
      id: 's1',
      name: 'Test',
      url: 'https://example.com',
      hostname: 'example.com',
      persona: 'student',
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
      nodes: [],
      edges: [],
      scores: {},
    };

    exportSessionJson(session);

    expect(document.body.querySelector('a')).not.toBeNull();
    const a = document.body.querySelector('a')!;
    expect(a.download).toContain('.json');
  });

  it('includes all session fields in the JSON blob', () => {
    const spy = vi.spyOn(URL, 'createObjectURL');
    const session: Session = {
      id: 's1',
      name: 'Full Session',
      url: 'https://example.com',
      hostname: 'example.com',
      persona: 'expert',
      createdAt: 1700000000000,
      updatedAt: 1700000000001,
      nodes: [],
      edges: [],
      scores: { concept1: { best: 80, attempts: 1 } },
    };

    exportSessionJson(session);

    const blobArg = spy.mock.calls[0][0] as Blob;
    const reader = new FileReader();
    return new Promise<void>((resolve) => {
      reader.onload = () => {
        const parsed = JSON.parse(reader.result as string);
        expect(parsed.id).toBe('s1');
        expect(parsed.name).toBe('Full Session');
        expect(parsed.scores).toEqual({ concept1: { best: 80, attempts: 1 } });
        resolve();
      };
      reader.readAsText(blobArg);
    });
  });
});
