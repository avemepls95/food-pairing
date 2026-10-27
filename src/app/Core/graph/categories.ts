/** Роль вкуса в миксе: тело, поддержка, яркая добавка небольшой долей */
export type FlavorRole = 'base' | 'support' | 'accent';

/**
 * Печатные краски категорий. Светлота подобрана так, чтобы узел читался и на чернильном
 * фоне тёмной темы, и на бумаге светлой: контраст с обоими фонами не ниже 3:1. Поэтому
 * яркие цвета уровня пары сюда не попадают - по цвету видно, что речь о продукте, а не о связи.
 */
const CATEGORY_COLORS: Record<string, string> = {
  'Ягоды': '#d02b4c',
  'Цитрус': '#9a830c',
  'Фрукты': '#9f4f08',
  'Травы': '#308f3f',
  'Специи': '#b17269',
  'Орехи': '#716146',
  'Гастро': '#7e80a9',
  'Напитки': '#2674b9',
  'Десерт': '#b96996',
  'Цветы': '#b234b2',
  'Растения': '#1c756a',
  'Овощи': '#576d1d',
  'Без категории': '#76736c'
};

const DEFAULT_CATEGORY_COLOR = '#76736c';

const BASE_CATEGORIES = new Set(['Фрукты', 'Ягоды', 'Цитрус']);
const ACCENT_CATEGORIES = new Set(['Специи', 'Травы', 'Цветы', 'Растения']);

export function categoryColor(category: string): string {
  return CATEGORY_COLORS[category] ?? DEFAULT_CATEGORY_COLOR;
}

export function roleOfCategory(category: string | undefined): FlavorRole {
  if (!category) {
    return 'support';
  }
  if (BASE_CATEGORIES.has(category)) {
    return 'base';
  }
  return ACCENT_CATEGORIES.has(category) ? 'accent' : 'support';
}
