import { Aroma, parseAromas } from '../../Core/graph/aroma';

/**
 * Аромат выбирают под настроение дня, поэтому выбор живёт до закрытия вкладки,
 * но переходы между страницами переживает.
 */
export function readAromas(key: string): Aroma[] {
  // В приватном режиме браузер запрещает доступ к хранилищу
  try {
    return parseAromas(sessionStorage.getItem(key));
  } catch {
    return [];
  }
}

export function writeAromas(key: string, aromas: Aroma[]): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(aromas));
  } catch {
    // не сохранили - не страшно
  }
}
