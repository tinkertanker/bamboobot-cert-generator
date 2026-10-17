import { cn } from '../../lib/utils';

// cn is clsx + tailwind-merge; only check that both are wired in, not the
// libraries' own behaviour.
describe('Utils - cn function', () => {
  it('accepts clsx-style conditional inputs', () => {
    const result = cn('base-class', false && 'not-included', { 'conditional-class': true, 'not-included': false });
    expect(result).toBe('base-class conditional-class');
  });

  it('resolves Tailwind class conflicts using tailwind-merge', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });
});
