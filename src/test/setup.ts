import "@testing-library/jest-dom";

// jsdom kennt ResizeObserver nicht; Radix (Slider, Tooltip) ruft ihn beim
// Mounten auf. Ohne diesen Stub laesst sich keine Karte testen, die einen
// Schieberegler enthaelt — und genau das war beim Jana-Voice-Tab noetig.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
