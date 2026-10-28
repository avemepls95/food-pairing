import { FlavorTest } from '../../Core/graph/aroma';
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
  /** Сколько сторон описали пару: один продукт из пары или оба */
  sides: number;
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
  /** Уровень пары по согласию сторон */
  level(a: string, b: string): PairLevel;
  /** Сколько продуктов пары описали её своей таблицей */
  sides(a: string, b: string): number;
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
  /** Сколько пар описаны только одной стороной */
  oneSided: number;
  /** Карточка повторяет вкусы тех, что выше, и добрана, чтобы выдача не выродилась */
  repeat: boolean;
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
  /** Сколько комбинаций выброшено, потому что уже лежат в планах */
  skippedPlanned: number;
  /** Сколько комбинаций скрыто самим пользователем */
  skippedRejected: number;
  /** Сколько миксов не показано, потому что повторяют уже показанные вкусы */
  hiddenRepeats: number;
  /** Сколько комбинаций дошло до оценки: ветки, отсечённые по оценке, сюда не попадают */
  scored: number;
}

export interface PicksRequest {
  jarCount: number | 'any';
  risk: Risk;
  usePersonal: boolean;
  limit?: number;
  /** Фильтр аромата: каждое условие выполняет хотя бы один вкус микса */
  aromas?: FlavorTest[];
}

export interface PicksContext extends ScoreContext {
  jars: Jar[];
  mixes: Mix[];
  /** Ключи наборов вкусов, отклонённых пользователем */
  rejected: string[];
}

export interface PicksResult {
  shelves: PickShelf[];
}
