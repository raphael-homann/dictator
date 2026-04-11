import type { EditableElement } from "./dom.js";

export interface SelectorResult {
  selector: string;
  fallbackSelector?: string;
}

function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/(["\\#.:\[\]>+~*^$|=()])/g, "\\$1");
}

function attrSelector(tag: string, attr: string, value: string): string {
  return `${tag}[${attr}="${value.replace(/"/g, '\\"')}"]`;
}

function buildPathSelector(element: Element): string {
  const parts: string[] = [];
  let node: Element | null = element;

  while (node && node !== document.body && parts.length < 6) {
    const tag = node.tagName.toLowerCase();
    if (node.id) {
      parts.unshift(`#${cssEscape(node.id)}`);
      break;
    }
    const parentElement: HTMLElement | null = node.parentElement;
    if (!parentElement) {
      parts.unshift(tag);
      break;
    }
    const siblings = Array.from(parentElement.children as HTMLCollectionOf<Element>).filter(
      (child: Element) => child.tagName === node?.tagName
    );
    const index = siblings.indexOf(node) + 1;
    parts.unshift(`${tag}:nth-of-type(${index})`);
    node = parentElement;
  }

  return parts.join(" > ");
}

export function buildSelectorForElement(element: EditableElement): SelectorResult {
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
