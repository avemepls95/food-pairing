import { CategoryGroup } from '../../Core/graph/graph-data';

export const toSearchKey = (text: string): string => text.toLowerCase().replace(/ё/g, 'е');

/** Вкусы, подходящие под запрос. Название категории ищется тоже, чтобы открыть её целиком */
export function filterGroups(groups: CategoryGroup[], term: string): CategoryGroup[] {
  const key = toSearchKey(term.trim());
  if (!key) {
    return groups;
  }

  return groups
    .map(group => ({
      ...group,
      items: group.items.filter(item => toSearchKey(item).includes(key) || toSearchKey(group.category).includes(key))
    }))
    .filter(group => group.items.length > 0);
}
