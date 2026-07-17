import {
  uiToPdfY,
  uiToPdfCoordinates,
  calculateTextBoxBounds,
  calculateTextXPosition,
  calculateMultilineY,
  scaleFontSize,
  getTextVerticalAdjustment
} from '@/lib/pdf/shared/coordinate-transform';

describe('uiToPdfY', () => {
  it('flips the origin from top-left to bottom-left', () => {
    expect(uiToPdfY(0, 842)).toBe(842);
    expect(uiToPdfY(1, 842)).toBe(0);
    expect(uiToPdfY(0.5, 842)).toBe(421);
  });
});

describe('uiToPdfCoordinates', () => {
  it('scales x by width and flips y against height', () => {
    const result = uiToPdfCoordinates(
      { x: 0.25, y: 0.75 },
      { width: 600, height: 800 }
    );

    expect(result.x).toBe(150);
    expect(result.y).toBe(200);
  });

  it('maps the UI top-left corner to the PDF top-left corner', () => {
    expect(uiToPdfCoordinates({ x: 0, y: 0 }, { width: 600, height: 800 })).toEqual({
      x: 0,
      y: 800
    });
  });
});

describe('calculateTextBoxBounds', () => {
  it('extends right of xPos for left alignment', () => {
    expect(calculateTextBoxBounds(100, 'left', 50)).toEqual({
      left: 100,
      right: 150
    });
  });

  it('straddles xPos for center alignment', () => {
    expect(calculateTextBoxBounds(100, 'center', 50)).toEqual({
      left: 75,
      right: 125
    });
  });

  it('extends left of xPos for right alignment', () => {
    expect(calculateTextBoxBounds(100, 'right', 50)).toEqual({
      left: 50,
      right: 100
    });
  });
});

describe('calculateTextXPosition', () => {
  const bounds = { left: 100, right: 200 };

  it('anchors left-aligned text at the left edge', () => {
    expect(calculateTextXPosition(40, bounds, 'left')).toBe(100);
  });

  it('centers text within the box', () => {
    expect(calculateTextXPosition(40, bounds, 'center')).toBe(130);
  });

  it('anchors right-aligned text so it ends at the right edge', () => {
    expect(calculateTextXPosition(40, bounds, 'right')).toBe(160);
  });

  it('lets overflowing centered text spill equally past both edges', () => {
    expect(calculateTextXPosition(120, bounds, 'center')).toBe(90);
  });
});

describe('calculateMultilineY', () => {
  it('returns baseY unchanged for a single line', () => {
    expect(calculateMultilineY(300, 0, 14, 1, 12)).toBe(300);
  });

  it('centers multiple lines symmetrically around baseY', () => {
    const baseY = 100;
    const lineHeight = 12;
    const first = calculateMultilineY(baseY, 0, lineHeight, 3, 10);
    const middle = calculateMultilineY(baseY, 1, lineHeight, 3, 10);
    const last = calculateMultilineY(baseY, 2, lineHeight, 3, 10);

    expect(middle).toBe(baseY);
    expect(first - baseY).toBe(baseY - last);
    expect(first - middle).toBe(lineHeight);
    expect(middle - last).toBe(lineHeight);
  });
});

describe('scaleFontSize', () => {
  it('scales font size by the pdf/ui width ratio', () => {
    expect(scaleFontSize(16, 800, 400)).toBe(8);
    expect(scaleFontSize(16, 400, 800)).toBe(32);
  });

  it('scales proportionally with pdf width', () => {
    const single = scaleFontSize(12, 600, 300);
    const doubled = scaleFontSize(12, 600, 600);

    expect(doubled).toBe(single * 2);
  });

  it('returns the base size unscaled when the container width is not a positive finite number', () => {
    expect(scaleFontSize(16, 0, 400)).toBe(16);
    expect(scaleFontSize(16, NaN, 400)).toBe(16);
    expect(scaleFontSize(16, -800, 400)).toBe(16);
    expect(scaleFontSize(16, Infinity, 400)).toBe(16);
  });
});

describe('getTextVerticalAdjustment', () => {
  it('returns 36% of the font size', () => {
    expect(getTextVerticalAdjustment(100)).toBe(36);
    expect(getTextVerticalAdjustment(0)).toBe(0);
  });
});
