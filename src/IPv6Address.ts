import {
  ByteArray,
  IPv6ALLONES,
  IPv6LENGTH,
  NetmaskCacheKey,
  Prefixlen,
  UnparsedIPv6Address,
  V6NetmaskCacheValue,
} from "./constants";
import { intFromBytes, isSafeNumber, v6IntToPacked } from "./utilities";
import { isBigInt, isByteArray, isNull, isNumber } from "./typeGuards";

import { AddressValueError } from "./AddressValueError";
import { IPv4Address } from "./IPv4Address";
import { IPv4AddressInstance } from "./interfaces";
import { _BaseAddressStruct } from "./_BaseAddress";
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
  _scope_id: string | null;

  /**
   * Instantiate a new IPv6 address object.
   *
   *
   * @param address A string or integer representing the IP.
   * Additionally, an integer can be passed, so
   * IPv6Address("2001:db8::") == IPv6Address(BigInt(42540766411282592856903984951653826560))
   * or, more generally
   * IPv6Address(IPv6Address("2001:db8::").toNumber()) == IPv6Address("2001:db8::")
   * @throws {AddressValueError} If the address isn't a valid IPv6 address.
   */
  constructor(address: UnparsedIPv6Address) {
    // Efficient constructor from integer
    if (isBigInt(address)) {
      this._checkIntAddress(address);
      this._ip = address;
      this._scope_id = null;
      return;
    }

    // Constructing from a packed address
    if (isByteArray(address)) {
      this._checkPackedAddress(address, 16);
      const _ip = intFromBytes(address, "big");
      if (isNumber(_ip)) {
        throw new AddressValueError("Unexpected number for IPv6 address");
      }
      this._ip = _ip;
      this._scope_id = null;
      return;
    }

    // Assume input argument to be string or any object representation
    // which converts into a formatted IP address
    let addrStr = address;
    if (addrStr.includes("/")) {
      throw new AddressValueError(`Unexpected '/' in '${address}'`);
    }
    [addrStr, this._scope_id] = IPv6Address._splitScopeId(addrStr);
    this._ip = IPv6Address._ipBigIntFromString(addrStr);
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
  // BEGIN: _BaseAddress
  toNumber(this: IPv6Address): number {
    const result = _BaseAddressStruct.toNumber(this);
    if (isBigInt(result)) {
      throw new Error("Unexpected bigint in toNumber");
    }
    return result;
  }

  equals(this: IPv6Address, other: IPv6Address): boolean {
    const addressEqual = _BaseAddressStruct.equals(this, other);
    if (!addressEqual) {
      return false;
    }
    return this._scope_id === other._scope_id;
  }

  lessThan(this: IPv6Address, other: IPv6Address): boolean {
    return _BaseAddressStruct.lessThan(this, other);
  }

  add(this: IPv6Address, other: IPv6Address): number {
    const result = _BaseAddressStruct.add(this, other);
    if (isBigInt(result)) {
      throw new Error("Unexpected bgiint in IPv4 addition");
    }
    return result;
  }

  sub(this: IPv6Address, other: IPv6Address): number {
    const result = _BaseAddressStruct.sub(this, other);
    if (isBigInt(result)) {
      throw new Error("Unexpected bgiint in IPv4 addition");
    }
    return result;
  }

  toRepr(this: IPv6Address): string {
    return _BaseAddressStruct.toRepr("IPv6Address", this);
  }

  toString(this: IPv6Address): string {
    const ipStr = _BaseAddressStruct.toString(this);

    return !isNull(this._scope_id) ? `${ipStr}%${this._scope_id}` : ipStr;
  }

  _getAddressKey(this: IPv6Address): [6, IPv6Address] {
    return [this.version, this];
  }

  // END: _BaseAddress
  // BEGIN: _BaseV6

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
  _stringFromIpInt(ipInt: bigint): string {
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

  /**
   * Helper function to parse IPv6 string address scope id.
   *
   * See RFC 4007 for details.
   * @param ipStr A string, the IPv6 address.
   * @returns {[string, string | null]} [addr, scopeId] tuple.
   */
  static _splitScopeId(ipStr: string): [string, string | null] {
    return _BaseV6Struct._splitScopeId(ipStr);
  }

  get maxPrefixlen() {
    return IPv6Address._maxPrefixlen;
  }

  get version(): 6 {
    return IPv6Address._version;
  }
  // END: _BaseV6
  // BEGIN: IPv6Address
  /**
   * Identifier of a particular zone of the address's scope.
   *
   * See RFC 4007 for details.
   *
   * @returns {string | null} A string identifying the zone of the address if specified,
   * else null
   */
  get scope_id(): string | null {
    return this._scope_id;
  }

  /**
   * The binary representation of this address.
   */
  get packed(): ByteArray {
    return v6IntToPacked(this._ip);
  }

  /**
   * Test if the address is unspecified.
   *
   * @returns {boolean} true if this address is the unspecified address as defined
   * in RFC 2373 2.5.2
   */
  get isUnspecified(): boolean {
    return this._ip === BigInt(0);
  }

  /**
   * Test if the address is a loopback address.
   *
   * @returns {boolean} true if the address is a loopback address as defined in
   * RFC 2373 2.5.3
   */
  get isLoopback(): boolean {
    return this._ip === BigInt(1);
  }

  /**
   * Return the IPv4 mapped address.
   * @returns {IPv4Address | null} If the IPv6 address is a v4 mapped address, return
   * the IPv4 mapped address. Return null otherwise.
   */
  get ipv4Mapped(): IPv4Address | null {
    if (this._ip >> BigInt(32) !== BigInt(0xffff)) {
      return null;
    }
    let initializer: bigint | number = this._ip & BigInt(0xffffffff);
    if (isSafeNumber(initializer)) {
      initializer = Number(initializer);
    }
    if (isBigInt(initializer)) {
      throw new Error("Unexpected IPv6 sized address in IPv4 mapped function");
    }
    return new IPv4Address(initializer);
  }

  /**
   * Tuple of embedded teredo IPs.
   * @returns {[IPv4Address, IPv4Address]} Tuple of the [server, client] IPs or null
   * if the address doesn't appear to be a teredo address (doesn't start with 2001::/32)
   */
  get teredo(): [IPv4AddressInstance, IPv4AddressInstance] | null {
    if (this._ip >> BigInt(96) !== BigInt(0x20010000)) {
      return null;
    }

    let serverInitializer: bigint | number =
      (this._ip >> BigInt(64)) & BigInt(0xffffffff);
    let clientInitializer: bigint | number = ~this._ip & BigInt(0xffffffff);
    if (isSafeNumber(serverInitializer)) {
      serverInitializer = Number(serverInitializer);
    }
    if (isSafeNumber(clientInitializer)) {
      clientInitializer = Number(clientInitializer);
    }
    if (isBigInt(serverInitializer)) {
      throw new Error("Unexpected bigint in teredo server");
    }
    if (isBigInt(clientInitializer)) {
      throw new Error("Unexpected bigint in teredo client");
    }

    return [
      new IPv4Address(serverInitializer),
      new IPv4Address(clientInitializer),
    ];
  }

  get sixtofour(): IPv4Address | null {
    if (this._ip >> BigInt(112) !== BigInt(0x2002)) {
      return null;
    }

    let initializer: bigint | number =
      (this._ip >> BigInt(80)) & BigInt(0xffffffff);
    if (isSafeNumber(initializer)) {
      initializer = Number(initializer);
    }
    if (isBigInt(initializer)) {
      throw new Error("Unexpected bigint in sixtofour address");
    }
    return new IPv4Address(initializer);
  }
  // END: IPv6Address
}
