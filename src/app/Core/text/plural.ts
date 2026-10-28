/** Формы русского существительного при числе: для 1, для 2-4, для остальных */
export type PluralForms = [one: string, few: string, many: string];

/** Форма существительного для числа: plural(2, ['группу', 'группы', 'групп']) даёт «группы» */
export function plural(count: number, forms: PluralForms): string {
  const teen = Math.abs(count) % 100;
  if (teen > 10 && teen < 20) {
    return forms[2];
  }
  const tail = Math.abs(count) % 10;
  if (tail === 1) {
    return forms[0];
  }

  return tail > 1 && tail < 5 ? forms[1] : forms[2];
}
