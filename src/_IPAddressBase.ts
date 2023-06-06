// https://github.com/python/cpython/blob/eb0ce92141cd14196a8922cfe9df4a713c5c1d9b/Lib/ipaddress.py#L383

import {
  AddressClass,
  Explodable,
  NetworkClass,
  ReversePointerable,
  Stringable,
} from "./interfaces";
import { AddressTypeError, NetmaskTypeError } from "./errors";
import {
  ByteArray,
  IPInteger,
  IPVersion,
  Prefixlen,
  UnparsedAddress,
  UnparsedNetwork,
} from "./constants";
import {
  _countRighthandZeroBits,
  _splitOptionalNetmask,
  intToBytes,
  isSafeNumber,
  strIsAscii,
  strIsDigit,
} from "./utilities";
import { isBigInt, isByteArray, isNumber, isString } from "./typeGuards";
/**
 * The mother class
 */
export interface _IPAddressBaseT {
  new (): _IPAddressBaseTInstance;
  // class methods
  _ipIntFromPrefix: (prefixlen: Prefixlen) => IPInteger;
  _prefixFromIpInt: (ipInt: IPInteger) => Prefixlen;
  _reportInvalidNetmask: (netmaskStr: string) => never;
  _prefixFromPrefixString: (prefixlenStr: string) => Prefixlen;
  _prefixFromIpString: (ipStr: string) => Prefixlen;
  _splitAddrPrefix: (
    address: string | IPInteger | ByteArray
  ) => [string | IPInteger | ByteArray, number];
}

export interface _IPAddressBaseTInstance {
  // @property
  exploded: string;
  compressed: string;
  reversePointer: string;
  version: IPVersion;
  // instance
  _checkIntAddress: (address: IPInteger) => void; // throws if invalid
  _checkPackedAddress: (address: ByteArray, expectedLen: number) => void;
}

export const _IPAddressBaseStruct = {
  // @property
  exploded: (self: Explodable): string => {
    return self._explodeShorthandIpString();
  },
  compressed: (obj: Stringable): string => {
    return obj.toString();
  },
  reversePointer: (obj: ReversePointerable): string => {
    return obj._reversePointer();
  },
  // instance
  _checkIntAddress: (
    cls: AddressClass | NetworkClass,
    address: IPInteger
  ): void => {
    if (address < 0) {
      const msg = `${address} (< 0) is not permitted as an IPv${cls._version} address`;
      throw new AddressTypeError(msg);
    }
    if (address > cls._ALL_ONES) {
      const msg = `${address} (> 2**${cls._maxPrefixlen}) is not permitted as an IPv${cls._version} address`;
      throw new AddressTypeError(msg);
    }
  }, // throws if invalid
  _checkPackedAddress: (
    cls: AddressClass | NetworkClass,
    address: ByteArray,
    expectedLen: number
  ): void => {
    const addressLen = address.length;
    if (addressLen !== expectedLen) {
      const msg = `'${address}' (len ${addressLen} != ${expectedLen}) is not permitted as an IPv${cls._version} address.`;
      throw new AddressTypeError(msg);
    }
  },
  // class methods
  _ipIntFromPrefix: (
    cls: AddressClass | NetworkClass,
    prefixlen: number
  ): IPInteger => {
    const result =
      BigInt(cls._ALL_ONES) ^ (BigInt(cls._ALL_ONES) >> BigInt(prefixlen));
    if (isSafeNumber(result)) {
      return Number(result);
    }
    return result;
  },
  _prefixFromIpInt: (
    cls: AddressClass | NetworkClass,
    ipInt: IPInteger
  ): number => {
    const trailingZeroes = _countRighthandZeroBits(ipInt, cls._maxPrefixlen);
    const prefixlen = cls._maxPrefixlen - trailingZeroes;
    const leadingOnes = BigInt(ipInt) >> BigInt(trailingZeroes);
    const allOnes = (BigInt(1) << BigInt(prefixlen)) - BigInt(1);
    if (leadingOnes !== allOnes) {
      const byteslen = Math.floor(cls._maxPrefixlen / 8);
      const details = intToBytes(ipInt, byteslen, "big");
      const msg = `Netmask pattern '${details.toString()}' mixes zeroes & ones`;
      throw new TypeError(msg);
    }
    return prefixlen;
  },
  _reportInvalidNetmask: (netmaskStr: string): never => {
    const msg = `${netmaskStr} is not a valid netmask`;
    throw new NetmaskTypeError(msg);
  },
  _prefixFromPrefixString: (
    cls: AddressClass | NetworkClass,
    prefixlenStr: string
  ): number => {
    // parseInt allows leading +/- as well as surrounding whitespace,
    // so we ensure that isn't the case
    if (!(strIsAscii(prefixlenStr) && strIsDigit(prefixlenStr))) {
      cls._reportInvalidNetmask(prefixlenStr);
    }

    const prefixlen = parseInt(prefixlenStr);
    if (!Number.isFinite(prefixlen)) {
      cls._reportInvalidNetmask(prefixlenStr);
    }
    if (!(0 <= prefixlen && prefixlen <= cls._maxPrefixlen)) {
      cls._reportInvalidNetmask(prefixlenStr);
    }

    return prefixlen;
  },
  _prefixFromIpString: (cls: AddressClass, ipStr: string): number => {
    // Parse the netmask/hostmask like an IP address.
    let ipInt = -1;
    try {
      ipInt = cls._ipIntFromString(ipStr);
    } catch (err: unknown) {
      if (err instanceof AddressTypeError) {
        cls._reportInvalidNetmask(ipStr);
      }
    }

    // Try matching a netmask (this would be /1*0*/ as a bitwise regexp).
    // Note that the two ambiguous cases (all-ones and all-zeroes) are
    // treated as netmasks.
    try {
      return cls._prefixFromIpInt(ipInt);
    } catch (err: unknown) {
      if (!(err instanceof TypeError)) {
        throw err;
      }
    }

    // Invert the bits, and try matching a /0+1+/ hostmask instead.
    const inverted = BigInt(ipInt) ^ BigInt(cls._ALL_ONES);
    try {
      return cls._prefixFromIpInt(inverted);
    } catch (err: unknown) {
      cls._reportInvalidNetmask(ipStr);
    }
  },
  _splitAddrPrefix,
};

function _splitAddrPrefix(
  address: UnparsedAddress | UnparsedNetwork,
  prefixlen: Prefixlen
): [UnparsedAddress, Prefixlen] {
  // a packed address or integer
  if (isNumber(address) || isBigInt(address) || isByteArray(address)) {
    return [address, prefixlen];
  }

  const addressArray = isString(address)
    ? _splitOptionalNetmask(address)
    : address;
  return [addressArray[0], prefixlen];
}
