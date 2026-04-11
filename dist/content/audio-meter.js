export class AudioMeter {
    audioContext = null;
    analyser = null;
    dataArray = null;
    rafId = 0;
    listener;
    sourceNode = null;
    smoothedLevel = 0;
    baseSensitivity = 1.8;
    adaptiveSensitivity = 1.8;
    constructor(listener, sensitivity = 1.8) {
        this.listener = listener;
        this.setSensitivity(sensitivity);
    }
    setSensitivity(value) {
        const safe = Number.isFinite(value) ? value : 1.8;
        this.baseSensitivity = Math.max(0.4, Math.min(4, safe));
        this.adaptiveSensitivity = this.baseSensitivity;
    }
    attach(stream) {
        this.stop();
        this.audioContext = new AudioContext();
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 512;
        this.dataArray = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));
        this.sourceNode = this.audioContext.createMediaStreamSource(stream);
        this.sourceNode.connect(this.analyser);
        this.tick();
    }
    tick() {
        if (!this.analyser || !this.dataArray) {
            return;
        }
        this.analyser.getByteFrequencyData(this.dataArray);
        let total = 0;
        for (const sample of this.dataArray) {
            total += sample;
        }
        const average = total / this.dataArray.length;
        const normalized = Math.max(0, Math.min(1, average / 255));
        const boosted = Math.pow(normalized, 0.55);
        const amplified = boosted * this.adaptiveSensitivity;
        if (amplified > 1.02) {
            this.adaptiveSensitivity = Math.max(0.35, this.adaptiveSensitivity * 0.9);
        }
        else {
            this.adaptiveSensitivity += (this.baseSensitivity - this.adaptiveSensitivity) * 0.01;
        }
        const clipped = Math.max(0, Math.min(1, amplified));
        this.smoothedLevel = this.smoothedLevel * 0.45 + clipped * 0.55;
        this.listener(this.smoothedLevel);
        this.rafId = window.requestAnimationFrame(() => this.tick());
    }
    stop() {
        if (this.rafId) {
            window.cancelAnimationFrame(this.rafId);
            this.rafId = 0;
        }
        if (this.sourceNode) {
            this.sourceNode.disconnect();
            this.sourceNode = null;
        }
        if (this.analyser) {
            this.analyser.disconnect();
            this.analyser = null;
        }
        if (this.audioContext) {
            void this.audioContext.close();
            this.audioContext = null;
        }
        this.dataArray = null;
        this.smoothedLevel = 0;
        this.adaptiveSensitivity = this.baseSensitivity;
    }
}
