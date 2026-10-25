import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  aromaLabel,
  aromaTest,
  availableMoods,
  hasAromas,
  moodById,
  MOODS,
  moodTest,
  parseAromas,
  sameAroma
} from './aroma';
import { Product } from './graph-data';

const productsFile = new URL('../../../../public/data/products.json', import.meta.url);
const products: Product[] = JSON.parse(readFileSync(productsFile, 'utf8'));
const categoryByName = new Map(products.map(product => [product.name, product.category]));
const categoryOf = (flavor: string) => categoryByName.get(flavor);

describe('MOODS', () => {
  it('каждый вкус настроения есть в справочнике', () => {
    const missing = MOODS.flatMap(mood => (mood.flavors ?? []).filter(flavor => !categoryByName.has(flavor)));

    expect(missing).toEqual([]);
  });

  it('каждая категория настроения есть в справочнике', () => {
    const categories = new Set(products.map(product => product.category));
    const missing = MOODS.flatMap(mood => (mood.categories ?? []).filter(category => !categories.has(category)));

    expect(missing).toEqual([]);
  });

  it('у настроений разные id', () => {
    expect(new Set(MOODS.map(mood => mood.id)).size).toBe(MOODS.length);
  });

  it('десертное => подходят кокос, карамель и ваниль, не подходит мята', () => {
    const dessert = moodTest(moodById('dessert')!, categoryOf);

    expect(['кокос', 'карамель', 'ваниль'].every(dessert)).toBe(true);
    expect(dessert('мята')).toBe(false);
  });

  it('ягодное => арбуз из категории Ягоды не подходит', () => {
    const berry = moodTest(moodById('berry')!, categoryOf);

    expect(berry('малина')).toBe(true);
    expect(berry('арбуз')).toBe(false);
  });
});

describe('aromaTest', () => {
  it('выбран вкус => подходит только он', () => {
    const coconut = aromaTest({ kind: 'flavor', name: 'кокос' }, categoryOf);

    expect(coconut('кокос')).toBe(true);
    expect(coconut('кокосовая вода')).toBe(false);
  });

  it('настроение по категории => подходит любой вкус категории', () => {
    const citrus = aromaTest({ kind: 'mood', id: 'citrus' }, categoryOf);

    expect(citrus('юдзу')).toBe(true);
  });

  it('настроения нет в списке => не подходит ничего', () => {
    const gone = aromaTest({ kind: 'mood', id: 'gone' }, categoryOf);

    expect(gone('кокос')).toBe(false);
  });
});

describe('hasAromas', () => {
  const coconut = aromaTest({ kind: 'flavor', name: 'кокос' }, categoryOf);
  const fresh = aromaTest({ kind: 'mood', id: 'fresh' }, categoryOf);

  it('каждое условие закрыто своим вкусом => true', () => {
    expect(hasAromas(['кокос', 'мята'], [coconut, fresh])).toBe(true);
  });

  it('одно условие не закрыто => false', () => {
    expect(hasAromas(['кокос', 'вишня'], [coconut, fresh])).toBe(false);
  });

  it('условий нет => подходит любой набор', () => {
    expect(hasAromas(['вишня'], [])).toBe(true);
  });
});

describe('availableMoods', () => {
  it('на полке вишня и мята => ягодное, кислое, свежее и травяное', () => {
    expect(availableMoods(['кислая вишня', 'мята'], categoryOf).map(mood => mood.id))
      .toEqual(['fresh', 'sour', 'berry', 'herbal']);
  });

  it('вкусов нет => настроений нет', () => {
    expect(availableMoods([], categoryOf)).toEqual([]);
  });
});

describe('aromaLabel и sameAroma', () => {
  it('настроение => его название, вкус => имя вкуса', () => {
    expect(aromaLabel({ kind: 'mood', id: 'dessert' })).toBe('Десертное');
    expect(aromaLabel({ kind: 'flavor', name: 'кокос' })).toBe('кокос');
  });

  it('вкус и настроение с одинаковой строкой => разные ароматы', () => {
    expect(sameAroma({ kind: 'flavor', name: 'dessert' }, { kind: 'mood', id: 'dessert' })).toBe(false);
    expect(sameAroma({ kind: 'mood', id: 'dessert' }, { kind: 'mood', id: 'dessert' })).toBe(true);
  });
});

describe('parseAromas', () => {
  it('сохранённый выбор => читается как был', () => {
    const aromas = [{ kind: 'mood', id: 'dessert' }, { kind: 'flavor', name: 'кокос' }];

    expect(parseAromas(JSON.stringify(aromas))).toEqual(aromas);
  });

  it('записи чужого вида => пропускаются', () => {
    expect(parseAromas('[{"kind":"mood"},{"kind":"flavor","name":1},null,"кокос",{"kind":"flavor","name":"мята"}]'))
      .toEqual([{ kind: 'flavor', name: 'мята' }]);
  });

  it('пусто или битый текст => пустой выбор', () => {
    expect(parseAromas(null)).toEqual([]);
    expect(parseAromas('{')).toEqual([]);
    expect(parseAromas('{"kind":"mood","id":"dessert"}')).toEqual([]);
  });
});
