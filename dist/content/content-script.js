"use strict";
(() => {
  // src/shared/messages.ts
  var MessageType = {
    GetSettings: "dictator:get-settings",
    UpdateSettings: "dictator:update-settings",
    StartPicker: "dictator:start-picker",
    ActivatePicker: "dictator:activate-picker",
    SaveSelector: "dictator:save-selector",
    RemoveSelector: "dictator:remove-selector",
    SettingsChanged: "dictator:settings-changed"
  };

  // src/shared/types.ts
  var DEFAULT_OPENAI_MODELS = [
    "gpt-realtime",
    "gpt-4o-realtime-preview",
    "gpt-4o-mini-realtime-preview"
  ];
  var DEFAULT_TRANSCRIPTION_MODELS = [
    "gpt-4o-transcribe",
    "gpt-4o-mini-transcribe",
    "whisper-1"
  ];
  var DEFAULT_SETTINGS = {
    provider: "native",
    openaiApiKey: "",
    openaiModel: DEFAULT_OPENAI_MODELS[0],
    transcriptionModel: DEFAULT_TRANSCRIPTION_MODELS[0],
    language: "fr",
    microphoneDeviceId: "",
    audioSensitivity: 1.8,
    inactivityTimeoutMs: 15e3,
    lockInputDuringDictation: true,
    sites: {},
    usage: {
      updatedAt: 0,
      totalTokens: 0,
      inputTokens: 0,
      outputTokens: 0
    }
  };

  // src/shared/storage.ts
  var STORAGE_KEY = "dictator.settings.v1";
  function getStorageKey() {
    return STORAGE_KEY;
  }

  // src/content/dom.ts
  var INPUT_TYPES = /* @__PURE__ */ new Set(["", "text", "search", "email", "url", "tel", "password", "number"]);
  function isEditableElement(element) {
    if (!element) {
      return false;
    }
    if (element instanceof HTMLTextAreaElement) {
      return true;
    }
    if (element instanceof HTMLInputElement) {
      return INPUT_TYPES.has((element.type || "").toLowerCase());
    }
    return element instanceof HTMLElement && element.isContentEditable;
  }
  function findEditableFromTarget(target) {
    if (!(target instanceof Element)) {
      return null;
    }
    const direct = target.closest("textarea, input, [contenteditable=''], [contenteditable='true']");
    return isEditableElement(direct) ? direct : null;
  }
  function getContentEditableSelectionRange(element) {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range2 = selection.getRangeAt(0);
      if (element.contains(range2.startContainer) && element.contains(range2.endContainer)) {
        return range2;
      }
    }
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    return range;
  }
  function insertEditableText(element, text) {
    if (!text) {
      return;
    }
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      const value = element.value;
      const start = element.selectionStart ?? value.length;
      const end = element.selectionEnd ?? start;
      const nextValue = `${value.slice(0, start)}${text}${value.slice(end)}`;
      const nextCaret = start + text.length;
      element.value = nextValue;
      element.setSelectionRange(nextCaret, nextCaret);
      element.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }
    const range = getContentEditableSelectionRange(element);
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    const selection = window.getSelection();
    if (selection) {
      const after = document.createRange();
      after.setStartAfter(node);
      after.collapse(true);
      selection.removeAllRanges();
      selection.addRange(after);
    }
    element.dispatchEvent(new Event("input", { bubbles: true }));
  }
  function getEditableLabel(element) {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      const fromAttrs = element.getAttribute("aria-label") || element.placeholder || element.name || element.id;
      return fromAttrs || element.tagName.toLowerCase();
    }
    return element.getAttribute("aria-label") || element.tagName.toLowerCase();
  }
  function lockEditable(element) {
    const state = {
      contentEditableAttr: element.getAttribute("contenteditable"),
      ariaReadonlyAttr: element.getAttribute("aria-readonly")
    };
    element.classList.add("dictator-locked-target");
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      state.readOnly = element.readOnly;
      element.readOnly = true;
      return state;
    }
    element.setAttribute("contenteditable", "false");
    element.setAttribute("aria-readonly", "true");
    return state;
  }
  function unlockEditable(element, state) {
    element.classList.remove("dictator-locked-target");
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      element.readOnly = Boolean(state.readOnly);
      return;
    }
    if (state.contentEditableAttr === null) {
      element.removeAttribute("contenteditable");
    } else {
      element.setAttribute("contenteditable", state.contentEditableAttr);
    }
    if (state.ariaReadonlyAttr === null) {
      element.removeAttribute("aria-readonly");
    } else {
      element.setAttribute("aria-readonly", state.ariaReadonlyAttr);
    }
  }

  // src/content/selector.ts
  function cssEscape(value) {
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
      return CSS.escape(value);
    }
    return value.replace(/(["\\#.:\[\]>+~*^$|=()])/g, "\\$1");
  }
  function attrSelector(tag, attr, value) {
    return `${tag}[${attr}="${value.replace(/"/g, '\\"')}"]`;
  }
  function buildPathSelector(element) {
    const parts = [];
    let node = element;
    while (node && node !== document.body && parts.length < 6) {
      const tag = node.tagName.toLowerCase();
      if (node.id) {
        parts.unshift(`#${cssEscape(node.id)}`);
        break;
      }
      const parentElement = node.parentElement;
      if (!parentElement) {
        parts.unshift(tag);
        break;
      }
      const siblings = Array.from(parentElement.children).filter(
        (child) => child.tagName === node?.tagName
      );
      const index = siblings.indexOf(node) + 1;
      parts.unshift(`${tag}:nth-of-type(${index})`);
      node = parentElement;
    }
    return parts.join(" > ");
  }
  function buildSelectorForElement(element) {
    const tag = element.tagName.toLowerCase();
    if (element.id) {
      return {
        selector: `#${cssEscape(element.id)}`,
        fallbackSelector: buildPathSelector(element)
      };
    }
    const name = element.getAttribute("name");
    if (name) {
      return {
        selector: attrSelector(tag, "name", name),
        fallbackSelector: buildPathSelector(element)
      };
    }
    const ariaLabel = element.getAttribute("aria-label");
    if (ariaLabel) {
      return {
        selector: attrSelector(tag, "aria-label", ariaLabel),
        fallbackSelector: buildPathSelector(element)
      };
    }
    const placeholder = element.getAttribute("placeholder");
    if (placeholder) {
      return {
        selector: attrSelector(tag, "placeholder", placeholder),
        fallbackSelector: buildPathSelector(element)
      };
    }
    return { selector: buildPathSelector(element) };
  }

  // src/content/picker.ts
  var PICKER_OVERLAY_ID = "dictator-picker-overlay";
  var PICKER_HIGHLIGHT_ID = "dictator-picker-highlight";
  var PICKER_BANNER_ID = "dictator-picker-banner";
  var FieldPicker = class {
    enabled = false;
    hoverElement = null;
    start() {
      if (this.enabled) {
        return;
      }
      this.enabled = true;
      this.mountUi();
      document.addEventListener("mousemove", this.onMouseMove, true);
      document.addEventListener("click", this.onClick, true);
      document.addEventListener("keydown", this.onKeyDown, true);
    }
    stop() {
      if (!this.enabled) {
        return;
      }
      this.enabled = false;
      document.removeEventListener("mousemove", this.onMouseMove, true);
      document.removeEventListener("click", this.onClick, true);
      document.removeEventListener("keydown", this.onKeyDown, true);
      this.unmountUi();
      this.hoverElement = null;
    }
    mountUi() {
      const overlay = document.createElement("div");
      overlay.id = PICKER_OVERLAY_ID;
      overlay.style.cssText = [
        "position: fixed",
        "inset: 0",
        "background: rgba(16, 29, 44, 0.08)",
        "z-index: 2147483644",
        "pointer-events: none"
      ].join(";");
      const highlight = document.createElement("div");
      highlight.id = PICKER_HIGHLIGHT_ID;
      highlight.style.cssText = [
        "position: fixed",
        "display: none",
        "border: 2px solid #1f6feb",
        "background: rgba(31, 111, 235, 0.14)",
        "border-radius: 6px",
        "z-index: 2147483645",
        "pointer-events: none"
      ].join(";");
      const banner = document.createElement("div");
      banner.id = PICKER_BANNER_ID;
      banner.style.cssText = [
        "position: fixed",
        "top: 12px",
        "left: 50%",
        "transform: translateX(-50%)",
        "z-index: 2147483646",
        "background: #111827",
        "color: #fff",
        "padding: 10px 14px",
        "border-radius: 10px",
        "font: 13px/1.4 'Segoe UI', sans-serif",
        "box-shadow: 0 8px 26px rgba(2, 6, 23, 0.3)",
        "pointer-events: none"
      ].join(";");
      banner.textContent = "Dictator: cliquez un champ texte pour ajouter la dictee (Echap pour quitter).";
      document.body.append(overlay, highlight, banner);
    }
    unmountUi() {
      document.getElementById(PICKER_OVERLAY_ID)?.remove();
      document.getElementById(PICKER_HIGHLIGHT_ID)?.remove();
      document.getElementById(PICKER_BANNER_ID)?.remove();
    }
    onMouseMove = (event) => {
      const editable = findEditableFromTarget(event.target);
      this.hoverElement = editable;
      const highlight = document.getElementById(PICKER_HIGHLIGHT_ID);
      if (!highlight || !editable) {
        if (highlight) {
          highlight.style.display = "none";
        }
        return;
      }
      const rect = editable.getBoundingClientRect();
      highlight.style.display = "block";
      highlight.style.left = `${Math.round(rect.left)}px`;
      highlight.style.top = `${Math.round(rect.top)}px`;
      highlight.style.width = `${Math.round(rect.width)}px`;
      highlight.style.height = `${Math.round(rect.height)}px`;
    };
    onClick = (event) => {
      if (!this.enabled) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const editable = findEditableFromTarget(event.target) ?? (this.hoverElement ? findEditableFromTarget(this.hoverElement) : null);
      if (!editable) {
        return;
      }
      const selectorData = buildSelectorForElement(editable);
      void chrome.runtime.sendMessage({
        type: MessageType.SaveSelector,
        payload: {
          origin: window.location.origin,
          selector: selectorData.selector,
          fallbackSelector: selectorData.fallbackSelector,
          label: getEditableLabel(editable)
        }
      });
      this.stop();
    };
    onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.stop();
      }
    };
  };

  // src/content/audio-meter.ts
  var AudioMeter = class {
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
      } else {
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
  };

  // src/content/providers/native-provider.ts
  var NativeDictationProvider = class {
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
          } else {
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
          audio: config.microphoneDeviceId ? {
            deviceId: { exact: config.microphoneDeviceId }
          } : true
        });
        this.meter.attach(this.meterStream);
      } catch {
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
        } catch {
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
  };

  // src/content/providers/openai-provider.ts
  function parseNumber(value) {
    if (typeof value !== "number" || Number.isNaN(value)) {
      return 0;
    }
    return value;
  }
  async function waitForIceGatheringComplete(peerConnection) {
    if (peerConnection.iceGatheringState === "complete") {
      return;
    }
    await new Promise((resolve) => {
      const onChange = () => {
        if (peerConnection.iceGatheringState === "complete") {
          peerConnection.removeEventListener("icegatheringstatechange", onChange);
          resolve();
        }
      };
      peerConnection.addEventListener("icegatheringstatechange", onChange);
    });
  }
  var OpenAIRealtimeProvider = class {
    peerConnection = null;
    dataChannel = null;
    stream = null;
    callbacks = null;
    meter = new AudioMeter((level) => this.callbacks?.onLevel(level));
    committed = "";
    interim = "";
    mergeCommittedAndInterim() {
      const base = this.committed.trim();
      const tail = this.interim.trim();
      if (!tail) {
        return base;
      }
      if (!base) {
        return tail;
      }
      return `${base} ${tail}`.trim();
    }
    flushInterimBeforeError() {
      if (!this.callbacks) {
        return;
      }
      const promoted = this.mergeCommittedAndInterim();
      if (!promoted) {
        return;
      }
      this.callbacks.onTranscript(promoted, "");
    }
    async start(config, callbacks) {
      if (!config.apiKey) {
        throw new Error("Cle OpenAI manquante dans la configuration.");
      }
      this.callbacks = callbacks;
      this.committed = "";
      this.interim = "";
      this.meter.setSensitivity(config.audioSensitivity);
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: config.microphoneDeviceId ? {
            deviceId: {
              exact: config.microphoneDeviceId
            }
          } : true
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
        await new Promise((resolve, reject) => {
          const timeoutId = window.setTimeout(() => {
            reject(new Error("Timeout ouverture canal Realtime."));
          }, 1e4);
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
    sendSessionUpdate(config) {
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
    handleEvent(raw) {
      try {
        this.callbacks?.onDebug?.(`[openai<-] ${raw}`);
        const event = JSON.parse(raw);
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
          const usage = event.usage;
          if (usage) {
            const inputTokens = parseNumber(usage.input_tokens);
            const outputTokens = parseNumber(usage.output_tokens);
            const totalTokens = parseNumber(usage.total_tokens);
            this.callbacks?.onUsage?.({ inputTokens, outputTokens, totalTokens });
          }
          return;
        }
        if (type === "response.done") {
          const response = event.response;
          const usage = response?.usage;
          if (usage) {
            const inputTokens = parseNumber(usage.input_tokens);
            const outputTokens = parseNumber(usage.output_tokens);
            const totalTokens = parseNumber(usage.total_tokens);
            this.callbacks?.onUsage?.({ inputTokens, outputTokens, totalTokens });
          }
        }
        if (type === "error") {
          this.flushInterimBeforeError();
          const errorObj = event.error;
          const message = typeof errorObj?.message === "string" && errorObj.message || typeof event.message === "string" && event.message || "Erreur OpenAI Realtime";
          this.callbacks?.onError(message);
          return;
        }
      } catch {
        this.flushInterimBeforeError();
        this.callbacks?.onError("Evenement OpenAI invalide recu.");
      }
    }
    async stop() {
      this.cleanup(true);
    }
    cleanup(notifyStop) {
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
  };

  // src/content/services/transcript-stream.ts
  function normalizeSpaces(value) {
    return value.replace(/\s+/g, " ").trim();
  }
  function findOverlapSuffixPrefix(previous, current) {
    const max = Math.min(previous.length, current.length, 240);
    for (let size = max; size >= 1; size -= 1) {
      if (previous.slice(-size) === current.slice(0, size)) {
        return size;
      }
    }
    return 0;
  }
  var TranscriptStream = class {
    lastCommittedSnapshot = "";
    reset(snapshot = "") {
      this.lastCommittedSnapshot = normalizeSpaces(snapshot);
    }
    ingest(frame) {
      const committedSnapshot = normalizeSpaces(frame.committed);
      const preview = normalizeSpaces([frame.committed, frame.interim].filter(Boolean).join(" "));
      const previous = this.lastCommittedSnapshot;
      if (!committedSnapshot) {
        this.lastCommittedSnapshot = committedSnapshot;
        return { delta: "", preview, committedSnapshot };
      }
      if (!previous) {
        this.lastCommittedSnapshot = committedSnapshot;
        return { delta: committedSnapshot, preview, committedSnapshot };
      }
      if (committedSnapshot.startsWith(previous)) {
        this.lastCommittedSnapshot = committedSnapshot;
        return { delta: committedSnapshot.slice(previous.length), preview, committedSnapshot };
      }
      if (previous.endsWith(committedSnapshot)) {
        this.lastCommittedSnapshot = committedSnapshot;
        return { delta: "", preview, committedSnapshot };
      }
      const overlap = findOverlapSuffixPrefix(previous, committedSnapshot);
      if (overlap > 0) {
        this.lastCommittedSnapshot = committedSnapshot;
        return { delta: committedSnapshot.slice(overlap), preview, committedSnapshot };
      }
      this.lastCommittedSnapshot = committedSnapshot;
      return { delta: "", preview, committedSnapshot };
    }
  };

  // src/content/content-script.ts
  var STYLE_ID = "dictator-content-style";
  var DictationController = class {
    settings;
    picker = new FieldPicker();
    bindings = /* @__PURE__ */ new Map();
    observer = null;
    activeSession = null;
    repositionRaf = 0;
    constructor(settings) {
      this.settings = settings;
    }
    start() {
      this.injectStyles();
      this.syncBindings();
      this.observer = new MutationObserver(() => {
        this.syncBindings();
      });
      this.observer.observe(document.documentElement, {
        childList: true,
        subtree: true
      });
      window.addEventListener("scroll", this.requestReposition, true);
      window.addEventListener("resize", this.requestReposition, true);
    }
    destroy() {
      this.picker.stop();
      this.observer?.disconnect();
      this.observer = null;
      window.removeEventListener("scroll", this.requestReposition, true);
      window.removeEventListener("resize", this.requestReposition, true);
      for (const binding of this.bindings.values()) {
        binding.container.remove();
        binding.previewPanel.remove();
      }
      this.bindings.clear();
    }
    updateSettings(next) {
      this.settings = next;
      this.syncBindings();
    }
    startPicker() {
      this.picker.start();
    }
    injectStyles() {
      if (document.getElementById(STYLE_ID)) {
        return;
      }
      const style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = `
      .dictator-btn-wrap {
        position: absolute;
        z-index: 2147483643;
        display: inline-flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 6px;
      }

      .dictator-btn-wrap.dictator-floating {
        position: fixed;
        top: 14px;
        right: 14px;
        left: auto !important;
        z-index: 2147483646;
        background: rgba(255, 255, 255, 0.96);
        border: 1px solid #cbd5e1;
        border-radius: 999px;
        padding: 6px 8px;
        box-shadow: 0 10px 28px rgba(2, 6, 23, 0.28);
      }

      .dictator-remove-btn {
        width: 18px;
        height: 18px;
        border: 1px solid #94a3b8;
        background: #fff;
        color: #475569;
        border-radius: 999px;
        font: 700 12px/1 'Segoe UI', sans-serif;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        padding: 0;
      }

      .dictator-remove-btn:hover {
        border-color: #64748b;
        color: #1f2937;
        background: #f8fafc;
      }

      .dictator-lock-btn {
        display: none;
        border: 1px solid #94a3b8;
        background: #fff;
        color: #334155;
        border-radius: 999px;
        width: 20px;
        height: 20px;
        font: 700 12px/1 'Segoe UI', sans-serif;
        padding: 0;
        cursor: pointer;
      }

      .dictator-lock-btn[data-visible='true'] {
        display: inline-block;
      }

      .dictator-lock-btn:hover {
        border-color: #64748b;
        color: #0f172a;
        background: #f8fafc;
      }

      .dictator-lock-btn[data-locked='true'] {
        border-color: #9a3412;
        background: #fff7ed;
        color: #9a3412;
      }

      .dictator-preview-toggle {
        display: none;
        border: 1px solid #94a3b8;
        background: #fff;
        color: #334155;
        border-radius: 999px;
        width: 22px;
        height: 20px;
        font: 700 12px/1 'Segoe UI', sans-serif;
        padding: 0;
        cursor: pointer;
      }

      .dictator-preview-toggle[data-visible='true'] {
        display: inline-block;
      }

      .dictator-preview-toggle[data-open='true'] {
        border-color: #14532d;
        background: #ecfdf3;
        color: #14532d;
      }

      .dictator-btn {
        border: 1px solid #166534;
        background: #ecfdf3;
        color: #14532d;
        border-radius: 999px;
        padding: 4px 10px;
        font: 600 12px/1.2 'Segoe UI', sans-serif;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(2, 6, 23, 0.2);
      }

      .dictator-btn[data-state='listening'] {
        background: #14532d;
        color: #fff;
        border-color: #14532d;
      }

      .dictator-btn[data-state='error'] {
        background: #7f1d1d;
        color: #fff;
        border-color: #7f1d1d;
      }

      .dictator-meter {
        width: 28px;
        height: 8px;
        border-radius: 5px;
        background: linear-gradient(90deg, #a7f3d0, #10b981, #059669);
        transform-origin: left center;
        transform: scaleX(0);
        transition: transform 80ms linear;
      }

      .dictator-inactivity-track {
        display: none;
        width: 100%;
        height: 3px;
        border-radius: 999px;
        background: #e2e8f0;
        overflow: hidden;
        margin-top: 2px;
      }

      .dictator-inactivity-bar {
        width: 100%;
        height: 100%;
        transform-origin: left center;
        transform: scaleX(1);
        transition: transform 90ms linear;
        background: linear-gradient(90deg, #16a34a, #f59e0b, #dc2626);
      }

      .dictator-preview-panel {
        display: none;
        position: fixed;
        top: 58px;
        right: 14px;
        z-index: 2147483645;
        width: min(420px, 82vw);
        background: rgba(255, 255, 255, 0.97);
        border: 1px solid #cbd5e1;
        border-radius: 12px;
        box-shadow: 0 10px 24px rgba(2, 6, 23, 0.24);
        padding: 6px 8px;
      }

      .dictator-preview-panel[data-open='true'] {
        display: block;
      }

      .dictator-preview-content {
        font: 500 11px/1.35 'Segoe UI', sans-serif;
        color: #334155;
        max-height: 44px;
        min-height: 32px;
        overflow: hidden;
        white-space: pre-wrap;
      }

      .dictator-preview-meta {
        margin: 0 0 4px;
        font: 600 10px/1.25 'Segoe UI', sans-serif;
        color: #475569;
      }

      .dictator-locked-target {
        filter: grayscale(0.2) !important;
        opacity: 0.82 !important;
      }

      .dictator-meter-active {
        animation: dictator-meter-glow 1200ms ease-in-out infinite;
      }

      @keyframes dictator-meter-glow {
        0% { filter: brightness(0.9); opacity: 0.86; }
        50% { filter: brightness(1.2); opacity: 1; }
        100% { filter: brightness(0.9); opacity: 0.86; }
      }
    `;
      document.documentElement.append(style);
    }
    syncBindings() {
      const origin = window.location.origin;
      const site = this.settings.sites[origin];
      const candidates = /* @__PURE__ */ new Set();
      if (site) {
        for (const entry of site.selectors) {
          const primary = document.querySelectorAll(entry.selector);
          for (const element of primary) {
            if (isEditableElement(element)) {
              candidates.add(element);
            }
          }
          if (primary.length === 0 && entry.fallbackSelector) {
            const fallback = document.querySelectorAll(entry.fallbackSelector);
            for (const element of fallback) {
              if (isEditableElement(element)) {
                candidates.add(element);
              }
            }
          }
        }
      }
      for (const [element, binding] of this.bindings) {
        if (this.activeSession?.binding === binding) {
          continue;
        }
        if (!candidates.has(element) || !document.contains(element)) {
          binding.container.remove();
          binding.previewPanel.remove();
          this.bindings.delete(element);
        }
      }
      if (!site) {
        return;
      }
      for (const entry of site.selectors) {
        const matched = document.querySelectorAll(entry.selector);
        for (const node of matched) {
          if (!isEditableElement(node)) {
            continue;
          }
          if (!this.bindings.has(node)) {
            this.createBinding(node, entry.id);
          }
        }
        if (matched.length === 0 && entry.fallbackSelector) {
          const fallback = document.querySelectorAll(entry.fallbackSelector);
          for (const node of fallback) {
            if (!isEditableElement(node)) {
              continue;
            }
            if (!this.bindings.has(node)) {
              this.createBinding(node, entry.id);
            }
          }
        }
      }
      this.requestReposition();
    }
    createBinding(element, entryId) {
      const container = document.createElement("div");
      container.className = "dictator-btn-wrap";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "dictator-btn";
      button.dataset.state = "idle";
      button.textContent = "Dictee";
      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "dictator-remove-btn";
      removeButton.textContent = "\xD7";
      removeButton.title = "Supprimer la dictee pour ce champ";
      removeButton.setAttribute("aria-label", "Supprimer la dictee pour ce champ");
      const meter = document.createElement("div");
      meter.className = "dictator-meter";
      const inactivityTrack = document.createElement("div");
      inactivityTrack.className = "dictator-inactivity-track";
      const inactivityBar = document.createElement("div");
      inactivityBar.className = "dictator-inactivity-bar";
      inactivityBar.style.transform = "scaleX(0)";
      inactivityTrack.append(inactivityBar);
      const lockButton = document.createElement("button");
      lockButton.type = "button";
      lockButton.className = "dictator-lock-btn";
      lockButton.dataset.visible = "false";
      lockButton.dataset.locked = "false";
      lockButton.textContent = "\u{1F513}";
      lockButton.title = "Verrouiller la saisie";
      lockButton.setAttribute("aria-label", "Verrouiller la saisie");
      const previewButton = document.createElement("button");
      previewButton.type = "button";
      previewButton.className = "dictator-preview-toggle";
      previewButton.dataset.visible = "false";
      previewButton.dataset.open = "false";
      previewButton.textContent = "\u2026";
      previewButton.title = "Afficher la preview";
      previewButton.setAttribute("aria-label", "Afficher la preview");
      const previewPanel = document.createElement("div");
      previewPanel.className = "dictator-preview-panel";
      previewPanel.dataset.open = "false";
      const previewContent = document.createElement("div");
      previewContent.className = "dictator-preview-content";
      previewContent.textContent = "Preview dictee";
      const previewMeta = document.createElement("div");
      previewMeta.className = "dictator-preview-meta";
      previewMeta.textContent = "Modele actif: -";
      previewPanel.append(previewMeta, previewContent);
      container.append(button, removeButton, lockButton, previewButton, meter, inactivityTrack);
      document.body.append(container);
      document.body.append(previewPanel);
      const binding = {
        element,
        entryId,
        container,
        button,
        removeButton,
        lockButton,
        previewButton,
        inactivityTrack,
        inactivityBar,
        previewPanel,
        previewMeta,
        previewContent,
        meter
      };
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void this.toggleDictation(binding);
      });
      removeButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void this.removeBindingConfiguration(binding);
      });
      lockButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.toggleLock(binding);
      });
      previewButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.togglePreview(binding);
      });
      this.bindings.set(element, binding);
    }
    async removeBindingConfiguration(binding) {
      const confirmed = window.confirm("Supprimer la configuration de dictee pour ce champ ?");
      if (!confirmed) {
        return;
      }
      if (this.activeSession?.binding === binding) {
        await this.stopActiveSession();
      }
      const response = await chrome.runtime.sendMessage({
        type: MessageType.RemoveSelector,
        payload: {
          origin: window.location.origin,
          selectorId: binding.entryId
        }
      });
      if (!response.ok) {
        binding.button.dataset.state = "error";
        binding.button.textContent = "Erreur";
        binding.button.title = response.error ?? "Suppression impossible";
        return;
      }
      binding.container.remove();
      binding.previewPanel.remove();
      this.bindings.delete(binding.element);
    }
    toggleLock(binding) {
      if (!this.activeSession || this.activeSession.binding !== binding) {
        return;
      }
      this.setSessionLock(this.activeSession, !this.activeSession.locked);
    }
    togglePreview(binding) {
      const isOpen = binding.previewPanel.dataset.open === "true";
      const next = !isOpen;
      binding.previewPanel.dataset.open = next ? "true" : "false";
      binding.previewButton.dataset.open = next ? "true" : "false";
      binding.previewButton.title = next ? "Masquer la preview" : "Afficher la preview";
      binding.previewButton.setAttribute("aria-label", next ? "Masquer la preview" : "Afficher la preview");
    }
    setSessionLock(session, shouldLock) {
      if (shouldLock && !session.locked) {
        session.lockState = lockEditable(session.binding.element);
        session.locked = true;
        session.binding.lockButton.dataset.locked = "true";
        session.binding.lockButton.textContent = "\u{1F512}";
        session.binding.lockButton.title = "Deverrouiller la saisie";
        session.binding.lockButton.setAttribute("aria-label", "Deverrouiller la saisie");
        return;
      }
      if (!shouldLock && session.locked) {
        if (session.lockState) {
          unlockEditable(session.binding.element, session.lockState);
        }
        session.lockState = null;
        session.locked = false;
        session.binding.lockButton.dataset.locked = "false";
        session.binding.lockButton.textContent = "\u{1F513}";
        session.binding.lockButton.title = "Verrouiller la saisie";
        session.binding.lockButton.setAttribute("aria-label", "Verrouiller la saisie");
      }
    }
    requestReposition = () => {
      if (this.repositionRaf) {
        return;
      }
      this.repositionRaf = window.requestAnimationFrame(() => {
        this.repositionRaf = 0;
        this.repositionBindings();
      });
    };
    repositionBindings() {
      for (const binding of this.bindings.values()) {
        if (this.activeSession?.binding === binding) {
          continue;
        }
        if (!document.contains(binding.element)) {
          continue;
        }
        const rect = binding.element.getBoundingClientRect();
        const x = window.scrollX + rect.right - 92;
        const y = window.scrollY + rect.top - 12;
        binding.container.style.left = `${Math.max(0, x)}px`;
        binding.container.style.top = `${Math.max(0, y)}px`;
      }
    }
    async toggleDictation(binding) {
      if (this.activeSession && this.activeSession.binding === binding) {
        await this.stopActiveSession();
        return;
      }
      if (this.activeSession && this.activeSession.binding !== binding) {
        await this.stopActiveSession();
      }
      await this.startSession(binding);
    }
    async startSession(binding) {
      let provider = this.settings.provider === "openai" ? new OpenAIRealtimeProvider() : new NativeDictationProvider();
      binding.button.dataset.state = "listening";
      binding.button.textContent = "Stop";
      binding.meter.classList.add("dictator-meter-active");
      binding.meter.style.transform = "scaleX(0.1)";
      binding.lockButton.dataset.visible = "true";
      binding.lockButton.dataset.locked = "false";
      binding.lockButton.textContent = "\u{1F513}";
      binding.lockButton.title = "Verrouiller la saisie";
      binding.previewButton.dataset.visible = "true";
      binding.previewButton.dataset.open = "false";
      binding.previewButton.title = "Afficher la preview";
      binding.previewButton.setAttribute("aria-label", "Afficher la preview");
      binding.previewPanel.dataset.open = "false";
      binding.previewContent.textContent = "Ecoute en cours...";
      binding.previewMeta.textContent = `Modele actif: ${this.getModelLabel(this.settings.provider)}`;
      binding.inactivityTrack.style.display = "block";
      this.pinBindingForListening(binding);
      const lockState = null;
      const session = {
        provider,
        element: binding.element,
        binding,
        transcript: new TranscriptStream(),
        latestCommittedSnapshot: "",
        hasInsertedText: false,
        isApplyingDictation: false,
        locked: false,
        lockState,
        lastLevelAt: 0,
        lastTranscriptSize: 0,
        inactivityTimerId: null,
        inactivityDeadlineAt: 0,
        inactivityRafId: null,
        externalInputListener: () => {
        },
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0
        }
      };
      session.externalInputListener = (_event) => {
        if (!this.activeSession || this.activeSession !== session) {
          return;
        }
        if (session.isApplyingDictation) {
          return;
        }
        session.transcript.reset(session.latestCommittedSnapshot);
        session.hasInsertedText = false;
        this.bumpInactivityTimer(session);
      };
      this.activeSession = session;
      binding.element.addEventListener("input", session.externalInputListener, true);
      this.setSessionLock(session, this.settings.lockInputDuringDictation);
      this.bumpInactivityTimer(session);
      const startConfig = {
        apiKey: this.settings.openaiApiKey,
        model: this.settings.openaiModel,
        transcriptionModel: this.settings.transcriptionModel,
        language: this.settings.language,
        microphoneDeviceId: this.settings.microphoneDeviceId,
        audioSensitivity: this.settings.audioSensitivity,
        target: binding.element
      };
      const callbacks = {
        onTranscript: (committed, interim) => {
          if (!this.activeSession || this.activeSession.binding !== binding) {
            return;
          }
          const streamed = session.transcript.ingest({ committed, interim });
          session.latestCommittedSnapshot = streamed.committedSnapshot;
          this.updatePreview(binding, streamed.preview);
          let delta = streamed.delta;
          if (delta && !session.hasInsertedText && this.shouldInsertLeadingSpace(session.binding.element, delta)) {
            delta = ` ${delta}`;
          }
          if (delta) {
            session.isApplyingDictation = true;
            try {
              insertEditableText(binding.element, delta);
            } finally {
              session.isApplyingDictation = false;
            }
            session.hasInsertedText = true;
          }
          const nextSize = streamed.committedSnapshot.length;
          const growth = Math.max(0, nextSize - session.lastTranscriptSize);
          session.lastTranscriptSize = nextSize;
          if (delta || interim) {
            this.bumpInactivityTimer(session);
          }
          if (Date.now() - session.lastLevelAt > 280) {
            const fallbackLevel = Math.max(0.12, Math.min(1, 0.2 + growth * 0.08 + (interim ? 0.18 : 0.06)));
            binding.meter.style.transform = `scaleX(${fallbackLevel})`;
            window.setTimeout(() => {
              if (!this.activeSession || this.activeSession.binding !== binding) {
                return;
              }
              if (Date.now() - session.lastLevelAt > 280) {
                binding.meter.style.transform = "scaleX(0.1)";
              }
            }, 90);
          }
        },
        onLevel: (level) => {
          session.lastLevelAt = Date.now();
          if (level > 0.18) {
            this.bumpInactivityTimer(session);
          }
          const displayLevel = 0.08 + Math.pow(Math.max(0, Math.min(1, level)), 0.65) * 0.92;
          binding.meter.style.transform = `scaleX(${displayLevel})`;
        },
        onUsage: (usage) => {
          session.usage.inputTokens += usage.inputTokens;
          session.usage.outputTokens += usage.outputTokens;
          session.usage.totalTokens += usage.totalTokens;
        },
        onWarning: (message) => {
          binding.button.title = message;
          this.updatePreview(binding, `Info: ${message}`);
        },
        onError: (message) => {
          if (this.isTransientNetworkError(message)) {
            binding.button.title = message;
            this.updatePreview(binding, `Info reseau: ${message}`);
            this.bumpInactivityTimer(session);
            return;
          }
          binding.button.dataset.state = "error";
          binding.button.textContent = "Erreur detail";
          binding.button.title = message;
          this.updatePreview(binding, `Erreur: ${message}`);
        },
        onStop: () => {
          if (!this.activeSession || this.activeSession.binding !== binding) {
            return;
          }
          binding.element.removeEventListener("input", session.externalInputListener, true);
          this.setSessionLock(session, false);
          this.clearInactivityTimer(session);
          this.resetBinding(binding);
          this.persistUsage(session.usage);
          this.activeSession = null;
        }
      };
      try {
        await provider.start(startConfig, callbacks);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Erreur de demarrage de la dictee.";
        if (this.settings.provider === "openai") {
          const fallback = new NativeDictationProvider();
          provider = fallback;
          session.provider = fallback;
          this.activeSession = session;
          binding.previewMeta.textContent = `Modele actif: fallback:${this.settings.openaiModel}->native`;
          binding.button.title = `${message} | Fallback natif active`;
          try {
            await fallback.start(startConfig, callbacks);
            return;
          } catch (fallbackError) {
            const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : "Fallback natif indisponible.";
            binding.button.dataset.state = "error";
            binding.button.textContent = "Erreur";
            binding.button.title = `${message} | ${fallbackMessage}`;
            binding.element.removeEventListener("input", session.externalInputListener, true);
            this.setSessionLock(session, false);
            this.clearInactivityTimer(session);
            this.activeSession = null;
            return;
          }
        }
        binding.button.dataset.state = "error";
        binding.button.textContent = "Erreur";
        binding.button.title = message;
        binding.element.removeEventListener("input", session.externalInputListener, true);
        this.setSessionLock(session, false);
        this.clearInactivityTimer(session);
        this.activeSession = null;
      }
    }
    async stopActiveSession() {
      if (!this.activeSession) {
        return;
      }
      const session = this.activeSession;
      this.activeSession = null;
      session.binding.element.removeEventListener("input", session.externalInputListener, true);
      this.clearInactivityTimer(session);
      await session.provider.stop();
      this.setSessionLock(session, false);
      this.resetBinding(session.binding);
      await this.persistUsage(session.usage);
    }
    resetBinding(binding) {
      binding.container.classList.remove("dictator-floating");
      binding.button.dataset.state = "idle";
      binding.button.textContent = "Dictee";
      binding.button.title = "";
      binding.lockButton.dataset.visible = "false";
      binding.lockButton.dataset.locked = "false";
      binding.lockButton.textContent = "\u{1F513}";
      binding.lockButton.title = "Verrouiller la saisie";
      binding.lockButton.setAttribute("aria-label", "Verrouiller la saisie");
      binding.previewButton.dataset.visible = "false";
      binding.previewButton.dataset.open = "false";
      binding.previewButton.title = "Afficher la preview";
      binding.previewButton.setAttribute("aria-label", "Afficher la preview");
      binding.previewPanel.dataset.open = "false";
      binding.previewContent.textContent = "";
      binding.previewMeta.textContent = "Modele actif: -";
      binding.inactivityTrack.style.display = "none";
      binding.meter.classList.remove("dictator-meter-active");
      binding.meter.style.transform = "scaleX(0)";
      binding.inactivityBar.style.transform = "scaleX(0)";
      this.requestReposition();
    }
    pinBindingForListening(binding) {
      binding.container.classList.add("dictator-floating");
    }
    updatePreview(binding, text) {
      const compact = text.replace(/\s+/g, " ").trim();
      if (!compact) {
        binding.previewContent.textContent = "Ecoute en cours...";
        return;
      }
      const maxChars = 190;
      const tail = compact.length > maxChars ? `...${compact.slice(compact.length - maxChars)}` : compact;
      binding.previewContent.textContent = tail;
    }
    shouldInsertLeadingSpace(element, text) {
      if (!text) {
        return false;
      }
      const lastChar = this.getCharBeforeCaret(element);
      if (!lastChar) {
        return false;
      }
      if (/\s/.test(lastChar)) {
        return false;
      }
      const firstChar = text[0];
      if (/^[,.;:!?)}\]"']/u.test(firstChar)) {
        return false;
      }
      return /[\p{L}\p{N})\]"']/u.test(lastChar) && /[\p{L}\p{N}(\["']/u.test(firstChar);
    }
    getModelLabel(provider) {
      if (provider === "openai") {
        return `openai:${this.settings.openaiModel}`;
      }
      return "native:webspeech";
    }
    isTransientNetworkError(message) {
      const normalized = message.toLowerCase();
      return normalized.includes("network") || normalized.includes("reseau") || normalized.includes("timeout");
    }
    getCharBeforeCaret(element) {
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        const value = element.value;
        const position = element.selectionStart ?? value.length;
        if (position <= 0) {
          return "";
        }
        return value.slice(position - 1, position);
      }
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        const text = element.textContent ?? "";
        return text.slice(-1);
      }
      const range = selection.getRangeAt(0);
      if (!element.contains(range.startContainer)) {
        const text = element.textContent ?? "";
        return text.slice(-1);
      }
      const probe = range.cloneRange();
      probe.collapse(true);
      if (probe.startOffset > 0) {
        probe.setStart(probe.startContainer, probe.startOffset - 1);
        return probe.toString();
      }
      const before = range.cloneRange();
      before.selectNodeContents(element);
      before.setEnd(range.startContainer, range.startOffset);
      const full = before.toString();
      return full.slice(-1);
    }
    getInactivityTimeoutMs() {
      const value = Number(this.settings.inactivityTimeoutMs);
      if (!Number.isFinite(value)) {
        return 15e3;
      }
      return Math.max(5e3, Math.min(6e4, Math.round(value)));
    }
    tickInactivityBar = (session) => {
      if (!this.activeSession || this.activeSession !== session) {
        return;
      }
      const timeout = this.getInactivityTimeoutMs();
      const remaining = Math.max(0, session.inactivityDeadlineAt - Date.now());
      const ratio = timeout > 0 ? remaining / timeout : 0;
      session.binding.inactivityBar.style.transform = `scaleX(${Math.max(0, Math.min(1, ratio))})`;
      if (remaining > 0) {
        session.inactivityRafId = window.requestAnimationFrame(() => {
          this.tickInactivityBar(session);
        });
      }
    };
    bumpInactivityTimer(session) {
      this.clearInactivityTimer(session);
      const timeoutMs = this.getInactivityTimeoutMs();
      session.inactivityDeadlineAt = Date.now() + timeoutMs;
      session.binding.inactivityBar.style.transform = "scaleX(1)";
      this.tickInactivityBar(session);
      session.inactivityTimerId = window.setTimeout(() => {
        if (!this.activeSession || this.activeSession !== session) {
          return;
        }
        void this.stopActiveSession();
      }, timeoutMs);
    }
    clearInactivityTimer(session) {
      if (session.inactivityTimerId !== null) {
        window.clearTimeout(session.inactivityTimerId);
        session.inactivityTimerId = null;
      }
      if (session.inactivityRafId !== null) {
        window.cancelAnimationFrame(session.inactivityRafId);
        session.inactivityRafId = null;
      }
    }
    async persistUsage(usage) {
      if (usage.totalTokens <= 0) {
        return;
      }
      const nextUsage = {
        updatedAt: Date.now(),
        inputTokens: (this.settings.usage.inputTokens || 0) + usage.inputTokens,
        outputTokens: (this.settings.usage.outputTokens || 0) + usage.outputTokens,
        totalTokens: (this.settings.usage.totalTokens || 0) + usage.totalTokens
      };
      this.settings = {
        ...this.settings,
        usage: nextUsage
      };
      await chrome.runtime.sendMessage({
        type: MessageType.UpdateSettings,
        payload: { usage: nextUsage }
      });
    }
  };
  async function loadSettings() {
    const response = await chrome.runtime.sendMessage({ type: MessageType.GetSettings });
    if (!response.ok || !response.settings) {
      throw new Error(response.error ?? "Chargement settings impossible");
    }
    return response.settings;
  }
  var controllerRef = null;
  var pendingPickerActivation = false;
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === MessageType.ActivatePicker) {
      if (controllerRef) {
        controllerRef.startPicker();
      } else {
        pendingPickerActivation = true;
      }
    }
    if (message.type === MessageType.SettingsChanged && controllerRef) {
      void loadSettings().then((next) => controllerRef?.updateSettings(next));
    }
  });
  var boot = async () => {
    const settings = await loadSettings();
    const controller = new DictationController(settings);
    controllerRef = controller;
    controller.start();
    if (pendingPickerActivation) {
      pendingPickerActivation = false;
      controller.startPicker();
    }
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") {
        return;
      }
      if (changes[getStorageKey()]) {
        void loadSettings().then((next) => controllerRef?.updateSettings(next));
      }
    });
    window.addEventListener("beforeunload", () => {
      controller.destroy();
    });
  };
  void boot().catch((error) => {
    console.error("[Dictator] boot failed", error);
  });
})();
