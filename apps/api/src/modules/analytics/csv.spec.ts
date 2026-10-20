import { csvField, csvLine, toCsv } from './csv';

describe('csvField', () => {
  it('writes plain text and numbers as they are', () => {
    expect(csvField('Tech Hub')).toBe('Tech Hub');
    expect(csvField(1_250)).toBe('1250');
    expect(csvField(-300)).toBe('-300');
  });

  it('quotes text with a comma, a quote or a line break, doubling the quotes', () => {
    expect(csvField('Home, Garden')).toBe('"Home, Garden"');
    expect(csvField('The "best" lamp')).toBe('"The ""best"" lamp"');
    expect(csvField('two\nlines')).toBe('"two\nlines"');
  });

  it.each(['=SUM(A1:A9)', '+1', '-2+3', '@cmd', '\tx', '\rx'])(
    'defuses text a spreadsheet would run as a formula: %j',
    (text) => {
      const field = csvField(text);

      expect(field.replace(/^"/, '').startsWith("'")).toBe(true);
    },
  );

  it('defuses a formula that also needs quoting', () => {
    expect(csvField('=HYPERLINK("http://x","y")')).toBe('"\'=HYPERLINK(""http://x"",""y"")"');
  });

  it('leaves a number that is negative alone, but not text that looks like one', () => {
    expect(csvField(-5)).toBe('-5');
    expect(csvField('-5')).toBe("'-5");
  });
});

describe('toCsv', () => {
  it('joins fields with commas and ends every line with CRLF', () => {
    expect(csvLine(['a', 1, 'b,c'])).toBe('a,1,"b,c"');
    expect(
      toCsv([
        ['a', 'b'],
        ['c', 2],
      ]),
    ).toBe('a,b\r\nc,2\r\n');
  });
});
