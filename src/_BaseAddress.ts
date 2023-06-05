import {
  Comparable,
  ConvertsToString,
  HasIP,
  Numberable,
  Stringable,
} from "./interfaces";
import { IPInteger, IPVersion } from "./constants";

import { _IPAddressBaseT } from "./_IPAddressBase";
import { isSafeNumber } from "./utilities";

/**
 * A generic IP object.
 *
 * This IP class contains the the version independent methods which are
 * used by single IP addresses.
 */
export interface _BaseAddressT extends _IPAddressBaseT {
  toNumber: () => IPInteger;
  equals: (other: Comparable) => boolean;
  lessThan: (other: Comparable) => boolean;
  add: (other: _BaseAddressT) => IPInteger;
  sub: (other: _BaseAddressT) => IPInteger;
  toRepr: () => string;
  toString: () => string;
  // Hash is excluded
  //   toHash: () => bigint;
  _getAddressKey: () => [IPVersion, _BaseAddressT];
}

export function _baseToNumber(obj: HasIP): IPInteger {
  return obj._ip;
}

export function _baseEquals(obj: Comparable, other: Comparable): boolean {
  return obj.version === other.version && obj._ip === other._ip;
}

export function _baseLessThan(obj: Comparable, other: Comparable): boolean {
  if (obj.version !== other.version) {
    throw new TypeError(
      `${obj.toString()} and ${other.toString()} are not of the same version`
    );
  }

  if (obj._ip !== other._ip) {
    return obj._ip < other._ip;
  }

  return false;
}

export function baseAdd(obj: Numberable, other: Numberable): IPInteger {
  const result = BigInt(obj.toNumber()) + BigInt(other.toNumber());
  if (isSafeNumber(result)) {
    return Number(result);
  }

  return result;
}

export function baseSub(obj: Numberable, other: Numberable): IPInteger {
  const result = BigInt(obj.toNumber()) - BigInt(other.toNumber());
  if (isSafeNumber(result)) {
    return Number(result);
  }

  return result;
}

export function _baseToRepr(clsName: string, obj: Stringable): string {
  return `${clsName}('${obj.toString()}')`;
}

export function _baseToString(obj: ConvertsToString): string {
  return obj._stringFromIpInt(obj._ip);
}

export function _baseGetAddressKey(
  obj: _BaseAddressT
): [IPVersion, _BaseAddressT] {
  return [obj.version, obj];
}
