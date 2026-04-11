import { AudioMeter } from "../audio-meter.js";
export class NativeDictationProvider {
    recognition = null;
    callbacks = null;
    committed = "";
    interim = "";
    stopping = false;
    meter = new AudioMeter((level) => {
        this.callbacks?.onLevel(level);
    });
    meterStream = null;
    async start(config, callbacks) {
        const speechApi = window;
        const SpeechCtor = speechApi.SpeechRecognition ?? speechApi.webkitSpeechRecognition;
        if (!SpeechCtor) {
            throw new Error("Web Speech API indisponible sur ce navigateur.");
        }
        this.callbacks = callbacks;
        this.committed = "";
        this.interim = "";
        this.stopping = false;
        this.meter.setSensitivity(config.audioSensitivity);
        this.recognition = new SpeechCtor();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = config.language || "fr-FR";
        this.recognition.onresult = (event) => {
            let localInterim = "";
            for (let i = event.resultIndex; i < event.results.length; i += 1) {
                const result = event.results[i];
                const text = result[0]?.transcript ?? "";
                if (result.isFinal) {
                    this.committed = `${this.committed} ${text}`.trim();
                }
                else {
                    localInterim = `${localInterim} ${text}`.trim();
                }
            }
            this.interim = localInterim;
            this.callbacks?.onTranscript(this.committed, this.interim);
        };
        this.recognition.onerror = (event) => {
            const code = String(event.error || "");
            if (code === "no-speech" || code === "aborted") {
                return;
            }
            this.callbacks?.onError(code || "Erreur de reconnaissance native.");
        };
        this.recognition.onend = () => {
            this.stopMeter();
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
        }
        catch {
            this.callbacks?.onWarning?.("Visualisation audio indisponible (permission micro refusee).");
        }
        this.recognition.start();
    }
    async stop() {
        this.stopping = true;
        this.stopMeter();
        if (this.recognition) {
            this.recognition.stop();
            this.recognition = null;
        }
    }
    stopMeter() {
        this.meter.stop();
        if (this.meterStream) {
            for (const track of this.meterStream.getTracks()) {
                track.stop();
            }
            this.meterStream = null;
        }
    }
}
