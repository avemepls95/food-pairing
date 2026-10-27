import { describe, expect, it } from 'vitest';
import { pairKey, PairLevel } from '../../Core/graph/graph-data';
import { buildGrouping, FlavorGroup } from '../../Core/library/flavor-group';
import { Jar } from '../../Core/library/jar';
import { Mix } from '../../Core/library/mix';
import { groupContext, groupJars, groupTest, shelfFlavorKey, withShelfJars } from './grouping';
import { PicksContext } from './recommendation';
import { flavorKey, recommend } from './recommender';

const CATEGORIES: Record<string, string> = {
  'груша': 'Фрукты',
  'желтая груша': 'Фрукты',
  'зеленая груша': 'Фрукты',
  'сыр': 'Гастро',
  'горгонзола': 'Гастро',
  'мята': 'Травы'
};

const PEAR: FlavorGroup = { id: 'g1', name: 'груша', flavors: ['груша', 'желтая груша', 'зеленая груша'] };
const CHEESE: FlavorGroup = { id: 'g2', name: 'сыр', flavors: ['сыр', 'горгонзола'] };

const knows = (flavor: string) => flavor in CATEGORIES;
const grouping = (groups: FlavorGroup[] = [PEAR]) => buildGrouping(groups, knows);

const context = (patch: Partial<PicksContext> = {}): PicksContext => ({
  jars: [],
  mixes: [],
  rejected: [],
  level: () => 'red',
  sides: () => 2,
  categoryOf: flavor => CATEGORIES[flavor],
  knows,
  hasTable: () => true,
  ...patch
});

const jar = (id: string, ...flavors: string[]): Jar => ({ id, flavors });

const tried = (...flavors: string[]): Mix => ({
  id: 'm1',
  items: flavors.map(flavor => ({ flavors: [flavor] })),
  rating: 5,
  category: 'tried',
  updatedAt: '2026-01-01T00:00:00.000Z'
});

const pairs = (jarCount: number, ctx: PicksContext) =>
  recommend({ jarCount, risk: 'balanced', usePersonal: false }, ctx).shelves[0];

describe('groupJars', () => {
  it('банка с двумя вкусами одной группы => один эффективный вкус', () => {
    const jars = groupJars([jar('j1', 'груша', 'зеленая груша')], grouping());

    expect(jars).toEqual([{ id: 'j1', flavors: ['груша'] }]);
  });
});

describe('groupContext', () => {
  it('уровень пары с группой => максимальный среди её вкусов', () => {
    const levels: Record<string, PairLevel> = {
      [pairKey('сыр', 'зеленая груша')]: 'red',
      [pairKey('сыр', 'желтая груша')]: 'blue',
      [pairKey('сыр', 'груша')]: 'green'
    };

    const ctx = groupContext(context({ level: (a, b) => levels[pairKey(a, b)] ?? 'unknown' }), grouping());

    expect(ctx.level('сыр', 'груша')).toBe('red');
  });

  it('стороны пары с группой => от пары, давшей уровень', () => {
    const levels: Record<string, PairLevel> = {
      [pairKey('сыр', 'зеленая груша')]: 'red',
      [pairKey('сыр', 'груша')]: 'green'
    };
    const sides: Record<string, number> = { [pairKey('сыр', 'зеленая груша')]: 1 };

    const ctx = groupContext(context({
      level: (a, b) => levels[pairKey(a, b)] ?? 'unknown',
      sides: (a, b) => sides[pairKey(a, b)] ?? 2
    }), grouping());

    expect(ctx.sides('сыр', 'груша')).toBe(1);
  });

  it('пара двух групп => максимум по всем парам их вкусов', () => {
    const levels: Record<string, PairLevel> = { [pairKey('горгонзола', 'зеленая груша')]: 'yellow' };

    const ctx = groupContext(context({ level: (a, b) => levels[pairKey(a, b)] ?? 'blue' }),
      grouping([PEAR, CHEESE]));

    expect(ctx.level('сыр', 'груша')).toBe('yellow');
  });

  it('категория группы => самая частая среди вкусов', () => {
    const mixed: FlavorGroup = { id: 'g3', name: 'смесь', flavors: ['сыр', 'груша', 'желтая груша'] };

    const ctx = groupContext(context(), grouping([mixed]));

    expect(ctx.categoryOf('смесь')).toBe('Фрукты');
  });

  it('категории поровну => категория первого вкуса', () => {
    const mixed: FlavorGroup = { id: 'g3', name: 'смесь', flavors: ['сыр', 'груша'] };

    const ctx = groupContext(context(), grouping([mixed]));

    expect(ctx.categoryOf('смесь')).toBe('Гастро');
  });

  it('hasTable группы => true, если таблица есть хотя бы у одного вкуса', () => {
    const ctx = groupContext(context({ hasTable: flavor => flavor === 'зеленая груша' }), grouping());

    expect(ctx.hasTable('груша')).toBe(true);
  });

  it('миксы журнала => вкусы заменены именами групп', () => {
    const ctx = groupContext(context({ mixes: [tried('зеленая груша', 'сыр')] }), grouping());

    expect(ctx.mixes[0].items[0].flavors).toEqual(['груша']);
  });

  it('скрытый ключ с сырым вкусом => после группировки совпадает с ключом группы', () => {
    const ctx = groupContext(context({ rejected: [flavorKey(['сыр', 'зеленая груша'])] }), grouping());

    expect(ctx.rejected).toEqual([flavorKey(['сыр', 'груша'])]);
  });

  it('скрытый ключ с двумя вкусами одной группы => имя группы в ключе одно', () => {
    const ctx = groupContext(
      context({ rejected: [flavorKey(['сыр', 'груша', 'зеленая груша'])] }), grouping());

    expect(ctx.rejected).toEqual([flavorKey(['сыр', 'груша'])]);
  });

  it('уровни пар равны => стороны от пары, описанной с двух сторон', () => {
    const sides: Record<string, number> = { [pairKey('сыр', 'желтая груша')]: 2 };

    const ctx = groupContext(context({ sides: (a, b) => sides[pairKey(a, b)] ?? 1 }), grouping());

    expect(ctx.sides('сыр', 'груша')).toBe(2);
  });
});

describe('groupTest', () => {
  it('условие аромата по вкусу группы => группа подходит', () => {
    const test = groupTest(flavor => flavor === 'зеленая груша', grouping());

    expect(test('груша')).toBe(true);
  });
});

describe('withShelfJars', () => {
  it('карточка с эффективной банкой => показывает банку полки', () => {
    const shelf = [jar('j1', 'зеленая груша'), jar('j2', 'сыр')];
    const ctx = groupContext(context({ jars: shelf }), grouping());

    const result = withShelfJars(recommend({ jarCount: 2, risk: 'balanced', usePersonal: false }, ctx), shelf);

    expect(result.shelves[0].items[0].components.map(part => part.jar.flavors.join()).sort())
      .toEqual(['зеленая груша', 'сыр']);
  });
});

describe('подбор с группами', () => {
  it('две банки с вкусами одной группы => вместе не предлагаются', () => {
    const shelf = [jar('j1', 'груша'), jar('j2', 'зеленая груша'), jar('j3', 'сыр')];

    const shelfResult = pairs(2, groupContext(context({ jars: shelf }), grouping()));

    expect(shelfResult.items.some(item => item.jarIds.includes('j1') && item.jarIds.includes('j2'))).toBe(false);
  });

  it('две банки одной группы дают один и тот же микс => карточка одна', () => {
    const shelf = [jar('j1', 'груша'), jar('j2', 'зеленая груша'), jar('j3', 'сыр')];

    const shelfResult = pairs(2, groupContext(context({ jars: shelf }), grouping()));

    expect(shelfResult.items).toHaveLength(1);
    expect(shelfResult.hiddenRepeats).toBe(1);
  });

  it('попробован микс с зелёной грушей => микс с грушей уходит из выдачи', () => {
    const shelf = [jar('j1', 'груша'), jar('j2', 'сыр')];

    const shelfResult = pairs(2, groupContext(
      context({ jars: shelf, mixes: [tried('зеленая груша', 'сыр')] }), grouping()));

    expect(shelfResult.items).toEqual([]);
    expect(shelfResult.skippedTried).toBe(1);
  });

  it('банка из двух вкусов группы => её скрытый набор убирает карточку', () => {
    const shelf = [jar('j1', 'груша', 'зеленая груша'), jar('j2', 'сыр')];
    const key = shelfFlavorKey(['j1', 'j2'], shelf, knows);

    const shelfResult = pairs(2, groupContext(context({ jars: shelf, rejected: [key] }), grouping()));

    expect(shelfResult.items).toEqual([]);
    expect(shelfResult.skippedRejected).toBe(1);
  });

  it('оценка микса с зелёной грушей => переходит на группу', () => {
    const shelf = [jar('j1', 'груша'), jar('j2', 'сыр')];
    const ctx = groupContext(context({ jars: shelf, mixes: [tried('зеленая груша', 'мята')] }), grouping());

    const result = recommend({ jarCount: 2, risk: 'balanced', usePersonal: true }, ctx);

    expect(result.shelves[0].items[0].personal).toBeGreaterThan(0);
  });

  it('скрытый набор записан при группе => скрывает тот же микс после её удаления', () => {
    const shelf = [jar('j1', 'зеленая груша'), jar('j2', 'сыр')];
    const key = shelfFlavorKey(['j1', 'j2'], shelf, knows);

    const shelfResult = pairs(2, groupContext(
      context({ jars: shelf, rejected: [key] }), buildGrouping([], knows)));

    expect(shelfResult.items).toEqual([]);
    expect(shelfResult.skippedRejected).toBe(1);
  });
});
