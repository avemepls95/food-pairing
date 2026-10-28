import { NgTemplateOutlet } from '@angular/common';
import { Component, HostListener, inject, OnDestroy, OnInit, viewChild } from '@angular/core';
import { Aroma, aromaTest } from '../../Core/graph/aroma';
import { PairLevel } from '../../Core/graph/graph-data';
import { GraphDataService } from '../../Core/graph/graph-data.service';
import { buildGrouping, Grouping } from '../../Core/library/flavor-group';
import { newId } from '../../Core/library/id';
import { Jar } from '../../Core/library/jar';
import { LibraryStore } from '../../Core/library/library-store';
import { Mix, MixItem } from '../../Core/library/mix';
import { plural, PluralForms } from '../../Core/text/plural';
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
/** Пластина успевает свернуться до пересчёта выдачи. Столько же длится переход .pick-slot в стилях */
const HIDE_MS = 240;

/** Сила пары словом: цветную точку расшифровывает только легенда на вкладке «Граф» */
const LEVEL_WORDS: Record<PairLevel, string> = {
  red: 'сильная',
  yellow: 'хорошая',
  green: 'умеренная',
  blue: 'слабая',
  pale: 'едва заметная',
  unknown: 'нет данных'
};

const MIX_FORMS: PluralForms = ['микс', 'микса', 'миксов'];

interface Settings {
  jarCount: number | 'any';
  risk: Risk;
  usePersonal: boolean;
  answered: boolean;
  openShelf?: number;
}

@Component({
  selector: 'app-picks',
  imports: [AromaFilterComponent, FlavorGroupsComponent, MixFormComponent, NavComponent, NgTemplateOutlet],
  templateUrl: './picks.component.html',
  styleUrl: './picks.component.css'
})
export class PicksComponent implements OnInit, OnDestroy {
  private store = inject(LibraryStore);
  private data = inject(GraphDataService);
  private form = viewChild.required(MixFormComponent);
  private groupsForm = viewChild.required(FlavorGroupsComponent);
  private knows = (flavor: string) => !!this.data.node(flavor);
  private grouping: Grouping = buildGrouping([], () => false);
  private hideTimer: ReturnType<typeof setTimeout> | undefined;

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
  /** Ключ карточки с открытым разбором пар */
  details = '';
  /** Ключ карточки, которая сворачивается перед уходом из выдачи */
  leaving = '';
  /** Группа, с которой страница откроется в следующий раз */
  openShelf: number | undefined;

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

  ngOnDestroy(): void {
    clearTimeout(this.hideTimer);
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
      return;
    }
    this.expanded.add(shelf.jarCount);
    this.openShelf = shelf.jarCount;
    this.saveSettings();
  }

  shelfTitle(shelf: PickShelf): string {
    return `Из ${shelf.jarCount} банок`;
  }

  /** Число миксов в группе. Слово рядом с числом отличает счёт от балла */
  shelfCount(shelf: PickShelf): string {
    const count = shelf.items.length;

    return count ? `${count} ${plural(count, MIX_FORMS)}` : 'нет миксов';
  }

  /** Миксы группы, которые уже записаны в журнал и поэтому не предлагаются */
  journalSkipped(shelf: PickShelf): string {
    const parts: string[] = [];
    if (shelf.skippedTried) {
      parts.push(`попробовано ${shelf.skippedTried}`);
    }
    if (shelf.skippedPlanned) {
      parts.push(`в планах ${shelf.skippedPlanned}`);
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

  /** Что читает скринридер на штампе: сорт, балл и действие кнопки */
  scoreLabel(item: Recommendation): string {
    const action = this.details === this.cardKey(item) ? 'Скрыть разбор пар' : 'Показать разбор пар';

    return `${this.scoreWord(item.score)} микс, балл ${item.score} из 100. ${action}`;
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
    this.store.saveMix({
      id: newId(),
      items: this.toItems(item),
      category: 'planned',
      updatedAt: new Date().toISOString()
    });
    this.hide(this.cardKey(item), () => this.calculate(true));
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

  /** Разбор пар раскрыт у одной пластины, чтобы выдача оставалась короткой */
  toggleDetails(item: Recommendation): void {
    const key = this.cardKey(item);
    this.details = this.details === key ? '' : key;
  }

  @HostListener('document:keydown.escape')
  closeOnEscape(): void {
    this.details = '';
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
    this.hide(this.cardKey(item), () => this.calculate(true));
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
    // Записанный микс уходит из выдачи, и его пластина сворачивается так же, как от «В планы»
    this.hide(mix.items.map(item => item.jarId).join('+'), () => this.calculate(true));
  }

  /** Пластина сворачивается, и только потом выдача пересчитывается без неё */
  private hide(key: string, apply: () => void): void {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      apply();
      return;
    }
    this.leaving = key;
    this.hideTimer = setTimeout(apply, HIDE_MS);
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
      this.leaving = '';
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
      // Свёрнутую пластину отпускаем вместе с новой выдачей, в которой её уже нет
      this.leaving = '';
      if (!keepExpanded) {
        this.expanded = new Set(this.shelfToOpen(result.shelves));
      }
      this.calculating = false;
    });
  }

  /** Открытой остаётся группа, которую пользователь открывал последней, иначе первая */
  private shelfToOpen(shelves: PickShelf[]): number[] {
    const shelf = shelves.find(current => current.jarCount === this.openShelf) ?? shelves[0];

    return shelf ? [shelf.jarCount] : [];
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
      if (typeof settings.openShelf === 'number') {
        this.openShelf = settings.openShelf;
      }
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
        answered: this.answered,
        openShelf: this.openShelf
      } satisfies Settings));
    } catch {
      // не сохранили - не страшно
    }
  }
}
