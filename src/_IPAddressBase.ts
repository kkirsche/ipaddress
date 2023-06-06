// https://github.com/python/cpython/blob/eb0ce92141cd14196a8922cfe9df4a713c5c1d9b/Lib/ipaddress.py#L383

import { AddressTypeError, NetmaskTypeError } from "./errors";
import { ByteArray, IPInteger, IPVersion, Prefixlen } from "./constants";
import {
  Explodable,
  PrefixToIPStringable,
  PrefixToPrefixStringable,
  ReversePointerable,
  Stringable,
  Versionable,
} from "./interfaces";
import {
  _countRighthandZeroBits,
  _splitOptionalNetmask,
  intToBytes,
  isSafeNumber,
  strIsAscii,
  strIsDigit,
} from "./utilities";
import { isBigInt, isByteArray, isNumber, isString } from "./typeGuards";
/**
 * The mother class
 */
export interface _IPAddressBaseT {
  new (): _IPAddressBaseTInstance;
  // class methods
  _ipIntFromPrefix: (prefixlen: Prefixlen) => IPInteger;
  _prefixFromIpInt: (ipInt: IPInteger) => Prefixlen;
  _reportInvalidNetmask: (netmaskStr: string) => never;
  _prefixFromPrefixString: (prefixlenStr: string) => Prefixlen;
  _prefixFromIpString: (ipStr: string) => Prefixlen;
  _splitAddrPrefix: (
    address: string | IPInteger | ByteArray
  ) => [string | IPInteger | ByteArray, number];
}

export interface _IPAddressBaseTInstance {
  // @property
  exploded: string;
  compressed: string;
  reversePointer: string;
  version: IPVersion;
  // instance
  _checkIntAddress: (address: IPInteger) => void; // throws if invalid
  _checkPackedAddress: (address: ByteArray, expectedLen: number) => void;
}

export const _IPAddressBaseStruct = {
  // @property
  exploded: _baseExploded,
  compressed: _baseCompressed,
  reversePointer: _baseReversePointer,
  // instance
  _checkIntAddress: _baseCheckIntAddress, // throws if invalid
  _checkPackedAddress: _baseCheckPackedAddress,
  // class methods
  _ipIntFromPrefix: _baseIpIntFromPrefix,
  _prefixFromIpInt: _basePrefixFromIpInt,
  _reportInvalidNetmask: _baseReportInvalidNetmask,
  _prefixFromPrefixString: _basePrefixFromPrefixString,
  _prefixFromIpString: _basePrefixFromIpString,
  _splitAddrPrefix: _baseSplitAddrPrefix,
};

/**
 * Return the longhand version of the IP address as a string.
 */
export function _baseExploded(obj: Explodable): string {
  return obj._explodeShorthandIpString();
}

/**
 * Return the shorthand version of the IP address as a string.
 */
export function _baseCompressed(obj: Stringable): string {
  return obj.toString();
}

/**
 * The name of the reverse DNS pointer for the IP address, e.g.:
 * >>> console.log(ip_address("127.0.0.1").reversePointer)
 * "1.0.0.127.in-addr.arpa"
 * >>> console.log(ip_address("2001:db8::1").reverse_pointer)
 * "1.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.8.b.d.0.1.0.0.2.ip6.arpa"
 */
export function _baseReversePointer(obj: ReversePointerable): string {
  return obj._reversePointer();
}

/**
 * Check whether a numeric IP address is within the IPv4 range.
 * @param obj The object performing the checking.
 * @param address The numeric address being checked.
 * @throws {AddressTypeError} If the address is below 0 or greater than the maximum
 * value for an IPv4 address.
 */
export function _baseCheckIntAddress(
  obj: Versionable,
  address: IPInteger
): void {
  if (address < 0) {
    const msg = `${address} (< 0) is not permitted as an IPv${obj.version} address`;
    throw new AddressTypeError(msg);
  }
  if (address > obj._ALL_ONES) {
    const msg = `${address} (> 2**${obj.maxPrefixlen}) is not permitted as an IPv${obj.version} address`;
    throw new AddressTypeError(msg);
  }
}

/**
 * Check whether a byte array is of the same length as expected.
 * @param obj The object performing the checking.
 * @param expected_len The expected length of the byte array.
 * @throws {AddressTypeError} If address is not equal to the expected length.
 */
export function _baseCheckPackedAddress(
  obj: Versionable,
  address: ByteArray,
  expectedLen: number
): void {
  const addressLen = address.length;
  if (addressLen !== expectedLen) {
    const msg = `'${address}' (len ${addressLen} != ${expectedLen}) is not permitted as an IPv${obj.version} address.`;
    throw new AddressTypeError(msg);
  }
}

/**
 * Turn the prefix length into a bitwise netmask.
 * @param prefixlen An integer, the prefix length.
 * @returns {IPInteger} An integer
 */
export function _baseIpIntFromPrefix(
  obj: Versionable,
  prefixlen: number
): IPInteger {
  const result =
    BigInt(obj._ALL_ONES) ^ (BigInt(obj._ALL_ONES) >> BigInt(prefixlen));
  if (isSafeNumber(result)) {
    return Number(result);
  }
  return result;
}

/**
 * Returns prefix length from the bitwise netmask.
 * @param ipInt An integer, the netmask in expanded bitwise form.
 * @returns {number} An integer, the prefix length.
 * @throws {TypeError} If the input intermingles zeroes and ones.
 */
export function _basePrefixFromIpInt(
  obj: Versionable,
  ipInt: IPInteger
): number {
  const trailingZeroes = _countRighthandZeroBits(ipInt, obj.maxPrefixlen);
  const prefixlen = obj.maxPrefixlen - trailingZeroes;
  const leadingOnes = BigInt(ipInt) >> BigInt(trailingZeroes);
  const allOnes = (BigInt(1) << BigInt(prefixlen)) - BigInt(1);
  if (leadingOnes !== allOnes) {
    const byteslen = Math.floor(obj.maxPrefixlen / 8);
    const details = intToBytes(ipInt, byteslen, "big");
    const msg = `Netmask pattern '${details.toString()}' mixes zeroes & ones`;
    throw new TypeError(msg);
  }
  return prefixlen;
}

export function _baseReportInvalidNetmask(netmaskStr: string): never {
  const msg = `${netmaskStr} is not a valid netmask`;
  throw new NetmaskTypeError(msg);
}

/**
 * Return prefix length from a numeric string.
 */
export function _basePrefixFromPrefixString(
  obj: PrefixToPrefixStringable,
  prefixlenStr: string
): number {
  // parseInt allows leading +/- as well as surrounding whitespace,
  // so we ensure that isn't the case
  if (!(strIsAscii(prefixlenStr) && strIsDigit(prefixlenStr))) {
    obj._reportInvalidNetmask(prefixlenStr);
  }

  const prefixlen = parseInt(prefixlenStr);
  if (!Number.isFinite(prefixlen)) {
    obj._reportInvalidNetmask(prefixlenStr);
  }
  if (!(0 <= prefixlen && prefixlen <= obj.maxPrefixlen)) {
    obj._reportInvalidNetmask(prefixlenStr);
  }

  return prefixlen;
}

/**
 * Turn a netmask/hostmask string into a prefix length.
 * @param ipStr The netmask/hostmask to be converted
 * @returns {number} An integer, the prefix length.
 * @throws {AddressTypeError} If the mask cannot be converted to an integer.
 */
export function _basePrefixFromIpString(
  obj: PrefixToIPStringable,
  ipStr: string
): number {
  // Parse the netmask/hostmask like an IP address.
  let ipInt = -1;
  try {
    ipInt = obj._ipIntFromString(ipStr);
  } catch (err: unknown) {
    if (err instanceof AddressTypeError) {
      obj._reportInvalidNetmask(ipStr);
    }
  }

  // Try matching a netmask (this would be /1*0*/ as a bitwise regexp).
  // Note that the two ambiguous cases (all-ones and all-zeroes) are
  // treated as netmasks.
  try {
    return obj._prefixFromIpInt(ipInt);
  } catch (err: unknown) {
    if (!(err instanceof TypeError)) {
      throw err;
    }
  }

  // Invert the bits, and try matching a /0+1+/ hostmask instead.
  const inverted = BigInt(ipInt) ^ BigInt(obj._ALL_ONES);
  try {
    return obj._prefixFromIpInt(inverted);
  } catch (err: unknown) {
    obj._reportInvalidNetmask(ipStr);
  }
}

export function _baseSplitAddrPrefix(
  address: string | IPInteger | ByteArray,
  prefixlen: Prefixlen
): [string | IPInteger | ByteArray, Prefixlen] {
  // a packed address or integer
  if (isNumber(address) || isBigInt(address) || isByteArray(address)) {
    return [address, prefixlen];
  }

  const addressArray = isString(address)
    ? _splitOptionalNetmask(address)
    : address;
  return [addressArray[0], prefixlen];
}
