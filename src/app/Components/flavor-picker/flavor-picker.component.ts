import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { categoryColor } from '../../Core/graph/categories';
import { CategoryGroup } from '../../Core/graph/graph-data';
import { filterGroups } from './flavor-filter';

@Component({
  selector: 'app-flavor-picker',
  imports: [FormsModule],
  templateUrl: './flavor-picker.component.html',
  styleUrl: './flavor-picker.component.css'
})
export class FlavorPickerComponent {
  groups = input.required<CategoryGroup[]>();
  selected = input.required<string[]>();
  placeholder = input('Поиск вкуса');
  /** Вкусы, которые уже заняты: вкус к имени владельца */
  lockedBy = input<Record<string, string>>({});
  /** Кто владелец в подсказке: «в группе», «в банке» */
  lockLabel = input('в группе');
  toggled = output<string>();

  searchTerm = '';

  get filteredGroups(): CategoryGroup[] {
    return filterGroups(this.groups(), this.searchTerm);
  }

  color(category: string): string {
    return categoryColor(category);
  }

  isSelected(flavor: string): boolean {
    return this.selected().includes(flavor);
  }

  lockHint(flavor: string): string {
    const owner = this.lockedBy()[flavor];
    return owner ? `${this.lockLabel()} «${owner}»` : '';
  }
}
