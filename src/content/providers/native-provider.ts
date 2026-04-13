import { AudioMeter } from "../audio-meter.js";
import type { DictationCallbacks, DictationProvider, DictationStartConfig } from "./types.js";

export class NativeDictationProvider implements DictationProvider {
  private recognition: {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    onresult: ((event: any) => void) | null;
    onerror: ((event: any) => void) | null;
    onend: (() => void) | null;
    start: () => void;
    stop: () => void;
  } | null = null;
  private callbacks: DictationCallbacks | null = null;
  private committed = "";
  private interim = "";
  private stopping = false;
  private meter = new AudioMeter((level) => {
    this.callbacks?.onLevel(level);
  });
  private meterStream: MediaStream | null = null;

  async start(config: DictationStartConfig, callbacks: DictationCallbacks): Promise<void> {
    const speechApi = window as unknown as {
      SpeechRecognition?: new () => NonNullable<NativeDictationProvider["recognition"]>;
      webkitSpeechRecognition?: new () => NonNullable<NativeDictationProvider["recognition"]>;
    };
    const SpeechCtor = speechApi.SpeechRecognition ?? speechApi.webkitSpeechRecognition;
    if (!SpeechCtor) {
      throw new Error("Web Speech API indisponible sur ce navigateur.");
    }

    this.callbacks = callbacks;
    this.committed = "";
    this.interim = "";
    this.stopping = false;
    this.callbacks?.onDebug?.(`[native] Demarrage reconnaissance, langue=${config.language || "fr-FR"}.`);
    this.meter.setSensitivity(config.audioSensitivity);

    this.recognition = new SpeechCtor();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = config.language || "fr-FR";

    this.recognition.onresult = (event: any) => {
      let localInterim = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) {
          this.committed = `${this.committed} ${text}`.trim();
        } else {
          localInterim = `${localInterim} ${text}`.trim();
        }
      }
      this.interim = localInterim;
      this.callbacks?.onTranscript(this.committed, this.interim);
      if (localInterim) {
        this.callbacks?.onDebug?.(`[native] Delta recu (${localInterim.length} chars).`);
      }
    };

    this.recognition.onerror = (event: any) => {
      const code = String(event.error || "");
      if (code === "no-speech" || code === "aborted") {
        return;
      }
      this.callbacks?.onDebug?.(`[native] Erreur reco: ${code || "unknown"}.`);
      this.callbacks?.onError(code || "Erreur de reconnaissance native.");
    };

    this.recognition.onend = () => {
      this.stopMeter();
      this.callbacks?.onDebug?.("[native] Session terminee.");
      if (!this.stopping) {
        this.callbacks?.onStop();
      }
    };

    try {
      this.meterStream = await navigator.mediaDevices.getUserMedia({
        audio: config.microphoneDeviceId
          ? {
              deviceId: { exact: config.microphoneDeviceId }
            }
          : true
      });
      this.meter.attach(this.meterStream);
    } catch {
      this.callbacks?.onWarning?.("Visualisation audio indisponible (permission micro refusee).");
    }

    this.recognition.start();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    this.stopMeter();
    if (this.recognition) {
      this.recognition.stop();
      this.recognition = null;
    }
  }

  private stopMeter(): void {
    this.meter.stop();
    if (this.meterStream) {
      for (const track of this.meterStream.getTracks()) {
        track.stop();
      }
      this.meterStream = null;
    }
  }
}
