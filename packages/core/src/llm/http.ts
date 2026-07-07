/** Try to parse `s` as JSON; returns null on any error. Used when reading
 *  LLM provider error bodies, which are JSON in practice but may include
 *  empty strings or non-JSON trailers. */
export function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
