import { NgTemplateOutlet } from '@angular/common';
import { afterNextRender, Component, ElementRef, inject, Injector, OnInit, viewChild } from '@angular/core';
import { GraphDataService } from '../../Core/graph/graph-data.service';
import { newId } from '../../Core/library/id';
import { LibraryStore } from '../../Core/library/library-store';
import { itemTitle, Mix, MixCategory, mixTitle } from '../../Core/library/mix';
import { MixFormComponent } from '../mix-form/mix-form.component';
import { NavComponent } from '../nav/nav.component';

@Component({
  selector: 'app-mixes',
  imports: [MixFormComponent, NavComponent, NgTemplateOutlet],
  templateUrl: './mixes.component.html',
  styleUrl: './mixes.component.css'
})
export class MixesComponent implements OnInit {
  private store = inject(LibraryStore);
  private data = inject(GraphDataService);
  private injector = inject(Injector);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private form = viewChild.required(MixFormComponent);

  readonly stars = [1, 2, 3, 4, 5];
  readonly itemTitle = itemTitle;

  mixes: Mix[] = [];
  tab: MixCategory = 'tried';
  bestFirst = true;
  justSavedId = '';
  status = '';

  async ngOnInit(): Promise<void> {
    // Справочник нужен, чтобы вкусы старых записей сошлись с графом
    await this.data.load().catch(() => undefined);
    this.store.load(text => this.data.canonical(text));
    this.mixes = this.store.mixes();
  }

  /** В копию уходит и полка, поэтому пустой список миксов выгрузку не отменяет */
  get canExport(): boolean {
    return !!this.mixes.length || !!this.store.jars().length;
  }

  get visibleMixes(): Mix[] {
    const newerFirst = (a: Mix, b: Mix) => b.updatedAt.localeCompare(a.updatedAt);
    const mixes = this.mixes.filter(mix => mix.category === this.tab);
    return this.tab === 'tried'
      ? mixes.sort((a, b) => (this.bestFirst ? 1 : -1) * ((b.rating ?? 0) - (a.rating ?? 0)) || newerFirst(a, b))
      : mixes.sort(newerFirst);
  }

  count(category: MixCategory): number {
    return this.mixes.filter(mix => mix.category === category).length;
  }

  hasBrands(mix: Mix): boolean {
    return mix.items.some(item => !!item.brand);
  }

  title(mix: Mix): string {
    return mixTitle(mix);
  }

  addMix(): void {
    this.form().open({
      id: newId(),
      items: [{ flavors: [] }, { flavors: [] }],
      category: this.tab,
      updatedAt: new Date().toISOString()
    }, true);
  }

  editMix(mix: Mix): void {
    this.form().open({ ...mix, items: mix.items.map(item => ({ ...item, flavors: [...item.flavors] })) }, false);
  }

  onSaved(mix: Mix): void {
    this.store.saveMix(mix);
    this.tab = mix.category;
    // Класс снимаем по таймеру, чтобы подсветка не повторилась при возврате на вкладку
    this.justSavedId = mix.id;
    setTimeout(() => (this.justSavedId = ''), 1500);
    this.mixes = this.store.mixes();
    // При сортировке по оценке микс может уехать далеко от начала списка
    afterNextRender(() => this.host.nativeElement.querySelector('.just-saved')?.scrollIntoView({ block: 'nearest' }),
      { injector: this.injector });
  }

  removeMix(mix: Mix): void {
    if (confirm(`Удалить микс "${this.title(mix)}"?`)) {
      this.store.removeMix(mix.id);
      this.mixes = this.store.mixes();
      this.status = '';
    }
  }

  exportBackup(): void {
    const file = new Blob([this.store.toBackupJson()], { type: 'application/json' });
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = `food-pairing-${new Date().toLocaleDateString('sv')}.json`;
    // Safari скачивает по такой ссылке, только если она есть в документе, и начинает загрузку не сразу
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    this.status = `Копия сохранена: банок ${this.store.jars().length}, миксов ${this.mixes.length}`;
  }

  async importBackup(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }

    try {
      const { jars, mixes, rejected, skipped, mixesOnly } = this.store.parseBackup(await file.text());
      const skippedNote = skipped
        ? `\nПропущено записей: ${skipped}. В них меньше двух позиций, нет оценки или нет вкусов.`
        : '';
      const what = mixesOnly
        ? `миксы из файла (${mixes.length}), полка останется на месте`
        : `полку (${jars.length}) и миксы (${mixes.length})`;
      if (confirm(`Заменить ${what}?${skippedNote}`)) {
        if (mixesOnly) {
          this.store.replaceMixes(mixes);
        } else {
          this.store.replaceAll({ jars, mixes, rejected });
        }
        this.mixes = this.store.mixes();
        if (!this.count(this.tab)) {
          this.tab = this.tab === 'tried' ? 'planned' : 'tried';
        }
        this.status = `Загружено: банок ${this.store.jars().length}, миксов ${mixes.length}`;
      }
    } catch (error) {
      this.status = (error as Error).message;
    }
  }
}
