import { Routes } from '@angular/router';

// d3 весит больше остального приложения, поэтому страницы грузятся по отдельности
export const routes: Routes = [
  {
    path: '',
    title: 'Сочетания вкусов',
    loadComponent: () => import('./Components/graph/graph.component').then(m => m.GraphComponent)
  },
  {
    path: 'shelf',
    title: 'Полка - сочетания вкусов',
    loadComponent: () => import('./Components/shelf/shelf.component').then(m => m.ShelfComponent)
  },
  {
    path: 'picks',
    title: 'Подбор миксов - сочетания вкусов',
    loadComponent: () => import('./Components/picks/picks.component').then(m => m.PicksComponent)
  },
  {
    path: 'mixes',
    title: 'Миксы - сочетания вкусов',
    loadComponent: () => import('./Components/mixes/mixes.component').then(m => m.MixesComponent)
  },
  { path: '**', redirectTo: '' }
];
