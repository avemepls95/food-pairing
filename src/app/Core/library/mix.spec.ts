import { describe, expect, it } from 'vitest';
import { isMixValid, Mix, MixItem, shareProblem, shareTotal } from './mix';

const mix = (items: MixItem[], patch: Partial<Mix> = {}): Mix => ({
  id: 'm1',
  items,
  category: 'planned',
  updatedAt: '2026-10-26T00:00:00.000Z',
  ...patch
});

const PEAR_AND_CHEESE: MixItem[] = [{ flavors: ['груша'] }, { flavors: ['сыр'] }];

describe('shareTotal', () => {
  it('доли проставлены => сумма долей', () => {
    const total = shareTotal(mix([{ flavors: ['груша'], share: 65 }, { flavors: ['сыр'], share: 35 }]));

    expect(total).toBe(100);
  });

  it('позиция без доли => в сумму не входит', () => {
    const total = shareTotal(mix([{ flavors: ['груша'], share: 65 }, { flavors: ['сыр'] }]));

    expect(total).toBe(65);
  });
});

describe('shareProblem', () => {
  it('долей нет => проблемы нет', () => {
    const problem = shareProblem(mix(PEAR_AND_CHEESE));

    expect(problem).toBe('');
  });

  it('доля больше 100 => проблема диапазона', () => {
    const problem = shareProblem(mix([{ flavors: ['груша'], share: 999 }, { flavors: ['сыр'] }]));

    expect(problem).toBe('Доля позиции бывает от 5 до 100 %');
  });

  it('доля отрицательная => проблема диапазона', () => {
    const problem = shareProblem(mix([{ flavors: ['груша'], share: -40 }, { flavors: ['сыр'] }]));

    expect(problem).toBe('Доля позиции бывает от 5 до 100 %');
  });

  it('доля меньше пяти процентов => проблема диапазона', () => {
    const problem = shareProblem(mix([{ flavors: ['груша'], share: 4 }, { flavors: ['сыр'] }]));

    expect(problem).toBe('Доля позиции бывает от 5 до 100 %');
  });

  it('сумма больше 100 => проблема суммы', () => {
    const problem = shareProblem(mix([{ flavors: ['груша'], share: 90 }, { flavors: ['сыр'], share: 90 }]));

    expect(problem).toBe('Сумма долей 180 %, это больше 100');
  });

  it('сумма меньше 100 => проблемы нет', () => {
    const problem = shareProblem(mix([{ flavors: ['груша'], share: 50 }, { flavors: ['сыр'] }]));

    expect(problem).toBe('');
  });
});

describe('isMixValid', () => {
  it('доля вне диапазона => микс не сохранить', () => {
    const valid = isMixValid(mix([{ flavors: ['груша'], share: 999 }, { flavors: ['сыр'], share: 35 }]));

    expect(valid).toBe(false);
  });

  it('доли в порядке => микс сохраняется', () => {
    const valid = isMixValid(mix([{ flavors: ['груша'], share: 65 }, { flavors: ['сыр'], share: 35 }]));

    expect(valid).toBe(true);
  });

  it('попробованный микс без оценки => не сохранить', () => {
    const valid = isMixValid(mix(PEAR_AND_CHEESE, { category: 'tried' }));

    expect(valid).toBe(false);
  });
});
