import { ByteArray, ByteOrder, IPInteger, IPv4LENGTH } from "./constants";

import { AddressTypeError } from "./errors";

/**
 * Check whether a given number or big integer is within the safe integer range.
 * @param {number | bigint} n The number to check if it is within a safe integer range.
 * @returns {boolean} True if `n` is between `Number.MIN_SAFE_INTEGER` and
 * `Number.MAX_SAFE_INTEGER`, `false` otherwise.
 */
export function isSafeNumber(n: number | bigint): boolean {
  return Number.MIN_SAFE_INTEGER <= n && n <= Number.MAX_SAFE_INTEGER;
}

/**
 * Convert a byte, represented as a number or big integer, to a number.
 * Bytes are 8 bits, so the maximum value is within the safe range.
 * @param {number | bigint} byte The byte to convert to a number.
 * @returns {number} The byte value as a number.
 * @throws {TypeError} Thrown when the value is not a safe number.
 */
export function convertByteToNumber(byte: number | bigint): number {
  if (isSafeNumber(byte)) {
    return Number(byte);
  } else {
    throw new TypeError(
      "Bytes are 8 bits. 8 bit unsigned integers have a value range of 0-255"
    );
  }
}

/**
 * Convert an integer to a byte array.
 * Equivalent to https://docs.python.org/3/library/stdtypes.html#int.to_bytes
 * @param {bigint | number} n The integer to convert to bytes. This supports BigInt
 * as IPv6 addresses are above Number.MAX_SAFE_INTEGER.
 * @param {number} length The length of the desired byte array. For IPv4 addresses,
 * this is 4, for IPv6 addresses, this is 16.
 * @param {ByteOrder} [byteorder="big"] The byte order of the array. Big is commonly
 * referred to as network-byte order.
 * @returns {ByteArray} The byte array after conversion
 */
export function intToBytes(
  n: bigint | number,
  length = 1,
  byteorder: ByteOrder = "big"
): ByteArray {
  let order: ByteArray;
  switch (byteorder) {
    case "little":
      order = Array(length)
        .fill(0)
        .map((_, i) => i);
      break;
    case "big":
      order = Array(length)
        .fill(0)
        .map((_, i) => i)
        .reverse();
      break;
    default:
      throw new TypeError(`byteOrder must be either 'little' or 'big'`);
  }
  return (
    order
      // IPv6 addresses may be larger than we can support with number numbers,
      // so we need to use big integers to represent those values
      .map((i) => (BigInt(n) >> BigInt(i * 8)) & BigInt(0xff))
      .map((byte) => convertByteToNumber(byte))
  );
}

/**
 * Convert a byte array to an integer or big integer.
 * Equivalent to https://docs.python.org/3/library/stdtypes.html#int.from_bytes
 * @param {ByteArray} bytes The byte array to convert to an integer or big integer.
 * @param {ByteOrder} byteOrder The byte order of `bytes`.
 * @param {boolean} signed Whether the integer is signed or unsigned.
 * @returns {bigint | number} The integer value as a number or big integer.
 */
export function intFromBytes(
  bytes: ByteArray,
  byteOrder: ByteOrder = "big",
  signed = false
): bigint | number {
  let littleOrdered: ByteArray;
  switch (byteOrder) {
    case "little":
      littleOrdered = bytes;
      break;
    case "big":
      littleOrdered = bytes.reverse();
      break;
    default:
      throw new TypeError("byteOrder must be either 'little' or 'big'");
  }

  let n = littleOrdered
    .map((byte, idx) => BigInt(byte) << BigInt(idx * 8))
    .reduce((sum, current) => sum + current, BigInt(0));
  if (signed && littleOrdered) {
    const littleOrderedLen = littleOrdered.length;
    const lastByte = littleOrdered[littleOrderedLen - 1];
    if (lastByte === undefined) {
      throw new TypeError("No byte at location");
    }
    if (lastByte & 0x80) {
      n = BigInt(1) << BigInt(8 * littleOrderedLen);
    }
  }

  // convert the result back to a number if it's safe to do so.
  if (Number.MIN_SAFE_INTEGER <= n && n <= Number.MAX_SAFE_INTEGER) {
    return Number(n);
  }
  return n;
}

/**
 * Represent an address as 4 packed bytes in network (big-endian) order.
 * @param {number | bigint} address An integer representation of an IPv4 address.
 * @throws {TypeError} when `address` is larger than the maximum IPv4 address
 * or negative.
 * @returns {ByteArray} The packed byte array.
 */
export function v4IntToPacked(address: IPInteger): ByteArray {
  const lowestAddr = 0;
  const highestAddr = 2 ** IPv4LENGTH - 1;

  if (highestAddr < address) {
    throw new TypeError("Address too large for IPv4");
  }
  if (address < lowestAddr) {
    throw new TypeError("Address is negative");
  }

  return intToBytes(address, 4, "big");
}

/**
 * Represent an address as 16 packed bytes in network (big-endian) order.
 * @param {number | bigint} address An integer representation of an IPv6 address.
 * @throws {TypeError} when `address` is larger than the maximum IPv6 address
 * or negative.
 * @returns {ByteArray} The integer address packed as 16 bytes in network (big-endian)
 * order.
 */
export function v6IntToPacked(address: IPInteger): ByteArray {
  const lowestAddr = 0;
  // if we don't use big ints here, this will overflow
  const highestAddr = BigInt(2) ** BigInt(128) - BigInt(1);
  if (highestAddr < address) {
    throw new TypeError("Address too large for IPv6");
  }
  if (address < lowestAddr) {
    throw new TypeError("Address is negative");
  }

  return intToBytes(address, 16, "big");
}

/**
 * Helper to split the netmask and raise AddressTypeError if needed.
 * @param {string} address The address string.
 * @returns {[string, string]} The tuple of the address and mask.
 */
export function _splitOptionalNetmask(address: string): [string, string] {
  const addr = address.split("/");
  if (addr.length !== 2) {
    throw new AddressTypeError(`Only one '/' permitted in ${address}`);
  }
  return [addr[0], addr[1]];
}

// TODO: _find_address_range

export function strIsAscii(c: string): boolean {
  // from byte 0 to byte 127 is ascii, so we validate that we're only in that range.
  for (let idx = 0; idx < c.length; idx++) {
    const codepoint = c.codePointAt(idx);
    if (codepoint === undefined || !(0 <= codepoint && codepoint <= 127)) {
      return false;
    }
  }
  return true;
}

export function strIsDigit(c: string): boolean {
  // digits are ASCII bytes 48 through 57
  // 48 is 0
  // 57 is 9
  for (let idx = 0; idx < c.length; idx++) {
    const codepoint = c.codePointAt(idx);
    if (codepoint === undefined || !(48 <= codepoint && codepoint <= 57)) {
      return false;
    }
  }
  return true;
}

/**
 * Count the number of zero bits on the right hand side.
 * @param number An integer.
 * @param bits maximum number of bits to count.
 * @returns {number} The number of zero bits on the right hand side of the number.
 */
export function _countRighthandZeroBits(
  number: IPInteger,
  bits: number
): number {
  if (number === 0) {
    return bits;
  }
  const bigintNumber = BigInt(number);
  const calculated = (~bigintNumber & (bigintNumber - BigInt(1))).toString(
    2
  ).length;
  return Math.min(bits, calculated);
}
