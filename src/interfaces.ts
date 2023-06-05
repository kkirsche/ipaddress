import { IPInteger } from "./constants";
import { _IPAddressBaseT } from "./_IPAddressBase";

export interface Stringable {
  toString: () => string;
}

export interface Numberable {
  toNumber: () => IPInteger;
}

export interface PrefixLengthable {
  maxPrefixlen: number;
}

export type HasVersion = Pick<_IPAddressBaseT, "version">;

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
  _reversePointer: string;
}
