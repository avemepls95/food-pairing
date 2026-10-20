import { Component, ElementRef, HostListener, inject, NgZone, OnDestroy, OnInit, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import * as d3 from 'd3';
import { NavComponent } from '../nav/nav.component';
import { buildGraph, GraphLink, GraphNode, Level, PairingTable, Product } from './graph-data';

interface Node extends GraphNode, d3.SimulationNodeDatum {
  hidden?: boolean;
}

interface SimLink extends d3.SimulationLinkDatum<Node> {
  source: Node;
  target: Node;
  value: Level;
}

type Mode = 'strict' | 'extended';

type LinkSelection = d3.Selection<SVGLineElement, SimLink, SVGGElement, unknown>;
type NodeSelection = d3.Selection<SVGCircleElement, Node, SVGGElement, unknown>;
type LabelSelection = d3.Selection<SVGGElement, Node, SVGGElement, unknown>;

const SETTINGS_KEY = 'food-pairing.graph-settings';

const CATEGORY_COLORS: Record<string, string> = {
  'Ягоды': '#ff6b6b',
  'Цитрус': '#feca57',
  'Фрукты': '#1dd1a1',
  'Травы': '#6ab04c',
  'Специи': '#e67e22',
  'Орехи': '#8d6e63',
  'Гастро': '#576574',
  'Напитки': '#54a0ff',
  'Десерт': '#c49c9c',
  'Цветы': '#f368e0',
  'Растения': '#0c830c',
  'Овощи': '#5f27cd',
  'Без категории': '#8395a7'
};

const DEFAULT_CATEGORY_COLOR = '#8395a7';

@Component({
  selector: 'app-graph',
  imports: [FormsModule, NavComponent],
  templateUrl: './graph.component.html',
  styleUrl: './graph.component.css'
})
export class GraphComponent implements OnInit, OnDestroy {
  private zone = inject(NgZone);
  private graphContainer = viewChild.required<ElementRef<HTMLElement>>('graphContainer');
  private svg: d3.Selection<SVGSVGElement, unknown, null, undefined> | undefined;
  private zoom: d3.ZoomBehavior<SVGSVGElement, unknown> | undefined;
  private simulation: d3.Simulation<Node, SimLink> | undefined;
  private resizeObserver: ResizeObserver | undefined;
  private redrawHandle = 0;
  private redrawTimeout: ReturnType<typeof setTimeout> | undefined;
  private laidOutOnce = false;
  private destroyed = false;

  filtersOpen = true;
  fullscreen = false;
  modeHelpOpen = false;
  graphEmpty = false;
  loadError = '';
  note = '';
  canShowHidden = false;
  mode: Mode = 'extended';
  graph: { nodes: Node[]; links: GraphLink[] } = { nodes: [], links: [] };
  filteredLinks: GraphLink[] = [];
  selectedProducts: string[] = [];
  searchTerm = '';
  groupedProducts: { category: string; items: string[] }[] = [];

  filter: Record<Level, boolean> = {
    red: true,
    yellow: false,
    green: false,
    blue: false
  };

  // По убыванию сочетаемости
  readonly levels: { color: Level; label: string }[] = [
    { color: 'red', label: 'Красный' },
    { color: 'yellow', label: 'Жёлтый' },
    { color: 'green', label: 'Зелёный' },
    { color: 'blue', label: 'Синий' }
  ];

  async ngOnInit(): Promise<void> {
    this.restoreSettings();
    await this.loadData();
  }

  async loadData(): Promise<void> {
    this.loadError = '';
    let tables: PairingTable[];
    let products: Product[];
    try {
      [tables, products] = await Promise.all([
        this.fetchJson<PairingTable[]>('data/tables.json'),
        this.fetchJson<Product[]>('data/products.json')
      ]);
    } catch (error) {
      console.error(error);
      this.loadError = 'Не удалось загрузить данные';
      return;
    }

    // Пока грузились данные, со страницы могли уйти
    if (this.destroyed) {
      return;
    }
    this.graph = buildGraph(tables, products);
    this.groupProducts();
    this.applyFilter(true);

    // Размер графа меняется при скрытии фильтров и повороте экрана
    this.resizeObserver = new ResizeObserver(() => this.zone.runOutsideAngular(() => this.fitToView()));
    this.resizeObserver.observe(this.graphContainer().nativeElement);
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.redrawHandle);
    clearTimeout(this.redrawTimeout);
    this.resizeObserver?.disconnect();
    this.simulation?.stop();
  }

  // Тап по некликабельному элементу iOS Safari не превращает в click на документе, поэтому слушаем pointerdown
  @HostListener('document:pointerdown', ['$event'])
  closeModeHelpOnOutsideClick(event: PointerEvent): void {
    if (this.modeHelpOpen && !(event.target as Element).closest('.help')) {
      this.modeHelpOpen = false;
    }
  }

  @HostListener('document:keydown.escape')
  closeOnEscape(): void {
    this.modeHelpOpen = false;
    this.fullscreen = false;
  }

  // Граф занимает весь экран, шапка и фильтры прячутся. Режим свой, потому что на iPhone
  // Fullscreen API работает только для видео
  toggleFullscreen(): void {
    this.fullscreen = !this.fullscreen;
  }

  applyFilter(immediate = false): void {
    let visibleLinks = this.graph.links.filter(link => this.shouldShowLink(link));

    if (this.selectedProducts.length) {
      const selected = new Set(this.selectedProducts);
      visibleLinks = visibleLinks.filter(link => this.matchesSelection(link, selected));
    }

    this.filteredLinks = visibleLinks;
    this.updateNodesVisibility();
    this.updateNote();
    this.renderGraph(immediate);
  }

  /**
   * В расширенном режиме показываем выбранные продукты и всё, что с ними сочетается,
   * в точном - только связи между выбранными.
   */
  private matchesSelection(link: GraphLink, selected: Set<string>): boolean {
    return this.mode === 'strict'
      ? selected.has(link.source) && selected.has(link.target)
      : selected.has(link.source) || selected.has(link.target);
  }

  /**
   * Собирает подсказку о пустом графе. Выбранный продукт без связей выглядит так, будто он
   * ни с чем не сочетается, хотя связи могли остаться за фильтром по цвету или за режимом.
   */
  private updateNote(): void {
    const selected = new Set(this.selectedProducts);
    const hiddenByColor = selected.size
      ? this.graph.links.filter(link => !this.shouldShowLink(link) && this.matchesSelection(link, selected)).length
      : 0;

    const parts: string[] = [];
    if (selected.size && !this.filteredLinks.length) {
      parts.push(this.emptyReason(selected.size));
    }
    if (hiddenByColor) {
      parts.push(`скрыто фильтром по цвету: ${hiddenByColor}`);
    }

    this.note = parts.join(', ');
    this.canShowHidden = hiddenByColor > 0;
  }

  private emptyReason(selectedCount: number): string {
    if (this.mode !== 'strict') {
      return 'Связей не нашлось';
    }
    return selectedCount > 1
      ? 'Между выбранными продуктами связей нет'
      : 'В точном режиме нужно выбрать хотя бы два продукта';
  }

  showAllLevels(): void {
    this.filter = { red: true, yellow: true, green: true, blue: true };
    this.saveSettings();
    this.applyFilter();
  }

  getFilterValue(color: Level): boolean {
    return this.filter[color];
  }

  toggleFilter(color: Level): void {
    this.filter[color] = !this.filter[color];
    this.saveSettings();
    this.applyFilter();
  }

  setMode(mode: Mode): void {
    if (this.mode === mode) {
      return;
    }
    this.mode = mode;
    this.saveSettings();
    this.applyFilter();
  }

  getCategoryColor(category: string): string {
    return CATEGORY_COLORS[category] ?? DEFAULT_CATEGORY_COLOR;
  }

  toggleProductSelection(product: string): void {
    this.selectedProducts = this.selectedProducts.includes(product)
      ? this.selectedProducts.filter(p => p !== product)
      : [...this.selectedProducts, product];

    this.applyFilter();
  }

  get filteredGroups(): { category: string; items: string[] }[] {
    if (!this.searchTerm) {
      return this.groupedProducts;
    }

    const term = toSearchKey(this.searchTerm.trim());
    return this.groupedProducts
      .map(group => ({
        ...group,
        items: group.items.filter(item =>
          toSearchKey(item).includes(term) || toSearchKey(group.category).includes(term))
      }))
      .filter(group => group.items.length > 0);
  }

  // Выбранные цвета и режим переживают перезагрузку, выбранные продукты - нет
  private restoreSettings(): void {
    // В приватном режиме браузер запрещает доступ к хранилищу
    try {
      const saved = localStorage.getItem(SETTINGS_KEY);
      if (!saved) {
        return;
      }
      const settings = JSON.parse(saved) as { filter?: Partial<Record<Level, unknown>>; mode?: unknown };
      for (const level of this.levels) {
        const value = settings.filter?.[level.color];
        if (typeof value === 'boolean') {
          this.filter[level.color] = value;
        }
      }
      this.mode = settings.mode === 'strict' ? 'strict' : 'extended';
    } catch {
      // настройки необязательные, работаем со значениями по умолчанию
    }
  }

  private saveSettings(): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ filter: this.filter, mode: this.mode }));
    } catch {
      // не сохранили - не страшно
    }
  }

  private async fetchJson<T>(url: string): Promise<T> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`${url}: ${response.status}`);
    }
    return response.json() as Promise<T>;
  }

  private shouldShowLink(link: GraphLink): boolean {
    return this.filter[link.value] ?? false;
  }

  private updateNodesVisibility(): void {
    const visibleNodes = new Set<string>(this.selectedProducts);
    this.filteredLinks.forEach(link => {
      visibleNodes.add(link.source);
      visibleNodes.add(link.target);
    });

    this.graph.nodes.forEach(node => {
      node.hidden = !visibleNodes.has(node.id);
    });

    this.graphEmpty = visibleNodes.size === 0;
  }

  /**
   * Полная перерисовка большого графа занимает на телефоне сотни миллисекунд. Сначала ждём кадр,
   * потом задачу: к этому моменту браузер уже показал нажатый чекбокс или кнопку. Подряд идущие
   * вызовы схлопываются в один. Рисуем вне зоны Angular, чтобы тики симуляции и события
   * drag/zoom не запускали проверку изменений.
   */
  private renderGraph(immediate: boolean): void {
    cancelAnimationFrame(this.redrawHandle);
    clearTimeout(this.redrawTimeout);
    if (immediate) {
      this.zone.runOutsideAngular(() => this.drawGraph());
      return;
    }
    this.redrawHandle = requestAnimationFrame(() => {
      this.redrawTimeout = setTimeout(() => this.zone.runOutsideAngular(() => this.drawGraph()));
    });
  }

  private drawGraph(): void {
    // Старая симуляция после перетаскивания ещё остывает и продолжает двигать те же объекты узлов
    this.simulation?.stop();

    const containerElement = this.graphContainer().nativeElement;
    const width = containerElement.clientWidth || 800;
    const height = containerElement.clientHeight || 600;

    const host = d3.select(containerElement);
    host.selectAll('*').remove();
    this.svg = host.append('svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .style('display', 'block');

    const container = this.svg.append('g').classed('container', true);

    const visibleNodes = this.graph.nodes.filter(node => !node.hidden);
    const nodeById = new Map(visibleNodes.map(node => [node.id, node]));
    const simLinks: SimLink[] = this.filteredLinks.map(link => ({
      source: nodeById.get(link.source)!,
      target: nodeById.get(link.target)!,
      value: link.value
    }));

    this.simulation = d3.forceSimulation<Node, SimLink>(visibleNodes)
      .force('link', d3.forceLink<Node, SimLink>(simLinks).distance(100))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('collision', d3.forceCollide().radius(35).strength(0.8))
      .force('x', d3.forceX(width / 2).strength(0.1))
      .force('y', d3.forceY(height / 2).strength(0.1))
      .alphaDecay(0.05)
      .velocityDecay(0.3)
      .stop();

    // Раскладку считаем сразу до конца, без анимации, потому что вписать граф в экран можно только
    // по итоговым позициям. Узлы хранят координаты между перерисовками, поэтому после первой раскладки
    // хватает короткого догона, и граф не перетасовывается целиком от одного нового продукта
    const startAlpha = this.laidOutOnce ? 0.3 : 1;
    this.simulation.alpha(startAlpha);
    const ticksToSettle = Math.ceil(
      Math.log(this.simulation.alphaMin() / startAlpha) / Math.log(1 - this.simulation.alphaDecay())
    );
    this.simulation.tick(ticksToSettle);
    this.laidOutOnce ||= visibleNodes.length > 0;

    const selectOnClick = (event: MouseEvent, d: Node) => {
      // defaultPrevented - значит узел тащили
      if (!event.defaultPrevented) {
        this.zone.run(() => this.toggleProductSelection(d.id));
      }
    };

    const links: LinkSelection = container.append('g')
      .selectAll<SVGLineElement, SimLink>('line')
      .data(simLinks)
      .enter()
      .append('line')
      .attr('class', d => `link level-${d.value}`);

    const nodes: NodeSelection = container.append('g')
      .selectAll<SVGCircleElement, Node>('circle')
      .data(visibleNodes)
      .enter()
      .append('circle')
      .attr('r', 15)
      .attr('fill', d => this.getCategoryColor(d.category))
      .classed('selected', d => this.selectedProducts.includes(d.id))
      .on('click', selectOnClick);

    // Подпись - такая же кнопка выбора, как и сам узел: на вписанном графе узел меньше пальца
    const labels: LabelSelection = container.append('g')
      .selectAll<SVGGElement, Node>('g.text-node')
      .data(visibleNodes)
      .enter()
      .append('g')
      .classed('text-node', true)
      .classed('selected', d => this.selectedProducts.includes(d.id))
      .on('click', selectOnClick);
    this.wrapText(labels);

    let dragging: { links: LinkSelection; node: NodeSelection; label: LabelSelection } | undefined;
    nodes.call(d3.drag<SVGCircleElement, Node>()
      // Второе касание на узле оставляем жесту масштабирования
      .filter(event => !event.ctrlKey && !event.button && (event.touches?.length ?? 1) < 2)
      .on('start', (_event, d) => {
        d.fx = d.x;
        d.fy = d.y;
        // Жест двигает только сам узел с подписью и связями: пересчёт всех сил на каждый кадр
        // не успевал за пальцем, а раскладка теряла привычный вид
        dragging = {
          links: links.filter(link => link.source === d || link.target === d),
          node: nodes.filter(node => node === d),
          label: labels.filter(node => node === d)
        };
      })
      .on('drag', (event, d) => {
        d.x = d.fx = event.x;
        d.y = d.fy = event.y;
        if (dragging) {
          this.placeElements(dragging.links, dragging.node, dragging.label);
        }
      })
      .on('end', (_event, d) => {
        d.fx = null;
        d.fy = null;
        dragging = undefined;
      }));

    this.placeElements(links, nodes, labels);

    // Масштаб уходит в стили, чтобы подпись выбранного продукта держала один размер на экране.
    // Переменную ставим только на выбранные подписи: с переменной на всём графе каждый шаг зума
    // пересчитывал стили трёх тысяч элементов
    const selectedLabels = labels.filter(d => this.selectedProducts.includes(d.id));
    this.zoom = d3.zoom<SVGSVGElement, unknown>()
      // Нижняя граница маленькая: большой граф на телефоне вписывается с сильным уменьшением
      .scaleExtent([0.05, 4])
      .on('zoom', event => {
        container.attr('transform', event.transform);
        selectedLabels.style('--zoom', event.transform.k);
      });

    this.svg.call(this.zoom);
    // Двойной тап по узлу выбирает продукт дважды, зум по нему не нужен
    this.svg.on('dblclick.zoom', null);

    this.fitToView();
  }

  private placeElements(links: LinkSelection, nodes: NodeSelection, labels: LabelSelection): void {
    links
      .attr('x1', d => d.source.x ?? 0)
      .attr('y1', d => d.source.y ?? 0)
      .attr('x2', d => d.target.x ?? 0)
      .attr('y2', d => d.target.y ?? 0);

    nodes
      .attr('cx', d => d.x ?? 0)
      .attr('cy', d => d.y ?? 0);

    labels.attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`);
  }

  // Масштаб и сдвиг, при которых все видимые узлы с подписями помещаются в контейнер. Крупнее 1:1 не увеличивает
  fitToView(): void {
    const containerElement = this.graphContainer().nativeElement;
    const nodes = this.graph.nodes.filter(node => !node.hidden);
    if (!this.svg || !this.zoom || !containerElement.clientWidth || !nodes.length) {
      return;
    }

    const width = containerElement.clientWidth;
    const height = containerElement.clientHeight;
    this.svg.attr('viewBox', `0 0 ${width} ${height}`);

    // Отступы под радиус узла и подпись: по бокам - половина ширины длинного слова, снизу - до трёх строк
    const x0 = Math.min(...nodes.map(n => n.x ?? 0)) - 40;
    const x1 = Math.max(...nodes.map(n => n.x ?? 0)) + 40;
    const y0 = Math.min(...nodes.map(n => n.y ?? 0)) - 20;
    const y1 = Math.max(...nodes.map(n => n.y ?? 0)) + 55;

    // Нижняя граница совпадает с границей зума, чтобы первый жест не дёргал граф к допустимому масштабу
    const scale = Math.max(0.05, Math.min(1, width / (x1 - x0), height / (y1 - y0)));
    const transform = d3.zoomIdentity
      .translate(width / 2 - scale * (x0 + x1) / 2, height / 2 - scale * (y0 + y1) / 2)
      .scale(scale);
    this.svg.call(this.zoom.transform, transform);
  }

  /**
   * Подпись в несколько строк, по строке на слово. Смещения строк в em, поэтому они растут
   * вместе со шрифтом выбранной подписи.
   */
  private wrapText(selection: LabelSelection): void {
    selection.each(function (this: SVGGElement, d: Node) {
      // Цвет и обводка подписи - в глобальных стилях, чтобы следовать теме
      d3.select(this).append('text')
        .attr('text-anchor', 'middle')
        .attr('font-size', '10px')
        .selectAll('tspan')
        .data(d.name.split(/\s+/))
        .enter()
        .append('tspan')
        .attr('x', 0)
        // Первая строка идёт ниже кружка узла
        .attr('dy', (_, i) => (i ? '1.1em' : '2.2em'))
        .text(word => word);
    });
  }

  private groupProducts(): void {
    const categories = new Map<string, string[]>();

    this.graph.nodes.forEach(node => {
      const category = node.category || 'Без категории';
      if (!categories.has(category)) {
        categories.set(category, []);
      }
      categories.get(category)?.push(node.name);
    });

    this.groupedProducts = Array.from(categories.entries()).map(([category, items]) => ({
      category,
      items: items.sort((a, b) => a.localeCompare(b))
    })).sort((a, b) => a.category.localeCompare(b.category));
  }
}

const toSearchKey = (text: string): string => text.toLowerCase().replace(/ё/g, 'е');
