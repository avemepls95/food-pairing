import { Component, ElementRef, inject, output, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CategoryGroup } from '../../Core/graph/graph-data';
import { GraphDataService } from '../../Core/graph/graph-data.service';
import { FlavorGroup, nameConflict } from '../../Core/library/flavor-group';
import { addableSuggestions, Suggestion, suggestGroups } from '../../Core/library/group-suggestions';
import { newId } from '../../Core/library/id';
import { LibraryStore } from '../../Core/library/library-store';
import { plural, PluralForms } from '../../Core/text/plural';
import { FlavorPickerComponent } from '../flavor-picker/flavor-picker.component';

type Tab = 'suggestions' | 'mine';

interface Draft {
  /** Пусто у новой группы */
  id?: string;
  name: string;
  flavors: string[];
}

const MIN_FLAVORS = 2;
const GROUP_FORMS: PluralForms = ['группу', 'группы', 'групп'];

@Component({
  selector: 'app-flavor-groups',
  imports: [FlavorPickerComponent, FormsModule],
  templateUrl: './flavor-groups.component.html',
  styleUrl: './flavor-groups.component.css'
})
export class FlavorGroupsComponent {
  private store = inject(LibraryStore);
  private data = inject(GraphDataService);
  private groupsDialog = viewChild.required<ElementRef<HTMLDialogElement>>('groupsDialog');
  private canonical = (text: string) => this.data.canonical(text);
  private touched = false;

  changed = output<void>();

  tab: Tab = 'suggestions';
  groups: FlavorGroup[] = [];
  suggestions: Suggestion[] = [];
  checked = new Set<string>();
  draft: Draft | undefined;
  /** Вкусы чужих групп для выбора вкусов */
  locked: Record<string, string> = {};

  open(): void {
    this.touched = false;
    this.draft = undefined;
    this.checked.clear();
    this.refresh();
    this.tab = this.groups.length ? 'mine' : 'suggestions';
    this.groupsDialog().nativeElement.showModal();
  }

  close(): void {
    this.groupsDialog().nativeElement.close();
  }

  /** Выдачу пересчитываем только после правок */
  onClose(): void {
    this.draft = undefined;
    if (this.touched) {
      this.touched = false;
      this.changed.emit();
    }
  }

  categories(): CategoryGroup[] {
    return this.data.grouped();
  }

  isKnown(flavor: string): boolean {
    return !!this.data.node(flavor);
  }

  /** Группа, где известных вкусов меньше двух, в подборе не строится */
  isActive(group: FlavorGroup): boolean {
    return group.flavors.filter(flavor => this.isKnown(flavor)).length >= MIN_FLAVORS;
  }

  isChecked(name: string): boolean {
    return this.checked.has(name);
  }

  toggleSuggestion(name: string): void {
    if (!this.checked.delete(name)) {
      this.checked.add(name);
    }
  }

  get allChecked(): boolean {
    return this.suggestions.length > 0 && this.checked.size === this.suggestions.length;
  }

  toggleAll(): void {
    this.checked = this.allChecked ? new Set() : new Set(this.suggestions.map(item => item.name));
  }

  /** Отмеченные подсказки, которые не отнимают вкус друг у друга */
  private addable(): Suggestion[] {
    return addableSuggestions(this.suggestions.filter(suggestion => this.checked.has(suggestion.name)));
  }

  get addCount(): number {
    return this.addable().length;
  }

  addLabel(): string {
    const count = this.addCount;

    return `Добавить ${count} ${plural(count, GROUP_FORMS)}`;
  }

  addChecked(): void {
    this.addable().forEach(suggestion => this.store.saveGroup({
      id: newId(),
      name: suggestion.name,
      flavors: [...suggestion.flavors]
    }));
    this.checked.clear();
    this.change();
    this.tab = 'mine';
  }

  startDraft(): void {
    this.draft = { name: '', flavors: [] };
    this.lockFlavors();
  }

  editGroup(group: FlavorGroup): void {
    this.draft = { id: group.id, name: group.name, flavors: [...group.flavors] };
    this.lockFlavors();
  }

  cancelDraft(): void {
    this.draft = undefined;
  }

  toggleDraftFlavor(flavor: string): void {
    const draft = this.draft;
    if (!draft) {
      return;
    }
    draft.flavors = draft.flavors.includes(flavor)
      ? draft.flavors.filter(current => current !== flavor)
      : [...draft.flavors, flavor];
  }

  removeGroup(group: FlavorGroup): void {
    if (confirm(`Удалить группу «${group.name}»?`)) {
      this.store.removeGroup(group.id);
      this.change();
    }
  }

  /** Чего не хватает, чтобы сохранить */
  get draftProblem(): string {
    const draft = this.draft;
    if (!draft) {
      return '';
    }
    const name = draft.name.trim();
    if (!name) {
      return 'Назовите группу';
    }
    const conflict = nameConflict(name, draft.flavors, this.groups, this.canonical, draft.id);
    if (conflict === 'group') {
      return 'Так уже называется другая группа';
    }
    if (conflict === 'flavor') {
      return `«${name}» это вкус справочника, включите его в группу или назовите её иначе`;
    }

    return draft.flavors.length < MIN_FLAVORS ? 'Выберите хотя бы два вкуса' : '';
  }

  get draftValid(): boolean {
    return !!this.draft && !this.draftProblem;
  }

  saveDraft(): void {
    const draft = this.draft;
    if (!draft || !this.draftValid) {
      return;
    }
    this.store.saveGroup({ id: draft.id ?? newId(), name: draft.name.trim(), flavors: [...draft.flavors] });
    this.draft = undefined;
    this.change();
  }

  private change(): void {
    this.touched = true;
    this.refresh();
  }

  private refresh(): void {
    this.groups = this.store.groups();
    this.suggestions = suggestGroups(this.categories(), this.groups);
  }

  private lockFlavors(): void {
    const locked: Record<string, string> = {};
    this.groups
      .filter(group => group.id !== this.draft?.id)
      .forEach(group => group.flavors.forEach(flavor => locked[flavor] = group.name));
    this.locked = locked;
  }
}
