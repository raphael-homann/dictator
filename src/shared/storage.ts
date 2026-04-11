import { DEFAULT_SETTINGS, type ExtensionSettings, type SelectorEntry } from "./types.js";

const STORAGE_KEY = "dictator.settings.v1";

function cloneDefault(): ExtensionSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as ExtensionSettings;
}

function normalizeSettings(raw: unknown): ExtensionSettings {
  const base = cloneDefault();
  if (!raw || typeof raw !== "object") {
    return base;
  }

  const input = raw as Partial<ExtensionSettings>;
  return {
    ...base,
    ...input,
    sites: input.sites ?? base.sites,
    usage: {
      ...base.usage,
      ...(input.usage ?? {})
    }
  };
}

export async function loadSettings(): Promise<ExtensionSettings> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  return normalizeSettings(stored[STORAGE_KEY]);
}

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: settings });
}

export async function patchSettings(partial: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
  const current = await loadSettings();
  const next: ExtensionSettings = {
    ...current,
    ...partial,
    sites: partial.sites ?? current.sites,
    usage: partial.usage ?? current.usage
  };
  await saveSettings(next);
  return next;
}

export async function addSelector(
  origin: string,
  selector: string,
  fallbackSelector?: string,
  label?: string
): Promise<ExtensionSettings> {
  const settings = await loadSettings();
  const site = settings.sites[origin] ?? { origin, selectors: [] };
  const exists = site.selectors.some((item) => item.selector === selector);
  if (!exists) {
    const entry: SelectorEntry = {
      id: crypto.randomUUID(),
      selector,
      fallbackSelector,
      label,
      createdAt: Date.now()
    };
    site.selectors = [...site.selectors, entry];
  }
  const next = {
    ...settings,
    sites: {
      ...settings.sites,
      [origin]: site
    }
  };
  await saveSettings(next);
  return next;
}

export async function removeSelector(origin: string, selectorId: string): Promise<ExtensionSettings> {
  const settings = await loadSettings();
  const site = settings.sites[origin];
  if (!site) {
    return settings;
  }

  site.selectors = site.selectors.filter((item) => item.id !== selectorId);
  const nextSites = { ...settings.sites };
  if (site.selectors.length === 0) {
    delete nextSites[origin];
  } else {
    nextSites[origin] = site;
  }

  const next = {
    ...settings,
    sites: nextSites
  };
  await saveSettings(next);
  return next;
}

export function getStorageKey(): string {
  return STORAGE_KEY;
}
