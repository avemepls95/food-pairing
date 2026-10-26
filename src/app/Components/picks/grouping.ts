import { FlavorTest } from '../../Core/graph/aroma';
import { PairLevel } from '../../Core/graph/graph-data';
import { Grouping, Known } from '../../Core/library/flavor-group';
import { Jar } from '../../Core/library/jar';
import { PicksContext, PicksResult } from './recommendation';
import { flavorKey, LEVEL_WEIGHT } from './recommender';

type Level = (a: string, b: string) => PairLevel;
type Sides = (a: string, b: string) => number;
type CategoryOf = (flavor: string) => string | undefined;

const unique = (flavors: string[]) => Array.from(new Set(flavors));

/**
 * Банки с вкусами, заменёнными именами групп. Банка с грушей и зелёной грушей даёт один вкус.
 */
export function groupJars(jars: Jar[], g: Grouping): Jar[] {
  return jars.map(jar => ({ ...jar, flavors: unique(jar.flavors.map(flavor => g.nameOf(flavor))) }));
}

/**
 * Пара вкусов групп с самым сильным уровнем: ею группа и отвечает за уровень и стороны.
 * При равном уровне берётся пара, описанная большим числом сторон, иначе карточка получала бы
 * пометку «пар с одной стороны» при живой паре того же уровня с двумя.
 */
function strongest(a: string, b: string, g: Grouping, level: Level, sides: Sides):
  { level: PairLevel; a: string; b: string } {
  let found: { level: PairLevel; a: string; b: string } | undefined;

  g.flavorsOf(a).forEach(left => g.flavorsOf(b).forEach(right => {
    if (left === right) {
      return;
    }
    const current = level(left, right);
    const better = LEVEL_WEIGHT[current] > LEVEL_WEIGHT[found?.level ?? 'pale']
      || (!!found && LEVEL_WEIGHT[current] === LEVEL_WEIGHT[found.level]
        && sides(left, right) > sides(found.a, found.b));
    if (!found || better) {
      found = { level: current, a: left, b: right };
    }
  }));

  return found ?? { level: 'unknown', a, b };
}

/** Категория группы: самая частая среди вкусов, при равенстве от первого */
function groupCategory(name: string, g: Grouping, categoryOf: CategoryOf): string | undefined {
  const flavors = g.flavorsOf(name);
  const counts = new Map<string, number>();
  flavors.forEach(flavor => {
    const category = categoryOf(flavor);
    if (category) {
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
  });

  let top: string | undefined;
  flavors.forEach(flavor => {
    const category = categoryOf(flavor);
    if (category && (!top || (counts.get(category) ?? 0) > (counts.get(top) ?? 0))) {
      top = category;
    }
  });

  return top;
}

/**
 * Контекст подбора поверх групп: банки, журнал и скрытые наборы переведены на имена групп,
 * а вопросы про вкус группа решает через свои вкусы.
 */
export function groupContext(ctx: PicksContext, g: Grouping): PicksContext {
  return {
    ...ctx,
    jars: groupJars(ctx.jars, g),
    mixes: ctx.mixes.map(mix => ({
      ...mix,
      items: mix.items.map(item => ({ ...item, flavors: unique(item.flavors.map(flavor => g.nameOf(flavor))) }))
    })),
    // Имена справочника плюса не содержат, поэтому ключ разбирается обратно по нему.
    // Два вкуса одной группы дают одно имя, и повтор ключу не нужен
    rejected: ctx.rejected.map(key => flavorKey(unique(key.split('+').map(flavor => g.nameOf(flavor))))),
    level: (a, b) => strongest(a, b, g, ctx.level, ctx.sides).level,
    sides: (a, b) => {
      const found = strongest(a, b, g, ctx.level, ctx.sides);
      return ctx.sides(found.a, found.b);
    },
    categoryOf: name => groupCategory(name, g, ctx.categoryOf),
    knows: name => g.isGroup(name) || ctx.knows(name),
    hasTable: name => g.flavorsOf(name).some(flavor => ctx.hasTable(flavor))
  };
}

/** Условие аромата подходит группе, если подходит хотя бы один её вкус */
export function groupTest(test: FlavorTest, g: Grouping): FlavorTest {
  return name => g.flavorsOf(name).some(test);
}

/**
 * Сырые вкусы банок карточки. Их записывает «Больше не предлагать», поэтому запрет переживает
 * правку и удаление группы.
 */
export function shelfFlavorKey(jarIds: string[], jars: Jar[], knows: Known): string {
  const byId = new Map(jars.map(jar => [jar.id, jar]));
  const flavors = jarIds.flatMap(id => byId.get(id)?.flavors ?? []).filter(knows);

  return flavorKey(unique(flavors));
}

/** Возвращает в карточки банки полки: в выдаче они стоят эффективными */
export function withShelfJars(result: PicksResult, jars: Jar[]): PicksResult {
  const byId = new Map(jars.map(jar => [jar.id, jar]));

  return {
    ...result,
    shelves: result.shelves.map(shelf => ({
      ...shelf,
      items: shelf.items.map(item => ({
        ...item,
        components: item.components.map(part => ({ ...part, jar: byId.get(part.jar.id) ?? part.jar }))
      }))
    }))
  };
}
