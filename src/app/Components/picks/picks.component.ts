import { NgTemplateOutlet } from '@angular/common';
import { Component, HostListener, inject, OnInit, viewChild } from '@angular/core';
import { Aroma, aromaTest } from '../../Core/graph/aroma';
import { PairLevel } from '../../Core/graph/graph-data';
import { GraphDataService } from '../../Core/graph/graph-data.service';
import { buildGrouping, Grouping } from '../../Core/library/flavor-group';
import { newId } from '../../Core/library/id';
import { Jar } from '../../Core/library/jar';
import { LibraryStore } from '../../Core/library/library-store';
import { Mix, MixCategory, MixItem } from '../../Core/library/mix';
import { AromaFilterComponent } from '../aroma-filter/aroma-filter.component';
import { readAromas, writeAromas } from '../aroma-filter/aroma-storage';
import { FlavorGroupsComponent } from '../flavor-groups/flavor-groups.component';
import { MixFormComponent } from '../mix-form/mix-form.component';
import { NavComponent } from '../nav/nav.component';
import { groupContext, groupTest, shelfFlavorKey, withShelfJars } from './grouping';
import { PickShelf, PicksResult, Recommendation, Risk, ScoredPair } from './recommendation';
import { recommend } from './recommender';

const SETTINGS_KEY = 'food-pairing.picks-settings';
const AROMA_KEY = 'food-pairing.picks-aroma';
const PAGE_SIZE = 6;

/** Сила пары словом: цветную точку расшифровывает только легенда на вкладке «Граф» */
const LEVEL_WORDS: Record<PairLevel, string> = {
  red: 'сильная',
  yellow: 'хорошая',
  green: 'умеренная',
  blue: 'слабая',
  pale: 'едва заметная',
  unknown: 'нет данных'
};

interface Settings {
  jarCount: number | 'any';
  risk: Risk;
  usePersonal: boolean;
  answered: boolean;
}

@Component({
  selector: 'app-picks',
  imports: [AromaFilterComponent, FlavorGroupsComponent, MixFormComponent, NavComponent, NgTemplateOutlet],
  templateUrl: './picks.component.html',
  styleUrl: './picks.component.css'
})
export class PicksComponent implements OnInit {
  private store = inject(LibraryStore);
  private data = inject(GraphDataService);
  private form = viewChild.required(MixFormComponent);
  private groupsForm = viewChild.required(FlavorGroupsComponent);
  private knows = (flavor: string) => !!this.data.node(flavor);
  private grouping: Grouping = buildGrouping([], () => false);

  readonly jarCounts: (number | 'any')[] = [2, 3, 4, 5, 'any'];
  // Подписи короткие: втроём они делят ширину экрана, а смысл раскрывает подсказка под ними
  readonly risks: { value: Risk; label: string }[] = [
    { value: 'safe', label: 'Надёжные' },
    { value: 'balanced', label: 'Обычные' },
    { value: 'bold', label: 'Смелые' }
  ];
  readonly riskHints: Record<Risk, string> = {
    safe: 'Все пары умеренные и выше',
    balanced: 'Все пары описаны в таблицах',
    bold: 'Есть пара, которую никто не измерял'
  };
  readonly riskNames: Record<Risk, string> = {
    safe: 'надёжные',
    balanced: 'обычные',
    bold: 'смелые'
  };

  jars: Jar[] = [];
  /** Вкусы полки, которые знает справочник: только они попадают в подбор */
  shelfFlavors: string[] = [];
  groupCount = 0;
  aromas: Aroma[] = [];
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
  moreOpen = false;
  /** Ключ карточки с открытой подсказкой про данные */
  dataHelp = '';

  async ngOnInit(): Promise<void> {
    try {
      await this.data.load();
    } catch {
      this.loadError = 'Не удалось загрузить данные сочетаемости';
      return;
    }
    this.store.load(text => this.data.canonical(text));
    this.jars = this.store.jars();
    this.shelfFlavors = Array.from(new Set(this.jars.flatMap(jar => jar.flavors)))
      .filter(flavor => !!this.data.node(flavor));
    this.aromas = readAromas(AROMA_KEY);
    this.hasRatings = this.store.mixes().some(mix => mix.category === 'tried' && !!mix.rating);
    this.reloadGroups();
    this.restoreSettings();
    if (this.answered) {
      this.calculate();
    }
  }

  get enoughJars(): boolean {
    return this.jars.length >= 2;
  }

  countLabel(count: number | 'any'): string {
    return count === 'any' ? 'Любое' : String(count);
  }

  /** Что лежит в свёрнутой части настроек */
  get moreSummary(): string {
    const parts = [this.jarCount === 'any' ? 'банок: любое число' : `банок: ${this.jarCount}`];
    if (this.groupCount) {
      parts.push(`групп: ${this.groupCount}`);
    }
    if (this.hasRatings && this.usePersonal) {
      parts.push('с моими оценками');
    }
    return parts.join(' · ');
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

  setAromas(aromas: Aroma[]): void {
    this.aromas = aromas;
    this.limit = PAGE_SIZE;
    writeAromas(AROMA_KEY, aromas);
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
    return !!this.result?.shelves.some(shelf => shelf.items.length >= this.limit || shelf.hiddenRepeats > 0);
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

  levelWord(level: PairLevel): string {
    return LEVEL_WORDS[level];
  }

  /**
   * Ступени балла совпадают со ступенями таблиц: микс из жёлтых пар набирает 77,
   * из зелёных 60, из синих 46.
   */
  scoreWord(score: number): string {
    if (score >= 75) {
      return 'отличный';
    }
    if (score >= 58) {
      return 'неплохой';
    }

    return score >= 44 ? 'так себе' : 'рискованный';
  }

  /** Ступень балла для плашки: сплошной штамп получает только высший сорт */
  scoreTier(score: number): string {
    if (score >= 75) {
      return 'top';
    }

    return score >= 58 ? 'mid' : 'low';
  }

  componentTitle(jar: Jar): string {
    return jar.name || jar.flavors.join(' + ');
  }

  addToPlanned(item: Recommendation): void {
    this.saveMix(item, 'planned');
  }

  openGroups(): void {
    this.groupsForm().open();
  }

  onGroupsChanged(): void {
    this.reloadGroups();
    this.calculate(true);
  }

  /** Состав групп пары и пометка про одну сторону */
  pairTitle(pair: ScoredPair): string {
    const parts = [pair.a, pair.b]
      .filter(name => this.grouping.isGroup(name))
      .map(name => `${name}: ${this.grouping.flavorsOf(name).join(', ')}`);
    if (pair.sides < 2) {
      parts.push('Пару описала только одна из двух таблиц');
    }

    return parts.join('\n');
  }

  cardKey(item: Recommendation): string {
    return item.jarIds.join('+');
  }

  toggleDataHelp(item: Recommendation): void {
    const key = this.cardKey(item);
    this.dataHelp = this.dataHelp === key ? '' : key;
  }

  @HostListener('document:click', ['$event'])
  closeDataHelp(event: MouseEvent): void {
    if (this.dataHelp && !(event.target as Element).closest('.data-help')) {
      this.dataHelp = '';
    }
  }

  @HostListener('document:keydown.escape')
  closeOnEscape(): void {
    this.dataHelp = '';
  }

  /** Вкусы микса без своей таблицы. У группы таблица есть, если она есть хотя бы у одного её вкуса */
  thinFlavors(item: Recommendation): string[] {
    return item.flavors.filter(name => !this.grouping.flavorsOf(name).some(flavor => this.data.hasTable(flavor)));
  }

  oneTablePairs(item: Recommendation): number {
    return item.pairs.filter(pair => pair.sides === 1).length;
  }

  noTablePairs(item: Recommendation): number {
    return item.pairs.filter(pair => !pair.sides).length;
  }

  /** Больше не предлагать этот набор вкусов. Запрет записан вкусами банок, без групп */
  reject(item: Recommendation): void {
    this.store.reject(shelfFlavorKey(item.jarIds, this.jars, this.knows));
    this.calculate(true);
  }

  restoreRejected(): void {
    this.store.restoreRejected();
    this.calculate(true);
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
      const grouping = this.grouping;
      const result = recommend({
        jarCount: this.jarCount,
        risk: this.risk,
        usePersonal: this.usePersonal && this.hasRatings,
        limit: this.limit,
        aromas: this.aromas
          .map(aroma => groupTest(aromaTest(aroma, flavor => this.data.categoryOf(flavor)), grouping))
      }, groupContext({
        jars: this.jars,
        mixes: this.store.mixes(),
        rejected: this.store.rejected(),
        level: (a, b) => this.data.level(a, b),
        sides: (a, b) => this.data.sides(a, b),
        categoryOf: flavor => this.data.categoryOf(flavor),
        knows: this.knows,
        hasTable: flavor => this.data.hasTable(flavor)
      }, grouping));
      this.result = withShelfJars(result, this.jars);
      if (!keepExpanded) {
        this.expanded = new Set(result.chosen ? [result.chosen] : []);
      }
      this.calculating = false;
    });
  }

  private reloadGroups(): void {
    const groups = this.store.groups();
    this.groupCount = groups.length;
    this.grouping = buildGrouping(groups, this.knows);
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
