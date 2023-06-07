import {
  ByteArray,
  IPv6ALLONES,
  IPv6LENGTH,
  NetmaskCacheKey,
  Prefixlen,
  UnparsedIPv6Address,
  V6NetmaskCacheValue,
} from "./constants";
import { isBigInt, isNumber } from "./typeGuards";

import { _BaseV6Struct } from "./_BaseV6";
import { _IPAddressBaseStruct } from "./_IPAddressBase";

export class IPv6Address {
  static readonly _version = 6;
  static readonly _ALL_ONES = IPv6ALLONES;
  static readonly _HEXTET_COUNT = 8;
  static readonly _HEX_DIGITS = new Set("0123456789ABCDEFabcdef");
  static readonly _maxPrefixlen = IPv6LENGTH;
  static _netmaskCache: Record<NetmaskCacheKey, V6NetmaskCacheValue> = {};
  _ip: bigint;

  constructor(ip: string | bigint | ByteArray) {
    this._ip = BigInt(-1);
  }

  // BEGIN: _IPAddressBase

  /**
   * Return the longhand version of the IP address as a string.
   */
  get exploded(): string {
    return _IPAddressBaseStruct.exploded(this);
  }

  /**
   * Return the shorthand version of the IP address as a string.
   */
  get compressed(): string {
    return _IPAddressBaseStruct.compressed(this);
  }

  /**
   * The name of the reverse DNS pointer for the IP address, e.g.:
   * >>> ipaddress.ip_address("127.0.0.1").reverse_pointer
   * '1.0.0.127.in-addr.arpa'
   * >>> ipaddress.ip_address("2001:db8::1").reverse_pointer
   * '1.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.8.b.d.0.1.0.0.2.ip6.arpa'
   */
  get reversePointer(): string {
    return _IPAddressBaseStruct.reversePointer(this);
  }

  _checkIntAddress(this: IPv6Address, address: bigint): void {
    return _IPAddressBaseStruct._checkIntAddress(IPv6Address, address);
  }

  _checkPackedAddress(
    this: IPv6Address,
    address: ByteArray,
    expectedLen: number
  ): void {
    return _IPAddressBaseStruct._checkPackedAddress(
      IPv6Address,
      address,
      expectedLen
    );
  }

  /**
   * Turn the prefix length into a bitwise mask.
   * @param prefixlen An integer, the prefix length.
   * @returns {number} An integer.
   */
  static _ipIntFromPrefix(prefixlen: Prefixlen): bigint {
    const result = _IPAddressBaseStruct._ipIntFromPrefix(
      IPv6Address,
      prefixlen
    );
    if (isNumber(result)) {
      throw new Error("Unexpected number in IPv6 address");
    }
    return result;
  }

  /**
   * Returns prefix length from the bitwise netmask.
   * @param ipInt An integer, the netmask in expanded bitwise format.
   * @returns {Prefixlen} An integer, the prefix length.
   * @throws {TypeError} If the input intermingles zeroes & ones.
   */
  static _prefixFromIpInt(ipInt: bigint): Prefixlen {
    return _IPAddressBaseStruct._prefixFromIpInt(IPv6Address, ipInt);
  }

  static _reportInvalidNetmask(netmaskStr: string): never {
    return _IPAddressBaseStruct._reportInvalidNetmask(netmaskStr);
  }

  /**
   * Return prefix length from a numeric string.
   * @param prefixlenStr The string to be converted.
   * @returns {Prefixlen} An integer, the prefix length.
   * @throws {NetmaskValueError} If the input is not a valid netmask.
   */
  static _prefixFromPrefixString(prefixlenStr: string): Prefixlen {
    return _IPAddressBaseStruct._prefixFromPrefixString(
      IPv6Address,
      prefixlenStr
    );
  }

  /**
   * Turn a netmask/hostmask string into a prefix length.
   * @param ipStr The netmask/hostmask to be converted.
   * @returns {Prefixlen} An integer, the prefix length.
   * @throws {NetmaskValueError} If the input is not a valid netmask/hostmask;
   */
  static _prefixFromIpString(ipStr: string): Prefixlen {
    return _IPAddressBaseStruct._prefixFromIpString(IPv6Address, ipStr);
  }

  /**
   * Helper function to parse address of Network/Interface.
   * @param address Argument of Network/Interface.
   * @returns {[UnparsedIPv6Address, Prefixlen]} [addr, prefix] tuple
   */
  static _splitAddrPrefix(
    address: UnparsedIPv6Address
  ): [UnparsedIPv6Address, Prefixlen] {
    const [_addr, prefixlen] = _IPAddressBaseStruct._splitAddrPrefix(
      address,
      IPv6Address._maxPrefixlen
    );
    if (isNumber(_addr)) {
      throw new TypeError("Unexpected number in split addr prefix.");
    }
    return [_addr, prefixlen];
  }

  // END: _IPAddressBase

  /**
   * Make a [netmask, prefixLen] tuple from the given argument.
   *
   * Argument can be:
   * - an integer (the prefix length)
   * - a string representing the prefix length (e.g. "24")
   * - a string representing the prefix length (e.g. "255.255.255.0")
   */
  static _makeNetmask(arg: NetmaskCacheKey): V6NetmaskCacheValue {
    return _BaseV6Struct._makeNetmask(IPv6Address, arg);
  }

  /**
   * Turn an IPv6 ipStr into an integer.
   * @param ipStr A string, the IPv6 ipStr.
   * @returns {bigint} A bigint, the IPv6 address.
   * @throws {AddressValueError} if ipStr isn't a valid IPv6 address.
   */
  static _ipBigIntFromString(ipStr: string): bigint {
    return _BaseV6Struct._ipBigIntFromString(IPv6Address, ipStr);
  }

  /**
   * Convert an IPv6 hextet string into an integer
   * @param hextetStr A string, the number to parse.
   * @returns {number} The hextet as an integer.
   * @throws {Error} if the input isn't strictly a hex number from
   * [0..FFFF].
   */
  static _parseHextet(hextetStr: string): number {
    return _BaseV6Struct._parseHextet(IPv6Address, hextetStr);
  }

  /**
   * Compresses a list of hextets.
   *
   * Compress a list of strings, replacing the longest continuous
   * sequence of "0" in the list with "" and adding empty strings at
   * the beginning or at the end of the string such that subsequently
   * calling hextets.join(":") will produce the compressed version of
   * the IPv6 address.
   * @param hextets A list of strings, the hextets to compress.
   * @returns {string[]} A list of strings
   */
  static _compressHextets(hextets: string[]): string[] {
    return _BaseV6Struct._compressHextets(hextets);
  }

  /**
   * Turns a 128-bit integer into hexadecimal notation.
   * @param ipInt An integer, the IP address.
   * @returns {string} A string, the hexadecimal representation of the address.
   * @throws {Error} The address is bigger than 128 bits of all ones.
   */
  static _stringFromIpInt(ipInt: bigint): string {
    return _BaseV6Struct._stringFromIpInt(IPv6Address, ipInt);
  }

  /**
   * Expand a shortened IPv6 address.
   * @returns {string} A string, the expanded IPv6 address.
   */
  _explodeShorthandIpString(this: IPv6Address): string {
    return _BaseV6Struct._explodeShorthandIpString(IPv6Address, this);
  }

  /**
   * Return the reverse DNS pointer name for the IPv6 address.
   *
   * This implements the method described in RFC3596 2.5.
   */
  _reversePointer(this: IPv6Address): string {
    return _BaseV6Struct._reversePointer(this);
  }
}
