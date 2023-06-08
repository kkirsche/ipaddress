import { IPv4Address, NetmaskValueError } from "./internal";
import { IPv4AddressClass, IPv4NetworkClass, Stringable } from "./interfaces";
import { intFromBytes, intToBytes, strIsAscii, strIsDigit } from "./utilities";
import { isNumber, isUndefined } from "./typeGuards";

import { AddressValueError } from "./AddressValueError";
import { V4NetmaskCacheValue } from "./constants";

export const _BaseV4Struct = {
  _explodeShorthandIpString: (obj: Stringable) => obj.toString(),
  _makeNetmask: (
    cls: IPv4AddressClass | IPv4NetworkClass,
    arg: string | number
  ): V4NetmaskCacheValue => {
    let prefixlen: number;
    if (cls._netmaskCache[arg] === undefined) {
      if (isNumber(arg)) {
        prefixlen = arg;
        if (!(0 <= prefixlen && prefixlen <= cls._maxPrefixlen)) {
          throw new NetmaskValueError(`${prefixlen} is not a valid netmask`);
        }
      } else {
        try {
          prefixlen = cls._prefixFromPrefixString(arg);
        } catch (err: unknown) {
          // Check for a netmask or hostmask in dotted-quad form.
          // This may raise NetmaskTypeError
          prefixlen = cls._prefixFromIpString(arg);
        }
      }
      const netmask = new IPv4Address(cls._ipIntFromPrefix(prefixlen));
      cls._netmaskCache[arg] = [netmask, prefixlen];
    }
    const result = cls._netmaskCache[arg];
    if (isUndefined(result)) {
      throw new Error("Unexpected cache miss");
    }

    return result;
  },
  /**
   * Turn the given IP string into an integer for comparison.
   *
   * @param address A string, the IP `address`.
   * @returns {number} The IP `address` as an integer.
   * @throws {AddressTypeError} If `address` isn't a valid IPv4 address.
   */
  _ipIntFromString: (
    cls: IPv4AddressClass | IPv4NetworkClass,
    ipStr: string
  ): number => {
    if (ipStr === "") {
      throw new AddressValueError("Address cannot be empty");
    }

    const octets = ipStr.split(".");
    if (octets.length !== 4) {
      throw new AddressValueError(`Expected 4 octets in ${ipStr}`);
    }

    try {
      const parsedOctets = intFromBytes(
        octets.map((octet) => cls._parseOctet(octet)),
        "big" // big-endian / network-byte order
      );
      if (!isNumber(parsedOctets)) {
        throw new AddressValueError(
          `Invalid IPv4 address integer: ${parsedOctets} is of type ${typeof parsedOctets} instead of number`
        );
      }
      return parsedOctets;
    } catch (error: unknown) {
      let message = `Unknown error occurred while parsing ${ipStr}.`;
      if (error instanceof Error) message = `${error.message} in ${ipStr}`;
      throw new AddressValueError(message);
    }
  },
  /**
   * Convert a decimal octet to an integer.
   * @param octet A string, the number to parse.
   * @returns {number} The octet as an integer.
   * @throws {TypeError} if the octet isn't strictly a decimal from [0..255].
   */
  _parseOctet: (octetStr: string): number => {
    if (octetStr === "") {
      throw new TypeError("Empty octet is not permitted.");
    }
    // Reject non-ASCII digits.
    if (!strIsAscii(octetStr) && !strIsDigit(octetStr)) {
      throw new TypeError(`Only decimal digits permitted in '${octetStr}'`);
    }

    // We do length check second, since the invalid character error
    // is likely to be more informative for the user
    if (octetStr.length > 3) {
      throw new TypeError(`At most 3 characters permitted in '${octetStr}'`);
    }

    // Handle leading zeroes as strict as glibc's inet_pton()
    // See security bug in Python's issue tracker, bpo-36384
    if (octetStr !== "0" && octetStr.indexOf("0") === 0) {
      throw new TypeError(`Leading zeroes are not permitted in '${octetStr}'`);
    }

    // Convert the integer (we know digits are legal)
    const octetInt = parseInt(octetStr, 10);
    if (octetInt > 255) {
      throw new TypeError(`Octet ${octetInt} (> 255) not permitted`);
    }

    return octetInt;
  },
  /**
   * Turns a 32-bit integer into dotted decimal notation.
   * @param ip_int An integer, the IP address.
   * @returns {string} The IP address in dotted decimal notation.
   */
  _stringFromIpInt: (ipInt: number): string => {
    return intToBytes(ipInt, 4, "big")
      .map((byte) => byte.toString())
      .join(".");
  },
  _reversePointer: (obj: _reversePointerParam): string => {
    return `${obj.toString().split(".").reverse().join(".")}.in-addr.arpa`;
  },
};

interface _reversePointerParam {
  toString: () => string;
}
