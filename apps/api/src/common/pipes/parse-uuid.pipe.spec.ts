import { ParseUuidPipe } from './parse-uuid.pipe';

const pipe = new ParseUuidPipe();
const uuid = '0b0e3f0e-4d1f-4f6e-9c1a-2f4a7d9e8c10';

describe('ParseUuidPipe', () => {
  it('returns a valid UUID unchanged', () => {
    expect(pipe.transform(uuid, { type: 'param', data: 'id' })).toBe(uuid);
  });

  it('accepts time-ordered UUIDs', () => {
    const v7 = '01890a5d-ac96-774b-bcce-b302099a8057';

    expect(pipe.transform(v7, { type: 'param', data: 'id' })).toBe(v7);
  });

  it.each(['123', '', uuid + 'x', undefined, 7])('rejects %p and names the param', (value) => {
    let thrown: unknown;
    try {
      pipe.transform(value, { type: 'param', data: 'productId' });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({
      code: 'VALIDATION_FAILED',
      details: [{ field: 'productId', messages: ['productId must be a UUID'] }],
    });
  });
});
