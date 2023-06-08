export type ByteArray = number[];
export type ByteOrder = "big" | "little";

export type Netmask = {
  netmask: IPv4AddressT;
  prefixlen: number;
};

export type UnparsedIPv4Address = string | number | ByteArray;
export type UnparsedIPv6Address = string | bigint | ByteArray;

export type UnparsedAddress = UnparsedIPv4Address | UnparsedIPv6Address;

export type UnparsedIPv4Network =
  | UnparsedIPv4Address
  | [UnparsedIPv4Address, number]; // [addr, mask]
export type UnparsedIPv6Network =
  | UnparsedIPv6Address
  | [UnparsedIPv6Address, number]; // [addr, mask]
export type UnparsedNetwork = UnparsedIPv4Network | UnparsedIPv6Network;

export type NetmaskCacheKey = string | number;
export type Prefixlen = number;
export type V4NetmaskCacheValue = [IPv4AddressT, Prefixlen];
export type V6NetmaskCacheValue = [IPv6AddressT, Prefixlen];

export interface _IPAddressBaseClsT {
  _ipIntFromPrefix:
    | ((prefixlen: Prefixlen) => number)
    | ((prefixlen: Prefixlen) => bigint);
  _prefixFromIpInt:
    | ((ipInt: number) => Prefixlen)
    | ((ipInt: bigint) => number);
  _reportInvalidNetmask: (netmaskStr: string) => never;
  _prefixFromPrefixString: (prefixlenStr: string) => Prefixlen;
  _prefixFromIpString: (ipStr: string) => number;
  _splitAddrPrefix: (
    address: UnparsedIPv4Address
  ) =>
    | [UnparsedIPv4Address, Prefixlen]
    | ((address: UnparsedIPv4Network) => [UnparsedIPv4Address, Prefixlen])
    | ((address: UnparsedIPv6Address) => [UnparsedIPv6Address, Prefixlen])
    | ((address: UnparsedIPv6Network) => [UnparsedIPv6Address, Prefixlen]);
}

export interface _IPAddressBaseT {
  exploded: string;
  compressed: string;
  reversePointer: string;
  version: 4 | 6;
  _checkIntAddress: ((address: number) => void) | ((address: bigint) => void);
  _checkPackedAddress: (address: ByteArray, expectedLen: number) => void;
}

export type _BaseAddressClsT = _IPAddressBaseClsT;

export interface _BaseAddressT extends _IPAddressBaseT {
  toNumber: () => number | (() => bigint);
  equals: (other: _BaseAddressT) => boolean;
  lessThan: (other: _BaseAddressT) => boolean;
  add: (other: _BaseAddressT) => number | ((other: _BaseAddressT) => bigint);
  sub: (other: _BaseAddressT) => number | ((other: _BaseAddressT) => bigint);
  toRepr: () => string;
  toString: () => string;
  _getAddressKey: () => [4, _BaseAddressT] | [6, _BaseAddressT];
}

export type _BaseNetworkClsT = _IPAddressBaseClsT;
export interface _BaseNetworkT extends _IPAddressBaseT {
  toRepr: () => string;
  toString: () => string;
  // hosts: Generator<IPv4AddressT> | Generator<IPv6AddressT>
  // iterate: Generator<IPv4AddressT> | Generator<IPv6AddressT>
  getItem: (n: number) => IPv4AddressT | IPv6AddressT;
}

interface _BaseT {
  _explodeShorthandIpString: () => string;
  _reversePointer: () => string;
}

export interface _BaseV4ClsT {
  _version: 4;
  _ALL_ONES: number;
  _maxPrefixlen: 32;
  _netmaskCache: Record<NetmaskCacheKey, V4NetmaskCacheValue>;
  _makeNetmask: (arg: NetmaskCacheKey) => V4NetmaskCacheValue;
  _ipIntFromString: (ipStr: string) => number;
  _parseOctet: (octet: string) => number;
  _stringFromIpInt: (ipInt: number) => string;
}

export interface _BaseV4T extends _BaseT {
  version: 4;
  maxPrefixlen: 32;
}

export interface _BaseV6ClsT {
  _version: 6;
  _ALL_ONES: bigint;
  _HEXTET_COUNT: 8;
  _HEX_DIGITS: Set<string>;
  _maxPrefixlen: 128;
  _netmaskCache: Record<NetmaskCacheKey, V6NetmaskCacheValue>;
  _makeNetmask: (arg: NetmaskCacheKey) => V6NetmaskCacheValue;
  _ipIntFromString: (ipStr: string) => bigint;
  _parseHextet: (hextet: string) => number;
  _compressHextets: (hextets: string[]) => string[];
  _stringFromIpInt: (ipInt: bigint) => string;
  _splitScopeId: (ipStr: string) => [string, string | null];
}

export interface _BaseV6T extends _BaseT {
  version: 6;
  maxPrefixlen: 128;
}

export type _BaseVAny = _BaseV4T | _BaseV6T;
export type _BaseVAnyCls = _BaseV4ClsT | _BaseV6ClsT;

export interface IPv4AddressClsT
  extends _BaseV4ClsT,
    Omit<_BaseAddressClsT, "_splitAddrPrefix"> {
  _ipIntFromPrefix: (prefixlen: Prefixlen) => number;
  _prefixFromIpInt: (ipInt: number) => number;
  _splitAddrPrefix: (
    address: UnparsedIPv4Address
  ) => [UnparsedIPv4Address, Prefixlen];
}

type OmittedInAddresses =
  | "version"
  | "toNumber"
  | "_getAddressKey"
  | "add"
  | "sub"
  | "lessThan"
  | "equals";

export interface IPv4AddressT
  extends _BaseV4T,
    Omit<_BaseAddressT, OmittedInAddresses> {
  _ip: number;
  _checkIntAddress: (address: number) => void;
  toNumber: () => number;
  equals: (other: IPv4AddressT) => boolean;
  lessThan: (other: IPv4AddressT) => boolean;
  _getAddressKey: () => [4, IPv4AddressT];
  add: (other: IPv4AddressT) => number;
  sub: (other: IPv4AddressT) => number;
}
export interface IPv6AddressClsT
  extends _BaseV6ClsT,
    Omit<_BaseAddressClsT, "_splitAddrPrefix"> {
  _ipIntFromPrefix: (prefixlen: Prefixlen) => bigint;
  _prefixFromIpInt: (ipInt: bigint) => number;
  _splitAddrPrefix: (
    address: UnparsedIPv6Address
  ) => [UnparsedIPv6Address, Prefixlen];
}

export interface IPv6AddressT
  extends _BaseV6T,
    Omit<_BaseAddressT, OmittedInAddresses> {
  _ip: bigint;
  _scopeId: string | null;
  _checkIntAddress: (address: bigint) => void;
  toNumber: () => bigint;
  equals: (other: IPv6AddressT) => boolean;
  lessThan: (other: IPv6AddressT) => boolean;
  _getAddressKey: () => [6, IPv6AddressT];
  add: (other: IPv6AddressT) => bigint;
  sub: (other: IPv6AddressT) => bigint;
}

export type IPvAnyAddressClsT = IPv4AddressClsT | IPv6AddressClsT;
export type IPvAnyAddressT = IPv4AddressT | IPv6AddressT;

export interface IPv4NetworkClsT extends _BaseV4ClsT, _BaseNetworkClsT {}
export interface IPv4NetworkT extends _BaseV4T, Omit<_BaseNetworkT, "version"> {
  networkAddress: IPv4AddressT;
  netmask: IPv4AddressT;
  _prefixlen: number;
}

export interface IPv6NetworkClsT extends _BaseV6ClsT, _BaseNetworkClsT {}
export interface IPv6NetworkT extends _BaseV6T, Omit<_BaseNetworkT, "version"> {
  networkAddress: IPv6AddressT;
  netmask: IPv6AddressT;
  _prefixlen: number;
}

export type IPvAnyNetworkClsT = IPv4NetworkClsT | IPv6NetworkClsT;
export type IPvAnyNetworkT = IPv4NetworkT | IPv6NetworkT;
