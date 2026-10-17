import { plainToInstance } from 'class-transformer';

import { sanitizeText, SanitizeText } from './sanitize-text.decorator';

class Review {
  @SanitizeText()
  text: unknown;
}

describe('sanitizeText', () => {
  it('strips tags and keeps their text', () => {
    expect(sanitizeText('<b>bold</b> and <a href="javascript:alert(1)">link</a>')).toBe(
      'bold and link',
    );
  });

  it('drops script and style content entirely', () => {
    expect(sanitizeText('hi<script>alert(1)</script><style>p{}</style>')).toBe('hi');
  });

  it('removes event-handler attributes with the tag', () => {
    expect(sanitizeText('<img src=x onerror=alert(1)>ok')).toBe('ok');
  });

  it('leaves plain text, including ampersands, untouched', () => {
    expect(sanitizeText('Tom & Jerry — 5 > 3')).toContain('Tom & Jerry');
  });

  it.each(['a < b', '&lt;script&gt;alert(1)&lt;/script&gt;', '<<script>script>alert(1)'])(
    'never leaves a raw angle bracket for %p',
    (input) => {
      expect(sanitizeText(input)).not.toMatch(/[<>]/);
    },
  );
});

describe('@SanitizeText', () => {
  it('sanitizes strings during transformation', () => {
    const review = plainToInstance(Review, { text: '<i>great</i>' });

    expect(review.text).toBe('great');
  });

  it('passes non-strings through for the validators to reject', () => {
    expect(plainToInstance(Review, { text: 42 }).text).toBe(42);
    expect(plainToInstance(Review, { text: ['<b>x</b>'] }).text).toEqual(['<b>x</b>']);
  });
});
