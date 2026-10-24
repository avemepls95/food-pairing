export type Level = 'red' | 'yellow' | 'green' | 'blue' | 'pale';

/** Уровень пары, которой в таблицах нет */
export type PairLevel = Level | 'unknown';

/**
 * Одна таблица-картинка как есть: названия в том написании, что на картинке.
 * Цвет ячейки: R, O, G, B или P (бледная - минимальная сочетаемость).
 */
export interface PairingTable {
  file: string;
  header: string;
  columns: { category: string; cells: [string, string][] }[];
}

/**
 * Продукт справочника. aliases - другие написания из таблиц (сокращения, опечатки).
 */
export interface Product {
  name: string;
  category: string;
  aliases?: string[];
}

export interface GraphNode {
  id: string;
  name: string;
  category: string;
  /** У продукта есть своя таблица, то есть его сочетания описаны полностью */
  hasTable: boolean;
}

export interface GraphLink {
  source: string;
  target: string;
  value: Level;
}

export interface Graph {
  nodes: GraphNode[];
  links: GraphLink[];
}

/** Вкусы одной категории для списков выбора */
export interface FlavorGroup {
  category: string;
  items: string[];
}

const levelByColor: Record<string, Level> = { R: 'red', O: 'yellow', G: 'green', B: 'blue', P: 'pale' };
const levelRank: Record<Level, number> = { red: 5, yellow: 4, green: 3, blue: 2, pale: 1 };

// В таблицах одно и то же пишется по-разному: "Ч.смородина", "ч. смородина", "ч, смородина"
export function toKey(text: string): string {
  return text.toLowerCase().replace(/ё/g, 'е').replace(/,/g, '.').replace(/\s+/g, '');
}

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function buildPairIndex(links: GraphLink[]): Map<string, Level> {
  return new Map(links.map(link => [pairKey(link.source, link.target), link.value]));
}

export function levelOf(index: Map<string, Level>, a: string, b: string): PairLevel {
  return index.get(pairKey(a, b)) ?? 'unknown';
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

/**
 * Связь между парой продуктов одна, даже если пара встречается в нескольких таблицах
 * (A в таблице B, B в таблице A, вторая таблица того же продукта) - берётся самый сильный уровень.
 * Поэтому бледный уровень остаётся только у пар, бледных во всех таблицах.
 */
export function buildGraph(tables: PairingTable[], products: Product[]): Graph {
  const productByKey = new Map<string, Product>();
  products.forEach(p => [p.name, ...(p.aliases ?? [])].forEach(a => productByKey.set(toKey(a), p)));

  const canonical = (text: string) => productByKey.get(toKey(text))?.name ?? text.trim().toLowerCase();
  const described = new Set(tables.map(table => canonical(table.header)));

  const nodes = new Map<string, GraphNode>();
  // Бледные ячейки держат названия, которых в справочнике нет: опечатки, сокращения и продукты,
  // до которых справочник не дошёл. Узлов такие названия не создают
  const resolve = (text: string, columnCategory: string, onlyKnown = false): string | undefined => {
    const product = productByKey.get(toKey(text));
    if (!product) {
      if (onlyKnown) {
        return undefined;
      }
      console.warn(`Нет в products.json: "${text}"`);
    }
    const name = product?.name ?? text.trim().toLowerCase();
    if (!nodes.has(name)) {
      nodes.set(name, {
        id: name,
        name,
        category: product?.category ?? capitalize(columnCategory),
        hasTable: described.has(name)
      });
    }
    return name;
  };

  const links = new Map<string, GraphLink>();
  tables.forEach(table => {
    const source = resolve(table.header, 'Без категории')!;
    table.columns.forEach(column => column.cells.forEach(([text, color]) => {
      const value = levelByColor[color];
      if (!value) return;
      const target = resolve(text, column.category, value === 'pale');
      if (!target || target === source) return;
      const key = pairKey(source, target);
      const existing = links.get(key);
      if (!existing || levelRank[value] > levelRank[existing.value]) {
        links.set(key, { source, target, value });
      }
    }));
  });

  return { nodes: Array.from(nodes.values()), links: Array.from(links.values()) };
}

/** Вкусы по категориям для списков выбора: категории и вкусы по алфавиту */
export function groupFlavors(nodes: GraphNode[]): FlavorGroup[] {
  const categories = new Map<string, string[]>();

  nodes.forEach(node => {
    const category = node.category || 'Без категории';
    if (!categories.has(category)) {
      categories.set(category, []);
    }
    categories.get(category)?.push(node.name);
  });

  return Array.from(categories.entries())
    .map(([category, items]) => ({ category, items: items.sort((a, b) => a.localeCompare(b)) }))
    .sort((a, b) => a.category.localeCompare(b.category));
}
