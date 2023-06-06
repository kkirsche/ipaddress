import {
  Comparable,
  ConvertsToString,
  HasIP,
  Numberable,
  Stringable,
  Versionable,
} from "./interfaces";
import { IPInteger, IPVersion } from "./constants";

import { isSafeNumber } from "./utilities";

/**
 * A generic IP object.
 *
 * This IP class contains the the version independent methods which are
 * used by single IP addresses.
 */

export const _BaseAddressStruct = {
  // instance methods
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
  _getAddressKey: <T extends Versionable>(obj: T): [IPVersion, T] => {
    return [obj.version, obj];
  },
};
