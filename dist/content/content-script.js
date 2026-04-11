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
  function buildDictationAnchor(element) {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      const value = element.value;
      const start2 = element.selectionStart ?? value.length;
      const end2 = element.selectionEnd ?? start2;
      return {
        prefix: value.slice(0, start2),
        suffix: value.slice(end2)
      };
    }
    const fullText = element.textContent ?? "";
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return { prefix: fullText, suffix: "" };
    }
    const range = selection.getRangeAt(0);
    if (!element.contains(range.startContainer) || !element.contains(range.endContainer)) {
      return { prefix: fullText, suffix: "" };
    }
    const preRange = range.cloneRange();
    preRange.selectNodeContents(element);
    preRange.setEnd(range.startContainer, range.startOffset);
    const start = preRange.toString().length;
    const selectedLength = range.toString().length;
    const end = start + selectedLength;
    return {
      prefix: fullText.slice(0, start),
      suffix: fullText.slice(end)
    };
  }
  function setEditableText(element, value, caretPos) {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      element.value = value;
      if (typeof caretPos === "number") {
        const safe = Math.max(0, Math.min(value.length, caretPos));
        element.setSelectionRange(safe, safe);
      }
      element.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }
    element.textContent = value;
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
          } else {
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
          audio: config.microphoneDeviceId ? {
            deviceId: { exact: config.microphoneDeviceId }
          } : true
        });
        this.meter.attach(this.meterStream);
      } catch {
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
          this.handleEvent(event.data);
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
      } catch (error) {
        this.cleanup(false);
        throw error;
      }
    }
    sendSessionUpdate(config) {
      if (!this.dataChannel) {
        return;
      }
      this.dataChannel.send(
        JSON.stringify({
          type: "session.update",
          session: {
            type: "realtime",
            model: config.model,
            output_modalities: ["text"],
            audio: {
              input: {
                format: {
                  type: "audio/pcm",
                  rate: 24e3
                },
                transcription: {
                  model: config.transcriptionModel,
                  language: config.language || "fr"
                },
                turn_detection: {
                  type: "server_vad",
                  create_response: false
                }
              }
            }
          }
        })
      );
    }
    handleEvent(raw) {
      try {
        const event = JSON.parse(raw);
        const type = String(event.type ?? "");
        if (type === "conversation.item.input_audio_transcription.delta") {
          const delta = String(event.delta ?? "");
          this.interim = `${this.interim}${delta}`;
          this.callbacks?.onTranscript(this.committed.trim(), this.interim.trim());
          return;
        }
        if (type === "conversation.item.input_audio_transcription.completed") {
          const transcript = String(event.transcript ?? "").trim();
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
      } catch {
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
      const lockButton = document.createElement("button");
      lockButton.type = "button";
      lockButton.className = "dictator-lock-btn";
      lockButton.dataset.visible = "false";
      lockButton.dataset.locked = "false";
      lockButton.textContent = "\u{1F513}";
      lockButton.title = "Verrouiller la saisie";
      lockButton.setAttribute("aria-label", "Verrouiller la saisie");
      container.append(button, removeButton, lockButton, meter);
      document.body.append(container);
      const binding = { element, entryId, container, button, removeButton, lockButton, meter };
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
      this.bindings.delete(binding.element);
    }
    toggleLock(binding) {
      if (!this.activeSession || this.activeSession.binding !== binding) {
        return;
      }
      this.setSessionLock(this.activeSession, !this.activeSession.locked);
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
      const anchor = buildDictationAnchor(binding.element);
      binding.button.dataset.state = "listening";
      binding.button.textContent = "Stop";
      binding.meter.classList.add("dictator-meter-active");
      binding.meter.style.transform = "scaleX(0.1)";
      binding.lockButton.dataset.visible = "true";
      binding.lockButton.dataset.locked = "false";
      binding.lockButton.textContent = "\u{1F513}";
      binding.lockButton.title = "Verrouiller la saisie";
      this.pinBindingForListening(binding);
      const lockState = null;
      const session = {
        provider,
        element: binding.element,
        binding,
        anchorPrefix: anchor.prefix,
        anchorSuffix: anchor.suffix,
        locked: false,
        lockState,
        lastLevelAt: 0,
        lastTranscriptSize: 0,
        inactivityTimerId: null,
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0
        }
      };
      this.activeSession = session;
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
          const dictatedText = [committed, interim].filter(Boolean).join(" ").trim();
          const composedText = `${session.anchorPrefix}${dictatedText}${session.anchorSuffix}`;
          setEditableText(binding.element, composedText, session.anchorPrefix.length + dictatedText.length);
          const nextSize = dictatedText.length;
          const growth = Math.max(0, nextSize - session.lastTranscriptSize);
          session.lastTranscriptSize = nextSize;
          this.bumpInactivityTimer(session);
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
        },
        onError: (message) => {
          binding.button.dataset.state = "error";
          binding.button.textContent = "Erreur";
          binding.button.title = message;
        },
        onStop: () => {
          if (!this.activeSession || this.activeSession.binding !== binding) {
            return;
          }
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
          binding.button.title = `${message} | Fallback natif active`;
          try {
            await fallback.start(startConfig, callbacks);
            return;
          } catch (fallbackError) {
            const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : "Fallback natif indisponible.";
            binding.button.dataset.state = "error";
            binding.button.textContent = "Erreur";
            binding.button.title = `${message} | ${fallbackMessage}`;
            this.setSessionLock(session, false);
            this.clearInactivityTimer(session);
            this.activeSession = null;
            return;
          }
        }
        binding.button.dataset.state = "error";
        binding.button.textContent = "Erreur";
        binding.button.title = message;
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
      binding.meter.classList.remove("dictator-meter-active");
      binding.meter.style.transform = "scaleX(0)";
      this.requestReposition();
    }
    pinBindingForListening(binding) {
      binding.container.classList.add("dictator-floating");
    }
    bumpInactivityTimer(session) {
      this.clearInactivityTimer(session);
      session.inactivityTimerId = window.setTimeout(() => {
        if (!this.activeSession || this.activeSession !== session) {
          return;
        }
        void this.stopActiveSession();
      }, 7e3);
    }
    clearInactivityTimer(session) {
      if (session.inactivityTimerId !== null) {
        window.clearTimeout(session.inactivityTimerId);
        session.inactivityTimerId = null;
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
