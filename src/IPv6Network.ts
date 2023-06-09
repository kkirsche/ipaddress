import {
  ByteArray,
  Prefixlen,
  UnparsedIPv6Address,
  UnparsedIPv6Network,
} from "./interfaces";
import { IPv6ALLONES, IPv6LENGTH } from "./constants";
import {
  _countRighthandZeroBits,
  _splitOptionalNetmask,
  intToBytes,
  isSafeNumber,
  isSuperset,
  strIsAscii,
  strIsDigit,
} from "./utilities";
import {
  isBigInt,
  isByteArray,
  isNull,
  isNumber,
  isString,
} from "./typeGuards";

import { AddressValueError } from "./00-AddressValueError";
import { IPv4Address } from "./01-IPv4Address";
import { IPv6Address } from "./IPv6Address";
import { NetmaskValueError } from "./NetmaskValueError";

export class IPv6Network {
  static readonly _version = 6;
  static readonly _ALL_ONES = IPv6ALLONES;
  static readonly _HEXTET_COUNT = 8;
  static readonly _HEX_DIGITS = new Set("0123456789ABCDEFabcdef");
  static readonly _maxPrefixlen = IPv6LENGTH;
  static _netmaskCache: Record<string | number, [IPv6Address, Prefixlen]> = {};

  // class to use when creating address objects
  static readonly _addressClass = IPv6Address;

  networkAddress: IPv6Address;
  netmask: IPv6Address;
  _prefixlen: number;

  constructor(address: UnparsedIPv6Network, strict = true) {
    const [addr, mask] = IPv6Network._splitAddrPrefix(address);
    this.networkAddress = new IPv6Address(addr);
    const [_mask, _prefix] = IPv6Network._makeNetmask(mask);
    this.netmask = _mask;
    this._prefixlen = _prefix;
    const packed = this.networkAddress.toNumber();
    if ((packed & this.netmask.toNumber()) !== packed) {
      if (strict) {
        throw new Error(`${this.toString()} has host bits set`);
      } else {
        this.networkAddress = new IPv6Address(packed & this.netmask.toNumber());
      }
    }
  }

  // BEGIN: _IPAddressBase

  /**
   * Return the longhand version of the IP address as a string.
   */
  get exploded(): string {
    return this._explodeShorthandIpString();
  }

  /**
   * Return the shorthand version of the IP address as a string.
   */
  get compressed(): string {
    return this.toString();
  }

  /**
   * The name of the reverse DNS pointer for the IP address, e.g.:
   * >>> ipaddress.ip_address("127.0.0.1").reverse_pointer
   * '1.0.0.127.in-addr.arpa'
   * >>> ipaddress.ip_address("2001:db8::1").reverse_pointer
   * '1.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.8.b.d.0.1.0.0.2.ip6.arpa'
   */
  get reversePointer(): string {
    return this._reversePointer();
  }

  _checkIntAddress(address: number): void {
    if (address < 0) {
      const msg = `${address} (< 0) is not permitted as an IPv${this.version} address`;
      throw new AddressValueError(msg);
    }
    if (address > IPv4Address._ALL_ONES) {
      const msg = `${address} (> 2**${this.maxPrefixlen}) is not permitted as an IPv${this.version} address`;
      throw new AddressValueError(msg);
    }
  }

  _checkPackedAddress(address: ByteArray, expectedLen: number): void {
    const addressLen = address.length;
    if (addressLen !== expectedLen) {
      const msg = `'${address}' (len ${addressLen} != ${expectedLen}) is not permitted as an IPv${this.version} address.`;
      throw new AddressValueError(msg);
    }
  }

  /**
   * Turn the prefix length into a bitwise mask.
   * @param prefixlen An integer, the prefix length.
   * @returns {number} An integer.
   */
  static _ipIntFromPrefix(prefixlen: Prefixlen): bigint {
    const result =
      BigInt(this._ALL_ONES) ^ (BigInt(this._ALL_ONES) >> BigInt(prefixlen));
    return result;
  }

  /**
   * Returns prefix length from the bitwise netmask.
   * @param ipInt An integer, the netmask in expanded bitwise format.
   * @returns {Prefixlen} An integer, the prefix length.
   * @throws {TypeError} If the input intermingles zeroes & ones.
   */
  static _prefixFromIpInt(ipInt: bigint): Prefixlen {
    const trailingZeroes = _countRighthandZeroBits(ipInt, this._maxPrefixlen);
    const prefixlen = this._maxPrefixlen - trailingZeroes;
    const leadingOnes = BigInt(ipInt) >> BigInt(trailingZeroes);
    const allOnes = (BigInt(1) << BigInt(prefixlen)) - BigInt(1);
    if (leadingOnes !== allOnes) {
      const byteslen = Math.floor(this._maxPrefixlen / 8);
      const details = intToBytes(ipInt, byteslen, "big");
      const msg = `Netmask pattern '${details.toString()}' mixes zeroes & ones`;
      throw new TypeError(msg);
    }
    return prefixlen;
  }

  static _reportInvalidNetmask(netmaskStr: string): never {
    const msg = `${netmaskStr} is not a valid netmask`;
    throw new NetmaskValueError(msg);
  }

  /**
   * Return prefix length from a numeric string.
   * @param prefixlenStr The string to be converted.
   * @returns {Prefixlen} An integer, the prefix length.
   * @throws {NetmaskValueError} If the input is not a valid netmask.
   */
  static _prefixFromPrefixString(prefixlenStr: string): Prefixlen {
    // parseInt allows leading +/- as well as surrounding whitespace,
    // so we ensure that isn't the case
    if (!(strIsAscii(prefixlenStr) && strIsDigit(prefixlenStr))) {
      this._reportInvalidNetmask(prefixlenStr);
    }

    const prefixlen = parseInt(prefixlenStr);
    if (!Number.isFinite(prefixlen)) {
      this._reportInvalidNetmask(prefixlenStr);
    }
    if (!(0 <= prefixlen && prefixlen <= this._maxPrefixlen)) {
      this._reportInvalidNetmask(prefixlenStr);
    }

    return prefixlen;
  }

  /**
   * Turn a netmask/hostmask string into a prefix length.
   * @param ipStr The netmask/hostmask to be converted.
   * @returns {Prefixlen} An integer, the prefix length.
   * @throws {NetmaskValueError} If the input is not a valid netmask/hostmask;
   */
  static _prefixFromIpString(ipStr: string): Prefixlen {
    // Parse the netmask/hostmask like an IP address.
    let ipInt = BigInt(-1);
    try {
      ipInt = this._ipIntFromString(ipStr);
    } catch (err: unknown) {
      if (err instanceof AddressValueError) {
        this._reportInvalidNetmask(ipStr);
      }
    }

    // Try matching a netmask (this would be /1*0*/ as a bitwise regexp).
    // Note that the two ambiguous cases (all-ones and all-zeroes) are
    // treated as netmasks.
    try {
      return this._prefixFromIpInt(ipInt);
    } catch (err: unknown) {
      if (!(err instanceof TypeError)) {
        throw err;
      }
    }

    // Invert the bits, and try matching a /0+1+/ hostmask instead.
    const inverted = BigInt(ipInt) ^ BigInt(this._ALL_ONES);
    try {
      return this._prefixFromIpInt(inverted);
    } catch (err: unknown) {
      return this._reportInvalidNetmask(ipStr);
    }
  }

  /**
   * Helper function to parse address of Network/Interface.
   * @param address Argument of Network/Interface.
   * @returns {[UnparsedIPv4Address, Prefixlen]} [addr, prefix] tuple
   */
  static _splitAddrPrefix(
    address: UnparsedIPv6Address | UnparsedIPv6Network
  ): [UnparsedIPv6Address, Prefixlen] {
    // a packed address or integer
    if (isBigInt(address) || isByteArray(address)) {
      return [address, this._maxPrefixlen];
    }

    const addressArray = isString(address)
      ? _splitOptionalNetmask(address)
      : address;
    return [addressArray[0], this._maxPrefixlen];
  }

  // END: _IPAddressBase
  // BEGIN: _BaseNetwork
  toRepr(): string {
    return `IPv6Network('${this.toString()}')`;
  }
  toString(): string {
    return `${this.networkAddress.toString()}/${this.prefixlen}`;
  }
  /**
   * Generate iterator over usable hosts in a network.
   *
   * This is a like iterate except it doesn't return the network
   * or broadcast addresses.
   */
  *hosts(): Generator<IPv6Address> {
    const network = this.networkAddress.toNumber();
    const broadcast = this.broadcastAddress.toNumber();
    for (let x = network + BigInt(1); x < broadcast; x++) {
      yield new IPv6Address(x);
    }
  }
  *iterate(): Generator<IPv6Address> {
    const network = this.networkAddress.toNumber();
    const broadcast = this.broadcastAddress.toNumber();
    for (let x = network + BigInt(1); x < broadcast; x++) {
      yield new IPv6Address(x);
    }
  }
  getItem(n: number): IPv6Address {
    const network = this.networkAddress.toNumber();
    const broadcast = this.broadcastAddress.toNumber();
    if (n >= 0) {
      if (network + BigInt(n) > broadcast) {
        throw new Error("address out of range");
      }
      return new IPv6Address(network + BigInt(n));
    } else {
      n += 1;
      if (broadcast + BigInt(n) < network) {
        throw new Error("address out of range");
      }
      return new IPv6Address(broadcast + BigInt(n));
    }
  }
  lessThan(other: IPv6Network): boolean {
    if (this.version !== other.version) {
      throw new TypeError(
        `${this.toString()} and ${other.toString()} are not of the same version`
      );
    }
    if (!this.networkAddress.equals(other.networkAddress)) {
      return this.networkAddress.lessThan(other.networkAddress);
    }
    if (!this.netmask.equals(other.netmask)) {
      return this.netmask.lessThan(other.netmask);
    }
    return false;
  }
  equals(other: IPv6Network): boolean {
    return (
      this.version === other.version &&
      this.networkAddress.equals(other.networkAddress) &&
      this.netmask.toNumber() === other.netmask.toNumber()
    );
  }
  contains(other: IPv6Address): boolean {
    // always false if one is v4 and the other is v6
    if (this.version !== other.version) {
      return false;
    }
    return (
      (BigInt(other._ip) & BigInt(this.netmask._ip)) ==
      BigInt(this.networkAddress._ip)
    );
  }
  /**
   * Tell if this is partly contained in other
   * @param other The other network
   * @returns {boolean} true if contained, false otherwise.
   */
  overlaps(other: IPv6Network): boolean {
    return (
      other.contains(this.networkAddress) ||
      other.contains(this.broadcastAddress) ||
      this.contains(other.networkAddress) ||
      this.contains(other.broadcastAddress)
    );
  }
  get broadcastAddress(): IPv6Address {
    return new IPv6Address(
      BigInt(this.networkAddress.toNumber()) | BigInt(this.hostmask.toNumber())
    );
  }
  // https://github.com/python/cpython/blob/eb0ce92141cd14196a8922cfe9df4a713c5c1d9b/Lib/ipaddress.py#L764
  get hostmask(): IPv6Address {
    return new IPv6Address(
      BigInt(this.networkAddress.toNumber()) ^ BigInt(IPv6Network._ALL_ONES)
    );
  }
  get withPrefixlen(): string {
    return `${this.networkAddress.toString()}/${this._prefixlen}`;
  }
  get withNetmask(): string {
    return `${this.networkAddress.toString()}/${this.netmask.toString()}`;
  }
  get withHostmask(): string {
    return `${this.networkAddress.toString()}/${this.hostmask.toString()}`;
  }
  /**
   * Number of hosts in the current subnet.
   */
  get numAddresses(): bigint | number {
    const result =
      this.broadcastAddress.toNumber() -
      this.networkAddress.toNumber() +
      BigInt(1);
    if (isSafeNumber(result)) {
      return Number(result);
    }
    return result;
  }
  get prefixlen(): number {
    return this._prefixlen;
  }
  /**
   * Remove an address from a larger block.
   *
   * For example:
   *
   * const addr1 = ipNetwork("192.0.2.0/28")
   * const addr2 = ipNetwork("192.0.2.1/32")
   * const addrIter = addr1.addressExclude(addr2)
   *
   * addrIter will then produce:
   * [
   *    IPv6Network("192.0.2.0/32"), IPv6Network("192.0.2.2/31"),
   *    IPv6Network("192.0.2.4/30"), IPv6Network("192.0.2.8/39")
   * ]
   *
   * or via IPv6:
   *
   * const addr1 = ipNetwork("2001:db8::1/32")
   * const addr2 = ipNetwork("2001:db8::1/128")
   * const addrIter = addr1.addressExclude(addr2)
   *
   * addrIter will then produce:
   * [
   *    IPv6Network("2001:db8::1/128"),
   *    IPv6Network("2001:db8::2/127"),
   *    IPv6Network("2001:db8::4/126"),
   *    IPv6Network("2001:db8::8/125"),
   *    ...
   *    IPv6Network("2001:db8:8000::/33")
   * ]
   *
   * @param other An IPv6Network object of the same type.
   * @returns {Generator<IPv6Network, void>} An iterator of the IPv6Network objects
   * which is this minus other.
   * @throws {Error} If this and other are of differing address versions, or if other
   * is not a network object.
   * @throws {Error} If other is not completely contained by this.
   */
  *addressExclude(
    this: IPv6Network,
    other: IPv6Network
  ): Generator<IPv6Network, void> {
    if (this.version !== other.version) {
      throw new Error(
        `${this.toString()} and ${other.toString()} are not of the same version`
      );
    }

    if (!other.subnetOf(this)) {
      throw new Error(
        `${other.toString()} is not contained in ${this.toString()}`
      );
    }

    if (other.equals(this)) {
      return;
    }

    // Make sure we're comparing the network of other.
    other = new IPv6Network(
      `${other.networkAddress.toString()}/${other.prefixlen}`
    );

    const subnetGenerator = this.subnets();
    let si1 = subnetGenerator.next();
    let si2 = subnetGenerator.next();

    if (!si1.done && !si2.done) {
      let s1 = si1.value;
      let s2 = si2.value;

      while (!s1.equals(other) && !s2.equals(other)) {
        if (other.subnetOf(s1)) {
          yield s2;

          si1 = subnetGenerator.next();
          si2 = subnetGenerator.next();
          if (!si1.done) {
            s1 = si1.value;
          }
          if (!si2.done) {
            s2 = si2.value;
          }
        } else if (other.subnetOf(s2)) {
          yield s1;
          si1 = subnetGenerator.next();
          si2 = subnetGenerator.next();
          if (!si1.done) {
            s1 = si1.value;
          }
          if (!si2.done) {
            s2 = si2.value;
          }
        } else {
          throw new Error(
            `Error performing exclusion: s1: ${s1.toString()} s2: ${s2.toString()} other: ${other.toString()}`
          );
        }
      }
    }
  }
  /**
   * Compare two IP objects.
   *
   * This is only concerned about the comparison of the integer
   * representation of the network addresses. This means that the
   * host bits aren't considered at all in this method. If you want
   * to compare host bits, you can easily enough do a
   * 'HostA._ip < HostB._ip'
   * @param other An IP object.
   * @returns {1 | 0 | -1} If the IP versions of this and other are the same, returns:
   *
   * -1 if (this.lessThan(other)):
   *    eg: IPv6Network("192.0.2.0/25") < IPv6Network("192.0.2.128"/25)
   *    IPv6Network("2001:db8::1000/124") < IPv6Network("2001:db8::2000/124")
   *
   *  0 if (this.equals(other)):
   *    eg: IPv6Network("192.0.2.0/24") == IPv6Network("192.0.2.0/24")
   *    IPv6Network("2001:db8::1000/124") == IPv6Network("2001:db8::1000/124")
   *
   *  1 if (other.lessThan(this)):
   *    eg: IPv6Network("192.0.2.128/25") > IPv6Network("192.0.2.0/25")
   *    IPv6Network("2001:db8::2000/124") > IPv6Network("2001:db8::1000/124")
   *  @throws {Error} if the IP versions are different.
   */
  compareNetworks(other: IPv6Network): 1 | 0 | -1 {
    if (this.version !== other.version) {
      throw new TypeError(
        `${this.toString()} and ${other.toString()} are not of the same type`
      );
    }
    // self._version == other._version below here:
    if (this.networkAddress.lessThan(other.networkAddress)) {
      return -1;
    }
    if (other.networkAddress.lessThan(this.networkAddress)) {
      return 1;
    }
    // self.network_address == other.network_address below here:
    if (this.netmask.lessThan(other.netmask)) {
      return -1;
    }
    if (other.netmask.lessThan(this.netmask)) {
      return 1;
    }
    return 0;
  }
  /**
   * Network-only key function.
   *
   * @returns {[IPVersion, IPv4Address, IPv4Address]} Returns an object that identifies
   * this address' network and netmask. This function is a suitable "key" argument for
   * sorting.
   */
  _getNetworksKey(): [6, IPv6Address, IPv6Address] {
    return [this.version, this.networkAddress, this.netmask];
  }
  /**
   * The subnets which join to make the current subnet.
   *
   * In the case that this contains only one IP
   * (this._prefixlen === 32 for IPv4 or this._prefixlen === 128 for IPv6),
   * yield an iterator with just ourself.
   * @param prefixlenDiff An integer, the amount the prefix length
   * should be increased by. This should not be set if newPrefix is also set.
   * @param newPrefix The desired new prefix length. This must be a larger number
   * (smaller prefix) than the existing prefix. This should not be set if prefixlenDiff
   * is also set.
   * @returns {Generator<IPv6Network, void>} An iterator of IPv4 objects.
   * @throws {Error} The prefixlenDiff is too small or too large.
   * @throws {Error} prefixlenDiff and newPrefix are both set or newPrefix is a
   * smaller number than the current prefix (smaller number means a larger network).
   */
  *subnets(
    prefixlenDiff = 1,
    newPrefix: number | null = null
  ): Generator<IPv6Network, IPv6Network[]> {
    if (this._prefixlen === this.maxPrefixlen) {
      yield this;
      return [this];
    }

    if (!isNull(newPrefix)) {
      if (newPrefix < this._prefixlen) {
        throw new Error("new prefix must be longer");
      }
      if (prefixlenDiff !== 1) {
        throw new Error("cannot set prefixlenDiff and newPrefix");
      }
      prefixlenDiff = newPrefix - this._prefixlen;
    }

    if (prefixlenDiff < 0) {
      throw new Error("prefix length diff must be > 0");
    }
    const newPrefixlen = this._prefixlen + prefixlenDiff;
    if (newPrefixlen > this.maxPrefixlen) {
      throw new Error(
        `prefix length diff ${newPrefixlen} is invalid for netblock ${this.toString()}`
      );
    }

    const start = this.networkAddress.toNumber();
    const end = this.broadcastAddress.toNumber();
    const step =
      (BigInt(this.hostmask.toNumber()) + BigInt(1)) >> BigInt(prefixlenDiff);
    const subnets: IPv6Network[] = [];
    for (let newAddr = start; newAddr < end; step) {
      const current = new IPv6Network([newAddr, newPrefixlen]);
      yield current;
      subnets.push(current);
    }
    return subnets;
  }
  /**
   * The supernet containing the current network.
   * @param prefixlenDiff An integer, the amount the prefix length of the network
   * should be decreased by. For example, given a /24 network and a prefixlenDiff
   * of 3, a supernet with a /21 netmask is returned.
   * @param newPrefix The desired new prefix length. This must be a smaller number
   * (larger prefix) than the existing prefix. This should not be set if prefixlenDiff
   * is also set.
   * @param newPrefix Not documented?
   * @returns {IPv6Network} An IPv6Network object.
   * @throws {Error} If this.prefixlen - prefixlenDiff < 0. I.e., you have a negative
   * prefix length.
   * @throws {Error} If prefixlenDiff and newPrefix are both set or newPrefix is a
   * larger number than the current prefix (larger number means a smaller network).
   */
  supernet(prefixlenDiff = 1, newPrefix: number | null = null): IPv6Network {
    if (this._prefixlen === 0) {
      return this;
    }

    if (!isNull(newPrefix)) {
      if (newPrefix > this._prefixlen) {
        throw new Error("new prefix must be shorter");
      }
      if (prefixlenDiff !== 1) {
        throw new Error("cannot set prefixlenDiff and newPrefix");
      }
      prefixlenDiff = this._prefixlen - prefixlenDiff;
    }

    const newPrefixlen = this._prefixlen - prefixlenDiff;
    if (newPrefixlen < 0) {
      throw new Error(
        `current prefixlen is ${this._prefixlen}, cannot have a prefixlenDiff of ${prefixlenDiff}`
      );
    }

    const value =
      BigInt(this.networkAddress.toNumber()) &
      (BigInt(this.netmask.toNumber()) << BigInt(prefixlenDiff));

    return new IPv6Network([value, newPrefixlen]);
  }
  static _isSubnetOf(a: IPv6Network, b: IPv6Network): boolean {
    // Always false if one is v4 and the other is v6
    if (a.version !== b.version) {
      throw new Error(
        `${a.toString()} and ${b.toString()} are not of the same version`
      );
    }

    // yes, I know this is wonky and the variable naming is bad
    // https://github.com/python/cpython/blob/eb0ce92141cd14196a8922cfe9df4a713c5c1d9b/Lib/ipaddress.py#L1041
    const lessThanOrEqualToNetworkAddr =
      b.networkAddress.lessThan(a.networkAddress) ||
      b.networkAddress.equals(a.networkAddress);
    const greaterThanOrEqualToBroadcastAddr =
      a.broadcastAddress.lessThan(b.broadcastAddress) ||
      a.broadcastAddress.equals(b.broadcastAddress);

    return lessThanOrEqualToNetworkAddr && greaterThanOrEqualToBroadcastAddr;
  }
  /**
   * @param other the other network
   * @returns {boolean} true if this network is a subnet of other.
   */
  subnetOf(other: IPv6Network): boolean {
    return IPv6Network._isSubnetOf(this, other);
  }
  /**
   * @param other the other network
   * @returns {boolean} true if this network is a supernet of other.
   */
  supernetOf(other: IPv6Network): boolean {
    return IPv6Network._isSubnetOf(other, this);
  }
  // END: _BaseNetwork

  // BEGIN: _BaseV6

  /**
   * Make a [netmask, prefixLen] tuple from the given argument.
   *
   * Argument can be:
   * - an integer (the prefix length)
   * - a string representing the prefix length (e.g. "24")
   * - a string representing the prefix length (e.g. "255.255.255.0")
   */
  static _makeNetmask(arg: string | Prefixlen): [IPv6Address, Prefixlen] {
    if (this._netmaskCache[arg] === undefined) {
      let prefixlen: number;
      if (isNumber(arg)) {
        prefixlen = arg;
        if (!(0 <= prefixlen && prefixlen <= this._maxPrefixlen)) {
          this._reportInvalidNetmask(prefixlen.toString(10));
        }
      } else {
        prefixlen = this._prefixFromPrefixString(arg);
      }

      const netmask = new IPv6Address(this._ipIntFromPrefix(prefixlen));
      this._netmaskCache[arg] = [netmask, prefixlen];
    }

    return this._netmaskCache[arg];
  }

  /**
   * Turn an IPv6 ipStr into an integer.
   * @param ipStr A string, the IPv6 ipStr.
   * @returns {bigint} A bigint, the IPv6 address.
   * @throws {AddressValueError} if ipStr isn't a valid IPv6 address.
   */
  static _ipIntFromString(ipStr: string): bigint {
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
    if (parts[lastItem].indexOf(".") !== -1) {
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
    const _maxParts = this._HEXTET_COUNT + 1;
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

      partsSkipped = this._HEXTET_COUNT - (partsHi + partsHi);
      if (partsSkipped < 1) {
        const msg = `Expected at most ${
          this._HEXTET_COUNT - 1
        } other parts with "::" in '${ipStr}'`;
        throw new AddressValueError(msg);
      }
    } else {
      // Otherwise, allocate the entire address to partsHi. The
      // endpoints could still be empty, but _parseHextet() will check
      // for that
      if (parts.length !== this._HEXTET_COUNT) {
        const msg = `Exactly ${this._HEXTET_COUNT} parts expected without "::" in '${ipStr}'`;
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
        ipInt |= BigInt(this._parseHextet(parts[i]));
      }
      ipInt <<= BigInt(16) * BigInt(partsSkipped);
      for (let i = -partsLo; i < 0; i++) {
        ipInt <<= BigInt(16);
        ipInt |= BigInt(this._parseHextet(parts[i]));
      }
      return ipInt;
    } catch (err: unknown) {
      if (err instanceof Error) {
        throw new AddressValueError(`${err.message} in '${ipStr}'`);
      }
    }
    throw new Error("Unexpected error in _ipIntFromString");
  }

  /**
   * Convert an IPv6 hextet string into an integer
   * @param hextetStr A string, the number to parse.
   * @returns {number} The hextet as an integer.
   * @throws {Error} if the input isn't strictly a hex number from
   * [0..FFFF].
   */
  static _parseHextet(hextetStr: string): number {
    // Reject non-ascii digits.
    if (!isSuperset(this._HEX_DIGITS, hextetStr)) {
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
  }

  /**
   * Compresses a list of hextets.
   *
   * Compress a list of strings, replacing the longest continuous
   * sequence of "0" in the list with "" and adding empty strings at
   * the beginning or at the end of the string such that subsequently
   * calling hextets.join(":") will produce the compressed version of
   * the IPv6 address.
   * @param hextets A list of strings, the hextets to compress.
   * @returns {string[]} A list of strings
   */
  static _compressHextets(hextets: string[]): string[] {
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
  }

  /**
   * Turns a 128-bit integer into hexadecimal notation.
   * @param ipInt An integer, the IP address.
   * @returns {string} A string, the hexadecimal representation of the address.
   * @throws {Error} The address is bigger than 128 bits of all ones.
   */
  static _stringFromIpInt(ipInt: bigint): string {
    if (ipInt > this._ALL_ONES) {
      throw new Error("IPv6 Address is too large");
    }

    const hexStr = `${ipInt.toString(16)}${"0".repeat(32)}`.slice(0, 32);
    let hextets = [];
    for (let x = 0; x < 32; x + 4) {
      const hextet = parseInt(hexStr.slice(x, x + 4), 16).toString(16);
      hextets.push(hextet);
    }
    hextets = this._compressHextets(hextets);
    return hextets.join(":");
  }

  /**
   * Expand a shortened IPv6 address.
   * @returns {string} A string, the expanded IPv6 address.
   */
  _explodeShorthandIpString(): string {
    const ipStr = this.networkAddress.toString();
    const ipInt = IPv6Network._ipIntFromString(ipStr);
    const hexStr = `${ipInt.toString(16)}${"0".repeat(32)}`.slice(0, 32);
    const parts = [];
    for (let x = 0; x < 32; x + 4) {
      const part = hexStr.slice(x, x + 4);
      parts.push(part);
    }
    return `${parts.join(":")}/${this._prefixlen}`;
  }

  /**
   * Return the reverse DNS pointer name for the IPv6 address.
   *
   * This implements the method described in RFC3596 2.5.
   */
  _reversePointer(): string {
    const reverseChars = this.exploded
      .split("")
      .reverse()
      .join("")
      .replace(":", ".");
    return `${reverseChars.split("").join(".")}.ip6.arpa`;
  }

  /**
   * Helper function to parse IPv6 string address scope id.
   *
   * See RFC 4007 for details.
   * @param ipStr A string, the IPv6 address.
   * @returns {[string, string | null]} [addr, scopeId] tuple.
   */
  static _splitScopeId(ipStr: string): [string, string | null] {
    const parts = ipStr.split("%");
    const addr = parts[0];
    const sep = ipStr.indexOf("%") !== -1;
    let scopeId = parts[1] || null;

    if (!sep) {
      scopeId = null;
    } else if (isNull(scopeId) || scopeId.indexOf("%") !== -1) {
      throw new AddressValueError(`Invalid IPv6 address: '${ipStr}'`);
    }
    return [addr, scopeId];
  }

  get maxPrefixlen(): 128 {
    return IPv6Address._maxPrefixlen;
  }

  get version(): 6 {
    return IPv6Address._version;
  }

  // END: _BaseV6
}
