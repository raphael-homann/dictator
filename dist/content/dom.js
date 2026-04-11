const INPUT_TYPES = new Set(["", "text", "search", "email", "url", "tel", "password", "number"]);
export function isEditableElement(element) {
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
export function findEditableFromTarget(target) {
    if (!(target instanceof Element)) {
        return null;
    }
    const direct = target.closest("textarea, input, [contenteditable=''], [contenteditable='true']");
    return isEditableElement(direct) ? direct : null;
}
export function getEditableText(element) {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        return element.value;
    }
    return element.textContent ?? "";
}
export function buildDictationAnchor(element) {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        const value = element.value;
        const start = element.selectionStart ?? value.length;
        const end = element.selectionEnd ?? start;
        return {
            prefix: value.slice(0, start),
            suffix: value.slice(end)
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
export function setEditableText(element, value, caretPos) {
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
export function getEditableLabel(element) {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        const fromAttrs = element.getAttribute("aria-label") || element.placeholder || element.name || element.id;
        return fromAttrs || element.tagName.toLowerCase();
    }
    return element.getAttribute("aria-label") || element.tagName.toLowerCase();
}
