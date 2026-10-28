import { ByteOrder } from "./interfaces";
import { AddressValueError, ValueError } from "./errors";

/**
 * Convert an integer to a byte array.
 * Equivalent to https://docs.python.org/3/library/stdtypes.html#int.to_bytes
 * @param {bigint | number} n The non-negative integer to convert to bytes.
 * @param {number} length The length of the desired byte array. For IPv4
 * addresses, this is 4, for IPv6 addresses, this is 16.
 * @param {ByteOrder} [byteorder="big"] The byte order of the array. Big is
 * commonly referred to as network-byte order.
 * @returns {Uint8Array} The byte array after conversion
 * @throws {RangeError} If `n` is negative or does not fit in `length` bytes.
 */
export function intToBytes(
  n: bigint | number,
  length = 1,
  byteorder: ByteOrder = "big"
): Uint8Array {
  if (byteorder !== "big" && byteorder !== "little") {
    throw new TypeError("byteorder must be either 'little' or 'big'");
  }
  let value = BigInt(n);
  if (value < 0n) {
    throw new RangeError("can't convert negative int to unsigned");
  }
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    bytes[byteorder === "big" ? length - 1 - i : i] = Number(value & 0xffn);
    value >>= 8n;
  }
  if (value !== 0n) {
    throw new RangeError("int too big to convert");
  }
  return bytes;
}

/**
 * Convert a byte array to an unsigned big integer.
 * Equivalent to https://docs.python.org/3/library/stdtypes.html#int.from_bytes
 * @param {Uint8Array} bytes The byte array to convert to an integer.
 * @param {ByteOrder} byteOrder The byte order of `bytes`.
 * @returns {bigint} The integer value.
 */
export function intFromBytes(
  bytes: Uint8Array,
  byteOrder: ByteOrder = "big"
): bigint {
  if (byteOrder !== "big" && byteOrder !== "little") {
    throw new TypeError("byteorder must be either 'little' or 'big'");
  }
  let n = 0n;
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[byteOrder === "big" ? i : bytes.length - 1 - i];
    n = (n << 8n) | BigInt(byte);
  }
  return n;
}

function toInteger(address: number | bigint, fnName: string): bigint {
  if (typeof address === "bigint") {
    return address;
  }
  if (typeof address === "number" && Number.isInteger(address)) {
    return BigInt(address);
  }
  throw new TypeError(
    `${fnName}() requires an integer, not ${typeName(address)}`
  );
}

/**
 * Represent an address as 4 packed bytes in network (big-endian) order.
 * @param {number | bigint} address An integer representation of an IPv4 address.
 * @returns {Uint8Array} The integer address packed as 4 bytes in network
 * (big-endian) order.
 * @throws {ValueError} If the integer is negative or too large to be an IPv4
 * IP address.
 */
export function v4IntToPacked(address: number | bigint): Uint8Array {
  try {
    return intToBytes(toInteger(address, "v4IntToPacked"), 4, "big");
  } catch (err: unknown) {
    if (err instanceof RangeError) {
      throw new ValueError("Address negative or too large for IPv4");
    }
    throw err;
  }
}

/**
 * Represent an address as 16 packed bytes in network (big-endian) order.
 * @param {number | bigint} address An integer representation of an IPv6 address.
 * @returns {Uint8Array} The integer address packed as 16 bytes in network
 * (big-endian) order.
 * @throws {ValueError} If the integer is negative or too large to be an IPv6
 * IP address.
 */
export function v6IntToPacked(address: number | bigint): Uint8Array {
  try {
    return intToBytes(toInteger(address, "v6IntToPacked"), 16, "big");
  } catch (err: unknown) {
    if (err instanceof RangeError) {
      throw new ValueError("Address negative or too large for IPv6");
    }
    throw err;
  }
}

/**
 * Helper to split the netmask and raise AddressValueError if needed.
 * @param address The address, converted to a string before splitting.
 * @returns {string[]} The address and, if present, the mask.
 */
export function _splitOptionalNetmask(address: unknown): string[] {
  const addr = String(address).split("/");
  if (addr.length > 2) {
    throw new AddressValueError(
      `Only one '/' permitted in ${reprValue(address)}`
    );
  }
  return addr;
}

/**
 * Equivalent of Python's int.bit_length() for non-negative integers.
 */
export function bitLength(n: bigint): number {
  if (n < 0n) {
    n = -n;
  }
  return n === 0n ? 0 : n.toString(2).length;
}

/**
 * Count the number of zero bits on the right hand side.
 * @param number An integer.
 * @param bits maximum number of bits to count.
 * @returns {number} The number of zero bits on the right hand side of the number.
 */
export function _countRighthandZeroBits(number: bigint, bits: number): number {
  if (number === 0n) {
    return bits;
  }
  return Math.min(bits, bitLength(~number & (number - 1n)));
}

/**
 * Equivalent of Python's str.isascii().
 */
export function strIsAscii(c: string): boolean {
  // from byte 0 to byte 127 is ascii, so we validate that we're only in that range.
  return [...c].every((ch) => ch.charCodeAt(0) <= 0x7f);
}

/**
 * Equivalent of Python's str.isdigit() for ASCII strings.
 */
export function strIsDigit(c: string): boolean {
  return /^[0-9]+$/.test(c);
}

/**
 * Equivalent of Python's str.split(sep, maxsplit). Unlike String.split with a
 * limit, the remainder of the string is kept in the final element.
 */
export function pySplit(s: string, sep: string, maxsplit: number): string[] {
  const parts: string[] = [];
  let start = 0;
  while (parts.length < maxsplit) {
    const idx = s.indexOf(sep, start);
    if (idx === -1) {
      break;
    }
    parts.push(s.slice(start, idx));
    start = idx + sep.length;
  }
  parts.push(s.slice(start));
  return parts;
}

/**
 * Reverse a string by code point, like Python's s[::-1].
 */
export function reverseString(s: string): string {
  return [...s].reverse().join("");
}

/**
 * Format a bigint as zero-padded, lowercase hexadecimal.
 */
export function hex(n: bigint, width: number): string {
  return n.toString(16).padStart(width, "0");
}

// Python's str.isprintable() is false for the Unicode "Other" (C*) and
// "Separator" (Z*) categories, with the exception of the ASCII space.
const NON_PRINTABLE = /[\p{C}\p{Z}]/u;

/**
 * Equivalent of Python's repr() for a str.
 */
export function pyRepr(s: string): string {
  const quote = s.includes("'") && !s.includes('"') ? '"' : "'";
  let out = quote;
  for (const ch of s) {
    const cp = ch.codePointAt(0) as number;
    if (ch === quote || ch === "\\") {
      out += `\\${ch}`;
    } else if (ch === "\t") {
      out += "\\t";
    } else if (ch === "\n") {
      out += "\\n";
    } else if (ch === "\r") {
      out += "\\r";
    } else if (ch !== " " && NON_PRINTABLE.test(ch)) {
      if (cp <= 0xff) {
        out += `\\x${cp.toString(16).padStart(2, "0")}`;
      } else if (cp <= 0xffff) {
        out += `\\u${cp.toString(16).padStart(4, "0")}`;
      } else {
        out += `\\U${cp.toString(16).padStart(8, "0")}`;
      }
    } else {
      out += ch;
    }
  }
  return out + quote;
}

/**
 * Equivalent of Python's repr() for a bytes object.
 */
export function bytesRepr(bytes: Uint8Array): string {
  const quote = bytes.includes(0x27) && !bytes.includes(0x22) ? '"' : "'";
  let out = `b${quote}`;
  for (const byte of bytes) {
    const ch = String.fromCharCode(byte);
    if (ch === quote || ch === "\\") {
      out += `\\${ch}`;
    } else if (ch === "\t") {
      out += "\\t";
    } else if (ch === "\n") {
      out += "\\n";
    } else if (ch === "\r") {
      out += "\\r";
    } else if (byte < 0x20 || byte >= 0x7f) {
      out += `\\x${byte.toString(16).padStart(2, "0")}`;
    } else {
      out += ch;
    }
  }
  return out + quote;
}

/**
 * Best-effort equivalent of Python's repr() for values that may be passed to
 * the public API, used to build error messages identical to Python's.
 */
export function reprValue(value: unknown): string {
  if (typeof value === "string") {
    return pyRepr(value);
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value === "number") {
    return Number.isInteger(value) ? BigInt(value).toString() : String(value);
  }
  if (typeof value === "boolean") {
    return value ? "True" : "False";
  }
  if (value === null || value === undefined) {
    return "None";
  }
  if (value instanceof Uint8Array) {
    return bytesRepr(value);
  }
  if (Array.isArray(value)) {
    const items = value.map(reprValue);
    return items.length === 1 ? `(${items[0]},)` : `(${items.join(", ")})`;
  }
  const withRepr = value as { toRepr?: () => string };
  if (typeof withRepr.toRepr === "function") {
    return withRepr.toRepr();
  }
  return String(value);
}

/**
 * The Python type name equivalent to a JavaScript value, for error messages.
 */
export function typeName(value: unknown): string {
  switch (typeof value) {
    case "string":
      return "str";
    case "bigint":
      return "int";
    case "number":
      return Number.isInteger(value) ? "int" : "float";
    case "boolean":
      return "bool";
    case "undefined":
      return "NoneType";
  }
  if (value === null) {
    return "NoneType";
  }
  if (value instanceof Uint8Array) {
    return "bytes";
  }
  if (Array.isArray(value)) {
    return "tuple";
  }
  // A plain object has no more specific Python equivalent than object.
  const proto = Object.getPrototypeOf(value);
  if (proto === Object.prototype || proto === null) {
    return "object";
  }
  return (value as object).constructor?.name ?? "object";
}

const ALIGNMENT_TOKENS = new Set(["<", ">", "=", "^"]);
const SIGN_ELEMENTS = new Set([" ", "+", "-"]);
const DECIMAL_DIGIT = /^\p{Nd}$/u;
// The largest width or precision CPython accepts (PY_SSIZE_T_MAX).
const PY_SSIZE_T_MAX = 2n ** 63n - 1n;

/**
 * The value of a Unicode decimal digit, or -1, like Py_UNICODE_TODECIMAL.
 * Unicode decimal digits are encoded in contiguous runs of 0 to 9.
 */
function decimalValue(ch: string): number {
  if (!DECIMAL_DIGIT.test(ch)) {
    return -1;
  }
  const cp = ch.codePointAt(0) as number;
  let start = cp;
  while (DECIMAL_DIGIT.test(String.fromCodePoint(start - 1))) {
    start--;
  }
  return (cp - start) % 10;
}

/** A character for an error message, like CPython's '%c' / '\\x%x'. */
function formatCode(ch: string): string {
  const cp = ch.codePointAt(0) as number;
  return cp > 32 && cp < 128 ? ch : `\\x${cp.toString(16)}`;
}

interface FormatSpec {
  fill: string;
  align: string;
  sign: string;
  noNeg0: boolean;
  alternate: boolean;
  width: bigint;
  thousandsSeparator: string;
  fracThousandsSeparator: string;
  precision: bigint;
  type: string;
}

/**
 * A port of CPython's parse_internal_render_format_spec, so that invalid
 * specifications raise the same error as in Python.
 */
function parseFormatSpec(
  spec: string,
  defaultType: string,
  defaultAlign: string
): FormatSpec {
  const chars = [...spec];
  const end = chars.length;
  let pos = 0;
  const format: FormatSpec = {
    fill: " ",
    align: defaultAlign,
    sign: "",
    noNeg0: false,
    alternate: false,
    width: -1n,
    thousandsSeparator: "",
    fracThousandsSeparator: "",
    precision: -1n,
    type: defaultType,
  };
  let alignSpecified = false;
  let fillCharSpecified = false;

  const getInteger = (): [bigint, number] => {
    let accumulator = 0n;
    let numdigits = 0;
    for (; pos < end; pos++, numdigits++) {
      const digitval = decimalValue(chars[pos]);
      if (digitval < 0) {
        break;
      }
      if (accumulator > (PY_SSIZE_T_MAX - BigInt(digitval)) / 10n) {
        throw new ValueError("Too many decimal digits in format string");
      }
      accumulator = accumulator * 10n + BigInt(digitval);
    }
    return [accumulator, numdigits];
  };
  const invalidCommaAndUnderscore = () =>
    new ValueError("Cannot specify both ',' and '_'.");

  // If the second char is an alignment token, then parse the fill char
  if (end - pos >= 2 && ALIGNMENT_TOKENS.has(chars[pos + 1])) {
    format.align = chars[pos + 1];
    format.fill = chars[pos];
    fillCharSpecified = true;
    alignSpecified = true;
    pos += 2;
  } else if (end - pos >= 1 && ALIGNMENT_TOKENS.has(chars[pos])) {
    format.align = chars[pos];
    alignSpecified = true;
    pos++;
  }

  // Parse the various sign options
  if (end - pos >= 1 && SIGN_ELEMENTS.has(chars[pos])) {
    format.sign = chars[pos];
    pos++;
  }
  // If the next character is z, request coercion of negative 0.
  if (end - pos >= 1 && chars[pos] === "z") {
    format.noNeg0 = true;
    pos++;
  }
  // If the next character is #, we're in alternate mode.
  if (end - pos >= 1 && chars[pos] === "#") {
    format.alternate = true;
    pos++;
  }
  // The special case for 0-padding (backwards compat)
  if (!fillCharSpecified && end - pos >= 1 && chars[pos] === "0") {
    format.fill = "0";
    if (!alignSpecified && defaultAlign === ">") {
      format.align = "=";
    }
    pos++;
  }

  const [width, widthDigits] = getInteger();
  format.width = widthDigits === 0 ? -1n : width;

  // Comma or underscore signifies add thousands separators
  if (end - pos && chars[pos] === ",") {
    format.thousandsSeparator = ",";
    pos++;
  }
  if (end - pos && chars[pos] === "_") {
    if (format.thousandsSeparator !== "") {
      throw invalidCommaAndUnderscore();
    }
    format.thousandsSeparator = "_";
    pos++;
  }
  if (end - pos && chars[pos] === ",") {
    if (format.thousandsSeparator === "_") {
      throw invalidCommaAndUnderscore();
    }
  }

  // Parse field precision
  if (end - pos && chars[pos] === ".") {
    pos++;
    const [precision, precisionDigits] = getInteger();
    let consumed = precisionDigits;
    format.precision = precision;
    if (end - pos && chars[pos] === ",") {
      if (consumed === 0) {
        format.precision = -1n;
      }
      format.fracThousandsSeparator = ",";
      pos++;
      consumed++;
    }
    if (end - pos && chars[pos] === "_") {
      if (format.fracThousandsSeparator !== "") {
        throw invalidCommaAndUnderscore();
      }
      if (consumed === 0) {
        format.precision = -1n;
      }
      format.fracThousandsSeparator = "_";
      pos++;
      consumed++;
    }
    if (end - pos && chars[pos] === ",") {
      if (format.fracThousandsSeparator === "_") {
        throw invalidCommaAndUnderscore();
      }
    }
    // Not having a precision or underscore/comma after a dot is an error.
    if (consumed === 0) {
      throw new ValueError("Format specifier missing precision");
    }
  }

  // Finally, parse the type field.
  if (end - pos > 1) {
    // More than one char remains, so this is an invalid format specifier.
    throw new ValueError(
      `Invalid format specifier '${spec}' for object of type 'str'`
    );
  }
  if (end - pos === 1) {
    format.type = chars[pos];
    pos++;
  }

  if (format.thousandsSeparator) {
    const allowed =
      "defgEGF%".includes(format.type) ||
      ("boxX".includes(format.type) && format.thousandsSeparator === "_");
    if (!allowed) {
      throw new ValueError(
        `Cannot specify '${format.thousandsSeparator}' with '${formatCode(
          format.type
        )}'.`
      );
    }
  }
  return format;
}

/**
 * Equivalent of Python's format(str, spec), a port of CPython's
 * format_string_internal.
 * @param value The string to format.
 * @param spec A Python format specification, e.g. ">20s".
 * @throws {ValueError} If the specification is not valid for strings.
 */
export function formatString(value: string, spec: string): string {
  // The special case of zero length format spec is equivalent to str(obj).
  if (spec === "") {
    return value;
  }
  const format = parseFormatSpec(spec, "s", "<");
  if (format.type !== "s") {
    throw new ValueError(
      `Unknown format code '${formatCode(
        format.type
      )}' for object of type 'str'`
    );
  }
  // sign is not allowed on strings
  if (format.sign === " ") {
    throw new ValueError("Space not allowed in string format specifier");
  }
  if (format.sign !== "") {
    throw new ValueError("Sign not allowed in string format specifier");
  }
  // negative 0 coercion is not allowed on strings
  if (format.noNeg0) {
    throw new ValueError(
      "Negative zero coercion (z) not allowed in string format specifier"
    );
  }
  // alternate is not allowed on strings
  if (format.alternate) {
    throw new ValueError(
      "Alternate form (#) not allowed in string format specifier"
    );
  }
  // '=' alignment not allowed on strings
  if (format.align === "=") {
    throw new ValueError(
      "'=' alignment not allowed in string format specifier"
    );
  }

  let chars = [...value];
  // if precision is specified, output no more than precision characters
  if (format.precision >= 0n && BigInt(chars.length) >= format.precision) {
    chars = chars.slice(0, Number(format.precision));
  }
  const total = Math.max(chars.length, Number(format.width));
  let left = 0;
  if (format.align === ">") {
    left = total - chars.length;
  } else if (format.align === "^") {
    left = Math.floor((total - chars.length) / 2);
  }
  const right = total - chars.length - left;
  return format.fill.repeat(left) + chars.join("") + format.fill.repeat(right);
}
