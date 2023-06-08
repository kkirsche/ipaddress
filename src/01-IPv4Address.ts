import { ByteArray, Prefixlen, UnparsedIPv4Address } from "./interfaces";
import { IPv4ALLONES, IPv4LENGTH } from "./constants";
import {
  _countRighthandZeroBits,
  _splitOptionalNetmask,
  intFromBytes,
  intToBytes,
  isSafeNumber,
  strIsAscii,
  strIsDigit,
  v4IntToPacked,
} from "./utilities";
import {
  isBigInt,
  isByteArray,
  isNumber,
  isString,
  isUndefined,
} from "./typeGuards";

import { AddressValueError } from "./00-AddressValueError";
import { NetmaskValueError } from "./NetmaskValueError";
import { _IPv4Constants } from "./_IPv4Constants";

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
  static readonly _constants = _IPv4Constants;
  static _netmaskCache: Record<string | number, [IPv4Address, Prefixlen]> = {};
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
  constructor(address: string | bigint | number | ByteArray) {
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
    if (address.indexOf("/") !== -1) {
      throw new AddressValueError(`Unexpected '/' in ${address}`);
    }

    this._ip = IPv4Address._ipIntFromString(address);
  }

  /**
   * @returns {ByteArray} The binary representation of this address.
   */
  get packed(): ByteArray {
    return v4IntToPacked(this._ip);
  }

  // BEGIN: _IPAddressBase

  /**
   * Return the longhand version of the IP address as a string.
   */
  get exploded(): string {
    return this._explodeShorthandIpString();
  }

  /**
   * Return the shorthand version of the IP address as a string.
   */
  get compressed(): string {
    return this.toString();
  }

  /**
   * The name of the reverse DNS pointer for the IP address, e.g.:
   * >>> ipaddress.ip_address("127.0.0.1").reverse_pointer
   * '1.0.0.127.in-addr.arpa'
   * >>> ipaddress.ip_address("2001:db8::1").reverse_pointer
   * '1.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.8.b.d.0.1.0.0.2.ip6.arpa'
   */
  get reversePointer(): string {
    return this._reversePointer();
  }

  _checkIntAddress(address: number): void {
    if (address < 0) {
      const msg = `${address} (< 0) is not permitted as an IPv${this.version} address`;
      throw new AddressValueError(msg);
    }
    if (address > IPv4Address._ALL_ONES) {
      const msg = `${address} (> 2**${this.maxPrefixlen}) is not permitted as an IPv${this.version} address`;
      throw new AddressValueError(msg);
    }
  }

  _checkPackedAddress(address: ByteArray, expectedLen: number): void {
    const addressLen = address.length;
    if (addressLen !== expectedLen) {
      const msg = `'${address}' (len ${addressLen} != ${expectedLen}) is not permitted as an IPv${this.version} address.`;
      throw new AddressValueError(msg);
    }
  }

  /**
   * Turn the prefix length into a bitwise mask.
   * @param prefixlen An integer, the prefix length.
   * @returns {number} An integer.
   */
  static _ipIntFromPrefix(prefixlen: Prefixlen): number {
    const result =
      BigInt(this._ALL_ONES) ^ (BigInt(this._ALL_ONES) >> BigInt(prefixlen));
    if (isSafeNumber(result)) {
      return Number(result);
    }
    throw new Error("Unexpected bigint in _ipIntFromPrefix on IPv4Address");
  }

  /**
   * Returns prefix length from the bitwise netmask.
   * @param ipInt An integer, the netmask in expanded bitwise format.
   * @returns {Prefixlen} An integer, the prefix length.
   * @throws {TypeError} If the input intermingles zeroes & ones.
   */
  static _prefixFromIpInt(ipInt: number): Prefixlen {
    const trailingZeroes = _countRighthandZeroBits(ipInt, this._maxPrefixlen);
    const prefixlen = this._maxPrefixlen - trailingZeroes;
    const leadingOnes = BigInt(ipInt) >> BigInt(trailingZeroes);
    const allOnes = (BigInt(1) << BigInt(prefixlen)) - BigInt(1);
    if (leadingOnes !== allOnes) {
      const byteslen = Math.floor(this._maxPrefixlen / 8);
      const details = intToBytes(ipInt, byteslen, "big");
      const msg = `Netmask pattern '${details.toString()}' mixes zeroes & ones`;
      throw new TypeError(msg);
    }
    return prefixlen;
  }

  static _reportInvalidNetmask(netmaskStr: string): never {
    const msg = `${netmaskStr} is not a valid netmask`;
    throw new NetmaskValueError(msg);
  }

  /**
   * Return prefix length from a numeric string.
   * @param prefixlenStr The string to be converted.
   * @returns {Prefixlen} An integer, the prefix length.
   * @throws {NetmaskValueError} If the input is not a valid netmask.
   */
  static _prefixFromPrefixString(prefixlenStr: string): Prefixlen {
    // parseInt allows leading +/- as well as surrounding whitespace,
    // so we ensure that isn't the case
    if (!(strIsAscii(prefixlenStr) && strIsDigit(prefixlenStr))) {
      this._reportInvalidNetmask(prefixlenStr);
    }

    const prefixlen = parseInt(prefixlenStr);
    if (!Number.isFinite(prefixlen)) {
      this._reportInvalidNetmask(prefixlenStr);
    }
    if (!(0 <= prefixlen && prefixlen <= this._maxPrefixlen)) {
      this._reportInvalidNetmask(prefixlenStr);
    }

    return prefixlen;
  }

  /**
   * Turn a netmask/hostmask string into a prefix length.
   * @param ipStr The netmask/hostmask to be converted.
   * @returns {Prefixlen} An integer, the prefix length.
   * @throws {NetmaskValueError} If the input is not a valid netmask/hostmask;
   */
  static _prefixFromIpString(ipStr: string): Prefixlen {
    // Parse the netmask/hostmask like an IP address.
    let ipInt = -1;
    try {
      ipInt = this._ipIntFromString(ipStr);
    } catch (err: unknown) {
      if (err instanceof AddressValueError) {
        this._reportInvalidNetmask(ipStr);
      }
    }

    // Try matching a netmask (this would be /1*0*/ as a bitwise regexp).
    // Note that the two ambiguous cases (all-ones and all-zeroes) are
    // treated as netmasks.
    try {
      return this._prefixFromIpInt(ipInt);
    } catch (err: unknown) {
      if (!(err instanceof TypeError)) {
        throw err;
      }
    }

    // Invert the bits, and try matching a /0+1+/ hostmask instead.
    let inverted: bigint | number = BigInt(ipInt) ^ BigInt(this._ALL_ONES);
    if (isSafeNumber(inverted)) {
      inverted = Number(inverted);
    }
    if (isBigInt(inverted)) {
      throw new Error("Unexpected bigint in IPv4Address _prefixFromIpString");
    }
    try {
      return this._prefixFromIpInt(inverted);
    } catch (err: unknown) {
      return this._reportInvalidNetmask(ipStr);
    }
  }

  /**
   * Helper function to parse address of Network/Interface.
   * @param address Argument of Network/Interface.
   * @returns {[UnparsedIPv4Address, Prefixlen]} [addr, prefix] tuple
   */
  static _splitAddrPrefix(
    address: UnparsedIPv4Address
  ): [UnparsedIPv4Address, Prefixlen] {
    // a packed address or integer
    if (isNumber(address) || isByteArray(address)) {
      return [address, this._maxPrefixlen];
    }

    const addressArray = isString(address)
      ? _splitOptionalNetmask(address)
      : address;
    return [addressArray[0], this._maxPrefixlen];
  }

  // END: _IPAddressBase
  // BEGIN: _BaseAddress
  toNumber(): number {
    return this._ip;
  }

  equals(other: { version: number; _ip: number }): boolean {
    return this.version === other.version && this._ip === other._ip;
  }

  lessThan(other: { version: number; _ip: number }): boolean {
    if (this.version !== other.version) {
      throw new TypeError(
        `${this.toString()} and ${other.toString()} are not of the same version`
      );
    }

    if (this._ip !== other._ip) {
      return this._ip < other._ip;
    }

    return false;
  }

  add(other: { toNumber: () => number }): number {
    const result = BigInt(this.toNumber()) + BigInt(other.toNumber());
    if (isSafeNumber(result)) {
      return Number(result);
    }

    throw new Error("Unexpected bigint in add IPv4Address");
  }

  sub(other: { toNumber: () => number }): number {
    const result = BigInt(this.toNumber()) - BigInt(other.toNumber());
    if (isSafeNumber(result)) {
      return Number(result);
    }

    throw new Error("Unexpected bigint in sub IPv4Address");
  }

  toRepr(): string {
    return `IPv4Address('${this.toString()}')`;
  }

  toString(): string {
    return this._stringFromIpInt(this._ip);
  }

  _getAddressKey(): [4, IPv4Address] {
    return [this.version, this];
  }

  // END: _BaseAddress
  // BEGIN: _BaseV4

  _explodeShorthandIpString(): string {
    return this.toString();
  }

  /**
   * Make a [netmask, prefixlen] tuple from the given argument.
   * @param arg Argument can be:
   * - an integer (the prefix length)
   * - a string representing the prefix length (e.g. "24")
   * - a string representing the prefix netmask (e.g. "255.255.255.0")
   * @returns {NetmaskCacheValue} The [netmask, prefixlen] tuple.
   */
  static _makeNetmask(arg: string | Prefixlen): [IPv4Address, Prefixlen] {
    let prefixlen: Prefixlen;
    if (this._netmaskCache[arg] === undefined) {
      if (isNumber(arg)) {
        prefixlen = arg;
        if (!(0 <= prefixlen && prefixlen <= this._maxPrefixlen)) {
          throw new NetmaskValueError(`${prefixlen} is not a valid netmask`);
        }
      } else {
        try {
          prefixlen = this._prefixFromPrefixString(arg);
        } catch (err: unknown) {
          // Check for a netmask or hostmask in dotted-quad form.
          // This may raise NetmaskTypeError
          prefixlen = this._prefixFromIpString(arg);
        }
      }
      const netmask = new IPv4Address(this._ipIntFromPrefix(prefixlen));
      this._netmaskCache[arg] = [netmask, prefixlen];
    }
    const result = this._netmaskCache[arg];
    if (isUndefined(result)) {
      throw new Error("Unexpected cache miss");
    }

    return result;
  }

  /**
   * Turn the given IP string into an integer for comparison.
   * @param ipStr A string, the IP ipStr.
   * @returns {number} The IP ipStr as an integer.
   * @throws {AddressValueError} if ipStr isn't a valid IPv4 Address.
   */
  static _ipIntFromString(ipStr: string): number {
    if (ipStr === "") {
      throw new AddressValueError("Address cannot be empty");
    }

    const octets = ipStr.split(".");
    if (octets.length !== 4) {
      throw new AddressValueError(`Expected 4 octets in ${ipStr}`);
    }

    try {
      const parsedOctets = intFromBytes(
        octets.map((octet) => this._parseOctet(octet)),
        "big" // big-endian / network-byte order
      );
      if (!isNumber(parsedOctets)) {
        throw new AddressValueError(
          `Invalid IPv4 address integer: ${parsedOctets} is of type ${typeof parsedOctets} instead of number`
        );
      }
      return parsedOctets;
    } catch (error: unknown) {
      let message = `Unknown error occurred while parsing ${ipStr}.`;
      if (error instanceof Error) message = `${error.message} in ${ipStr}`;
      throw new AddressValueError(message);
    }
  }

  /**
   * Convert a dotted decimal octet into an integer
   * @param octetStr A string, the number to parse.
   * @returns {number} The octet as an integer.
   * @throws {TypeError} if the octet isn't strictly a decimal [0..255].
   */
  static _parseOctet(octetStr: string): number {
    if (octetStr === "") {
      throw new TypeError("Empty octet is not permitted.");
    }
    // Reject non-ASCII digits.
    if (!strIsAscii(octetStr) && !strIsDigit(octetStr)) {
      throw new TypeError(`Only decimal digits permitted in '${octetStr}'`);
    }

    // We do length check second, since the invalid character error
    // is likely to be more informative for the user
    if (octetStr.length > 3) {
      throw new TypeError(`At most 3 characters permitted in '${octetStr}'`);
    }

    // Handle leading zeroes as strict as glibc's inet_pton()
    // See security bug in Python's issue tracker, bpo-36384
    if (octetStr !== "0" && octetStr.indexOf("0") === 0) {
      throw new TypeError(`Leading zeroes are not permitted in '${octetStr}'`);
    }

    // Convert the integer (we know digits are legal)
    const octetInt = parseInt(octetStr, 10);
    if (octetInt > 255) {
      throw new TypeError(`Octet ${octetInt} (> 255) not permitted`);
    }

    return octetInt;
  }

  /**
   * Turns a 32-bit integer into dotted decimal notation.
   * @param ipInt An integer, the IP Address.
   * @returns {string} The IP address as a string in dotted decimal notation.
   */
  static _stringFromIpInt(ipInt: number): string {
    return intToBytes(ipInt, 4, "big")
      .map((byte: ByteArray[number]) => byte.toString())
      .join(".");
  }

  /**
   * Turns a 32-bit integer into dotted decimal notation.
   * @param ipInt An integer, the IP Address.
   * @returns {string} The IP address as a string in dotted decimal notation.
   */
  _stringFromIpInt(ipInt: number): string {
    return intToBytes(ipInt, 4, "big")
      .map((byte: ByteArray[number]) => byte.toString())
      .join(".");
  }

  /**
   * Return the reverse DNS pointer name for the IPv4 address.
   * This implements the method described in RFC1035 3.5.
   * @returns {string} The reverse DNS pointer name.
   */
  _reversePointer(this: IPv4Address): string {
    return `${this.toString().split(".").reverse().join(".")}.in-addr.arpa`;
  }

  get version(): 4 {
    return IPv4Address._version;
  }

  get maxPrefixlen(): 32 {
    return IPv4Address._maxPrefixlen;
  }
  // END: _BaseV4
}
