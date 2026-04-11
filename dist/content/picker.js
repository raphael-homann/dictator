import { MessageType } from "../shared/messages.js";
import { findEditableFromTarget, getEditableLabel } from "./dom.js";
import { buildSelectorForElement } from "./selector.js";
const PICKER_OVERLAY_ID = "dictator-picker-overlay";
const PICKER_HIGHLIGHT_ID = "dictator-picker-highlight";
const PICKER_BANNER_ID = "dictator-picker-banner";
export class FieldPicker {
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
}
