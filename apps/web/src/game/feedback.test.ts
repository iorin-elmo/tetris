import { expect, it } from 'vitest';
import { clearLabels } from './feedback';
import type { LockEvent } from '../../../../packages/engine/src/index';

it('keeps spin, clear, B2B, perfect clear and attack visible together', () => {
  const event: LockEvent = {
    type: 'lock',
    piece: 'T',
    lines: 2,
    spin: 'full',
    perfectClear: true,
    ren: 3,
    b2b: true,
    generated: 10,
    attack: 6,
    cancelled: 4,
    inserted: 0,
  };
  expect(clearLabels(event)).toEqual({
    spin: 'T-SPIN',
    clear: 'DOUBLE',
    perfect: true,
    b2b: true,
    attack: 10,
  });
  expect(clearLabels({ ...event, spin: 'mini', lines: 1 }).spin).toBe('T-SPIN MINI');
});
