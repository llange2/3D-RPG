/**
 * Saves in the browser's storage, packed (57th playtest, point 7). `localStorage` holds about five million characters for the whole game, and a save carries the balance journal (a few
 * hundred kilobytes in a long game) and exists once per slot and once per named save: after a handful of saves the browser refused the next one, and a save whose index entry did not fit
 * was stored but never listed. The text of a save is JSON, which packs to about a quarter: a plain LZW over the bytes with 15-bit codes, one code per character (so no pair of
 * characters is ever split, and no code lands on a control character or a surrogate half). A packed save starts with `lz1:`; older saves are plain JSON (they start with `{`) and are
 * still read. Pure and synchronous: the saves are read in a dozen places that do not wait.
 */

/** What a packed save starts with. */
export const PACKED_PREFIX = "lz1:";
/** 15-bit codes: the dictionary holds 32768 phrases, 256 of them the bytes themselves. When it is full it starts again (encoder and decoder alike). */
const CODES = 32768;
/** A code is stored as the character `BASE + code` (0x8020 at most, below the surrogates at 0xD800). */
const BASE = 0x20;

export function lzCompress(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const codes: number[] = [];
  let dict = new Map<number, number>();
  let next = 256;
  let phrase = -1;
  for (const b of bytes) {
    if (phrase < 0) {
      phrase = b;
      continue;
    }
    const key = phrase * 256 + b;
    const known = dict.get(key);
    if (known !== undefined) {
      phrase = known;
      continue;
    }
    codes.push(phrase);
    if (next < CODES) dict.set(key, next++);
    else {
      dict = new Map();
      next = 256;
    }
    phrase = b;
  }
  if (phrase >= 0) codes.push(phrase);
  let out = "";
  for (let i = 0; i < codes.length; i += 4096) out += String.fromCharCode(...codes.slice(i, i + 4096).map((c) => c + BASE));
  return out;
}

export function lzDecompress(packed: string): string {
  const prefix = new Int32Array(CODES);
  const suffix = new Uint8Array(CODES);
  let next = 256;
  let out = new Uint8Array(Math.max(1024, packed.length * 4));
  let length = 0;
  const put = (b: number): void => {
    if (length === out.length) {
      const bigger = new Uint8Array(out.length * 2);
      bigger.set(out);
      out = bigger;
    }
    out[length++] = b;
  };
  const stack: number[] = [];
  /** Writes the phrase of a code and returns its first byte. */
  const emit = (code: number): number => {
    stack.length = 0;
    let c = code;
    while (c >= 256) {
      stack.push(suffix[c]!);
      c = prefix[c]!;
    }
    stack.push(c);
    for (let i = stack.length - 1; i >= 0; i--) put(stack[i]!);
    return c;
  };
  let previous = -1;
  for (let i = 0; i < packed.length; i++) {
    const code = packed.charCodeAt(i) - BASE;
    if (code < 0 || code >= CODES) throw new Error("damaged save");
    if (previous < 0) {
      if (code >= 256) throw new Error("damaged save");
      put(code);
      previous = code;
      continue;
    }
    let first: number;
    if (next < CODES) {
      if (code < next) first = emit(code);
      else if (code === next) {
        // the phrase being made right now: the one before it plus its own first byte
        stack.length = 0;
        let c = previous;
        while (c >= 256) c = prefix[c]!;
        first = c;
        emit(previous);
        put(first);
      } else throw new Error("damaged save");
      prefix[next] = previous;
      suffix[next] = first;
      next++;
    } else {
      // the encoder started its dictionary again here: the code is a single byte
      if (code >= 256) throw new Error("damaged save");
      first = emit(code);
      next = 256;
    }
    previous = code;
  }
  return new TextDecoder().decode(out.subarray(0, length));
}

/** The text a save is stored as. */
export const packSave = (json: string): string => PACKED_PREFIX + lzCompress(json);

/** The JSON of a stored save, packed or plain. Throws when the text is damaged. */
export const unpackSave = (stored: string): string => (stored.startsWith(PACKED_PREFIX) ? lzDecompress(stored.slice(PACKED_PREFIX.length)) : stored);
