/**
 * Render a load duration compactly: sub-second values as "123ms", longer as "1.2s".
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}

export type LocalizedText = string | Record<string, string>;

export function formatLocalizedText(
  value: LocalizedText | undefined,
  language: string,
  fallback = '',
): string {
  if (typeof value === 'string') {
    return value || fallback;
  }

  if (!value) {
    return fallback;
  }

  const normalizedLanguage = language.toLowerCase();
  const matchedLanguage = Object.keys(value).find(key => key.toLowerCase() === normalizedLanguage);
  return value[language]
    || (matchedLanguage ? value[matchedLanguage] : undefined)
    || value.en
    || Object.values(value)[0]
    || fallback;
}

export function formatLocalizedName(
  name: LocalizedText,
  language: string,
  fallback = 'Unknown Mod',
): string {
  return formatLocalizedText(name, language, fallback);
}

export function formatInitial(value: string, fallback = 'M'): string {
  return value.trim().charAt(0).toUpperCase() || fallback;
}

export function formatSearchText(values: Array<string | null | undefined>): string {
  return values
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function localizedTextSearchValues(value: LocalizedText | undefined): string[] {
  if (!value) {
    return [];
  }

  return typeof value === 'string' ? [value] : Object.values(value);
}

/**
 * Pretty-print a value as JSON for display, falling back to a string so a
 * circular or otherwise non-serializable value never throws during render.
 */
export function formatData(data: unknown): string {
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}
