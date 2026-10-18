export function getLibraryPageItems<T>(items: T[], page: number, pageSize: number) {
  if (!Number.isSafeInteger(pageSize) || pageSize <= 0) return [];
  const requestedPage = Number.isFinite(page) ? Math.floor(page) : 1;
  const safePage = Math.max(1, Math.min(requestedPage, Math.max(1, Math.ceil(items.length / pageSize))));
  return items.slice((safePage - 1) * pageSize, safePage * pageSize);
}

export function getLibrarySongPage(
  items: { librarySong: { id: string } }[], songId: string | null, pageSize: number,
) {
  if (!Number.isSafeInteger(pageSize) || pageSize <= 0) return 1;
  const index = items.findIndex(item => item.librarySong.id === songId);
  return index < 0 ? 1 : Math.floor(index / pageSize) + 1;
}

export function parseLibraryPageInput(
  value: string,
  pageCount: number,
): number | null {
  if (!Number.isSafeInteger(pageCount) || pageCount <= 0) {
    return null;
  }

  const normalizedValue = value.trim();
  if (!/^\d+$/.test(normalizedValue)) {
    return null;
  }

  const page = Number(normalizedValue);
  if (!Number.isSafeInteger(page) || page < 1 || page > pageCount) {
    return null;
  }

  return page;
}

export function isLibraryPageInputOutOfRange(
  value: string,
  pageCount: number,
): boolean {
  if (!Number.isSafeInteger(pageCount) || pageCount <= 0) {
    return false;
  }

  const normalizedValue = value.trim();
  if (!/^\d+$/.test(normalizedValue)) {
    return false;
  }

  const page = Number(normalizedValue);
  if (!Number.isSafeInteger(page)) {
    return false;
  }

  return page < 1 || page > pageCount;
}
