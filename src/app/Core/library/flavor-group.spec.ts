import { describe, expect, it } from 'vitest';
import { toKey } from '../graph/graph-data';
import { buildGrouping, FlavorGroup, nameConflict } from './flavor-group';

const DIRECTORY = ['груша', 'желтая груша', 'зеленая груша', 'сыр'];
const knows = (flavor: string) => DIRECTORY.includes(flavor);
const canonical = (text: string) => DIRECTORY.find(name => toKey(name) === toKey(text));

const pear: FlavorGroup = { id: 'g1', name: 'груша', flavors: ['груша', 'желтая груша', 'зеленая груша'] };
const cherry: FlavorGroup = { id: 'g2', name: 'вишня', flavors: ['кислая вишня', 'сладкая вишня'] };

describe('buildGrouping', () => {
  it('вкус без группы => имя и вкусы это он сам', () => {
    const grouping = buildGrouping([pear], knows);

    expect(grouping.nameOf('сыр')).toBe('сыр');
    expect(grouping.flavorsOf('сыр')).toEqual(['сыр']);
  });

  it('вкус группы => отдаёт имя группы', () => {
    const grouping = buildGrouping([pear], knows);

    expect(grouping.nameOf('зеленая груша')).toBe('груша');
  });

  it('имя группы => отдаёт её известные вкусы', () => {
    const grouping = buildGrouping([pear], knows);

    expect(grouping.flavorsOf('груша')).toEqual(['груша', 'желтая груша', 'зеленая груша']);
  });

  it('вкус группы пропал из справочника => в вкусы группы не попадает', () => {
    const withLost: FlavorGroup = { ...pear, flavors: ['груша', 'желтая груша', 'абрикос'] };

    const grouping = buildGrouping([withLost], knows);

    expect(grouping.flavorsOf('груша')).toEqual(['груша', 'желтая груша']);
  });

  it('в группе остался один известный вкус => карты её не строят', () => {
    const grouping = buildGrouping([cherry], flavor => flavor === 'кислая вишня');

    expect(grouping.isGroup('вишня')).toBe(false);
    expect(grouping.nameOf('кислая вишня')).toBe('кислая вишня');
  });

  it('ни одного вкуса группы нет в справочнике => карты её не строят', () => {
    const grouping = buildGrouping([cherry], () => false);

    expect(grouping.isGroup('вишня')).toBe(false);
  });

  it('вкус в двух группах => остаётся в первой', () => {
    const second: FlavorGroup = { id: 'g3', name: 'вторая', flavors: ['желтая груша', 'сыр'] };

    const grouping = buildGrouping([pear, second], knows);

    expect(grouping.nameOf('желтая груша')).toBe('груша');
  });
});

describe('nameConflict', () => {
  it('имя занято другой группой => group', () => {
    expect(nameConflict('груша', cherry.flavors, [pear], canonical)).toBe('group');
  });

  it('имя отличается регистром и пробелами от имени группы => занято', () => {
    expect(nameConflict('Груша ', cherry.flavors, [pear], canonical)).toBe('group');
  });

  it('имя это свободный вкус справочника => flavor', () => {
    expect(nameConflict('сыр', cherry.flavors, [pear], canonical)).toBe('flavor');
  });

  it('имя отличается регистром и пробелами от свободного вкуса => flavor', () => {
    expect(nameConflict('Груша ', ['желтая груша', 'зеленая груша'], [], canonical)).toBe('flavor');
  });

  it('имя это вкус самой группы => свободно', () => {
    expect(nameConflict('груша', pear.flavors, [pear], canonical, 'g1')).toBeUndefined();
  });

  it('новая группа названа своим же вкусом => свободно', () => {
    expect(nameConflict('груша', pear.flavors, [], canonical)).toBeUndefined();
  });
});
