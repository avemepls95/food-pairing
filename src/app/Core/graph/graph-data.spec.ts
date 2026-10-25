import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { buildGraph, buildPairIndex, groupFlavors, levelOf, PairingTable, Product } from './graph-data';

const products: Product[] = [
  { name: 'вишня', category: 'Ягоды', aliases: ['к.вишня'] },
  { name: 'мята', category: 'Травы' },
  { name: 'лайм', category: 'Цитрус' }
];

const table = (header: string, cells: [string, string][], category = 'Ягоды'): PairingTable =>
  ({ file: `${header}.png`, header, columns: [{ category, cells }] });

const linkFor = (tables: PairingTable[], a: string, b: string) =>
  levelOf(buildPairIndex(buildGraph(tables, products).links), a, b);

describe('buildGraph', () => {
  it('пара бледная во всех таблицах => уровень pale', () => {
    const level = linkFor([table('Вишня', [['Мята', 'P']])], 'вишня', 'мята');

    expect(level).toBe('pale');
  });

  it('пара бледная в одной таблице и зелёная в другой => уровень green', () => {
    const tables = [table('Вишня', [['Мята', 'P']]), table('Мята', [['Вишня', 'G']])];

    const level = linkFor(tables, 'вишня', 'мята');

    expect(level).toBe('green');
  });

  it('бледная ячейка с именем, которого нет в справочнике => узла нет', () => {
    const graph = buildGraph([table('Вишня', [['Шафран', 'P']])], products);

    expect(graph.nodes.map(node => node.id)).toEqual(['вишня']);
    expect(graph.links).toEqual([]);
  });

  it('цветная ячейка с именем, которого нет в справочнике => узел создаётся из текста', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const graph = buildGraph([table('Вишня', [['Шафран', 'G']], 'Специи')], products);

    expect(graph.nodes.map(node => node.id)).toEqual(['вишня', 'шафран']);
  });

  it('продукт со своей таблицей => hasTable true', () => {
    const graph = buildGraph([table('Вишня', [['Мята', 'G']])], products);

    expect(graph.nodes.find(node => node.id === 'вишня')?.hasTable).toBe(true);
  });

  it('продукт только из чужих ячеек => hasTable false', () => {
    const graph = buildGraph([table('Вишня', [['Мята', 'G']])], products);

    expect(graph.nodes.find(node => node.id === 'мята')?.hasTable).toBe(false);
  });

  it('пары нет в таблицах => levelOf возвращает unknown', () => {
    const level = linkFor([table('Вишня', [['Мята', 'G']])], 'вишня', 'лайм');

    expect(level).toBe('unknown');
  });

  it('пара описана двумя сторонами по-разному => value максимум, agreed ближе к слабой', () => {
    const tables = [table('Вишня', [['Мята', 'R']], 'Травы'), table('Мята', [['Вишня', 'B']])];

    const link = buildGraph(tables, products).links[0];

    expect(link.value).toBe('red');
    expect(link.agreed).toBe('green');
    expect(link.sides).toBe(2);
  });

  it('пара описана одной стороной => agreed равен value, sides 1', () => {
    const link = buildGraph([table('Вишня', [['Мята', 'R']], 'Травы')], products).links[0];

    expect(link.agreed).toBe('red');
    expect(link.sides).toBe(1);
  });

  it('обе стороны согласны => agreed тот же уровень', () => {
    const tables = [table('Вишня', [['Мята', 'G']], 'Травы'), table('Мята', [['Вишня', 'G']])];

    expect(buildGraph(tables, products).links[0].agreed).toBe('green');
  });

  it('у продукта две таблицы => это одна сторона, а не две', () => {
    const tables = [
      table('Вишня', [['Мята', 'R']], 'Травы'),
      table('Вишня', [['Мята', 'B']], 'Травы')
    ];

    const link = buildGraph(tables, products).links[0];

    expect(link.sides).toBe(1);
    expect(link.agreed).toBe('red');
  });

  it('реальные данные => 190 узлов, 6470 пар, из них 3873 бледные', () => {
    const data = (name: string) =>
      JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../../public/data', name), 'utf8'));

    const graph = buildGraph(data('tables.json') as PairingTable[], data('products.json') as Product[]);

    expect(graph.nodes).toHaveLength(190);
    expect(graph.links).toHaveLength(6470);
    expect(graph.links.filter(link => link.value === 'pale')).toHaveLength(3873);
  });

  it('реальные данные => красных по согласию сторон меньше, чем по максимуму', () => {
    const data = (name: string) =>
      JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../../public/data', name), 'utf8'));

    const graph = buildGraph(data('tables.json') as PairingTable[], data('products.json') as Product[]);
    const red = graph.links.filter(link => link.value === 'red').length;
    const agreedRed = graph.links.filter(link => link.agreed === 'red').length;
    const oneSided = graph.links.filter(link => link.sides === 1).length;

    expect(red).toBe(355);
    expect(agreedRed).toBeLessThan(red);
    expect(oneSided).toBeGreaterThan(0);
  });
});

describe('groupFlavors', () => {
  it('узлы разных категорий => группы по категориям, вкусы по алфавиту', () => {
    const nodes = buildGraph([table('Вишня', [['Мята', 'G'], ['Лайм', 'G']], 'Травы')], products).nodes;

    const groups = groupFlavors(nodes);

    expect(groups).toEqual([
      { category: 'Травы', items: ['мята'] },
      { category: 'Цитрус', items: ['лайм'] },
      { category: 'Ягоды', items: ['вишня'] }
    ]);
  });

  it('узел без категории => группа "Без категории"', () => {
    const groups = groupFlavors([{ id: 'дым', name: 'дым', category: '', hasTable: false }]);

    expect(groups).toEqual([{ category: 'Без категории', items: ['дым'] }]);
  });
});
