import { AudioMeter } from "../audio-meter.js";
import type { DictationCallbacks, DictationProvider, DictationStartConfig } from "./types.js";

function parseNumber(value: unknown): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0;
  }
  return value;
}

async function waitForIceGatheringComplete(peerConnection: RTCPeerConnection): Promise<void> {
  if (peerConnection.iceGatheringState === "complete") {
    return;
  }

  await new Promise<void>((resolve) => {
    const onChange = () => {
      if (peerConnection.iceGatheringState === "complete") {
        peerConnection.removeEventListener("icegatheringstatechange", onChange);
        resolve();
      }
    };
    peerConnection.addEventListener("icegatheringstatechange", onChange);
  });
}

export class OpenAIRealtimeProvider implements DictationProvider {
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private stream: MediaStream | null = null;
  private callbacks: DictationCallbacks | null = null;
  private meter = new AudioMeter((level) => this.callbacks?.onLevel(level));
  private committed = "";
  private interim = "";

  async start(config: DictationStartConfig, callbacks: DictationCallbacks): Promise<void> {
    if (!config.apiKey) {
      throw new Error("Cle OpenAI manquante dans la configuration.");
    }

    this.callbacks = callbacks;
    this.committed = "";
    this.interim = "";
    this.meter.setSensitivity(config.audioSensitivity);

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: config.microphoneDeviceId
          ? {
              deviceId: {
                exact: config.microphoneDeviceId
              }
            }
          : true
      });
      this.meter.attach(this.stream);

      this.peerConnection = new RTCPeerConnection();
      for (const track of this.stream.getTracks()) {
        this.peerConnection.addTrack(track, this.stream);
      }

      this.dataChannel = this.peerConnection.createDataChannel("oai-events");
      this.dataChannel.addEventListener("message", (event) => {
        this.handleEvent(String(event.data ?? ""));
      });

      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);
      await waitForIceGatheringComplete(this.peerConnection);

      const sdpResponse = await fetch(`https://api.openai.com/v1/realtime?model=${encodeURIComponent(config.model)}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/sdp",
          "OpenAI-Beta": "realtime=v1"
        },
        body: this.peerConnection.localDescription?.sdp
      });

      if (!sdpResponse.ok) {
        const body = await sdpResponse.text();
        throw new Error(`OpenAI realtime refuse la connexion (${sdpResponse.status}): ${body}`);
      }

      const answerSdp = await sdpResponse.text();
      await this.peerConnection.setRemoteDescription({
        type: "answer",
        sdp: answerSdp
      });

      await new Promise<void>((resolve, reject) => {
        const timeoutId = window.setTimeout(() => {
          reject(new Error("Timeout ouverture canal Realtime."));
        }, 10000);

        const channel = this.dataChannel;
        if (!channel) {
          window.clearTimeout(timeoutId);
          reject(new Error("Canal de donnees Realtime indisponible."));
          return;
        }

        channel.addEventListener("open", () => {
          window.clearTimeout(timeoutId);
          resolve();
        });
        channel.addEventListener("error", () => {
          window.clearTimeout(timeoutId);
          reject(new Error("Erreur canal de donnees Realtime."));
        });
      });

      this.sendSessionUpdate(config);
      this.callbacks?.onDebug?.("[openai] Session WebRTC ouverte.");
    } catch (error) {
      this.cleanup(false);
      throw error;
    }
  }

  private sendSessionUpdate(config: DictationStartConfig): void {
    if (!this.dataChannel) {
      return;
    }

    const event = {
      type: "session.update",
      session: {
        input_audio_transcription: {
          model: config.transcriptionModel,
          language: config.language || "fr"
        },
        turn_detection: {
          type: "server_vad",
          create_response: false,
          interrupt_response: false
        }
      }
    };

    this.dataChannel.send(JSON.stringify(event));
    this.callbacks?.onDebug?.(`[openai->] ${JSON.stringify(event)}`);
  }

  private handleEvent(raw: string): void {
    try {
      this.callbacks?.onDebug?.(`[openai<-] ${raw}`);
      const event = JSON.parse(raw) as Record<string, unknown>;
      const type = String(event.type ?? "");
      const lowerType = type.toLowerCase();
      const delta = typeof event.delta === "string" ? event.delta : "";
      const transcript = typeof event.transcript === "string" ? event.transcript.trim() : "";

      if (delta && (lowerType.includes("input_audio_transcription") || lowerType.includes("audio_transcript"))) {
        this.interim = `${this.interim}${delta}`;
        this.callbacks?.onTranscript(this.committed.trim(), this.interim.trim());
        return;
      }

      if (transcript && (lowerType.includes("input_audio_transcription") || lowerType.includes("audio_transcript"))) {
        if (transcript) {
          this.committed = `${this.committed} ${transcript}`.trim();
        }
        this.interim = "";
        this.callbacks?.onTranscript(this.committed, this.interim);

        const usage = event.usage as Record<string, unknown> | undefined;
        if (usage) {
          const inputTokens = parseNumber(usage.input_tokens);
          const outputTokens = parseNumber(usage.output_tokens);
          const totalTokens = parseNumber(usage.total_tokens);
          this.callbacks?.onUsage?.({ inputTokens, outputTokens, totalTokens });
        }
        return;
      }

      if (type === "response.done") {
        const response = event.response as Record<string, unknown> | undefined;
        const usage = response?.usage as Record<string, unknown> | undefined;
        if (usage) {
          const inputTokens = parseNumber(usage.input_tokens);
          const outputTokens = parseNumber(usage.output_tokens);
          const totalTokens = parseNumber(usage.total_tokens);
          this.callbacks?.onUsage?.({ inputTokens, outputTokens, totalTokens });
        }
      }

      if (type === "error") {
        const errorObj = event.error as Record<string, unknown> | undefined;
        const message =
          (typeof errorObj?.message === "string" && errorObj.message) ||
          (typeof event.message === "string" && event.message) ||
          "Erreur OpenAI Realtime";
        this.callbacks?.onError(message);
        return;
      }
    } catch {
      this.callbacks?.onError("Evenement OpenAI invalide recu.");
    }
  }

  async stop(): Promise<void> {
    this.cleanup(true);
  }

  private cleanup(notifyStop: boolean): void {
    this.meter.stop();

    if (this.dataChannel && this.dataChannel.readyState === "open") {
      this.dataChannel.close();
    }
    this.dataChannel = null;

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
      this.stream = null;
    }

    if (notifyStop) {
      this.callbacks?.onStop();
    }
  }
}
