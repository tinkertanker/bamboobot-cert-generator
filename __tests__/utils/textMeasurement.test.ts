type TextMeasurementModule = typeof import('../../utils/textMeasurement');

// Deterministic measurement: width = characters * fontSize * 0.5,
// with fontSize parsed from the ctx.font string the module sets.
function withMockedMeasurement(
  run: (mod: TextMeasurementModule, measureText: jest.Mock) => void
): void {
  const ctx: { font: string; measureText: jest.Mock } = {
    font: '',
    measureText: jest.fn((text: string) => {
      const match = /(\d+(?:\.\d+)?)px/.exec(ctx.font);
      const fontSize = match ? parseFloat(match[1]) : 16;
      return { width: text.length * fontSize * 0.5 };
    })
  };
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: { addEventListener: jest.fn() }
  });
  const spy = jest
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  try {
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      run(require('../../utils/textMeasurement'), ctx.measureText);
    });
  } finally {
    spy.mockRestore();
  }
}

describe('splitTextIntoLines', () => {
  // With fontSize 10 each character measures 5px wide.
  it('wraps words that would exceed maxWidth onto new lines', () => {
    withMockedMeasurement(({ splitTextIntoLines }) => {
      expect(splitTextIntoLines('hello world foo', 40, 10, 3)).toEqual([
        'hello',
        'world',
        'foo'
      ]);
    });
  });

  it('keeps a single over-long word on one line even though it exceeds maxWidth', () => {
    withMockedMeasurement(({ splitTextIntoLines }) => {
      // 20 chars * 5px = 100px > 40px, but there is no word boundary to break at
      expect(splitTextIntoLines('Supercalifragilistic', 40, 10)).toEqual([
        'Supercalifragilistic'
      ]);
    });
  });

  it('truncates the last line with an ellipsis when maxLines is exceeded', () => {
    withMockedMeasurement(({ splitTextIntoLines }) => {
      expect(splitTextIntoLines('alpha beta gamma delta', 45, 10, 2)).toEqual([
        'alpha',
        'beta...'
      ]);
    });
  });

  it('returns an empty array for empty text or non-positive maxLines', () => {
    withMockedMeasurement(({ splitTextIntoLines }) => {
      expect(splitTextIntoLines('', 100, 10)).toEqual([]);
      expect(splitTextIntoLines('hello world', 100, 10, 0)).toEqual([]);
      expect(splitTextIntoLines('hello world', 100, 10, -1)).toEqual([]);
    });
  });

  it('preserves consecutive spaces when the text fits on one line', () => {
    withMockedMeasurement(({ splitTextIntoLines }) => {
      expect(splitTextIntoLines('a  b', 1000, 10)).toEqual(['a  b']);
    });
  });
});

describe('calculateShrinkToFitFontSize', () => {
  it('returns the base size when the text already fits', () => {
    withMockedMeasurement(({ calculateShrinkToFitFontSize }) => {
      // 'hi' at 24px measures 24px <= 100px
      expect(calculateShrinkToFitFontSize('hi', 100, 24)).toBe(24);
    });
  });

  it('shrinks the font until the text fits within maxWidth', () => {
    withMockedMeasurement(({ calculateShrinkToFitFontSize }) => {
      // 10 chars: width = 5 * fontSize, so it fits at fontSize <= 10
      const result = calculateShrinkToFitFontSize('abcdefghij', 50, 20, 8);

      expect(result).toBeLessThan(20);
      expect(result).toBeGreaterThanOrEqual(8);
      expect(result * 5).toBeLessThanOrEqual(50);
    });
  });

  it('never returns less than minFontSize even when the text cannot fit', () => {
    withMockedMeasurement(({ calculateShrinkToFitFontSize }) => {
      const result = calculateShrinkToFitFontSize('x'.repeat(100), 10, 20, 8);

      expect(result).toBe(8);
    });
  });
});

describe('text measurement cache eviction', () => {
  it('evicts the least recently used entry once the cache exceeds 2000 entries', () => {
    withMockedMeasurement(({ measureTextWidth }, measureText) => {
      for (let i = 0; i < 2000; i++) {
        measureTextWidth(`entry-${i}`, 10);
      }
      expect(measureText).toHaveBeenCalledTimes(2000);

      // Touch entry-0 so entry-1 becomes the oldest
      measureTextWidth('entry-0', 10);
      expect(measureText).toHaveBeenCalledTimes(2000);

      // 2001st distinct entry evicts entry-1
      measureTextWidth('entry-2000', 10);
      expect(measureText).toHaveBeenCalledTimes(2001);

      measureTextWidth('entry-0', 10);
      expect(measureText).toHaveBeenCalledTimes(2001);

      measureTextWidth('entry-1', 10);
      expect(measureText).toHaveBeenCalledTimes(2002);
    });
  });
});

describe('text measurement cache', () => {
  it('reuses widths for identical text and font settings', () => {
    const measureText = jest
      .fn()
      .mockReturnValueOnce({ width: 123 })
      .mockReturnValueOnce({ width: 456 });
    let handleFontsLoaded: (() => void) | undefined;
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: {
        addEventListener: jest.fn(
          (event: string, handler: () => void) => {
            if (event === 'loadingdone') handleFontsLoaded = handler;
          }
        )
      }
    });
    jest
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue({ measureText } as unknown as CanvasRenderingContext2D);

    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { measureTextWidth } = require('../../utils/textMeasurement');

      expect(measureTextWidth('Certificate', 20, 'Helvetica')).toBe(123);
      expect(measureTextWidth('Certificate', 20, 'Helvetica')).toBe(123);
      expect(measureText).toHaveBeenCalledTimes(1);

      handleFontsLoaded?.();
      expect(measureTextWidth('Certificate', 20, 'Helvetica')).toBe(456);
      expect(measureText).toHaveBeenCalledTimes(2);
    });
  });
});
