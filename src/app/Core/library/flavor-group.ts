import { toKey } from '../graph/graph-data';

/**
 * Вкусы справочника, которые подбор считает одним вкусом.
 */
export interface FlavorGroup {
  id: string;
  /** Имя группы в выдаче */
  name: string;
  /** Вкусы справочника, минимум два; первый задаёт категорию при равенстве */
  flavors: string[];
}

/** Вкус есть в справочнике */
export type Known = (flavor: string) => boolean;

/** Каноническое имя справочника по любому написанию */
export type Canonical = (text: string) => string | undefined;

export interface Grouping {
  /** Имя группы вкуса или сам вкус */
  nameOf(flavor: string): string;
  /** Известные вкусы группы или сам вкус */
  flavorsOf(name: string): string[];
  isGroup(name: string): boolean;
}

/**
 * Карты подбора. Группа, где после отсева неизвестных и уже занятых вкусов осталось меньше двух,
 * в карты не попадает, и её вкус работает сам по себе.
 */
export function buildGrouping(groups: FlavorGroup[], knows: Known): Grouping {
  const nameByFlavor = new Map<string, string>();
  const flavorsByName = new Map<string, string[]>();

  groups.forEach(group => {
    const flavors = group.flavors.filter(flavor => knows(flavor) && !nameByFlavor.has(flavor));
    if (flavors.length < 2) {
      return;
    }
    flavorsByName.set(group.name, flavors);
    flavors.forEach(flavor => nameByFlavor.set(flavor, group.name));
  });

  return {
    nameOf: flavor => nameByFlavor.get(flavor) ?? flavor,
    flavorsOf: name => flavorsByName.get(name) ?? [name],
    isGroup: name => flavorsByName.has(name)
  };
}

/**
 * Чем занято имя группы: другой группой, вкусом справочника вне её состава или ничем.
 * Имя служит ключом в картах подбора, поэтому одно имя всегда означает одно и то же.
 */
export function nameConflict(name: string, flavors: string[], groups: FlavorGroup[], canonical: Canonical,
  exceptId?: string): 'group' | 'flavor' | undefined {
  const key = toKey(name);
  if (groups.some(group => group.id !== exceptId && toKey(group.name) === key)) {
    return 'group';
  }
  // Имя сверяется со справочником так же, как написания из таблиц: «Груша» это та же груша
  const flavor = canonical(name);

  return flavor && !flavors.includes(flavor) ? 'flavor' : undefined;
}
