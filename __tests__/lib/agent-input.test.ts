/** @jest-environment node */
import { validateAgentInput } from '@/lib/agent/input';

const input = () => ({
  label: 'Course completion',
  rows: [{ id: 'a', fields: { name: 'Ada Lovelace', email: 'private@example.test' } }],
  positions: { name: { x: 50, y: 42, width: 70, fontSize: 30, alignment: 'center' } },
});

describe('agent input contract', () => {
  it('retains explicit field mapping and ordered recipient strings', () => {
    expect(validateAgentInput(input())).toEqual(input());
  });

  it.each(['\u200d', '\u200c', '\u200b', 'Ada\u00adLovelace', 'Ada\u202eLovelace', '\ufeffAda'])('rejects format characters in printed values rather than silently changing them', name => {
    const value = input();
    value.rows[0].fields.name = name;
    expect(() => validateAgentInput(value)).toThrow(/format characters/i);
  });

  it('preserves visible international names and punctuation', () => {
    const value = input();
    value.rows[0].fields.name = 'Élodie O’Connor-Sørensen';
    expect(validateAgentInput(value).rows[0].fields.name).toBe('Élodie O’Connor-Sørensen');
  });

  it.each([
    [{ x: 90 }, /outside the page/],
    [{ x: NaN }, /Invalid x/],
    [{ fontFamily: 'UninstalledFont' }, /Unsupported font/],
    [{ fontFamily: 'GreatVibes', bold: true }, /Font style is unavailable/],
    [{ color: 'url(https://example.test)' }, /six-digit hex colour/],
    [{ textMode: ['shrink'] }, /Invalid text mode/],
    [{ alignment: ['center'] }, /Invalid alignment/],
  ])('rejects an invalid layout property %j for its own reason', (override, error) => {
    const value = input();
    expect(() => validateAgentInput({
      ...value, positions: { name: { ...value.positions.name, ...override } },
    })).toThrow(error);
  });

  it('requires at least one mapped field', () => {
    expect(() => validateAgentInput({ ...input(), positions: {} })).toThrow('Map 1–20 visible text fields');
  });

  it('rejects reserved field names rather than silently omitting recipient text', () => {
    expect(() => validateAgentInput({
      label: 'Reserved field',
      rows: [{ id: 'row', fields: JSON.parse('{"__proto__":"Ada Lovelace"}') }],
      positions: JSON.parse('{"__proto__":{"x":0,"y":42}}'),
    })).toThrow('Invalid field mapping');
  });

  it('rejects duplicate row IDs, missing mapped fields, objects and oversized batches', () => {
    const value = input();
    expect(() => validateAgentInput({ ...value, rows: [value.rows[0], value.rows[0]] })).toThrow('unique id');
    expect(() => validateAgentInput({ ...value, rows: [{ id: 'b', fields: { other: 'Ada' } }] })).toThrow('Every recipient needs a value for name');
    expect(() => validateAgentInput({ ...value, rows: [{ id: 'b', fields: { name: {} } }] })).toThrow('single-line strings');
    expect(() => validateAgentInput({ ...value, rows: Array.from({ length: 501 }, (_, i) => ({ id: String(i), fields: { name: 'A' } })) })).toThrow('Supply 1–500 recipient rows');
  });
});
