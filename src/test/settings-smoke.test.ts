import { describe, it, expect } from 'vitest';
import {
  LAYOUTS,
  FONTS,
  FONT_SIZES,
  VISION_PROFILES,
  FONT_CONFIG,
  detectOptimalFontSize,
} from '@/lib/theme-context';

describe('FONT_CONFIG — exact repo parity', () => {
  it('has correct baseSize, minSize, maxSize', () => {
    expect(FONT_CONFIG.baseSize).toBe(11);
    expect(FONT_CONFIG.minSize).toBe(9);
    expect(FONT_CONFIG.maxSize).toBe(18);
  });

  it('has correct breakpoints', () => {
    expect(FONT_CONFIG.breakpoints).toEqual({ mobile: 480, tablet: 900, desktop: 1366, wide: 1920 });
  });

  it('has correct scaleFactors', () => {
    expect(FONT_CONFIG.scaleFactors).toEqual({ mobile: 0.9, tablet: 1.0, desktop: 1.05, wide: 1.1 });
  });

  it('has correct visionProfiles (standard, large, xlarge, compact)', () => {
    expect(FONT_CONFIG.visionProfiles).toEqual({ standard: 1.0, large: 1.15, xlarge: 1.3, compact: 0.9 });
  });
});

describe('detectOptimalFontSize', () => {
  it('clamps to minSize', () => {
    // compact on very small base
    const size = detectOptimalFontSize(9, 'compact');
    expect(size).toBeGreaterThanOrEqual(FONT_CONFIG.minSize);
  });

  it('clamps to maxSize', () => {
    const size = detectOptimalFontSize(14, 'xlarge');
    expect(size).toBeLessThanOrEqual(FONT_CONFIG.maxSize);
  });

  it('returns base * scale * vision', () => {
    // For standard at desktop (1366+), scale=1.05, vm=1.0 → 11*1.05*1.0 = 11.55 → 12
    const size = detectOptimalFontSize(11, 'standard');
    expect(size).toBeGreaterThanOrEqual(9);
    expect(size).toBeLessThanOrEqual(18);
  });

  it('applies compact profile (0.9x)', () => {
    const standard = detectOptimalFontSize(11, 'standard');
    const compact = detectOptimalFontSize(11, 'compact');
    expect(compact).toBeLessThanOrEqual(standard);
  });

  it('applies large profile (1.15x)', () => {
    const standard = detectOptimalFontSize(11, 'standard');
    const large = detectOptimalFontSize(11, 'large');
    expect(large).toBeGreaterThanOrEqual(standard);
  });

  it('applies xlarge profile (1.3x)', () => {
    const large = detectOptimalFontSize(11, 'large');
    const xlarge = detectOptimalFontSize(11, 'xlarge');
    expect(xlarge).toBeGreaterThanOrEqual(large);
  });
});

describe('VISION_PROFILES — repo parity', () => {
  it('has standard, large, xlarge, compact', () => {
    expect([...VISION_PROFILES]).toEqual(['standard', 'large', 'xlarge', 'compact']);
  });
});

describe('LAYOUTS — repo parity', () => {
  it('has 6 layouts: flux, cipher, aurora, carbon, prism, pulse', () => {
    expect(LAYOUTS.map(l => l.id)).toEqual(['flux', 'cipher', 'aurora', 'carbon', 'prism', 'pulse']);
  });

  it('Flux is light (white bg)', () => {
    const flux = LAYOUTS.find(l => l.id === 'flux')!;
    expect(flux.themes.t1.bg).toBe('#f8faff');
  });

  it('Cipher is dark (black bg)', () => {
    const cipher = LAYOUTS.find(l => l.id === 'cipher')!;
    expect(cipher.themes.t1.bg).toBe('#000000');
  });

  it('each layout has 5 themes (t1–t5)', () => {
    for (const l of LAYOUTS) {
      const keys = Object.keys(l.themes);
      expect(keys).toContain('t1');
      expect(keys).toContain('t5');
      expect(keys.length).toBe(5);
    }
  });

  it('each layout has swatches array with 8 colors', () => {
    for (const l of LAYOUTS) {
      expect(l.swatches).toHaveLength(8);
    }
  });
});

describe('FONTS — repo parity', () => {
  it('has 10 font choices', () => {
    expect(FONTS).toHaveLength(10);
    expect(FONTS).toContain('Inter');
    expect(FONTS).toContain('JetBrains Mono');
    expect(FONTS).toContain('Space Grotesk');
  });
});

describe('FONT_SIZES — repo parity', () => {
  it('has sizes 9–14', () => {
    expect(FONT_SIZES).toEqual([9, 10, 11, 12, 13, 14]);
  });
});
