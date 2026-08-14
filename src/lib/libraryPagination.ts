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
