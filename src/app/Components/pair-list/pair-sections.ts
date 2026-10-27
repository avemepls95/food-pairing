import { GraphLink, Level, VisibleLevel } from '../../Core/graph/graph-data';

export interface LevelOption {
  color: VisibleLevel;
  label: string;
}

export interface PairRow {
  /** Сторона пары, которой названа строка */
  name: string;
  /** Вторая сторона */
  partner: string;
}

export interface PairSection {
  level: VisibleLevel;
  label: string;
  rows: PairRow[];
}

/**
 * Связи по уровням в переданном порядке. Раздел остаётся на месте и без связей, и счётчик 0
 * отвечает, что пар этой силы у продукта нет.
 */
export function pairSections(links: GraphLink[], selected: string[], levels: readonly LevelOption[]): PairSection[] {
  const chosen = new Set(selected);
  const sections: PairSection[] = levels.map(level => ({ level: level.color, label: level.label, rows: [] }));
  const byLevel = new Map<Level, PairRow[]>(sections.map(section => [section.level, section.rows]));

  links.forEach(link => byLevel.get(link.value)?.push(rowOf(link, chosen)));
  sections.forEach(section => section.rows.sort(byName));

  return sections;
}

/** Строку называет невыбранная сторона, потому что выбранная стоит в строке выбора над списком */
function rowOf(link: GraphLink, chosen: Set<string>): PairRow {
  if (chosen.has(link.source) !== chosen.has(link.target)) {
    return chosen.has(link.source)
      ? { name: link.target, partner: link.source }
      : { name: link.source, partner: link.target };
  }

  return link.source.localeCompare(link.target, 'ru') <= 0
    ? { name: link.source, partner: link.target }
    : { name: link.target, partner: link.source };
}

function byName(a: PairRow, b: PairRow): number {
  return a.name.localeCompare(b.name, 'ru') || a.partner.localeCompare(b.partner, 'ru');
}
