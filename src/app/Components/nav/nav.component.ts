import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-nav',
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav class="segmented nav">
      <a routerLink="/" routerLinkActive="active" ariaCurrentWhenActive="page"
         [routerLinkActiveOptions]="{ exact: true }">Граф</a>
      <a routerLink="/shelf" routerLinkActive="active" ariaCurrentWhenActive="page">Полка</a>
      <a routerLink="/picks" routerLinkActive="active" ariaCurrentWhenActive="page">Подбор</a>
      <a routerLink="/mixes" routerLinkActive="active" ariaCurrentWhenActive="page">Миксы</a>
    </nav>
  `,
  styles: `
    .nav {
      width: min(380px, 58vw);
    }
  `
})
export class NavComponent {
}
