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
// Балл показываем от 0 до 100, поэтому raw растягиваем между худшим и лучшим возможным
const RAW_MIN = -(STRUCTURE_PART + PERSONAL_PART);
const RAW_SPAN = (1 + STRUCTURE_PART + PERSONAL_PART) - RAW_MIN;

const ROLE_WEIGHT: Record<FlavorRole, number> = { base: 1, support: 0.6, accent: 0.35 };

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

const knownFlavors = (jar: Jar, ctx: ScoreContext) => jar.flavors.filter(flavor => ctx.knows(flavor));

/**
 * Пары вкусов из разных банок. Состав одной банки выбрал производитель, поэтому внутри банки
 * пары не считаются, а общий вкус двух банок пары не даёт.
 */
export function crossPairs(jars: Jar[], ctx: ScoreContext): ScoredPair[] {
  const pairs: ScoredPair[] = [];
  const flavors = jars.map(jar => knownFlavors(jar, ctx));

  for (let i = 0; i < flavors.length; i++) {
    for (let j = i + 1; j < flavors.length; j++) {
      for (const a of flavors[i]) {
        for (const b of flavors[j]) {
          if (a === b) continue;
          const level = ctx.level(a, b);
          pairs.push({ a, b, level, weight: LEVEL_WEIGHT[level] });
        }
      }
    }
  }

  return pairs;
}

/**
 * Композиция микса: есть ли тело, один ли акцент, насколько разные категории.
 */
export function structureScore(flavors: string[], ctx: ScoreContext): number {
  const roles = flavors.map(flavor => roleOfCategory(ctx.categoryOf(flavor)));
  const bases = roles.filter(role => role === 'base').length;
  const accents = roles.filter(role => role === 'accent').length;
  const categories = new Set(flavors.map(flavor => ctx.categoryOf(flavor) ?? '')).size;

  let score = 0;
  if (!bases) {
    score -= 0.8;
  }
  if (accents === 1) {
    score += 0.5;
  } else if (accents > 1) {
    score -= 0.4 * (accents - 1);
  }
  score += 0.25 * (categories - 1) / Math.max(1, flavors.length - 1);
  if (bases === flavors.length && flavors.length > 2) {
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
  const byPair = pairValues.length ? mean(pairValues) : 0;

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
  const roles = jar.flavors.map(flavor => roleOfCategory(ctx.categoryOf(flavor)));
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
  const pairs = crossPairs(jars, ctx);
  if (!pairs.length) {
    return undefined;
  }

  const weights = pairs.map(pair => pair.weight);
  const harmony = mean(weights);
  const weakest = Math.min(...weights);
  const flavors = Array.from(new Set(jars.flatMap(jar => knownFlavors(jar, ctx))));
  const structure = structureScore(flavors, ctx);
  const personal = personalScore(flavors, pairs, ctx.affinity);
  const raw = harmony + STRUCTURE_PART * structure + PERSONAL_PART * personal;

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
    planned: false
  };
}

const RISK_ORDER: Risk[] = ['safe', 'balanced', 'bold'];
const DEFAULT_LIMIT = 6;
/** Сколько лучших по сочетаемости комбинаций доходит до полного балла */
const TOP_CANDIDATES = 200;
/** Страховка от перебора на огромной полке */
const CLIQUE_BUDGET = 2_000_000;
/** Сколько карточек смотрим, выбирая число банок в режиме "Неважно" */
const CHOSEN_SAMPLE = 3;
const CHOSEN_GAP = 5;

const flavorKey = (flavors: string[]) => [...flavors].sort().join('+');

interface JarEdge {
  /** Сумма весов пар вкусов двух банок */
  sum: number;
  count: number;
  weakest: number;
  ok: boolean;
}

function jarEdges(jars: Jar[], ctx: ScoreContext, gate: number): { edges: JarEdge[][]; maxCount: number } {
  const flavors = jars.map(jar => jar.flavors.filter(flavor => ctx.knows(flavor)));
  const empty: JarEdge = { sum: 0, count: 0, weakest: 0, ok: false };
  const edges: JarEdge[][] = jars.map(() => jars.map(() => empty));
  let maxCount = 1;

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
      const edge: JarEdge = { sum, count, weakest, ok: !shared && count > 0 && weakest >= gate };
      edges[i][j] = edge;
      edges[j][i] = edge;
      maxCount = Math.max(maxCount, count);
    }
  }

  return { edges, maxCount };
}

/**
 * Перебор клик в графе банок. Полный балл клики стоит дорого, поэтому обход считает только
 * сочетаемость, а балл получают лучшие по ней.
 */
function searchMixes(jarCount: number, gate: number, requireUnknown: boolean, ctx: PicksContext, scoreCtx: ScoreContext):
  { items: Recommendation[]; total: number } {
  const jars = ctx.jars;
  const { edges, maxCount } = jarEdges(jars, scoreCtx, gate);
  const allPairs = jarCount * (jarCount - 1) / 2;
  const top: { jars: Jar[]; harmony: number }[] = [];
  let total = 0;

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

  const walk = (chosen: number[], candidates: number[], sum: number, count: number, weakest: number): void => {
    if (chosen.length === jarCount) {
      if (requireUnknown && weakest > LEVEL_WEIGHT.unknown) {
        return;
      }
      total++;
      keep(chosen, sum / count);
      return;
    }
    const need = jarCount - chosen.length;
    for (let index = 0; index < candidates.length; index++) {
      if (candidates.length - index < need || total >= CLIQUE_BUDGET) {
        break;
      }
      const candidate = candidates[index];
      let nextSum = sum;
      let nextCount = count;
      let nextWeakest = weakest;
      for (const picked of chosen) {
        nextSum += edges[picked][candidate].sum;
        nextCount += edges[picked][candidate].count;
        nextWeakest = Math.min(nextWeakest, edges[picked][candidate].weakest);
      }
      // Оптимистичная оценка: все недостающие пары по единице
      const taken = (chosen.length + 1) * chosen.length / 2;
      const rest = (allPairs - taken) * maxCount;
      if ((nextSum + rest) / (nextCount + rest) <= worst()) {
        continue;
      }
      const next: number[] = [];
      for (let other = index + 1; other < candidates.length; other++) {
        if (edges[candidate][candidates[other]].ok) {
          next.push(candidates[other]);
        }
      }
      walk([...chosen, candidate], next, nextSum, nextCount, nextWeakest);
    }
  };

  walk([], jars.map((_, index) => index), 0, 0, 1);

  const items = top
    .map(entry => scoreMix(entry.jars, scoreCtx))
    .filter((item): item is Recommendation => !!item)
    .sort((a, b) => b.score - a.score);

  return { items, total };
}

/**
 * Карточки полки: без уже попробованного, без почти одинаковых миксов и без вкуса,
 * занявшего больше половины выдачи. Правила снимаются, если иначе карточек не хватает.
 */
function selectItems(candidates: Recommendation[], jarCount: number, limit: number, ctx: PicksContext):
  { items: Recommendation[]; skippedTried: number } {
  // Сравниваем миксы по известным вкусам: в банке может стоять вкус, пропавший из справочника,
  // а в баллах такого вкуса нет
  const keysOf = (category: Mix['category']) => new Set(ctx.mixes
    .filter(mix => mix.category === category)
    .map(mix => flavorKey(mixFlavors(mix).filter(flavor => ctx.knows(flavor)))));
  const triedKeys = keysOf('tried');
  const plannedKeys = keysOf('planned');

  let skippedTried = 0;
  const pool: Recommendation[] = [];
  candidates.forEach(item => {
    const key = flavorKey(item.flavors);
    if (triedKeys.has(key)) {
      skippedTried++;
      return;
    }
    pool.push({ ...item, planned: plannedKeys.has(key) });
  });

  const pick = (nearRule: boolean, halfRule: boolean): Recommendation[] => {
    const picked: Recommendation[] = [];
    const seen = new Map<string, number>();
    const half = Math.floor(limit / 2);

    for (const item of pool) {
      const tooClose = nearRule && picked.some(other =>
        other.jarIds.filter(id => item.jarIds.includes(id)).length >= jarCount - 1);
      const tooOften = halfRule && item.flavors.some(flavor => (seen.get(flavor) ?? 0) >= half);
      if (tooClose || tooOften) {
        continue;
      }
      picked.push(item);
      item.flavors.forEach(flavor => seen.set(flavor, (seen.get(flavor) ?? 0) + 1));
      if (picked.length === limit) {
        break;
      }
    }
    return picked;
  };

  const attempts = [pick(jarCount > 2, true), pick(jarCount > 2, false), pick(false, false)];
  const items = attempts.find(attempt => attempt.length >= limit) ?? attempts[attempts.length - 1];

  return { items, skippedTried };
}

function buildShelf(jarCount: number, risk: Risk, limit: number, ctx: PicksContext, scoreCtx: ScoreContext): PickShelf {
  let used = risk;
  let found: Recommendation[] = [];
  let total = 0;

  for (const current of RISK_ORDER.slice(RISK_ORDER.indexOf(risk))) {
    const search = searchMixes(jarCount, RISK_GATE[current], requiresUnknownPair(current), ctx, scoreCtx);
    // Смелые это другой набор, а не более широкий, поэтому ослабление берём только когда
    // оно действительно добавляет карточки
    if (!found.length || search.items.length > found.length) {
      used = current;
      found = search.items;
      total = search.total;
    }
    if (found.length >= 3) {
      break;
    }
  }

  const { items, skippedTried } = selectItems(found, jarCount, limit, ctx);

  return { jarCount, items, risk: used, relaxed: used !== risk, skippedTried, total };
}

/** Наибольшее число банок, которое почти не проигрывает лучшему */
function chooseCount(shelves: PickShelf[]): number | undefined {
  const filled = shelves.filter(shelf => shelf.items.length);
  if (!filled.length) {
    return undefined;
  }
  const topScore = (shelf: PickShelf) => mean(shelf.items.slice(0, CHOSEN_SAMPLE).map(item => item.score));
  const best = Math.max(...filled.map(topScore));

  return filled.filter(shelf => topScore(shelf) >= best - CHOSEN_GAP).map(shelf => shelf.jarCount).at(-1);
}

export function recommend(request: PicksRequest, ctx: PicksContext): PicksResult {
  const affinity = request.usePersonal ? affinities(ctx.mixes) : undefined;
  const scoreCtx: ScoreContext = { ...ctx, affinity };
  const limit = request.limit ?? DEFAULT_LIMIT;

  const counts = request.jarCount === 'any'
    ? [2, 3, 4, ...(ctx.jars.length >= 10 ? [5] : [])]
    : [request.jarCount];

  const shelves = counts
    .filter(jarCount => jarCount <= ctx.jars.length)
    .map(jarCount => buildShelf(jarCount, request.risk, limit, ctx, scoreCtx));

  return { shelves, chosen: request.jarCount === 'any' ? chooseCount(shelves) : undefined };
}
