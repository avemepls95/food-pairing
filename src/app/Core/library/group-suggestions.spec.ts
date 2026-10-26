import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CategoryGroup, GraphNode, groupFlavors, Product } from '../graph/graph-data';
import { FlavorGroup } from './flavor-group';
import { addableSuggestions, suggestGroups, wordSuggestions } from './group-suggestions';

const pears: CategoryGroup = { category: 'Фрукты', items: ['груша', 'желтая груша', 'зеленая груша'] };

const names = (suggestions: { name: string }[]) => suggestions.map(suggestion => suggestion.name);

describe('wordSuggestions', () => {
  it('вкусы с общим последним словом в одной категории => подсказка', () => {
    const suggestions = wordSuggestions([pears]);

    expect(suggestions).toEqual([{ name: 'груша', flavors: ['груша', 'желтая груша', 'зеленая груша'] }]);
  });

  it('общее слово в разных категориях => подсказок нет', () => {
    const suggestions = wordSuggestions([
      { category: 'Цитрус', items: ['апельсин', 'грейпфрутовый сок'] },
      { category: 'Овощи', items: ['огуречный сок'] },
      { category: 'Цветы', items: ['цветы апельсина'] }
    ]);

    expect(suggestions).toEqual([]);
  });

  it('общее слово у одного вкуса => подсказки нет', () => {
    const suggestions = wordSuggestions([{ category: 'Гастро', items: ['красная рыба', 'бекон'] }]);

    expect(suggestions).toEqual([]);
  });

  it('справочник целиком => 15 подсказок по слову', () => {
    const products = JSON.parse(readFileSync('public/data/products.json', 'utf8')) as Product[];
    const nodes: GraphNode[] = products.map(product => ({
      id: product.name,
      name: product.name,
      category: product.category,
      hasTable: false
    }));

    const suggestions = wordSuggestions(groupFlavors(nodes));

    expect(suggestions).toHaveLength(15);
  });
});

describe('suggestGroups', () => {
  it('подсказка целиком входит в другую => остаётся одна с именем из списка по смыслу', () => {
    const suggestions = suggestGroups(
      [{ category: 'Напитки', items: ['виски', 'односолодовый виски', 'бурбон'] }], []);

    expect(suggestions).toEqual([{ name: 'виски', flavors: ['виски', 'односолодовый виски', 'бурбон'] }]);
  });

  it('подсказки пересекаются частично => остаются обе', () => {
    const suggestions = suggestGroups(
      [{ category: 'Напитки', items: ['зеленый чай', 'черный чай', 'сенча', 'матча'] }], []);

    expect(names(suggestions)).toEqual(['зеленый чай', 'чай']);
  });

  it('вкус списка по смыслу пропал из справочника => остальные вкусы остаются', () => {
    const suggestions = suggestGroups([{ category: 'Гастро', items: ['сыр', 'горгонзола', 'рокфор'] }], []);

    expect(suggestions).toEqual([{ name: 'сыр', flavors: ['сыр', 'горгонзола', 'рокфор'] }]);
  });

  it('вкус подсказки уже в группе => подсказка пропадает', () => {
    const group: FlavorGroup = { id: 'g1', name: 'моя', flavors: ['желтая груша', 'зеленая груша'] };

    const suggestions = suggestGroups([pears], [group]);

    expect(suggestions).toEqual([]);
  });

  it('справочник целиком => подсказки по слову и по смыслу без пересечений', () => {
    const products = JSON.parse(readFileSync('public/data/products.json', 'utf8')) as Product[];
    const nodes: GraphNode[] = products.map(product => ({
      id: product.name,
      name: product.name,
      category: product.category,
      hasTable: false
    }));

    const suggestions = suggestGroups(groupFlavors(nodes), []);

    // 15 по слову и 14 по смыслу, из них виски с односолодовым уступает виски с бурбоном
    expect(suggestions).toHaveLength(28);
  });

  it('имя подсказки занято группой => подсказка пропадает', () => {
    const group: FlavorGroup = { id: 'g1', name: 'груша', flavors: ['кислая вишня', 'сладкая вишня'] };

    const suggestions = suggestGroups([pears], [group]);

    expect(suggestions).toEqual([]);
  });
});

describe('addableSuggestions', () => {
  it('подсказки делят вкус => добавляется только первая', () => {
    const kept = addableSuggestions([
      { name: 'зеленый чай', flavors: ['зеленый чай', 'сенча', 'матча'] },
      { name: 'чай', flavors: ['жасминовый чай', 'зеленый чай', 'черный чай'] }
    ]);

    expect(names(kept)).toEqual(['зеленый чай']);
  });

  it('имя подсказки лежит во вкусах другой => добавляется только первая', () => {
    const kept = addableSuggestions([
      { name: 'сыр', flavors: ['сыр', 'горгонзола'] },
      { name: 'горгонзола', flavors: ['рокфор', 'чеддер'] }
    ]);

    expect(names(kept)).toEqual(['сыр']);
  });

  it('подсказки не пересекаются => добавляются обе', () => {
    const kept = addableSuggestions([
      { name: 'груша', flavors: ['груша', 'желтая груша'] },
      { name: 'сыр', flavors: ['сыр', 'горгонзола'] }
    ]);

    expect(names(kept)).toEqual(['груша', 'сыр']);
  });
});
