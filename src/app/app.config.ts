import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { PreloadAllModules, provideRouter, withHashLocation, withInMemoryScrolling, withPreloading } from '@angular/router';

import { routes } from './app.routes';

// Адреса через решётку: GitHub Pages не умеет отдавать index.html на произвольный путь.
// Вторая страница подгружается фоном: после публикации новой версии её файлы меняют имена,
// и открытая вкладка со старым именем получила бы 404 при переходе
export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(
      routes,
      withHashLocation(),
      withPreloading(PreloadAllModules),
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled' })
    )
  ]
};
