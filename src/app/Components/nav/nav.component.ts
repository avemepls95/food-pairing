import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-nav',
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav class="segmented nav">
      <a routerLink="/" routerLinkActive="active" ariaCurrentWhenActive="page"
         [routerLinkActiveOptions]="{ exact: true }">Подбор</a>
      <a routerLink="/shelf" routerLinkActive="active" ariaCurrentWhenActive="page">Полка</a>
      <a routerLink="/mixes" routerLinkActive="active" ariaCurrentWhenActive="page">Миксы</a>
    </nav>

    <a class="graph-link" routerLink="/graph" routerLinkActive="active" ariaCurrentWhenActive="page"
       title="Граф сочетаемости" aria-label="Граф сочетаемости">
      <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8"
           stroke-linecap="round" aria-hidden="true">
        <path d="M8.39 6.8L15.61 6.2M7.19 9.08L10.81 15.42M16.89 8.13L13.11 15.37"/>
        <circle cx="6" cy="7" r="2.4"/>
        <circle cx="18" cy="6" r="2.4"/>
        <circle cx="12" cy="17.5" r="2.4"/>
      </svg>
    </a>
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 1;
      min-width: 0;
    }

    .nav {
      flex: 1;
      min-width: 0;
      max-width: 300px;
    }

    /* Граф под рукой, но вне основного ряда: он отвечает на вопрос «почему эти вкусы вместе» */
    .graph-link {
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      flex-shrink: 0;
      border: 1px solid var(--border);
      border-radius: 50%;
      background: var(--surface);
      color: var(--muted);
      text-decoration: none;
    }

    .graph-link.active {
      border-color: var(--text);
      background: var(--text);
      color: var(--surface);
    }

    @media (hover: hover) {
      .graph-link:not(.active):hover {
        background: var(--surface-hover);
        color: var(--text);
      }
    }

    .graph-link:active {
      transform: scale(0.94);
    }
  `
})
export class NavComponent {
}
