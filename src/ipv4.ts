import type {
  AddressInput,
  NetmaskInput,
  NetworkInput,
  Prefixlen,
} from "./interfaces";
import { AddressValueError, NetmaskValueError, ValueError } from "./errors";
import { IPV4LENGTH, IPV4_ALL_ONES } from "./constants";
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
  _prefixFromIpString,
  _prefixFromPrefixString,
  _splitAddrPrefix,
} from "./base";
import {
  intFromBytes,
  intToBytes,
  pyRepr,
  reprValue,
  strIsAscii,
  strIsDigit,
  v4IntToPacked,
} from "./utilities";
import { IPv6Address } from "./ipv6";

/**
 * Convert a decimal octet into an integer.
 * @param octetStr A string, the number to parse.
 * @returns {number} The octet as an integer.
 * @throws {ValueError} if the octet isn't strictly a decimal from [0..255].
 */
function _parseOctet(octetStr: string): number {
  if (!octetStr) {
    throw new ValueError("Empty octet not permitted");
  }
  // Reject non-ASCII digits.
  if (!(strIsAscii(octetStr) && strIsDigit(octetStr))) {
    throw new ValueError(
      `Only decimal digits permitted in ${pyRepr(octetStr)}`
    );
  }
  // We do the length check second, since the invalid character error
  // is likely to be more informative for the user
  if (octetStr.length > 3) {
    throw new ValueError(
      `At most 3 characters permitted in ${pyRepr(octetStr)}`
    );
  }
  // Handle leading zeros as strict as glibc's inet_pton()
  // See security bug bpo-36384
  if (octetStr !== "0" && octetStr.startsWith("0")) {
    throw new ValueError(
      `Leading zeros are not permitted in ${pyRepr(octetStr)}`
    );
  }
  // Convert to integer (we know digits are legal)
  const octetInt = parseInt(octetStr, 10);
  if (octetInt > 255) {
    throw new ValueError(`Octet ${octetInt} (> 255) not permitted`);
  }
  return octetInt;
}

/**
 * Turn the given IP string into an integer for comparison.
 * @param ipStr A string, the IP ipStr.
 * @returns {bigint} The IP ipStr as an integer.
 * @throws {AddressValueError} if ipStr isn't a valid IPv4 Address.
 */
function _ipIntFromString(ipStr: string): bigint {
  if (!ipStr) {
    throw new AddressValueError("Address cannot be empty");
  }

  const octets = ipStr.split(".");
  if (octets.length !== 4) {
    throw new AddressValueError(`Expected 4 octets in ${pyRepr(ipStr)}`);
  }

  try {
    // big-endian / network-byte order
    return octets.reduce(
      (ipInt, octet) => (ipInt << 8n) | BigInt(_parseOctet(octet)),
      0n
    );
  } catch (err: unknown) {
    if (err instanceof ValueError) {
      throw new AddressValueError(`${err.message} in ${pyRepr(ipStr)}`);
    }
    throw err;
  }
}

/**
 * Turns a 32-bit integer into dotted decimal notation.
 * @param ipInt An integer, the IP address.
 * @returns {string} The IP address as a string in dotted decimal notation.
 */
function _stringFromIpInt(ipInt: bigint): string {
  return intToBytes(ipInt, 4, "big").join(".");
}

/** @internal */
export const _IPv4Info: _VersionInfo = {
  version: 4,
  maxPrefixlen: IPV4LENGTH,
  allOnes: IPV4_ALL_ONES,
  ipIntFromString: _ipIntFromString,
  stringFromIpInt: _stringFromIpInt,
};

// There are only a handful of valid v4 netmasks, so we cache them all
// when constructed (see _makeV4Netmask()).
const _netmaskCache = new Map<string, [IPv4Address, Prefixlen]>();

/**
 * Make a [netmask, prefixlen] tuple from the given argument.
 * @param arg Argument can be:
 * - an integer (the prefix length)
 * - a string representing the prefix length (e.g. "24")
 * - a string representing the prefix netmask (e.g. "255.255.255.0")
 */
function _makeV4Netmask(arg: NetmaskInput): [IPv4Address, Prefixlen] {
  return _makeNetmask(
    _IPv4Info,
    _netmaskCache,
    arg,
    (netmaskStr) => {
      try {
        // Check for a netmask in prefix length form
        return _prefixFromPrefixString(_IPv4Info, netmaskStr);
      } catch (err: unknown) {
        if (!(err instanceof NetmaskValueError)) {
          throw err;
        }
        // Check for a netmask or hostmask in dotted-quad form.
        // This may raise NetmaskValueError.
        return _prefixFromIpString(_IPv4Info, netmaskStr);
      }
    },
    (ipInt) => new IPv4Address(ipInt)
  );
}

/**
 * Return the reverse DNS pointer name for the IPv4 address.
 * This implements the method described in RFC1035 3.5.
 */
function _reversePointer(self: IPv4Address | IPv4Network): string {
  return `${self.toString().split(".").reverse().join(".")}.in-addr.arpa`;
}

/**
 * Represent and manipulate single IPv4 Addresses.
 */
export class IPv4Address extends _BaseAddress {
  /**
   * @param address A string or integer representing the IP. Additionally,
   * an integer can be passed, so
   * new IPv4Address('192.0.2.1') == new IPv4Address(3221225985).
   * or, more generally
   * new IPv4Address(new IPv4Address('192.0.2.1').toNumber()) ==
   *   new IPv4Address('192.0.2.1')
   * Packed bytes (a Uint8Array of length 4) are also accepted.
   * @throws {AddressValueError} If address isn't a valid IPv4 address.
   */
  constructor(address: AddressInput) {
    super();
    const parsed = _classifyAddress(address);

    // Efficient constructor from integer.
    if (parsed.kind === "int") {
      _checkIntAddress(_IPv4Info, parsed.value);
      this._ip = parsed.value;
      return;
    }

    // Constructing from a packed address
    if (parsed.kind === "bytes") {
      _checkPackedAddress(_IPv4Info, parsed.value, 4);
      this._ip = intFromBytes(parsed.value, "big");
      return;
    }

    // Assume input argument to be string or any object representation
    // which converts into a formatted IP string.
    if (parsed.value.includes("/")) {
      throw new AddressValueError(`Unexpected '/' in ${reprValue(address)}`);
    }
    this._ip = _ipIntFromString(parsed.value);
  }

  /** @internal */
  get _info(): _VersionInfo {
    return _IPv4Info;
  }

  get version(): 4 {
    return 4;
  }

  get maxPrefixlen(): 32 {
    return 32;
  }

  toNumber(): number {
    return Number(this._ip);
  }

  /** @internal */
  _explodeShorthandIpString(): string {
    return this.toString();
  }

  /** @internal */
  _reversePointer(): string {
    return _reversePointer(this);
  }

  /**
   * The binary representation of this address.
   */
  get packed(): Uint8Array {
    return v4IntToPacked(this._ip);
  }

  /**
   * Test if the address is otherwise IETF reserved.
   * @returns {boolean} True if the address is within the reserved IPv4
   * Network range.
   */
  get isReserved(): boolean {
    return _IPv4Constants().reservedNetwork.contains(this);
  }

  /**
   * True if the address is defined as not globally reachable by
   * iana-ipv4-special-registry, with the exception that it is false for
   * 100.64.0.0/10.
   *
   * isPrivate has value opposite to isGlobal, except for the 100.64.0.0/10
   * IPv4 range where they are both false.
   */
  get isPrivate(): boolean {
    const constants = _IPv4Constants();
    return (
      constants.privateNetworks.some((net) => net.contains(this)) &&
      constants.privateNetworksExceptions.every((net) => !net.contains(this))
    );
  }

  /**
   * True if the address is defined as globally reachable by
   * iana-ipv4-special-registry.
   *
   * isGlobal has value opposite to isPrivate, except for the 100.64.0.0/10
   * IPv4 range where they are both false.
   */
  get isGlobal(): boolean {
    return !_IPv4Constants().publicNetwork.contains(this) && !this.isPrivate;
  }

  /**
   * Test if the address is reserved for multicast use.
   * @returns {boolean} True if the address is multicast.
   * See RFC 3171 for details.
   */
  get isMulticast(): boolean {
    return _IPv4Constants().multicastNetwork.contains(this);
  }

  /**
   * Test if the address is unspecified.
   * @returns {boolean} True if this is the unspecified address as defined in
   * RFC 5735 3.
   */
  get isUnspecified(): boolean {
    return this.equals(_IPv4Constants().unspecifiedAddress);
  }

  /**
   * Test if the address is a loopback address.
   * @returns {boolean} True if the address is a loopback per RFC 3330.
   */
  get isLoopback(): boolean {
    return _IPv4Constants().loopbackNetwork.contains(this);
  }

  /**
   * Test if the address is reserved for link-local.
   * @returns {boolean} True if the address is link-local per RFC 3927.
   */
  get isLinkLocal(): boolean {
    return _IPv4Constants().linklocalNetwork.contains(this);
  }

  /**
   * Return the IPv4-mapped IPv6 address.
   * @returns {IPv6Address} The IPv4-mapped IPv6 address per RFC 4291.
   */
  get ipv6Mapped(): IPv6Address {
    return new IPv6Address(`::ffff:${this.toString()}`);
  }
}

/**
 * An IPv4 address associated with the network it is on, e.g. 192.0.2.5/24.
 */
export class IPv4Interface extends IPv4Address {
  network: IPv4Network;
  netmask: IPv4Address;
  /** @internal */
  _prefixlen: Prefixlen;
  private _cachedHostmask?: IPv4Address;

  constructor(address: NetworkInput) {
    const [addr, mask] = _splitAddrPrefix(address, IPV4LENGTH);
    super(addr);
    this.network = new IPv4Network([addr, mask], false);
    this.netmask = this.network.netmask;
    this._prefixlen = this.network._prefixlen;
  }

  get hostmask(): IPv4Address {
    this._cachedHostmask ??= this.network.hostmask;
    return this._cachedHostmask;
  }

  toString(): string {
    return `${_stringFromIpInt(this._ip)}/${this._prefixlen}`;
  }

  /** @internal */
  _eq(other: unknown): boolean | NotImplementedType {
    const addressEqual = super._eq(other);
    if (addressEqual === NotImplemented || !addressEqual) {
      return addressEqual;
    }
    if (!(other instanceof IPv4Interface)) {
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
    if (!(other instanceof IPv4Interface)) {
      // We *do* allow addresses and interfaces to be sorted. The
      // unassociated address is considered less than all interfaces.
      return false;
    }
    return (
      this.network.lessThan(other.network) ||
      (this.network.equals(other.network) && addressLess)
    );
  }

  get ip(): IPv4Address {
    return new IPv4Address(this._ip);
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
}

/**
 * This class represents and manipulates 32-bit IPv4 network + addresses.
 *
 * Attributes: [examples for IPv4Network('192.0.2.0/27')]
 *   .networkAddress: IPv4Address('192.0.2.0')
 *   .hostmask: IPv4Address('0.0.0.31')
 *   .broadcastAddress: IPv4Address('192.0.2.32')
 *   .netmask: IPv4Address('255.255.255.224')
 *   .prefixlen: 27
 */
export class IPv4Network extends _BaseNetwork<IPv4Address> {
  /**
   * Instantiate a new IPv4 network object.
   * @param address A string or integer representing the IP [& network].
   * '192.0.2.0/24'
   * '192.0.2.0/255.255.255.0'
   * '192.0.2.0/0.0.0.255'
   * are all functionally the same in IPv4. Similarly,
   * '192.0.2.1'
   * '192.0.2.1/255.255.255.255'
   * '192.0.2.1/32'
   * are also functionally equivalent. That is to say, failing to
   * provide a subnetmask will create an object with a mask of /32.
   *
   * If the mask (portion after the / in the argument) is given in
   * dotted quad form, it is treated as a netmask if it starts with a
   * non-zero field (e.g. /255.0.0.0 == /8) and as a hostmask if it
   * starts with a zero field (e.g. 0.255.255.255 == /8), with the
   * single exception of an all-zero mask which is treated as a
   * netmask == /0. If no mask is given, a default of /32 is used.
   *
   * Additionally, an integer, packed bytes or an [address, mask] tuple can
   * be passed, so
   * new IPv4Network('192.0.2.1') == new IPv4Network(3221225985)
   * @param strict If true, ensure that we have been passed a true network
   * address, e.g. 192.0.2.0/24 and not an IP address on a network, e.g.
   * 192.0.2.1/24.
   * @throws {AddressValueError} If address isn't a valid IPv4 address.
   * @throws {NetmaskValueError} If the netmask isn't valid for an IPv4
   * address.
   * @throws {ValueError} If strict is true and a network address is not
   * supplied.
   */
  constructor(address: NetworkInput, strict = true) {
    super(address, strict, _IPv4Info);
  }

  /** @internal */
  _addressClass(ipInt: bigint): IPv4Address {
    return new IPv4Address(ipInt);
  }

  /** @internal */
  _parseAddress(address: AddressInput): IPv4Address {
    return new IPv4Address(address);
  }

  /** @internal */
  _makeNetmask(mask: NetmaskInput): [IPv4Address, Prefixlen] {
    return _makeV4Netmask(mask);
  }

  /** @internal */
  get _constants(): _NetworkConstants<IPv4Network> {
    return _IPv4Constants();
  }

  get version(): 4 {
    return 4;
  }

  get maxPrefixlen(): 32 {
    return 32;
  }

  get numAddresses(): number {
    return Number(this._numAddresses);
  }

  /** @internal */
  _explodeShorthandIpString(): string {
    return this.toString();
  }

  /** @internal */
  _reversePointer(): string {
    return _reversePointer(this);
  }

  /**
   * Test if this address is allocated for public networks.
   * @returns {boolean} True if the address is not reserved per
   * iana-ipv4-special-registry.
   */
  get isGlobal(): boolean {
    const publicNetwork = _IPv4Constants().publicNetwork;
    return (
      !(
        publicNetwork.contains(this.networkAddress) &&
        publicNetwork.contains(this.broadcastAddress)
      ) && !this.isPrivate
    );
  }
}

interface _IPv4ConstantsT extends _NetworkConstants<IPv4Network> {
  readonly linklocalNetwork: IPv4Network;
  readonly loopbackNetwork: IPv4Network;
  readonly multicastNetwork: IPv4Network;
  readonly publicNetwork: IPv4Network;
  readonly reservedNetwork: IPv4Network;
  readonly unspecifiedAddress: IPv4Address;
}

let _constants: _IPv4ConstantsT | undefined;

// The constants are built lazily, rather than when this module is loaded, so
// that the circular imports between the IPv4 and IPv6 modules are safe.
function _IPv4Constants(): _IPv4ConstantsT {
  _constants ??= {
    linklocalNetwork: new IPv4Network("169.254.0.0/16"),
    loopbackNetwork: new IPv4Network("127.0.0.0/8"),
    multicastNetwork: new IPv4Network("224.0.0.0/4"),
    publicNetwork: new IPv4Network("100.64.0.0/10"),
    // Not globally reachable address blocks listed on
    // https://www.iana.org/assignments/iana-ipv4-special-registry/iana-ipv4-special-registry.xhtml
    privateNetworks: [
      new IPv4Network("0.0.0.0/8"),
      new IPv4Network("10.0.0.0/8"),
      new IPv4Network("127.0.0.0/8"),
      new IPv4Network("169.254.0.0/16"),
      new IPv4Network("172.16.0.0/12"),
      new IPv4Network("192.0.0.0/24"),
      new IPv4Network("192.0.0.170/31"),
      new IPv4Network("192.0.2.0/24"),
      new IPv4Network("192.168.0.0/16"),
      new IPv4Network("198.18.0.0/15"),
      new IPv4Network("198.51.100.0/24"),
      new IPv4Network("203.0.113.0/24"),
      new IPv4Network("240.0.0.0/4"),
      new IPv4Network("255.255.255.255/32"),
    ],
    privateNetworksExceptions: [
      new IPv4Network("192.0.0.9/32"),
      new IPv4Network("192.0.0.10/32"),
    ],
    reservedNetwork: new IPv4Network("240.0.0.0/4"),
    unspecifiedAddress: new IPv4Address("0.0.0.0"),
  };
  return _constants;
}
