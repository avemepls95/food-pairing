import { describe, expect, it } from 'vitest';
import { toKey } from '../graph/graph-data';
import { isMixValid, Mix } from './mix';
import { migrateGroups, migrateJar, parseBackup, readLibrary } from './library-data';

const dictionary: Record<string, string> = {
  [toKey('Кис. вишня')]: 'кислая вишня',
  [toKey('кислая вишня')]: 'кислая вишня',
  [toKey('Мята')]: 'мята',
  [toKey('груша')]: 'груша',
  [toKey('Ж. груша')]: 'желтая груша',
  [toKey('желтая груша')]: 'желтая груша',
  [toKey('зеленая груша')]: 'зеленая груша',
  [toKey('сыр')]: 'сыр'
};
const canonical = (text: string) => dictionary[toKey(text)];

const storageWith = (entries: Record<string, string>) => ({
  getItem: (key: string) => entries[key] ?? null
});

const legacyMix = (items: unknown[], extra: Record<string, unknown> = {}) => ({
  id: 'm1',
  name: 'Старый',
  items,
  rating: 4,
  category: 'tried',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...extra
});

describe('readLibrary', () => {
  it('старый ключ food-pairing.mixes => миксы переносятся в новый формат', () => {
    const storage = storageWith({
      'food-pairing.mixes': JSON.stringify({
        version: 1,
        mixes: [legacyMix([{ brand: 'Darkside', flavor: 'Кис. вишня' }, { flavor: 'Мята' }])]
      })
    });

    const library = readLibrary(storage, canonical);

    expect(library.jars).toEqual([]);
    expect(library.mixes).toHaveLength(1);
    expect(library.mixes[0].items).toEqual([
      { brand: 'Darkside', flavors: ['кислая вишня'] },
      { flavors: ['мята'] }
    ]);
  });

  it('старый микс с текстом "Кис. вишня" => вкус становится "кислая вишня"', () => {
    const storage = storageWith({
      'food-pairing.mixes': JSON.stringify({ version: 1, mixes: [legacyMix([{ flavor: 'Кис. вишня' }, { flavor: 'Мята' }])] })
    });

    const library = readLibrary(storage, canonical);

    expect(library.mixes[0].items[0].flavors).toEqual(['кислая вишня']);
  });

  it('старый микс с текстом, которого нет в справочнике => текст сохраняется как есть', () => {
    const storage = storageWith({
      'food-pairing.mixes': JSON.stringify({ version: 1, mixes: [legacyMix([{ flavor: 'Шафран' }, { flavor: 'Мята' }])] })
    });

    const library = readLibrary(storage, canonical);

    expect(library.mixes[0].items[0].flavors).toEqual(['Шафран']);
  });

  it('в позиции два написания одного вкуса => остаётся один', () => {
    const storage = storageWith({
      'food-pairing.library': JSON.stringify({
        version: 2,
        jars: [],
        mixes: [{
          ...legacyMix([]),
          items: [{ flavors: ['Кис. вишня', 'кислая вишня'] }, { flavors: ['Мята'] }]
        }]
      })
    });

    const library = readLibrary(storage, canonical);

    expect(library.mixes[0].items[0].flavors).toEqual(['кислая вишня']);
  });

  it('хранилище бросает исключение на чтении => возвращается пустая библиотека', () => {
    const storage = {
      getItem: () => {
        throw new Error('доступ к хранилищу запрещён');
      }
    };

    const library = readLibrary(storage, canonical);

    expect(library).toEqual({ jars: [], mixes: [], rejected: [], groups: [] });
  });

  it('новый ключ => читается он, а не старый', () => {
    const storage = storageWith({
      'food-pairing.library': JSON.stringify({
        version: 2,
        jars: [{ id: 'j1', flavors: ['мята'] }],
        mixes: []
      }),
      'food-pairing.mixes': JSON.stringify({ version: 1, mixes: [legacyMix([{ flavor: 'Мята' }, { flavor: 'Кис. вишня' }])] })
    });

    const library = readLibrary(storage, canonical);

    expect(library.jars).toEqual([{ id: 'j1', flavors: ['мята'] }]);
    expect(library.mixes).toEqual([]);
  });
});

describe('отклонённые миксы', () => {
  it('в файле нет поля rejected => список пустой', () => {
    const storage = storageWith({
      'food-pairing.library': JSON.stringify({ version: 2, jars: [], mixes: [] })
    });

    expect(readLibrary(storage, canonical).rejected).toEqual([]);
  });

  it('в файле есть rejected => ключи читаются без повторов', () => {
    const storage = storageWith({
      'food-pairing.library': JSON.stringify({
        version: 2,
        jars: [],
        mixes: [],
        rejected: ['кислая вишня+мята', 'кислая вишня+мята', 'лайм+мята']
      })
    });

    expect(readLibrary(storage, canonical).rejected).toEqual(['кислая вишня+мята', 'лайм+мята']);
  });

  it('rejected не массив => список пустой', () => {
    const storage = storageWith({
      'food-pairing.library': JSON.stringify({ version: 2, jars: [], mixes: [], rejected: 'нет' })
    });

    expect(readLibrary(storage, canonical).rejected).toEqual([]);
  });

  it('в rejected лежит мусор => остаются только непустые строки', () => {
    const parsed = parseBackup(JSON.stringify({
      version: 2,
      jars: [{ id: 'j1', flavors: ['мята'] }],
      mixes: [],
      rejected: ['лайм+мята', '', 42, null]
    }), canonical);

    expect(parsed.rejected).toEqual(['лайм+мята']);
  });
});

describe('isMixValid', () => {
  const mix = (patch: Partial<Mix>): Mix => ({
    id: 'm1',
    items: [{ flavors: ['мята'] }, { flavors: ['кислая вишня'] }],
    category: 'planned',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...patch
  });

  it('микс с одной позицией => isMixValid false', () => {
    expect(isMixValid(mix({ items: [{ flavors: ['мята'] }] }))).toBe(false);
  });

  it('попробованный микс без оценки => isMixValid false', () => {
    expect(isMixValid(mix({ category: 'tried' }))).toBe(false);
  });

  it('позиция без вкусов не считается => isMixValid false', () => {
    expect(isMixValid(mix({ items: [{ flavors: ['мята'] }, { flavors: [] }] }))).toBe(false);
  });

  it('две позиции со вкусами в планах => isMixValid true', () => {
    expect(isMixValid(mix({}))).toBe(true);
  });
});

describe('migrateGroups', () => {
  const group = (patch: Record<string, unknown>) => ({ id: 'g1', name: 'груша', ...patch });

  it('группа с вкусом из двух написаний => вкусы канонические и без повторов', () => {
    const groups = migrateGroups([group({ flavors: ['Ж. груша', 'желтая груша', 'груша'] })], canonical);

    expect(groups).toEqual([{ id: 'g1', name: 'груша', flavors: ['желтая груша', 'груша'] }]);
  });

  it('группа без имени => пропускается', () => {
    const groups = migrateGroups([group({ name: '  ', flavors: ['груша', 'желтая груша'] })], canonical);

    expect(groups).toEqual([]);
  });

  it('группа из одного вкуса => пропускается', () => {
    const groups = migrateGroups([group({ flavors: ['груша'] })], canonical);

    expect(groups).toEqual([]);
  });

  it('groups не массив => групп нет', () => {
    const groups = migrateGroups('нет', canonical);

    expect(groups).toEqual([]);
  });

  it('вкусы группы не строки => запись пропускается', () => {
    const groups = migrateGroups([group({ flavors: [42, null] })], canonical);

    expect(groups).toEqual([]);
  });

  it('вкус встретился в двух группах файла => остаётся в первой', () => {
    const groups = migrateGroups([
      group({ flavors: ['груша', 'желтая груша', 'зеленая груша'] }),
      group({ id: 'g2', name: 'вторая', flavors: ['желтая груша', 'сыр'] })
    ], canonical);

    expect(groups).toEqual([{ id: 'g1', name: 'груша', flavors: ['груша', 'желтая груша', 'зеленая груша'] }]);
  });

  it('имя второй группы совпадает с именем первой => вторая пропускается', () => {
    const groups = migrateGroups([
      group({ flavors: ['груша', 'желтая груша'] }),
      group({ id: 'g2', name: 'Груша', flavors: ['зеленая груша', 'сыр'] })
    ], canonical);

    expect(groups).toHaveLength(1);
    expect(groups[0].id).toBe('g1');
  });

  it('имя группы это свободный вкус справочника => группа пропускается', () => {
    const groups = migrateGroups([group({ name: 'сыр', flavors: ['груша', 'желтая груша'] })], canonical);

    expect(groups).toEqual([]);
  });

  it('имя группы отличается регистром от свободного вкуса => группа пропускается', () => {
    const groups = migrateGroups([group({ name: 'Сыр', flavors: ['груша', 'желтая груша'] })], canonical);

    expect(groups).toEqual([]);
  });
});

describe('parseBackup', () => {
  const file = (body: unknown) => JSON.stringify(body);

  it('файл версии 1 => mixesOnly true и банок нет', () => {
    const parsed = parseBackup(file({
      version: 1,
      mixes: [legacyMix([{ flavor: 'Мята' }, { flavor: 'Кис. вишня' }])]
    }), canonical);

    expect(parsed.mixesOnly).toBe(true);
    expect(parsed.jars).toEqual([]);
    expect(parsed.mixes).toHaveLength(1);
  });

  it('файл версии 2 => читаются и банки, и миксы', () => {
    const parsed = parseBackup(file({
      version: 2,
      jars: [{ id: 'j1', brand: 'Darkside', name: 'Supernova', flavors: ['кислая вишня', 'мята'] }],
      mixes: [{ ...legacyMix([]), items: [{ flavors: ['мята'] }, { flavors: ['кислая вишня'] }] }]
    }), canonical);

    expect(parsed.mixesOnly).toBe(false);
    expect(parsed.jars).toHaveLength(1);
    expect(parsed.mixes).toHaveLength(1);
  });

  it('в jars лежит не массив => банок нет, миксы читаются', () => {
    const parsed = parseBackup(file({
      version: 2,
      jars: 'нет',
      mixes: [{ ...legacyMix([]), items: [{ flavors: ['мята'] }, { flavors: ['кислая вишня'] }] }]
    }), canonical);

    expect(parsed.jars).toEqual([]);
    expect(parsed.mixes).toHaveLength(1);
  });

  it('банка без вкусов => пропускается и считается в skipped', () => {
    const parsed = parseBackup(file({
      version: 2,
      jars: [{ id: 'j1', flavors: [] }, { id: 'j2', flavors: ['мята'] }],
      mixes: []
    }), canonical);

    expect(parsed.jars).toHaveLength(1);
    expect(parsed.skipped).toBe(1);
  });

  it('доля вне диапазона 0..100 => поле share сбрасывается', () => {
    const parsed = parseBackup(file({
      version: 2,
      mixes: [{
        ...legacyMix([]),
        items: [{ flavors: ['мята'], share: 140 }, { flavors: ['кислая вишня'], share: 30 }]
      }]
    }), canonical);

    expect(parsed.mixes[0].items[0].share).toBeUndefined();
    expect(parsed.mixes[0].items[1].share).toBe(30);
  });

  it('файл версии 2 => withGroups false и группы не читаются', () => {
    const parsed = parseBackup(file({
      version: 2,
      jars: [{ id: 'j1', flavors: ['мята'] }],
      mixes: [],
      groups: [{ id: 'g1', name: 'груша', flavors: ['груша', 'желтая груша'] }]
    }), canonical);

    expect(parsed.withGroups).toBe(false);
    expect(parsed.mixesOnly).toBe(false);
    expect(parsed.groups).toEqual([]);
  });

  it('файл версии 3 => withGroups true и группы читаются', () => {
    const parsed = parseBackup(file({
      version: 3,
      jars: [{ id: 'j1', flavors: ['мята'] }],
      mixes: [],
      groups: [{ id: 'g1', name: 'груша', flavors: ['груша', 'желтая груша'] }]
    }), canonical);

    expect(parsed.withGroups).toBe(true);
    expect(parsed.groups).toHaveLength(1);
  });

  it('негодная группа => попадает в skipped', () => {
    const parsed = parseBackup(file({
      version: 3,
      jars: [{ id: 'j1', flavors: ['мята'] }],
      mixes: [],
      groups: [{ id: 'g1', name: 'груша', flavors: ['груша'] }]
    }), canonical);

    expect(parsed.groups).toEqual([]);
    expect(parsed.skipped).toBe(1);
  });

  it('файл не разбирается => исключение с текстом про копию', () => {
    expect(() => parseBackup('это не json', canonical)).toThrow('Файл не похож на копию');
  });

  it('в файле нет ни банок, ни миксов => исключение', () => {
    expect(() => parseBackup(file({ version: 2, jars: [], mixes: [] }), canonical))
      .toThrow('В файле нет ни одной подходящей записи');
  });
});

describe('migrateJar', () => {
  it('вкусы банки не строки => банка пропускается', () => {
    expect(migrateJar({ id: 'j1', flavors: [42, null] }, new Set())).toBeUndefined();
  });

  it('банка без id => получает новый', () => {
    const jar = migrateJar({ flavors: ['мята'] }, new Set());

    expect(jar?.id).toBeTruthy();
  });

  it('id банки уже занят => выдаётся новый', () => {
    const used = new Set(['j1']);

    const jar = migrateJar({ id: 'j1', flavors: ['мята'] }, used);

    expect(jar?.id).not.toBe('j1');
  });
});
