import { afterNextRender, Component, ElementRef, HostListener, inject, Injector, output, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FlavorGroup } from '../../Core/graph/graph-data';
import { GraphDataService } from '../../Core/graph/graph-data.service';
import { isMixValid, Mix, MixCategory, MIX_MIN_ITEMS } from '../../Core/library/mix';
import { FlavorPickerComponent } from '../flavor-picker/flavor-picker.component';

@Component({
  selector: 'app-mix-form',
  imports: [FlavorPickerComponent, FormsModule],
  templateUrl: './mix-form.component.html',
  styleUrl: './mix-form.component.css'
})
export class MixFormComponent {
  private data = inject(GraphDataService);
  private injector = inject(Injector);
  private formDialog = viewChild.required<ElementRef<HTMLDialogElement>>('formDialog');
  private pressedOnBackdrop = false;

  readonly stars = [1, 2, 3, 4, 5];
  readonly minItems = MIX_MIN_ITEMS;

  saved = output<Mix>();

  draft: Mix | undefined;
  isNewMix = false;
  /** Для какой позиции открыт выбор вкусов */
  pickerIndex = -1;

  open(draft: Mix, isNewMix: boolean): void {
    this.isNewMix = isNewMix;
    this.pressedOnBackdrop = false;
    this.pickerIndex = -1;
    this.draft = draft;
    this.formDialog().nativeElement.showModal();
  }

  close(): void {
    this.formDialog().nativeElement.close();
    this.draft = undefined;
  }

  groups(): FlavorGroup[] {
    return this.data.grouped();
  }

  /** Вкус из старой записи, которого нет в справочнике: в подборе он не участвует */
  isKnown(flavor: string): boolean {
    return !!this.data.node(flavor);
  }

  /**
   * Нажатие мимо содержимого формы закрывает её. Отпускание кнопки мыши проверяем тоже,
   * чтобы выделение текста, законченное над фоном, форму оставило открытой.
   */
  onDialogPointerDown(event: PointerEvent): void {
    this.pressedOnBackdrop = this.isOutsideForm(event);
  }

  onDialogClick(event: MouseEvent): void {
    if (this.pressedOnBackdrop && this.isOutsideForm(event)) {
      this.close();
    }
    this.pressedOnBackdrop = false;
  }

  @HostListener('document:keydown.escape')
  closePickerOnEscape(): void {
    this.pickerIndex = -1;
  }

  addItem(): void {
    this.draft?.items.push({ flavors: [] });
    const index = (this.draft?.items.length ?? 1) - 1;
    this.pickerIndex = index;
    // Новая строка появляется под липким футером, поэтому показываем её целиком
    afterNextRender(() => this.scrollToPicker(), { injector: this.injector });
  }

  removeItem(index: number): void {
    this.draft?.items.splice(index, 1);
    this.pickerIndex = -1;
  }

  togglePicker(index: number): void {
    this.pickerIndex = this.pickerIndex === index ? -1 : index;
    if (this.pickerIndex === index) {
      afterNextRender(() => this.scrollToPicker(), { injector: this.injector });
    }
  }

  toggleFlavor(index: number, flavor: string): void {
    const item = this.draft?.items[index];
    if (!item) {
      return;
    }
    item.flavors = item.flavors.includes(flavor)
      ? item.flavors.filter(current => current !== flavor)
      : [...item.flavors, flavor];
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
    const filled = this.draft.items.filter(item => item.flavors.length).length;
    if (filled < this.minItems) {
      const left = this.minItems - filled;
      return `Нужно ещё ${left} ${left > 1 ? 'позиции со вкусом' : 'позиция со вкусом'}`;
    }
    return 'Поставьте оценку';
  }

  save(): void {
    if (!this.draft || !this.draftValid) {
      return;
    }
    const draft = this.draft;
    this.saved.emit({
      ...draft,
      name: draft.name?.trim() || undefined,
      rating: draft.category === 'tried' ? draft.rating : undefined,
      items: draft.items
        .filter(item => item.flavors.length)
        .map(item => ({
          ...item,
          brand: item.brand?.trim() || undefined,
          name: item.name?.trim() || undefined
        }))
    });
    this.close();
  }

  private scrollToPicker(): void {
    this.formDialog().nativeElement.querySelector('.item-row.picking')?.scrollIntoView({ block: 'nearest' });
  }

  private isOutsideForm(event: MouseEvent): boolean {
    const box = this.formDialog().nativeElement.getBoundingClientRect();
    return event.clientX < box.left || event.clientX > box.right
      || event.clientY < box.top || event.clientY > box.bottom;
  }
}
