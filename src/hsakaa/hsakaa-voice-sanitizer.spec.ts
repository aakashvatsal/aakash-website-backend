import { sanitizeAakashRenderedText } from './hsakaa-voice.service';

describe('sanitizeAakashRenderedText', () => {
  it('removes em dashes from generated text', () => {
    expect(sanitizeAakashRenderedText('I liked it—just not enough.')).toBe(
      'I liked it - just not enough.',
    );
  });

  it.each(['&mdash;', '&#8212;', '&#x2014;'])(
    'removes encoded em dash form %s',
    (dash) => {
      expect(sanitizeAakashRenderedText(`Hmmm${dash}maybe.`)).toBe(
        'Hmmm - maybe.',
      );
    },
  );

  it('leaves normal punctuation alone', () => {
    expect(sanitizeAakashRenderedText('Okie, that makes sense.')).toBe(
      'Okie, that makes sense.',
    );
  });
});
