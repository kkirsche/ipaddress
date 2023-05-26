import { IPInteger, IPv4ALLONES, IPv4LENGTH } from "./constants";

/**
 * The base of all IP addresses.
 * All IP addresses and networks should support these features.
 */
interface IPAddressBase {
  readonly exploded: string;
  readonly compressed: string;
  readonly reversePointer: string;
  readonly version: number;
  readonly _checkIntAddress: (address: IPInteger) => void; // throws if invalid
  readonly _checkPackedAddress: (
    address: IPInteger,
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
interface BaseAddress extends IPAddressBase {
  _ip: number;
  readonly equals: (other: object) => boolean;
  readonly lessThan: (other: object) => boolean;
  // Shorthand for integer addition and subtraction. This is not
  // meant to ever support addition / subtraction of addresses.
  readonly add: (other: number | bigint) => number | bigint;
  readonly sub: (other: number | bigint) => number | bigint;
  readonly toRepresentation: () => string;
  readonly toString: () => string;
  readonly _getAddressKey: () => [number, BaseAddress];
}

/**
 * A generic IP network object
 *
 * This IP interface the version independent methods which are
 * used by networks.
 */
export interface BaseNetwork extends IPAddressBase {
  _addressClass: BaseAddress;
  _getNetworkKey: () => [number, BaseAddress, BaseAddress];
  _isSubnetOf: (a: BaseNetwork, b: BaseNetwork) => boolean;
  _prefixlen: number;
  addressExclude: (other: BaseAddress) => BaseNetwork[];
  broadcastAddress: () => BaseAddress;
  compareNetworks: (other: BaseNetwork) => -1 | 0 | 1;
  contains: (other: BaseNetwork) => boolean;
  get: (n: number) => BaseAddress;
  hosts: Generator<BaseAddress, BaseAddress[], never>;
  hostmask: () => BaseAddress;
  isGlobal: () => boolean;
  isLinkLocal: () => boolean;
  isLoopback: () => boolean;
  isMulticast: () => boolean;
  isPrivate: () => boolean;
  isReserved: () => boolean;
  isUnspecified: () => boolean;
  map: Generator<BaseAddress, BaseAddress[], never>; // equivalent to python's __iter__
  numAddresses: () => number; // does this need to return a bigint?
  overlaps: (other: BaseNetwork) => boolean;
  prefixlen: () => number;
  subnets: (prefixlenDiff?: number, newPrefix?: number) => BaseNetwork;
  supernet: (prefixlenDiff?: number, newPrefix?: number) => BaseNetwork;
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
export interface BaseV4 {
  readonly _version: 4;
  readonly _ALL_ONES: typeof IPv4ALLONES;
  readonly _maxPrefixlen: typeof IPv4LENGTH;
  _netmaskCache: Record<string | number, BaseAddress>;
  _explodeShorthandIpString: () => string;
}
