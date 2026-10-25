import { describe, expect, it } from 'vitest';
import { pairKey, PairLevel } from '../../Core/graph/graph-data';
import { Jar } from '../../Core/library/jar';
import { Mix } from '../../Core/library/mix';
import { ScoreContext } from './recommendation';
import { affinities, crossPairs, jarRole, LEVEL_WEIGHT, personalScore, scoreMix, shares, structureScore } from './recommender';

const CATEGORIES: Record<string, string> = {
  вишня: 'Ягоды',
  малина: 'Ягоды',
  клубника: 'Ягоды',
  лайм: 'Цитрус',
  мята: 'Травы',
  имбирь: 'Специи',
  кола: 'Напитки'
};

const context = (patch: Partial<ScoreContext> = {}): ScoreContext => ({
  level: () => 'red',
  sides: () => 2,
  categoryOf: flavor => CATEGORIES[flavor],
  knows: flavor => flavor in CATEGORIES,
  hasTable: () => true,
  ...patch
});

const jar = (...flavors: string[]): Jar => ({ id: flavors.join('-'), flavors });

const tried = (rating: number, ...flavors: string[]): Mix => ({
  id: flavors.join('-') + rating,
  items: flavors.map(flavor => ({ flavors: [flavor] })),
  rating,
  category: 'tried',
  updatedAt: '2026-01-01T00:00:00.000Z'
});

describe('LEVEL_WEIGHT', () => {
  it('пара красного уровня => вес 1', () => {
    expect(LEVEL_WEIGHT.red).toBe(1);
  });

  it('пара без данных => вес 0.12', () => {
    expect(LEVEL_WEIGHT.unknown).toBe(0.12);
  });

  it('бледная пара => вес 0', () => {
    expect(LEVEL_WEIGHT.pale).toBe(0);
  });
});

describe('crossPairs', () => {
  it('вкусы внутри одной банки => в пары не попадают', () => {
    const pairs = crossPairs([jar('вишня', 'мята'), jar('лайм')], context());

    expect(pairs.map(pair => pairKey(pair.a, pair.b)).sort())
      .toEqual([pairKey('вишня', 'лайм'), pairKey('мята', 'лайм')].sort());
  });

  it('две банки с общим вкусом => пара вкуса с самим собой не появляется', () => {
    const pairs = crossPairs([jar('вишня'), jar('вишня', 'мята')], context());

    expect(pairs).toEqual([expect.objectContaining({ a: 'вишня', b: 'мята' })]);
  });

  it('вкуса нет в справочнике => пары с ним не считаются', () => {
    const pairs = crossPairs([jar('шафран'), jar('мята')], context());

    expect(pairs).toEqual([]);
  });

  it('уровень пары из контекста => он попадает в вес', () => {
    const level = (): PairLevel => 'blue';

    const pairs = crossPairs([jar('вишня'), jar('мята')], context({ level }));

    expect(pairs[0]).toMatchObject({ level: 'blue', weight: LEVEL_WEIGHT.blue });
  });
});

describe('уверенность в паре', () => {
  it('пара описана одной стороной => карточка это несёт', () => {
    const mix = scoreMix([jar('вишня'), jar('мята')], context({ sides: () => 1 }));

    expect(mix?.pairs[0].sides).toBe(1);
    expect(mix?.oneSided).toBe(1);
  });

  it('обе стороны описали пары => односторонних нет', () => {
    const mix = scoreMix([jar('вишня'), jar('мята')], context());

    expect(mix?.oneSided).toBe(0);
  });
});

describe('structureScore', () => {
  it('состав из одних акцентов => структура уходит в минус', () => {
    expect(structureScore(['мята', 'имбирь'], context())).toBeLessThan(0);
  });

  it('состав без фруктов, но с телом => структура не в минусе', () => {
    expect(structureScore(['кола', 'кофе'], context())).toBeGreaterThanOrEqual(0);
  });

  it('все вкусы одной категории и их больше двух => штраф за плоский состав', () => {
    expect(structureScore(['вишня', 'малина', 'клубника'], context())).toBe(-0.3);
  });

  it('один акцент => структура выше, чем без акцента', () => {
    const withAccent = structureScore(['вишня', 'мята'], context());
    const withoutAccent = structureScore(['вишня', 'малина'], context());

    expect(withAccent - withoutAccent).toBeCloseTo(0.75, 5);
  });

  it('два акцента => структура ниже, чем с одним', () => {
    const one = structureScore(['вишня', 'малина', 'мята'], context());
    const two = structureScore(['вишня', 'мята', 'имбирь'], context());

    expect(two).toBeLessThan(one);
  });

  it('три базовых вкуса без акцента => штраф за плоский состав', () => {
    const flat = structureScore(['вишня', 'малина', 'клубника'], context());

    expect(flat).toBe(-0.3);
  });

  it('две ягоды => структура ноль', () => {
    expect(structureScore(['вишня', 'малина'], context())).toBe(0);
  });
});

describe('scoreMix', () => {
  it('банка с двумя вкусами => её связь весит столько же, сколько связь одновкусовой банки', () => {
    // вишня и малина красные с мятой и лаймом, пара мята-лайм синяя
    const level = (a: string, b: string): PairLevel =>
      (a === 'мята' && b === 'лайм') || (a === 'лайм' && b === 'мята') ? 'blue' : 'red';

    const mix = scoreMix([jar('вишня', 'малина'), jar('мята'), jar('лайм')], context({ level }));

    // среднее по трём связям банок: (1 + 1 + 0.35) / 3, а не по пяти парам вкусов
    expect(mix?.harmony).toBeCloseTo((1 + 1 + LEVEL_WEIGHT.blue) / 3, 5);
  });

  it('красная пара с акцентом и двумя категориями => балл 100', () => {
    const mix = scoreMix([jar('вишня'), jar('мята')], context());

    expect(mix?.score).toBe(100);
  });

  it('все пары красные, структура нулевая => балл 93', () => {
    const mix = scoreMix([jar('вишня'), jar('малина')], context());

    expect(mix?.score).toBe(93);
  });

  it('микс со слабой парой => балл ниже, чем у ровного микса с тем же средним', () => {
    const levels: Record<string, PairLevel> = {
      [pairKey('вишня', 'малина')]: 'red',
      [pairKey('вишня', 'клубника')]: 'red',
      [pairKey('малина', 'клубника')]: 'blue'
    };
    const uneven = scoreMix([jar('вишня'), jar('малина'), jar('клубника')],
      context({ level: (a, b) => levels[pairKey(a, b)] ?? 'unknown' }));
    const even = scoreMix([jar('вишня'), jar('малина'), jar('клубника')],
      context({ level: () => 'yellow' }));

    expect(uneven!.harmony).toBeCloseTo(even!.harmony, 2);
    expect(uneven!.score).toBeLessThan(even!.score);
  });

  it('все пары синие => балл ниже, чем у красных', () => {
    const blue = scoreMix([jar('вишня'), jar('малина')], context({ level: () => 'blue' }));
    const red = scoreMix([jar('вишня'), jar('малина')], context());

    expect(blue!.score).toBeLessThan(red!.score);
  });

  it('банка без вкусов из справочника => scoreMix возвращает undefined', () => {
    const mix = scoreMix([jar('шафран'), jar('мята')], context());

    expect(mix).toBeUndefined();
  });

  it('все миксы с оценкой 1 => балл не ниже нуля', () => {
    const affinity = affinities([tried(1, 'вишня', 'малина')]);

    const mix = scoreMix([jar('вишня'), jar('малина')], context({ level: () => 'pale', affinity }));

    expect(mix!.score).toBeGreaterThanOrEqual(0);
  });

  it('банка со вкусом без своей таблицы => thinData true', () => {
    const mix = scoreMix([jar('вишня'), jar('малина')], context({ hasTable: flavor => flavor !== 'малина' }));

    expect(mix?.thinData).toBe(true);
  });

  it('у всех вкусов есть таблица => thinData false', () => {
    const mix = scoreMix([jar('вишня'), jar('малина')], context());

    expect(mix?.thinData).toBe(false);
  });

  it('микс из банок => состав несёт доли и роли', () => {
    const mix = scoreMix([jar('вишня'), jar('мята')], context());

    expect(mix?.components).toEqual([
      expect.objectContaining({ role: 'base', share: 75 }),
      expect.objectContaining({ role: 'accent', share: 25 })
    ]);
  });
});

describe('affinities', () => {
  it('оценена одна пара из трёх => добавка меньше, чем когда оценены все три', () => {
    const one = affinities([tried(5, 'вишня', 'мята')]);
    const all = affinities([tried(5, 'вишня', 'мята', 'лайм')]);
    const pairs = crossPairs([jar('вишня'), jar('мята'), jar('лайм')], context());

    expect(personalScore([], pairs, one)).toBeLessThan(personalScore([], pairs, all));
  });

  it('вкус из микса с оценкой 5 => личная добавка положительная', () => {
    const affinity = affinities([tried(5, 'вишня', 'мята')]);

    expect(personalScore(['вишня'], [], affinity)).toBeGreaterThan(0);
  });

  it('вкус с одной оценкой 5 => добавка меньше, чем у вкуса с тремя такими оценками', () => {
    const one = affinities([tried(5, 'вишня', 'мята')]);
    const three = affinities([tried(5, 'вишня', 'мята'), tried(5, 'вишня', 'лайм'), tried(5, 'вишня', 'кола')]);

    expect(personalScore(['вишня'], [], one)).toBeLessThan(personalScore(['вишня'], [], three));
  });

  it('вкус без оценок => личная добавка ноль', () => {
    const affinity = affinities([tried(5, 'вишня', 'мята')]);

    expect(personalScore(['кола'], [], affinity)).toBe(0);
  });

  it('оценок нет совсем => личная добавка ноль', () => {
    expect(personalScore(['вишня'], [], undefined)).toBe(0);
  });

  it('запланированный микс => в оценки не попадает', () => {
    const planned: Mix = { ...tried(5, 'вишня', 'мята'), category: 'planned', rating: undefined };

    const affinity = affinities([planned]);

    expect(personalScore(['вишня'], [], affinity)).toBe(0);
  });

  it('пара из микса с оценкой 5 => добавка пары положительная', () => {
    const affinity = affinities([tried(5, 'вишня', 'мята')]);
    const pairs = crossPairs([jar('вишня'), jar('мята')], context());

    expect(personalScore([], pairs, affinity)).toBeGreaterThan(0);
  });
});

describe('shares', () => {
  it('основа и акцент => доли 75 и 25', () => {
    expect(shares(['base', 'accent'])).toEqual([75, 25]);
  });

  it('основа, дополнение и акцент => доли 50, 30 и 20', () => {
    expect(shares(['base', 'support', 'accent'])).toEqual([50, 30, 20]);
  });

  it('две основы и акцент => акцент получает свои 15, а не остаток', () => {
    expect(shares(['base', 'base', 'accent'])).toEqual([45, 40, 15]);
  });

  it('акцент, основа и основа => порядок долей следует за составом', () => {
    expect(shares(['accent', 'base', 'base'])).toEqual([15, 45, 40]);
  });

  it('две основы => доли 50 и 50', () => {
    expect(shares(['base', 'base'])).toEqual([50, 50]);
  });

  it('любой состав => сумма долей 100', () => {
    const compositions: Parameters<typeof shares>[0][] = [
      ['base', 'accent'],
      ['base', 'support', 'accent'],
      ['base', 'base', 'base'],
      ['base', 'support', 'support', 'accent'],
      ['accent', 'accent'],
      ['base', 'base', 'support', 'accent', 'accent']
    ];

    const sums = compositions.map(roles => shares(roles).reduce((sum, share) => sum + share, 0));

    expect(sums).toEqual(compositions.map(() => 100));
  });
});

describe('jarRole', () => {
  it('банка с акцентом и вкусом не из справочника => роль accent', () => {
    expect(jarRole(jar('мята', 'шафран'), context())).toBe('accent');
  });

  it('банка с базовым вкусом => роль base', () => {
    expect(jarRole(jar('вишня', 'мята'), context())).toBe('base');
  });

  it('банка только из акцентов => роль accent', () => {
    expect(jarRole(jar('мята', 'имбирь'), context())).toBe('accent');
  });

  it('банка без базы и без акцента => роль support', () => {
    expect(jarRole(jar('кола'), context())).toBe('support');
  });
});
