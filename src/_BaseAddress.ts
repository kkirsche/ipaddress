import {
  Comparable,
  ConvertsToString,
  HasIP,
  Numberable,
  Stringable,
} from "./interfaces";
import { IPInteger, IPVersion } from "./constants";
import { _IPAddressBaseT, _IPAddressBaseTInstance } from "./_IPAddressBase";

import { isSafeNumber } from "./utilities";

/**
 * A generic IP object.
 *
 * This IP class contains the the version independent methods which are
 * used by single IP addresses.
 */
export interface _BaseAddressT extends _IPAddressBaseT {
  new (): _BaseAddressTInstance;
}

export interface _BaseAddressTInstance extends _IPAddressBaseTInstance {
  toNumber: () => IPInteger;
  equals: (other: Comparable) => boolean;
  lessThan: (other: Comparable) => boolean;
  add: (other: _BaseAddressT) => IPInteger;
  sub: (other: _BaseAddressT) => IPInteger;
  toRepr: () => string;
  toString: () => string;
  // toHash: () => bigint;
  _getAddressKey: () => [IPVersion, _BaseAddressT];
}

export const _BaseAddressStruct = {
  toNumber: (obj: HasIP): IPInteger => {
    return obj._ip;
  },
  equals: (obj: Comparable, other: Comparable): boolean => {
    return obj.version === other.version && obj._ip === other._ip;
  },
  lessThan: (obj: Comparable, other: Comparable): boolean => {
    if (obj.version !== other.version) {
      throw new TypeError(
        `${obj.toString()} and ${other.toString()} are not of the same version`
      );
    }

    if (obj._ip !== other._ip) {
      return obj._ip < other._ip;
    }

    return false;
  },
  add: (obj: Numberable, other: Numberable): IPInteger => {
    const result = BigInt(obj.toNumber()) + BigInt(other.toNumber());
    if (isSafeNumber(result)) {
      return Number(result);
    }

    return result;
  },
  sub: (obj: Numberable, other: Numberable): IPInteger => {
    const result = BigInt(obj.toNumber()) - BigInt(other.toNumber());
    if (isSafeNumber(result)) {
      return Number(result);
    }

    return result;
  },
  toRepr: (clsName: string, obj: Stringable): string => {
    return `${clsName}('${obj.toString()}')`;
  },
  toString: (obj: ConvertsToString): string => {
    return obj._stringFromIpInt(obj._ip);
  },
  _getAddressKey: (
    obj: _BaseAddressTInstance
  ): [IPVersion, _BaseAddressTInstance] => {
    return [obj.version, obj];
  },
};
