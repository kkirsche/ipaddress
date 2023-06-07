import {
  IPv6ALLONES,
  IPv6LENGTH,
  NetmaskCacheKey,
  V6NetmaskCacheValue,
} from "./constants";

import { _BaseV6Struct } from "./_BaseV6";

export class IPv6Address {
  static readonly _version = 6;
  static readonly _ALL_ONES = IPv6ALLONES;
  static readonly _HEXTET_COUNT = 8;
  static readonly _HEX_DIGITS = new Set("0123456789ABCDEFabcdef");
  static readonly _maxPrefixlen = IPv6LENGTH;
  static _netmaskCache: Record<NetmaskCacheKey, V6NetmaskCacheValue> = {};

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
    return _BaseV6Struct._compressHextets(IPv6Address, hextets);
  }
}
