import { describe, it, expect } from 'vitest';
import { EXAMPLE_CHIPS } from '@/features/welcome/useWelcomeState';

describe('EXAMPLE_CHIPS', () => {
  it('has 3 example chips', () => {
    expect(EXAMPLE_CHIPS).toHaveLength(3);
  });

  it('has Wikipedia photosynthesis chip', () => {
    const chip = EXAMPLE_CHIPS.find(c => c.label.includes('Photosynthesis'));
    expect(chip).toBeDefined();
    expect(chip?.url).toContain('wikipedia.org');
  });

  it('has MDN async/await chip', () => {
    const chip = EXAMPLE_CHIPS.find(c => c.label.includes('async'));
    expect(chip).toBeDefined();
    expect(chip?.url).toContain('developer.mozilla.org');
  });

  it('has agentic AI chip with non-URL topic', () => {
    const chip = EXAMPLE_CHIPS.find(c => c.label.includes('agentic'));
    expect(chip).toBeDefined();
    expect(chip?.url).toBe('agentic AI');
  });

  it('has label and url on every chip', () => {
    for (const chip of EXAMPLE_CHIPS) {
      expect(chip.label).toBeTruthy();
      expect(chip.url).toBeTruthy();
    }
  });
});
