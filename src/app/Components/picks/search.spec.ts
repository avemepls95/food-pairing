import { describe, expect, it } from 'vitest';
import { pairKey, PairLevel } from '../../Core/graph/graph-data';
import { Jar } from '../../Core/library/jar';
import { Mix } from '../../Core/library/mix';
import { PicksContext, PicksRequest } from './recommendation';
import { recommend } from './recommender';

const BIG_SHELF = ['вишня', 'малина', 'клубника', 'ежевика', 'черника', 'брусника', 'клюква',
  'морошка', 'облепиха', 'лайм', 'лимон', 'мята', 'имбирь', 'кола'];

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
  кола: 'Напитки',
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
  rejected: [],
  level: () => 'red',
  sides: () => 2,
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
    expect(result.shelves[0].scored).toBe(0);
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

  it('режим ослаблен => найденные миксы остаются в выдаче и стоят первыми', () => {
    const jars = jarsOf('вишня', 'мята', 'лайм', 'малина');
    // Описана одна пара, остальные неизвестны, поэтому проверенных миксов меньше трёх
    const level = (a: string, b: string): PairLevel =>
      pairKey(a, b) === pairKey('вишня', 'мята') ? 'red' : 'unknown';

    const result = recommend(request({ risk: 'safe' }), context(jars, { level }));

    expect(flavorsOf(result.shelves[0].items)[0]).toBe('вишня+мята');
    expect(result.shelves[0].items.length).toBeGreaterThan(1);
  });

  it('все найденные миксы уже в журнале => режим всё равно ослабляется', () => {
    const jars = jarsOf('вишня', 'мята', 'лайм', 'малина');
    // Малина ни с чем не описана, остальные пары зелёные
    const level = (a: string, b: string): PairLevel =>
      a === 'малина' || b === 'малина' ? 'unknown' : 'green';
    const mixes = [
      mix('tried', 5, 'вишня', 'мята'),
      mix('tried', 5, 'вишня', 'лайм'),
      mix('tried', 5, 'мята', 'лайм')
    ];

    const result = recommend(request({ risk: 'safe' }), context(jars, { level, mixes }));

    expect(result.shelves[0].items).toHaveLength(3);
    expect(flavorsOf(result.shelves[0].items).every(key => key.includes('малина'))).toBe(true);
  });

  it('на самом свободном режиме пусто => полка без карточек и ничего не оценено', () => {
    const jars = jarsOf('вишня', 'мята');

    const result = recommend(request({ risk: 'safe' }), context(jars, { level: () => 'pale' }));

    expect(result.shelves[0].items).toEqual([]);
    expect(result.shelves[0].scored).toBe(0);
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

  it('набор вкусов отклонён => в выдачу не попадает и считается в skippedRejected', () => {
    const jars = jarsOf('вишня', 'мята', 'лайм');

    const result = recommend(request(), context(jars, { rejected: ['вишня+мята'] }));

    expect(flavorsOf(result.shelves[0].items)).not.toContain('вишня+мята');
    expect(result.shelves[0].skippedRejected).toBe(1);
  });

  it('отклонённых нет => skippedRejected ноль', () => {
    const jars = jarsOf('вишня', 'мята');

    const result = recommend(request(), context(jars));

    expect(result.shelves[0].skippedRejected).toBe(0);
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

  it('вкус сочетается со всем => в начале списка он не чаще трети карточек', () => {
    const jars = jarsOf('вишня', 'малина', 'клубника', 'ежевика', 'черника', 'брусника');
    // Вишня красная со всеми, остальные между собой только синие
    const level = (a: string, b: string): PairLevel => (a === 'вишня' || b === 'вишня' ? 'red' : 'blue');

    const result = recommend(request({ jarCount: 2, limit: 6 }), context(jars, { level }));
    const items = result.shelves[0].items;

    expect(items).toHaveLength(6);
    expect(items.slice(0, 6).filter(item => item.flavors.includes('вишня'))).toHaveLength(2);
  });

  it('других кандидатов нет => повторы занимают хвост списка, карточки не теряются', () => {
    const jars = jarsOf('вишня', 'малина', 'клубника', 'ежевика');
    // Без вишни пары бледные, поэтому все миксы только с ней
    const level = (a: string, b: string): PairLevel => (a === 'вишня' || b === 'вишня' ? 'red' : 'pale');

    const result = recommend(request({ jarCount: 2, limit: 6 }), context(jars, { level }));

    expect(result.shelves[0].items).toHaveLength(3);
  });

  it('лимит вырос => первые шесть карточек остаются теми же', () => {
    const jars = jarsOf(...BIG_SHELF);

    const six = recommend(request({ jarCount: 3, limit: 6 }), context(jars));
    const twelve = recommend(request({ jarCount: 3, limit: 12 }), context(jars));

    expect(flavorsOf(twelve.shelves[0].items).slice(0, 6)).toEqual(flavorsOf(six.shelves[0].items));
  });

  it('миксы из четырёх банок => "Показать ещё" достаёт отложенные карточки', () => {
    const jars = jarsOf(...BIG_SHELF);

    const page = recommend(request({ jarCount: 4, limit: 6 }), context(jars)).shelves[0];
    const more = recommend(request({ jarCount: 4, limit: 12 }), context(jars)).shelves[0];

    expect(page.hiddenRepeats).toBeGreaterThan(0);
    expect(more.items.length).toBeGreaterThan(page.items.length);
    expect(more.items.slice(page.items.length).every(item => item.repeat)).toBe(true);
  });

  it('карточка добрана из отложенных => она помечена повтором', () => {
    const jars = jarsOf('вишня', 'малина', 'клубника', 'ежевика', 'черника', 'брусника');
    // Без вишни пары бледные, поэтому все миксы только с ней
    const level = (a: string, b: string): PairLevel => (a === 'вишня' || b === 'вишня' ? 'red' : 'pale');

    const result = recommend(request({ jarCount: 2, limit: 6 }), context(jars, { level }));
    const items = result.shelves[0].items;

    expect(items).toHaveLength(3);
    expect(items.map(item => item.repeat)).toEqual([false, false, true]);
  });

  it('комбинация всего одна => она и показывается', () => {
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

  it('лучшие карточки полок равны => выбирается большее число банок', () => {
    const jars = jarsOf(...BIG_SHELF);

    const result = recommend(request({ jarCount: 'any' }), context(jars));
    const best = (count: number) => result.shelves.find(shelf => shelf.jarCount === count)!.items[0].score;

    expect(result.chosen).toBeGreaterThan(2);
    expect(best(result.chosen!)).toBeGreaterThanOrEqual(best(2) - 5);
  });

  it('полка с одной карточкой => выбирают ту, где карточек хватает', () => {
    const jars = jarsOf('вишня', 'малина', 'клубника', 'мята');

    const result = recommend(request({ jarCount: 'any' }), context(jars));
    const chosenShelf = result.shelves.find(shelf => shelf.jarCount === result.chosen);

    expect(chosenShelf!.items.length).toBeGreaterThanOrEqual(3);
  });

  it('миксы из трёх банок не собираются => chosen это два', () => {
    const jars = jarsOf('вишня', 'малина', 'мята');
    const level = (a: string, b: string): PairLevel =>
      pairKey(a, b) === pairKey('вишня', 'малина') ? 'pale' : 'red';

    const result = recommend(request({ jarCount: 'any' }), context(jars, { level }));

    expect(result.chosen).toBe(2);
  });
});

describe('recommend: аромат', () => {
  const has = (flavor: string) => (other: string) => other === flavor;
  const oneOf = (...flavors: string[]) => (other: string) => flavors.includes(other);

  it('выбран вкус => в каждой карточке есть банка с ним', () => {
    const jars = jarsOf(...BIG_SHELF);

    const result = recommend(request({ jarCount: 3, aromas: [has('мята')] }), context(jars));
    const items = result.shelves[0].items;

    expect(items.length).toBeGreaterThan(0);
    expect(items.every(item => item.flavors.includes('мята'))).toBe(true);
  });

  it('вкус стоит в банке вместе с другим => банка закрывает аромат', () => {
    const jars = [jar('j1', 'вишня', 'мята'), jar('j2', 'лайм'), jar('j3', 'малина')];

    const result = recommend(request({ aromas: [has('мята')] }), context(jars));

    expect(result.shelves[0].items.every(item => item.jarIds.includes('j1'))).toBe(true);
    expect(result.shelves[0].items).toHaveLength(2);
  });

  it('два аромата => в миксе есть оба', () => {
    const jars = jarsOf('вишня', 'малина', 'мята', 'лайм', 'имбирь');

    const result = recommend(request({ aromas: [has('мята'), has('лайм')] }), context(jars));

    expect(flavorsOf(result.shelves[0].items)).toEqual(['лайм+мята']);
  });

  it('под аромат на полке ничего нет => карточек нет и ничего не оценено', () => {
    const jars = jarsOf('вишня', 'малина', 'мята');

    const result = recommend(request({ risk: 'safe', aromas: [has('кола')] }), context(jars));

    expect(result.shelves[0].items).toEqual([]);
    expect(result.shelves[0].scored).toBe(0);
  });

  it('аромат закрывает одна банка => она не упирается в лимит повторов', () => {
    const jars = jarsOf(...BIG_SHELF);

    const result = recommend(request({ jarCount: 2, aromas: [has('мята')] }), context(jars));
    const items = result.shelves[0].items;

    expect(items).toHaveLength(6);
    expect(items.some(item => item.repeat)).toBe(false);
    expect(result.shelves[0].hiddenRepeats).toBe(0);
  });

  it('аромат закрывают две банки => страница делится между ними поровну', () => {
    const jars = jarsOf(...BIG_SHELF);

    const result = recommend(request({ jarCount: 2, aromas: [oneOf('лайм', 'лимон')] }), context(jars));
    const items = result.shelves[0].items;
    const withLime = items.filter(item => item.flavors.includes('лайм'));
    const withLemon = items.filter(item => item.flavors.includes('лимон'));

    expect(items).toHaveLength(6);
    expect(items.every(item => item.flavors.includes('лайм') || item.flavors.includes('лимон'))).toBe(true);
    expect(withLime.length).toBeLessThanOrEqual(3);
    expect(withLemon.length).toBeLessThanOrEqual(3);
  });

  it('пустой список ароматов => выдача как без фильтра', () => {
    const jars = jarsOf(...BIG_SHELF);

    const plain = recommend(request({ jarCount: 3 }), context(jars));
    const empty = recommend(request({ jarCount: 3, aromas: [] }), context(jars));

    expect(flavorsOf(empty.shelves[0].items)).toEqual(flavorsOf(plain.shelves[0].items));
  });

  it('большая полка и узкий аромат в её конце => перебор не проходит все клики', () => {
    const flavors = Array.from({ length: 90 }, (_, index) => `вкус${index}`);
    const jars = jarsOf(...flavors);
    const categoryOf = (flavor: string) => (flavor === 'вкус89' ? 'Травы' : 'Ягоды');
    // Миксы с нужным вкусом слабее остальных, поэтому граница по баллу ветки без него не режет
    const level = (a: string, b: string): PairLevel => (a === 'вкус89' || b === 'вкус89' ? 'blue' : 'red');

    const started = performance.now();
    const result = recommend(request({ jarCount: 4, aromas: [has('вкус89')] }),
      context(jars, { categoryOf, level, knows: () => true }));

    expect(result.shelves[0].items.length).toBeGreaterThan(0);
    expect(result.shelves[0].items.every(item => item.flavors.includes('вкус89'))).toBe(true);
    // С отсечением десятки миллисекунд, без него перебор проходит два с половиной миллиона клик
    expect(performance.now() - started).toBeLessThan(300);
  });
});
