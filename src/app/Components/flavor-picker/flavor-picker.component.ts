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
  /** Вкусы, занятые чужой группой: вкус к имени группы */
  lockedBy = input<Record<string, string>>({});
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
    const group = this.lockedBy()[flavor];
    return group ? `в группе «${group}»` : '';
  }
}
