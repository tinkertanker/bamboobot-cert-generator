import {
  isValidEmail,
  parseRecipients,
  parseRecipientsDetailed,
} from '@/utils/email-validation';

describe('email validation and recipient parsing', () => {
  describe('CRLF header-injection resistance', () => {
    it('rejects an address followed by an injected Bcc header', () => {
      const { valid, rejected } = parseRecipientsDetailed('ok@x.com\r\nBcc: evil@y.com');
      expect(valid).toEqual([]);
      expect(rejected).toEqual(['ok@x.com\r\nBcc: evil@y.com']);
    });

    it('never yields an accepted address containing \\r or \\n', () => {
      const attacks = [
        'ok@x.com\r\nBcc: evil@y.com',
        'a@b.com\nc@d.com',
        'ok@x.com,\r\nBcc:evil@y.com',
        'ok@x.com\r,evil@y.com',
      ];
      for (const attack of attacks) {
        for (const address of parseRecipients(attack)) {
          expect(address).not.toMatch(/[\r\n]/);
        }
      }
    });

    it('keeps only the clean address when an injection rides in on a separator', () => {
      // The token after the comma trims to "Bcc:evil@y.com", which fails validation.
      expect(parseRecipients('ok@x.com,\r\nBcc:evil@y.com')).toEqual(['ok@x.com']);
    });

    it('isValidEmail rejects embedded newlines (no multiline regex bypass)', () => {
      expect(isValidEmail('a@b.com\nc@d.com')).toBe(false);
      expect(isValidEmail('a@b.com\nBcc: evil@y.com')).toBe(false);
    });

    it('trims a purely trailing newline so the accepted address is clean', () => {
      // Trailing CR/LF is whitespace and gets trimmed before validation; the
      // address that comes out of parsing must not carry the newline along.
      expect(isValidEmail('a@b.com\n')).toBe(true);
      expect(parseRecipients('a@b.com\r\n')).toEqual(['a@b.com']);
    });
  });

  describe('parseRecipientsDetailed', () => {
    it('deduplicates case-variant addresses to one normalised recipient', () => {
      const { valid, rejected } = parseRecipientsDetailed('A@B.com, a@b.com, A@b.COM');
      expect(valid).toEqual(['a@b.com']);
      expect(rejected).toEqual([]);
    });

    it('returns malformed tokens verbatim in the rejected list', () => {
      const { valid, rejected } = parseRecipientsDetailed(
        'good@x.com, not-an-email, @nodomain.com, missing-at.com'
      );
      expect(valid).toEqual(['good@x.com']);
      expect(rejected).toEqual(['not-an-email', '@nodomain.com', 'missing-at.com']);
    });

    it('rejects consecutive dots in the local part', () => {
      const { valid, rejected } = parseRecipientsDetailed('a..b@x.com');
      expect(valid).toEqual([]);
      expect(rejected).toEqual(['a..b@x.com']);
    });

    it('accepts an address of exactly 254 characters and rejects 255', () => {
      const domain = '@example.com'; // 12 chars
      const at254 = 'a'.repeat(254 - domain.length) + domain;
      const at255 = 'a'.repeat(255 - domain.length) + domain;
      expect(at254).toHaveLength(254);
      expect(at255).toHaveLength(255);

      expect(parseRecipientsDetailed(at254)).toEqual({ valid: [at254], rejected: [] });
      expect(parseRecipientsDetailed(at255)).toEqual({ valid: [], rejected: [at255] });
    });

    it.each([
      ['empty string', ''],
      ['whitespace only', '   \t  '],
    ])('returns empty results for %s', (_label, input) => {
      expect(parseRecipientsDetailed(input)).toEqual({ valid: [], rejected: [] });
    });

    it('rejects a trailing-dot domain', () => {
      const { valid, rejected } = parseRecipientsDetailed('a@b.com.');
      expect(valid).toEqual([]);
      expect(rejected).toEqual(['a@b.com.']);
    });

    it('splits semicolon-separated recipients like comma-separated ones', () => {
      expect(parseRecipientsDetailed('a@b.com; c@d.com')).toEqual({
        valid: ['a@b.com', 'c@d.com'],
        rejected: [],
      });
    });

    it('handles mixed and repeated separators without producing empty tokens', () => {
      expect(parseRecipientsDetailed('a@b.com;;c@d.com, ;e@f.com')).toEqual({
        valid: ['a@b.com', 'c@d.com', 'e@f.com'],
        rejected: [],
      });
    });
  });
});
