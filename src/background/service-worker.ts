import { MessageType, type AnyMessage, type GetSettingsResponse, type MessageResponse } from "../shared/messages.js";
import { addSelector, loadSettings, patchSettings, removeSelector } from "../shared/storage.js";

console.info("[Dictator] Copyright (c) e-Frogg - https://www.e-frogg.com");

function isMessage(input: unknown): input is AnyMessage {
  return Boolean(input && typeof input === "object" && "type" in (input as Record<string, unknown>));
}

function isSupportedTabUrl(url: string | undefined): boolean {
  if (!url) {
    return false;
  }
  return url.startsWith("http://") || url.startsWith("https://");
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function sendActivatePickerWithRetry(tabId: number, attempts = 6): Promise<void> {
  let lastError: unknown = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      await chrome.tabs.sendMessage(tabId, { type: MessageType.ActivatePicker });
      return;
    } catch (error) {
      lastError = error;
      await wait(120);
    }
  }
  throw lastError;
}

async function activatePickerOnTab(tabId: number): Promise<void> {
  try {
    await sendActivatePickerWithRetry(tabId, 2);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("Receiving end does not exist")) {
      throw error;
    }

    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content/content-script.js"]
    });

    await sendActivatePickerWithRetry(tabId, 10);
  }
}

async function notifySettingsChanged(): Promise<void> {
  await chrome.runtime.sendMessage({ type: MessageType.SettingsChanged }).catch(() => {
    return undefined;
  });
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isMessage(message)) {
    return false;
  }

  (async () => {
    switch (message.type) {
      case MessageType.GetSettings: {
        const settings = await loadSettings();
        const response: GetSettingsResponse = { ok: true, settings };
        sendResponse(response);
        return;
      }

      case MessageType.UpdateSettings: {
        await patchSettings(message.payload);
        await notifySettingsChanged();
        const response: MessageResponse = { ok: true };
        sendResponse(response);
        return;
      }

      case MessageType.StartPicker: {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) {
          sendResponse({ ok: false, error: "Aucun onglet actif." } satisfies MessageResponse);
          return;
        }

        if (!isSupportedTabUrl(tab.url)) {
          sendResponse({
            ok: false,
            error: "Cette page n'est pas supportee. Ouvre un site web http(s), puis reessaie."
          } satisfies MessageResponse);
          return;
        }

        try {
          await activatePickerOnTab(tab.id);
        } catch (error) {
          const details = error instanceof Error ? error.message : String(error);
          const hint =
            "Verifie aussi les autorisations du site dans les details de l'extension (Acces au site -> Sur tous les sites).";
          sendResponse({
            ok: false,
            error: `Impossible d'activer le mode selection sur cette page. Recharge l'onglet puis reessaie. ${hint} Detail: ${details}`
          } satisfies MessageResponse);
          return;
        }

        sendResponse({ ok: true } satisfies MessageResponse);
        return;
      }

      case MessageType.SaveSelector: {
        await addSelector(
          message.payload.origin,
          message.payload.selector,
          message.payload.fallbackSelector,
          message.payload.label
        );
        await notifySettingsChanged();
        sendResponse({ ok: true } satisfies MessageResponse);
        return;
      }

      case MessageType.RemoveSelector: {
        await removeSelector(message.payload.origin, message.payload.selectorId);
        await notifySettingsChanged();
        sendResponse({ ok: true } satisfies MessageResponse);
        return;
      }

      default: {
        sendResponse({ ok: false, error: "Message non supporte." } satisfies MessageResponse);
      }
    }
  })().catch((error: unknown) => {
    const err = error instanceof Error ? error.message : "Erreur inconnue";
    sendResponse({ ok: false, error: err } satisfies MessageResponse);
  });

  return true;
});
