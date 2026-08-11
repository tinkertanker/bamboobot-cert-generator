import {
  EmailRequestError,
  MAX_RECIPIENTS_PER_MESSAGE,
  assertRecipientCount,
  requireBoundedEmailText,
  requireSafeEmailHeader,
} from '@/lib/email/abuse-controls';

function expectEmailRequestError(fn: () => unknown): EmailRequestError {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(EmailRequestError);
    return error as EmailRequestError;
  }
  throw new Error('expected the call to throw an EmailRequestError');
}

describe('email abuse controls', () => {
  describe('requireSafeEmailHeader', () => {
    it.each([
      ['carriage return', 'Weekly Update\rBcc: evil@attacker.example'],
      ['line feed', 'Weekly Update\nBcc: evil@attacker.example'],
      ['CRLF pair', 'Weekly Update\r\nBcc: evil@attacker.example'],
      ['null byte', 'Weekly Update\0'],
    ])('rejects %s in any header field', (_label, value) => {
      expect(() => requireSafeEmailHeader(value, 'subject')).toThrow(EmailRequestError);
      expect(() => requireSafeEmailHeader(value, 'senderName')).toThrow(EmailRequestError);
    });

    it('reports a 400 statusCode and names the offending field', () => {
      const error = expectEmailRequestError(() => requireSafeEmailHeader('a\r\nb', 'subject'));
      expect(error.statusCode).toBe(400);
      expect(error.message).toContain('subject');
    });

    it.each(['<', '>', ',', ';', ':', '@', '"', '\\'])(
      'rejects mailbox delimiter %s in senderName so the display name cannot smuggle another mailbox',
      (delimiter) => {
        expect(() => requireSafeEmailHeader(`Certs ${delimiter} Team`, 'senderName')).toThrow(
          EmailRequestError
        );
      }
    );

    it('blocks a forged senderName mailbox like "Boss <boss@corp.example>"', () => {
      expect(() => requireSafeEmailHeader('Boss <boss@corp.example>', 'senderName')).toThrow(
        'senderName contains invalid characters'
      );
    });

    it('allows the mailbox delimiter set in non-senderName fields such as subject', () => {
      const subject = 'Results: 10 < 20, reply to admin@corp.example; thanks "team"';
      expect(requireSafeEmailHeader(subject, 'subject')).toBe(subject);
    });

    it('returns normal values unchanged', () => {
      expect(requireSafeEmailHeader('Certificate of Completion', 'subject')).toBe(
        'Certificate of Completion'
      );
      expect(requireSafeEmailHeader("Anne-Marie O'Neil (Events)", 'senderName')).toBe(
        "Anne-Marie O'Neil (Events)"
      );
    });

    it('does not reject a horizontal tab (single-line whitespace cannot start a new header)', () => {
      // Freeze the current contract: only \r, \n and \0 are line/terminator
      // threats; \t stays on the same header line and passes through.
      expect(requireSafeEmailHeader('Weekly\tUpdate', 'subject')).toBe('Weekly\tUpdate');
      expect(requireSafeEmailHeader('Weekly\tUpdate', 'senderName')).toBe('Weekly\tUpdate');
    });
  });

  describe('requireBoundedEmailText', () => {
    it.each([
      ['undefined', undefined],
      ['null', null],
      ['number', 42],
      ['array', ['a@b.com']],
      ['object', { toString: () => 'sneaky' }],
    ])('throws a 400 "required" error for non-string input (%s)', (_label, value) => {
      const error = expectEmailRequestError(() =>
        requireBoundedEmailText(value, 'subject', 200)
      );
      expect(error.statusCode).toBe(400);
      expect(error.message).toBe('subject is required');
    });

    it.each([
      ['empty string', ''],
      ['whitespace only', '   \t \r\n '],
    ])('throws for %s', (_label, value) => {
      expect(() => requireBoundedEmailText(value, 'message', 100)).toThrow(
        'message is required'
      );
    });

    it('accepts a value of exactly maxLength and returns it', () => {
      const value = 'a'.repeat(50);
      expect(requireBoundedEmailText(value, 'subject', 50)).toBe(value);
    });

    it('throws a 413 error at maxLength + 1', () => {
      const error = expectEmailRequestError(() =>
        requireBoundedEmailText('a'.repeat(51), 'subject', 50)
      );
      expect(error.statusCode).toBe(413);
      expect(error.message).toBe('subject is too long');
    });

    it('returns the trimmed value', () => {
      expect(requireBoundedEmailText('  hello world  ', 'message', 100)).toBe('hello world');
    });

    it('measures length after trimming, so surrounding whitespace does not count', () => {
      const padded = `  ${'a'.repeat(50)}  `;
      expect(requireBoundedEmailText(padded, 'subject', 50)).toBe('a'.repeat(50));
    });
  });

  describe('assertRecipientCount', () => {
    it('allows exactly the maximum', () => {
      expect(() =>
        assertRecipientCount(MAX_RECIPIENTS_PER_MESSAGE, MAX_RECIPIENTS_PER_MESSAGE)
      ).not.toThrow();
    });

    it('throws a 413 error at maximum + 1', () => {
      const error = expectEmailRequestError(() =>
        assertRecipientCount(MAX_RECIPIENTS_PER_MESSAGE + 1, MAX_RECIPIENTS_PER_MESSAGE)
      );
      expect(error.statusCode).toBe(413);
      expect(error.message).toBe(
        `Too many email recipients; maximum is ${MAX_RECIPIENTS_PER_MESSAGE}`
      );
    });
  });
});
