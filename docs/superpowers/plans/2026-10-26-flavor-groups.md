# Группы вкусов: план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Пользователь складывает вкусы справочника в свои группы, и подбор считает вкусы одной группы
одним вкусом.

**Architecture:** Группа это запись библиотеки рядом с полкой и миксами. Чистый модуль
`Core/library/flavor-group.ts` строит две карты (вкус в имя группы, имя в вкусы), `Core/library/group-suggestions.ts`
собирает подсказки из справочника, `Components/picks/grouping.ts` надевает карты на контекст подбора
и подменяет банки эффективными. Сам `recommender.ts` не меняется. Окно групп это новый компонент
на странице подбора по образцу формы микса.

**Tech Stack:** Angular 19.2 standalone, vitest, localStorage, без бэкенда.

**Spec:** `docs/superpowers/specs/2026-10-26-flavor-groups-design.md`

## Global Constraints

- Коммиты только по явной просьбе пользователя (правило из CLAUDE.md). Шагов «Commit» в задачах нет,
  готовая работа схлопывается в один коммит, когда пользователь попросит.
- Тесты через vitest рядом с кодом в `*.spec.ts`, импорты из `'vitest'` явные. Запуск `npm test`.
  Имя теста в `it` на русском в формате «условие => результат».
- Названия методов без `Async`. Форматирование существующего кода не меняется.
- Комментарии только к неочевидному, без цифр, которых не измеряли.
- Новых стилей не добавляется там, где хватает существующих: `.dialog`, `.dialog-head`, `.dialog-body`,
  `.dialog-actions`, `.segmented`, `.flavor-chips`, `.flavor-chip`, `.btn`, `.icon-btn`, `.input`,
  `.section-label`, `.hint`.
- Ключ хранилища `food-pairing.library`, `STORAGE_VERSION` становится 3.
- Группа хранит минимум два вкуса. Имена сравниваются через `toKey` из `Core/graph/graph-data.ts`.
- Уровень пары с группой это максимум по `LEVEL_WEIGHT` из `recommender.ts`
  (красный 1, жёлтый 0.78, зелёный 0.55, синий 0.35, нет данных 0.12, бледный 0).
- Правило по слову даёт на текущем справочнике 15 подсказок, список по смыслу 14.

## Review Focus

- Группа, у которой ни один вкус не остался в справочнике: карты её не строят, банки работают
  по своим вкусам (тест в задаче 2).
- Имя группы, отличающееся регистром или пробелами от занятого («Груша» при свободной «груше»):
  считается занятым (задача 2).
- Мусор в `groups` файла копии: не массив, запись без вкусов, вкусы не строки. Хранилище остаётся
  рабочим, негодные записи считаются в `skipped` (задача 3).
- Группа из вкусов разных категорий, собранная руками: категория берётся по большинству, при равенстве
  от первого вкуса, от неё считаются роль банки и доли (задача 5).
- Скрытый набор, записанный при живой группе: после её удаления он продолжает скрывать тот же микс,
  потому что записаны сырые вкусы банок (задача 5).

---

### Task 1: Освободить имя `FlavorGroup`

**Files:**
- Modify: `src/app/Core/graph/graph-data.ts:54` (интерфейс), `:161` (`groupFlavors`)
- Modify: `src/app/Core/graph/graph-data.service.ts`, `src/app/Components/graph/graph.component.ts`,
  `src/app/Components/shelf/shelf.component.ts`, `src/app/Components/mix-form/mix-form.component.ts`,
  `src/app/Components/flavor-picker/flavor-picker.component.ts`,
  `src/app/Components/flavor-picker/flavor-filter.ts`, `src/app/Components/flavor-picker/flavor-filter.spec.ts`

**Interfaces:**
- Produces: `CategoryGroup { category: string; items: string[] }` в `Core/graph/graph-data.ts`,
  `groupFlavors(nodes: GraphNode[]): CategoryGroup[]`. Имя `FlavorGroup` свободно.

- [ ] **Шаг 1: Переименовать тип**

Механическая замена `FlavorGroup` на `CategoryGroup` в 9 файлах. Имена переменных, методов
(`grouped()`, `groups()`, `groupedProducts`) и шаблоны не трогать.

- [ ] **Шаг 2: Проверить**

Run: `npm test` и `npx ng build`
Expected: тесты проходят, сборка без ошибок.

---

### Task 2: Модель группы и карты подбора

**Files:**
- Create: `src/app/Core/library/flavor-group.ts`
- Create: `src/app/Core/library/flavor-group.spec.ts`

**Interfaces:**
- Consumes: `toKey` из `Core/graph/graph-data.ts`.
- Produces:

```ts
export interface FlavorGroup {
  id: string;
  /** Имя группы в выдаче */
  name: string;
  /** Вкусы справочника, минимум два; первый задаёт категорию при равенстве */
  flavors: string[];
}

/** Вкус есть в справочнике */
export type Known = (flavor: string) => boolean;

export interface Grouping {
  /** Имя группы вкуса или сам вкус */
  nameOf(flavor: string): string;
  /** Известные вкусы группы или сам вкус */
  flavorsOf(name: string): string[];
  isGroup(name: string): boolean;
}

/** Группы, где известных вкусов меньше двух, в карты не попадают */
export function buildGrouping(groups: FlavorGroup[], knows: Known): Grouping;

/** Чем занято имя: другой группой, вкусом справочника вне неё или ничем */
export function nameConflict(name: string, groups: FlavorGroup[], knows: Known, exceptId?: string):
  'group' | 'flavor' | undefined;
```

- [ ] **Шаг 1: Написать падающие тесты**

`flavor-group.spec.ts`, `describe('buildGrouping')` и `describe('nameConflict')`:

```ts
const knows = (flavor: string) => ['груша', 'желтая груша', 'зеленая груша', 'сыр'].includes(flavor);
const pear: FlavorGroup = { id: 'g1', name: 'груша', flavors: ['груша', 'желтая груша', 'зеленая груша'] };

it('вкус без группы => имя и вкусы это он сам', ...)        // nameOf('сыр') === 'сыр', flavorsOf('сыр') === ['сыр']
it('вкус группы => отдаёт имя группы', ...)                  // nameOf('зеленая груша') === 'груша'
it('имя группы => отдаёт её известные вкусы', ...)           // flavorsOf('груша') — три вкуса
it('вкус группы пропал из справочника => в вкусы группы не попадает', ...)
it('в группе остался один известный вкус => карты её не строят', ...)  // nameOf остаётся вкусом, isGroup false
it('ни одного вкуса группы нет в справочнике => карты её не строят', ...)
it('вкус в двух группах => остаётся в первой', ...)
it('имя занято другой группой => group', ...)
it('имя отличается регистром и пробелами => занято', ...)    // 'Груша ' при группе 'груша'
it('имя это свободный вкус справочника => flavor', ...)      // 'сыр' при группе без сыра
it('имя это вкус самой группы => свободно', ...)             // 'груша' для pear, exceptId 'g1'
```

- [ ] **Шаг 2: Убедиться, что тесты падают**

Run: `npm test`
Expected: FAIL, модуль не найден.

- [ ] **Шаг 3: Реализовать модуль**

`buildGrouping` строит `Map<вкус, имя>` и `Map<имя, вкусы>` за один проход: группа принимается,
если после отсева неизвестных вкусов и вкусов, уже занятых принятой группой, их осталось хотя бы два.
`nameConflict` сравнивает `toKey(name)` с именами групп (кроме `exceptId`) и, если имя знает справочник,
проверяет, лежит ли этот вкус в самой группе.

- [ ] **Шаг 4: Проверить**

Run: `npm test`
Expected: PASS.

---

### Task 3: Группы в хранилище

**Files:**
- Modify: `src/app/Core/library/library-data.ts`
- Modify: `src/app/Core/library/library-store.ts`
- Modify: `src/app/Core/library/library-store.spec.ts`
- Modify: `src/app/Components/mixes/mixes.component.ts:139-151`

**Interfaces:**
- Consumes: `FlavorGroup`, `nameConflict` из задачи 2.
- Produces:

```ts
export const STORAGE_VERSION = 3;
interface Library { jars: Jar[]; mixes: Mix[]; rejected: string[]; groups: FlavorGroup[] }
interface Backup { version: number; jars?: unknown; mixes?: unknown; rejected?: unknown; groups?: unknown }
interface ParsedBackup extends Library { skipped: number; mixesOnly: boolean; withGroups: boolean }

/** Разбирает список групп целиком: id, вкусы, занятые имена */
export function migrateGroups(raw: unknown, canonical: Canonical): FlavorGroup[];

// LibraryStore
groups(): FlavorGroup[];
saveGroup(group: FlavorGroup): void;   // по id, как saveJar
removeGroup(id: string): void;
```

- [ ] **Шаг 1: Написать падающие тесты**

В `library-store.spec.ts` новый `describe('migrateGroups')` и дополнения к `describe('parseBackup')`:

```ts
it('группа с вкусом из двух написаний => вкусы канонические и без повторов', ...)
it('группа без имени => пропускается', ...)
it('группа из одного вкуса => пропускается', ...)
it('groups не массив => групп нет, остальное читается', ...)
it('вкусы группы не строки => запись пропускается', ...)
it('вкус встретился в двух группах файла => остаётся в первой', ...)
it('имя второй группы совпадает с именем первой => вторая пропускается', ...)
it('имя группы это свободный вкус справочника => группа пропускается', ...)
it('негодные группы => попадают в skipped', ...)
it('файл версии 2 => mixesOnly false и withGroups false', ...)
it('файл версии 3 => withGroups true', ...)
it('файл версии 1 => mixesOnly true', ...)
```

- [ ] **Шаг 2: Убедиться, что тесты падают**

Run: `npm test`
Expected: FAIL.

- [ ] **Шаг 3: Реализовать разбор и хранение**

`migrateGroups` идёт по списку: не-объекты и записи без массива `flavors` отбрасываются, вкусы проходят
через `canonical(text) ?? text` и дедуплицируются, вкус из принятой ранее группы выбрасывается,
запись с пустым именем или меньше чем двумя вкусами отбрасывается, имя проверяется через `nameConflict`
по уже принятым группам с `knows = name => canonical(name) === name`, `id` выдаётся заново при повторе.
В `migrateLibrary` группы идут в `skipped` так же, как банки; `mixesOnly` становится `backup.version < 2`,
`withGroups` это `backup.version >= 3`. `readLibrary` при ошибке отдаёт `groups: []`.

- [ ] **Шаг 4: Загрузка файла в журнале миксов**

В `mixes.component.ts` из `parseBackup` берутся ещё `groups` и `withGroups`, вызов становится
`this.store.replaceAll({ jars, mixes, rejected, groups: withGroups ? groups : this.store.groups() })`.
Текст подтверждения замены не меняется.

- [ ] **Шаг 5: Проверить**

Run: `npm test` и `npx ng build`
Expected: PASS, сборка без ошибок. Старое хранилище версии 2 читается, группы пустые.

---

### Task 4: Подсказки групп

**Files:**
- Create: `src/app/Core/library/group-suggestions.ts`
- Create: `src/app/Core/library/group-suggestions.spec.ts`

**Interfaces:**
- Consumes: `CategoryGroup` из задачи 1, `FlavorGroup` и `nameConflict` из задачи 2.
- Produces:

```ts
export interface Suggestion {
  name: string;
  flavors: string[];
}

/** Вкусы одного смысла, которых не видно по названиям */
export const SAME_KIND: Suggestion[];

/** Подсказки по справочнику без тех, чьё имя или вкус уже заняты группой */
export function suggestGroups(categories: CategoryGroup[], groups: FlavorGroup[]): Suggestion[];
```

- [ ] **Шаг 1: Написать падающие тесты**

```ts
it('вкусы с общим последним словом в одной категории => подсказка', ...)   // груша, желтая груша, зеленая груша
it('общее слово в разных категориях => подсказок нет', ...)                // 'цветы апельсина' и 'апельсин'
it('общее слово у одного вкуса => подсказки нет', ...)                     // 'красная рыба' в Гастро
it('подсказка целиком входит в другую => остаётся одна с именем из списка по смыслу', ...)  // виски
it('подсказки пересекаются частично => остаются обе', ...)                 // чай и зеленый чай
it('вкус списка по смыслу пропал из справочника => остальные вкусы остаются', ...)
it('вкус подсказки уже в группе => подсказка пропадает', ...)
it('имя подсказки занято группой => подсказка пропадает', ...)
it('справочник целиком => 15 подсказок по слову', ...)                     // фикстура из products.json
```

- [ ] **Шаг 2: Убедиться, что тесты падают**

Run: `npm test`
Expected: FAIL.

- [ ] **Шаг 3: Записать список по смыслу**

```ts
export const SAME_KIND: Suggestion[] = [
  { name: 'сыр', flavors: ['сыр', 'горгонзола', 'рокфор', 'чеддер'] },
  { name: 'лосось', flavors: ['лосось', 'красная рыба'] },
  { name: 'говядина', flavors: ['говядина', 'стейк'] },
  { name: 'шоколад', flavors: ['какао', 'темный шоколад'] },
  { name: 'клубника', flavors: ['клубника', 'земляника'] },
  { name: 'мандарин', flavors: ['мандарин', 'танжерин'] },
  { name: 'грейпфрут', flavors: ['грейпфрут', 'грейпфрутовый сок'] },
  { name: 'персик', flavors: ['персик', 'нектарин'] },
  { name: 'огурец', flavors: ['огурец', 'огуречный сок'] },
  { name: 'зеленый чай', flavors: ['зеленый чай', 'сенча', 'матча'] },
  { name: 'коньяк', flavors: ['коньяк', 'бренди'] },
  { name: 'текила', flavors: ['текила', 'мескаль'] },
  { name: 'виски', flavors: ['виски', 'односолодовый виски', 'бурбон'] },
  { name: 'хвоя', flavors: ['сосна', 'пихта'] }
];
```

- [ ] **Шаг 4: Реализовать сборку**

Правило по слову: внутри каждой `CategoryGroup` вкусы раскладываются по последнему слову названия,
остаются корзины от двух вкусов, имя подсказки это само слово, вкусы отсортированы по числу слов,
затем по алфавиту. Список по смыслу фильтруется вкусами, которые есть в `categories`, и остаётся
при двух и больше вкусах. Подсказка, чьи вкусы целиком входят в другую, выбрасывается, остаётся
большая с именем из `SAME_KIND`, если она оттуда. Дальше отсев: подсказка уходит, если `nameConflict`
занял её имя или хотя бы один вкус уже лежит в группе пользователя. Порядок выдачи по имени,
`localeCompare` с 'ru'.

- [ ] **Шаг 5: Проверить**

Run: `npm test`
Expected: PASS, в том числе 15 подсказок по слову на полном справочнике.

---

### Task 5: Группы в подборе

**Files:**
- Create: `src/app/Components/picks/grouping.ts`
- Create: `src/app/Components/picks/grouping.spec.ts`

**Interfaces:**
- Consumes: `Grouping` из задачи 2, `PicksContext`, `PicksResult` из `recommendation.ts`,
  `LEVEL_WEIGHT` и `flavorKey` из `recommender.ts`, `FlavorTest` из `Core/graph/aroma.ts`.
- Produces:

```ts
/** Банки с вкусами, заменёнными именами групп, без повторов */
export function groupJars(jars: Jar[], g: Grouping): Jar[];

/** Контекст, который отвечает про группу через её вкусы */
export function groupContext(ctx: PicksContext, g: Grouping): PicksContext;

/** Условие аромата подходит группе, если подходит хотя бы один её вкус */
export function groupTest(test: FlavorTest, g: Grouping): FlavorTest;

/** Сырые вкусы банок карточки: их записывает «Больше не предлагать» */
export function shelfFlavorKey(jarIds: string[], jars: Jar[], knows: Known): string;

/** Возвращает в карточки банки полки вместо эффективных */
export function withShelfJars(result: PicksResult, jars: Jar[]): PicksResult;
```

- [ ] **Шаг 1: Написать падающие тесты**

```ts
it('банка с двумя вкусами одной группы => один эффективный вкус', ...)
it('уровень пары с группой => максимальный среди её вкусов', ...)      // красный при red и blue
it('стороны пары с группой => от пары, давшей уровень', ...)
it('пара двух групп => максимум по всем парам их вкусов', ...)
it('категория группы => самая частая среди вкусов', ...)
it('категории поровну => категория первого вкуса', ...)
it('hasTable группы => true, если таблица есть хотя бы у одного вкуса', ...)
it('миксы журнала => вкусы заменены именами групп', ...)
it('скрытый ключ с сырым вкусом => после группировки совпадает с ключом группы', ...)
it('условие аромата по вкусу группы => группа подходит', ...)
it('карточка с эффективной банкой => показывает банку полки', ...)
```

Три теста идут через настоящий `recommend` на полке из банок «сыр», «груша», «зелёная груша»
и группы `{груша, зелёная груша, жёлтая груша}`:

```ts
it('две банки с вкусами одной группы => вместе не предлагаются', ...)
it('попробован микс с зелёной грушей => микс с грушей уходит из выдачи', ...)
it('скрытый набор записан при группе => скрывает тот же микс после её удаления', ...)
```

- [ ] **Шаг 2: Убедиться, что тесты падают**

Run: `npm test`
Expected: FAIL.

- [ ] **Шаг 3: Реализовать модуль**

`groupContext` подменяет `jars` на `groupJars`, вкусы позиций `mixes` на `nameOf`, ключи `rejected`
на пересобранные (ключ режется по `'+'`, каждое имя через `nameOf`, снова `flavorKey`: имена справочника
плюса не содержат), а `level`, `sides`, `categoryOf`, `knows`, `hasTable` оборачивает. `level(a, b)`
перебирает `flavorsOf(a) × flavorsOf(b)`, пропускает одинаковые вкусы и берёт максимум по `LEVEL_WEIGHT`;
`sides` возвращает стороны той же пары. `categoryOf` имени группы считает категории её вкусов и берёт
самую частую, при равенстве от первого вкуса списка. `knows` для имени группы всегда true,
`hasTable` true при таблице хотя бы у одного вкуса.

- [ ] **Шаг 4: Проверить**

Run: `npm test`
Expected: PASS.

---

### Task 6: Окно групп

**Files:**
- Create: `src/app/Components/flavor-groups/flavor-groups.component.ts`,
  `flavor-groups.component.html`, `flavor-groups.component.css`
- Modify: `src/app/Components/flavor-picker/flavor-picker.component.ts`,
  `src/app/Components/flavor-picker/flavor-picker.component.html`

**Interfaces:**
- Consumes: `LibraryStore` (`groups`, `saveGroup`, `removeGroup`), `GraphDataService.grouped()`,
  `suggestGroups` и `Suggestion` из задачи 4, `nameConflict` из задачи 2.
- Produces:

```ts
export class FlavorGroupsComponent {
  /** Открывает окно */
  open(): void;
  /** Закрытие окна, если что-то менялось */
  changed = output<void>();
}
// app-flavor-picker получает новый необязательный вход
lockedBy = input<Record<string, string>>({});   // вкус -> имя группы, где он лежит
```

- [ ] **Шаг 1: Заблокированные вкусы в общем выборе**

В `flavor-picker.component.html` у `input[type=checkbox]` появляются `[disabled]="!!lockedBy()[item]"`
и `[title]`, текст вида `в группе «сыр»`. Полка и форма микса вход не передают, их поведение не меняется.

- [ ] **Шаг 2: Собрать окно**

`<dialog class="dialog">` по образцу `mix-form.component.html`: шапка с заголовком «Группы вкусов»
и крестиком, тело с прокруткой, `.dialog-actions` снизу. Внутри `.segmented` на две вкладки
«Подсказки» и «Мои группы» с числом записей; первой открывается «Мои группы», когда группы есть.

Вкладка подсказок: строка это `label` с галочкой, именем и вкусами в `.flavor-chips`; сверху галочка
«Выбрать все»; снизу кнопка «Добавить N групп», неактивная без отметок. Добавление создаёт группы
через `saveGroup` с `newId()` и переключает на вкладку своих групп.

Вкладка своих групп: строка это имя, вкусы чипами, кнопки правки и удаления (`.icon-btn`).
Кнопка «Собрать свою группу» и правка открывают форму в том же теле: `input.input` для имени
и `app-flavor-picker` с `lockedBy` из чужих групп. Сохранение неактивно, пока имя пустое, занято
(`nameConflict` с `exceptId` правимой группы) или вкусов меньше двух; занятое имя подписано под полем.

Ниже 780px тело окна прокручивается целиком одним блоком, `.dialog-actions` остаётся липким снизу,
как в форме микса.

- [ ] **Шаг 3: Проверить в браузере**

Run: `npx ng build`, затем страница подбора с временной кнопкой или через задачу 7.
Проверить: подсказки видны, добавление создаёт группы, правка и удаление работают, вкус чужой группы
недоступен в выборе, занятое имя не сохраняется, окно переживает перезагрузку страницы.

---

### Task 7: Группы на странице подбора

**Files:**
- Modify: `src/app/Components/picks/picks.component.ts`,
  `src/app/Components/picks/picks.component.html`,
  `src/app/Components/picks/picks.component.css`

**Interfaces:**
- Consumes: всё из задач 2, 5 и 6.

- [ ] **Шаг 1: Подключить окно**

В блок настроек под переключателем режима кнопка «Группы вкусов» с числом своих групп, рядом
`<app-flavor-groups>` с обработчиком `changed`, который перечитывает группы и пересчитывает выдачу.

- [ ] **Шаг 2: Пустить подбор через группы**

В `calculate()` перед вызовом: `const g = buildGrouping(this.store.groups(), flavor => !!this.data.node(flavor))`,
контекст оборачивается `groupContext`, условия аромата `groupTest`, результат `withShelfJars(result, this.jars)`.
`shelfFlavors` для фильтра аромата остаются сырыми.

- [ ] **Шаг 3: Сырой ключ в «Больше не предлагать»**

`reject(item)` записывает `shelfFlavorKey(item.jarIds, this.jars, flavor => !!this.data.node(flavor))`.

- [ ] **Шаг 4: Состав группы в подсказке пары**

Метод `pairTitle(pair)` собирает текст: состав группы для `pair.a` и `pair.b`, если это группы,
и строку «Пару описала только одна из двух таблиц» при `sides < 2`. В шаблоне `[title]` пары
берётся из него.

- [ ] **Шаг 5: Проверить в браузере**

Run: `npm test`, `npx ng build`, затем страница подбора на реальной полке.
Проверить: выдача до и после группы «груша» (миксы с зелёной и жёлтой грушей сходятся в один),
у чипа пары видно состав группы, «Больше не предлагать» скрывает микс и продолжает скрывать
после удаления группы, фильтр аромата находит группу по вкусу, выгрузка и загрузка файла
сохраняют группы, окно и выдача не ломаются на узком экране.
