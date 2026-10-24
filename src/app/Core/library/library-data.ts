import { newId } from './id';
import { Jar } from './jar';
import { isMixValid, Mix, MixCategory, MixItem } from './mix';

export interface Backup {
  version: number;
  jars?: unknown;
  mixes?: unknown;
}

export interface Library {
  jars: Jar[];
  mixes: Mix[];
}

export interface ParsedBackup extends Library {
  /** Сколько записей файла не прошли правила */
  skipped: number;
  /** Файл старого формата: в нём только миксы, полку он не описывает */
  mixesOnly: boolean;
}

/** Приводит написание из таблиц к каноническому имени справочника */
export type Canonical = (text: string) => string | undefined;

export const STORAGE_KEY = 'food-pairing.library';
const LEGACY_MIXES_KEY = 'food-pairing.mixes';
export const STORAGE_VERSION = 2;

const asText = (value: unknown): string | undefined => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || undefined;
};

const asShare = (value: unknown): number | undefined => {
  const share = Math.round(Number(value));
  return Number.isFinite(share) && share > 0 && share <= 100 ? share : undefined;
};

const takeId = (value: unknown, usedIds: Set<string>): string => {
  const id = typeof value === 'string' && value && !usedIds.has(value) ? value : newId();
  usedIds.add(id);
  return id;
};

/** Старая позиция микса держала один вкус текстом в поле flavor */
const itemFlavors = (raw: Record<string, unknown>, canonical: Canonical): string[] => {
  const list = Array.isArray(raw['flavors']) ? raw['flavors'] : [raw['flavor']];
  // Разные написания одного вкуса сходятся в одно имя, и повтор сломал бы список чипов в форме
  return Array.from(new Set(list
    .map(value => asText(value))
    .filter((text): text is string => !!text)
    .map(text => canonical(text) ?? text)));
};

/** Файл и хранилище мог собрать кто угодно, поэтому приводим типы и выбрасываем мусор */
export function migrateMix(raw: unknown, usedIds: Set<string>, canonical: Canonical): Mix {
  const mix = (raw ?? {}) as Record<string, unknown>;
  const category: MixCategory = mix['category'] === 'planned' ? 'planned' : 'tried';
  const rating = Math.round(Number(mix['rating']));
  const items = Array.isArray(mix['items']) ? mix['items'] : [];

  return {
    id: takeId(mix['id'], usedIds),
    name: asText(mix['name']),
    items: items
      .map(item => {
        const source = (item ?? {}) as Record<string, unknown>;
        return {
          jarId: asText(source['jarId']),
          brand: asText(source['brand']),
          name: asText(source['name']),
          flavors: itemFlavors(source, canonical),
          share: asShare(source['share'])
        } satisfies MixItem;
      })
      .filter(item => item.flavors.length),
    rating: category === 'tried' && rating >= 1 && rating <= 5 ? rating : undefined,
    category,
    updatedAt: asText(mix['updatedAt']) ?? new Date().toISOString()
  };
}

export function migrateJar(raw: unknown, usedIds: Set<string>): Jar | undefined {
  const jar = (raw ?? {}) as Record<string, unknown>;
  const flavors = Array.isArray(jar['flavors'])
    ? jar['flavors'].map(value => asText(value)).filter((text): text is string => !!text)
    : [];
  if (!flavors.length) {
    return undefined;
  }

  return {
    id: takeId(jar['id'], usedIds),
    brand: asText(jar['brand']),
    name: asText(jar['name']),
    flavors: Array.from(new Set(flavors))
  };
}

function migrateLibrary(backup: Backup, canonical: Canonical): ParsedBackup {
  const jarIds = new Set<string>();
  const mixIds = new Set<string>();
  const rawJars = Array.isArray(backup.jars) ? backup.jars : [];
  const rawMixes = Array.isArray(backup.mixes) ? backup.mixes : [];

  const jars = rawJars.map(jar => migrateJar(jar, jarIds)).filter((jar): jar is Jar => !!jar);
  const mixes = rawMixes.map(mix => migrateMix(mix, mixIds, canonical)).filter(isMixValid);

  return {
    jars,
    mixes,
    skipped: rawJars.length - jars.length + (rawMixes.length - mixes.length),
    mixesOnly: backup.version < STORAGE_VERSION
  };
}

/**
 * Разбирает файл резервной копии. Текст исключения показываем пользователю.
 */
export function parseBackup(json: string, canonical: Canonical): ParsedBackup {
  let backup: Backup;
  try {
    backup = JSON.parse(json) as Backup;
  } catch {
    throw new Error('Файл не похож на копию');
  }
  if (!backup || typeof backup !== 'object' || (!Array.isArray(backup.mixes) && !Array.isArray(backup.jars))) {
    throw new Error('Файл не похож на копию');
  }

  const parsed = migrateLibrary(backup, canonical);
  if (!parsed.jars.length && !parsed.mixes.length) {
    throw new Error('В файле нет ни одной подходящей записи');
  }

  return parsed;
}

/**
 * Читает библиотеку, подхватывая старый ключ с одними миксами.
 */
export function readLibrary(storage: Pick<Storage, 'getItem'>, canonical: Canonical): Library {
  // Хранилище недоступно в приватном режиме, а содержимое мог испортить импорт чужого файла
  try {
    const stored = storage.getItem(STORAGE_KEY) ?? storage.getItem(LEGACY_MIXES_KEY);
    if (!stored) {
      return { jars: [], mixes: [] };
    }
    const { jars, mixes } = migrateLibrary(JSON.parse(stored) as Backup, canonical);
    return { jars, mixes };
  } catch {
    return { jars: [], mixes: [] };
  }
}
