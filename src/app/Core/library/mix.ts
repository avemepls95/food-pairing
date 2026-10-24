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

export function isMixValid(mix: Mix): boolean {
  const items = mix.items.filter(item => item.flavors.length);
  return items.length >= MIX_MIN_ITEMS && (mix.category !== 'tried' || !!mix.rating);
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
