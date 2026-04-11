import { MessageType } from "../shared/messages.js";
import { DEFAULT_OPENAI_MODELS, DEFAULT_TRANSCRIPTION_MODELS } from "../shared/types.js";
console.info("[Dictator/Config] Copyright (c) e-Frogg - https://www.e-frogg.com");
const providerEl = document.querySelector("#provider");
const openaiModelEl = document.querySelector("#openaiModel");
const transcriptionModelEl = document.querySelector("#transcriptionModel");
const languageEl = document.querySelector("#language");
const openaiApiKeyEl = document.querySelector("#openaiApiKey");
const microphoneEl = document.querySelector("#microphone");
const audioSensitivityEl = document.querySelector("#audioSensitivity");
const audioSensitivityValueEl = document.querySelector("#audioSensitivityValue");
const refreshMicsBtn = document.querySelector("#refreshMicsBtn");
const testMicBtn = document.querySelector("#testMicBtn");
const micTestBarEl = document.querySelector("#micTestBar");
const saveBtn = document.querySelector("#saveBtn");
const saveStatusEl = document.querySelector("#saveStatus");
const selectorsBodyEl = document.querySelector("#selectorsBody");
const usageInfoEl = document.querySelector("#usageInfo");
let currentSettings = null;
let testMicStream = null;
let testMicAudioContext = null;
let testMicAnalyser = null;
let testMicData = null;
let testMicRaf = 0;
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
function renderSensitivityValue(value) {
    if (audioSensitivityValueEl) {
        audioSensitivityValueEl.textContent = `${value.toFixed(1)}x`;
    }
}
function setStatus(text, isError = false) {
    if (!saveStatusEl) {
        return;
    }
    saveStatusEl.textContent = text;
    saveStatusEl.style.color = isError ? "#842029" : "#0f5132";
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
        audioSensitivity: getSensitivityFromForm()
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
        testMicBtn.textContent = "Tester";
    }
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
    const boosted = Math.pow(normalized, 0.55);
    const sensitivity = getSensitivityFromForm();
    const level = Math.max(0, Math.min(1, boosted * sensitivity));
    if (boosted * sensitivity > 1) {
        const reduced = clampSensitivity(sensitivity * 0.96);
        if (audioSensitivityEl) {
            audioSensitivityEl.value = reduced.toFixed(1);
        }
        renderSensitivityValue(reduced);
    }
    const displayLevel = 0.04 + Math.pow(level, 0.65) * 0.96;
    micTestBarEl.style.transform = `scaleX(${displayLevel})`;
    testMicRaf = window.requestAnimationFrame(tickMicTest);
}
async function toggleMicTest() {
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
        testMicAnalyser.fftSize = 512;
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
testMicBtn?.addEventListener("click", () => {
    void toggleMicTest();
});
saveBtn?.addEventListener("click", () => {
    void save();
});
void refresh().catch((error) => {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    setStatus(message, true);
});
window.addEventListener("beforeunload", () => {
    stopMicTest();
});
