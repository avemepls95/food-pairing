import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { categoryColor } from '../../Core/graph/categories';
import { FlavorGroup } from '../../Core/graph/graph-data';
import { filterGroups } from './flavor-filter';

@Component({
  selector: 'app-flavor-picker',
  imports: [FormsModule],
  templateUrl: './flavor-picker.component.html',
  styleUrl: './flavor-picker.component.css'
})
export class FlavorPickerComponent {
  groups = input.required<FlavorGroup[]>();
  selected = input.required<string[]>();
  placeholder = input('Поиск вкуса');
  toggled = output<string>();

  searchTerm = '';

  get filteredGroups(): FlavorGroup[] {
    return filterGroups(this.groups(), this.searchTerm);
  }

  color(category: string): string {
    return categoryColor(category);
  }

  isSelected(flavor: string): boolean {
    return this.selected().includes(flavor);
  }
}
