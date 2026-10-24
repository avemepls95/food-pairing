/** Роль вкуса в миксе: тело, поддержка, яркая добавка небольшой долей */
export type FlavorRole = 'base' | 'support' | 'accent';

const CATEGORY_COLORS: Record<string, string> = {
  'Ягоды': '#ff6b6b',
  'Цитрус': '#feca57',
  'Фрукты': '#1dd1a1',
  'Травы': '#6ab04c',
  'Специи': '#e67e22',
  'Орехи': '#8d6e63',
  'Гастро': '#576574',
  'Напитки': '#54a0ff',
  'Десерт': '#c49c9c',
  'Цветы': '#f368e0',
  'Растения': '#0c830c',
  'Овощи': '#5f27cd',
  'Без категории': '#8395a7'
};

const DEFAULT_CATEGORY_COLOR = '#8395a7';

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
