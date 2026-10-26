import { Injectable } from '@angular/core';
import { FlavorGroup } from './flavor-group';
import { Jar } from './jar';
import { Backup, Canonical, Library, ParsedBackup, parseBackup, readLibrary, STORAGE_KEY, STORAGE_VERSION } from './library-data';
import { Mix } from './mix';

/**
 * Полка и миксы хранятся в localStorage браузера: одно устройство - свой список.
 */
@Injectable({ providedIn: 'root' })
export class LibraryStore {
  private library: Library = { jars: [], mixes: [], rejected: [], groups: [] };
  private loaded = false;
  private canonical: Canonical = () => undefined;

  /** Канонические имена приходят из справочника продуктов, поэтому чтение ждёт его загрузки */
  load(canonical: Canonical): void {
    this.canonical = canonical;
    if (this.loaded) {
      return;
    }
    this.library = readLibrary(localStorage, canonical);
    this.loaded = true;
  }

  parseBackup(json: string): ParsedBackup {
    return parseBackup(json, this.canonical);
  }

  jars(): Jar[] {
    return this.library.jars;
  }

  mixes(): Mix[] {
    return this.library.mixes;
  }

  rejected(): string[] {
    return this.library.rejected;
  }

  groups(): FlavorGroup[] {
    return this.library.groups;
  }

  saveGroup(group: FlavorGroup): void {
    const index = this.library.groups.findIndex(g => g.id === group.id);
    this.library.groups = index < 0
      ? [...this.library.groups, group]
      : this.library.groups.map(g => (g.id === group.id ? group : g));
    this.write();
  }

  removeGroup(id: string): void {
    this.library.groups = this.library.groups.filter(group => group.id !== id);
    this.write();
  }

  /** Набор вкусов, который больше не предлагаем */
  reject(key: string): void {
    if (this.library.rejected.includes(key)) {
      return;
    }
    this.library.rejected = [...this.library.rejected, key];
    this.write();
  }

  restoreRejected(): void {
    this.library.rejected = [];
    this.write();
  }

  saveJar(jar: Jar): void {
    const index = this.library.jars.findIndex(j => j.id === jar.id);
    this.library.jars = index < 0
      ? [...this.library.jars, jar]
      : this.library.jars.map(j => (j.id === jar.id ? jar : j));
    this.write();
  }

  removeJar(id: string): void {
    this.library.jars = this.library.jars.filter(jar => jar.id !== id);
    this.write();
  }

  saveMix(mix: Mix): void {
    const saved: Mix = { ...mix, updatedAt: new Date().toISOString() };
    const index = this.library.mixes.findIndex(m => m.id === saved.id);
    this.library.mixes = index < 0
      ? [...this.library.mixes, saved]
      : this.library.mixes.map(m => (m.id === saved.id ? saved : m));
    this.write();
  }

  removeMix(id: string): void {
    this.library.mixes = this.library.mixes.filter(mix => mix.id !== id);
    this.write();
  }

  replaceAll(library: Library): void {
    this.library = library;
    this.write();
  }

  replaceMixes(mixes: Mix[]): void {
    this.library = { ...this.library, mixes };
    this.write();
  }

  toBackupJson(): string {
    return JSON.stringify({ version: STORAGE_VERSION, ...this.library } satisfies Backup, null, 2);
  }

  private write(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, ...this.library } satisfies Backup));
    } catch {
      alert('Не удалось сохранить: браузер запретил запись в хранилище');
    }
  }
}
