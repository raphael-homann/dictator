export type DictationProvider = "native" | "openai";

export interface SelectorEntry {
  id: string;
  selector: string;
  fallbackSelector?: string;
  label?: string;
  createdAt: number;
}

export interface SiteConfig {
  origin: string;
  selectors: SelectorEntry[];
}

export interface UsageSnapshot {
  updatedAt: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
}

export interface ExtensionSettings {
  provider: DictationProvider;
  openaiApiKey: string;
  openaiModel: string;
  transcriptionModel: string;
  language: string;
  microphoneDeviceId: string;
  audioSensitivity: number;
  inactivityTimeoutMs: number;
  lockInputDuringDictation: boolean;
  sites: Record<string, SiteConfig>;
  usage: UsageSnapshot;
}

export const DEFAULT_OPENAI_MODELS = [
  "gpt-realtime",
  "gpt-4o-realtime-preview",
  "gpt-4o-mini-realtime-preview"
];

export const DEFAULT_TRANSCRIPTION_MODELS = [
  "gpt-4o-transcribe",
  "gpt-4o-mini-transcribe",
  "whisper-1"
];

export const DEFAULT_SETTINGS: ExtensionSettings = {
  provider: "native",
  openaiApiKey: "",
  openaiModel: DEFAULT_OPENAI_MODELS[0],
  transcriptionModel: DEFAULT_TRANSCRIPTION_MODELS[0],
  language: "fr",
  microphoneDeviceId: "",
  audioSensitivity: 1.8,
  inactivityTimeoutMs: 15000,
  lockInputDuringDictation: true,
  sites: {},
  usage: {
    updatedAt: 0,
    totalTokens: 0,
    inputTokens: 0,
    outputTokens: 0
  }
};
