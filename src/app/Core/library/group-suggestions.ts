import { CategoryGroup, toKey } from '../graph/graph-data';
import { FlavorGroup, nameConflict } from './flavor-group';

export interface Suggestion {
  name: string;
  flavors: string[];
}

/**
 * Вкусы одного смысла, которых не видно по названиям. Собран руками по справочнику.
 */
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

const lastWord = (flavor: string) => flavor.split(' ').at(-1) ?? flavor;

// Общее имя идёт первым: "груша" перед "жёлтой грушей"
const byLength = (a: string, b: string) =>
  a.split(' ').length - b.split(' ').length || a.localeCompare(b, 'ru');

/**
 * Вкусы одной категории с общим последним словом названия. Категория отсекает «цветы апельсина»
 * от апельсина и «огуречный сок» от грейпфрутового.
 */
export function wordSuggestions(categories: CategoryGroup[]): Suggestion[] {
  const found: Suggestion[] = [];

  categories.forEach(category => {
    const byWord = new Map<string, string[]>();
    category.items.forEach(item => {
      const word = lastWord(item);
      byWord.set(word, [...(byWord.get(word) ?? []), item]);
    });
    byWord.forEach((flavors, word) => {
      if (flavors.length > 1) {
        found.push({ name: word, flavors: [...flavors].sort(byLength) });
      }
    });
  });

  return found;
}

function kindSuggestions(known: Set<string>): Suggestion[] {
  return SAME_KIND
    .map(kind => ({ name: kind.name, flavors: kind.flavors.filter(flavor => known.has(flavor)) }))
    .filter(kind => kind.flavors.length > 1);
}

/**
 * Подсказки справочника без занятых. Подсказка, чьи вкусы целиком входят в другую, уступает ей:
 * виски с односолодовым входит в виски с бурбоном. Пересекающиеся частично остаются обе, иначе
 * чёрный и жасминовый чай уехали бы под именем зелёного.
 */
export function suggestGroups(categories: CategoryGroup[], groups: FlavorGroup[]): Suggestion[] {
  const known = new Set(categories.flatMap(category => category.items));
  const canonical = (text: string) => (known.has(text) ? text : undefined);
  const taken = new Set(groups.flatMap(group => group.flavors));
  // Список по смыслу идёт первым: при одинаковом составе имя берётся из него
  const all = [...kindSuggestions(known), ...wordSuggestions(categories)];
  const partOf = (item: Suggestion, other: Suggestion) =>
    item.flavors.every(flavor => other.flavors.includes(flavor));

  return all
    .filter((item, index) => !all.some((other, otherIndex) => otherIndex !== index && partOf(item, other)
      && (other.flavors.length > item.flavors.length || otherIndex < index)))
    .filter(item => !item.flavors.some(flavor => taken.has(flavor))
      && !nameConflict(item.name, item.flavors, groups, canonical))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

/**
 * Подсказки, которые можно добавить разом. Пересекающиеся подсказки существуют (чай делит
 * зелёный чай с одноимённой подсказкой), а вкус принадлежит одной группе, поэтому из пересечения
 * проходит первая.
 */
export function addableSuggestions(chosen: Suggestion[]): Suggestion[] {
  const kept: Suggestion[] = [];
  const taken = new Set<string>();
  const names = new Set<string>();

  chosen.forEach(item => {
    const busy = item.flavors.some(flavor => taken.has(flavor))
      || names.has(toKey(item.name)) || taken.has(item.name);
    if (busy) {
      return;
    }
    kept.push(item);
    item.flavors.forEach(flavor => taken.add(flavor));
    names.add(toKey(item.name));
  });

  return kept;
}
