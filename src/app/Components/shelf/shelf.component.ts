import { Component, ElementRef, inject, OnInit, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CategoryGroup } from '../../Core/graph/graph-data';
import { GraphDataService } from '../../Core/graph/graph-data.service';
import { newId } from '../../Core/library/id';
import { Jar, jarTitle } from '../../Core/library/jar';
import { LibraryStore } from '../../Core/library/library-store';
import { FlavorPickerComponent } from '../flavor-picker/flavor-picker.component';
import { NavComponent } from '../nav/nav.component';

@Component({
  selector: 'app-shelf',
  imports: [FlavorPickerComponent, FormsModule, NavComponent],
  templateUrl: './shelf.component.html',
  styleUrl: './shelf.component.css'
})
export class ShelfComponent implements OnInit {
  private store = inject(LibraryStore);
  private data = inject(GraphDataService);
  private formDialog = viewChild.required<ElementRef<HTMLDialogElement>>('formDialog');
  private pressedOnBackdrop = false;

  jars: Jar[] = [];
  draft: Jar | undefined;
  isNewJar = false;
  status = '';
  loadError = '';

  async ngOnInit(): Promise<void> {
    try {
      await this.data.load();
    } catch {
      this.loadError = 'Не удалось загрузить справочник вкусов';
    }
    this.store.load(text => this.data.canonical(text));
    this.jars = this.store.jars();
  }

  groups(): CategoryGroup[] {
    return this.data.grouped();
  }

  title(jar: Jar): string {
    return jarTitle(jar);
  }

  isKnown(flavor: string): boolean {
    return !!this.data.node(flavor);
  }

  get flavorCount(): number {
    return new Set(this.jars.flatMap(jar => jar.flavors)).size;
  }

  /** Отмечены вкусы всех банок, даже если в банке их несколько */
  get shelfFlavors(): string[] {
    return this.jars.flatMap(jar => jar.flavors);
  }

  /**
   * Галочка заводит банку на один вкус. Снятие убирает только нетронутую банку:
   * бренд, название и второй вкус означают, что её заполняли руками.
   */
  toggleFlavor(flavor: string): void {
    const owners = this.jars.filter(jar => jar.flavors.includes(flavor));
    if (!owners.length) {
      this.store.saveJar({ id: newId(), flavors: [flavor] });
      this.jars = this.store.jars();
      this.status = '';
      return;
    }

    const plain = owners.find(jar => jar.flavors.length === 1 && !jar.brand && !jar.name);
    if (plain) {
      this.store.removeJar(plain.id);
      this.jars = this.store.jars();
      this.status = '';
      return;
    }

    this.status = `Вкус «${flavor}» стоит в банке «${this.title(owners[0])}». Уберите его в карточке банки`;
  }

  addJar(): void {
    this.openDialog({ id: newId(), flavors: [] }, true);
  }

  editJar(jar: Jar): void {
    this.openDialog({ ...jar, flavors: [...jar.flavors] }, false);
  }

  removeJar(jar: Jar): void {
    if (confirm(`Убрать с полки «${this.title(jar)}»?`)) {
      this.store.removeJar(jar.id);
      this.jars = this.store.jars();
      this.status = '';
    }
  }

  toggleDraftFlavor(flavor: string): void {
    if (!this.draft) {
      return;
    }
    this.draft.flavors = this.draft.flavors.includes(flavor)
      ? this.draft.flavors.filter(current => current !== flavor)
      : [...this.draft.flavors, flavor];
  }

  closeDialog(): void {
    this.formDialog().nativeElement.close();
    this.draft = undefined;
  }

  onDialogPointerDown(event: PointerEvent): void {
    this.pressedOnBackdrop = this.isOutsideForm(event);
  }

  onDialogClick(event: MouseEvent): void {
    if (this.pressedOnBackdrop && this.isOutsideForm(event)) {
      this.closeDialog();
    }
    this.pressedOnBackdrop = false;
  }

  saveDraft(): void {
    if (!this.draft?.flavors.length) {
      return;
    }
    this.store.saveJar({
      ...this.draft,
      brand: this.draft.brand?.trim() || undefined,
      name: this.draft.name?.trim() || undefined
    });
    this.jars = this.store.jars();
    this.status = '';
    this.closeDialog();
  }

  private openDialog(draft: Jar, isNewJar: boolean): void {
    this.isNewJar = isNewJar;
    this.pressedOnBackdrop = false;
    this.draft = draft;
    this.formDialog().nativeElement.showModal();
  }

  private isOutsideForm(event: MouseEvent): boolean {
    const box = this.formDialog().nativeElement.getBoundingClientRect();
    return event.clientX < box.left || event.clientX > box.right
      || event.clientY < box.top || event.clientY > box.bottom;
  }
}
