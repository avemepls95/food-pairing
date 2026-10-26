import { describe, expect, it } from 'vitest';
import { CategoryGroup } from '../../Core/graph/graph-data';
import { filterGroups } from './flavor-filter';

const groups: CategoryGroup[] = [
  { category: 'Ягоды', items: ['вишня', 'клюква', 'малина'] },
  { category: 'Травы', items: ['мелисса', 'мята'] }
];

describe('filterGroups', () => {
  it('поиск по части названия => группы с подходящими вкусами', () => {
    expect(filterGroups(groups, 'мел')).toEqual([{ category: 'Травы', items: ['мелисса'] }]);
  });

  it('поиск по названию категории => вся категория', () => {
    expect(filterGroups(groups, 'травы')).toEqual([{ category: 'Травы', items: ['мелисса', 'мята'] }]);
  });

  it('ё в запросе => находит вкус с е', () => {
    const withYo: CategoryGroup[] = [{ category: 'Напитки', items: ['черный чай'] }];

    expect(filterGroups(withYo, 'чёрный')).toEqual(withYo);
  });

  it('пустой запрос => все группы без изменений', () => {
    expect(filterGroups(groups, '  ')).toBe(groups);
  });

  it('ничего не подошло => пустой список', () => {
    expect(filterGroups(groups, 'бекон')).toEqual([]);
  });
});
