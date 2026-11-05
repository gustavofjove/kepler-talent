/**
 * The active catalog values, plus the value an entry being edited already holds when that value
 * has since been retired. Without it the select would show blank and the edit would silently
 * drop the stored value.
 */
export function optionsWithCurrent(options: readonly string[], current: string): string[] {
  return current && !options.includes(current) ? [current, ...options] : [...options];
}

const blank = (value: unknown): unknown => (value === '' ? undefined : value);

/**
 * Applies an edit form's fields to the entry it was loaded from. A field that only moved
 * between blank and missing keeps its stored value, and fields the form does not show (notes)
 * are kept, so an edit that changes nothing leaves the entry, and the panel, clean.
 */
export function applyEntryDraft<T extends { id: string }>(original: T, draft: Partial<T>): T {
  const next: Record<string, unknown> = { ...original };
  for (const [key, value] of Object.entries(draft)) {
    const before = (original as Record<string, unknown>)[key];
    if ((blank(before) ?? '') !== (blank(value) ?? '')) next[key] = blank(value);
  }
  return next as T;
}

/**
 * True when two entries hold the same values, treating blank, `null` and missing alike, so an
 * «Actualizar» that changes nothing sends no write.
 */
export function sameEntry(a: object, b: object): boolean {
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys].every((key) => (blank(left[key]) ?? null) === (blank(right[key]) ?? null));
}

/** True when a form's fields differ from the values it was loaded with. */
export function formChanged(draft: object, loaded: object): boolean {
  return !sameEntry(draft, loaded);
}

/** Replaces the entry with the same id where it stands. */
export function replaceEntry<T extends { id: string }>(list: readonly T[], entry: T): T[] {
  return list.map((item) => (item.id === entry.id ? entry : item));
}
