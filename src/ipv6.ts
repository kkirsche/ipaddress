import type {
  AddressInput,
  NetmaskInput,
  NetworkInput,
  Prefixlen,
} from "./interfaces";
import { AddressValueError, ValueError } from "./errors";
import { IPV6LENGTH, IPV6_ALL_ONES } from "./constants";
import type {
  NotImplementedType,
  _NetworkConstants,
  _VersionInfo,
} from "./base";
import {
  NotImplemented,
  _BaseAddress,
  _BaseNetwork,
  _checkIntAddress,
  _checkPackedAddress,
  _classifyAddress,
  _makeNetmask,
  _prefixFromPrefixString,
  _splitAddrPrefix,
} from "./base";
import {
  codePoints,
  hex,
  intFromBytes,
  pyRepr,
  pySplit,
  reprValue,
  reverseString,
  v6IntToPacked,
} from "./utilities";
import { IPv4Address } from "./ipv4";

const _HEXTET_COUNT = 8;
const _HEX_DIGITS = new Set("0123456789ABCDEFabcdef");

/**
 * Convert an IPv6 hextet string into an integer.
 * @param hextetStr A string, the number to parse.
 * @returns {bigint} The hextet as an integer.
 * @throws {ValueError} if the input isn't strictly a hex number from
 * [0..FFFF].
 */
function _parseHextet(hextetStr: string): bigint {
  // Reject non-ASCII digits.
  if (!codePoints(hextetStr).every((c) => _HEX_DIGITS.has(c))) {
    throw new ValueError(`Only hex digits permitted in ${pyRepr(hextetStr)}`);
  }
  // We do the length check second, since the invalid character error
  // is likely to be more informative for the user
  if (hextetStr.length > 4) {
    throw new ValueError(
      `At most 4 characters permitted in ${pyRepr(hextetStr)}`
    );
  }
  if (hextetStr.length === 0) {
    throw new ValueError("invalid literal for int() with base 16: ''");
  }
  // Length check means we can skip checking the integer value
  return BigInt(`0x${hextetStr}`);
}

/**
 * Turn an IPv6 ipStr into an integer.
 * @param ipStr A string, the IPv6 ipStr.
 * @returns {bigint} The IPv6 address as an integer.
 * @throws {AddressValueError} if ipStr isn't a valid IPv6 Address.
 */
function _ipIntFromString(ipStr: string): bigint {
  if (!ipStr) {
    throw new AddressValueError("Address cannot be empty");
  }
  const chars = codePoints(ipStr);
  if (chars.length > 45) {
    let shorten = ipStr;
    if (chars.length > 100) {
      shorten = `${chars.slice(0, 45).join("")}(${
        chars.length - 90
      } chars elided)${chars.slice(-45).join("")}`;
    }
    throw new AddressValueError(
      `At most 45 characters expected in ${pyRepr(shorten)}`
    );
  }

  // We want to allow more parts than the max to be 'split'
  // to preserve the correct error message when there are
  // too many parts combined with '::'
  const _maxParts = _HEXTET_COUNT + 1;
  const parts = pySplit(ipStr, ":", _maxParts);

  // An IPv6 address needs at least 2 colons (3 parts).
  const _minParts = 3;
  if (parts.length < _minParts) {
    throw new AddressValueError(
      `At least ${_minParts} parts expected in ${pyRepr(ipStr)}`
    );
  }

  // If the address has an IPv4-style suffix, convert it to hexadecimal.
  if (parts[parts.length - 1].includes(".")) {
    let ipv4Int: bigint;
    try {
      ipv4Int = new IPv4Address(parts.pop() as string)._ip;
    } catch (err: unknown) {
      if (err instanceof AddressValueError) {
        throw new AddressValueError(`${err.message} in ${pyRepr(ipStr)}`);
      }
      throw err;
    }
    parts.push(((ipv4Int >> 16n) & 0xffffn).toString(16));
    parts.push((ipv4Int & 0xffffn).toString(16));
  }

  // An IPv6 address can't have more than 8 colons (9 parts).
  // The extra colon comes from using the "::" notation for a single
  // leading or trailing zero part.
  if (parts.length > _maxParts) {
    throw new AddressValueError(
      `At most ${_maxParts - 1} colons permitted in ${pyRepr(ipStr)}`
    );
  }

  // Disregarding the endpoints, find '::' with nothing in between.
  // This indicates that a run of zeroes has been skipped.
  let skipIndex: number | null = null;
  for (let i = 1; i < parts.length - 1; i++) {
    if (!parts[i]) {
      if (skipIndex !== null) {
        // Can't have more than one '::'
        throw new AddressValueError(
          `At most one '::' permitted in ${pyRepr(ipStr)}`
        );
      }
      skipIndex = i;
    }
  }

  // partsHi is the number of parts to copy from above/before the '::'
  // partsLo is the number of parts to copy from below/after the '::'
  let partsHi: number;
  let partsLo: number;
  let partsSkipped: number;
  if (skipIndex !== null) {
    // If we found a '::', then check if it also covers the endpoints.
    partsHi = skipIndex;
    partsLo = parts.length - skipIndex - 1;
    if (!parts[0]) {
      partsHi -= 1;
      if (partsHi) {
        // ^: requires ^::
        throw new AddressValueError(
          `Leading ':' only permitted as part of '::' in ${pyRepr(ipStr)}`
        );
      }
    }
    if (!parts[parts.length - 1]) {
      partsLo -= 1;
      if (partsLo) {
        // :$ requires ::$
        throw new AddressValueError(
          `Trailing ':' only permitted as part of '::' in ${pyRepr(ipStr)}`
        );
      }
    }
    partsSkipped = _HEXTET_COUNT - (partsHi + partsLo);
    if (partsSkipped < 1) {
      throw new AddressValueError(
        `Expected at most ${
          _HEXTET_COUNT - 1
        } other parts with '::' in ${pyRepr(ipStr)}`
      );
    }
  } else {
    // Otherwise, allocate the entire address to partsHi. The
    // endpoints could still be empty, but _parseHextet() will check
    // for that.
    if (parts.length !== _HEXTET_COUNT) {
      throw new AddressValueError(
        `Exactly ${_HEXTET_COUNT} parts expected without '::' in ${pyRepr(
          ipStr
        )}`
      );
    }
    if (!parts[0]) {
      // ^: requires ^::
      throw new AddressValueError(
        `Leading ':' only permitted as part of '::' in ${pyRepr(ipStr)}`
      );
    }
    if (!parts[parts.length - 1]) {
      // :$ requires ::$
      throw new AddressValueError(
        `Trailing ':' only permitted as part of '::' in ${pyRepr(ipStr)}`
      );
    }
    partsHi = parts.length;
    partsLo = 0;
    partsSkipped = 0;
  }

  try {
    // Now, parse the hextets into a 128-bit integer.
    let ipInt = 0n;
    for (let i = 0; i < partsHi; i++) {
      ipInt <<= 16n;
      ipInt |= _parseHextet(parts[i]);
    }
    ipInt <<= 16n * BigInt(partsSkipped);
    for (let i = -partsLo; i < 0; i++) {
      ipInt <<= 16n;
      ipInt |= _parseHextet(parts[parts.length + i]);
    }
    return ipInt;
  } catch (err: unknown) {
    if (err instanceof ValueError) {
      throw new AddressValueError(`${err.message} in ${pyRepr(ipStr)}`);
    }
    throw err;
  }
}

/**
 * Compresses a list of hextets.
 *
 * Compresses a list of strings, replacing the longest continuous
 * sequence of "0" in the list with "" and adding empty strings at
 * the beginning or at the end of the string such that subsequently
 * calling hextets.join(":") will produce the compressed version of
 * the IPv6 address.
 * @param hextets A list of strings, the hextets to compress.
 * @returns {string[]} A list of strings.
 */
function _compressHextets(hextets: string[]): string[] {
  let bestDoublecolonStart = -1;
  let bestDoublecolonLen = 0;
  let doublecolonStart = -1;
  let doublecolonLen = 0;
  hextets.forEach((hextet, index) => {
    if (hextet === "0") {
      doublecolonLen += 1;
      if (doublecolonStart === -1) {
        // Start of a sequence of zeros.
        doublecolonStart = index;
      }
      if (doublecolonLen > bestDoublecolonLen) {
        // This is the longest sequence of zeros so far.
        bestDoublecolonLen = doublecolonLen;
        bestDoublecolonStart = doublecolonStart;
      }
    } else {
      doublecolonLen = 0;
      doublecolonStart = -1;
    }
  });

  if (bestDoublecolonLen > 1) {
    const bestDoublecolonEnd = bestDoublecolonStart + bestDoublecolonLen;
    // For zeros at the end of the address.
    if (bestDoublecolonEnd === hextets.length) {
      hextets = [...hextets, ""];
    }
    hextets = [
      ...hextets.slice(0, bestDoublecolonStart),
      "",
      ...hextets.slice(bestDoublecolonEnd),
    ];
    // For zeros at the beginning of the address.
    if (bestDoublecolonStart === 0) {
      hextets = ["", ...hextets];
    }
  }
  return hextets;
}

/**
 * Turns a 128-bit integer into hexadecimal notation.
 * @param ipInt An integer, the IP address.
 * @returns {string} A string, the hexadecimal representation of the address.
 * @throws {ValueError} The address is bigger than 128 bits of all ones.
 */
function _stringFromIpInt(ipInt: bigint): string {
  if (ipInt > IPV6_ALL_ONES) {
    throw new ValueError("IPv6 address is too large");
  }
  const hexStr = hex(ipInt, 32);
  const hextets: string[] = [];
  for (let x = 0; x < 32; x += 4) {
    hextets.push(parseInt(hexStr.slice(x, x + 4), 16).toString(16));
  }
  return _compressHextets(hextets).join(":");
}

/** @internal */
export const _IPv6Info: _VersionInfo = {
  version: 6,
  maxPrefixlen: IPV6LENGTH,
  allOnes: IPV6_ALL_ONES,
  ipIntFromString: _ipIntFromString,
  stringFromIpInt: _stringFromIpInt,
};

const _netmaskCache = new Map<string, [IPv6Address, Prefixlen]>();

/**
 * Make a [netmask, prefixlen] tuple from the given argument.
 * @param arg Argument can be:
 * - an integer (the prefix length)
 * - a string representing the prefix length (e.g. "64")
 */
function _makeV6Netmask(arg: NetmaskInput): [IPv6Address, Prefixlen] {
  return _makeNetmask(
    _IPv6Info,
    _netmaskCache,
    arg,
    (netmaskStr) => _prefixFromPrefixString(_IPv6Info, netmaskStr),
    (ipInt) => new IPv6Address(ipInt)
  );
}

/**
 * Helper function to parse IPv6 string address with scope id.
 *
 * See RFC 4007 for details.
 * @param ipStr A string, the IPv6 address.
 * @returns {[string, string | null]} [addr, scopeId] tuple.
 */
function _splitScopeId(ipStr: string): [string, string | null] {
  const sep = ipStr.indexOf("%");
  if (sep === -1) {
    return [ipStr, null];
  }
  const scopeId = ipStr.slice(sep + 1);
  if (!scopeId || scopeId.includes("%")) {
    throw new AddressValueError(`Invalid IPv6 address: "${pyRepr(ipStr)}"`);
  }
  return [ipStr.slice(0, sep), scopeId];
}

/**
 * Expand a shortened IPv6 address.
 * @returns {string} A string, the expanded IPv6 address.
 */
function _explodeShorthandIpString(
  self: IPv6Address | IPv6Interface | IPv6Network
): string {
  let ipStr: string;
  if (self instanceof IPv6Network) {
    ipStr = self.networkAddress.toString();
  } else if (self instanceof IPv6Interface) {
    ipStr = self.ip.toString();
  } else {
    ipStr = _stringFromIpInt(self._ip);
  }

  const hexStr = hex(_ipIntFromString(ipStr), 32);
  let exploded = (hexStr.match(/.{4}/g) as string[]).join(":");
  if (self instanceof IPv6Network) {
    return `${exploded}/${self._prefixlen}`;
  }
  if (self._scopeId) {
    exploded = `${exploded}%${self._scopeId}`;
  }
  if (self instanceof IPv6Interface) {
    return `${exploded}/${self._prefixlen}`;
  }
  return exploded;
}

/**
 * Return the reverse DNS pointer name for the IPv6 address.
 *
 * This implements the method described in RFC3596 2.5.
 */
function _reversePointer(self: IPv6Address | IPv6Network): string {
  const reverseChars = reverseString(self.exploded).replace(/:/g, "");
  return `${codePoints(reverseChars).join(".")}.ip6.arpa`;
}

/**
 * Represent and manipulate single IPv6 Addresses.
 */
export class IPv6Address extends _BaseAddress {
  /** @internal */
  _scopeId: string | null;

  /**
   * Instantiate a new IPv6 address object.
   * @param address A string or integer representing the IP. Additionally,
   * an integer can be passed, so
   * new IPv6Address('2001:db8::') ==
   *   new IPv6Address(42540766411282592856903984951653826560n)
   * or, more generally
   * new IPv6Address(new IPv6Address('2001:db8::').toNumber()) ==
   *   new IPv6Address('2001:db8::')
   * Packed bytes (a Uint8Array of length 16) are also accepted.
   * @throws {AddressValueError} If address isn't a valid IPv6 address.
   */
  constructor(address: AddressInput) {
    super();
    const parsed = _classifyAddress(address);

    // Efficient constructor from integer.
    if (parsed.kind === "int") {
      _checkIntAddress(_IPv6Info, parsed.value);
      this._ip = parsed.value;
      this._scopeId = null;
      return;
    }

    // Constructing from a packed address
    if (parsed.kind === "bytes") {
      _checkPackedAddress(_IPv6Info, parsed.value, 16);
      this._ip = intFromBytes(parsed.value, "big");
      this._scopeId = null;
      return;
    }

    // Assume input argument to be string or any object representation
    // which converts into a formatted IP string.
    if (parsed.value.includes("/")) {
      throw new AddressValueError(`Unexpected '/' in ${reprValue(address)}`);
    }
    const [addrStr, scopeId] = _splitScopeId(parsed.value);
    this._scopeId = scopeId;
    this._ip = _ipIntFromString(addrStr);
  }

  /** @internal */
  get _info(): _VersionInfo {
    return _IPv6Info;
  }

  get version(): 6 {
    return 6;
  }

  get maxPrefixlen(): 128 {
    return 128;
  }

  toNumber(): bigint {
    return this._ip;
  }

  /** @internal */
  _explodeShorthandIpString(): string {
    const ipv4Mapped = this.ipv4Mapped;
    if (ipv4Mapped === null) {
      return _explodeShorthandIpString(this);
    }
    const prefixLen = 30;
    const rawExplodedStr = _explodeShorthandIpString(this);
    return `${rawExplodedStr.slice(0, prefixLen)}${ipv4Mapped.toString()}`;
  }

  /** @internal */
  _reversePointer(): string {
    const ipv4Mapped = this.ipv4Mapped;
    if (ipv4Mapped === null) {
      return _reversePointer(this);
    }
    const prefixLen = 30;
    const rawExplodedStr = _explodeShorthandIpString(this).slice(0, prefixLen);
    // ipv4 encoded using hexadecimal nibbles instead of decimals
    const ipv4Int = ipv4Mapped._ip;
    const reverseChars = reverseString(
      `${rawExplodedStr}${hex(ipv4Int, 8)}`
    ).replace(/:/g, "");
    return `${codePoints(reverseChars).join(".")}.ip6.arpa`;
  }

  /**
   * Return convenient text representation of IPv4-mapped IPv6 address.
   *
   * See RFC 4291 2.5.5.2, 2.2 p.3 for details.
   * @returns {string} A string, 'x:x:x:x:x:x:d.d.d.d', where the 'x's are the
   * hexadecimal values of the six high-order 16-bit pieces of the address,
   * and the 'd's are the decimal values of the four low-order 8-bit pieces of
   * the address (standard IPv4 representation) as defined in RFC 4291 2.2 p.3.
   */
  private _ipv4MappedIpv6ToStr(): string {
    const ipv4Mapped = this.ipv4Mapped;
    if (ipv4Mapped === null) {
      throw new AddressValueError(
        `Can not apply to non-IPv4-mapped IPv6 address ${this.toString()}`
      );
    }
    const highOrderBits = this._ip >> 32n;
    return `${_stringFromIpInt(highOrderBits)}:${ipv4Mapped.toString()}`;
  }

  toString(): string {
    const ipStr =
      this.ipv4Mapped === null
        ? _stringFromIpInt(this._ip)
        : this._ipv4MappedIpv6ToStr();
    return this._scopeId ? `${ipStr}%${this._scopeId}` : ipStr;
  }

  /** @internal */
  _eq(other: unknown): boolean | NotImplementedType {
    const addressEqual = super._eq(other);
    if (addressEqual === NotImplemented) {
      return NotImplemented;
    }
    if (!addressEqual) {
      return false;
    }
    const otherScopeId = other instanceof IPv6Address ? other._scopeId : null;
    return this._scopeId === otherScopeId;
  }

  /**
   * Identifier of a particular zone of the address's scope.
   *
   * See RFC 4007 for details.
   * @returns {string | null} A string identifying the zone of the address if
   * specified, else null.
   */
  get scopeId(): string | null {
    return this._scopeId;
  }

  /**
   * The binary representation of this address.
   */
  get packed(): Uint8Array {
    return v6IntToPacked(this._ip);
  }

  /**
   * Test if the address is reserved for multicast use.
   * @returns {boolean} True if the address is a multicast address.
   * See RFC 2373 2.7 for details.
   */
  get isMulticast(): boolean {
    const ipv4Mapped = this.ipv4Mapped;
    if (ipv4Mapped !== null) {
      return ipv4Mapped.isMulticast;
    }
    return _IPv6Constants().multicastNetwork.contains(this);
  }

  /**
   * Test if the address is otherwise IETF reserved.
   * @returns {boolean} True if the address is within one of the reserved
   * IPv6 Network ranges.
   */
  get isReserved(): boolean {
    const ipv4Mapped = this.ipv4Mapped;
    if (ipv4Mapped !== null) {
      return ipv4Mapped.isReserved;
    }
    return _IPv6Constants().reservedNetworks.some((x) => x.contains(this));
  }

  /**
   * Test if the address is reserved for link-local.
   * @returns {boolean} True if the address is reserved per RFC 4291.
   */
  get isLinkLocal(): boolean {
    const ipv4Mapped = this.ipv4Mapped;
    if (ipv4Mapped !== null) {
      return ipv4Mapped.isLinkLocal;
    }
    return _IPv6Constants().linklocalNetwork.contains(this);
  }

  /**
   * Test if the address is reserved for site-local.
   *
   * Note that the site-local address space has been deprecated by RFC 3879.
   * Use isPrivate to test if this address is in the space of unique local
   * addresses as defined by RFC 4193.
   * @returns {boolean} True if the address is reserved per RFC 3513 2.5.6.
   */
  get isSiteLocal(): boolean {
    return _IPv6Constants().sitelocalNetwork.contains(this);
  }

  /**
   * True if the address is defined as not globally reachable by
   * iana-ipv6-special-registry. For IPv4-mapped IPv6-addresses the value is
   * determined by the semantics of the underlying IPv4 addresses, so
   * address.isPrivate === address.ipv4Mapped.isPrivate.
   */
  get isPrivate(): boolean {
    const ipv4Mapped = this.ipv4Mapped;
    if (ipv4Mapped !== null) {
      return ipv4Mapped.isPrivate;
    }
    const constants = _IPv6Constants();
    return (
      constants.privateNetworks.some((net) => net.contains(this)) &&
      constants.privateNetworksExceptions.every((net) => !net.contains(this))
    );
  }

  /**
   * True if the address is defined as globally reachable by
   * iana-ipv6-special-registry. For IPv4-mapped IPv6-addresses the value is
   * determined by the semantics of the underlying IPv4 addresses, so
   * address.isGlobal === address.ipv4Mapped.isGlobal.
   */
  get isGlobal(): boolean {
    const ipv4Mapped = this.ipv4Mapped;
    if (ipv4Mapped !== null) {
      return ipv4Mapped.isGlobal;
    }
    return !this.isPrivate;
  }

  /**
   * Test if the address is unspecified.
   * @returns {boolean} True if this is the unspecified address as defined in
   * RFC 2373 2.5.2.
   */
  get isUnspecified(): boolean {
    const ipv4Mapped = this.ipv4Mapped;
    if (ipv4Mapped !== null) {
      return ipv4Mapped.isUnspecified;
    }
    return this._ip === 0n;
  }

  /**
   * Test if the address is a loopback address.
   * @returns {boolean} True if the address is a loopback address as defined
   * in RFC 2373 2.5.3.
   */
  get isLoopback(): boolean {
    const ipv4Mapped = this.ipv4Mapped;
    if (ipv4Mapped !== null) {
      return ipv4Mapped.isLoopback;
    }
    return this._ip === 1n;
  }

  /**
   * Return the IPv4 mapped address.
   * @returns {IPv4Address | null} If the IPv6 address is a v4 mapped address,
   * return the IPv4 mapped address. Return null otherwise.
   */
  get ipv4Mapped(): IPv4Address | null {
    if (this._ip >> 32n !== 0xffffn) {
      return null;
    }
    return new IPv4Address(this._ip & 0xffffffffn);
  }

  /**
   * Tuple of embedded teredo IPs.
   * @returns {[IPv4Address, IPv4Address] | null} Tuple of the [server, client]
   * IPs or null if the address doesn't appear to be a teredo address (doesn't
   * start with 2001::/32)
   */
  get teredo(): [IPv4Address, IPv4Address] | null {
    if (this._ip >> 96n !== 0x20010000n) {
      return null;
    }
    return [
      new IPv4Address((this._ip >> 64n) & 0xffffffffn),
      new IPv4Address(~this._ip & 0xffffffffn),
    ];
  }

  /**
   * Return the IPv4 6to4 embedded address.
   * @returns {IPv4Address | null} The IPv4 6to4-embedded address if present
   * or null if the address doesn't appear to contain a 6to4 embedded address.
   */
  get sixtofour(): IPv4Address | null {
    if (this._ip >> 112n !== 0x2002n) {
      return null;
    }
    return new IPv4Address((this._ip >> 80n) & 0xffffffffn);
  }
}

/**
 * An IPv6 address associated with the network it is on, e.g.
 * 2001:db8::5/64.
 */
export class IPv6Interface extends IPv6Address {
  network: IPv6Network;
  netmask: IPv6Address;
  /** @internal */
  _prefixlen: Prefixlen;
  private _cachedHostmask?: IPv6Address;

  constructor(address: NetworkInput) {
    const [addr, mask] = _splitAddrPrefix(address, IPV6LENGTH);
    super(addr);
    this.network = new IPv6Network([addr, mask], false);
    this.netmask = this.network.netmask;
    this._prefixlen = this.network._prefixlen;
  }

  get hostmask(): IPv6Address {
    this._cachedHostmask ??= this.network.hostmask;
    return this._cachedHostmask;
  }

  toString(): string {
    return `${super.toString()}/${this._prefixlen}`;
  }

  /** @internal */
  _eq(other: unknown): boolean | NotImplementedType {
    const addressEqual = super._eq(other);
    if (addressEqual === NotImplemented || !addressEqual) {
      return addressEqual;
    }
    if (!(other instanceof IPv6Interface)) {
      // An interface with an associated network is NOT the
      // same as an unassociated address.
      return false;
    }
    return this.network.equals(other.network);
  }

  /** @internal */
  _lt(other: unknown): boolean | NotImplementedType {
    const addressLess = super._lt(other);
    if (addressLess === NotImplemented) {
      return NotImplemented;
    }
    if (!(other instanceof IPv6Interface)) {
      // We *do* allow addresses and interfaces to be sorted. The
      // unassociated address is considered less than all interfaces.
      return false;
    }
    return (
      this.network.lessThan(other.network) ||
      (this.network.equals(other.network) && addressLess)
    );
  }

  get ip(): IPv6Address {
    return new IPv6Address(this._ip);
  }

  get withPrefixlen(): string {
    return `${_stringFromIpInt(this._ip)}/${this._prefixlen}`;
  }

  get withNetmask(): string {
    return `${_stringFromIpInt(this._ip)}/${this.netmask.toString()}`;
  }

  get withHostmask(): string {
    return `${_stringFromIpInt(this._ip)}/${this.hostmask.toString()}`;
  }

  get isUnspecified(): boolean {
    return this._ip === 0n && this.network.isUnspecified;
  }

  get isLoopback(): boolean {
    return super.isLoopback && this.network.isLoopback;
  }
}

/**
 * This class represents and manipulates 128-bit IPv6 networks.
 *
 * Attributes: [examples for IPv6Network('2001:db8::1000/124')]
 *   .networkAddress: IPv6Address('2001:db8::1000')
 *   .hostmask: IPv6Address('::f')
 *   .broadcastAddress: IPv6Address('2001:db8::100f')
 *   .netmask: IPv6Address('ffff:ffff:ffff:ffff:ffff:ffff:ffff:fff0')
 *   .prefixlen: 124
 */
export class IPv6Network extends _BaseNetwork<IPv6Address> {
  /**
   * Instantiate a new IPv6 Network object.
   * @param address A string or integer representing the IPv6 network or the
   * IP and prefix/netmask.
   * '2001:db8::/128'
   * '2001:db8:0000:0000:0000:0000:0000:0000/128'
   * '2001:db8::'
   * are all functionally the same in IPv6. That is to say, failing to
   * provide a subnetmask will create an object with a mask of /128.
   *
   * Additionally, an integer, packed bytes or an [address, mask] tuple can
   * be passed, so
   * new IPv6Network('2001:db8::') ==
   *   new IPv6Network(42540766411282592856903984951653826560n)
   * @param strict If true, ensure that we have been passed a true network
   * address, e.g. 2001:db8::1000/124 and not an IP address on a network,
   * e.g. 2001:db8::1/124.
   * @throws {AddressValueError} If address isn't a valid IPv6 address.
   * @throws {NetmaskValueError} If the netmask isn't valid for an IPv6
   * address.
   * @throws {ValueError} If strict was true and a network address was not
   * supplied.
   */
  constructor(address: NetworkInput, strict = true) {
    super(address, strict, _IPv6Info);
  }

  /** @internal */
  _addressClass(ipInt: bigint): IPv6Address {
    return new IPv6Address(ipInt);
  }

  /** @internal */
  _parseAddress(address: AddressInput): IPv6Address {
    return new IPv6Address(address);
  }

  /** @internal */
  _makeNetmask(mask: NetmaskInput): [IPv6Address, Prefixlen] {
    return _makeV6Netmask(mask);
  }

  /** @internal */
  get _constants(): _NetworkConstants<IPv6Network> {
    return _IPv6Constants();
  }

  get version(): 6 {
    return 6;
  }

  get maxPrefixlen(): 128 {
    return 128;
  }

  get numAddresses(): bigint {
    return this._numAddresses;
  }

  /** @internal */
  _explodeShorthandIpString(): string {
    return _explodeShorthandIpString(this);
  }

  /** @internal */
  _reversePointer(): string {
    return _reversePointer(this);
  }

  /**
   * Generate iterator over usable hosts in a network.
   *
   * This is like iterating over the network except it doesn't return the
   * Subnet-Router anycast address.
   * @internal
   */
  *_hostsRange(): Generator<IPv6Address, void, undefined> {
    const network = this.networkAddress._ip;
    const broadcast = this.broadcastAddress._ip;
    for (let x = network + 1n; x <= broadcast; x++) {
      yield this._addressClass(x);
    }
  }

  /**
   * Test if the address is reserved for site-local.
   *
   * Note that the site-local address space has been deprecated by RFC 3879.
   * Use isPrivate to test if this address is in the space of unique local
   * addresses as defined by RFC 4193.
   * @returns {boolean} True if the address is reserved per RFC 3513 2.5.6.
   */
  get isSiteLocal(): boolean {
    return this.networkAddress.isSiteLocal && this.broadcastAddress.isSiteLocal;
  }
}

interface _IPv6ConstantsT extends _NetworkConstants<IPv6Network> {
  readonly linklocalNetwork: IPv6Network;
  readonly multicastNetwork: IPv6Network;
  readonly reservedNetworks: readonly IPv6Network[];
  readonly sitelocalNetwork: IPv6Network;
}

let _constants: _IPv6ConstantsT | undefined;

// The constants are built lazily, rather than when this module is loaded, so
// that the circular imports between the IPv4 and IPv6 modules are safe.
function _IPv6Constants(): _IPv6ConstantsT {
  _constants ??= {
    linklocalNetwork: new IPv6Network("fe80::/10"),
    multicastNetwork: new IPv6Network("ff00::/8"),
    // Not globally reachable address blocks listed on
    // https://www.iana.org/assignments/iana-ipv6-special-registry/iana-ipv6-special-registry.xhtml
    privateNetworks: [
      new IPv6Network("::1/128"),
      new IPv6Network("::/128"),
      new IPv6Network("::ffff:0:0/96"),
      new IPv6Network("64:ff9b:1::/48"),
      new IPv6Network("100::/64"),
      new IPv6Network("2001::/23"),
      new IPv6Network("2001:db8::/32"),
      // IANA says N/A, let's consider it not globally reachable to be safe
      new IPv6Network("2002::/16"),
      // RFC 9637: https://www.rfc-editor.org/rfc/rfc9637.html#section-6-2.2
      new IPv6Network("3fff::/20"),
      new IPv6Network("fc00::/7"),
      new IPv6Network("fe80::/10"),
    ],
    privateNetworksExceptions: [
      new IPv6Network("2001:1::1/128"),
      new IPv6Network("2001:1::2/128"),
      new IPv6Network("2001:3::/32"),
      new IPv6Network("2001:4:112::/48"),
      new IPv6Network("2001:20::/28"),
      new IPv6Network("2001:30::/28"),
    ],
    reservedNetworks: [
      new IPv6Network("::/8"),
      new IPv6Network("100::/8"),
      new IPv6Network("200::/7"),
      new IPv6Network("400::/6"),
      new IPv6Network("800::/5"),
      new IPv6Network("1000::/4"),
      new IPv6Network("4000::/3"),
      new IPv6Network("6000::/3"),
      new IPv6Network("8000::/3"),
      new IPv6Network("A000::/3"),
      new IPv6Network("C000::/3"),
      new IPv6Network("E000::/4"),
      new IPv6Network("F000::/5"),
      new IPv6Network("F800::/6"),
      new IPv6Network("FE00::/9"),
    ],
    sitelocalNetwork: new IPv6Network("fec0::/10"),
  };
  return _constants;
}
