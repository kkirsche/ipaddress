type ByteOrder = "big" | "little";
type ByteArray = number[];

export function isSafeNumber(n: number | bigint): boolean {
  return Number.MIN_SAFE_INTEGER <= n && n <= Number.MAX_SAFE_INTEGER;
}

export function convertByteToNumber(byte: number | bigint): number {
  if (isSafeNumber(byte)) {
    return Number(byte);
  } else {
    throw new Error(
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
