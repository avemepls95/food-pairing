/** randomUUID есть только на https и localhost, а страницу открывают и по локальному адресу */
export function newId(): string {
  return crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
