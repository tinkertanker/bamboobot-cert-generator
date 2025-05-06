import { cn } from '../../lib/utils';

describe('Utils - cn function', () => {
  it('should merge class names correctly', () => {
    const result = cn('class1', 'class2');
    expect(result).toBe('class1 class2');
  });

  it('should handle conditional classes', () => {
    const condition = true;
    const result = cn('base-class', condition && 'conditional-class');
    expect(result).toBe('base-class conditional-class');
  });

  it('should filter out falsy values', () => {
    const result = cn('base-class', false && 'not-included', null, undefined, 0, '', 'included');
    expect(result).toBe('base-class included');
  });

  it('should handle object syntax from clsx', () => {
    const result = cn('base-class', { 'conditional-class': true, 'not-included': false });
    expect(result).toBe('base-class conditional-class');
  });

  it('should handle Tailwind class conflicts using tailwind-merge', () => {
    // The cn function should use tailwind-merge to handle class conflicts
    // For example, if there are conflicting padding classes, the last one should win
    const result = cn('p-2', 'p-4');
    // We expect p-4 to win because tailwind-merge should resolve the conflict
    expect(result).toBe('p-4');
  });

  it('should handle complex tailwind combinations', () => {
    const result = cn(
      'text-white bg-black p-2',
      'sm:text-sm md:text-base',
      { 'lg:text-lg': true, 'xl:text-xl': false }
    );
    
    // The result should merge all valid classes
    expect(result).toBe('text-white bg-black p-2 sm:text-sm md:text-base lg:text-lg');
  });
});