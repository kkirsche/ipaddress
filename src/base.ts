import {
  AddressInput,
  NetmaskInput,
  NetworkInput,
  Prefixlen,
  PrefixOptions,
} from "./interfaces";
import { AddressValueError, NetmaskValueError, ValueError } from "./errors";
import {
  _countRighthandZeroBits,
  _splitOptionalNetmask,
  bytesRepr,
  formatString,
  intToBytes,
  pyRepr,
  reprValue,
  strIsAscii,
  strIsDigit,
  typeName,
} from "./utilities";

/**
 * Equivalent of Python's NotImplemented singleton. Returned by
 * getMixedTypeKey for unsupported objects, and used internally to emulate
 * Python's binary comparison dispatch.
 */
export const NotImplemented: unique symbol = Symbol("NotImplemented");
export type NotImplementedType = typeof NotImplemented;

type CompareOp = "==" | "!=" | "<" | "<=" | ">" | ">=";

const REFLECTED: Record<CompareOp, CompareOp> = {
  "==": "==",
  "!=": "!=",
  "<": ">",
  ">": "<",
  "<=": ">=",
  ">=": "<=",
};

/**
 * Emulates Python's rich comparison dispatch (`a < b`, `a == b`, ...),
 * including trying the reflected operation of the right operand first when it
 * is an instance of a subclass of the left operand's class.
 */
function richCompare(a: _IPAddressBase, b: unknown, op: CompareOp): boolean {
  const reflected = REFLECTED[op];
  let checkedReverse = false;
  if (
    b instanceof _IPAddressBase &&
    b.constructor !== a.constructor &&
    b instanceof a.constructor
  ) {
    checkedReverse = true;
    const result = b._compare(a, reflected);
    if (result !== NotImplemented) {
      return result;
    }
  }
  const result = a._compare(b, op);
  if (result !== NotImplemented) {
    return result;
  }
  if (!checkedReverse && b instanceof _IPAddressBase) {
    const reflectedResult = b._compare(a, reflected);
    if (reflectedResult !== NotImplemented) {
      return reflectedResult;
    }
  }
  if (op === "==") {
    return a === b;
  }
  if (op === "!=") {
    return a !== b;
  }
  throw new TypeError(
    `'${op}' not supported between instances of '${typeName(
      a
    )}' and '${typeName(b)}'`
  );
}

/**
 * The version specific (IPv4 or IPv6) parameters and parsers shared by
 * addresses, interfaces and networks of that version.
 */
export interface _VersionInfo {
  readonly version: 4 | 6;
  readonly maxPrefixlen: number;
  readonly allOnes: bigint;
  ipIntFromString(ipStr: string): bigint;
  stringFromIpInt(ipInt: bigint): string;
}

export function _checkIntAddress(info: _VersionInfo, address: bigint): void {
  if (address < 0n) {
    throw new AddressValueError(
      `${address} (< 0) is not permitted as an IPv${info.version} address`
    );
  }
  if (address > info.allOnes) {
    throw new AddressValueError(
      `${address} (>= 2**${info.maxPrefixlen}) is not permitted as an IPv${info.version} address`
    );
  }
}

export function _checkPackedAddress(
  info: _VersionInfo,
  address: Uint8Array,
  expectedLen: number
): void {
  const addressLen = address.length;
  if (addressLen !== expectedLen) {
    throw new AddressValueError(
      `${bytesRepr(
        address
      )} (len ${addressLen} != ${expectedLen}) is not permitted as an IPv${
        info.version
      } address`
    );
  }
}

/**
 * Determine how an address constructor argument should be interpreted,
 * mirroring Python's isinstance(address, int) / isinstance(address, bytes)
 * checks, with every other value converted to a string.
 */
export function _classifyAddress(
  address: unknown
):
  | { kind: "int"; value: bigint }
  | { kind: "bytes"; value: Uint8Array }
  | { kind: "str"; value: string } {
  if (typeof address === "bigint") {
    return { kind: "int", value: address };
  }
  if (typeof address === "number" && Number.isInteger(address)) {
    return { kind: "int", value: BigInt(address) };
  }
  if (address instanceof Uint8Array) {
    return { kind: "bytes", value: address };
  }
  // Python converts tuples with str(), which matches their repr()
  const value = Array.isArray(address) ? reprValue(address) : String(address);
  return { kind: "str", value };
}

/**
 * Turn the prefix length into a bitwise netmask.
 * @param info The IP version parameters.
 * @param prefixlen An integer, the prefix length.
 * @returns {bigint} The netmask as an integer.
 */
export function _ipIntFromPrefix(
  info: _VersionInfo,
  prefixlen: Prefixlen
): bigint {
  return info.allOnes ^ (info.allOnes >> BigInt(prefixlen));
}

/**
 * Return prefix length from the bitwise netmask.
 * @param info The IP version parameters.
 * @param ipInt An integer, the netmask in expanded bitwise format.
 * @returns {Prefixlen} An integer, the prefix length.
 * @throws {ValueError} If the input intermingles zeroes & ones.
 */
export function _prefixFromIpInt(info: _VersionInfo, ipInt: bigint): Prefixlen {
  const trailingZeroes = _countRighthandZeroBits(ipInt, info.maxPrefixlen);
  const prefixlen = info.maxPrefixlen - trailingZeroes;
  const leadingOnes = ipInt >> BigInt(trailingZeroes);
  const allOnes = (1n << BigInt(prefixlen)) - 1n;
  if (leadingOnes !== allOnes) {
    const details = intToBytes(ipInt, Math.floor(info.maxPrefixlen / 8), "big");
    throw new ValueError(
      `Netmask pattern ${bytesRepr(details)} mixes zeroes & ones`
    );
  }
  return prefixlen;
}

export function _reportInvalidNetmask(netmask: unknown): never {
  throw new NetmaskValueError(`${reprValue(netmask)} is not a valid netmask`);
}

/**
 * Return prefix length from a numeric string.
 * @param info The IP version parameters.
 * @param prefixlenStr The string to be converted.
 * @returns {Prefixlen} An integer, the prefix length.
 * @throws {NetmaskValueError} If the input is not a valid netmask.
 */
export function _prefixFromPrefixString(
  info: _VersionInfo,
  prefixlenStr: string
): Prefixlen {
  // parseInt allows leading +/- as well as surrounding whitespace,
  // so we ensure that isn't the case
  if (!(strIsAscii(prefixlenStr) && strIsDigit(prefixlenStr))) {
    _reportInvalidNetmask(prefixlenStr);
  }
  const prefixlen = parseInt(prefixlenStr, 10);
  if (!(0 <= prefixlen && prefixlen <= info.maxPrefixlen)) {
    _reportInvalidNetmask(prefixlenStr);
  }
  return prefixlen;
}

/**
 * Turn a netmask/hostmask string into a prefix length.
 * @param info The IP version parameters.
 * @param ipStr The netmask/hostmask to be converted.
 * @returns {Prefixlen} An integer, the prefix length.
 * @throws {NetmaskValueError} If the input is not a valid netmask/hostmask.
 */
export function _prefixFromIpString(
  info: _VersionInfo,
  ipStr: string
): Prefixlen {
  // Parse the netmask/hostmask like an IP address.
  let ipInt: bigint;
  try {
    ipInt = info.ipIntFromString(ipStr);
  } catch (err: unknown) {
    if (err instanceof AddressValueError) {
      _reportInvalidNetmask(ipStr);
    }
    throw err;
  }

  // Try matching a netmask (this would be /1*0*/ as a bitwise regexp).
  // Note that the two ambiguous cases (all-ones and all-zeroes) are
  // treated as netmasks.
  try {
    return _prefixFromIpInt(info, ipInt);
  } catch (err: unknown) {
    if (!(err instanceof ValueError)) {
      throw err;
    }
  }

  // Invert the bits, and try matching a /0+1+/ hostmask instead.
  ipInt ^= info.allOnes;
  try {
    return _prefixFromIpInt(info, ipInt);
  } catch (err: unknown) {
    if (err instanceof ValueError) {
      _reportInvalidNetmask(ipStr);
    }
    throw err;
  }
}

/**
 * Make a [netmask, prefixlen] tuple from the given argument, caching the
 * result.
 * @param info The IP version parameters.
 * @param cache The netmask cache for this IP version.
 * @param arg Argument can be:
 * - an integer (the prefix length)
 * - a string representing the prefix length (e.g. "24")
 * - a string representing the prefix netmask (e.g. "255.255.255.0"), when
 *   `parseString` supports it
 * @param parseString Converts a string argument to a prefix length.
 * @param makeAddress Builds the netmask address from an integer.
 */
export function _makeNetmask<A>(
  info: _VersionInfo,
  cache: Map<string, [A, Prefixlen]>,
  arg: NetmaskInput,
  parseString: (arg: string) => Prefixlen,
  makeAddress: (ipInt: bigint) => A
): [A, Prefixlen] {
  const isInt =
    typeof arg === "bigint" ||
    (typeof arg === "number" && Number.isInteger(arg));
  const key = `${isInt ? "int" : "str"}:${String(arg)}`;
  let result = cache.get(key);
  if (result === undefined) {
    let prefixlen: Prefixlen;
    if (isInt) {
      if (!(0 <= arg && arg <= info.maxPrefixlen)) {
        _reportInvalidNetmask(arg);
      }
      prefixlen = Number(arg);
    } else {
      prefixlen = parseString(String(arg));
    }
    result = [makeAddress(_ipIntFromPrefix(info, prefixlen)), prefixlen];
    cache.set(key, result);
  }
  return result;
}

/**
 * Helper function to parse address of Network/Interface.
 * @param address Argument of Network/Interface.
 * @param maxPrefixlen The prefix length to use when no mask is given.
 * @returns {[AddressInput, NetmaskInput]} [addr, prefix] tuple
 */
export function _splitAddrPrefix(
  address: NetworkInput,
  maxPrefixlen: number
): [AddressInput, NetmaskInput] {
  // a packed address or integer
  const classified = _classifyAddress(address);
  if (classified.kind !== "str") {
    return [classified.value, maxPrefixlen];
  }
  // Constructing from a tuple (addr, [mask])
  let parts: unknown[];
  if (Array.isArray(address)) {
    parts = address;
  } else {
    // Assume input argument to be string or any object representation
    // which converts into a formatted IP prefix string.
    parts = _splitOptionalNetmask(address);
  }
  if (parts.length > 2) {
    throw new ValueError(
      `too many values to unpack (expected 2, got ${parts.length})`
    );
  }
  if (parts.length === 0) {
    throw new RangeError("tuple index out of range");
  }
  if (parts.length > 1) {
    return [parts[0] as AddressInput, parts[1] as NetmaskInput];
  }
  return [parts[0] as AddressInput, maxPrefixlen];
}

function _toInt(other: unknown, op: string, self: _IPAddressBase): bigint {
  if (typeof other === "bigint") {
    return other;
  }
  if (typeof other === "number" && Number.isInteger(other)) {
    return BigInt(other);
  }
  throw new TypeError(
    `unsupported operand type(s) for ${op}: '${typeName(self)}' and '${typeName(
      other
    )}'`
  );
}

/**
 * The mother class.
 */
export abstract class _IPAddressBase {
  abstract get version(): 4 | 6;

  abstract get maxPrefixlen(): number;

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
   * ipAddress("127.0.0.1").reversePointer
   * '1.0.0.127.in-addr.arpa'
   * ipAddress("2001:db8::1").reversePointer
   * '1.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.8.b.d.0.1.0.0.2.ip6.arpa'
   */
  get reversePointer(): string {
    return this._reversePointer();
  }

  /** @internal */
  abstract _explodeShorthandIpString(): string;

  /** @internal */
  abstract _reversePointer(): string;

  abstract toString(): string;

  /**
   * Equivalent of Python's repr(), e.g. "IPv4Address('192.0.2.1')".
   */
  toRepr(): string {
    return `${this.constructor.name}(${pyRepr(this.toString())})`;
  }

  /**
   * Python's __eq__. Returns NotImplemented when the comparison is not
   * supported by this object.
   * @internal
   */
  abstract _eq(other: unknown): boolean | NotImplementedType;

  /**
   * Python's __lt__. Returns NotImplemented when the comparison is not
   * supported by this object.
   * @internal
   */
  abstract _lt(other: unknown): boolean | NotImplementedType;

  /**
   * The comparison methods of this object, with the remaining orderings
   * derived from __lt__ and __eq__ as Python's functools.total_ordering does.
   * @internal
   */
  _compare(other: unknown, op: CompareOp): boolean | NotImplementedType {
    switch (op) {
      case "==":
        return this._eq(other);
      case "!=": {
        const result = this._eq(other);
        return result === NotImplemented ? result : !result;
      }
      case "<":
        return this._lt(other);
      case ">": {
        const result = this._lt(other);
        if (result === NotImplemented) {
          return result;
        }
        return !result && richCompare(this, other, "!=");
      }
      case "<=": {
        const result = this._lt(other);
        if (result === NotImplemented) {
          return result;
        }
        return result || richCompare(this, other, "==");
      }
      case ">=": {
        const result = this._lt(other);
        return result === NotImplemented ? result : !result;
      }
    }
  }

  /** Equivalent of Python's `self == other`. */
  equals(other: unknown): boolean {
    return richCompare(this, other, "==");
  }

  /** Equivalent of Python's `self < other`. */
  lessThan(other: unknown): boolean {
    return richCompare(this, other, "<");
  }

  /** Equivalent of Python's `self <= other`. */
  lessThanOrEqual(other: unknown): boolean {
    return richCompare(this, other, "<=");
  }

  /** Equivalent of Python's `self > other`. */
  greaterThan(other: unknown): boolean {
    return richCompare(this, other, ">");
  }

  /** Equivalent of Python's `self >= other`. */
  greaterThanOrEqual(other: unknown): boolean {
    return richCompare(this, other, ">=");
  }
}

/**
 * A generic IP object.
 *
 * This IP class contains the version independent methods which are
 * used by single IP addresses.
 */
export abstract class _BaseAddress extends _IPAddressBase {
  /** @internal */
  _ip!: bigint;

  /** @internal */
  abstract get _info(): _VersionInfo;

  /**
   * The binary representation of this address.
   */
  abstract get packed(): Uint8Array;

  abstract get isMulticast(): boolean;
  abstract get isPrivate(): boolean;
  abstract get isGlobal(): boolean;
  abstract get isReserved(): boolean;
  abstract get isLoopback(): boolean;
  abstract get isLinkLocal(): boolean;
  abstract get isUnspecified(): boolean;

  /**
   * Equivalent of Python's int(address).
   */
  abstract toNumber(): number | bigint;

  /** @internal */
  _eq(other: unknown): boolean | NotImplementedType {
    if (!(other instanceof _BaseAddress)) {
      return NotImplemented;
    }
    return this._ip === other._ip && this.version === other.version;
  }

  /** @internal */
  _lt(other: unknown): boolean | NotImplementedType {
    if (!(other instanceof _BaseAddress)) {
      return NotImplemented;
    }
    if (this.version !== other.version) {
      throw new TypeError(`${this} and ${other} are not of the same version`);
    }
    return this._ip < other._ip;
  }

  // Shorthand for Integer addition and subtraction. This is not
  // meant to ever support addition/subtraction of addresses.

  /**
   * Equivalent of Python's `address + n`.
   * @param other An integer to add to this address.
   * @returns A new object of the same class.
   */
  add(other: number | bigint): this {
    const n = _toInt(other, "+", this);
    return new (this.constructor as new (address: bigint) => this)(
      this._ip + n
    );
  }

  /**
   * Equivalent of Python's `address - n`.
   * @param other An integer to subtract from this address.
   * @returns A new object of the same class.
   */
  sub(other: number | bigint): this {
    const n = _toInt(other, "-", this);
    return new (this.constructor as new (address: bigint) => this)(
      this._ip - n
    );
  }

  toString(): string {
    return this._info.stringFromIpInt(this._ip);
  }

  /** @internal */
  _getAddressKey(): [4 | 6, this] {
    return [this.version, this];
  }

  /**
   * Returns an IP address as a formatted string, the equivalent of Python's
   * format(address, fmt).
   *
   * Supported presentation types are:
   * 's': returns the IP address as a string (default)
   * 'b': converts to binary and returns a zero-padded string
   * 'X' or 'x': converts to upper- or lower-case hex and returns a zero-padded string
   * 'n': the same as 'b' for IPv4 and 'x' for IPv6
   *
   * For binary and hex presentation types, the alternate form specifier
   * '#' and the grouping option '_' are supported.
   */
  format(fmt = ""): string {
    // Support string formatting
    if (!fmt || fmt.endsWith("s")) {
      return formatString(this.toString(), fmt);
    }

    // From here on down, support for 'bnXx'
    const m = /^(#?)(_?)([xbnX])$/.exec(fmt);
    if (m === null) {
      throw new TypeError(
        `unsupported format string passed to ${this.constructor.name}.__format__`
      );
    }
    const [, alternate, grouping] = m;
    let fmtBase = m[3];

    // Set some defaults
    if (fmtBase === "n") {
      // Binary is default for ipv4, hex is default for ipv6
      fmtBase = this.version === 4 ? "b" : "x";
    }
    const digits = fmtBase === "b" ? this.maxPrefixlen : this.maxPrefixlen / 4;
    let body = this._ip
      .toString(fmtBase === "b" ? 2 : 16)
      .padStart(digits, "0");
    if (fmtBase === "X") {
      body = body.toUpperCase();
    }
    if (grouping) {
      body = body.match(/.{4}/g)?.join("_") ?? body;
    }
    if (alternate) {
      body = `0${fmtBase}${body}`;
    }
    return body;
  }
}

/** The special-purpose networks used by a network's is* properties. */
export interface _NetworkConstants<N> {
  readonly privateNetworks: readonly N[];
  readonly privateNetworksExceptions: readonly N[];
}

function _in(item: _IPAddressBase, container: unknown): boolean {
  if (!(container instanceof _BaseNetwork)) {
    throw new TypeError(
      `argument of type '${typeName(container)}' is not a container or iterable`
    );
  }
  return container.contains(item);
}

/**
 * A generic IP network object.
 *
 * This IP class contains the version independent methods which are
 * used by networks.
 */
export abstract class _BaseNetwork<
  A extends _BaseAddress
> extends _IPAddressBase {
  networkAddress: A;
  netmask: A;
  /** @internal */
  _prefixlen: Prefixlen;
  private _cachedBroadcastAddress?: A;
  private _cachedHostmask?: A;

  constructor(address: NetworkInput, strict: boolean, info: _VersionInfo) {
    super();
    const [addr, mask] = _splitAddrPrefix(address, info.maxPrefixlen);
    this.networkAddress = this._parseAddress(addr);
    [this.netmask, this._prefixlen] = this._makeNetmask(mask);
    const packed = this.networkAddress._ip;
    if ((packed & this.netmask._ip) !== packed) {
      if (strict) {
        throw new ValueError(`${this} has host bits set`);
      } else {
        this.networkAddress = this._addressClass(packed & this.netmask._ip);
      }
    }
  }

  /**
   * Construct an address of this network's version from an integer.
   * @internal
   */
  abstract _addressClass(ipInt: bigint): A;

  /** @internal */
  abstract _parseAddress(address: AddressInput): A;

  /** @internal */
  abstract _makeNetmask(mask: NetmaskInput): [A, Prefixlen];

  /** @internal */
  abstract get _constants(): _NetworkConstants<_BaseNetwork<A>>;

  /**
   * Number of hosts in the current subnet.
   */
  abstract get numAddresses(): number | bigint;

  private _new(address: NetworkInput): this {
    return new (this.constructor as new (address: NetworkInput) => this)(
      address
    );
  }

  toString(): string {
    return `${this.networkAddress}/${this.prefixlen}`;
  }

  /**
   * Generate iterator over usable hosts in a network.
   *
   * This is like iterating over the network except it doesn't return the
   * network or broadcast addresses.
   */
  *hosts(): Generator<A, void, undefined> {
    if (this._prefixlen === this.maxPrefixlen - 1) {
      yield* this;
    } else if (this._prefixlen === this.maxPrefixlen) {
      yield this.networkAddress;
    } else {
      yield* this._hostsRange();
    }
  }

  /** @internal */
  *_hostsRange(): Generator<A, void, undefined> {
    const network = this.networkAddress._ip;
    const broadcast = this.broadcastAddress._ip;
    for (let x = network + 1n; x < broadcast; x++) {
      yield this._addressClass(x);
    }
  }

  /**
   * Iterate over every address in the network, including the network and
   * broadcast addresses.
   */
  *[Symbol.iterator](): Generator<A, void, undefined> {
    const network = this.networkAddress._ip;
    const broadcast = this.broadcastAddress._ip;
    for (let x = network; x <= broadcast; x++) {
      yield this._addressClass(x);
    }
  }

  /**
   * Equivalent of Python's network[n]. Negative indexes count from the end.
   * @throws {RangeError} If the index is out of range (Python's IndexError).
   */
  getItem(n: number | bigint): A {
    const network = this.networkAddress._ip;
    const broadcast = this.broadcastAddress._ip;
    let index = BigInt(n);
    if (index >= 0n) {
      if (network + index > broadcast) {
        throw new RangeError("address out of range");
      }
      return this._addressClass(network + index);
    } else {
      index += 1n;
      if (broadcast + index < network) {
        throw new RangeError("address out of range");
      }
      return this._addressClass(broadcast + index);
    }
  }

  /** @internal */
  _lt(other: unknown): boolean | NotImplementedType {
    if (!(other instanceof _BaseNetwork)) {
      return NotImplemented;
    }
    if (this.version !== other.version) {
      throw new TypeError(`${this} and ${other} are not of the same version`);
    }
    if (!this.networkAddress.equals(other.networkAddress)) {
      return this.networkAddress.lessThan(other.networkAddress);
    }
    if (!this.netmask.equals(other.netmask)) {
      return this.netmask.lessThan(other.netmask);
    }
    return false;
  }

  /** @internal */
  _eq(other: unknown): boolean | NotImplementedType {
    if (!(other instanceof _IPAddressBase)) {
      return NotImplemented;
    }
    if (this.version !== other.version) {
      return false;
    }
    if (!(other instanceof _BaseNetwork)) {
      return NotImplemented;
    }
    return (
      this.networkAddress.equals(other.networkAddress) &&
      this.netmask._ip === other.netmask._ip
    );
  }

  /**
   * Equivalent of Python's `other in network`.
   * @param other An address, interface or network.
   * @returns {boolean} True if other is an address (or interface) of the same
   * version within this network. Always false for networks.
   */
  contains(other: _IPAddressBase): boolean {
    if (!(other instanceof _IPAddressBase)) {
      throw new TypeError(
        `'${typeName(other)}' object has no attribute 'version'`
      );
    }
    // always false if one is v4 and the other is v6.
    if (this.version !== other.version) {
      return false;
    }
    // dealing with another network.
    if (other instanceof _BaseNetwork || !(other instanceof _BaseAddress)) {
      return false;
    }
    // dealing with another address
    return (other._ip & this.netmask._ip) === this.networkAddress._ip;
  }

  /**
   * Tell if this is partly contained in other.
   */
  overlaps(other: _BaseNetwork<_BaseAddress>): boolean {
    return (
      _in(this.networkAddress, other) ||
      _in(this.broadcastAddress, other) ||
      _in(other.networkAddress, this) ||
      _in(other.broadcastAddress, this)
    );
  }

  get broadcastAddress(): A {
    if (this._cachedBroadcastAddress === undefined) {
      this._cachedBroadcastAddress = this._addressClass(
        this.networkAddress._ip | this.hostmask._ip
      );
    }
    return this._cachedBroadcastAddress;
  }

  get hostmask(): A {
    if (this._cachedHostmask === undefined) {
      this._cachedHostmask = this._addressClass(
        this.netmask._ip ^ this.networkAddress._info.allOnes
      );
    }
    return this._cachedHostmask;
  }

  get withPrefixlen(): string {
    return `${this.networkAddress}/${this._prefixlen}`;
  }

  get withNetmask(): string {
    return `${this.networkAddress}/${this.netmask}`;
  }

  get withHostmask(): string {
    return `${this.networkAddress}/${this.hostmask}`;
  }

  /** @internal */
  get _numAddresses(): bigint {
    return this.broadcastAddress._ip - this.networkAddress._ip + 1n;
  }

  get prefixlen(): Prefixlen {
    return this._prefixlen;
  }

  /**
   * Remove an address from a larger block.
   *
   * For example:
   *
   *   const addr1 = ipNetwork("192.0.2.0/28");
   *   const addr2 = ipNetwork("192.0.2.1/32");
   *   [...addr1.addressExclude(addr2)] =
   *     [IPv4Network('192.0.2.0/32'), IPv4Network('192.0.2.2/31'),
   *      IPv4Network('192.0.2.4/30'), IPv4Network('192.0.2.8/29')]
   *
   * @param other A network object of the same type.
   * @returns An iterator of the network objects which is this minus other.
   * @throws {TypeError} If this and other are of differing address versions,
   * or if other is not a network object.
   * @throws {ValueError} If other is not completely contained by this.
   */
  *addressExclude(
    other: _BaseNetwork<_BaseAddress>
  ): Generator<this, void, undefined> {
    if (this.version !== other.version) {
      throw new TypeError(`${this} and ${other} are not of the same version`);
    }
    if (!(other instanceof _BaseNetwork)) {
      throw new TypeError(`${other} is not a network object`);
    }
    if (!other.subnetOf(this)) {
      throw new ValueError(`${other} not contained in ${this}`);
    }
    if (other.equals(this)) {
      return;
    }

    // Make sure we're comparing the network of other.
    other = (other as this)._new(`${other.networkAddress}/${other.prefixlen}`);

    let [s1, s2] = this.subnets();
    while (!s1.equals(other) && !s2.equals(other)) {
      if (other.subnetOf(s1)) {
        yield s2;
        [s1, s2] = s1.subnets();
      } else if (other.subnetOf(s2)) {
        yield s1;
        [s1, s2] = s2.subnets();
      } else {
        // If we got here, there's a bug somewhere.
        throw new Error(
          `Error performing exclusion: s1: ${s1} s2: ${s2} other: ${other}`
        );
      }
    }
    if (s1.equals(other)) {
      yield s2;
    } else if (s2.equals(other)) {
      yield s1;
    } else {
      // If we got here, there's a bug somewhere.
      throw new Error(
        `Error performing exclusion: s1: ${s1} s2: ${s2} other: ${other}`
      );
    }
  }

  /**
   * Compare two IP objects.
   *
   * This is only concerned about the comparison of the integer
   * representation of the network addresses. This means that the
   * host bits aren't considered at all in this method.
   * @param other An IP network object.
   * @returns If the IP versions of this and other are the same, returns:
   * -1 if this < other, 0 if this == other, and 1 if this > other.
   * @throws {TypeError} If the IP versions are different.
   */
  compareNetworks(other: _BaseNetwork<_BaseAddress>): -1 | 0 | 1 {
    // does this need to raise a ValueError?
    if (this.version !== other.version) {
      throw new TypeError(`${this} and ${other} are not of the same type`);
    }
    if (!(other instanceof _BaseNetwork)) {
      throw new TypeError(
        `'${typeName(other)}' object has no attribute 'network_address'`
      );
    }
    // this.version === other.version below here:
    if (this.networkAddress.lessThan(other.networkAddress)) {
      return -1;
    }
    if (this.networkAddress.greaterThan(other.networkAddress)) {
      return 1;
    }
    // this.networkAddress == other.networkAddress below here:
    if (this.netmask.lessThan(other.netmask)) {
      return -1;
    }
    if (this.netmask.greaterThan(other.netmask)) {
      return 1;
    }
    return 0;
  }

  /**
   * Network-only key function.
   * @internal
   */
  _getNetworksKey(): [4 | 6, A, A] {
    return [this.version, this.networkAddress, this.netmask];
  }

  /**
   * The subnets which join to make the current subnet.
   *
   * In the case that this contains only one IP (prefixlen 32 for IPv4 or 128
   * for IPv6), yield an iterator with just ourself.
   * @param prefixlenDiff An integer, the amount the prefix length should be
   * increased by. This should not be set if newPrefix is also set. May
   * instead be an object of keyword arguments, e.g. `{ newPrefix: 26 }`.
   * @param newPrefix The desired new prefix length. This must be a larger
   * number (smaller prefix) than the existing prefix. This should not be set
   * if prefixlenDiff is also set.
   * @returns An iterator of network objects.
   * @throws {ValueError} The prefixlenDiff is too small or too large, or
   * prefixlenDiff and newPrefix are both set or newPrefix is a smaller number
   * than the current prefix (smaller number means a larger network).
   */
  *subnets(
    prefixlenDiff: number | PrefixOptions = 1,
    newPrefix: number | null = null
  ): Generator<this, void, undefined> {
    if (typeof prefixlenDiff === "object") {
      newPrefix = prefixlenDiff.newPrefix ?? null;
      prefixlenDiff = prefixlenDiff.prefixlenDiff ?? 1;
    }
    if (this._prefixlen === this.maxPrefixlen) {
      yield this;
      return;
    }

    if (newPrefix !== null) {
      if (newPrefix < this._prefixlen) {
        throw new ValueError("new prefix must be longer");
      }
      if (prefixlenDiff !== 1) {
        throw new ValueError("cannot set prefixlen_diff and new_prefix");
      }
      prefixlenDiff = newPrefix - this._prefixlen;
    }

    if (prefixlenDiff < 0) {
      throw new ValueError("prefix length diff must be > 0");
    }
    const newPrefixlen = this._prefixlen + prefixlenDiff;

    if (newPrefixlen > this.maxPrefixlen) {
      throw new ValueError(
        `prefix length diff ${newPrefixlen} is invalid for netblock ${this}`
      );
    }

    const start = this.networkAddress._ip;
    const end = this.broadcastAddress._ip + 1n;
    const step = (this.hostmask._ip + 1n) >> BigInt(prefixlenDiff);
    for (let newAddr = start; newAddr < end; newAddr += step) {
      yield this._new([newAddr, newPrefixlen]);
    }
  }

  /**
   * The supernet containing the current network.
   * @param prefixlenDiff An integer, the amount the prefix length of the
   * network should be decreased by. For example, given a /24 network and a
   * prefixlenDiff of 3, a supernet with a /21 netmask is returned. May
   * instead be an object of keyword arguments, e.g. `{ newPrefix: 16 }`.
   * @param newPrefix The desired new prefix length. This must be a smaller
   * number (larger network) than the existing prefix.
   * @returns A network object.
   * @throws {ValueError} If this.prefixlen - prefixlenDiff < 0. I.e., you
   * have a negative prefix length, or if prefixlenDiff and newPrefix are both
   * set or newPrefix is a larger number than the current prefix (larger
   * number means a smaller network).
   */
  supernet(
    prefixlenDiff: number | PrefixOptions = 1,
    newPrefix: number | null = null
  ): this {
    if (typeof prefixlenDiff === "object") {
      newPrefix = prefixlenDiff.newPrefix ?? null;
      prefixlenDiff = prefixlenDiff.prefixlenDiff ?? 1;
    }
    if (this._prefixlen === 0) {
      return this;
    }

    if (newPrefix !== null) {
      if (newPrefix > this._prefixlen) {
        throw new ValueError("new prefix must be shorter");
      }
      if (prefixlenDiff !== 1) {
        throw new ValueError("cannot set prefixlen_diff and new_prefix");
      }
      prefixlenDiff = this._prefixlen - newPrefix;
    }

    const newPrefixlen = this.prefixlen - prefixlenDiff;
    if (newPrefixlen < 0) {
      throw new ValueError(
        `current prefixlen is ${this.prefixlen}, cannot have a prefixlen_diff of ${prefixlenDiff}`
      );
    }
    // Python's << raises for negative counts; a BigInt shift would not.
    if (prefixlenDiff < 0) {
      throw new ValueError("negative shift count");
    }
    return this._new([
      this.networkAddress._ip & (this.netmask._ip << BigInt(prefixlenDiff)),
      newPrefixlen,
    ]);
  }

  /**
   * Test if the address is reserved for multicast use.
   * @returns {boolean} True if the address is a multicast address.
   * See RFC 2373 2.7 for details.
   */
  get isMulticast(): boolean {
    return this.networkAddress.isMulticast && this.broadcastAddress.isMulticast;
  }

  /** @internal */
  static _isSubnetOf(a: unknown, b: unknown): boolean {
    if (!(a instanceof _IPAddressBase && b instanceof _IPAddressBase)) {
      throw new TypeError(
        `Unable to test subnet containment between ${a} and ${b}`
      );
    }
    // Always false if one is v4 and the other is v6.
    if (a.version !== b.version) {
      throw new TypeError(`${a} and ${b} are not of the same version`);
    }
    if (!(a instanceof _BaseNetwork && b instanceof _BaseNetwork)) {
      throw new TypeError(
        `Unable to test subnet containment between ${a} and ${b}`
      );
    }
    return (
      b.networkAddress.lessThanOrEqual(a.networkAddress) &&
      b.broadcastAddress.greaterThanOrEqual(a.broadcastAddress)
    );
  }

  /**
   * @returns {boolean} True if this network is a subnet of other.
   */
  subnetOf(other: _BaseNetwork<_BaseAddress>): boolean {
    return _BaseNetwork._isSubnetOf(this, other);
  }

  /**
   * @returns {boolean} True if this network is a supernet of other.
   */
  supernetOf(other: _BaseNetwork<_BaseAddress>): boolean {
    return _BaseNetwork._isSubnetOf(other, this);
  }

  /**
   * Test if the address is otherwise IETF reserved.
   * @returns {boolean} True if the address is within one of the reserved
   * network ranges.
   */
  get isReserved(): boolean {
    return this.networkAddress.isReserved && this.broadcastAddress.isReserved;
  }

  /**
   * Test if the address is reserved for link-local.
   * @returns {boolean} True if the address is reserved per RFC 4291.
   */
  get isLinkLocal(): boolean {
    return this.networkAddress.isLinkLocal && this.broadcastAddress.isLinkLocal;
  }

  /**
   * Test if this network belongs to a private range.
   * @returns {boolean} True if the network is reserved per
   * iana-ipv4-special-registry or iana-ipv6-special-registry.
   */
  get isPrivate(): boolean {
    const constants = this._constants;
    return (
      constants.privateNetworks.some(
        (privNetwork) =>
          privNetwork.contains(this.networkAddress) &&
          privNetwork.contains(this.broadcastAddress)
      ) &&
      constants.privateNetworksExceptions.every(
        (network) =>
          !network.contains(this.networkAddress) &&
          !network.contains(this.broadcastAddress)
      )
    );
  }

  /**
   * Test if this address is allocated for public networks.
   * @returns {boolean} True if the address is not reserved per
   * iana-ipv4-special-registry or iana-ipv6-special-registry.
   */
  get isGlobal(): boolean {
    return !this.isPrivate;
  }

  /**
   * Test if the address is unspecified.
   * @returns {boolean} True if this is the unspecified address as defined in
   * RFC 2373 2.5.2.
   */
  get isUnspecified(): boolean {
    return (
      this.networkAddress.isUnspecified && this.broadcastAddress.isUnspecified
    );
  }

  /**
   * Test if the address is a loopback address.
   * @returns {boolean} True if the address is a loopback address as defined
   * in RFC 2373 2.5.3.
   */
  get isLoopback(): boolean {
    return this.networkAddress.isLoopback && this.broadcastAddress.isLoopback;
  }
}
