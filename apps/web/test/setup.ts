/**
 * Web vitest setup. Runs before each test file in the jsdom environment.
 *
 * 1. Register @testing-library/jest-dom matchers (e.g. toBeInTheDocument)
 *    so component tests can use the full DOM-assertion API.
 * 2. Auto-cleanup @testing-library/react renders between tests. The
 *    built-in auto-cleanup was removed in testing-library v16, so we wire
 *    an `afterEach(cleanup)` ourselves.
 * 3. Node 24+ ships a built-in `localStorage` global that's a stub object
 *    with no methods until `--localstorage-file=<path>` is passed. Vitest's
 *    jsdom environment sees that `globalThis.localStorage` already exists
 *    and preserves it instead of installing the real jsdom Storage, so any
 *    test that calls `setItem`/`removeItem` throws `is not a function`. We
 *    re-install the functional jsdom Storage on globalThis/window before
 *    each test.
 *
 * Required for: Node >=24, vitest 2.0.5, jsdom 25.0.0. If those move on,
 * re-test and remove this file. If `globalThis.jsdom` is absent (e.g. a
 * non-jsdom test environment), the localStorage re-install is a no-op.
 */
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});

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