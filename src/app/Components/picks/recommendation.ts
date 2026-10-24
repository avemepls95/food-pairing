import { FlavorRole } from '../../Core/graph/categories';
import { PairLevel } from '../../Core/graph/graph-data';
import { Jar } from '../../Core/library/jar';
import { Mix } from '../../Core/library/mix';

/** Насколько слабые пары пускаем в микс */
export type Risk = 'safe' | 'balanced' | 'bold';

export interface ScoredPair {
  a: string;
  b: string;
  level: PairLevel;
  weight: number;
}

export interface MixComponent {
  jar: Jar;
  role: FlavorRole;
  /** Доля в чаше, проценты */
  share: number;
}

/** Личные предпочтения из оценённых миксов, от -1 до 1 */
export interface Affinity {
  flavor: Map<string, number>;
  pair: Map<string, number>;
}

export interface ScoreContext {
  level(a: string, b: string): PairLevel;
  categoryOf(flavor: string): string | undefined;
  /** Вкус есть в справочнике: пропавшие вкусы в подборе не участвуют */
  knows(flavor: string): boolean;
  hasTable(flavor: string): boolean;
  affinity?: Affinity;
}

export interface Recommendation {
  jarIds: string[];
  flavors: string[];
  components: MixComponent[];
  pairs: ScoredPair[];
  /** От 0 до 100 */
  score: number;
  harmony: number;
  weakest: number;
  structure: number;
  personal: number;
  /** Среди вкусов есть те, у кого нет своей таблицы */
  thinData: boolean;
  /** Такой же набор вкусов уже лежит в планах */
  planned: boolean;
}

export interface PickShelf {
  /** Сколько банок в миксах этой полки */
  jarCount: number;
  items: Recommendation[];
  /** На каком режиме нашлось: может быть слабее запрошенного */
  risk: Risk;
  relaxed: boolean;
  /** Сколько комбинаций выброшено как уже попробованные */
  skippedTried: number;
  /** Сколько комбинаций прошло гейт */
  total: number;
}

export interface PicksRequest {
  jarCount: number | 'any';
  risk: Risk;
  usePersonal: boolean;
  limit?: number;
}

export interface PicksContext extends ScoreContext {
  jars: Jar[];
  mixes: Mix[];
}

export interface PicksResult {
  shelves: PickShelf[];
  /** Какое число банок алгоритм выбрал сам */
  chosen: number | undefined;
}
