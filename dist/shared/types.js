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
export const DEFAULT_SETTINGS = {
    provider: "native",
    openaiApiKey: "",
    openaiModel: DEFAULT_OPENAI_MODELS[0],
    transcriptionModel: DEFAULT_TRANSCRIPTION_MODELS[0],
    language: "fr",
    microphoneDeviceId: "",
    audioSensitivity: 1.8,
    lockInputDuringDictation: true,
    sites: {},
    usage: {
        updatedAt: 0,
        totalTokens: 0,
        inputTokens: 0,
        outputTokens: 0
    }
};
