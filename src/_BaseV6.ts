import { IPv6AddressClass, IPv6Class, IPv6Instance } from "./interfaces";
import { NetmaskCacheKey, V6NetmaskCacheValue } from "./constants";
import { isBigInt, isNull, isNumber } from "./typeGuards";

import { AddressValueError } from "./AddressValueError";
import { IPv4Address } from "./IPv4Address";
import { IPv6Address } from "./IPv6Address";
import { IPv6Interface } from "./IPv6Interface";
import { IPv6Network } from "./IPv6Network";
import { isSuperset } from "./utilities";

export const _BaseV6Struct = {
  _makeNetmask: (
    cls: IPv6AddressClass,
    arg: NetmaskCacheKey
  ): V6NetmaskCacheValue => {
    if (cls._netmaskCache[arg] === undefined) {
      let prefixlen: number;
      if (isNumber(arg)) {
        prefixlen = arg;
        if (!(0 <= prefixlen && prefixlen <= cls._maxPrefixlen)) {
          cls._reportInvalidNetmask(prefixlen.toString(10));
        }
      } else {
        prefixlen = cls._prefixFromPrefixString(arg);
      }

      const netmask = new IPv6Address(cls._ipIntFromPrefix(prefixlen));
      cls._netmaskCache[arg] = [netmask, prefixlen];
    }

    return cls._netmaskCache[arg];
  },
  _ipBigIntFromString: (cls: IPv6AddressClass, ipStr: string): bigint => {
    if (ipStr.trim().length === 0) {
      throw new AddressValueError("Address cannot be empty");
    }

    const parts = ipStr.split(":");

    // An IPv6 address needs at least 2 colons (3 parts).
    const _minParts = 3;

    if (parts.length < _minParts) {
      const msg = `At least ${_minParts} expected in '${ipStr}'`;
      throw new AddressValueError(msg);
    }

    // If the address has an IPv4-style suffix, convert it to hexadecimal.
    const lastItem = parts.length - 1;
    if (parts[lastItem].includes(".")) {
      let ipv4Int: IPv4Address["_ip"];
      try {
        const popped = parts.pop();
        if (popped === undefined) {
          throw new Error("Unexpected undefined part");
        }
        ipv4Int = new IPv4Address(popped)._ip;
        parts.push(
          ((BigInt(ipv4Int) >> BigInt(16)) & BigInt(0xffff)).toString(16)
        );
        parts.push((BigInt(ipv4Int) & BigInt(0xffff)).toString(16));
      } catch (err: unknown) {
        if (err instanceof AddressValueError) {
          throw new AddressValueError(`${err.message} in '${ipStr}'`);
        }
      }
    }

    // An IPv6 address can't have more than 8 colons (9 parts).
    // The extra colon comes from using the "::" notation for a single
    // leading or trailing zero part.
    const _maxParts = cls._HEXTET_COUNT + 1;
    if (parts.length > _maxParts) {
      const msg = `At most ${_maxParts - 1} colons are permitted in '${ipStr}'`;
      throw new AddressValueError(msg);
    }

    // Disregarding the endpoints, find "::" with nothing in between.
    // This indicates that a run of zeroes has been skipped.
    let skipIndex: number | null = null;
    for (let i = 1; i < parts.length - 1; i++) {
      const element = parts[i];
      if (element.length === 0) {
        if (!isNull(skipIndex)) {
          // Can't have more than one "::"
          const msg = `At most one "::" permitted in '${ipStr}'`;
          throw new AddressValueError(msg);
        }
        skipIndex = i;
      }
    }

    let partsHi: number;
    let partsLo: number;
    let partsSkipped: number;
    // partsHi is the number of parts to copy from above/before the "::"
    // partsLo is the number of parts to copy from below/after the "::"
    if (!isNull(skipIndex)) {
      // If we found a "::", then check if it also covers the endpoints.
      partsHi = skipIndex;
      partsLo = parts.length - skipIndex - 1;
      if (parts[0].length === 0) {
        partsHi -= 1;
        if (partsHi) {
          const msg = `Leading ":" only permitted as part of "::" in '${ipStr}'`;
          throw new AddressValueError(msg); // ^: requires ^::
        }
      }

      const lastItem = parts.length - 1;
      if (parts[lastItem].length === 0) {
        partsLo -= 1;
        if (partsLo) {
          const msg = `Trailing ":" only permitted as part of "::" in '${ipStr}'`;
          throw new AddressValueError(msg); // :$ require ::$
        }
      }

      partsSkipped = cls._HEXTET_COUNT - (partsHi + partsHi);
      if (partsSkipped < 1) {
        const msg = `Expected at most ${
          cls._HEXTET_COUNT - 1
        } other parts with "::" in '${ipStr}'`;
        throw new AddressValueError(msg);
      }
    } else {
      // Otherwise, allocate the entire address to partsHi. The
      // endpoints could still be empty, but _parseHextet() will check
      // for that
      if (parts.length !== cls._HEXTET_COUNT) {
        const msg = `Exactly ${cls._HEXTET_COUNT} parts expected without "::" in '${ipStr}'`;
        throw new AddressValueError(msg);
      }

      if (parts[0].length === 0) {
        const msg = `Leading ":" only permitted as part of "::" in '${ipStr}'`;
        throw new AddressValueError(msg);
      }

      const lastItem = parts.length - 1;
      if (parts[lastItem].length === 0) {
        const msg = `Trailing ":" only permitted as part of "::" in '${ipStr}'`;
        throw new AddressValueError(msg);
      }

      partsHi = parts.length;
      partsLo = 0;
      partsSkipped = 0;
    }

    try {
      // now, parse the hextets into a 128-bit bigint.
      let ipInt = BigInt(0);
      for (let i = 0; i < partsHi; i++) {
        ipInt <<= BigInt(16);
        ipInt |= BigInt(cls._parseHextet(parts[i]));
      }
      ipInt <<= BigInt(16) * BigInt(partsSkipped);
      for (let i = -partsLo; i < 0; i++) {
        ipInt <<= BigInt(16);
        ipInt |= BigInt(cls._parseHextet(parts[i]));
      }
      return ipInt;
    } catch (err: unknown) {
      if (err instanceof Error) {
        throw new AddressValueError(`${err.message} in '${ipStr}'`);
      }
    }
    throw new Error("Unexpected error in _ipBigIntFromString");
  },
  _parseHextet: (cls: IPv6AddressClass, hextetStr: string): number => {
    // Reject non-ascii digits.
    if (!isSuperset(cls._HEX_DIGITS, hextetStr)) {
      throw new Error(`Only hex digits permitted in '${hextetStr}'`);
    }

    // We do the length check second, since the invalid character error
    // is likely to be more informative for the user
    if (hextetStr.length > 4) {
      const msg = `At most 4 characters permitted in '${hextetStr}'`;
      throw new Error(msg);
    }

    // Length check means we can skip checking the integer value
    const parsed = parseInt(hextetStr, 16);
    if (isNaN(parsed)) {
      throw new Error("Unexpected NaN in hextet str");
    }
    return parsed;
  },
  _compressHextets: (hextets: string[]): string[] => {
    let bestDoublecolonStart = -1;
    let bestDoublecolonLen = 0;
    let doublecolonStart = -1;
    let doubleColonLen = 0;

    for (let index = 0; index < hextets.length; index++) {
      const hextet = hextets[index];
      if (hextet === "0") {
        doubleColonLen += 1;
        if (doublecolonStart === -1) {
          // Start of a sequence of zeroes.
          doublecolonStart = index;
        }
        if (doubleColonLen > bestDoublecolonLen) {
          // This is the longest sequence of zeroes so far.
          bestDoublecolonLen = doubleColonLen;
          bestDoublecolonStart = doublecolonStart;
        }
      }
    }

    if (bestDoublecolonLen > 1) {
      const bestDoublecolonEnd = bestDoublecolonStart + bestDoublecolonLen;
      // For zeroes at the end of the address
      if (bestDoublecolonEnd === hextets.length) {
        hextets.push("");
      }
      hextets.splice(bestDoublecolonStart, bestDoublecolonEnd, "");
      // For zeroes at the beginning of the address.
      if (bestDoublecolonStart === 0) {
        hextets = [""].concat(hextets);
      }
    }
    return hextets;
  },
  _stringFromIpInt: (
    cls: IPv6AddressClass,
    ipInt: bigint | null = null
  ): string => {
    // @ts-expect-error I don't know why cls._ip has a numeric IP....
    if (isNull(ipInt) && (isBigInt(cls._ip) || isNumber(cls._ip))) {
      // @ts-expect-error I don't know why cls._ip has a numeric IP....
      ipInt = cls._ip;
    }

    if (isNull(ipInt)) {
      throw new Error("ipInt cannot be null");
    }

    if (ipInt > cls._ALL_ONES) {
      throw new Error("IPv6 Address is too large");
    }

    const hexStr = `${ipInt.toString(16)}${"0".repeat(32)}`.slice(0, 32);
    let hextets = [];
    for (let x = 0; x < 32; x + 4) {
      const hextet = parseInt(hexStr.slice(x, x + 4), 16).toString(16);
      hextets.push(hextet);
    }
    hextets = cls._compressHextets(hextets);
    return hextets.join(":");
  },
  _explodeShorthandIpString: <C extends IPv6Class, O extends IPv6Instance>(
    cls: C,
    obj: O
  ): string => {
    let ipStr: string;
    if (obj instanceof IPv6Network) {
      ipStr = obj.networkAddress.toString();
    } else if (obj instanceof IPv6Interface) {
      ipStr = obj.ip.toString();
    } else {
      ipStr = obj.toString();
    }

    const ipInt = cls._ipBigIntFromString(ipStr);
    const hexStr = `${ipInt.toString(16)}${"0".repeat(32)}`.slice(0, 32);
    const parts = [];
    for (let x = 0; x < 32; x + 4) {
      const part = hexStr.slice(x, x + 4);
      parts.push(part);
    }
    if (obj instanceof IPv6Interface || obj instanceof IPv6Network) {
      return `${parts.join(":")}/${obj._prefixlen}`;
    }
    return parts.join(":");
  },
  _reversePointer: (obj: IPv6Instance): string => {
    const reverseChars = obj.exploded
      .split("")
      .reverse()
      .join("")
      .replace(":", ".");
    return `${reverseChars.split("").join(".")}.ip6.arpa`;
  },
};
