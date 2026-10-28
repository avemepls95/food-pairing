import { FlavorTest } from '../../Core/graph/aroma';
import { FlavorRole, roleOfCategory } from '../../Core/graph/categories';
import { pairKey, PairLevel } from '../../Core/graph/graph-data';
import { Jar } from '../../Core/library/jar';
import { Mix, mixFlavors } from '../../Core/library/mix';
import {
  Affinity,
  MixComponent,
  PickShelf,
  PicksContext,
  PicksRequest,
  PicksResult,
  Recommendation,
  Risk,
  ScoreContext,
  ScoredPair
} from './recommendation';

export const LEVEL_WEIGHT: Record<PairLevel, number> = {
  red: 1,
  yellow: 0.78,
  green: 0.55,
  blue: 0.35,
  unknown: 0.12,
  pale: 0
};

export const RISK_GATE: Record<Risk, number> = {
  safe: LEVEL_WEIGHT.green,
  balanced: LEVEL_WEIGHT.blue,
  bold: LEVEL_WEIGHT.unknown
};

/**
 * Смелые миксы это не ослабленный порог, а свой набор: в миксе обязательно есть пара,
 * которую никто не измерял. Иначе режим показывал бы те же лучшие миксы, что и остальные:
 * они собраны из красных пар и проходят любой порог.
 */
const requiresUnknownPair = (risk: Risk) => risk === 'bold';

const STRUCTURE_PART = 0.12;
const PERSONAL_PART = 0.15;
/** Доля самой слабой пары в силе микса: остальное среднее по связям банок */
const WEAKEST_PART = 0.2;
/** Выше структура не поднимается: плюс за один акцент и плюс за разные категории */
const STRUCTURE_MAX = 0.75;
// Балл от 0 до 100 растянут между худшим и лучшим достижимым raw. Личные оценки в размах
// не входят: сто баллов это идеальный микс по таблицам, выше поднимать некуда
const RAW_MIN = -(STRUCTURE_PART + PERSONAL_PART);
const RAW_SPAN = (1 + STRUCTURE_PART * STRUCTURE_MAX) - RAW_MIN;

const ROLE_WEIGHT: Record<FlavorRole, number> = { base: 1, support: 0.6, accent: 0.35 };

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

const knownFlavors = (jar: Jar, ctx: ScoreContext) => jar.flavors.filter(flavor => ctx.knows(flavor));

/**
 * Пары вкусов, сгруппированные по связям банок. Состав одной банки выбрал производитель,
 * поэтому внутри банки пары не считаются, а общий вкус двух банок пары не даёт.
 */
export function crossPairGroups(jars: Jar[], ctx: ScoreContext): ScoredPair[][] {
  const groups: ScoredPair[][] = [];
  const flavors = jars.map(jar => knownFlavors(jar, ctx));

  for (let i = 0; i < flavors.length; i++) {
    for (let j = i + 1; j < flavors.length; j++) {
      const group: ScoredPair[] = [];
      for (const a of flavors[i]) {
        for (const b of flavors[j]) {
          if (a === b) continue;
          const level = ctx.level(a, b);
          group.push({ a, b, level, weight: LEVEL_WEIGHT[level], sides: ctx.sides(a, b) });
        }
      }
      if (group.length) {
        groups.push(group);
      }
    }
  }

  return groups;
}

export function crossPairs(jars: Jar[], ctx: ScoreContext): ScoredPair[] {
  return crossPairGroups(jars, ctx).flat();
}

/**
 * Композиция микса: есть ли тело, один ли акцент, насколько разные категории.
 * Телом работает любой вкус, кроме трав, специй и цветов: десертные и гастрономические
 * составы для кальяна такие же рабочие, как фруктовые.
 */
export function structureScore(flavors: string[], ctx: ScoreContext): number {
  const roles = flavors.map(flavor => roleOfCategory(ctx.categoryOf(flavor)));
  const accents = roles.filter(role => role === 'accent').length;
  const categories = new Set(flavors.map(flavor => ctx.categoryOf(flavor) ?? '')).size;

  let score = 0;
  if (accents === flavors.length) {
    score -= 0.5;
  }
  if (accents === 1) {
    score += 0.5;
  } else if (accents > 1) {
    score -= 0.2 * (accents - 1);
  }
  score += 0.25 * (categories - 1) / Math.max(1, flavors.length - 1);
  if (categories === 1 && flavors.length > 2) {
    score -= 0.3;
  }

  return clamp(score, -1, 1);
}

/**
 * Личные предпочтения по оценённым миксам. Делитель со сдвигом держит вкус с одной оценкой
 * близко к нулю.
 */
export function affinities(mixes: Mix[]): Affinity {
  const flavorStat = new Map<string, { sum: number; count: number }>();
  const pairStat = new Map<string, { sum: number; count: number }>();

  const add = (stat: Map<string, { sum: number; count: number }>, key: string, value: number) => {
    const current = stat.get(key) ?? { sum: 0, count: 0 };
    stat.set(key, { sum: current.sum + value, count: current.count + 1 });
  };

  mixes.forEach(mix => {
    if (mix.category !== 'tried' || !mix.rating) {
      return;
    }
    const value = (mix.rating - 3) / 2;
    const flavors = mixFlavors(mix);
    flavors.forEach(flavor => add(flavorStat, flavor, value));
    for (let i = 0; i < flavors.length; i++) {
      for (let j = i + 1; j < flavors.length; j++) {
        add(pairStat, pairKey(flavors[i], flavors[j]), value);
      }
    }
  });

  const shrink = (stat: Map<string, { sum: number; count: number }>) =>
    new Map(Array.from(stat, ([key, { sum, count }]) => [key, sum / (count + 2)]));

  return { flavor: shrink(flavorStat), pair: shrink(pairStat) };
}

export function personalScore(flavors: string[], pairs: ScoredPair[], affinity: Affinity | undefined): number {
  if (!affinity) {
    return 0;
  }
  const flavorValues = flavors.map(flavor => affinity.flavor.get(flavor) ?? 0);
  const pairValues = pairs
    .map(pair => affinity.pair.get(pairKey(pair.a, pair.b)))
    .filter((value): value is number => value !== undefined);

  const byFlavor = flavorValues.length ? mean(flavorValues) : 0;
  const byPair = pairs.length ? pairValues.reduce((sum, value) => sum + value, 0) / pairs.length : 0;

  return clamp(0.6 * byFlavor + 0.4 * byPair, -1, 1);
}

/**
 * Доли в чаше по ролям банок, шагом в пять процентов. Остаток от округления вниз уходит
 * тем, у кого дробная часть больше: иначе акцент терял свои проценты в пользу основы.
 */
export function shares(roles: FlavorRole[]): number[] {
  const total = roles.reduce((sum, role) => sum + ROLE_WEIGHT[role], 0);
  const exact = roles.map(role => ROLE_WEIGHT[role] / total * 20);
  const steps = exact.map(value => Math.floor(value));
  const left = 20 - steps.reduce((sum, step) => sum + step, 0);

  exact
    .map((value, index) => ({ index, rest: value - steps[index] }))
    .sort((a, b) => b.rest - a.rest || a.index - b.index)
    .slice(0, left)
    .forEach(({ index }) => steps[index]++);

  return steps.map(step => step * 5);
}

export function jarRole(jar: Jar, ctx: ScoreContext): FlavorRole {
  const roles = knownFlavors(jar, ctx).map(flavor => roleOfCategory(ctx.categoryOf(flavor)));
  if (!roles.length) {
    return 'support';
  }
  if (roles.every(role => role === 'accent')) {
    return 'accent';
  }
  return roles.includes('base') ? 'base' : 'support';
}

/**
 * Балл микса. Пустой список пар означает, что оценивать нечего: в банках не осталось
 * вкусов из справочника.
 */
export function scoreMix(jars: Jar[], ctx: ScoreContext): Recommendation | undefined {
  const groups = crossPairGroups(jars, ctx);
  const pairs = groups.flat();
  if (!pairs.length) {
    return undefined;
  }

  const weights = pairs.map(pair => pair.weight);
  // Среднее по связям банок: банка с тремя вкусами иначе перетягивала бы весь балл на себя
  const harmony = mean(groups.map(group => mean(group.map(pair => pair.weight))));
  const weakest = Math.min(...weights);
  const flavors = Array.from(new Set(jars.flatMap(jar => knownFlavors(jar, ctx))));
  const structure = structureScore(flavors, ctx);
  const personal = personalScore(flavors, pairs, ctx.affinity);
  // Слабая пара заметна даже в хорошем миксе, поэтому пятая часть балла идёт от неё
  const strength = WEAKEST_PART * weakest + (1 - WEAKEST_PART) * harmony;
  const raw = strength + STRUCTURE_PART * structure + PERSONAL_PART * personal;

  const roles = jars.map(jar => jarRole(jar, ctx));
  const parts = shares(roles);
  const components: MixComponent[] = jars.map((jar, index) => ({ jar, role: roles[index], share: parts[index] }));

  return {
    jarIds: jars.map(jar => jar.id),
    flavors,
    components,
    pairs,
    score: clamp(Math.round(100 * (raw - RAW_MIN) / RAW_SPAN), 0, 100),
    harmony,
    weakest,
    structure,
    personal,
    thinData: flavors.some(flavor => !ctx.hasTable(flavor)),
    oneSided: pairs.filter(pair => pair.sides < 2).length,
    repeat: false
  };
}

const RISK_ORDER: Risk[] = ['safe', 'balanced', 'bold'];
const DEFAULT_LIMIT = 6;
/** Сколько лучших по сочетаемости комбинаций доходит до полного балла */
const TOP_CANDIDATES = 200;
/** Ниже этого числа выдача выглядит пустой, поэтому повторы всё же идут в дело */
const MIN_CARDS = 3;
/** Карточек на странице выдачи: от него считается, как часто вкус может повторяться */
const CARDS_PER_PAGE = 6;

/** Ключ набора вкусов: по нему миксы сравниваются с журналом и со списком отклонённых */
export const flavorKey = (flavors: string[]) => [...flavors].sort().join('+');

interface JarEdge {
  /** Средний вес пар вкусов двух банок */
  mean: number;
  weakest: number;
  ok: boolean;
}

function jarEdges(jars: Jar[], ctx: ScoreContext, gate: number): JarEdge[][] {
  const flavors = jars.map(jar => jar.flavors.filter(flavor => ctx.knows(flavor)));
  const empty: JarEdge = { mean: 0, weakest: 0, ok: false };
  const edges: JarEdge[][] = jars.map(() => jars.map(() => empty));

  for (let i = 0; i < jars.length; i++) {
    for (let j = i + 1; j < jars.length; j++) {
      const shared = flavors[i].some(flavor => flavors[j].includes(flavor));
      let sum = 0;
      let count = 0;
      let weakest = 1;
      for (const a of flavors[i]) {
        for (const b of flavors[j]) {
          if (a === b) continue;
          const weight = LEVEL_WEIGHT[ctx.level(a, b)];
          sum += weight;
          count++;
          weakest = Math.min(weakest, weight);
        }
      }
      // Банки с общим вкусом вместе не предлагаем: "вишня и вишня с мятой" это не микс
      const edge: JarEdge = {
        mean: count ? sum / count : 0,
        weakest,
        ok: !shared && count > 0 && weakest >= gate
      };
      edges[i][j] = edge;
      edges[j][i] = edge;
    }
  }

  return edges;
}

/**
 * Перебор клик в графе банок. Полный балл клики стоит дорого, поэтому обход считает только
 * сочетаемость, а балл получают лучшие по ней. Каждый аромат должна закрыть хотя бы одна банка микса.
 */
function searchMixes(jarCount: number, gate: number, requireUnknown: boolean, aromas: FlavorTest[], ctx: PicksContext,
  scoreCtx: ScoreContext): { items: Recommendation[]; scored: number } {
  // Банки под аромат идут первыми: обход берёт кандидатов по возрастанию индекса, и когда
  // такие банки пройдены, остальные ветки отсекаются сразу
  const fitsAny = (jar: Jar) => aromas.some(test => knownFlavors(jar, scoreCtx).some(test));
  const jars = aromas.length
    ? [...ctx.jars.filter(fitsAny), ...ctx.jars.filter(jar => !fitsAny(jar))]
    : ctx.jars;
  const edges = jarEdges(jars, scoreCtx, gate);
  const fits = jars.map(jar => aromas.map(test => knownFlavors(jar, scoreCtx).some(test)));
  const allPairs = jarCount * (jarCount - 1) / 2;
  const top: { jars: Jar[]; harmony: number }[] = [];
  let scored = 0;

  const worst = () => (top.length < TOP_CANDIDATES ? -1 : top[top.length - 1].harmony);

  const keep = (chosen: number[], harmony: number) => {
    if (harmony <= worst()) {
      return;
    }
    top.push({ jars: chosen.map(index => jars[index]), harmony });
    top.sort((a, b) => b.harmony - a.harmony);
    if (top.length > TOP_CANDIDATES) {
      top.pop();
    }
  };

  const walk = (chosen: number[], candidates: number[], sum: number, count: number, weakest: number,
    missing: number[]): void => {
    if (chosen.length === jarCount) {
      if (missing.length || (requireUnknown && weakest > LEVEL_WEIGHT.unknown)) {
        return;
      }
      scored++;
      keep(chosen, sum / count);
      return;
    }
    const need = jarCount - chosen.length;
    for (let index = 0; index < candidates.length; index++) {
      if (candidates.length - index < need) {
        break;
      }
      const candidate = candidates[index];
      let nextSum = sum;
      let nextCount = count;
      let nextWeakest = weakest;
      for (const picked of chosen) {
        nextSum += edges[picked][candidate].mean;
        nextCount++;
        nextWeakest = Math.min(nextWeakest, edges[picked][candidate].weakest);
      }
      // Оптимистичная оценка: все недостающие связи по единице
      const taken = (chosen.length + 1) * chosen.length / 2;
      const rest = allPairs - taken;
      if ((nextSum + rest) / (nextCount + rest) <= worst()) {
        continue;
      }
      const nextMissing = missing.length ? missing.filter(aroma => !fits[candidate][aroma]) : missing;
      if (need === 1 && nextMissing.length) {
        continue;
      }
      const next: number[] = [];
      for (let other = index + 1; other < candidates.length; other++) {
        if (edges[candidate][candidates[other]].ok) {
          next.push(candidates[other]);
        }
      }
      // Аромат, которого нет ни в выбранных банках, ни среди кандидатов ветки, в ней уже не появится.
      // Граница по баллу такие ветки не режет: миксы без аромата бывают сильнее всего, что попало в топ
      if (nextMissing.some(aroma => !next.some(other => fits[other][aroma]))) {
        continue;
      }
      walk([...chosen, candidate], next, nextSum, nextCount, nextWeakest, nextMissing);
    }
  };

  walk([], jars.map((_, index) => index), 0, 0, 1, aromas.map((_, index) => index));

  const items = top
    .map(entry => scoreMix(entry.jars, scoreCtx))
    .filter((item): item is Recommendation => !!item)
    .sort((a, b) => b.score - a.score);

  return { items, scored };
}

/**
 * Карточки полки: без того, что уже лежит в журнале, без почти одинаковых миксов и без вкуса,
 * занявшего больше половины выдачи. Правила снимаются, если иначе карточек не хватает.
 */
function selectItems(candidates: Recommendation[], jarCount: number, limit: number, aromas: FlavorTest[],
  ctx: PicksContext):
  { items: Recommendation[]; skippedTried: number; skippedPlanned: number; skippedRejected: number;
    hiddenRepeats: number } {
  // Сравниваем миксы по известным вкусам: в банке может стоять вкус, пропавший из справочника,
  // а в баллах такого вкуса нет
  const keysOf = (category: Mix['category']) => new Set(ctx.mixes
    .filter(mix => mix.category === category)
    .map(mix => flavorKey(mixFlavors(mix).filter(flavor => ctx.knows(flavor)))));
  const triedKeys = keysOf('tried');
  const plannedKeys = keysOf('planned');

  const rejectedKeys = new Set(ctx.rejected);
  let skippedTried = 0;
  let skippedPlanned = 0;
  let skippedRejected = 0;
  const pool: Recommendation[] = [];
  candidates.forEach(item => {
    const key = flavorKey(item.flavors);
    if (rejectedKeys.has(key)) {
      skippedRejected++;
      return;
    }
    if (triedKeys.has(key)) {
      skippedTried++;
      return;
    }
    if (plannedKeys.has(key)) {
      skippedPlanned++;
      return;
    }
    pool.push(item);
  });

  // Вкус вроде сыра сочетается с доброй половиной справочника и без ограничения занимает
  // почти всю выдачу. Порог это равномерная раскладка вкусов полки по странице выдачи:
  // он не зависит от лимита, поэтому "Показать ещё" не перетряхивает уже показанное, и растёт
  // вместе с числом банок в миксе, иначе на миксах из четырёх банок карточек не набирается
  const shelfFlavors = new Set(ctx.jars.flatMap(jar => jar.flavors.filter(flavor => ctx.knows(flavor))));
  const flavorLimit = Math.max(2, Math.ceil(CARDS_PER_PAGE * jarCount / Math.max(1, shelfFlavors.size)));
  const limits = aromaLimits(aromas, flavorLimit, ctx);
  const limitOf = (flavor: string) => limits.get(flavor) ?? flavorLimit;
  const picked: Recommendation[] = [];
  const postponed: Recommendation[] = [];
  // Карточки с тем же набором вкусов, что у показанной: так выглядят две банки, которые
  // различаются только названием, и банки, чьи вкусы пользователь свёл в одну группу
  const sameFlavors: Recommendation[] = [];
  const seen = new Map<string, number>();
  const shown = new Set<string>();

  for (const item of pool) {
    const key = flavorKey(item.flavors);
    if (shown.has(key)) {
      sameFlavors.push(item);
      continue;
    }
    const tooClose = jarCount > 2 && picked.some(other =>
      other.jarIds.filter(id => item.jarIds.includes(id)).length >= jarCount - 1);
    const tooOften = item.flavors.some(flavor => (seen.get(flavor) ?? 0) >= limitOf(flavor));
    if (tooClose || tooOften) {
      postponed.push(item);
      continue;
    }
    picked.push(item);
    shown.add(key);
    item.flavors.forEach(flavor => seen.set(flavor, (seen.get(flavor) ?? 0) + 1));
    if (picked.length === limit) {
      break;
    }
  }

  // На первой странице отложенные добирают список только до минимума: набивать страницу
  // повторами того же вкуса хуже, чем показать меньше карточек. За "Показать ещё" пользователь
  // просит остальное сам, и повторы идут в дело с пометкой
  // Карточка с тем же набором вкусов на первой странице читается как дубль, поэтому её
  // достаёт только кнопка
  const tailTarget = limit > CARDS_PER_PAGE ? limit : MIN_CARDS;
  const hidden = postponed.concat(sameFlavors);
  const source = limit > CARDS_PER_PAGE ? hidden : postponed;
  const tail = source.slice(0, Math.max(0, tailTarget - picked.length))
    .map(item => ({ ...item, repeat: true }));
  const items = picked.concat(tail);

  return { items, skippedTried, skippedPlanned, skippedRejected, hiddenRepeats: hidden.length - tail.length };
}

/**
 * Вкус из фильтра аромата, который есть во всех подходящих банках, стоит в каждой карточке,
 * и ограничение его не касается. Несколько подходящих вкусов делят страницу поровну.
 */
function aromaLimits(aromas: FlavorTest[], flavorLimit: number, ctx: PicksContext): Map<string, number> {
  const limits = new Map<string, number>();
  aromas.forEach(test => {
    const fitting = ctx.jars
      .map(jar => jar.flavors.filter(flavor => ctx.knows(flavor) && test(flavor)))
      .filter(flavors => flavors.length);
    const matching = new Set(fitting.flat());
    matching.forEach(flavor => {
      const forced = fitting.every(flavors => flavors.includes(flavor));
      const limit = forced ? Infinity : Math.ceil(CARDS_PER_PAGE / matching.size);
      limits.set(flavor, Math.max(limits.get(flavor) ?? flavorLimit, limit));
    });
  });
  return limits;
}

function buildShelf(jarCount: number, risk: Risk, limit: number, aromas: FlavorTest[], ctx: PicksContext,
  scoreCtx: ScoreContext): PickShelf {
  const found: Recommendation[] = [];
  const seen = new Set<string>();
  let used = risk;
  let scored = 0;
  let selected = selectItems(found, jarCount, limit, aromas, ctx);

  for (const current of RISK_ORDER.slice(RISK_ORDER.indexOf(risk))) {
    const search = searchMixes(jarCount, RISK_GATE[current], requiresUnknownPair(current), aromas, ctx, scoreCtx);
    // Ослабление добавляет миксы к уже найденным: смелые это другой набор, и заменять им
    // красные пары нельзя
    search.items.forEach(item => {
      const key = item.jarIds.join('|');
      if (!seen.has(key)) {
        seen.add(key);
        found.push(item);
      }
    });
    found.sort((a, b) => b.score - a.score);
    scored += search.scored;
    used = current;
    // Считаем карточки, а не кандидатов: журнал и скрытые уходят из выдачи,
    // и без ослабления полка осталась бы пустой
    selected = selectItems(found, jarCount, limit, aromas, ctx);
    if (selected.items.length >= 3) {
      break;
    }
  }

  const { items, skippedTried, skippedPlanned, skippedRejected, hiddenRepeats } = selected;

  return {
    jarCount, items, risk: used, relaxed: used !== risk,
    skippedTried, skippedPlanned, skippedRejected, hiddenRepeats, scored
  };
}

export function recommend(request: PicksRequest, ctx: PicksContext): PicksResult {
  const affinity = request.usePersonal ? affinities(ctx.mixes) : undefined;
  const scoreCtx: ScoreContext = { ...ctx, affinity };
  const limit = request.limit ?? DEFAULT_LIMIT;
  const aromas = request.aromas ?? [];

  const counts = request.jarCount === 'any'
    ? [2, 3, 4, ...(ctx.jars.length >= 10 ? [5] : [])]
    : [request.jarCount];

  const shelves = counts
    .filter(jarCount => jarCount <= ctx.jars.length)
    .map(jarCount => buildShelf(jarCount, request.risk, limit, aromas, ctx, scoreCtx));

  return { shelves };
}
