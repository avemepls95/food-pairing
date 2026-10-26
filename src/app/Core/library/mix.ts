export type MixCategory = 'tried' | 'planned';

/**
 * Позиция микса это банка табака. Вкусы, которых нет в справочнике, остаются текстом
 * из старых записей.
 */
export interface MixItem {
  /** Банка с полки, если микс собран из неё */
  jarId?: string;
  brand?: string;
  /** Название на банке */
  name?: string;
  flavors: string[];
  /** Доля в чаше, проценты */
  share?: number;
}

export interface Mix {
  id: string;
  name?: string;
  items: MixItem[];
  /** Только у категории "попробовал", от 1 до 5 */
  rating?: number;
  category: MixCategory;
  updatedAt: string;
}

export const MIX_MIN_ITEMS = 2;
/** Доля меньше этой в чаше неразличима */
export const MIX_MIN_SHARE = 5;

const hasShare = (item: MixItem): boolean => typeof item.share === 'number' && Number.isFinite(item.share);

/** Сумма проставленных долей: позиции без доли в неё не входят */
export function shareTotal(mix: Mix): number {
  return mix.items.reduce((sum, item) => sum + (hasShare(item) ? item.share! : 0), 0);
}

/** Что не так с долями, пустая строка если всё в порядке */
export function shareProblem(mix: Mix): string {
  const wrong = mix.items.some(item => hasShare(item) && (item.share! < MIX_MIN_SHARE || item.share! > 100));
  if (wrong) {
    return `Доля позиции бывает от ${MIX_MIN_SHARE} до 100 %`;
  }

  return shareTotal(mix) > 100 ? `Сумма долей ${shareTotal(mix)} %, это больше 100` : '';
}

export function isMixValid(mix: Mix): boolean {
  const items = mix.items.filter(item => item.flavors.length);
  return items.length >= MIX_MIN_ITEMS && (mix.category !== 'tried' || !!mix.rating) && !shareProblem(mix);
}

export function mixFlavors(mix: Mix): string[] {
  return Array.from(new Set(mix.items.flatMap(item => item.flavors)));
}

export function itemTitle(item: MixItem): string {
  return item.name || item.flavors.join(' + ');
}

export function mixTitle(mix: Mix): string {
  return mix.name || mix.items.map(itemTitle).join(' + ');
}
