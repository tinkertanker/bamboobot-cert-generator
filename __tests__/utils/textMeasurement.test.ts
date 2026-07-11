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
