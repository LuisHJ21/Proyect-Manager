import { describe, expect, it } from 'vitest';
import { raciWarnings } from '../../src/domain/raci';

describe('raciWarnings', () => {
  it.each([
    [[], ['missing_a', 'missing_r']],
    [['R'], ['missing_a']],
    [['A'], ['missing_r']],
    [['A', 'A', 'R'], ['multiple_a']],
    [['A', 'A'], ['multiple_a', 'missing_r']],
    [['A', 'R', 'C', 'I'], []],
  ])('raciWarnings(%j) = %j', (roles, expected) => {
    expect(raciWarnings(roles)).toEqual(expected);
  });
});
