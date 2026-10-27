import { describe, expect, it } from 'vitest';
import { categoryColor, roleOfCategory } from './categories';

describe('roleOfCategory', () => {
  it('категория Ягоды => роль base', () => {
    expect(roleOfCategory('Ягоды')).toBe('base');
  });

  it('категория Специи => роль accent', () => {
    expect(roleOfCategory('Специи')).toBe('accent');
  });

  it('категория Напитки => роль support', () => {
    expect(roleOfCategory('Напитки')).toBe('support');
  });

  it('категории нет => роль support', () => {
    expect(roleOfCategory(undefined)).toBe('support');
  });
});

describe('categoryColor', () => {
  it('известная категория => свой цвет', () => {
    expect(categoryColor('Ягоды')).toBe('#d02b4c');
  });

  it('неизвестная категория => цвет по умолчанию', () => {
    expect(categoryColor('Грибы')).toBe('#76736c');
  });
});
