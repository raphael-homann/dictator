import { MessageType } from "../shared/messages.js";
import type { ExtensionSettings } from "../shared/types.js";
import { getStorageKey } from "../shared/storage.js";
import { buildDictationAnchor, isEditableElement, setEditableText, type EditableElement } from "./dom.js";
import { FieldPicker } from "./picker.js";
import { NativeDictationProvider } from "./providers/native-provider.js";
import { OpenAIRealtimeProvider } from "./providers/openai-provider.js";
import type { DictationProvider } from "./providers/types.js";

const STYLE_ID = "dictator-content-style";

interface Binding {
  element: EditableElement;
  entryId: string;
  container: HTMLDivElement;
  button: HTMLButtonElement;
  meter: HTMLDivElement;
}

interface ActiveSession {
  provider: DictationProvider;
  element: EditableElement;
  binding: Binding;
  anchorPrefix: string;
  anchorSuffix: string;
  lastLevelAt: number;
  lastTranscriptSize: number;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}

class DictationController {
  private settings: ExtensionSettings;
  private picker = new FieldPicker();
  private bindings = new Map<EditableElement, Binding>();
  private observer: MutationObserver | null = null;
  private activeSession: ActiveSession | null = null;
  private repositionRaf = 0;

  constructor(settings: ExtensionSettings) {
    this.settings = settings;
  }

  start(): void {
    this.injectStyles();
    this.syncBindings();

    this.observer = new MutationObserver(() => {
      this.syncBindings();
    });
    this.observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });

    window.addEventListener("scroll", this.requestReposition, true);
    window.addEventListener("resize", this.requestReposition, true);
  }

  destroy(): void {
    this.picker.stop();
    this.observer?.disconnect();
    this.observer = null;
    window.removeEventListener("scroll", this.requestReposition, true);
    window.removeEventListener("resize", this.requestReposition, true);

    for (const binding of this.bindings.values()) {
      binding.container.remove();
    }
    this.bindings.clear();
  }

  updateSettings(next: ExtensionSettings): void {
    this.settings = next;
    this.syncBindings();
  }

  startPicker(): void {
    this.picker.start();
  }

  private injectStyles(): void {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .dictator-btn-wrap {
        position: absolute;
        z-index: 2147483643;
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }

      .dictator-btn {
        border: 1px solid #166534;
        background: #ecfdf3;
        color: #14532d;
        border-radius: 999px;
        padding: 4px 10px;
        font: 600 12px/1.2 'Segoe UI', sans-serif;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(2, 6, 23, 0.2);
      }

      .dictator-btn[data-state='listening'] {
        background: #14532d;
        color: #fff;
        border-color: #14532d;
      }

      .dictator-btn[data-state='error'] {
        background: #7f1d1d;
        color: #fff;
        border-color: #7f1d1d;
      }

      .dictator-meter {
        width: 28px;
        height: 8px;
        border-radius: 5px;
        background: linear-gradient(90deg, #a7f3d0, #10b981, #059669);
        transform-origin: left center;
        transform: scaleX(0);
        transition: transform 80ms linear;
      }

      .dictator-meter-active {
        animation: dictator-meter-glow 1200ms ease-in-out infinite;
      }

      @keyframes dictator-meter-glow {
        0% { filter: brightness(0.9); opacity: 0.86; }
        50% { filter: brightness(1.2); opacity: 1; }
        100% { filter: brightness(0.9); opacity: 0.86; }
      }
    `;
    document.documentElement.append(style);
  }

  private syncBindings(): void {
    const origin = window.location.origin;
    const site = this.settings.sites[origin];
    const candidates = new Set<EditableElement>();

    if (site) {
      for (const entry of site.selectors) {
        const primary = document.querySelectorAll(entry.selector);
        for (const element of primary) {
          if (isEditableElement(element)) {
            candidates.add(element);
          }
        }

        if (primary.length === 0 && entry.fallbackSelector) {
          const fallback = document.querySelectorAll(entry.fallbackSelector);
          for (const element of fallback) {
            if (isEditableElement(element)) {
              candidates.add(element);
            }
          }
        }
      }
    }

    for (const [element, binding] of this.bindings) {
      if (!candidates.has(element) || !document.contains(element)) {
        binding.container.remove();
        this.bindings.delete(element);
      }
    }

    if (!site) {
      return;
    }

    for (const entry of site.selectors) {
      const matched = document.querySelectorAll(entry.selector);
      for (const node of matched) {
        if (!isEditableElement(node)) {
          continue;
        }
        if (!this.bindings.has(node)) {
          this.createBinding(node, entry.id);
        }
      }

      if (matched.length === 0 && entry.fallbackSelector) {
        const fallback = document.querySelectorAll(entry.fallbackSelector);
        for (const node of fallback) {
          if (!isEditableElement(node)) {
            continue;
          }
          if (!this.bindings.has(node)) {
            this.createBinding(node, entry.id);
          }
        }
      }
    }

    this.requestReposition();
  }

  private createBinding(element: EditableElement, entryId: string): void {
    const container = document.createElement("div");
    container.className = "dictator-btn-wrap";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "dictator-btn";
    button.dataset.state = "idle";
    button.textContent = "Dictee";

    const meter = document.createElement("div");
    meter.className = "dictator-meter";

    container.append(button, meter);
    document.body.append(container);

    const binding: Binding = { element, entryId, container, button, meter };
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void this.toggleDictation(binding);
    });

    this.bindings.set(element, binding);
  }

  private requestReposition = (): void => {
    if (this.repositionRaf) {
      return;
    }
    this.repositionRaf = window.requestAnimationFrame(() => {
      this.repositionRaf = 0;
      this.repositionBindings();
    });
  };

  private repositionBindings(): void {
    for (const binding of this.bindings.values()) {
      if (!document.contains(binding.element)) {
        continue;
      }
      const rect = binding.element.getBoundingClientRect();
      const x = window.scrollX + rect.right - 92;
      const y = window.scrollY + rect.top - 12;
      binding.container.style.left = `${Math.max(0, x)}px`;
      binding.container.style.top = `${Math.max(0, y)}px`;
    }
  }

  private async toggleDictation(binding: Binding): Promise<void> {
    if (this.activeSession && this.activeSession.binding === binding) {
      await this.stopActiveSession();
      return;
    }
    if (this.activeSession && this.activeSession.binding !== binding) {
      await this.stopActiveSession();
    }
    await this.startSession(binding);
  }

  private async startSession(binding: Binding): Promise<void> {
    let provider: DictationProvider =
      this.settings.provider === "openai" ? new OpenAIRealtimeProvider() : new NativeDictationProvider();
    const anchor = buildDictationAnchor(binding.element);

    binding.button.dataset.state = "listening";
    binding.button.textContent = "Stop";
    binding.meter.classList.add("dictator-meter-active");
    binding.meter.style.transform = "scaleX(0.1)";

    const session: ActiveSession = {
      provider,
      element: binding.element,
      binding,
      anchorPrefix: anchor.prefix,
      anchorSuffix: anchor.suffix,
      lastLevelAt: 0,
      lastTranscriptSize: 0,
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0
      }
    };
    this.activeSession = session;

    const startConfig = {
      apiKey: this.settings.openaiApiKey,
      model: this.settings.openaiModel,
      transcriptionModel: this.settings.transcriptionModel,
      language: this.settings.language,
      microphoneDeviceId: this.settings.microphoneDeviceId,
      audioSensitivity: this.settings.audioSensitivity,
      target: binding.element
    };

    const callbacks = {
      onTranscript: (committed: string, interim: string) => {
        if (!this.activeSession || this.activeSession.binding !== binding) {
          return;
        }
        const dictatedText = [committed, interim].filter(Boolean).join(" ").trim();
        const composedText = `${session.anchorPrefix}${dictatedText}${session.anchorSuffix}`;
        setEditableText(binding.element, composedText, session.anchorPrefix.length + dictatedText.length);

        const nextSize = dictatedText.length;
        const growth = Math.max(0, nextSize - session.lastTranscriptSize);
        session.lastTranscriptSize = nextSize;

        if (Date.now() - session.lastLevelAt > 280) {
          const fallbackLevel = Math.max(0.12, Math.min(1, 0.2 + growth * 0.08 + (interim ? 0.18 : 0.06)));
          binding.meter.style.transform = `scaleX(${fallbackLevel})`;
          window.setTimeout(() => {
            if (!this.activeSession || this.activeSession.binding !== binding) {
              return;
            }
            if (Date.now() - session.lastLevelAt > 280) {
              binding.meter.style.transform = "scaleX(0.1)";
            }
          }, 90);
        }
      },
      onLevel: (level: number) => {
        session.lastLevelAt = Date.now();
        const displayLevel = 0.08 + Math.pow(Math.max(0, Math.min(1, level)), 0.65) * 0.92;
        binding.meter.style.transform = `scaleX(${displayLevel})`;
      },
      onUsage: (usage: { inputTokens: number; outputTokens: number; totalTokens: number }) => {
        session.usage.inputTokens += usage.inputTokens;
        session.usage.outputTokens += usage.outputTokens;
        session.usage.totalTokens += usage.totalTokens;
      },
      onWarning: (message: string) => {
        binding.button.title = message;
      },
      onError: (message: string) => {
        binding.button.dataset.state = "error";
        binding.button.textContent = "Erreur";
        binding.button.title = message;
      },
      onStop: () => {
        if (!this.activeSession || this.activeSession.binding !== binding) {
          return;
        }
        this.resetBinding(binding);
        this.persistUsage(session.usage);
        this.activeSession = null;
      }
    };

    try {
      await provider.start(startConfig, callbacks);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Erreur de demarrage de la dictee.";

      if (this.settings.provider === "openai") {
        const fallback = new NativeDictationProvider();
        provider = fallback;
        session.provider = fallback;
        this.activeSession = session;
        binding.button.title = `${message} | Fallback natif active`;

        try {
          await fallback.start(startConfig, callbacks);
          return;
        } catch (fallbackError: unknown) {
          const fallbackMessage =
            fallbackError instanceof Error ? fallbackError.message : "Fallback natif indisponible.";
          binding.button.dataset.state = "error";
          binding.button.textContent = "Erreur";
          binding.button.title = `${message} | ${fallbackMessage}`;
          this.activeSession = null;
          return;
        }
      }

      binding.button.dataset.state = "error";
      binding.button.textContent = "Erreur";
      binding.button.title = message;
      this.activeSession = null;
    }
  }

  private async stopActiveSession(): Promise<void> {
    if (!this.activeSession) {
      return;
    }
    const session = this.activeSession;
    this.activeSession = null;
    await session.provider.stop();
    this.resetBinding(session.binding);
    await this.persistUsage(session.usage);
  }

  private resetBinding(binding: Binding): void {
    binding.button.dataset.state = "idle";
    binding.button.textContent = "Dictee";
    binding.button.title = "";
    binding.meter.classList.remove("dictator-meter-active");
    binding.meter.style.transform = "scaleX(0)";
  }

  private async persistUsage(usage: { inputTokens: number; outputTokens: number; totalTokens: number }): Promise<void> {
    if (usage.totalTokens <= 0) {
      return;
    }

    const nextUsage = {
      updatedAt: Date.now(),
      inputTokens: (this.settings.usage.inputTokens || 0) + usage.inputTokens,
      outputTokens: (this.settings.usage.outputTokens || 0) + usage.outputTokens,
      totalTokens: (this.settings.usage.totalTokens || 0) + usage.totalTokens
    };

    this.settings = {
      ...this.settings,
      usage: nextUsage
    };

    await chrome.runtime.sendMessage({
      type: MessageType.UpdateSettings,
      payload: { usage: nextUsage }
    });
  }
}

async function loadSettings(): Promise<ExtensionSettings> {
  const response = (await chrome.runtime.sendMessage({ type: MessageType.GetSettings })) as {
    ok: boolean;
    settings?: ExtensionSettings;
    error?: string;
  };
  if (!response.ok || !response.settings) {
    throw new Error(response.error ?? "Chargement settings impossible");
  }
  return response.settings;
}

let controllerRef: DictationController | null = null;
let pendingPickerActivation = false;

chrome.runtime.onMessage.addListener((message: { type?: string }) => {
  if (message.type === MessageType.ActivatePicker) {
    if (controllerRef) {
      controllerRef.startPicker();
    } else {
      pendingPickerActivation = true;
    }
  }

  if (message.type === MessageType.SettingsChanged && controllerRef) {
    void loadSettings().then((next) => controllerRef?.updateSettings(next));
  }
});

const boot = async (): Promise<void> => {
  const settings = await loadSettings();
  const controller = new DictationController(settings);
  controllerRef = controller;
  controller.start();

  if (pendingPickerActivation) {
    pendingPickerActivation = false;
    controller.startPicker();
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") {
      return;
    }
    if (changes[getStorageKey()]) {
      void loadSettings().then((next) => controllerRef?.updateSettings(next));
    }
  });

  window.addEventListener("beforeunload", () => {
    controller.destroy();
  });
};

void boot().catch((error: unknown) => {
  console.error("[Dictator] boot failed", error);
});
