import { DEFAULT_SETTINGS } from "./types.js";
const STORAGE_KEY = "dictator.settings.v1";
function cloneDefault() {
    return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
}
function normalizeSettings(raw) {
    const base = cloneDefault();
    if (!raw || typeof raw !== "object") {
        return base;
    }
    const input = raw;
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
export async function loadSettings() {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    return normalizeSettings(stored[STORAGE_KEY]);
}
export async function saveSettings(settings) {
    await chrome.storage.local.set({ [STORAGE_KEY]: settings });
}
export async function patchSettings(partial) {
    const current = await loadSettings();
    const next = {
        ...current,
        ...partial,
        sites: partial.sites ?? current.sites,
        usage: partial.usage ?? current.usage
    };
    await saveSettings(next);
    return next;
}
export async function addSelector(origin, selector, fallbackSelector, label) {
    const settings = await loadSettings();
    const site = settings.sites[origin] ?? { origin, selectors: [] };
    const exists = site.selectors.some((item) => item.selector === selector);
    if (!exists) {
        const entry = {
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
export async function removeSelector(origin, selectorId) {
    const settings = await loadSettings();
    const site = settings.sites[origin];
    if (!site) {
        return settings;
    }
    site.selectors = site.selectors.filter((item) => item.id !== selectorId);
    const nextSites = { ...settings.sites };
    if (site.selectors.length === 0) {
        delete nextSites[origin];
    }
    else {
        nextSites[origin] = site;
    }
    const next = {
        ...settings,
        sites: nextSites
    };
    await saveSettings(next);
    return next;
}
export function getStorageKey() {
    return STORAGE_KEY;
}
