import { Routes } from '@angular/router';

// d3 весит больше остального приложения, поэтому страницы грузятся по отдельности
export const routes: Routes = [
  { path: '', loadComponent: () => import('./Components/graph/graph.component').then(m => m.GraphComponent) },
  { path: 'mixes', loadComponent: () => import('./Components/mixes/mixes.component').then(m => m.MixesComponent) },
  { path: '**', redirectTo: '' }
];
