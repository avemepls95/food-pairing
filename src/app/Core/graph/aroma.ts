/**
 * Настроение микса: «десертное», «свежее». Вкус подходит, если он есть в списке
 * или его категория справочника есть в списке категорий.
 */
export interface Mood {
  id: string;
  label: string;
  categories?: string[];
  flavors?: string[];
}

// Категория берётся целиком, только когда она совпадает с настроением. В «Ягодах» справочника
// лежат арбуз, инжир и можжевельник, поэтому ягодное перечислено вкусами
export const MOODS: Mood[] = [
  {
    id: 'dessert',
    label: 'Десертное',
    categories: ['Десерт', 'Орехи'],
    flavors: ['ваниль', 'корица', 'кофе']
  },
  {
    id: 'fresh',
    label: 'Свежее',
    flavors: ['мята', 'перечная мята', 'мелисса', 'лемонграсс', 'эвкалипт', 'огурец', 'огуречный сок', 'арбуз',
      'лайм', 'кактус']
  },
  {
    id: 'sour',
    label: 'Кислое',
    flavors: ['лимон', 'лайм', 'грейпфрут', 'грейпфрутовый сок', 'юдзу', 'клюква', 'барбарис', 'брусника',
      'кислая вишня', 'красная смородина', 'черная смородина', 'облепиха', 'маракуйя', 'киви', 'зеленое яблоко',
      'гранат', 'кумкват']
  },
  {
    id: 'berry',
    label: 'Ягодное',
    flavors: ['малина', 'клубника', 'земляника', 'черника', 'ежевика', 'брусника', 'клюква', 'морошка', 'облепиха',
      'красная смородина', 'черная смородина', 'кислая вишня', 'сладкая вишня', 'барбарис', 'шиповник', 'годжи',
      'асаи', 'бойсенбери']
  },
  {
    id: 'citrus',
    label: 'Цитрусовое',
    categories: ['Цитрус']
  },
  {
    id: 'fruit',
    label: 'Фруктовое',
    categories: ['Фрукты'],
    flavors: ['виноград', 'темный виноград', 'светлый виноград', 'слива', 'хурма', 'инжир', 'канталуп', 'личи']
  },
  {
    id: 'tropical',
    label: 'Тропическое',
    flavors: ['ананас', 'манго', 'маракуйя', 'папайя', 'гуава', 'личи', 'питайя', 'рамбутан', 'мангостин',
      'карамбола', 'салак', 'марула', 'банан', 'кокос', 'кокосовая вода']
  },
  {
    id: 'spicy',
    label: 'Пряное',
    categories: ['Специи']
  },
  {
    id: 'herbal',
    label: 'Травяное',
    flavors: ['мята', 'перечная мята', 'мелисса', 'базилик', 'лавр', 'лемонграсс', 'розмарин', 'эстрагон', 'тимьян',
      'шалфей']
  },
  {
    id: 'conifer',
    label: 'Хвойное',
    flavors: ['пихта', 'сосна', 'елки', 'кипарис', 'можжевельник']
  },
  {
    id: 'floral',
    label: 'Цветочное',
    categories: ['Цветы'],
    flavors: ['лаванда', 'жасминовый чай']
  },
  {
    id: 'tea',
    label: 'Чайное',
    flavors: ['черный чай', 'зеленый чай', 'жасминовый чай', 'копченый черный чай', 'улун', 'сенча', 'матча', 'ройбуш']
  },
  {
    id: 'boozy',
    label: 'Алкогольное',
    flavors: ['ром', 'белый ром', 'темный ром', 'виски', 'односолодовый виски', 'бурбон', 'коньяк', 'бренди', 'джин',
      'водка', 'текила', 'мескаль', 'абсент', 'куантро', 'лимончелло', 'мараскино', 'шампанское', 'белое сухое вино',
      'красное сухое вино', 'портвейн', 'сидр', 'темное пиво']
  }
];

/** Что выбрано в фильтре аромата: настроение или конкретный вкус */
export type Aroma = { kind: 'mood'; id: string } | { kind: 'flavor'; name: string };

export type FlavorTest = (flavor: string) => boolean;

type CategoryOf = (flavor: string) => string | undefined;

export function moodById(id: string): Mood | undefined {
  return MOODS.find(mood => mood.id === id);
}

export function moodTest(mood: Mood, categoryOf: CategoryOf): FlavorTest {
  const flavors = new Set(mood.flavors);
  const categories = new Set(mood.categories);
  return flavor => flavors.has(flavor) || categories.has(categoryOf(flavor) ?? '');
}

/** Настроение, которого больше нет в списке, не подходит ни одному вкусу */
export function aromaTest(aroma: Aroma, categoryOf: CategoryOf): FlavorTest {
  if (aroma.kind === 'flavor') {
    return flavor => flavor === aroma.name;
  }
  const mood = moodById(aroma.id);
  return mood ? moodTest(mood, categoryOf) : () => false;
}

export function aromaLabel(aroma: Aroma): string {
  return aroma.kind === 'flavor' ? aroma.name : moodById(aroma.id)?.label ?? aroma.id;
}

export function sameAroma(a: Aroma, b: Aroma): boolean {
  return a.kind === 'flavor' ? b.kind === 'flavor' && a.name === b.name : b.kind === 'mood' && a.id === b.id;
}

/** Каждое условие выполняет хотя бы один вкус */
export function hasAromas(flavors: string[], tests: FlavorTest[]): boolean {
  return tests.every(test => flavors.some(test));
}

/** Настроения, которым подходит хотя бы один из вкусов */
export function availableMoods(flavors: string[], categoryOf: CategoryOf): Mood[] {
  return MOODS.filter(mood => flavors.some(moodTest(mood, categoryOf)));
}

/** Выбор из sessionStorage: записи чужого вида пропускаются */
export function parseAromas(json: string | null): Aroma[] {
  try {
    const value: unknown = JSON.parse(json ?? '[]');
    return Array.isArray(value) ? value.filter(isAroma) : [];
  } catch {
    return [];
  }
}

function isAroma(value: unknown): value is Aroma {
  const aroma = value as Partial<Record<'kind' | 'id' | 'name', unknown>> | null;
  if (aroma?.kind === 'mood') {
    return typeof aroma.id === 'string';
  }
  return aroma?.kind === 'flavor' && typeof aroma.name === 'string';
}
