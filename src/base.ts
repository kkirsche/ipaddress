import {
  ByteArray,
  IPInteger,
  IPv4ALLONES,
  IPv4Integer,
  IPv4LENGTH,
} from "./constants";
import {
  intFromBytes,
  isSafeNumber,
  strIsAscii,
  strIsDigit,
} from "./utilities";

import { AddressTypeError } from "./errors";

/**
 * A fast, lightweight IPv4/IPv6 manipulation library in TypeScript.
 *
 * This library is used to create/poke/manipulate IPv4 and IPv6 addresses
 * and networks.
 */

interface ComparableAddress {
  version: IPAddressBaseT["version"];
  _ip: BaseAddressT["_ip"];
  toString: () => string;
}

/**
 * The base of all IP addresses.
 * All IP addresses and networks should support these features.
 */
interface IPAddressBaseT {
  readonly version: 4 | 6;
  readonly exploded: () => string;
  readonly compressed: () => string;
  readonly reversePointer: () => string;
  readonly _checkIntAddress: (address: IPInteger) => void; // throws if invalid
  readonly _checkPackedAddress: (
    address: ByteArray,
    expectedLen: number
  ) => void; // throws if invalid
  // static
  readonly _ipIntFromPrefix: (prefixlen: number) => IPInteger;
  readonly _prefixFromIpInt: (ipInt: IPInteger) => number;
  readonly _reportInvalidNetmask: (netmaskStr: string) => void;
  readonly _prefixFromPrefixString: (prefixlenStr: string) => number;
  readonly _prefixFromIPString: (ipStr: string) => number;
  readonly _splitAddrPrefix: (address: unknown) => [string, number]; // TODO: fix parameter type
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
  readonly equals: (other: ComparableAddress) => boolean;
  readonly lessThan: (other: ComparableAddress) => boolean;
  // Shorthand for integer addition and subtraction. This is not
  // meant to ever support addition / subtraction of addresses.
  readonly add: (other: IPInteger) => IPInteger;
  readonly sub: (other: IPInteger) => IPInteger;
  readonly toRepresentation: () => string;
  readonly toString: () => string;
  readonly _getAddressKey: () => [number, BaseAddressT];
}

/**
 * A generic IP network object
 *
 * This IP interface the version independent methods which are
 * used by networks.
 */
export interface BaseNetworkT extends IPAddressBaseT {
  _addressClass: BaseAddressT;
  _getNetworkKey: () => [number, BaseAddressT, BaseAddressT];
  _isSubnetOf: (a: BaseNetworkT, b: BaseNetworkT) => boolean;
  _prefixlen: number;
  addressExclude: (other: BaseAddressT) => BaseNetworkT[];
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
  prefixlen: () => number;
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
  _netmaskCache: Record<string | number, BaseAddressT>;
  _explodeShorthandIpString: () => string;
  _makeNetmask: (arg: string | number) => Netmask;
  _ipIntFromString: (ip_str: string) => number;
  _parseOctet: (octet_str: string) => number;
  _stringFromIpInt: (ip_int: IPInteger) => string;
}

interface IPv4AddressT {
  packed: () => ByteArray;
  isReserved: () => boolean;
  isPrivate: () => boolean;
  isGlobal: () => boolean;
  isMulticast: () => boolean;
  isUnspecified: () => boolean;
  isLoopback: () => boolean;
  isLinkLocal: () => boolean;
}

export type Netmask = Record<string, never>;

export class IPv4Address implements BaseAddressT, BaseV4T, IPv4AddressT {
  readonly version = 4;
  readonly maxPrefixlen = IPv4LENGTH;
  static readonly _ALL_ONES = IPv4ALLONES;
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
  constructor(address: string | IPv4Integer | ByteArray) {
    if (typeof address === "number") {
      this._checkIntAddress(address);
      this._ip = address;
      return;
    }

    // Bytes array, a packed IP address
    if (Array.isArray(address)) {
      if (address.every((value) => typeof value === "number")) {
        this._checkPackedAddress(address, 4);
        const ip = intFromBytes(address, "big");
        if (typeof ip !== "number") {
          throw new AddressTypeError(
            `Invalid IPv4 address integer: ${ip} is of type ${typeof ip} instead of number`
          );
        }
        this._ip = ip;
      }
      throw new TypeError("Packed IP addresses must be arrays of numbers");
    }

    // we have a string or we assume it behaves like one.
    if (address.includes("/")) {
      throw new AddressTypeError(`Unexpected '/' in ${address}`);
    }

    this._ip = this._ipIntFromString(address);
  }

  // @ts-expect-error Temporary error while the remaining interface is implemented.
  _getAddressKey(this: IPv4Address): [number, IPv4Address] {
    return [this._ip, this];
  }

  /**
   * Turn the prefix length into a bitwise netmask.
   * @param prefixlen An integer, the prefix length.
   * @returns {IPInteger} An integer
   */
  _ipIntFromPrefix(prefixlen: number): IPInteger {
    const result =
      BigInt(IPv4Address._ALL_ONES) ^
      (BigInt(IPv4Address._ALL_ONES) >> BigInt(prefixlen));
    if (isSafeNumber(result)) {
      return Number(result);
    }
    return result;
  }

  /**
   * Turn the given IP string into an integer for comparison.
   *
   * @param address A string, the IP `address`.
   * @returns {number} The IP `address` as an integer.
   * @throws {AddressTypeError} If `address` isn't a valid IPv4 address.
   */
  _ipIntFromString(this: IPv4Address, ip_str: string): number {
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
      if (typeof parsedOctets !== "number") {
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
   * Check whether a numeric IP address is within the IPv4 range.
   * @param this The IPv4Address instance.
   * @param address The numeric address being checked.
   * @throws {AddressTypeError} If the address is below 0 or greater than the maximum
   * value for an IPv4 address.
   */
  _checkIntAddress(this: IPv4Address, address: IPInteger): void {
    if (address < 0) {
      const msg = `${address} (< 0) is not permitted as an IPv${this.version} address`;
      throw new AddressTypeError(msg);
    }
    if (address > IPv4Address._ALL_ONES) {
      const msg = `${address} (> 2**${this.maxPrefixlen}) is not permitted as an IPv${this.version} address`;
      throw new AddressTypeError(msg);
    }
  }

  /**
   * Check whether a byte array is of the same length as expected.
   * @param address The byte array containing the IP address.
   * @param expected_len The expected length of the byte array.
   * @throws {AddressTypeError} If address is not equal to the expected length.
   */
  _checkPackedAddress(address: ByteArray, expected_len: number): void {
    const address_len = address.length;
    if (address_len !== expected_len) {
      const msg = `'${address}' (len ${address_len} != ${expected_len}) is not permitted as an IPv${this.version} address.`;
      throw new AddressTypeError(msg);
    }
  }

  /**
   * Return the IP address as a number.
   * @returns {number} The numeric representation of the IP address.
   */
  toNumber(this: IPv4Address): number {
    return this._ip;
  }

  toRepresentation(this: IPv4Address): string {
    return `'${this.toString()}'`;
  }

  exploded(this: IPv4Address): string {
    return this.toString();
  }

  compressed(this: IPv4Address): string {
    return this.toString();
  }

  reversePointer(this: IPv4Address): string {
    const reversed = this.toString().split(".").reverse();
    return `${reversed.join(".")}.in-addr.arpa`;
  }

  /**
   * Is this IP address equal to another IP address? This only supports IPv4Address types
   * @param this The instance being compared against.
   * @param other The other IP address being compared.
   * @returns {boolean} true if the IP addresses are the same version
   * and numeric representation, false otherwise.
   */
  equals(this: IPv4Address, other: ComparableAddress): boolean {
    return this.version === other.version && this._ip === other._ip;
  }

  /**
   * Is this IP address less than another IP address?
   * @param this The instance being compared against.
   * @param other The other IP address being compared.
   * @returns {boolean} true if this is less than other.
   * @throws {TypeError} When the other object is not the same version.
   */
  lessThan(this: IPv4Address, other: ComparableAddress): boolean {
    if (this.version !== other.version) {
      throw new TypeError(
        `${this.toString()} and ${other.toString()} are not of the same version`
      );
    }
    return this._ip < other._ip;
  }

  add(this: IPv4Address, other: number | bigint): number | bigint {
    // Shorthand for integer addition and subtraction. This is not
    // meant to ever support addition / subtraction of addresses.
    switch (typeof other) {
      case "number":
        return this.toNumber() + other;
      case "bigint":
        return BigInt(this.toNumber()) + other;
      default:
        throw new TypeError(`Add not implemented for type: ${typeof other}`);
    }
  }

  sub(this: IPv4Address, other: number | bigint): number | bigint {
    // Shorthand for integer addition and subtraction. This is not
    // meant to ever support addition / subtraction of addresses.
    switch (typeof other) {
      case "number":
        return this.toNumber() - other;
      case "bigint":
        return BigInt(this.toNumber()) - other;
      default:
        throw new TypeError(`Add not implemented for type: ${typeof other}`);
    }
  }
}
