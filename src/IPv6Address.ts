import { ByteArray, Prefixlen, UnparsedIPv6Address } from "./interfaces";
import { IPv6ALLONES, IPv6LENGTH } from "./constants";
import {
  _countRighthandZeroBits,
  _splitOptionalNetmask,
  intFromBytes,
  intToBytes,
  isSafeNumber,
  isSuperset,
  strIsAscii,
  strIsDigit,
  v6IntToPacked,
} from "./utilities";
import {
  isBigInt,
  isByteArray,
  isNull,
  isNumber,
  isString,
} from "./typeGuards";

import { AddressValueError } from "./00-AddressValueError";
import { IPv4Address } from "./01-IPv4Address";
import { NetmaskValueError } from "./NetmaskValueError";

export class IPv6Address {
  static readonly _version = 6;
  static readonly _ALL_ONES = IPv6ALLONES;
  static readonly _HEXTET_COUNT = 8;
  static readonly _HEX_DIGITS = new Set("0123456789ABCDEFabcdef");
  static readonly _maxPrefixlen = IPv6LENGTH;
  static _netmaskCache: Record<string | number, [IPv6Address, Prefixlen]> = {};
  _ip: bigint;
  _scopeId: string | null;

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
      this._scopeId = null;
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
      this._scopeId = null;
      return;
    }

    // Assume input argument to be string or any object representation
    // which converts into a formatted IP address
    let addrStr = address;
    if (addrStr.indexOf("/") !== -1) {
      throw new AddressValueError(`Unexpected '/' in '${address}'`);
    }
    [addrStr, this._scopeId] = IPv6Address._splitScopeId(addrStr);
    this._ip = IPv6Address._ipIntFromString(addrStr);
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

  _checkIntAddress(address: bigint): void {
    if (address < 0) {
      const msg = `${address} (< 0) is not permitted as an IPv${this.version} address`;
      throw new AddressValueError(msg);
    }
    if (address > IPv6Address._ALL_ONES) {
      const msg = `${address} (> 2**${this.maxPrefixlen}) is not permitted as an IPv${this.version} address`;
      throw new AddressValueError(msg);
    }
  }

  _checkPackedAddress(
    this: IPv6Address,
    address: ByteArray,
    expectedLen: number
  ): void {
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
  static _ipIntFromPrefix(prefixlen: Prefixlen): bigint {
    const result =
      BigInt(this._ALL_ONES) ^ (BigInt(this._ALL_ONES) >> BigInt(prefixlen));
    return result;
  }

  /**
   * Returns prefix length from the bitwise netmask.
   * @param ipInt An integer, the netmask in expanded bitwise format.
   * @returns {Prefixlen} An integer, the prefix length.
   * @throws {TypeError} If the input intermingles zeroes & ones.
   */
  static _prefixFromIpInt(ipInt: bigint): Prefixlen {
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
    let ipInt = BigInt(-1);
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
    const inverted = BigInt(ipInt) ^ BigInt(this._ALL_ONES);
    try {
      return this._prefixFromIpInt(inverted);
    } catch (err: unknown) {
      return this._reportInvalidNetmask(ipStr);
    }
  }

  /**
   * Helper function to parse address of Network/Interface.
   * @param address Argument of Network/Interface.
   * @returns {[UnparsedIPv6Address, Prefixlen]} [addr, prefix] tuple
   */
  static _splitAddrPrefix(
    address: UnparsedIPv6Address
  ): [UnparsedIPv6Address, Prefixlen] {
    // a packed address or integer
    if (isBigInt(address) || isByteArray(address)) {
      return [address, this._maxPrefixlen];
    }

    const addressArray = isString(address)
      ? _splitOptionalNetmask(address)
      : address;
    return [addressArray[0], this._maxPrefixlen];
  }

  // END: _IPAddressBase
  // BEGIN: _BaseAddress
  toNumber(): bigint {
    return this._ip;
  }

  equals(other: { version: number; _ip: bigint }): boolean {
    return this.version === other.version && this._ip === other._ip;
  }

  lessThan(other: { version: number; _ip: bigint }): boolean {
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

  add(other: { toNumber: () => bigint }): bigint {
    const result = this.toNumber() + other.toNumber();
    return result;
  }

  sub(other: { toNumber: () => bigint }): bigint {
    const result = this.toNumber() - other.toNumber();
    return result;
  }

  toRepr(): string {
    return `IPv6Address('${this.toString()}')`;
  }

  toString(this: IPv6Address): string {
    const ipStr = IPv6Address._stringFromIpInt(this._ip);

    return !isNull(this._scopeId) ? `${ipStr}%${this._scopeId}` : ipStr;
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
  static _makeNetmask(arg: string | Prefixlen): [IPv6Address, Prefixlen] {
    if (this._netmaskCache[arg] === undefined) {
      let prefixlen: number;
      if (isNumber(arg)) {
        prefixlen = arg;
        if (!(0 <= prefixlen && prefixlen <= this._maxPrefixlen)) {
          this._reportInvalidNetmask(prefixlen.toString(10));
        }
      } else {
        prefixlen = this._prefixFromPrefixString(arg);
      }

      const netmask = new IPv6Address(this._ipIntFromPrefix(prefixlen));
      this._netmaskCache[arg] = [netmask, prefixlen];
    }

    return this._netmaskCache[arg];
  }

  /**
   * Turn an IPv6 ipStr into an integer.
   * @param ipStr A string, the IPv6 ipStr.
   * @returns {bigint} A bigint, the IPv6 address.
   * @throws {AddressValueError} if ipStr isn't a valid IPv6 address.
   */
  static _ipIntFromString(ipStr: string): bigint {
    if (ipStr.trim().length === 0) {
      throw new AddressValueError("Address cannot be empty");
    }

    const parts = ipStr.split(":");

    // An IPv6 address needs at least 2 colons (3 parts).
    const _minParts = 3;

    if (parts.length < _minParts) {
      const msg = `At least ${_minParts} expected in '${ipStr}'`;
      throw new AddressValueError(msg);
    }

    // If the address has an IPv4-style suffix, convert it to hexadecimal.
    const lastItem = parts.length - 1;
    if (parts[lastItem].indexOf(".") !== -1) {
      let ipv4Int: IPv4Address["_ip"];
      try {
        const popped = parts.pop();
        if (popped === undefined) {
          throw new Error("Unexpected undefined part");
        }
        ipv4Int = new IPv4Address(popped)._ip;
        parts.push(
          ((BigInt(ipv4Int) >> BigInt(16)) & BigInt(0xffff)).toString(16)
        );
        parts.push((BigInt(ipv4Int) & BigInt(0xffff)).toString(16));
      } catch (err: unknown) {
        if (err instanceof AddressValueError) {
          throw new AddressValueError(`${err.message} in '${ipStr}'`);
        }
      }
    }

    // An IPv6 address can't have more than 8 colons (9 parts).
    // The extra colon comes from using the "::" notation for a single
    // leading or trailing zero part.
    const _maxParts = this._HEXTET_COUNT + 1;
    if (parts.length > _maxParts) {
      const msg = `At most ${_maxParts - 1} colons are permitted in '${ipStr}'`;
      throw new AddressValueError(msg);
    }

    // Disregarding the endpoints, find "::" with nothing in between.
    // This indicates that a run of zeroes has been skipped.
    let skipIndex: number | null = null;
    for (let i = 1; i < parts.length - 1; i++) {
      const element = parts[i];
      if (element.length === 0) {
        if (!isNull(skipIndex)) {
          // Can't have more than one "::"
          const msg = `At most one "::" permitted in '${ipStr}'`;
          throw new AddressValueError(msg);
        }
        skipIndex = i;
      }
    }

    let partsHi: number;
    let partsLo: number;
    let partsSkipped: number;
    // partsHi is the number of parts to copy from above/before the "::"
    // partsLo is the number of parts to copy from below/after the "::"
    if (!isNull(skipIndex)) {
      // If we found a "::", then check if it also covers the endpoints.
      partsHi = skipIndex;
      partsLo = parts.length - skipIndex - 1;
      if (parts[0].length === 0) {
        partsHi -= 1;
        if (partsHi) {
          const msg = `Leading ":" only permitted as part of "::" in '${ipStr}'`;
          throw new AddressValueError(msg); // ^: requires ^::
        }
      }

      const lastItem = parts.length - 1;
      if (parts[lastItem].length === 0) {
        partsLo -= 1;
        if (partsLo) {
          const msg = `Trailing ":" only permitted as part of "::" in '${ipStr}'`;
          throw new AddressValueError(msg); // :$ require ::$
        }
      }

      partsSkipped = this._HEXTET_COUNT - (partsHi + partsHi);
      if (partsSkipped < 1) {
        const msg = `Expected at most ${
          this._HEXTET_COUNT - 1
        } other parts with "::" in '${ipStr}'`;
        throw new AddressValueError(msg);
      }
    } else {
      // Otherwise, allocate the entire address to partsHi. The
      // endpoints could still be empty, but _parseHextet() will check
      // for that
      if (parts.length !== this._HEXTET_COUNT) {
        const msg = `Exactly ${this._HEXTET_COUNT} parts expected without "::" in '${ipStr}'`;
        throw new AddressValueError(msg);
      }

      if (parts[0].length === 0) {
        const msg = `Leading ":" only permitted as part of "::" in '${ipStr}'`;
        throw new AddressValueError(msg);
      }

      const lastItem = parts.length - 1;
      if (parts[lastItem].length === 0) {
        const msg = `Trailing ":" only permitted as part of "::" in '${ipStr}'`;
        throw new AddressValueError(msg);
      }

      partsHi = parts.length;
      partsLo = 0;
      partsSkipped = 0;
    }

    try {
      // now, parse the hextets into a 128-bit bigint.
      let ipInt = BigInt(0);
      for (let i = 0; i < partsHi; i++) {
        ipInt <<= BigInt(16);
        ipInt |= BigInt(this._parseHextet(parts[i]));
      }
      ipInt <<= BigInt(16) * BigInt(partsSkipped);
      for (let i = -partsLo; i < 0; i++) {
        ipInt <<= BigInt(16);
        ipInt |= BigInt(this._parseHextet(parts[i]));
      }
      return ipInt;
    } catch (err: unknown) {
      if (err instanceof Error) {
        throw new AddressValueError(`${err.message} in '${ipStr}'`);
      }
    }
    throw new Error("Unexpected error in _ipIntFromString");
  }

  /**
   * Convert an IPv6 hextet string into an integer
   * @param hextetStr A string, the number to parse.
   * @returns {number} The hextet as an integer.
   * @throws {Error} if the input isn't strictly a hex number from
   * [0..FFFF].
   */
  static _parseHextet(hextetStr: string): number {
    // Reject non-ascii digits.
    if (!isSuperset(this._HEX_DIGITS, hextetStr)) {
      throw new Error(`Only hex digits permitted in '${hextetStr}'`);
    }

    // We do the length check second, since the invalid character error
    // is likely to be more informative for the user
    if (hextetStr.length > 4) {
      const msg = `At most 4 characters permitted in '${hextetStr}'`;
      throw new Error(msg);
    }

    // Length check means we can skip checking the integer value
    const parsed = parseInt(hextetStr, 16);
    if (isNaN(parsed)) {
      throw new Error("Unexpected NaN in hextet str");
    }
    return parsed;
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
    let bestDoublecolonStart = -1;
    let bestDoublecolonLen = 0;
    let doublecolonStart = -1;
    let doubleColonLen = 0;

    for (let index = 0; index < hextets.length; index++) {
      const hextet = hextets[index];
      if (hextet === "0") {
        doubleColonLen += 1;
        if (doublecolonStart === -1) {
          // Start of a sequence of zeroes.
          doublecolonStart = index;
        }
        if (doubleColonLen > bestDoublecolonLen) {
          // This is the longest sequence of zeroes so far.
          bestDoublecolonLen = doubleColonLen;
          bestDoublecolonStart = doublecolonStart;
        }
      }
    }

    if (bestDoublecolonLen > 1) {
      const bestDoublecolonEnd = bestDoublecolonStart + bestDoublecolonLen;
      // For zeroes at the end of the address
      if (bestDoublecolonEnd === hextets.length) {
        hextets.push("");
      }
      hextets.splice(bestDoublecolonStart, bestDoublecolonEnd, "");
      // For zeroes at the beginning of the address.
      if (bestDoublecolonStart === 0) {
        hextets = [""].concat(hextets);
      }
    }
    return hextets;
  }

  /**
   * Turns a 128-bit integer into hexadecimal notation.
   * @param ipInt An integer, the IP address.
   * @returns {string} A string, the hexadecimal representation of the address.
   * @throws {Error} The address is bigger than 128 bits of all ones.
   */
  static _stringFromIpInt(ipInt: bigint): string {
    if (ipInt > this._ALL_ONES) {
      throw new Error("IPv6 Address is too large");
    }

    const hexStr = `${ipInt.toString(16)}${"0".repeat(32)}`.slice(0, 32);
    let hextets = [];
    for (let x = 0; x < 32; x + 4) {
      const hextet = parseInt(hexStr.slice(x, x + 4), 16).toString(16);
      hextets.push(hextet);
    }
    hextets = this._compressHextets(hextets);
    return hextets.join(":");
  }

  /**
   * Expand a shortened IPv6 address.
   * @returns {string} A string, the expanded IPv6 address.
   */
  _explodeShorthandIpString(): string {
    const ipStr = this.toString();

    const ipInt = IPv6Address._ipIntFromString(ipStr);
    const hexStr = `${ipInt.toString(16)}${"0".repeat(32)}`.slice(0, 32);
    const parts = [];
    for (let x = 0; x < 32; x + 4) {
      const part = hexStr.slice(x, x + 4);
      parts.push(part);
    }
    return parts.join(":");
  }

  /**
   * Return the reverse DNS pointer name for the IPv6 address.
   *
   * This implements the method described in RFC3596 2.5.
   */
  _reversePointer(): string {
    const reverseChars = this.exploded
      .split("")
      .reverse()
      .join("")
      .replace(":", ".");
    return `${reverseChars.split("").join(".")}.ip6.arpa`;
  }

  /**
   * Helper function to parse IPv6 string address scope id.
   *
   * See RFC 4007 for details.
   * @param ipStr A string, the IPv6 address.
   * @returns {[string, string | null]} [addr, scopeId] tuple.
   */
  static _splitScopeId(ipStr: string): [string, string | null] {
    const parts = ipStr.split("%");
    const addr = parts[0];
    const sep = ipStr.indexOf("%") !== -1;
    let scopeId = parts[1] || null;

    if (!sep) {
      scopeId = null;
    } else if (isNull(scopeId) || scopeId.indexOf("%") !== -1) {
      throw new AddressValueError(`Invalid IPv6 address: '${ipStr}'`);
    }
    return [addr, scopeId];
  }

  get maxPrefixlen(): 128 {
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
    return this._scopeId;
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
    if (BigInt(this._ip) >> BigInt(32) !== BigInt(0xffff)) {
      return null;
    }
    let initializer: bigint | number = BigInt(this._ip) & BigInt(0xffffffff);
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
  get teredo(): [IPv4Address, IPv4Address] | null {
    if (BigInt(this._ip) >> BigInt(96) !== BigInt(0x20010000)) {
      return null;
    }

    let serverInitializer: bigint | number =
      (BigInt(this._ip) >> BigInt(64)) & BigInt(0xffffffff);
    let clientInitializer: bigint | number =
      ~BigInt(this._ip) & BigInt(0xffffffff);
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
    if (BigInt(this._ip) >> BigInt(112) !== BigInt(0x2002)) {
      return null;
    }

    let initializer: bigint | number =
      (BigInt(this._ip) >> BigInt(80)) & BigInt(0xffffffff);
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
