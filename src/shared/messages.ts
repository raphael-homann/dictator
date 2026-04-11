import type { DictationProvider, ExtensionSettings } from "./types.js";

export const MessageType = {
  GetSettings: "dictator:get-settings",
  UpdateSettings: "dictator:update-settings",
  StartPicker: "dictator:start-picker",
  ActivatePicker: "dictator:activate-picker",
  SaveSelector: "dictator:save-selector",
  RemoveSelector: "dictator:remove-selector",
  SettingsChanged: "dictator:settings-changed"
} as const;

export type AnyMessage =
  | { type: typeof MessageType.GetSettings }
  | { type: typeof MessageType.StartPicker }
  | { type: typeof MessageType.ActivatePicker }
  | { type: typeof MessageType.SaveSelector; payload: SaveSelectorPayload }
  | { type: typeof MessageType.RemoveSelector; payload: RemoveSelectorPayload }
  | { type: typeof MessageType.SettingsChanged }
  | { type: typeof MessageType.UpdateSettings; payload: Partial<ExtensionSettings> };

export interface SaveSelectorPayload {
  origin: string;
  selector: string;
  fallbackSelector?: string;
  label?: string;
}

export interface RemoveSelectorPayload {
  origin: string;
  selectorId: string;
}

export interface MessageResponse {
  ok: boolean;
  error?: string;
}

export interface GetSettingsResponse extends MessageResponse {
  settings?: ExtensionSettings;
}

export interface ProviderStatus {
  provider: DictationProvider;
}
