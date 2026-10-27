import { describe, expect, it } from 'vitest';
import { GraphLink, Level } from '../../Core/graph/graph-data';
import { LevelOption, pairSections } from './pair-sections';

const levels: LevelOption[] = [
  { color: 'red', label: 'Красный' },
  { color: 'yellow', label: 'Жёлтый' }
];

const link = (source: string, target: string, value: Level): GraphLink => ({ source, target, value, agreed: value, sides: 2 });

describe('pairSections', () => {
  it('выбран продукт => строку называет вторая сторона пары', () => {
    const sections = pairSections([link('вишня', 'мята', 'red')], ['вишня'], levels);

    expect(sections[0].rows).toEqual([{ name: 'мята', partner: 'вишня' }]);
  });

  it('выбранный продукт стоит целью связи => строку всё равно называет вторая сторона', () => {
    const sections = pairSections([link('мята', 'вишня', 'red')], ['вишня'], levels);

    expect(sections[0].rows).toEqual([{ name: 'мята', partner: 'вишня' }]);
  });

  it('выбраны обе стороны пары => строку называет первая по алфавиту', () => {
    const sections = pairSections([link('мята', 'вишня', 'red')], ['вишня', 'мята'], levels);

    expect(sections[0].rows).toEqual([{ name: 'вишня', partner: 'мята' }]);
  });

  it('связи разных уровней => каждая в своём разделе', () => {
    const sections = pairSections([link('вишня', 'лёд', 'yellow'), link('вишня', 'мята', 'red')], ['вишня'], levels);

    expect(sections).toEqual([
      { level: 'red', label: 'Красный', rows: [{ name: 'мята', partner: 'вишня' }] },
      { level: 'yellow', label: 'Жёлтый', rows: [{ name: 'лёд', partner: 'вишня' }] }
    ]);
  });

  it('на уровне нет связей => раздел остаётся пустым на своём месте', () => {
    const sections = pairSections([link('вишня', 'мята', 'yellow')], ['вишня'], levels);

    expect(sections[0]).toEqual({ level: 'red', label: 'Красный', rows: [] });
  });

  it('несколько связей одного уровня => строки по алфавиту', () => {
    const links = [link('вишня', 'мята', 'red'), link('вишня', 'банан', 'red'), link('вишня', 'лёд', 'red')];

    const sections = pairSections(links, ['вишня'], levels);

    expect(sections[0].rows.map(row => row.name)).toEqual(['банан', 'лёд', 'мята']);
  });

  it('строки с одним именем => порядок по второй стороне', () => {
    const links = [link('мята', 'вишня', 'red'), link('мята', 'банан', 'red')];

    const sections = pairSections(links, ['вишня', 'банан'], levels);

    expect(sections[0].rows).toEqual([
      { name: 'мята', partner: 'банан' },
      { name: 'мята', partner: 'вишня' }
    ]);
  });

  it('уровня нет среди переданных => связь в разделы не попадает', () => {
    const sections = pairSections([link('вишня', 'мята', 'pale')], ['вишня'], levels);

    expect(sections.flatMap(section => section.rows)).toEqual([]);
  });

  it('продукт не выбран => строку называет первая сторона по алфавиту', () => {
    const sections = pairSections([link('мята', 'вишня', 'red')], [], levels);

    expect(sections[0].rows).toEqual([{ name: 'вишня', partner: 'мята' }]);
  });
});
