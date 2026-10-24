/**
 * Банка табака с полки. Несколько вкусов означают готовый микс от производителя.
 */
export interface Jar {
  id: string;
  brand?: string;
  /** Название на банке */
  name?: string;
  /** Вкусы графа, минимум один */
  flavors: string[];
}

export function jarTitle(jar: Jar): string {
  return jar.name || jar.flavors.join(' + ');
}
