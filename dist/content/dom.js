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
function getContentEditableSelectionRange(element) {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        if (element.contains(range.startContainer) && element.contains(range.endContainer)) {
            return range;
        }
    }
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    return range;
}
export function insertEditableText(element, text) {
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
export function getEditableLabel(element) {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        const fromAttrs = element.getAttribute("aria-label") || element.placeholder || element.name || element.id;
        return fromAttrs || element.tagName.toLowerCase();
    }
    return element.getAttribute("aria-label") || element.tagName.toLowerCase();
}
export function lockEditable(element) {
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
export function unlockEditable(element, state) {
    element.classList.remove("dictator-locked-target");
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        element.readOnly = Boolean(state.readOnly);
        return;
    }
    if (state.contentEditableAttr === null) {
        element.removeAttribute("contenteditable");
    }
    else {
        element.setAttribute("contenteditable", state.contentEditableAttr);
    }
    if (state.ariaReadonlyAttr === null) {
        element.removeAttribute("aria-readonly");
    }
    else {
        element.setAttribute("aria-readonly", state.ariaReadonlyAttr);
    }
}
