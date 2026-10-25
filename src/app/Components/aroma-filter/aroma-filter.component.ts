import { Component, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Aroma, aromaLabel, availableMoods, Mood, MOODS, moodTest, sameAroma } from '../../Core/graph/aroma';
import { GraphDataService } from '../../Core/graph/graph-data.service';
import { toSearchKey } from '../flavor-picker/flavor-filter';

const SUGGESTIONS = 8;
/** Сколько вкусов настроения перечислять в подсказке */
const LISTED = 6;

const byName = (a: string, b: string) => a.localeCompare(b, 'ru');

@Component({
  selector: 'app-aroma-filter',
  imports: [FormsModule],
  templateUrl: './aroma-filter.component.html',
  styleUrl: './aroma-filter.component.css'
})
export class AromaFilterComponent {
  private data = inject(GraphDataService);

  /** Вкусы, из которых собрана страница: полка или журнал миксов */
  flavors = input.required<string[]>();
  selected = input.required<Aroma[]>();
  /** Где лежат вкусы, для подсказок: «на полке», «в миксах» */
  where = input.required<string>();
  changed = output<Aroma[]>();

  term = '';

  private categoryOf = (flavor: string) => this.data.categoryOf(flavor);

  get chosenFlavors(): string[] {
    return this.selected().flatMap(aroma => (aroma.kind === 'flavor' ? [aroma.name] : []));
  }

  get chosenMoods(): Mood[] {
    return MOODS.filter(mood => this.isMoodSelected(mood));
  }

  /** Настроения, которые есть среди вкусов страницы. Выбранное остаётся на месте, даже если вкусы ушли */
  get moods(): Mood[] {
    const available = new Set(availableMoods(this.flavors(), this.categoryOf).map(mood => mood.id));
    return MOODS.filter(mood => available.has(mood.id) || this.isMoodSelected(mood));
  }

  get suggestions(): Aroma[] {
    const key = toSearchKey(this.term.trim());
    if (!key) {
      return [];
    }
    const moods: Aroma[] = this.moods
      .filter(mood => toSearchKey(mood.label).includes(key))
      .map(mood => ({ kind: 'mood', id: mood.id }));
    // Сначала вкусы, которые с запроса начинаются: на «мят» мята важнее перечной мяты
    const starts = (flavor: string) => Number(toSearchKey(flavor).startsWith(key));
    const flavors: Aroma[] = Array.from(new Set(this.flavors()))
      .filter(flavor => toSearchKey(flavor).includes(key))
      .sort((a, b) => starts(b) - starts(a) || byName(a, b))
      .map(name => ({ kind: 'flavor', name }));

    return moods.concat(flavors).filter(aroma => !this.isSelected(aroma)).slice(0, SUGGESTIONS);
  }

  get nothingFound(): string {
    const where = this.where();
    return `${where.charAt(0).toUpperCase()}${where.slice(1)} такого вкуса нет`;
  }

  label(aroma: Aroma): string {
    return aromaLabel(aroma);
  }

  key(aroma: Aroma): string {
    return `${aroma.kind}:${aromaLabel(aroma)}`;
  }

  isMoodSelected(mood: Mood): boolean {
    return this.selected().some(aroma => aroma.kind === 'mood' && aroma.id === mood.id);
  }

  /** Какие вкусы страницы подходят под настроение */
  moodFlavors(mood: Mood): string {
    const flavors = Array.from(new Set(this.flavors())).filter(moodTest(mood, this.categoryOf)).sort(byName);
    if (!flavors.length) {
      return `${this.where()} таких вкусов нет`;
    }
    const listed = flavors.slice(0, LISTED).join(', ');
    return flavors.length > LISTED ? `${listed} и ещё ${flavors.length - LISTED}` : listed;
  }

  toggleMood(mood: Mood): void {
    this.toggle({ kind: 'mood', id: mood.id });
  }

  removeFlavor(name: string): void {
    this.toggle({ kind: 'flavor', name });
  }

  pick(aroma: Aroma): void {
    this.term = '';
    this.toggle(aroma);
  }

  /** Enter в поиске берёт первую подсказку */
  pickFirst(): void {
    const first = this.suggestions[0];
    if (first) {
      this.pick(first);
    }
  }

  clear(): void {
    this.term = '';
    this.changed.emit([]);
  }

  private isSelected(aroma: Aroma): boolean {
    return this.selected().some(chosen => sameAroma(chosen, aroma));
  }

  private toggle(aroma: Aroma): void {
    const selected = this.selected();
    this.changed.emit(this.isSelected(aroma)
      ? selected.filter(chosen => !sameAroma(chosen, aroma))
      : [...selected, aroma]);
  }
}
