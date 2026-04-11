import { MessageType } from "../shared/messages.js";
const statusEl = document.querySelector("#status");
const siteLabelEl = document.querySelector("#siteLabel");
const compatibilityHintEl = document.querySelector("#compatibilityHint");
const addBtn = document.querySelector("#addDictationBtn");
function isSupportedTabUrl(url) {
    return url.startsWith("http://") || url.startsWith("https://");
}
function setStatus(text, isError = false) {
    if (!statusEl) {
        return;
    }
    statusEl.textContent = text;
    statusEl.style.color = isError ? "#842029" : "#0f5132";
}
function setCompatibilityHint(supported) {
    if (!compatibilityHintEl) {
        return;
    }
    compatibilityHintEl.classList.remove("hint-ok", "hint-ko");
    compatibilityHintEl.classList.add(supported ? "hint-ok" : "hint-ko");
    compatibilityHintEl.textContent = supported
        ? "Page compatible: tu peux ajouter une dictee."
        : "Page non compatible: ouvre un site web http(s).";
}
async function refreshSiteLabel() {
    if (!siteLabelEl) {
        return;
    }
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) {
        siteLabelEl.textContent = "Site: inconnu";
        return;
    }
    try {
        const origin = new URL(tab.url).origin;
        siteLabelEl.textContent = `Site: ${origin}`;
        const supported = isSupportedTabUrl(tab.url);
        setCompatibilityHint(supported);
        if (addBtn) {
            addBtn.disabled = !supported;
            addBtn.title = supported ? "" : "Page non supportee (utilise un site web http/https).";
        }
        if (!supported) {
            setStatus("Cette page n'est pas supportee. Ouvre un site web puis reessaie.", true);
        }
        else {
            setStatus("");
        }
    }
    catch {
        siteLabelEl.textContent = "Site: non supporte";
        setCompatibilityHint(false);
        if (addBtn) {
            addBtn.disabled = true;
            addBtn.title = "Page non supportee";
        }
    }
}
async function startPicker() {
    setStatus("Activation du mode selection...");
    const response = (await chrome.runtime.sendMessage({
        type: MessageType.StartPicker
    }));
    if (!response.ok) {
        setStatus(response.error ?? "Impossible d'activer le mode selection.", true);
        return;
    }
    setStatus("Mode selection actif sur l'onglet.");
    window.close();
}
addBtn?.addEventListener("click", () => {
    void startPicker();
});
void refreshSiteLabel();
