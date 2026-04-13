import type { EditableElement } from "../dom.js";

export interface DictationCallbacks {
  onTranscript: (committed: string, interim: string) => void;
  onLevel: (level: number) => void;
  onUsage?: (usage: { inputTokens: number; outputTokens: number; totalTokens: number }) => void;
  onDebug?: (message: string) => void;
  onWarning?: (message: string) => void;
  onError: (message: string) => void;
  onStop: () => void;
}

export interface DictationStartConfig {
  apiKey: string;
  model: string;
  transcriptionModel: string;
  language: string;
  microphoneDeviceId?: string;
  audioSensitivity: number;
  target: EditableElement;
}

export interface DictationProvider {
  start(config: DictationStartConfig, callbacks: DictationCallbacks): Promise<void>;
  stop(): Promise<void>;
}
