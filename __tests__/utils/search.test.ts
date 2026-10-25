import {
  parseSearchQuery,
  findColumn,
  formatColumnToken,
  getLastToken
} from '@/utils/search';

const columns = ['First Name', 'Last Name', 'Email', 'Course_Code'];

describe('SmartSearchBar query parsing', () => {
  it('parses quoted column names that contain spaces', () => {
    expect(parseSearchQuery('"first name":john', columns)).toEqual([
      { column: 'first name', value: 'john' }
    ]);
  });

  it('parses unquoted known column names that contain spaces', () => {
    expect(parseSearchQuery('First Name:john last name:"van der berg"', columns)).toEqual([
      { column: 'first name', value: 'john' },
      { column: 'last name', value: 'van der berg' }
    ]);
  });

  it('keeps plain column:value and free-text terms working', () => {
    expect(parseSearchQuery('email:@example.com alice "two words"', columns)).toEqual([
      { column: 'email', value: '@example.com' },
      { value: 'alice' },
      { value: 'two words' }
    ]);
  });

  it('matches columns ignoring case, spaces and underscores', () => {
    expect(findColumn(columns, 'first name')).toBe('First Name');
    expect(findColumn(columns, 'firstname')).toBe('First Name');
    expect(findColumn(columns, 'first_name')).toBe('First Name');
    expect(findColumn(columns, 'coursecode')).toBe('Course_Code');
    expect(findColumn(columns, 'phone')).toBeUndefined();
  });

  it('quotes column tokens only when needed', () => {
    expect(formatColumnToken('First Name')).toBe('"first name"');
    expect(formatColumnToken('Email')).toBe('email');
  });

  it('finds the token being typed, including quoted columns', () => {
    expect(getLastToken('alice "first name":jo')).toBe('"first name":jo');
    expect(getLastToken('alice ema')).toBe('ema');
    expect(getLastToken('alice ')).toBe('');
  });
});
