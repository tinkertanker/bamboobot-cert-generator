import {
  applyAutomaticTextColor,
  calculateAverageLuminance,
  getImageAverageLuminance,
  getReadableTextColorForLuminance,
  normalizeAutomaticTextColorProvenance
} from '../../utils/imageAnalysis';
import type { Positions } from '../../types/certificate';

const createPositions = (colors: Record<string, string | undefined>): Positions =>
  Object.fromEntries(
    Object.entries(colors).map(([key, color], index) => [
      key,
      {
        x: 50,
        y: 50 + index * 10,
        color,
        isColorAutomatic: true
      }
    ])
  );

describe('applyAutomaticTextColor', () => {
  it('preserves object identity when the automatic colour is already applied', () => {
    const positions = createPositions({ Name: '#000000', Course: '#000000' });

    const result = applyAutomaticTextColor(
      positions,
      ['Name', 'Course'],
      '#000000'
    );

    expect(result).toBe(positions);
  });

  it('updates default colours while preserving unrelated position properties', () => {
    const positions = createPositions({ Name: '#000000', Course: '#ffffff' });

    const result = applyAutomaticTextColor(
      positions,
      ['Name', 'Course'],
      '#ffffff'
    );

    expect(result).not.toBe(positions);
    expect(result.Name).toEqual({ ...positions.Name, color: '#ffffff' });
    expect(result.Course).toBe(positions.Course);
  });

  it('does not overwrite any fields when a custom colour is present', () => {
    const positions = createPositions({ Name: '#123456', Course: '#000000' });

    const result = applyAutomaticTextColor(
      positions,
      ['Name', 'Course'],
      '#ffffff'
    );

    expect(result).toBe(positions);
  });

  it('does not overwrite an explicit black or white selection', () => {
    const positions = createPositions({ Name: '#000000', Course: '#000000' });
    positions.Name = { ...positions.Name, isColorAutomatic: false };

    const result = applyAutomaticTextColor(
      positions,
      ['Name', 'Course'],
      '#ffffff'
    );

    expect(result).toBe(positions);
  });

  it('ignores custom colours retained for removed columns', () => {
    const positions = createPositions({
      Name: '#000000',
      RemovedColumn: '#123456'
    });

    const result = applyAutomaticTextColor(
      positions,
      ['Name'],
      '#ffffff'
    );

    expect(result.Name.color).toBe('#ffffff');
    expect(result.RemovedColumn).toBe(positions.RemovedColumn);
  });

  it('applies an explicit default once to fields without a colour', () => {
    const positions = createPositions({ Name: undefined });
    const firstResult = applyAutomaticTextColor(positions, ['Name'], '#000000');
    const secondResult = applyAutomaticTextColor(firstResult, ['Name'], '#000000');

    expect(firstResult.Name.color).toBe('#000000');
    expect(secondResult).toBe(firstResult);
  });

  it('skips columns without a corresponding position', () => {
    const positions = createPositions({ Name: '#000000' });

    const result = applyAutomaticTextColor(
      positions,
      ['Missing'],
      '#ffffff'
    );

    expect(result).toBe(positions);
  });

  it('normalises colour case before comparing automatic colours', () => {
    const positions = createPositions({ Name: '#FFFFFF' });

    const result = applyAutomaticTextColor(positions, ['Name'], '#ffffff');

    expect(result).toBe(positions);
  });
});

describe('image luminance', () => {
  it('composites transparent pixels over white', () => {
    const pixels = new Uint8ClampedArray([
      0, 0, 0, 255,
      0, 0, 0, 0
    ]);

    expect(calculateAverageLuminance(pixels)).toBeCloseTo(127.5);
  });

  it('returns null when there are no pixels or no image URL', async () => {
    expect(calculateAverageLuminance(new Uint8ClampedArray())).toBeNull();
    await expect(getImageAverageLuminance('')).resolves.toBeNull();
  });

  it('uses 128 as the light-background threshold', () => {
    expect(getReadableTextColorForLuminance(127.99)).toBe('#ffffff');
    expect(getReadableTextColorForLuminance(128)).toBe('#000000');
  });
});

describe('normalizeAutomaticTextColorProvenance', () => {
  it('marks legacy default colours as automatic', () => {
    const positions = createPositions({ Name: '#000000', Course: '#ffffff' });
    delete positions.Name.isColorAutomatic;
    delete positions.Course.isColorAutomatic;

    const result = normalizeAutomaticTextColorProvenance(
      positions,
      ['Name', 'Course']
    );

    expect(result).not.toBe(positions);
    expect(result.Name.isColorAutomatic).toBe(true);
    expect(result.Course.isColorAutomatic).toBe(true);
  });

  it('marks legacy colours as manual when any current colour is custom', () => {
    const positions = createPositions({ Name: '#123456', Course: '#000000' });
    delete positions.Name.isColorAutomatic;
    delete positions.Course.isColorAutomatic;

    const result = normalizeAutomaticTextColorProvenance(
      positions,
      ['Name', 'Course']
    );

    expect(result.Name.isColorAutomatic).toBe(false);
    expect(result.Course.isColorAutomatic).toBe(false);
  });

  it('preserves identity when provenance is already present', () => {
    const positions = createPositions({ Name: '#000000' });

    const result = normalizeAutomaticTextColorProvenance(positions, ['Name']);

    expect(result).toBe(positions);
  });

  it('normalizes retained legacy fields before they are reintroduced', () => {
    const positions = createPositions({
      Name: '#000000',
      RemovedDefault: '#ffffff',
      RemovedCustom: '#123456'
    });
    Object.values(positions).forEach((position) => {
      delete position.isColorAutomatic;
    });

    const normalized = normalizeAutomaticTextColorProvenance(
      positions,
      ['Name']
    );

    expect(normalized.RemovedDefault.isColorAutomatic).toBe(true);
    expect(normalized.RemovedCustom.isColorAutomatic).toBe(false);

    const reintroducedDefaults = {
      Name: normalized.Name,
      RemovedDefault: normalized.RemovedDefault
    };
    const adjusted = applyAutomaticTextColor(
      reintroducedDefaults,
      ['Name', 'RemovedDefault'],
      '#ffffff'
    );
    expect(adjusted.Name.color).toBe('#ffffff');
    expect(adjusted.RemovedDefault.color).toBe('#ffffff');
  });
});
