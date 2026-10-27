import { Component, inject, input, output } from '@angular/core';
import { categoryColor } from '../../Core/graph/categories';
import { GraphDataService } from '../../Core/graph/graph-data.service';
import { PairSection } from './pair-sections';

@Component({
  selector: 'app-pair-list',
  templateUrl: './pair-list.component.html',
  styleUrl: './pair-list.component.css'
})
export class PairListComponent {
  private data = inject(GraphDataService);

  sections = input.required<PairSection[]>();
  selected = input.required<string[]>();
  toggled = output<string>();

  /** При одном выбранном продукте вторая сторона в каждой строке одна и та же, поэтому её не пишем */
  get showPartner(): boolean {
    return this.selected().length > 1;
  }

  category(flavor: string): string {
    return this.data.categoryOf(flavor) ?? 'Без категории';
  }

  color(flavor: string): string {
    return categoryColor(this.category(flavor));
  }

  isSelected(flavor: string): boolean {
    return this.selected().includes(flavor);
  }
}
