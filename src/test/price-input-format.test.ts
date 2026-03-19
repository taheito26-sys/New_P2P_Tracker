import { describe, expect, it } from 'vitest';
import { formatPriceInputDisplay } from '@/lib/tracker-helpers';

describe('formatPriceInputDisplay', () => {
  it('handles the requested edge cases', () => {
    expect(formatPriceInputDisplay('3')).toEqual({
      display: '3',
      summary: 'Whole number kept without trailing zeros.',
    });
    expect(formatPriceInputDisplay('3.')).toEqual({
      display: '3.',
      summary: 'Trailing decimal point preserved while editing.',
    });
    expect(formatPriceInputDisplay('3.0')).toEqual({
      display: '3.0',
      summary: 'Up to 4 decimal places kept exactly as entered.',
    });
    expect(formatPriceInputDisplay('3.0000')).toEqual({
      display: '3.0000',
      summary: 'Up to 4 decimal places kept exactly as entered.',
    });
    expect(formatPriceInputDisplay('3.12345')).toEqual({
      display: '3.1235',
      summary: 'More than 4 decimal places rounded for display; original value can still be stored separately.',
    });
    expect(formatPriceInputDisplay('0.1234')).toEqual({
      display: '0.1234',
      summary: 'Up to 4 decimal places kept exactly as entered.',
    });
    expect(formatPriceInputDisplay('10.9999')).toEqual({
      display: '10.9999',
      summary: 'Up to 4 decimal places kept exactly as entered.',
    });
    expect(formatPriceInputDisplay('2.1')).toEqual({
      display: '2.1',
      summary: 'Up to 4 decimal places kept exactly as entered.',
    });
  });
});
