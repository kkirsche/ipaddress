import {
  ByteArray,
  IPInteger,
  IPv4ALLONES,
  IPv4LENGTH,
  NetmaskCacheKey,
  NetmaskCacheValue,
  Prefixlen,
  UnparsedIPv4Address,
} from "./constants";
import { _BaseV4Struct, _BaseV4T, _BaseV4TInstance } from "./_BaseV4";
import { intFromBytes, isSafeNumber, v4IntToPacked } from "./utilities";
import { isBigInt, isNumber } from "./typeGuards";

import { AddressValueError } from "./AddressValueError";
import { _BaseAddressStruct } from "./_BaseAddress";
import { _IPAddressBaseStruct } from "./_IPAddressBase";

/**
 * Represent and manipulate single IPv4 Addresses.
 *
 * @param address: A string or integer representing the IP.
 * Additionally, an integer can be passed, so
 * IPv4Address('192.0.2.1') == IPv4Address(3221225985).
 * or, more generally
 * IPv4Address(IPv4Address('192.0.2.1').toNumber()) ==
 * IPv4Address('192.0.2.1')
 * @throws {AddressValueError} If ipaddress isn't a valid IPv4 address.
 * @returns {IPv4Address} The IPv4Address instance
 */
export class IPv4Address {
  static readonly _version = 4;
  static readonly _ALL_ONES = IPv4ALLONES;
  static readonly _maxPrefixlen = IPv4LENGTH;
  static _netmaskCache: Record<NetmaskCacheKey, NetmaskCacheValue> = {};
  _ip: number;

  /**
   * Represent and manipulate single IPv4 Addresses.
   *
   * @param address: A string or integer representing the IP.
   * Additionally, an integer can be passed, so
   * IPv4Address('192.0.2.1') == IPv4Address(3221225985).
   * or, more generally
   * IPv4Address(IPv4Address('192.0.2.1').toNumber()) ==
   * IPv4Address('192.0.2.1')
   * @throws {AddressValueError} If ipaddress isn't a valid IPv4 address.
   * @returns {IPv4Address} The IPv4Address instance
   */
  constructor(address: string | IPInteger | ByteArray) {
    if (isBigInt(address)) {
      if (!isSafeNumber(address)) {
        throw new AddressValueError(
          `Invalid IPv4 address big integer: ${address} is not convertable to a number`
        );
      }
      address = Number(address);
    }

    if (isNumber(address)) {
      this._checkIntAddress(address);
      this._ip = address;
      return;
    }

    // Bytes array, a packed IP address
    if (Array.isArray(address)) {
      if (address.every((value) => typeof value === "number")) {
        this._checkPackedAddress(address, 4);
        const ip = intFromBytes(address, "big");
        if (!isNumber(ip)) {
          throw new AddressValueError(
            `Invalid IPv4 address integer: ${ip} is of type ${typeof ip} instead of number`
          );
        }
        this._ip = ip;
        return;
      }
      throw new TypeError("Packed IP addresses must be arrays of numbers");
    }

    // we have a string or we assume it behaves like one.
    if (address.includes("/")) {
      throw new AddressValueError(`Unexpected '/' in ${address}`);
    }

    this._ip = IPv4Address._ipIntFromString(address);
  }

  get _ALL_ONES(): (typeof IPv4Address)["_ALL_ONES"] {
    return IPv4Address._ALL_ONES;
  }

  get version(): 4 {
    return IPv4Address._version;
  }

  get maxPrefixlen() {
    return IPv4Address._maxPrefixlen;
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

  _checkIntAddress(this: IPv4Address, address: number): void {
    return _IPAddressBaseStruct._checkIntAddress(this, address);
  }

  _checkPackedAddress(
    this: IPv4Address,
    address: ByteArray,
    expectedLen: number
  ): void {
    return _IPAddressBaseStruct._checkPackedAddress(this, address, expectedLen);
  }

  /**
   * Turn the prefix length into a bitwise mask.
   * @param prefixlen An integer, the prefix length.
   * @returns {number} An integer.
   */
  static _ipIntFromPrefix(prefixlen: Prefixlen): number {
    const result = _IPAddressBaseStruct._ipIntFromPrefix(
      IPv4Address,
      prefixlen
    );
    if (isBigInt(result)) {
      throw new Error("Unexpected bigint in IPV4 Address");
    }
    return result;
  }

  /**
   * Returns prefix length from the bitwise netmask.
   * @param ipInt An integer, the netmask in expanded bitwise format.
   * @returns {Prefixlen} An integer, the prefix length.
   * @throws {TypeError} If the input intermingles zeroes & ones.
   */
  static _prefixFromIpInt(ipInt: IPInteger): Prefixlen {
    return _IPAddressBaseStruct._prefixFromIpInt(IPv4Address, ipInt);
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
      IPv4Address,
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
    // @ts-expect-error typescript is being overly picky about type narrowing
    return _IPAddressBaseStruct._prefixFromIpString(IPv4Address, ipStr);
  }

  /**
   * Helper function to parse address of Network/Interface.
   * @param address Argument of Network/Interface.
   * @returns {[UnparsedIPv4Address, Prefixlen]} [addr, prefix] tuple
   */
  static _splitAddrPrefix(
    address: UnparsedIPv4Address
  ): [UnparsedIPv4Address, Prefixlen] {
    const [_addr, prefixlen] = _IPAddressBaseStruct._splitAddrPrefix(
      address,
      IPv4Address._maxPrefixlen
    );
    if (isBigInt(_addr)) {
      throw new TypeError("Unexpected bigint in split addr prefix.");
    }
    return [_addr, prefixlen];
  }

  // END: _IPAddressBase
  // BEGIN: _BaseAddress
  toNumber(this: IPv4Address): number {
    const result = _BaseAddressStruct.toNumber(this);
    if (isBigInt(result)) {
      throw new Error("Unexpected bigint in toNumber");
    }
    return result;
  }

  equals(this: IPv4Address, other: IPv4Address): boolean {
    return _BaseAddressStruct.equals(this, other);
  }

  lessThan(this: IPv4Address, other: IPv4Address): boolean {
    return _BaseAddressStruct.lessThan(this, other);
  }

  add(this: IPv4Address, other: IPv4Address): number {
    const result = _BaseAddressStruct.add(this, other);
    if (isBigInt(result)) {
      throw new Error("Unexpected bgiint in IPv4 addition");
    }
    return result;
  }

  sub(this: IPv4Address, other: IPv4Address): number {
    const result = _BaseAddressStruct.sub(this, other);
    if (isBigInt(result)) {
      throw new Error("Unexpected bgiint in IPv4 addition");
    }
    return result;
  }

  toRepr(this: IPv4Address): string {
    return _BaseAddressStruct.toRepr("IPv4Address", this);
  }

  toString(this: IPv4Address): string {
    return _BaseAddressStruct.toString(this);
  }

  _getAddressKey(this: IPv4Address): [4, IPv4Address] {
    return [this.version, this];
  }

  // BEGIN: _BaseV4
  _explodeShorthandIpString(this: IPv4Address): string {
    return _BaseV4Struct._explodeShorthandIpString(this);
  }

  /**
   * Make a [netmask, prefixlen] tuple from the given argument.
   * @param arg Argument can be:
   * - an integer (the prefix length)
   * - a string representing the prefix length (e.g. "24")
   * - a string representing the prefix netmask (e.g. "255.255.255.0")
   * @returns {NetmaskCacheValue} The [netmask, prefixlen] tuple.
   */
  static _makeNetmask(arg: string | Prefixlen): NetmaskCacheValue {
    return _BaseV4Struct._makeNetmask(IPv4Address, arg);
  }

  /**
   * Turn the given IP string into an integer for comparison.
   * @param ipStr A string, the IP ipStr.
   * @returns {number} The IP ipStr as an integer.
   * @throws {AddressValueError} if ipStr isn't a valid IPv4 Address.
   */
  static _ipIntFromString(ipStr: string): number {
    return _BaseV4Struct._ipIntFromString(IPv4Address, ipStr);
  }

  /**
   * Convert a dotted decimal octet into an integer
   * @param octetStr A string, the number to parse.
   * @returns {number} The octet as an integer.
   * @throws {TypeError} if the octet isn't strictly a decimal [0..255].
   */
  static _parseOctet(octetStr: string): number {
    return _BaseV4Struct._parseOctet(octetStr);
  }

  /**
   * Turns a 32-bit integer into dotted decimal notation.
   * @param ipInt An integer, the IP Address.
   * @returns {string} The IP address as a string in dotted decimal notation.
   */
  static _stringFromIpInt(ipInt: number): string {
    return _BaseV4Struct._stringFromIpInt(ipInt);
  }

  /**
   * Turns a 32-bit integer into dotted decimal notation.
   * @param ipInt An integer, the IP Address.
   * @returns {string} The IP address as a string in dotted decimal notation.
   */
  _stringFromIpInt(ipInt: number): string {
    return _BaseV4Struct._stringFromIpInt(ipInt);
  }

  /**
   * Return the reverse DNS pointer name for the IPv4 address.
   * This implements the method described in RFC1035 3.5.
   * @returns {string} The reverse DNS pointer name.
   */
  _reversePointer(this: IPv4Address): string {
    return _BaseV4Struct._reversePointer(this);
  }

  // END: _BaseV4
}
