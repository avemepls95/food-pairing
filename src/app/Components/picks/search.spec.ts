import { describe, expect, it } from 'vitest';
import { pairKey, PairLevel } from '../../Core/graph/graph-data';
import { Jar } from '../../Core/library/jar';
import { Mix } from '../../Core/library/mix';
import { PicksContext, PicksRequest } from './recommendation';
import { recommend } from './recommender';

const CATEGORIES: Record<string, string> = {
  вишня: 'Ягоды',
  малина: 'Ягоды',
  клубника: 'Ягоды',
  ежевика: 'Ягоды',
  черника: 'Ягоды',
  брусника: 'Ягоды',
  клюква: 'Ягоды',
  морошка: 'Ягоды',
  облепиха: 'Ягоды',
  лайм: 'Цитрус',
  лимон: 'Цитрус',
  мята: 'Травы',
  имбирь: 'Специи'
};

const jar = (id: string, ...flavors: string[]): Jar => ({ id, flavors });
const jarsOf = (...flavors: string[]): Jar[] => flavors.map(flavor => jar(flavor, flavor));

const context = (jars: Jar[], patch: Partial<PicksContext> = {}): PicksContext => ({
  jars,
  mixes: [],
  level: () => 'red',
  categoryOf: flavor => CATEGORIES[flavor],
  knows: flavor => flavor in CATEGORIES,
  hasTable: () => true,
  ...patch
});

const request = (patch: Partial<PicksRequest> = {}): PicksRequest =>
  ({ jarCount: 2, risk: 'balanced', usePersonal: false, ...patch });

const flavorsOf = (items: { flavors: string[] }[]) => items.map(item => [...item.flavors].sort().join('+'));

const mix = (category: 'tried' | 'planned', rating: number | undefined, ...flavors: string[]): Mix => ({
  id: flavors.join('-'),
  items: flavors.map(flavor => ({ flavors: [flavor] })),
  rating,
  category,
  updatedAt: '2026-01-01T00:00:00.000Z'
});

describe('recommend: гейты', () => {
  it('бледная пара => банки не соединяются ни на одном режиме', () => {
    const jars = jarsOf('вишня', 'мята');
    const result = recommend(request({ risk: 'bold' }), context(jars, { level: () => 'pale' }));

    expect(result.shelves[0].items).toEqual([]);
    expect(result.shelves[0].total).toBe(0);
  });

  it('банки с общим вкусом => вместе не предлагаются', () => {
    const jars = [jar('j1', 'вишня'), jar('j2', 'вишня', 'мята')];

    const result = recommend(request(), context(jars));

    expect(result.shelves[0].items).toEqual([]);
  });

  it('режим safe => пары слабее зелёного не проходят', () => {
    const jars = jarsOf('вишня', 'малина', 'клубника', 'лайм');
    // Лайм сочетается со всеми только на синем уровне, остальные между собой на зелёном
    const level = (a: string, b: string): PairLevel => (a === 'лайм' || b === 'лайм' ? 'blue' : 'green');

    const result = recommend(request({ risk: 'safe' }), context(jars, { level }));

    expect(result.shelves[0].relaxed).toBe(false);
    expect(flavorsOf(result.shelves[0].items).some(key => key.includes('лайм'))).toBe(false);
  });

  it('режим смелые => показываются только миксы с парой без данных', () => {
    const jars = jarsOf('вишня', 'мята', 'лайм', 'малина');
    // Пара вишни с лаймом не описана, остальные пары красные
    const level = (a: string, b: string): PairLevel =>
      pairKey(a, b) === pairKey('вишня', 'лайм') ? 'unknown' : 'red';

    const result = recommend(request({ risk: 'bold' }), context(jars, { level }));

    expect(flavorsOf(result.shelves[0].items)).toEqual(['вишня+лайм']);
  });

  it('режим сбалансированные => пара без данных не показывается', () => {
    const jars = jarsOf('вишня', 'мята', 'лайм', 'малина');
    const level = (a: string, b: string): PairLevel =>
      pairKey(a, b) === pairKey('вишня', 'лайм') ? 'unknown' : 'red';

    const result = recommend(request({ risk: 'balanced' }), context(jars, { level }));

    expect(flavorsOf(result.shelves[0].items)).not.toContain('вишня+лайм');
    expect(result.shelves[0].items.length).toBeGreaterThan(0);
  });

  it('все пары описаны => в смелых пусто', () => {
    const jars = jarsOf('вишня', 'мята', 'лайм');

    const result = recommend(request({ risk: 'bold' }), context(jars));

    expect(result.shelves[0].items).toEqual([]);
  });

  it('гейт прошло меньше трёх миксов => режим ослабляется и relaxed true', () => {
    const jars = jarsOf('вишня', 'мята', 'лайм', 'малина');
    const level = (a: string, b: string): PairLevel =>
      pairKey(a, b) === pairKey('вишня', 'мята') ? 'green' : 'blue';

    const result = recommend(request({ risk: 'safe' }), context(jars, { level }));

    expect(result.shelves[0].relaxed).toBe(true);
    expect(result.shelves[0].risk).toBe('balanced');
  });

  it('на самом свободном режиме пусто => полка без карточек и total 0', () => {
    const jars = jarsOf('вишня', 'мята');

    const result = recommend(request({ risk: 'safe' }), context(jars, { level: () => 'pale' }));

    expect(result.shelves[0].items).toEqual([]);
    expect(result.shelves[0].total).toBe(0);
    expect(result.shelves[0].risk).toBe('bold');
  });

  it('банок меньше, чем нужно в миксе => полок нет', () => {
    const result = recommend(request({ jarCount: 'any' }), context(jarsOf('вишня')));

    expect(result.shelves).toEqual([]);
  });
});

describe('recommend: журнал', () => {
  it('набор вкусов совпал с попробованным миксом => в выдачу не попадает и считается в skippedTried', () => {
    const jars = jarsOf('вишня', 'мята', 'лайм');
    const mixes = [mix('tried', 5, 'вишня', 'мята')];

    const result = recommend(request({ usePersonal: false }), context(jars, { mixes }));

    expect(flavorsOf(result.shelves[0].items)).not.toContain('вишня+мята');
    expect(result.shelves[0].skippedTried).toBe(1);
  });

  it('в банке есть вкус не из справочника => попробованный микс с ней всё равно уходит из выдачи', () => {
    const jars = [jar('j1', 'вишня', 'шафран'), jar('j2', 'мята')];
    const mixes = [mix('tried', 5, 'вишня', 'шафран', 'мята')];

    const result = recommend(request(), context(jars, { mixes }));

    expect(result.shelves[0].items).toEqual([]);
    expect(result.shelves[0].skippedTried).toBe(1);
  });

  it('набор вкусов совпал с запланированным миксом => остаётся с planned true', () => {
    const jars = jarsOf('вишня', 'мята');
    const mixes = [mix('planned', undefined, 'вишня', 'мята')];

    const result = recommend(request(), context(jars, { mixes }));

    expect(result.shelves[0].items[0].planned).toBe(true);
  });

  it('usePersonal false => оценки не меняют балл', () => {
    const jars = jarsOf('вишня', 'малина');
    const mixes = [mix('tried', 5, 'вишня'), mix('tried', 5, 'вишня')];

    const withPersonal = recommend(request({ usePersonal: true }), context(jars, { mixes }));
    const without = recommend(request({ usePersonal: false }), context(jars, { mixes }));

    expect(withPersonal.shelves[0].items[0].score).toBeGreaterThan(without.shelves[0].items[0].score);
  });
});

describe('recommend: разнообразие', () => {
  it('три банки, кандидат отличается одной банкой от выбранного => пропускается', () => {
    const jars = jarsOf('вишня', 'малина', 'клубника', 'ежевика', 'черника', 'мята', 'имбирь', 'лайм');

    const result = recommend(request({ jarCount: 3, limit: 3 }), context(jars));
    const items = result.shelves[0].items;

    const overlaps = items.flatMap((item, index) =>
      items.slice(index + 1).map(other => other.jarIds.filter(id => item.jarIds.includes(id)).length));
    expect(Math.max(...overlaps)).toBeLessThan(2);
  });

  it('две банки, кандидаты делят одну банку => оба остаются в выдаче', () => {
    const jars = jarsOf('вишня', 'малина', 'мята');

    const result = recommend(request({ jarCount: 2, limit: 3 }), context(jars));

    expect(result.shelves[0].items).toHaveLength(3);
  });

  it('вкус встречается больше чем в половине карточек => лишние пропускаются', () => {
    const jars = jarsOf('мята', 'вишня', 'малина', 'клубника', 'ежевика', 'черника');

    const result = recommend(request({ jarCount: 2, limit: 4 }), context(jars));
    const withMint = result.shelves[0].items.filter(item => item.flavors.includes('мята'));

    expect(result.shelves[0].items).toHaveLength(4);
    expect(withMint).toHaveLength(2);
  });

  it('после фильтров карточек меньше шести => правила разнообразия снимаются', () => {
    const jars = jarsOf('вишня', 'малина', 'мята');

    const result = recommend(request({ jarCount: 3 }), context(jars));

    expect(result.shelves[0].items).toHaveLength(1);
  });

  it('limit 2 => в полке 2 карточки', () => {
    const jars = jarsOf('вишня', 'малина', 'клубника', 'мята');

    const result = recommend(request({ jarCount: 2, limit: 2 }), context(jars));

    expect(result.shelves[0].items).toHaveLength(2);
  });
});

describe('recommend: число банок', () => {
  it('запрошено 3 банки => в результате одна полка с jarCount 3', () => {
    const jars = jarsOf('вишня', 'малина', 'мята', 'лайм');

    const result = recommend(request({ jarCount: 3 }), context(jars));

    expect(result.shelves.map(shelf => shelf.jarCount)).toEqual([3]);
    expect(result.chosen).toBeUndefined();
  });

  it('jarCount any => полки от 2 до 4 при полке меньше 10 банок', () => {
    const jars = jarsOf('вишня', 'малина', 'клубника', 'мята', 'лайм');

    const result = recommend(request({ jarCount: 'any' }), context(jars));

    expect(result.shelves.map(shelf => shelf.jarCount)).toEqual([2, 3, 4]);
  });

  it('jarCount any и полка от 10 банок => появляется полка на 5 банок', () => {
    const jars = jarsOf('вишня', 'малина', 'клубника', 'ежевика', 'черника',
      'брусника', 'клюква', 'морошка', 'облепиха', 'мята');

    const result = recommend(request({ jarCount: 'any' }), context(jars));

    expect(result.shelves.map(shelf => shelf.jarCount)).toEqual([2, 3, 4, 5]);
  });

  it('все полки близки по баллу => chosen это наибольшее число банок', () => {
    const jars = jarsOf('вишня', 'малина', 'клубника', 'мята');

    const result = recommend(request({ jarCount: 'any' }), context(jars));

    expect(result.chosen).toBe(4);
  });

  it('миксы из трёх банок не собираются => chosen это два', () => {
    const jars = jarsOf('вишня', 'малина', 'мята');
    const level = (a: string, b: string): PairLevel =>
      pairKey(a, b) === pairKey('вишня', 'малина') ? 'pale' : 'red';

    const result = recommend(request({ jarCount: 'any' }), context(jars, { level }));

    expect(result.chosen).toBe(2);
  });
});
