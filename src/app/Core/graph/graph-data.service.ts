import { Injectable } from '@angular/core';
import {
  buildGraph,
  buildPairIndex,
  FlavorGroup,
  Graph,
  GraphNode,
  groupFlavors,
  Level,
  levelOf,
  PairingTable,
  PairLevel,
  Product,
  toKey
} from './graph-data';

const EMPTY: Graph = { nodes: [], links: [] };

/**
 * Таблицы и справочник грузятся один раз на приложение: страницы графа, полки и подбора
 * работают с одним и тем же графом.
 */
@Injectable({ providedIn: 'root' })
export class GraphDataService {
  private pending: Promise<Graph> | undefined;
  private graph: Graph = EMPTY;
  private pairs = new Map<string, Level>();
  private nodeById = new Map<string, GraphNode>();
  private canonicalByKey = new Map<string, string>();
  private groups: FlavorGroup[] = [];

  load(): Promise<Graph> {
    // Неудачу не запоминаем: со страницы графа загрузку можно повторить
    this.pending ??= this.fetchGraph().catch((error: unknown) => {
      this.pending = undefined;
      throw error;
    });
    return this.pending;
  }

  level(a: string, b: string): PairLevel {
    return levelOf(this.pairs, a, b);
  }

  node(id: string): GraphNode | undefined {
    return this.nodeById.get(id);
  }

  categoryOf(flavor: string): string | undefined {
    return this.nodeById.get(flavor)?.category;
  }

  hasTable(flavor: string): boolean {
    return this.nodeById.get(flavor)?.hasTable ?? false;
  }

  /** Имя из справочника по любому написанию из таблиц */
  canonical(text: string): string | undefined {
    return this.canonicalByKey.get(toKey(text));
  }

  grouped(): FlavorGroup[] {
    return this.groups;
  }

  private async fetchGraph(): Promise<Graph> {
    const [tables, products] = await Promise.all([
      this.fetchJson<PairingTable[]>('data/tables.json'),
      this.fetchJson<Product[]>('data/products.json')
    ]);

    products.forEach(product => [product.name, ...(product.aliases ?? [])]
      .forEach(alias => this.canonicalByKey.set(toKey(alias), product.name)));

    this.graph = buildGraph(tables, products);
    this.pairs = buildPairIndex(this.graph.links);
    this.nodeById = new Map(this.graph.nodes.map(node => [node.id, node]));
    this.groups = groupFlavors(this.graph.nodes);

    return this.graph;
  }

  private async fetchJson<T>(url: string): Promise<T> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`${url}: ${response.status}`);
    }
    return response.json() as Promise<T>;
  }
}
