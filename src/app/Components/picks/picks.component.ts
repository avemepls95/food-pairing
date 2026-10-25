import { Component, inject, OnInit, viewChild } from '@angular/core';
import { GraphDataService } from '../../Core/graph/graph-data.service';
import { newId } from '../../Core/library/id';
import { Jar } from '../../Core/library/jar';
import { LibraryStore } from '../../Core/library/library-store';
import { Mix, MixCategory, MixItem } from '../../Core/library/mix';
import { MixFormComponent } from '../mix-form/mix-form.component';
import { NavComponent } from '../nav/nav.component';
import { PickShelf, PicksResult, Recommendation, Risk } from './recommendation';
import { recommend } from './recommender';

const SETTINGS_KEY = 'food-pairing.picks-settings';
const PAGE_SIZE = 6;

interface Settings {
  jarCount: number | 'any';
  risk: Risk;
  usePersonal: boolean;
  answered: boolean;
}

@Component({
  selector: 'app-picks',
  imports: [MixFormComponent, NavComponent],
  templateUrl: './picks.component.html',
  styleUrl: './picks.component.css'
})
export class PicksComponent implements OnInit {
  private store = inject(LibraryStore);
  private data = inject(GraphDataService);
  private form = viewChild.required(MixFormComponent);

  readonly jarCounts: (number | 'any')[] = [2, 3, 4, 5, 'any'];
  readonly risks: { value: Risk; label: string }[] = [
    { value: 'safe', label: 'Проверенные' },
    { value: 'balanced', label: 'Сбалансированные' },
    { value: 'bold', label: 'Смелые' }
  ];
  readonly riskHints: Record<Risk, string> = {
    safe: 'Все пары описаны как сильные: зелёный уровень и выше',
    balanced: 'Все пары описаны в таблицах',
    bold: 'Есть пара, которую никто не измерял'
  };
  readonly riskNames: Record<Risk, string> = {
    safe: 'проверенные',
    balanced: 'сбалансированные',
    bold: 'смелые'
  };

  jars: Jar[] = [];
  answered = false;
  jarCount: number | 'any' = 'any';
  risk: Risk = 'balanced';
  usePersonal = true;
  hasRatings = false;
  limit = PAGE_SIZE;
  result: PicksResult | undefined;
  calculating = false;
  loadError = '';
  expanded = new Set<number>();

  async ngOnInit(): Promise<void> {
    try {
      await this.data.load();
    } catch {
      this.loadError = 'Не удалось загрузить данные сочетаемости';
      return;
    }
    this.store.load(text => this.data.canonical(text));
    this.jars = this.store.jars();
    this.hasRatings = this.store.mixes().some(mix => mix.category === 'tried' && !!mix.rating);
    this.restoreSettings();
    if (this.answered) {
      this.calculate();
    }
  }

  get enoughJars(): boolean {
    return this.jars.length >= 2;
  }

  countLabel(count: number | 'any'): string {
    return count === 'any' ? 'Неважно' : String(count);
  }

  setJarCount(count: number | 'any'): void {
    this.jarCount = count;
    this.answered = true;
    this.limit = PAGE_SIZE;
    this.saveSettings();
    this.calculate();
  }

  setRisk(risk: Risk): void {
    if (this.risk === risk) {
      return;
    }
    this.risk = risk;
    this.limit = PAGE_SIZE;
    this.saveSettings();
    this.calculate();
  }

  togglePersonal(): void {
    this.usePersonal = !this.usePersonal;
    this.saveSettings();
    this.calculate();
  }

  showMore(): void {
    this.limit += PAGE_SIZE;
    this.calculate(true);
  }

  get canShowMore(): boolean {
    return !!this.result?.shelves.some(shelf => shelf.items.length >= this.limit);
  }

  isExpanded(shelf: PickShelf): boolean {
    return this.jarCount !== 'any' || this.expanded.has(shelf.jarCount);
  }

  toggleShelf(shelf: PickShelf): void {
    if (this.expanded.has(shelf.jarCount)) {
      this.expanded.delete(shelf.jarCount);
    } else {
      this.expanded.add(shelf.jarCount);
    }
  }

  shelfTitle(shelf: PickShelf): string {
    return `Из ${shelf.jarCount} банок`;
  }

  /** Почему микс оказался в выдаче */
  reason(item: Recommendation): string {
    const parts: string[] = [];
    const strongest = [...item.pairs].sort((a, b) => b.weight - a.weight)[0];
    if (item.pairs.every(pair => pair.level === 'red')) {
      parts.push('все пары красные');
    } else if (strongest?.level === 'red') {
      parts.push(`красная пара: ${strongest.a} и ${strongest.b}`);
    }
    const accent = item.components.find(component => component.role === 'accent');
    if (accent) {
      parts.push(`${accent.jar.flavors.join(' и ')} даёт акцент`);
    }
    if (item.personal > 0) {
      parts.push('вкусы из миксов с высокой оценкой');
    }
    return parts.join(', ');
  }

  roleLabel(role: string): string {
    return role === 'base' ? 'основа' : role === 'accent' ? 'акцент' : 'дополнение';
  }

  levelClass(level: string): string {
    return level === 'unknown' ? 'level-none' : `level-${level}`;
  }

  componentTitle(jar: Jar): string {
    return jar.name || jar.flavors.join(' + ');
  }

  addToPlanned(item: Recommendation): void {
    this.saveMix(item, 'planned');
  }

  openTriedForm(item: Recommendation): void {
    this.form().open({
      id: newId(),
      items: this.toItems(item),
      category: 'tried',
      updatedAt: new Date().toISOString()
    }, true);
  }

  onSaved(mix: Mix): void {
    this.store.saveMix(mix);
    this.hasRatings = this.store.mixes().some(saved => saved.category === 'tried' && !!saved.rating);
    this.calculate();
  }

  private saveMix(item: Recommendation, category: MixCategory): void {
    this.store.saveMix({
      id: newId(),
      items: this.toItems(item),
      category,
      updatedAt: new Date().toISOString()
    });
    this.calculate();
  }

  private toItems(item: Recommendation): MixItem[] {
    return item.components.map(component => ({
      jarId: component.jar.id,
      brand: component.jar.brand,
      name: component.jar.name,
      flavors: [...component.jar.flavors],
      share: component.share
    }));
  }

  /**
   * Перебор занимает десятки миллисекунд, и на это время страница показывает "Считаю".
   * Кадр между показом и счётом даёт браузеру нарисовать нажатую кнопку.
   */
  private calculate(keepExpanded = false): void {
    if (!this.enoughJars) {
      this.result = undefined;
      return;
    }
    this.calculating = true;
    setTimeout(() => {
      const result = recommend({
        jarCount: this.jarCount,
        risk: this.risk,
        usePersonal: this.usePersonal && this.hasRatings,
        limit: this.limit
      }, {
        jars: this.jars,
        mixes: this.store.mixes(),
        level: (a, b) => this.data.level(a, b),
        categoryOf: flavor => this.data.categoryOf(flavor),
        knows: flavor => !!this.data.node(flavor),
        hasTable: flavor => this.data.hasTable(flavor)
      });
      this.result = result;
      if (!keepExpanded) {
        this.expanded = new Set(result.chosen ? [result.chosen] : []);
      }
      this.calculating = false;
    });
  }

  private restoreSettings(): void {
    // В приватном режиме браузер запрещает доступ к хранилищу
    try {
      const saved = localStorage.getItem(SETTINGS_KEY);
      if (!saved) {
        return;
      }
      const settings = JSON.parse(saved) as Partial<Settings>;
      if (settings.jarCount === 'any' || typeof settings.jarCount === 'number') {
        this.jarCount = settings.jarCount;
      }
      if (settings.risk && settings.risk in this.riskNames) {
        this.risk = settings.risk;
      }
      this.usePersonal = settings.usePersonal !== false;
      this.answered = !!settings.answered;
    } catch {
      // настройки необязательные, работаем со значениями по умолчанию
    }
  }

  private saveSettings(): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({
        jarCount: this.jarCount,
        risk: this.risk,
        usePersonal: this.usePersonal,
        answered: this.answered
      } satisfies Settings));
    } catch {
      // не сохранили - не страшно
    }
  }
}
