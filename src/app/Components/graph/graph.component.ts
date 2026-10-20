import { Component, ElementRef, HostListener, inject, NgZone, OnDestroy, OnInit, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import * as d3 from 'd3';
import { NavComponent } from '../nav/nav.component';
import { buildGraph, GraphLink, GraphNode, Level, PairingTable, Product } from './graph-data';

interface Node extends GraphNode, d3.SimulationNodeDatum {
  hidden?: boolean;
}

type Link = GraphLink;

interface GraphSettings {
  mode: 'strict' | 'extended'; // Два режима отображения
}

const SETTINGS_KEY = 'food-pairing.graph-settings';

interface FilterOptions {
  showRed: boolean;
  showYellow: boolean;
  showGreen: boolean;
  showBlue: boolean;
}

@Component({
  selector: 'app-graph',
  standalone: true,
  imports: [FormsModule, NavComponent],
  templateUrl: './graph.component.html',
  styleUrls: ['./graph.component.css']
})
export class GraphComponent implements OnInit, OnDestroy {
  private zone = inject(NgZone);
  private svg: any;
  private zoom: d3.ZoomBehavior<SVGSVGElement, unknown> | undefined;
  private simulation: d3.Simulation<Node, d3.SimulationLinkDatum<Node>> | undefined;
  private resizeObserver: ResizeObserver | undefined;
  private redrawHandle = 0;
  private redrawTimeout: ReturnType<typeof setTimeout> | undefined;
  private updatePositions: (() => void) | undefined;
  private laidOutOnce = false;
  private destroyed = false;
  private graphContainer = viewChild.required<ElementRef<HTMLElement>>('graphContainer');
  filtersOpen = true;
  fullscreen = false;
  modeHelpOpen = false;
  graphEmpty = false;
  loadError = '';
  hiddenByColor = 0;
  graph: { nodes: Node[]; links: Link[] } = { nodes: [], links: [] };
  filteredLinks: Link[] = [];
  selectedProducts: string[] = [];
  searchTerm: string = '';
  groupedProducts: {category: string; items: string[]}[] = [];

  filter: FilterOptions = {
    showRed: true,
    showYellow: false,
    showGreen: false,
    showBlue: false
  };

  // По убыванию сочетаемости
  readonly levels: { color: Level; label: string }[] = [
    { color: 'red', label: 'Красный' },
    { color: 'yellow', label: 'Жёлтый' },
    { color: 'green', label: 'Зелёный' },
    { color: 'blue', label: 'Синий' }
  ];

  settings: GraphSettings = {
    mode: 'extended' // По умолчанию расширенный режим
  };

  async ngOnInit(): Promise<void> {
    this.restoreSettings();
    await this.loadData();
  }

  async loadData(): Promise<void> {
    this.loadError = '';
    try {
      const [tables, products] = await Promise.all([
        this.fetchJson<PairingTable[]>('data/tables.json'),
        this.fetchJson<Product[]>('data/products.json')
      ]);
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
    } catch {
      this.loadError = 'Не удалось загрузить данные';
    }
  }

  private async fetchJson<T>(url: string): Promise<T> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`${url}: ${response.status}`);
    }
    return response.json() as Promise<T>;
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.redrawHandle);
    clearTimeout(this.redrawTimeout);
    this.resizeObserver?.disconnect();
    this.simulation?.stop();
  }

  // Выбранные цвета и режим переживают перезагрузку, выбранные продукты - нет
  private restoreSettings(): void {
    // В приватном режиме браузер запрещает доступ к хранилищу
    try {
      const saved = localStorage.getItem(SETTINGS_KEY);
      if (saved) {
        const settings = JSON.parse(saved) as { filter?: FilterOptions; mode?: GraphSettings['mode'] };
        this.filter = { ...this.filter, ...settings.filter };
        this.settings.mode = settings.mode ?? this.settings.mode;
      }
    } catch {
      return;
    }
  }

  private saveSettings(): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ filter: this.filter, mode: this.settings.mode }));
    } catch {
      return;
    }
  }

  // pointerdown, а не click: iOS Safari не отправляет click в document при тапе по некликабельному элементу
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

  // Граф занимает весь экран: шапка, выбранные продукты и фильтры прячутся.
  // Свой режим, а не Fullscreen API: на iPhone он работает только для видео
  toggleFullscreen(): void {
    this.fullscreen = !this.fullscreen;
  }

  applyFilter(immediate = false): void {
    // 1. Фильтрация связей по цвету
    let visibleLinks = this.graph.links.filter(link => 
      this.shouldShowLink(link)
    );

    // 2. Применяем фильтр по продуктам (если есть выбранные)
    if (this.selectedProducts.length > 0) {
      const selectedSet = new Set(this.selectedProducts);
      
      if (this.settings.mode === 'strict') {
        // Режим 1: Только выбранные узлы и связи между ними
        visibleLinks = visibleLinks.filter(link => 
          selectedSet.has(link.source) && selectedSet.has(link.target)
        );
      } else {
        // Режим 2: Выбранные узлы + их непосредственные связи
        visibleLinks = visibleLinks.filter(link => 
          selectedSet.has(link.source) || selectedSet.has(link.target)
        );
      }
    }

    this.filteredLinks = visibleLinks;
    this.updateNodesVisibility();
    this.countHiddenByColor();
    this.renderGraph(immediate);
  }

  /**
   * Сколько связей выбранных продуктов не показано из-за выключенных цветов. Без этого выбранный
   * продукт выглядит так, будто он ни с чем не сочетается.
   */
  private countHiddenByColor(): void {
    const selected = new Set(this.selectedProducts);
    this.hiddenByColor = selected.size
      ? this.graph.links.filter(link =>
          !this.shouldShowLink(link) && (selected.has(link.source) || selected.has(link.target))).length
      : 0;
  }

  private updateNodesVisibility(): void {
    const visibleNodes = new Set<string>();

    // Всегда показываем выбранные узлы (даже в strict режиме)
    this.selectedProducts.forEach(node => visibleNodes.add(node));

    // Добавляем узлы из видимых связей
    this.filteredLinks.forEach(link => {
      visibleNodes.add(link.source);
      visibleNodes.add(link.target);
    });

    this.graph.nodes.forEach(node => {
      node.hidden = !visibleNodes.has(node.id);
    });

    this.graphEmpty = visibleNodes.size === 0;
  }

  setMode(mode: GraphSettings['mode']): void {
    if (this.settings.mode === mode) {
      return;
    }
    this.settings.mode = mode;
    this.saveSettings();
    this.applyFilter();
  }

  private shouldShowLink(link: Link): boolean {
    switch (link.value) {
      case 'red': return this.filter.showRed;
      case 'yellow': return this.filter.showYellow;
      case 'green': return this.filter.showGreen;
      case 'blue': return this.filter.showBlue;
      default: return false;
    }
  }

  /**
   * Полная перерисовка большого графа занимает на телефоне сотни миллисекунд. Сначала ждём кадр,
   * потом задачу: к этому моменту браузер уже показал нажатый чекбокс или кнопку. Подряд идущие
   * вызовы схлопываются в один.
   * Вне зоны Angular: иначе каждый тик симуляции и событие drag/zoom запускают проверку изменений,
   * и список продуктов перерисовывается прямо во время клика.
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
    d3.select('#graph-container').selectAll('*').remove();

    const containerElement = this.graphContainer().nativeElement;
    const width = containerElement.clientWidth || 800;
    const height = containerElement.clientHeight || 600;

    // Создаем SVG с контейнером для zoom
    this.svg = d3.select('#graph-container')
      .append('svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .style('display', 'block');

    const container = this.svg.append('g').classed('container', true);

    // Настройка zoom. Нижняя граница маленькая: большой граф на телефоне вписывается с сильным уменьшением
    this.zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.05, 4])
      .on('zoom', (event) => {
        container.attr('transform', event.transform);
        // На мелком масштабе подписи сливаются в кашу, поэтому остаются только у выбранных продуктов.
        // Масштаб уходит в стили: подпись выбранного рисуется одного размера на любом масштабе
        container.classed('tiny', event.transform.k < 0.5);
        container.style('--zoom', event.transform.k);
      });

    this.svg.call(this.zoom);
    // Двойной тап по узлу выбирает продукт дважды, зум по нему не нужен
    this.svg.on('dblclick.zoom', null);

    const visibleNodes = this.graph.nodes.filter(node => !node.hidden);
    const nodeById = new Map(visibleNodes.map(node => [node.id, node]));
    const d3Links = this.filteredLinks.map(link => ({
      source: nodeById.get(link.source)!,
      target: nodeById.get(link.target)!,
      value: link.value
    }));

    // Симуляция с оптимизированными параметрами
    this.simulation = d3.forceSimulation<Node>(visibleNodes)
      .force('link', d3.forceLink(d3Links)
        .distance(100)
      )
      .force('charge', d3.forceManyBody()
        .strength(-300)
      )
      .force('collision', d3.forceCollide()
        .radius(35)
        .strength(0.8)
      )
      .force('x', d3.forceX(width / 2).strength(0.1))
      .force('y', d3.forceY(height / 2).strength(0.1))
      .alphaDecay(0.05)
      .velocityDecay(0.3)
      .stop();

    // Раскладка считается сразу до конца, без анимации: вписать граф в экран можно только по итоговым позициям.
    // Узлы сохраняют координаты между перерисовками, поэтому после первой раскладки хватает короткого догона:
    // так и считается быстрее, и граф не перетасовывается целиком от одного нового продукта
    const startAlpha = this.laidOutOnce ? 0.3 : 1;
    this.simulation.alpha(startAlpha);
    const ticksToSettle = Math.ceil(
      Math.log(this.simulation.alphaMin() / startAlpha) / Math.log(1 - this.simulation.alphaDecay())
    );
    this.simulation.tick(ticksToSettle);
    this.laidOutOnce = true;

    // Рисуем связи
    const link = container.append('g')
      .selectAll('line')
      .data(d3Links)
      .enter()
      .append('line')
      .attr('class', (d: { value: string; }) => 'link level-' + d.value);

    // Рисуем узлы
    const node = container.append('g')
      .selectAll('circle')
      .data(visibleNodes)
      .enter()
      .append('circle')
      .attr('r', 15)
      .attr('fill', (d: { category: string; }) => this.getCategoryColor(d.category))
      .classed('selected', (d: Node) => this.selectedProducts.includes(d.id))
      .call(d3.drag<SVGCircleElement, Node>()
        .on('start', (event, d) => this.dragStarted(event, d))
        .on('drag', (event, d) => this.dragged(event, d))
        .on('end', (event, d) => this.dragEnded(event, d)))
      // defaultPrevented - значит узел тащили, а не нажимали
      .on('click', (event: PointerEvent, d: Node) => {
        if (!event.defaultPrevented) {
          this.zone.run(() => this.toggleProductSelection(d.id));
        }
      });

    // Рисуем текст с переносами
    const text = container.append('g')
      .selectAll('g.text-node')
      .data(visibleNodes)
      .enter()
      .append('g')
      .classed('text-node', true)
      .classed('selected', (d: Node) => this.selectedProducts.includes(d.id))
      .call(this.wrapText);

    // Обновление позиций: после расчёта раскладки и при перетаскивании узла
    const updatePositions = () => {
      link
        .attr('x1', (d: { source: { x: any; }; }) => d.source.x ?? 0)
        .attr('y1', (d: { source: { y: any; }; }) => d.source.y ?? 0)
        .attr('x2', (d: { target: { x: any; }; }) => d.target.x ?? 0)
        .attr('y2', (d: { target: { y: any; }; }) => d.target.y ?? 0);

      node
        .attr('cx', (d: { x: any; }) => d.x ?? 0)
        .attr('cy', (d: { y: any; }) => d.y ?? 0);

      text
        .attr('transform', (d: { x: any; y: any; }) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    };
    updatePositions();
    this.updatePositions = updatePositions;

    this.fitToView();
  }

  // Масштаб и сдвиг, при которых все видимые узлы с подписями помещаются в контейнер. Крупнее 1:1 не увеличивает
  fitToView(): void {
    const containerElement = document.getElementById('graph-container');
    const nodes = this.graph.nodes.filter(node => !node.hidden);
    if (!this.svg || !this.zoom || !containerElement?.clientWidth || !nodes.length) {
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

    // Нижняя граница - та же, что у зума: иначе первый жест дёрнет граф к допустимому масштабу
    const scale = Math.max(0.05, Math.min(1, width / (x1 - x0), height / (y1 - y0)));
    const transform = d3.zoomIdentity
      .translate(width / 2 - scale * (x0 + x1) / 2, height / 2 - scale * (y0 + y1) / 2)
      .scale(scale);
    this.svg.call(this.zoom.transform, transform);
  }

  // Подпись в несколько строк: по строке на слово
  private wrapText(selection: any) {
    selection.each(function(this: SVGGElement, d: Node) {
      const lineHeight = 1.1;
      const fontSize = 10;
      const firstLineY = 25;

      // Цвет и обводка подписи - в глобальных стилях, чтобы следовать теме
      d3.select(this).append('text')
        .attr('text-anchor', 'middle')
        .attr('font-size', `${fontSize}px`)
        .selectAll('tspan')
        .data(d.name.split(/\s+/))
        .enter()
        .append('tspan')
        .attr('x', 0)
        .attr('y', (_, i) => firstLineY + i * fontSize * lineHeight)
        .text(word => word);
    });
  }

  getFilterValue(color: string): boolean {
    const key = `show${color.charAt(0).toUpperCase()}${color.slice(1)}` as keyof FilterOptions;
    return this.filter[key];
  }

  toggleFilter(color: string): void {
    const key = `show${color.charAt(0).toUpperCase()}${color.slice(1)}` as keyof FilterOptions;
    this.filter[key] = !this.filter[key];
    this.saveSettings();
    this.applyFilter();
  }

  getCategoryColor(category: string): string {
    const colors = {
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
    return colors[category as keyof typeof colors] || '#8395a7';
  }

  // Перетаскивание двигает только сам узел: пересчёт всех сил на каждый кадр жеста
  // на большом графе давал считанные кадры в секунду, а раскладка теряла привычный вид
  private dragStarted(event: d3.D3DragEvent<SVGCircleElement, Node, unknown>, d: Node): void {
    d.fx = d.x;
    d.fy = d.y;
  }

  private dragged(event: d3.D3DragEvent<SVGCircleElement, Node, unknown>, d: Node): void {
    d.fx = event.x;
    d.fy = event.y;
    d.x = event.x;
    d.y = event.y;
    this.updatePositions?.();
  }

  private dragEnded(event: d3.D3DragEvent<SVGCircleElement, Node, unknown>, d: Node): void {
    d.fx = null;
    d.fy = null;
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

toggleProductSelection(product: string): void {
  this.selectedProducts = this.selectedProducts.includes(product)
    ? this.selectedProducts.filter(p => p !== product)
    : [...this.selectedProducts, product];

  this.applyFilter();
}

// Фильтрация для поиска
get filteredGroups() {
  if (!this.searchTerm) return this.groupedProducts;

  const term = this.searchTerm.trim().toLowerCase().replace(/ё/g, 'е');
  return this.groupedProducts
    .map(group => ({
      ...group,
      items: group.items.filter(item =>
        item.toLowerCase().replace(/ё/g, 'е').includes(term) ||
        group.category.toLowerCase().replace(/ё/g, 'е').includes(term)
      )
    }))
    .filter(group => group.items.length > 0);
}
}