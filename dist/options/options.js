import { MessageType } from "../shared/messages.js";
import { DEFAULT_OPENAI_MODELS, DEFAULT_TRANSCRIPTION_MODELS } from "../shared/types.js";
import { buildDictationAnchor, setEditableText } from "../content/dom.js";
import { NativeDictationProvider } from "../content/providers/native-provider.js";
import { OpenAIRealtimeProvider } from "../content/providers/openai-provider.js";
console.info("[Dictator/Config] Copyright (c) e-Frogg - https://www.e-frogg.com");
const providerEl = document.querySelector("#provider");
const openaiModelEl = document.querySelector("#openaiModel");
const transcriptionModelEl = document.querySelector("#transcriptionModel");
const languageEl = document.querySelector("#language");
const openaiApiKeyEl = document.querySelector("#openaiApiKey");
const microphoneEl = document.querySelector("#microphone");
const audioSensitivityEl = document.querySelector("#audioSensitivity");
const audioSensitivityValueEl = document.querySelector("#audioSensitivityValue");
const inactivityTimeoutEl = document.querySelector("#inactivityTimeout");
const inactivityTimeoutValueEl = document.querySelector("#inactivityTimeoutValue");
const lockInputDuringDictationEl = document.querySelector("#lockInputDuringDictation");
const refreshMicsBtn = document.querySelector("#refreshMicsBtn");
const testMicBtn = document.querySelector("#testMicBtn");
const testDictationBtn = document.querySelector("#testDictationBtn");
const dictationTestFieldEl = document.querySelector("#dictationTestField");
const micTestBarEl = document.querySelector("#micTestBar");
const saveBtn = document.querySelector("#saveBtn");
const saveStatusEl = document.querySelector("#saveStatus");
const selectorsBodyEl = document.querySelector("#selectorsBody");
const usageInfoEl = document.querySelector("#usageInfo");
const debugProviderRequestedEl = document.querySelector("#debugProviderRequested");
const debugProviderActiveEl = document.querySelector("#debugProviderActive");
const debugModelActiveEl = document.querySelector("#debugModelActive");
const debugDurationEl = document.querySelector("#debugDuration");
const debugStartLatencyEl = document.querySelector("#debugStartLatency");
const debugFirstTranscriptLatencyEl = document.querySelector("#debugFirstTranscriptLatency");
const debugWordsEl = document.querySelector("#debugWords");
const debugTokensEl = document.querySelector("#debugTokens");
const debugLogEl = document.querySelector("#debugLog");
const debugLevelEl = document.querySelector("#debugLevel");
const MAX_DEBUG_LOG_LINES = 140;
let currentSettings = null;
let testMicStream = null;
let testMicAudioContext = null;
let testMicAnalyser = null;
let testMicData = null;
let testMicRaf = 0;
let testDictationProvider = null;
let testDictationField = null;
let testDictationAnchorPrefix = "";
let testDictationAnchorSuffix = "";
let testDictationStartedAt = 0;
let debugTickerId = 0;
let debugLogLines = ["[debug] Pret pour un test..."];
let debugLevel = "off";
let autoSaveTimerId = 0;
let debugState = {
    requestedProvider: "-",
    activeProvider: "-",
    activeModel: "-",
    running: false,
    startedAt: 0,
    startLatencyMs: 0,
    firstTranscriptLatencyMs: 0,
    words: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    transcriptUpdates: 0
};
function clampSensitivity(value) {
    if (!Number.isFinite(value)) {
        return 1.8;
    }
    return Math.max(0.4, Math.min(4, value));
}
function getSensitivityFromForm() {
    const raw = Number(audioSensitivityEl?.value ?? "1.8");
    return clampSensitivity(raw);
}
function clampInactivityTimeoutMs(value) {
    if (!Number.isFinite(value)) {
        return 15000;
    }
    return Math.max(5000, Math.min(60000, Math.round(value)));
}
function getInactivityTimeoutFromForm() {
    const seconds = Number(inactivityTimeoutEl?.value ?? "15");
    return clampInactivityTimeoutMs(seconds * 1000);
}
function renderSensitivityValue(value) {
    if (audioSensitivityValueEl) {
        audioSensitivityValueEl.textContent = `${value.toFixed(1)}x`;
    }
}
function renderInactivityTimeoutValue(valueMs) {
    if (inactivityTimeoutValueEl) {
        inactivityTimeoutValueEl.textContent = `${Math.round(valueMs / 1000)} s`;
    }
}
function setStatus(text, isError = false) {
    if (!saveStatusEl) {
        return;
    }
    saveStatusEl.textContent = text;
    saveStatusEl.style.color = isError ? "#842029" : "#0f5132";
}
function formatMs(value) {
    if (!value || value < 1) {
        return "-";
    }
    return `${Math.round(value)} ms`;
}
function formatDurationSeconds(valueMs) {
    return `${(valueMs / 1000).toFixed(1)}s`;
}
function countWords(text) {
    const normalized = text.trim();
    if (!normalized) {
        return 0;
    }
    return normalized.split(/\s+/).length;
}
function isTransientNetworkError(message) {
    const normalized = message.toLowerCase();
    return normalized.includes("network") || normalized.includes("reseau") || normalized.includes("timeout");
}
function renderDebugPanel() {
    if (debugProviderRequestedEl) {
        debugProviderRequestedEl.textContent = debugState.requestedProvider;
    }
    if (debugProviderActiveEl) {
        debugProviderActiveEl.textContent = debugState.activeProvider;
    }
    if (debugModelActiveEl) {
        debugModelActiveEl.textContent = debugState.activeModel;
    }
    if (debugDurationEl) {
        const elapsed = debugState.running && debugState.startedAt ? Date.now() - debugState.startedAt : 0;
        debugDurationEl.textContent = formatDurationSeconds(Math.max(0, elapsed));
    }
    if (debugStartLatencyEl) {
        debugStartLatencyEl.textContent = formatMs(debugState.startLatencyMs);
    }
    if (debugFirstTranscriptLatencyEl) {
        debugFirstTranscriptLatencyEl.textContent = formatMs(debugState.firstTranscriptLatencyMs);
    }
    if (debugWordsEl) {
        debugWordsEl.textContent = String(debugState.words);
    }
    if (debugTokensEl) {
        debugTokensEl.textContent = `${debugState.inputTokens} / ${debugState.outputTokens} / ${debugState.totalTokens}`;
    }
    if (debugLogEl) {
        if (debugLevel === "off") {
            debugLogEl.textContent = "[debug] Logs desactives (choisir Basique ou Avance).";
            return;
        }
        debugLogEl.textContent = debugLogLines.join("\n");
        debugLogEl.scrollTop = debugLogEl.scrollHeight;
    }
}
function appendDebugLog(message) {
    if (debugLevel === "off") {
        return;
    }
    const timestamp = new Date().toLocaleTimeString();
    debugLogLines.push(`[${timestamp}] ${message}`);
    if (debugLogLines.length > MAX_DEBUG_LOG_LINES) {
        debugLogLines = debugLogLines.slice(debugLogLines.length - MAX_DEBUG_LOG_LINES);
    }
    renderDebugPanel();
}
function appendVerboseDebugLog(message) {
    if (debugLevel !== "verbose") {
        return;
    }
    appendDebugLog(message);
}
function stopDebugTicker() {
    if (!debugTickerId) {
        return;
    }
    window.clearInterval(debugTickerId);
    debugTickerId = 0;
}
function startDebugTicker() {
    stopDebugTicker();
    debugTickerId = window.setInterval(() => {
        renderDebugPanel();
    }, 250);
}
function beginDebugSession(requestedProvider) {
    const model = requestedProvider === "openai" ? openaiModelEl?.value || DEFAULT_OPENAI_MODELS[0] : "native/webspeech";
    debugState = {
        requestedProvider,
        activeProvider: requestedProvider,
        activeModel: model,
        running: true,
        startedAt: Date.now(),
        startLatencyMs: 0,
        firstTranscriptLatencyMs: 0,
        words: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        transcriptUpdates: 0
    };
    debugLogLines = ["[debug] Nouvelle session de test."];
    startDebugTicker();
    renderDebugPanel();
}
function getDictationSettingsFromForm() {
    return {
        provider: (providerEl?.value ?? currentSettings?.provider ?? "native"),
        apiKey: openaiApiKeyEl?.value.trim() ?? "",
        model: openaiModelEl?.value || DEFAULT_OPENAI_MODELS[0],
        transcriptionModel: transcriptionModelEl?.value || DEFAULT_TRANSCRIPTION_MODELS[0],
        language: languageEl?.value.trim() || "fr",
        microphoneDeviceId: microphoneEl?.value ?? "",
        audioSensitivity: getSensitivityFromForm()
    };
}
function createDictationProvider(provider) {
    return provider === "openai" ? new OpenAIRealtimeProvider() : new NativeDictationProvider();
}
function fillSelect(select, values) {
    if (!select) {
        return;
    }
    select.innerHTML = "";
    for (const value of values) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        select.append(option);
    }
}
async function getSettings() {
    const response = (await chrome.runtime.sendMessage({ type: MessageType.GetSettings }));
    if (!response.ok || !response.settings) {
        throw new Error(response.error ?? "Impossible de charger la configuration");
    }
    return response.settings;
}
function renderSelectors(settings) {
    if (!selectorsBodyEl) {
        return;
    }
    selectorsBodyEl.innerHTML = "";
    const rows = Object.values(settings.sites).flatMap((site) => {
        return site.selectors.map((entry) => ({ origin: site.origin, entry }));
    });
    if (rows.length === 0) {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td colspan="3">Aucun selecteur enregistre.</td>`;
        selectorsBodyEl.append(tr);
        return;
    }
    for (const row of rows) {
        const tr = document.createElement("tr");
        const siteTd = document.createElement("td");
        siteTd.textContent = row.origin;
        const selectorTd = document.createElement("td");
        selectorTd.textContent = row.entry.selector;
        const actionTd = document.createElement("td");
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.textContent = "Supprimer";
        removeBtn.addEventListener("click", async () => {
            const response = (await chrome.runtime.sendMessage({
                type: MessageType.RemoveSelector,
                payload: { origin: row.origin, selectorId: row.entry.id }
            }));
            if (!response.ok) {
                setStatus(response.error ?? "Suppression impossible", true);
                return;
            }
            setStatus("Selecteur supprime.");
            await refresh();
        });
        actionTd.append(removeBtn);
        tr.append(siteTd, selectorTd, actionTd);
        selectorsBodyEl.append(tr);
    }
}
function renderUsage(settings) {
    if (!usageInfoEl) {
        return;
    }
    if (!settings.usage.updatedAt) {
        usageInfoEl.textContent = "Aucune mesure d'usage pour le moment.";
        return;
    }
    const when = new Date(settings.usage.updatedAt).toLocaleString();
    usageInfoEl.textContent = `Derniere session: ${settings.usage.totalTokens} tokens (in: ${settings.usage.inputTokens}, out: ${settings.usage.outputTokens}) le ${when}.`;
}
async function populateMicrophones(selectedId) {
    if (!microphoneEl) {
        return;
    }
    try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
    }
    catch {
        setStatus("Permission micro non accordee. Liste partielle.", true);
    }
    const devices = await navigator.mediaDevices.enumerateDevices();
    const microphones = devices.filter((item) => item.kind === "audioinput");
    microphoneEl.innerHTML = "";
    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = "Micro par defaut navigateur";
    microphoneEl.append(defaultOption);
    for (const mic of microphones) {
        const option = document.createElement("option");
        option.value = mic.deviceId;
        option.textContent = mic.label || `Micro ${mic.deviceId.slice(0, 6)}`;
        microphoneEl.append(option);
    }
    microphoneEl.value = selectedId;
}
function renderForm(settings) {
    fillSelect(openaiModelEl, DEFAULT_OPENAI_MODELS);
    fillSelect(transcriptionModelEl, DEFAULT_TRANSCRIPTION_MODELS);
    if (providerEl) {
        providerEl.value = settings.provider;
    }
    if (openaiModelEl) {
        openaiModelEl.value = settings.openaiModel;
    }
    if (transcriptionModelEl) {
        transcriptionModelEl.value = settings.transcriptionModel;
    }
    if (languageEl) {
        languageEl.value = settings.language;
    }
    if (openaiApiKeyEl) {
        openaiApiKeyEl.value = settings.openaiApiKey;
    }
    if (audioSensitivityEl) {
        audioSensitivityEl.value = String(clampSensitivity(settings.audioSensitivity));
    }
    renderSensitivityValue(clampSensitivity(settings.audioSensitivity));
    const inactivityTimeout = clampInactivityTimeoutMs(settings.inactivityTimeoutMs);
    if (inactivityTimeoutEl) {
        inactivityTimeoutEl.value = String(Math.round(inactivityTimeout / 1000));
    }
    renderInactivityTimeoutValue(inactivityTimeout);
    if (lockInputDuringDictationEl) {
        lockInputDuringDictationEl.checked = settings.lockInputDuringDictation;
    }
    void populateMicrophones(settings.microphoneDeviceId);
    renderSelectors(settings);
    renderUsage(settings);
}
async function save() {
    if (!currentSettings) {
        return;
    }
    const payload = {
        provider: (providerEl?.value ?? currentSettings.provider),
        openaiModel: openaiModelEl?.value ?? currentSettings.openaiModel,
        transcriptionModel: transcriptionModelEl?.value ?? currentSettings.transcriptionModel,
        language: languageEl?.value.trim() || "fr",
        openaiApiKey: openaiApiKeyEl?.value.trim() ?? "",
        microphoneDeviceId: microphoneEl?.value ?? "",
        audioSensitivity: getSensitivityFromForm(),
        inactivityTimeoutMs: getInactivityTimeoutFromForm(),
        lockInputDuringDictation: lockInputDuringDictationEl?.checked ?? true
    };
    const response = (await chrome.runtime.sendMessage({
        type: MessageType.UpdateSettings,
        payload
    }));
    if (!response.ok) {
        setStatus(response.error ?? "Echec de sauvegarde", true);
        return;
    }
    setStatus("Configuration enregistree.");
    await refresh();
}
function scheduleAutoSave(reason) {
    if (autoSaveTimerId) {
        window.clearTimeout(autoSaveTimerId);
    }
    setStatus(`Sauvegarde auto (${reason})...`);
    autoSaveTimerId = window.setTimeout(() => {
        autoSaveTimerId = 0;
        void save();
    }, 220);
}
function stopMicTest() {
    if (testMicRaf) {
        window.cancelAnimationFrame(testMicRaf);
        testMicRaf = 0;
    }
    if (testMicAnalyser) {
        testMicAnalyser.disconnect();
        testMicAnalyser = null;
    }
    if (testMicAudioContext) {
        void testMicAudioContext.close();
        testMicAudioContext = null;
    }
    if (testMicStream) {
        for (const track of testMicStream.getTracks()) {
            track.stop();
        }
        testMicStream = null;
    }
    testMicData = null;
    if (micTestBarEl) {
        micTestBarEl.style.transform = "scaleX(0.02)";
    }
    if (testMicBtn) {
        testMicBtn.textContent = "Tester micro";
    }
}
async function stopDictationTest() {
    const provider = testDictationProvider;
    testDictationProvider = null;
    testDictationField = null;
    testDictationAnchorPrefix = "";
    testDictationAnchorSuffix = "";
    testDictationStartedAt = 0;
    debugState.running = false;
    stopDebugTicker();
    if (testDictationBtn) {
        testDictationBtn.textContent = "Tester dictee";
    }
    if (micTestBarEl) {
        micTestBarEl.style.transform = "scaleX(0.02)";
    }
    if (provider) {
        try {
            await provider.stop();
        }
        catch {
            // ignore stop errors during teardown
        }
    }
    renderDebugPanel();
}
function tickMicTest() {
    if (!testMicAnalyser || !testMicData || !micTestBarEl) {
        return;
    }
    testMicAnalyser.getByteFrequencyData(testMicData);
    let total = 0;
    for (const sample of testMicData) {
        total += sample;
    }
    const average = total / testMicData.length;
    const normalized = Math.max(0, Math.min(1, average / 255));
    const boosted = Math.pow(normalized, 0.42);
    const sensitivity = getSensitivityFromForm();
    const level = Math.max(0, Math.min(1, boosted * sensitivity));
    if (boosted * sensitivity > 1) {
        const reduced = clampSensitivity(sensitivity * 0.96);
        if (audioSensitivityEl) {
            audioSensitivityEl.value = reduced.toFixed(1);
        }
        renderSensitivityValue(reduced);
    }
    const displayLevel = 0.015 + Math.pow(level, 0.5) * 0.985;
    micTestBarEl.style.transform = `scaleX(${displayLevel})`;
    testMicRaf = window.requestAnimationFrame(tickMicTest);
}
async function toggleMicTest() {
    if (testDictationProvider) {
        setStatus("Stoppe d'abord le test de dictee.", true);
        return;
    }
    if (testMicStream) {
        stopMicTest();
        return;
    }
    try {
        testMicStream = await navigator.mediaDevices.getUserMedia({
            audio: microphoneEl?.value
                ? {
                    deviceId: { exact: microphoneEl.value }
                }
                : true
        });
        testMicAudioContext = new AudioContext();
        testMicAnalyser = testMicAudioContext.createAnalyser();
        testMicAnalyser.fftSize = 256;
        testMicAnalyser.smoothingTimeConstant = 0.35;
        testMicData = new Uint8Array(new ArrayBuffer(testMicAnalyser.frequencyBinCount));
        const source = testMicAudioContext.createMediaStreamSource(testMicStream);
        source.connect(testMicAnalyser);
        if (testMicBtn) {
            testMicBtn.textContent = "Stop test";
        }
        tickMicTest();
    }
    catch {
        stopMicTest();
        setStatus("Impossible de tester le micro (permission ou peripherique).", true);
    }
}
async function toggleDictationTest() {
    if (!dictationTestFieldEl) {
        setStatus("Champ de test de dictee introuvable.", true);
        return;
    }
    if (testDictationProvider) {
        appendDebugLog("Arret manuel demande depuis le panneau de configuration.");
        await stopDictationTest();
        return;
    }
    stopMicTest();
    const settings = getDictationSettingsFromForm();
    beginDebugSession(settings.provider);
    appendDebugLog(`Demarrage test dictee (provider demande: ${settings.provider}).`);
    appendDebugLog(`Modele attendu: ${settings.provider === "openai" ? settings.model : "native/webspeech"}.`);
    appendDebugLog(`Config active: langue=${settings.language}, micro=${settings.microphoneDeviceId ? "personnalise" : "defaut"}, sensibilite=${settings.audioSensitivity.toFixed(1)}x.`);
    const anchor = buildDictationAnchor(dictationTestFieldEl);
    testDictationAnchorPrefix = anchor.prefix;
    testDictationAnchorSuffix = anchor.suffix;
    testDictationField = dictationTestFieldEl;
    let provider = createDictationProvider(settings.provider);
    testDictationProvider = provider;
    testDictationStartedAt = Date.now();
    if (testDictationBtn) {
        testDictationBtn.textContent = "Stop test dictee";
    }
    setStatus("Dictee de test en cours...");
    const startConfig = {
        apiKey: settings.apiKey,
        model: settings.model,
        transcriptionModel: settings.transcriptionModel,
        language: settings.language,
        microphoneDeviceId: settings.microphoneDeviceId,
        audioSensitivity: settings.audioSensitivity,
        target: dictationTestFieldEl
    };
    const callbacks = {
        onTranscript: (committed, interim) => {
            const activeField = testDictationField;
            if (!activeField) {
                return;
            }
            const dictatedText = [committed, interim].filter(Boolean).join(" ").trim();
            const composedText = `${testDictationAnchorPrefix}${dictatedText}${testDictationAnchorSuffix}`;
            setEditableText(activeField, composedText, testDictationAnchorPrefix.length + dictatedText.length);
            debugState.words = countWords(dictatedText);
            debugState.transcriptUpdates += 1;
            if (!debugState.firstTranscriptLatencyMs && dictatedText.length > 0 && testDictationStartedAt) {
                debugState.firstTranscriptLatencyMs = Date.now() - testDictationStartedAt;
                appendDebugLog(`Premier texte recu apres ${formatMs(debugState.firstTranscriptLatencyMs)}.`);
            }
            if (debugState.transcriptUpdates % 6 === 0 || interim.length === 0) {
                appendDebugLog(`Transcription #${debugState.transcriptUpdates}: ${debugState.words} mot(s), ${dictatedText.length} caractere(s).`);
            }
        },
        onLevel: (level) => {
            if (!micTestBarEl) {
                return;
            }
            const displayLevel = 0.015 + Math.pow(Math.max(0, Math.min(1, level)), 0.5) * 0.985;
            micTestBarEl.style.transform = `scaleX(${displayLevel})`;
        },
        onUsage: (usage) => {
            debugState.inputTokens += usage.inputTokens;
            debugState.outputTokens += usage.outputTokens;
            debugState.totalTokens += usage.totalTokens;
            appendDebugLog(`Usage OpenAI +${usage.totalTokens} tokens (in ${usage.inputTokens} / out ${usage.outputTokens}) -> total ${debugState.totalTokens}.`);
        },
        onDebug: (message) => {
            appendVerboseDebugLog(message);
        },
        onWarning: (message) => {
            appendDebugLog(`Avertissement provider: ${message}`);
            setStatus(message);
        },
        onError: (message) => {
            if (isTransientNetworkError(message)) {
                appendDebugLog(`Erreur reseau transitoire (non bloquante): ${message}`);
                setStatus(`Reseau instable: ${message}`);
                return;
            }
            appendDebugLog(`Erreur provider: ${message}`);
            setStatus(`Test dictee en erreur: ${message}`, true);
            void stopDictationTest();
        },
        onStop: () => {
            const elapsed = debugState.startedAt ? Date.now() - debugState.startedAt : 0;
            appendDebugLog(`Session stoppee. Duree ${formatDurationSeconds(elapsed)}, ${debugState.words} mot(s), ${debugState.totalTokens} token(s).`);
            void stopDictationTest();
        }
    };
    try {
        await provider.start(startConfig, callbacks);
        debugState.activeModel = "native/webspeech";
        debugState.startLatencyMs = Date.now() - testDictationStartedAt;
        appendDebugLog(`Modele actif: ${debugState.activeModel}.`);
        appendDebugLog(`Provider ${debugState.activeProvider} demarre en ${formatMs(debugState.startLatencyMs)}.`);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Erreur de demarrage de la dictee de test.";
        appendDebugLog(`Echec demarrage ${settings.provider}: ${message}`);
        if (settings.provider === "openai") {
            const fallback = new NativeDictationProvider();
            provider = fallback;
            testDictationProvider = fallback;
            debugState.activeProvider = "native";
            debugState.activeModel = "native/webspeech";
            setStatus(`${message} | Fallback natif active.`);
            appendDebugLog("Fallback vers le provider natif.");
            try {
                await fallback.start(startConfig, callbacks);
                debugState.startLatencyMs = Date.now() - testDictationStartedAt;
                appendDebugLog(`Provider native demarre en ${formatMs(debugState.startLatencyMs)}.`);
                return;
            }
            catch (fallbackError) {
                const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : "Fallback natif indisponible.";
                appendDebugLog(`Echec fallback natif: ${fallbackMessage}`);
                setStatus(`Test dictee en erreur: ${message} | ${fallbackMessage}`, true);
                await stopDictationTest();
                return;
            }
        }
        debugState.activeModel = "native/webspeech";
        setStatus(`Test dictee en erreur: ${message}`, true);
        await stopDictationTest();
    }
}
async function refresh() {
    currentSettings = await getSettings();
    renderForm(currentSettings);
}
refreshMicsBtn?.addEventListener("click", () => {
    void populateMicrophones(microphoneEl?.value ?? "");
});
audioSensitivityEl?.addEventListener("input", () => {
    renderSensitivityValue(getSensitivityFromForm());
});
inactivityTimeoutEl?.addEventListener("input", () => {
    renderInactivityTimeoutValue(getInactivityTimeoutFromForm());
});
providerEl?.addEventListener("change", () => {
    scheduleAutoSave("provider");
});
openaiModelEl?.addEventListener("change", () => {
    scheduleAutoSave("modele OpenAI");
});
transcriptionModelEl?.addEventListener("change", () => {
    scheduleAutoSave("modele transcription");
});
openaiApiKeyEl?.addEventListener("change", () => {
    scheduleAutoSave("cle OpenAI");
});
testMicBtn?.addEventListener("click", () => {
    void toggleMicTest();
});
testDictationBtn?.addEventListener("click", () => {
    void toggleDictationTest();
});
saveBtn?.addEventListener("click", () => {
    void save();
});
debugLevelEl?.addEventListener("change", () => {
    const value = debugLevelEl.value;
    if (value === "basic" || value === "verbose" || value === "off") {
        debugLevel = value;
    }
    else {
        debugLevel = "off";
    }
    renderDebugPanel();
});
if (debugLevelEl && (debugLevelEl.value === "off" || debugLevelEl.value === "basic" || debugLevelEl.value === "verbose")) {
    debugLevel = debugLevelEl.value;
}
renderDebugPanel();
void refresh().catch((error) => {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    setStatus(message, true);
});
window.addEventListener("beforeunload", () => {
    stopMicTest();
    void stopDictationTest();
});
