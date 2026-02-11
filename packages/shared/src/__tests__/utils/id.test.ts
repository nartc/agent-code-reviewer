import { generateId } from '../../utils/id.js';

describe('generateId', () => {
  it('returns a string', () => {
    const id = generateId();
    expect(typeof id).toBe('string');
  });

  it('returns different values on successive calls', () => {
    const id1 = generateId();
    const id2 = generateId();
    expect(id1).not.toBe(id2);
  });

  it('returns a 21-character string (nanoid default)', () => {
    const id = generateId();
    expect(id.length).toBe(21);
  });
});
