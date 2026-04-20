import { AudioMeter } from "../audio-meter.js";
export class NativeDictationProvider {
    recognition = null;
    callbacks = null;
    committed = "";
    interim = "";
    stopping = false;
    restartTimerId = null;
    interimFlushTimerId = null;
    lastFlushedInterim = "";
    meter = new AudioMeter((level) => {
        this.callbacks?.onLevel(level);
    });
    meterStream = null;
    mergeCommittedAndChunk(committed, chunk) {
        const base = committed.trim();
        const tail = chunk.trim();
        if (!tail) {
            return base;
        }
        if (!base) {
            return tail;
        }
        return `${base} ${tail}`.trim();
    }
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
        this.clearRestartTimer();
        this.clearInterimFlushTimer();
        this.lastFlushedInterim = "";
        this.callbacks?.onDebug?.(`[native] Demarrage reconnaissance, langue=${config.language || "fr-FR"}.`);
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
            this.lastFlushedInterim = "";
            this.callbacks?.onTranscript(this.committed, this.interim);
            if (localInterim) {
                this.callbacks?.onDebug?.(`[native] Delta recu (${localInterim.length} chars).`);
            }
        };
        this.recognition.onerror = (event) => {
            const code = String(event.error || "");
            if (code === "no-speech" || code === "aborted") {
                this.callbacks?.onDebug?.(`[native] Info reco: ${code}.`);
                return;
            }
            if (code === "network") {
                this.callbacks?.onDebug?.("[native] Erreur reseau ignoree en mode natif (session maintenue).");
                return;
            }
            this.flushInterim("error");
            const details = this.describeErrorCode(code);
            this.callbacks?.onDebug?.(`[native] Erreur reco: ${code || "unknown"} (${details}).`);
            this.callbacks?.onError(`${details} (code: ${code || "unknown"})`);
        };
        this.recognition.onend = () => {
            if (this.stopping) {
                this.flushInterim("stop");
                this.stopMeter();
                this.clearInterimFlushTimer();
                this.callbacks?.onDebug?.("[native] Session terminee.");
                this.callbacks?.onStop();
                return;
            }
            this.callbacks?.onDebug?.("[native] onend inattendu, tentative de reprise auto.");
            this.scheduleRestart();
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
        this.startInterimFlushTimer();
    }
    async stop() {
        this.stopping = true;
        this.clearRestartTimer();
        this.clearInterimFlushTimer();
        this.flushInterim("manual-stop");
        this.stopMeter();
        if (this.recognition) {
            this.recognition.stop();
            this.recognition = null;
        }
    }
    scheduleRestart() {
        if (!this.recognition || this.stopping) {
            return;
        }
        this.clearRestartTimer();
        this.restartTimerId = window.setTimeout(() => {
            this.restartTimerId = null;
            if (!this.recognition || this.stopping) {
                return;
            }
            try {
                this.recognition.start();
                this.callbacks?.onDebug?.("[native] Reprise auto OK.");
            }
            catch {
                this.callbacks?.onError("La reconnaissance native s'est arretee de facon inattendue.");
                this.callbacks?.onStop();
            }
        }, 180);
    }
    clearRestartTimer() {
        if (this.restartTimerId !== null) {
            window.clearTimeout(this.restartTimerId);
            this.restartTimerId = null;
        }
    }
    startInterimFlushTimer() {
        this.clearInterimFlushTimer();
        this.interimFlushTimerId = window.setInterval(() => {
            this.flushInterim("timer");
        }, 1500);
    }
    clearInterimFlushTimer() {
        if (this.interimFlushTimerId !== null) {
            window.clearInterval(this.interimFlushTimerId);
            this.interimFlushTimerId = null;
        }
    }
    flushInterim(reason) {
        const chunk = this.interim.trim();
        if (!chunk) {
            return;
        }
        if (chunk === this.lastFlushedInterim) {
            return;
        }
        this.lastFlushedInterim = chunk;
        if (reason === "timer") {
            this.callbacks?.onTranscript(this.committed, chunk);
            this.callbacks?.onDebug?.("[native] Flush interim periodique.");
            return;
        }
        const promotedCommitted = this.mergeCommittedAndChunk(this.committed, chunk);
        this.callbacks?.onTranscript(promotedCommitted, "");
        if (reason === "error") {
            this.callbacks?.onDebug?.("[native] Flush interim avant erreur.");
        }
    }
    describeErrorCode(code) {
        switch (code) {
            case "not-allowed":
            case "service-not-allowed":
                return "Acces micro ou reconnaissance refuse par le navigateur";
            case "audio-capture":
                return "Capture audio impossible (micro indisponible ou deja utilise)";
            case "network":
                return "Erreur reseau pendant la reconnaissance native";
            case "language-not-supported":
                return "Langue non supportee par la reconnaissance native";
            default:
                return "Erreur de reconnaissance vocale native";
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
