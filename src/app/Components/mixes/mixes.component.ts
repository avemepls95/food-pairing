import { Component, ElementRef, inject, OnInit, viewChild, viewChildren } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NavComponent } from '../nav/nav.component';
import { isMixValid, Mix, MixCategory, MIX_MIN_ITEMS, newMixId } from './mix';
import { MixesStore } from './mixes-store';

@Component({
  selector: 'app-mixes',
  imports: [FormsModule, NavComponent],
  templateUrl: './mixes.component.html',
  styleUrls: ['./mixes.component.css']
})
export class MixesComponent implements OnInit {
  private store = inject(MixesStore);
  private formDialog = viewChild.required<ElementRef<HTMLDialogElement>>('formDialog');
  private flavorInputs = viewChildren<ElementRef<HTMLInputElement>>('flavorInput');

  readonly stars = [1, 2, 3, 4, 5];
  readonly minItems = MIX_MIN_ITEMS;

  mixes: Mix[] = [];
  tab: MixCategory = 'tried';
  bestFirst = true;
  draft: Mix | undefined;
  isNewMix = false;
  justSavedId = '';
  status = '';

  ngOnInit(): void {
    this.mixes = this.store.list();
  }

  get visibleMixes(): Mix[] {
    const mixes = this.mixes.filter(mix => mix.category === this.tab);
    return this.tab === 'tried'
      ? mixes.sort((a, b) => (this.bestFirst ? 1 : -1) * ((b.rating ?? 0) - (a.rating ?? 0))
          || b.updatedAt.localeCompare(a.updatedAt))
      : mixes.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  count(category: MixCategory): number {
    return this.mixes.filter(mix => mix.category === category).length;
  }

  hasBrands(mix: Mix): boolean {
    return mix.items.some(item => !!item.brand);
  }

  title(mix: Mix): string {
    return mix.name || mix.items.map(item => item.flavor).join(' + ');
  }

  addMix(): void {
    this.isNewMix = true;
    this.openDialog({
      id: newMixId(),
      items: [{ flavor: '' }, { flavor: '' }],
      category: this.tab,
      updatedAt: new Date().toISOString()
    });
  }

  editMix(mix: Mix): void {
    this.isNewMix = false;
    this.openDialog({ ...mix, items: mix.items.map(item => ({ ...item })) });
  }

  closeDialog(): void {
    this.formDialog().nativeElement.close();
    this.draft = undefined;
  }

  /**
   * У модального окна клик мимо содержимого приходит на сам dialog. Проверяем и нажатие, и отпускание:
   * иначе выделение текста мышью, законченное над фоном, закроет форму.
   */
  onDialogPointerDown(event: PointerEvent): void {
    this.pressedOnBackdrop = event.target === this.formDialog().nativeElement;
  }

  onDialogClick(event: MouseEvent): void {
    if (this.pressedOnBackdrop && event.target === this.formDialog().nativeElement) {
      this.closeDialog();
    }
  }

  addItem(): void {
    this.draft?.items.push({ flavor: '' });
    // Новая строка появляется под липким футером, поэтому переводим фокус на неё
    queueMicrotask(() => {
      const inputs = this.flavorInputs();
      inputs[inputs.length - 1]?.nativeElement.focus();
    });
  }

  removeItem(index: number): void {
    this.draft?.items.splice(index, 1);
  }

  setCategory(category: MixCategory): void {
    if (this.draft) {
      this.draft.category = category;
    }
  }

  get draftValid(): boolean {
    return !!this.draft && isMixValid(this.draft);
  }

  /** Чего не хватает, чтобы сохранить */
  get draftProblem(): string {
    if (!this.draft || this.draftValid) {
      return '';
    }
    const filled = this.draft.items.filter(item => item.flavor.trim()).length;
    return filled < this.minItems
      ? `Нужно ещё ${this.minItems - filled} вкус${this.minItems - filled > 1 ? 'а' : ''}`
      : 'Поставьте оценку';
  }

  saveDraft(): void {
    if (!this.draft || !this.draftValid) {
      return;
    }
    const draft = this.draft;
    this.store.save({
      ...draft,
      name: draft.name?.trim() || undefined,
      rating: draft.category === 'tried' ? draft.rating : undefined,
      items: draft.items
        .filter(item => item.flavor.trim())
        .map(item => ({ brand: item.brand?.trim() || undefined, flavor: item.flavor.trim() }))
    });
    this.tab = draft.category;
    this.justSavedId = draft.id;
    this.mixes = this.store.list();
    this.closeDialog();
  }

  removeMix(mix: Mix): void {
    if (confirm(`Удалить микс "${this.title(mix)}"?`)) {
      this.store.remove(mix.id);
      this.mixes = this.store.list();
    }
  }

  exportBackup(): void {
    const file = new Blob([this.store.toBackupJson()], { type: 'application/json' });
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = `mixes-${new Date().toLocaleDateString('sv')}.json`;
    // Safari скачивает по такой ссылке, только если она есть в документе, и начинает загрузку не сразу
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    this.status = `Копия сохранена, миксов: ${this.mixes.length}`;
  }

  async importBackup(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }

    try {
      const { mixes, skipped } = this.store.parseBackup(await file.text());
      const skippedNote = skipped ? `, записей не по правилам: ${skipped}` : '';
      if (confirm(`Заменить текущий список (${this.mixes.length}) на миксы из файла (${mixes.length}${skippedNote})?`)) {
        this.store.replaceAll(mixes);
        this.mixes = this.store.list();
        this.status = `Загружено миксов: ${mixes.length}`;
      }
    } catch (error) {
      this.status = `Не удалось прочитать файл: ${(error as Error).message}`;
    }
  }

  private pressedOnBackdrop = false;

  // Модальное окно: пока форма открыта, до остальных миксов не добраться
  private openDialog(draft: Mix): void {
    this.status = '';
    this.pressedOnBackdrop = false;
    this.draft = draft;
    this.formDialog().nativeElement.showModal();
  }
}
