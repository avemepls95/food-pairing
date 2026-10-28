import { describe, expect, it } from 'vitest';
import { plural } from './plural';

const MIX: [string, string, string] = ['микс', 'микса', 'миксов'];

describe('plural', () => {
  it('один => форма единственного числа', () => {
    expect(plural(1, MIX)).toBe('микс');
  });

  it('два => форма для 2-4', () => {
    expect(plural(2, MIX)).toBe('микса');
  });

  it('пять => форма множественного числа', () => {
    expect(plural(5, MIX)).toBe('миксов');
  });

  it('ноль => форма множественного числа', () => {
    expect(plural(0, MIX)).toBe('миксов');
  });

  it('одиннадцать => форма множественного числа', () => {
    expect(plural(11, MIX)).toBe('миксов');
  });

  it('четырнадцать => форма множественного числа', () => {
    expect(plural(14, MIX)).toBe('миксов');
  });

  it('двадцать один => форма единственного числа', () => {
    expect(plural(21, MIX)).toBe('микс');
  });

  it('сто двенадцать => форма множественного числа', () => {
    expect(plural(112, MIX)).toBe('миксов');
  });

  it('сто двадцать два => форма для 2-4', () => {
    expect(plural(122, MIX)).toBe('микса');
  });
});
