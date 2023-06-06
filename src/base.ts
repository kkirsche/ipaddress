import { AddressTypeError, NetmaskTypeError } from "./errors";
import {
  ByteArray,
  IPInteger,
  IPv4ALLONES,
  IPv4LENGTH,
  Netmask,
} from "./constants";
import {
  _splitOptionalNetmask,
  intFromBytes,
  strIsAscii,
  strIsDigit,
} from "./utilities";
import { isBigInt, isByteArray, isNumber, isString } from "./typeGuards";

import { IPv4Address } from "./IPv4Address";

type IPVersion = 4 | 6;
type Prefixlen = number;

/**
 * The base of all IP addresses.
 * All IP addresses and networks should support these features.
 */
interface IPAddressBaseT {
  readonly version: IPVersion;
  readonly toString: () => string;
  readonly exploded: string;
  readonly compressed: string;
  readonly reversePointer: () => string;
  readonly _checkIntAddress: (address: IPInteger) => void; // throws if invalid
  readonly _checkPackedAddress: (
    address: ByteArray,
    expectedLen: number
  ) => void; // throws if invalid
  // static
  readonly _ipIntFromPrefix: (prefixlen: Prefixlen) => IPInteger;
  readonly _prefixFromIpInt: (ipInt: IPInteger) => Prefixlen;
  readonly _reportInvalidNetmask: (netmaskStr: string) => void;
  readonly _prefixFromPrefixString: (prefixlenStr: string) => Prefixlen;
  readonly _prefixFromIpString: (ipStr: string) => Prefixlen;
  readonly _splitAddrPrefix: (
    address: string | IPInteger | ByteArray
  ) => [string | IPInteger | ByteArray, number];
}

/**
 * A generic IP object.
 *
 * This IP interface contains the version independent methods which are
 * used by single IP addresses.
 */
interface BaseAddressT extends IPAddressBaseT {
  _ip: IPInteger;
  readonly toNumber: () => IPInteger;
  // Shorthand for integer addition and subtraction. This is not
  // meant to ever support addition / subtraction of addresses.
  readonly add: (other: IPInteger) => IPInteger;
  readonly sub: (other: IPInteger) => IPInteger;
  readonly toRepresentation: () => string;
  readonly equals: (other: BaseAddressT) => boolean;
  readonly lessThan: (other: BaseAddressT) => boolean;
  readonly _getAddressKey: () => [number, BaseAddressT];
}

/**
 * A generic IP network object
 *
 * This IP interface the version independent methods which are
 * used by networks.
 */
export interface BaseNetworkT extends IPAddressBaseT {
  _addressClass: IPAddressBaseT;
  networkAddress: IPAddressBaseT;
  netmask: IPv4Address;
  readonly equals: (other: BaseAddressT) => boolean;
  _getNetworksKey: () => [IPVersion, BaseAddressT, BaseAddressT];
  subnetOf: (b: BaseNetworkT) => boolean;
  addressExclude: (other: BaseNetworkT) => BaseNetworkT[];
  broadcastAddress: () => BaseAddressT;
  compareNetworks: (other: BaseNetworkT) => -1 | 0 | 1;
  contains: (other: BaseNetworkT) => boolean;
  get: (n: number) => BaseAddressT;
  hosts: Generator<BaseAddressT, BaseAddressT[], never>;
  hostmask: () => BaseAddressT;
  isGlobal: () => boolean;
  isLinkLocal: () => boolean;
  isLoopback: () => boolean;
  isMulticast: () => boolean;
  isPrivate: () => boolean;
  isReserved: () => boolean;
  isUnspecified: () => boolean;
  map: Generator<BaseAddressT, BaseAddressT[], never>; // equivalent to python's __iter__
  numAddresses: () => number; // does this need to return a bigint?
  overlaps: (other: BaseNetworkT) => boolean;
  subnets: (prefixlenDiff?: number, newPrefix?: number) => BaseNetworkT;
  supernet: (prefixlenDiff?: number, newPrefix?: number) => BaseNetworkT;
  withHostmask: () => string;
  withNetmask: () => string;
  withPrefixlen: () => string;
}

/**
 * Base IPv4 object.
 *
 * The following methods are used by IPv4 objects in both single IP
 * addresses and networks.
 */
export interface BaseV4T {
  readonly version: 4;
  readonly maxPrefixlen: typeof IPv4LENGTH;
  readonly _ALL_ONES: typeof IPv4ALLONES;
  _netmaskCache: Record<string | number, Netmask>;
  _explodeShorthandIpString: () => string;
  _makeNetmask: (arg: string | number) => Netmask;
  _ipIntFromString: (ip_str: string) => number;
  _parseOctet: (octet_str: string) => number;
  _stringFromIpInt: (ip_int: IPInteger) => string;
}

interface IPv4AddressT extends BaseV4T, BaseAddressT {
  readonly version: 4;
  readonly _getAddressKey: () => [number, BaseAddressT];
  packed: () => ByteArray;
  isReserved: () => boolean;
  isPrivate: () => boolean;
  isGlobal: () => boolean;
  isMulticast: () => boolean;
  isUnspecified: () => boolean;
  isLoopback: () => boolean;
  isLinkLocal: () => boolean;
}

interface IPv4NetworkT extends BaseV4T, BaseNetworkT {
  readonly version: 4;
  _addressClass: IPv4Address;
  networkAddress: IPv4Address;
  netmask: IPv4Address;
  isGlobal: () => boolean;
}

/**
 * This class represents and manipulates 32-bit IPv4 network + addresses.
 *
 * Attributes: [examples for IPv4Network("192.0.2.0/27")]
 * .network_address: IPv4Address("192.0.2.0")
 * .hostmask: IPv4Address("0.0.0.31")
 * .broadcast_address: IPv4Address("192.0.2.32")
 * .netmask: IPv4Address("255.255.255.224")
 * .prefixlen: 27
 */
export class IPv4Network implements IPv4NetworkT, BaseV4T, BaseNetworkT {
  // @ts-expect-error Incorrect type inference
  _addressClass = IPv4Address;
  readonly version = 4;
  readonly maxPrefixlen = IPv4LENGTH;
  readonly _ALL_ONES = IPv4ALLONES;
  networkAddress: IPv4Address;
  netmask: IPv4Address;
  prefixlen: number;
  _netmaskCache: Record<string | number, Netmask> = {};

  _explodeShorthandIpString(this: IPv4Network): string {
    return this.toString();
  }

  /**
   * Make a (netmask, prefix_len) tuple from the given argument.
   *
   * Argument can be:
   * - an integer (the prefix length)
   * - a string representing the prefix length (e.g. "24")
   * - a string representing the prefix netmask (e.g. "255.255.255.0")
   * @param arg The argument.
   * @returns {Netmask} The netmask and prefix length object.
   */
  _makeNetmask(this: IPv4Network, arg: string | number): Netmask {
    let prefixlen: number;
    if (this._netmaskCache[arg] === undefined) {
      if (isNumber(arg)) {
        prefixlen = arg;
        if (!(0 <= prefixlen && prefixlen <= this.maxPrefixlen)) {
          throw new NetmaskTypeError(`${prefixlen} is not a valid netmask`);
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
      const result = {
        netmask,
        prefixlen,
      };
      this._netmaskCache[arg] = result;
    }
    return this._netmaskCache[arg];
  }

  /**
   * Convert a decimal octet to an integer.
   * @param octet A string, the number to parse.
   * @returns {number} The octet as an integer.
   * @throws {TypeError} if the octet isn't strictly a decimal from [0..255].
   */
  _parseOctet(octet_str: string): number {
    if (octet_str === "") {
      throw new TypeError("Empty octet is not permitted.");
    }
    // Reject non-ASCII digits.
    if (!strIsAscii(octet_str) && !strIsDigit(octet_str)) {
      throw new TypeError(`Only decimal digits permitted in '${octet_str}'`);
    }

    // We do length check second, since the invalid character error
    // is likely to be more informative for the user
    if (octet_str.length > 3) {
      throw new TypeError(`At most 3 characters permitted in '${octet_str}'`);
    }

    // Handle leading zeroes as strict as glibc's inet_pton()
    // See security bug in Python's issue tracker, bpo-36384
    if (octet_str !== "0" && octet_str.indexOf("0") === 0) {
      throw new TypeError(`Leading zeroes are not permitted in '${octet_str}'`);
    }

    // Convert the integer (we know digits are legal)
    const octet_int = parseInt(octet_str, 10);
    if (octet_int > 255) {
      throw new TypeError(`Octet ${octet_int} (> 255) not permitted`);
    }

    return octet_int;
  }

  /**
   * Turn the prefix length into a bitwise netmask.
   * @param prefixlen An integer, the prefix length.
   * @returns {IPInteger} An integer
   */
  _ipIntFromPrefix(this: IPv4Network, prefixlen: number): IPInteger {
    return _ipIntFromPrefix(this, prefixlen);
  }

  /**
   * Return prefix length from a numeric string.
   */
  _prefixFromPrefixString(this: IPv4Network, prefixlenStr: string): number {
    // parseInt allows leading +/- as well as surrounding whitespace,
    // so we ensure that isn't the case
    if (!(strIsAscii(prefixlenStr) && strIsDigit(prefixlenStr))) {
      this._reportInvalidNetmask(prefixlenStr);
    }

    const prefixlen = parseInt(prefixlenStr);
    if (!Number.isFinite(prefixlen)) {
      this._reportInvalidNetmask(prefixlenStr);
    }
    if (!(0 <= prefixlen && prefixlen <= this.maxPrefixlen)) {
      this._reportInvalidNetmask(prefixlenStr);
    }

    return prefixlen;
  }

  /**
   * Turn the given IP string into an integer for comparison.
   *
   * @param address A string, the IP `address`.
   * @returns {number} The IP `address` as an integer.
   * @throws {AddressTypeError} If `address` isn't a valid IPv4 address.
   */
  _ipIntFromString(this: IPv4Network, ip_str: string): number {
    if (ip_str === "") {
      throw new AddressTypeError("Address cannot be empty");
    }

    const octets = ip_str.split(".");
    if (octets.length !== 4) {
      throw new AddressTypeError(`Expected 4 octets in ${ip_str}`);
    }

    try {
      const parsedOctets = intFromBytes(
        octets.map((octet) => this._parseOctet(octet)),
        "big" // big-endian / network-byte order
      );
      if (!isNumber(parsedOctets)) {
        throw new AddressTypeError(
          `Invalid IPv4 address integer: ${parsedOctets} is of type ${typeof parsedOctets} instead of number`
        );
      }
      return parsedOctets;
    } catch (error: unknown) {
      let message = `Unknown error occurred while parsing ${ip_str}.`;
      if (error instanceof Error) message = `${error.message} in ${ip_str}`;
      throw new AddressTypeError(message);
    }
  }

  /**
   * Turn a netmask/hostmask string into a prefix length.
   * @param ipStr The netmask/hostmask to be converted
   * @returns {number} An integer, the prefix length.
   * @throws {AddressTypeError} If the mask cannot be converted to an integer.
   */
  _prefixFromIpString(ipStr: string): number {
    // Parse the netmask/hostmask like an IP address.
    let ipInt = -1;
    try {
      ipInt = this._ipIntFromString(ipStr);
    } catch (err: unknown) {
      if (err instanceof AddressTypeError) {
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
      this._reportInvalidNetmask(ipStr);
    }

    throw new Error("Unreachable");
  }

  _reportInvalidNetmask(netmaskStr: string): void {
    const msg = `${netmaskStr} is not a valid netmask`;
    throw new NetmaskTypeError(msg);
  }

  /**
   * Returns prefix length from the bitwise netmask.
   * @param ipInt An integer, the netmask in expanded bitwise form.
   * @returns {number} An integer, the prefix length.
   * @throws {TypeError} If the input intermingles zeroes and ones.
   */
  _prefixFromIpInt(this: IPv4Network, ipInt: IPInteger): number {
    return _prefixFromIpInt(this, ipInt);
  }

  _splitAddrPrefix(
    address: string | IPInteger | ByteArray
  ): [string | IPInteger | ByteArray, number] {
    // a packed address or integer
    if (isNumber(address) || isBigInt(address) || isByteArray(address)) {
      // hardcoded 32 to make it static
      return [address, 32];
    }

    const addressArray = isString(address)
      ? _splitOptionalNetmask(address)
      : address;
    return [addressArray[0], 32];
  }

  isGlobal(): boolean {
    // TODO: Add
    // https://github.com/python/cpython/blob/main/Lib/ipaddress.py#L1529
    throw Error("Not Implemented Yet");
  }

  hostmask(this: IPv4Network): IPv4Address {
    return new this._addressClass(
      BigInt(this.netmask.toNumber()) ^ BigInt(this._ALL_ONES)
    );
  }

  broadcastAddress(this: IPv4Network): IPv4Address {
    return new this._addressClass(
      BigInt(this.networkAddress.toNumber()) |
        BigInt(this.hostmask().toNumber())
    );
  }

  withPrefixlen(this: IPv4Network): string {
    return `${this.networkAddress.toString()}/${this.prefixlen}`;
  }

  withNetmask(this: IPv4Network): string {
    return `${this.networkAddress.toString()}/${this.netmask.toString()}`;
  }

  withHostmask(this: IPv4Network): string {
    return `${this.networkAddress.toString()}/${this.hostmask().toString()}`;
  }

  /**
   * Number of hosts in the current subnet.
   * @returns {number} The number of hosts in the subnet.
   */
  numAddresses(this: IPv4Network): number {
    return (
      this.broadcastAddress().toNumber() - this.networkAddress.toNumber() + 1
    );
  }

  toString(this: IPv4Network): string {
    return `${this.networkAddress.toString()}/${this.prefixlen}`;
  }

  subnetOf(this: IPv4Network, b: BaseNetworkT): boolean {
    if (this.version !== b.version) {
      throw new TypeError(
        `${this.toString()} and ${b.toString()} are not of the same version`
      );
    }
    if (b.networkAddress instanceof IPv4Address) {
      return (
        this.networkAddress.toNumber() <= b.networkAddress.toNumber() &&
        b.broadcastAddress().toNumber() >= this.broadcastAddress().toNumber()
      );
    }
    throw new TypeError(`${b.toString()} is not an IPv4Address instance`);
  }

  addressExclude(other: BaseNetworkT): BaseNetworkT[] {
    if (this.version !== other.version) {
      throw new TypeError(
        `${this.toString()} and ${other.toString()} are not of the same version`
      );
    }

    if (!(other instanceof IPv4Network)) {
      throw new TypeError(`${other.toString()} is not a network object`);
    }

    if (!other.subnetOf(this)) {
      throw new TypeError(
        `${other.toString()} is not contained in ${this.toString()}`
      );
    }

    if (other.equals(this)) {
      return [this];
    }
  }
}
