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
  return (value as object).constructor?.name ?? "object";
}

const FORMAT_SPEC_RE =
  /^(?:([\s\S])?([<>=^]))?([-+ ])?(z)?(#)?(0)?(\d+)?([_,])?(?:\.(\d+))?([a-zA-Z%])?$/u;

/**
 * Equivalent of Python's format(str, spec) for string presentation types.
 * @param value The string to format.
 * @param spec A Python format specification, e.g. ">20s".
 * @throws {ValueError} If the specification is not valid for strings.
 */
export function formatString(value: string, spec: string): string {
  const m = FORMAT_SPEC_RE.exec(spec);
  if (m === null) {
    throw new ValueError(
      `Invalid format specifier ${pyRepr(spec)} for object of type 'str'`
    );
  }
  const [, fillChar, alignChar, sign, z, alternate, zero, width, grouping] = m;
  const [precision, type] = [m[9], m[10]];
  if (type !== undefined && type !== "s") {
    throw new ValueError(
      `Unknown format code '${type}' for object of type 'str'`
    );
  }
  if (sign !== undefined) {
    throw new ValueError("Sign not allowed in string format specifier");
  }
  if (z !== undefined) {
    throw new ValueError(
      "Negative zero coercion (z) not allowed in string format specifier"
    );
  }
  if (alternate !== undefined) {
    throw new ValueError(
      "Alternate form (#) not allowed in string format specifier"
    );
  }
  if (grouping !== undefined) {
    throw new ValueError(`Cannot specify '${grouping}' with 's'.`);
  }
  if (alignChar === "=") {
    throw new ValueError(
      "'=' alignment not allowed in string format specifier"
    );
  }
  let fill = fillChar ?? " ";
  if (zero !== undefined && fillChar === undefined) {
    fill = "0";
  }
  const align = alignChar ?? "<";

  let chars = [...value];
  if (precision !== undefined) {
    chars = chars.slice(0, parseInt(precision, 10));
  }
  const padding = Math.max(0, (width ? parseInt(width, 10) : 0) - chars.length);
  let left = 0;
  if (align === ">") {
    left = padding;
  } else if (align === "^") {
    left = Math.floor(padding / 2);
  }
  return fill.repeat(left) + chars.join("") + fill.repeat(padding - left);
}
