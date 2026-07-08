/**
 * Web vitest setup. Runs before each test file in the jsdom environment.
 *
 * Node 24+ ships a built-in `localStorage` global that's a stub object with
 * no methods until `--localstorage-file=<path>` is passed. Vitest's jsdom
 * environment sees that `globalThis.localStorage` already exists and
 * preserves it instead of installing the real jsdom Storage, so any test
 * that calls `setItem`/`removeItem` throws `is not a function`. We re-install
 * the functional jsdom Storage on globalThis/window before each test.
 *
 * Required for: Node >=24, vitest 2.0.5, jsdom 25.0.0. If those move on,
 * re-test and remove this file. If `globalThis.jsdom` is absent (e.g. a
 * non-jsdom test environment), the file is a no-op.
 */
const jsdomWindow = (
  globalThis as { jsdom?: { window?: Window & typeof globalThis } }
).jsdom?.window;
if (jsdomWindow) {
  const real = jsdomWindow.localStorage;
  if (real && typeof real.setItem === 'function') {
    Object.defineProperty(globalThis, 'localStorage', {
      value: real,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(jsdomWindow, 'localStorage', {
      value: real,
      configurable: true,
      writable: true,
    });
  }
}