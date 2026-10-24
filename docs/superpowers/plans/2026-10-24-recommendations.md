# Рекомендации миксов: план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Пользователь отмечает свои табаки, говорит, из скольких банок хочет микс, и получает ранжированные
миксы с долями, которые уходят в планы или в журнал попробованных.

**Architecture:** Граф и справочник переезжают в `Core/graph` и раздаются через сервис с кэшем.
Полка и миксы живут в одном хранилище `Core/library` с миграцией старого формата. Алгоритм подбора это
чистый модуль `Components/picks/recommender.ts` без Angular, на нём тесты. Интерфейс растёт на два раздела
в существующем стиле, выбор вкусов и форма микса выносятся в общие компоненты.

**Tech Stack:** Angular 19.2 (standalone, zoneless не используется), d3 7, vitest (добавляется), localStorage,
без бэкенда.

**Spec:** `docs/superpowers/specs/2026-10-23-recommendations-design.md`

## Global Constraints

- Коммиты только по явной просьбе пользователя (правило из CLAUDE.md). Шагов «Commit» в задачах нет,
  готовая работа схлопывается в один коммит, когда пользователь попросит. Коммит без упоминания исполнителя.
- Названия методов без `Async`. Primary constructors и `inject()` там, где уже так сделано.
- Форматирование существующего кода не меняется: скобки, переносы, порядок правил в css остаются как есть.
- Комментарии только к неочевидному, без цифр, которых не измеряли.
- Тесты через vitest, проверки через FluentAssertions-подобный стиль недоступны, используется `expect`.
  Имя теста: `{функция}_{ожидание}_{условие}` в описании `it`, текст на русском в формате «условие => результат».
- Бюджет сборки: один файл стилей компонента до 10 kB (`anyComponentStyle`), начальный бандл до 1 MB.
- Весы уровней: красный 1.0, жёлтый 0.78, зелёный 0.55, синий 0.35, нет данных 0.12, бледный 0.
- Гейты режимов: safe 0.55, balanced 0.35, bold 0.12.
- Нормировка балла: `балл = round(100 * (raw + 0.27) / 1.54)`, где `raw = harmony + 0.12 * structure + 0.15 * personal`.
- Веса ролей для долей: основа 1.0, дополнение 0.6, акцент 0.35. Округление до 5, остаток первой банке.
- Основа: Фрукты, Ягоды, Цитрус. Акцент: Специи, Травы, Цветы, Растения. Остальное дополнение.
- В полке выдачи 6 карточек, кнопка добавляет следующие 6.

## Review Focus

- Банка, все вкусы которой пропали из справочника: пар для оценки нет, среднее по пустому списку даёт NaN.
  Такой микс не должен попадать в выдачу (тест в задаче 5).
- Полка из нуля и одной банки: подбор показывает приглашение, а не пустой список и не падение (задача 8).
- Файл копии с мусором в `jars` (не массив, банка без `flavors`, вкусы не строки): хранилище остаётся рабочим,
  негодные записи пропускаются и считаются (задача 3).
- Все попробованные миксы с оценкой 1: `personal` отрицательный у всех вкусов, балл не уходит ниже нуля (задача 5).
- Миксы со старыми текстовыми вкусами, которых нет в справочнике: в личные оценки не попадают,
  форму микса не ломают (задачи 3 и 7).

---

### Task 1: Тестовый раннер

**Files:**
- Modify: `package.json`
- Modify: `.github/workflows/pages.yml`
- Create: `src/app/Core/graph/smoke.spec.ts` (удаляется в задаче 2, нужен только чтобы раннер было чем проверить)

**Interfaces:**
- Produces: команда `npm test` (`vitest run`), тесты лежат рядом с кодом в `*.spec.ts`, импорты из `'vitest'`
  явные, без глобалей.

- [ ] **Шаг 1: Поставить vitest**

Run: `npm install -D vitest`
Конфига не добавлять: обработка TypeScript через esbuild по умолчанию, окружение `node`, маска `**/*.spec.ts`
подходит. `tsconfig.app.json` собирает только `src/main.ts`, поэтому spec-файлы в сборку не попадут.

- [ ] **Шаг 2: Добавить скрипт**

В `package.json` в `scripts`: `"test": "vitest run"`.

- [ ] **Шаг 3: Проверить, что раннер видит тесты**

Создать `src/app/Core/graph/smoke.spec.ts` с одним `it('раннер работает => тест проходит')` и `expect(1).toBe(1)`.
Run: `npm test`
Expected: PASS, 1 test.

- [ ] **Шаг 4: Добавить тесты в CI**

В `.github/workflows/pages.yml` в job `build` после `npm ci` шаг `- run: npm test`.

---

### Task 2: Бледный уровень и перенос данных графа в Core

**Files:**
- Create: `src/app/Core/graph/graph-data.ts` (перенос `src/app/Components/graph/graph-data.ts` с правками)
- Create: `src/app/Core/graph/graph-data.spec.ts`
- Create: `src/app/Core/graph/categories.ts`
- Delete: `src/app/Components/graph/graph-data.ts`
- Delete: `src/app/Core/graph/smoke.spec.ts`
- Modify: `src/app/Components/graph/graph.component.ts` (импорт из Core, фильтр бледных связей)

**Interfaces:**
- Consumes: `npm test` из задачи 1.
- Produces:

```ts
export type Level = 'red' | 'yellow' | 'green' | 'blue' | 'pale';
/** Уровень пары, которой нет в таблицах */
export type PairLevel = Level | 'unknown';

export interface GraphNode { id: string; name: string; category: string; hasTable: boolean }
export interface GraphLink { source: string; target: string; value: Level }
export interface Graph { nodes: GraphNode[]; links: GraphLink[] }
/** Вкусы одной категории для списков выбора */
export interface FlavorGroup { category: string; items: string[] }

export function buildGraph(tables: PairingTable[], products: Product[]): Graph;
export function buildPairIndex(links: GraphLink[]): Map<string, Level>;
export function pairKey(a: string, b: string): string;
export function levelOf(index: Map<string, Level>, a: string, b: string): PairLevel;
export function toKey(text: string): string;
```

```ts
// categories.ts
export type FlavorRole = 'base' | 'support' | 'accent';
export function categoryColor(category: string): string;   // перенос CATEGORY_COLORS из graph.component.ts
export function roleOfCategory(category: string | undefined): FlavorRole;
```

- [ ] **Шаг 1: Написать падающие тесты**

`src/app/Core/graph/graph-data.spec.ts`, данные таблиц собираются в тесте руками (маленькие `PairingTable`):

```ts
it('пара бледная во всех таблицах => уровень pale', ...)
it('пара бледная в одной таблице и зелёная в другой => уровень green', ...)
it('бледная ячейка с именем, которого нет в справочнике => узла нет', ...)
it('цветная ячейка с именем, которого нет в справочнике => узел создаётся из текста', ...)
it('продукт со своей таблицей => hasTable true', ...)
it('продукт только из чужих ячеек => hasTable false', ...)
it('пары нет в таблицах => levelOf возвращает unknown', ...)
it('реальные данные => 190 узлов и 3873 бледные пары', ...)   // tables.json и products.json читаются через fs
```

Последний тест читает `public/data/*.json` через `node:fs`, чтобы зафиксировать числа из спецификации.

- [ ] **Шаг 2: Убедиться, что тесты падают**

Run: `npm test`
Expected: FAIL, `buildGraph` не экспортирует pale и hasTable.

- [ ] **Шаг 3: Перенести и доработать `graph-data.ts`**

Перенести файл в `src/app/Core/graph/`. Изменения:
- `levelByColor` получает `P: 'pale'`, `levelRank` получает `pale: 0`.
- `resolve` принимает признак «только из справочника»: для бледной ячейки имя, которого нет в справочнике,
  возвращает `undefined`, и ячейка пропускается без записи в консоль.
- Узел знает, была ли у продукта своя таблица: заголовки таблиц собираются до разбора ячеек.
- Пара с бледным и цветным уровнем остаётся цветной по уже существующему правилу максимума.

- [ ] **Шаг 4: Вынести цвета категорий и роли**

`categories.ts`: `CATEGORY_COLORS` и `DEFAULT_CATEGORY_COLOR` переезжают из `graph.component.ts`,
`roleOfCategory` возвращает роль по множествам из Global Constraints.

- [ ] **Шаг 5: Поправить страницу графа**

В `graph.component.ts`: импорт из `../../Core/graph/graph-data`, `getCategoryColor` делегирует в `categoryColor`,
тип фильтра `Record<Exclude<Level, 'pale'>, boolean>`, `shouldShowLink` возвращает `false` для `pale`.
Удалить `smoke.spec.ts`.

- [ ] **Шаг 6: Проверить**

Run: `npm test` (PASS), `npx ng build` (без ошибок).

---

### Task 3: Хранилище полки и миксов

**Files:**
- Create: `src/app/Core/library/id.ts`
- Create: `src/app/Core/library/jar.ts`
- Create: `src/app/Core/library/mix.ts` (перенос `Components/mixes/mix.ts` с новой моделью)
- Create: `src/app/Core/library/library-store.ts`
- Create: `src/app/Core/library/library-store.spec.ts`
- Delete: `src/app/Components/mixes/mix.ts`, `src/app/Components/mixes/mixes-store.ts`

**Interfaces:**
- Consumes: `toKey` из задачи 2.
- Produces:

```ts
// id.ts
export function newId(): string;                       // перенос newMixId вместе с комментарием про randomUUID

// jar.ts
export interface Jar { id: string; brand?: string; name?: string; flavors: string[] }
export function jarTitle(jar: Jar): string;            // name, иначе вкусы через ' + '

// mix.ts
export type MixCategory = 'tried' | 'planned';
export interface MixItem { jarId?: string; brand?: string; name?: string; flavors: string[]; share?: number }
export interface Mix { id: string; name?: string; items: MixItem[]; rating?: number; category: MixCategory; updatedAt: string }
export const MIX_MIN_ITEMS = 2;
export function isMixValid(mix: Mix): boolean;          // >= 2 позиций с непустыми flavors, tried требует rating
export function mixFlavors(mix: Mix): string[];         // плоский список вкусов без повторов
export function itemTitle(item: MixItem): string;

// library-store.ts
export interface ParsedBackup { jars: Jar[]; mixes: Mix[]; skipped: number; mixesOnly: boolean }
@Injectable({ providedIn: 'root' })
export class LibraryStore {
  jars(): Jar[];
  mixes(): Mix[];
  saveJar(jar: Jar): void;
  removeJar(id: string): void;
  saveMix(mix: Mix): void;
  removeMix(id: string): void;
  replaceAll(jars: Jar[], mixes: Mix[]): void;
  replaceMixes(mixes: Mix[]): void;
  toBackupJson(): string;
  parseBackup(json: string, canonical: (text: string) => string | undefined): ParsedBackup;
}
```

Ключ `food-pairing.library`, версия 2, поля `jars` и `mixes`. Разбор и миграция вынесены в экспортируемые
чистые функции, чтобы тесты не трогали localStorage:

```ts
export function migrateMix(raw: unknown, usedIds: Set<string>, canonical: (text: string) => string | undefined): Mix;
export function migrateJar(raw: unknown, usedIds: Set<string>): Jar | undefined;
export function readLibrary(storage: Pick<Storage, 'getItem'>, canonical: (text: string) => string | undefined): { jars: Jar[]; mixes: Mix[] };
```

- [ ] **Шаг 1: Написать падающие тесты**

```ts
it('старый ключ food-pairing.mixes => миксы переносятся в новый формат', ...)
it('старый микс с текстом "Кис. вишня" => вкус становится "кислая вишня"', ...)
it('старый микс с текстом, которого нет в справочнике => текст сохраняется как есть', ...)
it('микс с одной позицией => isMixValid false', ...)
it('попробованный микс без оценки => isMixValid false', ...)
it('файл версии 1 => mixesOnly true и банки не тронуты', ...)
it('файл версии 2 => заменяются и банки, и миксы', ...)
it('в jars лежит не массив => банки пустые, остальное читается', ...)
it('банка без вкусов => пропускается и считается в skipped', ...)
it('вкусы банки не строки => банка пропускается', ...)
it('доля вне диапазона 0..100 => поле share сбрасывается', ...)
it('хранилище бросает исключение на чтении => возвращается пустая библиотека', ...)
```

- [ ] **Шаг 2: Убедиться, что тесты падают**

Run: `npm test`
Expected: FAIL, модулей нет.

- [ ] **Шаг 3: Реализовать модели и хранилище**

`canonical` в хранилище приходит снаружи (его даёт сервис графа), чтобы `Core/library` не зависел от загрузки
json. Запись в localStorage обёрнута try/catch, как в текущем `MixesStore`, с тем же `alert` при отказе.
Файл выгрузки: `{ version: 2, jars, mixes }`.

- [ ] **Шаг 4: Проверить**

Run: `npm test`
Expected: PASS.

---

### Task 4: Сервис графа

**Files:**
- Create: `src/app/Core/graph/graph-data.service.ts`
- Modify: `src/app/Components/graph/graph.component.ts` (загрузка через сервис)

**Interfaces:**
- Consumes: `buildGraph`, `buildPairIndex`, `levelOf`, `toKey` из задачи 2.
- Produces:

```ts
@Injectable({ providedIn: 'root' })
export class GraphDataService {
  /** Один запрос на приложение, повторные вызовы отдают тот же промис */
  load(): Promise<Graph>;
  level(a: string, b: string): PairLevel;
  node(id: string): GraphNode | undefined;
  categoryOf(flavor: string): string | undefined;
  hasTable(flavor: string): boolean;
  canonical(text: string): string | undefined;        // по name и aliases через toKey
  grouped(): FlavorGroup[];                           // перенос groupProducts из graph.component.ts
}
```

- [ ] **Шаг 1: Реализовать сервис**

`load()` хранит промис в поле и отдаёт его при повторных вызовах. Остальные методы работают после `load()`
и до него возвращают пустые значения. Внутри индексы: `Map` по id узла, `Map` пар из `buildPairIndex`,
`Map` канонических имён по `toKey` из `products.json`.

- [ ] **Шаг 2: Перевести страницу графа на сервис**

Из `graph.component.ts` убрать `fetchJson`, `buildGraph` и `groupProducts`, вместо них `await service.load()`
и `service.grouped()`. Сообщение «Не удалось загрузить данные» остаётся.

- [ ] **Шаг 3: Проверить**

Run: `npx ng build`
Затем в браузере: граф рисуется, фильтры и поиск работают, в консоли нет ошибок.

---

### Task 5: Оценка микса

**Files:**
- Create: `src/app/Components/picks/recommendation.ts`
- Create: `src/app/Components/picks/recommender.ts`
- Create: `src/app/Components/picks/recommender.spec.ts`

**Interfaces:**
- Consumes: `Jar`, `Mix`, `mixFlavors` из задачи 3; `PairLevel`, `FlavorRole`, `roleOfCategory` из задачи 2.
- Produces:

```ts
// recommendation.ts
export type Risk = 'safe' | 'balanced' | 'bold';
export interface ScoredPair { a: string; b: string; level: PairLevel; weight: number }
export interface MixComponent { jar: Jar; role: FlavorRole; share: number }
export interface Recommendation {
  jarIds: string[];
  flavors: string[];
  components: MixComponent[];
  pairs: ScoredPair[];
  score: number;
  harmony: number;
  weakest: number;
  structure: number;
  personal: number;
  /** Среди вкусов есть те, у кого нет своей таблицы */
  thinData: boolean;
  planned: boolean;
}

// recommender.ts
export const LEVEL_WEIGHT: Record<PairLevel, number>;
export const RISK_GATE: Record<Risk, number>;
export interface Affinity { flavor: Map<string, number>; pair: Map<string, number> }
export interface ScoreContext {
  level(a: string, b: string): PairLevel;
  categoryOf(flavor: string): string | undefined;
  hasTable(flavor: string): boolean;
  affinity?: Affinity;
}
export function crossPairs(jars: Jar[], ctx: ScoreContext): ScoredPair[];
export function structureScore(flavors: string[], ctx: ScoreContext): number;
export function affinities(mixes: Mix[]): Affinity;
export function personalScore(flavors: string[], pairs: ScoredPair[], affinity: Affinity | undefined): number;
export function shares(roles: FlavorRole[]): number[];
export function jarRole(jar: Jar, ctx: ScoreContext): FlavorRole;
/** undefined, если оценивать нечего: нет пар вкусов из разных банок */
export function scoreMix(jars: Jar[], ctx: ScoreContext): Recommendation | undefined;
```

- [ ] **Шаг 1: Написать падающие тесты**

```ts
it('пара красного уровня => вес 1', ...)
it('пара без данных => вес 0.12', ...)
it('вкусы внутри одной банки => в пары не попадают', ...)
it('две банки с общим вкусом => пара вкуса с самим собой не появляется', ...)
it('основы нет => структура уходит в минус', ...)
it('один акцент => структура получает плюс 0.5 от правила акцента', ...)
it('два акцента => структура получает минус', ...)
it('три базовых вкуса без акцента => штраф за плоский состав', ...)
it('все пары красные => балл 82 без личных оценок', ...)
it('все пары синие => балл ниже, чем у красных', ...)
it('банка без вкусов из справочника => scoreMix возвращает undefined', ...)
it('вкус из микса с оценкой 5 => личная добавка положительная', ...)
it('вкус с одной оценкой 5 => добавка меньше, чем у вкуса с тремя такими оценками', ...)
it('все миксы с оценкой 1 => балл не ниже нуля', ...)
it('вкус без оценок => личная добавка ноль', ...)
it('основа и акцент => доли 75 и 25', ...)
it('основа, дополнение и акцент => доли 50, 30 и 20', ...)
it('две основы => доли 50 и 50', ...)
it('любой состав => сумма долей 100', ...)
it('банка со вкусом без своей таблицы => thinData true', ...)
```

Значение 82 это `round(100 * (1 + 0.27) / 1.54)` при `harmony = 1`, `structure = 0` и `personal = 0`.
Состав для этого теста подбирается так, чтобы структура вышла нулевой, иначе балл будет другим.

- [ ] **Шаг 2: Убедиться, что тесты падают**

Run: `npm test`
Expected: FAIL.

- [ ] **Шаг 3: Реализовать оценку**

Формулы и константы из Global Constraints. `affinities` считает по миксам категории `tried` с оценкой:
`(rating - 3) / 2`, сумма делится на число миксов плюс 2. Ключ пары через `pairKey`.
`personalScore` это `0.6 * среднее по вкусам + 0.4 * среднее по парам, у которых есть данные`;
без данных слагаемое ноль, без `affinity` результат ноль. Балл зажимается в 0..100.

- [ ] **Шаг 4: Проверить**

Run: `npm test`
Expected: PASS.

---

### Task 6: Поиск миксов

**Files:**
- Modify: `src/app/Components/picks/recommender.ts`
- Modify: `src/app/Components/picks/recommendation.ts`
- Modify: `src/app/Components/picks/recommender.spec.ts`

**Interfaces:**
- Consumes: всё из задачи 5.
- Produces:

```ts
export interface PickShelf {
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
export interface PicksRequest { jarCount: number | 'any'; risk: Risk; usePersonal: boolean; limit?: number }
export interface PicksContext extends ScoreContext { jars: Jar[]; mixes: Mix[] }
export interface PicksResult { shelves: PickShelf[]; chosen: number | undefined }
export function recommend(request: PicksRequest, ctx: PicksContext): PicksResult;
```

- [ ] **Шаг 1: Написать падающие тесты**

```ts
it('бледная пара => банки не соединяются ни на одном режиме', ...)
it('банки с общим вкусом => вместе не предлагаются', ...)
it('режим safe => пары слабее зелёного не проходят', ...)
it('гейт прошло меньше трёх миксов => режим ослабляется и relaxed true', ...)
it('на самом свободном режиме пусто => полка без карточек и total 0', ...)
it('набор вкусов совпал с попробованным миксом => в выдачу не попадает и считается в skippedTried', ...)
it('набор вкусов совпал с запланированным миксом => остаётся с planned true', ...)
it('три банки, кандидат отличается одной банкой от выбранного => пропускается', ...)
it('две банки, кандидаты делят одну банку => оба остаются в выдаче', ...)
it('вкус встречается больше чем в половине карточек => лишние пропускаются', ...)
it('после фильтров карточек меньше шести => правила разнообразия снимаются', ...)
it('запрошено 3 банки => в результате одна полка с jarCount 3', ...)
it('jarCount any => полки от 2 до 4 при полке меньше 10 банок', ...)
it('jarCount any и полка от 10 банок => появляется полка на 5 банок', ...)
it('jarCount any => chosen это наибольшее k в пределах 5 баллов от лучшего', ...)
it('usePersonal false => личные оценки не влияют на порядок', ...)
it('limit 2 => в полке 2 карточки', ...)
it('полка из одной банки => полок нет', ...)
```

- [ ] **Шаг 2: Убедиться, что тесты падают**

Run: `npm test`
Expected: FAIL, `recommend` не определён.

- [ ] **Шаг 3: Реализовать поиск**

Смежность банок: минимальный вес пар их вкусов не ниже гейта, общих вкусов нет.
Обход в глубину по кликам, кандидаты только смежные со всеми выбранными, индексы по возрастанию.
Отсечение: если при весе 1.0 у всех недостающих пар `harmony` не превысит худший из топа, ветка бросается.
Топ держится в 60 записях. Поддерживается k от 2 до 6.

Сборка выдачи по порядку из спецификации: выброс попробованных, пометка запланированных, правило
«отличается одной банкой» при k от трёх, правило «не больше половины карточек на один вкус»,
снятие правил при нехватке карточек (сначала правило половины, затем правило одной банки).

Ослабление: при менее трёх прошедших миксах гейт опускается на следующий режим, до `bold` включительно.

Режим `any`: считаются k от 2 до 4, плюс 5 при полке от 10 банок. `chosen` это наибольшее k, у которого
среднее трёх лучших карточек отстаёт от лучшего k не больше чем на 5 баллов.

- [ ] **Шаг 4: Проверить**

Run: `npm test`
Expected: PASS.

- [ ] **Шаг 5: Замерить на реальной полке**

Временный скрипт в папке scratchpad: полка из 40 банок случайными вкусами справочника, `recommend` для k
от 2 до 6 на режиме `bold`. Ожидание: каждый вызов быстрее 1 секунды. Скрипт не коммитится.

---

### Task 7: Общий выбор вкусов и общая форма микса

**Files:**
- Create: `src/app/Components/flavor-picker/flavor-picker.component.ts|.html|.css`
- Create: `src/app/Components/flavor-picker/flavor-filter.ts`
- Create: `src/app/Components/flavor-picker/flavor-filter.spec.ts`
- Create: `src/app/Components/mix-form/mix-form.component.ts|.html|.css`
- Modify: `src/app/Components/graph/graph.component.html|.ts|.css` (выбор вкусов через общий компонент)
- Modify: `src/app/Components/mixes/mixes.component.ts|.html|.css` (форма через общий компонент, новая модель)

**Interfaces:**
- Consumes: `GraphDataService` (задача 4), `LibraryStore`, `Mix`, `MixItem`, `isMixValid` (задача 3).
- Produces:

```ts
// flavor-filter.ts  (FlavorGroup берётся из Core/graph/graph-data)
export function filterGroups(groups: FlavorGroup[], term: string): FlavorGroup[];   // перенос filteredGroups
export function toSearchKey(text: string): string;

// flavor-picker.component.ts
@Component({ selector: 'app-flavor-picker' })
export class FlavorPickerComponent {
  groups = input.required<FlavorGroup[]>();
  selected = input.required<string[]>();
  toggled = output<string>();
}

// mix-form.component.ts  (диалог, переезд из mixes.component)
@Component({ selector: 'app-mix-form' })
export class MixFormComponent {
  open(draft: Mix, isNew: boolean): void;
  saved = output<Mix>();
}
```

- [ ] **Шаг 1: Написать падающий тест на фильтр поиска**

```ts
it('поиск по части названия => группы с подходящими вкусами', ...)
it('поиск по названию категории => вся категория', ...)
it('ё в запросе => находит вкус с е', ...)
it('пустой запрос => все группы без изменений', ...)
```

- [ ] **Шаг 2: Убедиться, что тест падает**

Run: `npm test`
Expected: FAIL.

- [ ] **Шаг 3: Собрать `flavor-picker`**

Разметка: поиск и список по категориям с чекбоксами, перенос блока `section.products` из
`graph.component.html`. Стили `.products`, `.product-list`, `.category-title`, `.product-items`,
`.product-item` переезжают в css компонента, из `graph.component.css` удаляются вместе с упоминаниями
в сгруппированных правилах `:hover` и `:active`. Цвет точки категории через `categoryColor`.

- [ ] **Шаг 4: Перевести граф на общий компонент**

В `graph.component.html` вместо блока продуктов `<app-flavor-picker>` с группами из сервиса,
выбранными продуктами и обработчиком `toggleProductSelection`.

- [ ] **Шаг 5: Вынести форму микса**

Диалог целиком переезжает из `mixes.component.html` в `mix-form.component.html` вместе со стилями диалога,
логикой закрытия по фону, `addItem`, `removeItem`, `setCategory`, `draftValid`, `draftProblem`.
Строка состава меняется под новую модель: бренд, название, вкусы чипами с кнопкой «Выбрать вкусы»
(открывает `app-flavor-picker` внутри диалога), поле доли в процентах. Вкус, которого нет в справочнике,
показывается чипом с пометкой и только удаляется. `draftProblem` получает случай «нужна хотя бы одна
позиция со вкусом».

- [ ] **Шаг 6: Перевести страницу миксов на новую модель**

`mixes.component.ts`: `MixesStore` заменяется на `LibraryStore`, `mix.items[].flavor` на `flavors`,
шаблон `flavorList` печатает `itemTitle`, доли показываются в карточке, если заданы.

- [ ] **Шаг 7: Проверить**

Run: `npm test` (PASS), `npx ng build` (без ошибок).
В браузере: страница миксов открывается, старый микс из localStorage читается, форма сохраняет микс
с вкусами из справочника и с долями.

---

### Task 8: Страница полки

**Files:**
- Create: `src/app/Components/shelf/shelf.component.ts|.html|.css`
- Modify: `src/app/app.routes.ts`
- Modify: `src/app/Components/nav/nav.component.ts`

**Interfaces:**
- Consumes: `LibraryStore`, `GraphDataService`, `FlavorPickerComponent`, `jarTitle`, `newId`.
- Produces: маршрут `shelf`, в навигации четыре раздела: Граф, Полка, Подбор, Миксы.

- [ ] **Шаг 1: Собрать страницу**

Сверху `app-flavor-picker` по всем вкусам справочника: отметка создаёт банку с одним вкусом, снятие удаляет
банку, если бренд, название и второй вкус у неё не заполнены. Ниже список банок карточками: бренд, название,
вкусы чипами, кнопки правки и удаления. Диалог банки: бренд, название, выбор вкусов. Строка состояния:
число банок и вкусов. Пустое состояние с подсказкой.

- [ ] **Шаг 2: Добавить маршрут и навигацию**

`app.routes.ts`: путь `shelf`, заголовок «Полка - сочетания вкусов», ленивый `loadComponent`.
`nav.component.ts`: четыре ссылки, ширина `.nav` под четыре раздела.

- [ ] **Шаг 3: Проверить**

Run: `npx ng build`
В браузере: отметить вкус, он появился банкой; изменить бренд и название; снять галочку с нетронутой банки,
она исчезла; отметить вкус у банки с брендом, галочка не удаляет её; перезагрузить страницу, полка на месте.

---

### Task 9: Страница подбора

**Files:**
- Create: `src/app/Components/picks/picks.component.ts|.html|.css`
- Modify: `src/app/app.routes.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: `recommend`, `PicksRequest`, `PickShelf` (задачи 5 и 6), `LibraryStore`, `GraphDataService`,
  `MixFormComponent`.

- [ ] **Шаг 1: Собрать страницу**

Пустая полка: приглашение со ссылкой на полку. Полка из одной банки: подсказка, что нужна вторая.

Вопрос «Сколько банок в миксе?» кнопками 2, 3, 4, 5 и «Неважно». После ответа переключатель остаётся сверху,
ответ хранится в `localStorage` под ключом `food-pairing.picks-settings` вместе с режимом риска.
Режим риска сегментированным переключателем, по умолчанию «Сбалансированные». Переключатель личных оценок
виден, когда есть хотя бы один оценённый микс, и включён.

Карточка микса: заголовок из названий банок, балл, строка причины, состав по строкам (доля, роль, бренд,
название, вкусы), пары чипами класса `level-{уровень}` и серым для `unknown`, пометки «мало данных»
и «в планах», кнопки «В планы» и «Попробовал».

Строка причины собирается из данных карточки: самое сильное в ней («все пары красные», «пара вишня и базилик
красная»), роль акцента, если он один, и упоминание личных оценок, если `personal` выше нуля.

«В планы» сохраняет микс категории `planned` с составом и долями. «Попробовал» открывает `app-mix-form`
с заполненным составом, долями и категорией `tried`, с пустыми оценкой и названием.

Пересчёт при смене ответа, режима или полки. Подбор запускается вне проверки изменений и показывает
«Считаю...», пока идёт.

- [ ] **Шаг 2: Добавить маршрут**

`app.routes.ts`: путь `picks`, заголовок «Подбор миксов - сочетания вкусов».

- [ ] **Шаг 3: Обновить README**

Раздел про страницы получает Полку и Подбор, раздел про данные получает описание бледного уровня
и ключа `food-pairing.library`. Абзац про хранение в localStorage упоминает, что полка лежит там же
и попадает в тот же файл копии.

- [ ] **Шаг 4: Проверить**

Run: `npm test` (PASS), `npx ng build` (без ошибок).
В браузере, на полке из десятка банок: ответить «3», получить карточки; переключить на «Неважно»,
получить полки на 2, 3, 4 банки; отправить микс в планы и увидеть его на странице миксов; нажать
«Попробовал», поставить оценку, сохранить; вернуться в подбор и увидеть, что этот микс из выдачи ушёл;
переключить режим на «Проверенные» и убедиться, что при пустой выдаче написано про ослабление требований.
Консоль и сеть без ошибок, вид на ширине телефона не ломается.
