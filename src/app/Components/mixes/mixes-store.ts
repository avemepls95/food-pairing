import { Injectable } from '@angular/core';
import { isMixValid, Mix, MixCategory, MixItem, newMixId } from './mix';

interface Backup {
  version: number;
  mixes: Mix[];
}

export interface ParsedBackup {
  mixes: Mix[];
  /** Сколько записей файла не прошли правила */
  skipped: number;
}

const STORAGE_KEY = 'food-pairing.mixes';
const STORAGE_VERSION = 1;

const asText = (value: unknown): string | undefined => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || undefined;
};

/**
 * Миксы хранятся в localStorage браузера: одно устройство - свой список.
 */
@Injectable({ providedIn: 'root' })
export class MixesStore {
  private mixes: Mix[] = this.read();

  list(): Mix[] {
    return this.mixes;
  }

  save(mix: Mix): void {
    const saved: Mix = { ...mix, updatedAt: new Date().toISOString() };
    const index = this.mixes.findIndex(m => m.id === saved.id);
    this.mixes = index < 0
      ? [...this.mixes, saved]
      : this.mixes.map(m => (m.id === saved.id ? saved : m));
    this.write();
  }

  remove(id: string): void {
    this.mixes = this.mixes.filter(mix => mix.id !== id);
    this.write();
  }

  replaceAll(mixes: Mix[]): void {
    this.mixes = mixes;
    this.write();
  }

  toBackupJson(): string {
    return JSON.stringify({ version: STORAGE_VERSION, mixes: this.mixes } satisfies Backup, null, 2);
  }

  /**
   * Разбирает файл резервной копии. Текст исключения показываем пользователю.
   * Записи, не прошедшие правила (меньше двух вкусов, "попробовал" без оценки), в список не попадают.
   */
  parseBackup(json: string): ParsedBackup {
    let backup: Backup;
    try {
      backup = JSON.parse(json) as Backup;
    } catch {
      throw new Error('Файл не похож на копию миксов');
    }
    if (!backup || !Array.isArray(backup.mixes)) {
      throw new Error('Файл не похож на копию миксов');
    }

    const ids = new Set<string>();
    const mixes = backup.mixes.map(mix => this.normalize(mix, ids)).filter(isMixValid);
    if (!mixes.length) {
      throw new Error('В файле нет ни одного подходящего микса');
    }

    return { mixes, skipped: backup.mixes.length - mixes.length };
  }

  /** Файл мог быть собран чем угодно, поэтому приводим типы и выбрасываем мусор */
  private normalize(mix: Mix, usedIds: Set<string>): Mix {
    const items = Array.isArray(mix?.items) ? mix.items : [];
    const category: MixCategory = mix?.category === 'planned' ? 'planned' : 'tried';
    const rating = Math.round(Number(mix?.rating));
    const id = typeof mix?.id === 'string' && !usedIds.has(mix.id) ? mix.id : newMixId();
    usedIds.add(id);

    return {
      id,
      name: asText(mix?.name),
      items: items
        .map((item: MixItem) => ({ brand: asText(item?.brand), flavor: asText(item?.flavor) ?? '' }))
        .filter(item => item.flavor),
      rating: category === 'tried' && rating >= 1 && rating <= 5 ? rating : undefined,
      category,
      updatedAt: typeof mix?.updatedAt === 'string' ? mix.updatedAt : new Date().toISOString()
    };
  }

  private read(): Mix[] {
    // Хранилище недоступно в приватном режиме, а содержимое мог испортить импорт чужого файла
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const mixes = stored ? (JSON.parse(stored) as Backup).mixes : [];
      return Array.isArray(mixes) ? mixes : [];
    } catch {
      return [];
    }
  }

  private write(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, mixes: this.mixes } satisfies Backup));
    } catch {
      alert('Не удалось сохранить миксы: браузер запретил запись в хранилище');
    }
  }
}
