export type LevelListener = (level: number) => void;

export class AudioMeter {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private dataArray: Uint8Array<ArrayBuffer> | null = null;
  private rafId = 0;
  private listener: LevelListener;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private smoothedLevel = 0;
  private baseSensitivity = 1.8;
  private adaptiveSensitivity = 1.8;

  constructor(listener: LevelListener, sensitivity = 1.8) {
    this.listener = listener;
    this.setSensitivity(sensitivity);
  }

  setSensitivity(value: number): void {
    const safe = Number.isFinite(value) ? value : 1.8;
    this.baseSensitivity = Math.max(0.4, Math.min(4, safe));
    this.adaptiveSensitivity = this.baseSensitivity;
  }

  attach(stream: MediaStream): void {
    this.stop();

    this.audioContext = new AudioContext();
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 512;
    this.dataArray = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));
    this.sourceNode = this.audioContext.createMediaStreamSource(stream);
    this.sourceNode.connect(this.analyser);
    this.tick();
  }

  private tick(): void {
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
    } else {
      this.adaptiveSensitivity += (this.baseSensitivity - this.adaptiveSensitivity) * 0.01;
    }

    const clipped = Math.max(0, Math.min(1, amplified));
    this.smoothedLevel = this.smoothedLevel * 0.45 + clipped * 0.55;
    this.listener(this.smoothedLevel);

    this.rafId = window.requestAnimationFrame(() => this.tick());
  }

  stop(): void {
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
