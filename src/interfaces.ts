import {
  IPInteger,
  IPVersion,
  IPv4LENGTH,
  IPv6LENGTH,
  NetmaskCacheKey,
  NetmaskCacheValue,
  Prefixlen,
} from "./constants";

import { IPv4Address } from "./IPv4Address";
import { IPv4Network } from "./IPv4Network";
import { _IPAddressBaseT } from "./_IPAddressBase";

export type IPv4AddressClass = typeof IPv4Address;
export type IPv4AddressInstance = IPv4Address;

export type AddressClass = IPv4AddressClass;
export type AddressInstance = IPv4AddressInstance;

export type NetworkClass = typeof IPv4Network;
export type NetworkInstance = IPv4Network;

export interface HasNetworkAddress {
  networkAddress: IPv4Address;
}

export interface NetworkObj extends HasNetworkAddress, Stringable {
  version: IPVersion;
  prefixlen: number;
  netmask: IPv4Address;
  hostmask: IPv4Address;
}

export interface NetworkContainer {
  contains: (other: NetworkObj & HasIP) => boolean;
}

export interface MayIterHosts extends HasNetworkAddress {
  _addressClass: typeof IPv4Address;
  broadcastAddress: IPv4Address;
}

export interface Stringable {
  toString: () => string;
}

export interface Numberable {
  toNumber: () => IPInteger;
}

export interface PrefixLengthable {
  maxPrefixlen: number;
}

export interface HasVersion {
  version: IPVersion;
}

export interface HasIP {
  _ip: IPInteger;
}

export interface ConvertsToString extends HasIP {
  _stringFromIpInt(ipInt: IPInteger): string;
}

export type Comparable = HasIP & HasVersion & Stringable;

export interface Versionable extends HasVersion, PrefixLengthable {
  _ALL_ONES: IPInteger;
}

export interface PrefixToPrefixStringable extends Versionable {
  _reportInvalidNetmask: _IPAddressBaseT["_reportInvalidNetmask"];
}

export interface PrefixToIPStringable
  extends PrefixToPrefixStringable,
    Pick<_IPAddressBaseT, "_prefixFromIpInt"> {
  _ipIntFromString: (ipStr: string) => number;
}

export interface Explodable {
  _explodeShorthandIpString: () => string;
}

export interface ReversePointerable {
  _reversePointer: () => string;
}

export interface SupportsOctetParsing {
  _parseOctet: (typeof IPv4Address)["_parseOctet"];
}

export interface Netmaskable {
  maxPrefixlen: typeof IPv4LENGTH | typeof IPv6LENGTH;
  _netmaskCache: Record<NetmaskCacheKey, NetmaskCacheValue>;
  _prefixFromPrefixString: (prefixlenStr: string) => Prefixlen;
  _prefixFromIpString: (ipStr: string) => Prefixlen;
  _ipIntFromPrefix: (prefixlen: Prefixlen) => IPInteger;
}
