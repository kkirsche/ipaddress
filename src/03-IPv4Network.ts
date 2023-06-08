import {
  ByteArray,
  Prefixlen,
  UnparsedIPv4Address,
  UnparsedIPv4Network,
} from "./interfaces";
import { IPv4ALLONES, IPv4LENGTH } from "./constants";
import {
  _countRighthandZeroBits,
  _splitOptionalNetmask,
  intFromBytes,
  intToBytes,
  isSafeNumber,
  strIsAscii,
  strIsDigit,
} from "./utilities";
import {
  isBigInt,
  isByteArray,
  isNull,
  isNumber,
  isString,
  isUndefined,
} from "./typeGuards";

import { AddressValueError } from "./00-AddressValueError";
import { IPv4Address } from "./01-IPv4Address";
import { NetmaskValueError } from "./NetmaskValueError";
import { _IPv4Constants } from "./_IPv4Constants";

// extends _BaseV4, _BaseNetwork
export class IPv4Network {
  static readonly _version = 4;
  static readonly _ALL_ONES = IPv4ALLONES;
  static readonly _maxPrefixlen = IPv4LENGTH;
  static readonly _constants = _IPv4Constants;
  static _netmaskCache: Record<string | number, [IPv4Address, Prefixlen]> = {};

  networkAddress: IPv4Address;
  netmask: IPv4Address;
  _prefixlen: number;
  /**
   * Instantiate a new IPv4 network object.
   * @param address A string or integer representing the IP [& network].
   * '192.0.2.0/24'
   * '192.0.2.0/255.255.255.0'
   * '192.0.2.0/0.0.0.255'
   * are all functionally the same in IPv4. Similarly,
   * '192.0.2.1'
   * '192.0.2.1/255.255.255.255'
   * '192.0.2.1/32'
   * are also functionally equivalent. That is to say, failing to
   * provide a subnetmask will create an object with a mask of /32.
   *
   * If the mask (portion after the / in the argument) is given in
   * dotted quad form, it is treated as a netmask if it starts with a
   * non-zero field (e.g. /255.0.0.0 == /8) and as a hostmask if it
   * starts with a zero field (e.g. 0.255.255.255 == /8), with the
   * single exception of an all-zero mask which is treated as a
   * netmask == /0. If no mask is given, a default of /32 is used.
   *
   * Additionally, an integer can be passed, so
   * IPv4Network('192.0.2.1') == IPv4Network(3221225985)
   * or, more generally
   * IPv4Interface(int(IPv4Interface('192.0.2.1'))) ==
   *    IPv4Interface('192.0.2.1')
   * @param strict Strictly parse the network.
   * @throws {AddressTypeError, NetmaskTypeError, TypeError}
   */
  constructor(address: UnparsedIPv4Network, strict = true) {
    const [addr, mask] = IPv4Network._splitAddrPrefix(address);
    this.networkAddress = new IPv4Address(addr);
    const [netmask, prefixlen] = IPv4Network._makeNetmask(mask);
    this.netmask = netmask;
    this._prefixlen = prefixlen;
    const packed = BigInt(this.networkAddress.toNumber());
    const netmaskNumber = BigInt(netmask.toNumber());
    if ((packed & netmaskNumber) !== packed) {
      if (strict) {
        throw new TypeError(`'${address}' has host bits set`);
      } else {
        this.networkAddress = new IPv4Address(packed & netmaskNumber);
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

  _checkPackedAddress(
    this: IPv4Network,
    address: ByteArray,
    expectedLen: number
  ): void {
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
  static _ipIntFromPrefix(prefixlen: Prefixlen): number {
    const result =
      BigInt(this._ALL_ONES) ^ (BigInt(this._ALL_ONES) >> BigInt(prefixlen));
    if (isSafeNumber(result)) {
      return Number(result);
    }
    throw new Error("Unexpected bigint in _ipIntFromPrefix on IPv4Network");
  }

  /**
   * Returns prefix length from the bitwise netmask.
   * @param ipInt An integer, the netmask in expanded bitwise format.
   * @returns {Prefixlen} An integer, the prefix length.
   * @throws {TypeError} If the input intermingles zeroes & ones.
   */
  static _prefixFromIpInt(ipInt: number): Prefixlen {
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
    let ipInt = -1;
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
    let inverted: bigint | number = BigInt(ipInt) ^ BigInt(this._ALL_ONES);
    if (isSafeNumber(inverted)) {
      inverted = Number(inverted);
    }
    if (isBigInt(inverted)) {
      throw new Error("Unexpected bigint in IPv4Address _prefixFromIpString");
    }
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
    address: UnparsedIPv4Address | UnparsedIPv4Network
  ): [UnparsedIPv4Address, Prefixlen] {
    // a packed address or integer
    if (isNumber(address) || isByteArray(address)) {
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
    return `IPv4Network('${this.toString()}')`;
  }
  toString(this: IPv4Network): string {
    return `${this.networkAddress.toString()}/${this.prefixlen}`;
  }
  /**
   * Generate iterator over usable hosts in a network.
   *
   * This is a like iterate except it doesn't return the network
   * or broadcast addresses.
   */
  *hosts(): Generator<IPv4Address> {
    const network = this.networkAddress.toNumber();
    const broadcast = this.broadcastAddress.toNumber();
    for (let x = network + 1; x < broadcast; x++) {
      yield new IPv4Address(x);
    }
  }
  *iterate(): Generator<IPv4Address> {
    const network = this.networkAddress.toNumber();
    const broadcast = this.broadcastAddress.toNumber();
    for (let x = network + 1; x < broadcast; x++) {
      yield new IPv4Address(x);
    }
  }
  getItem(n: number): IPv4Address {
    const network = this.networkAddress.toNumber();
    const broadcast = this.broadcastAddress.toNumber();
    if (n >= 0) {
      if (network + n > broadcast) {
        throw new Error("address out of range");
      }
      return new IPv4Address(network + n);
    } else {
      n += 1;
      if (broadcast + n < network) {
        throw new Error("address out of range");
      }
      return new IPv4Address(broadcast + n);
    }
  }
  lessThan(this: IPv4Network, other: IPv4Network): boolean {
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
  equals(other: IPv4Network): boolean {
    return (
      this.version === other.version &&
      this.networkAddress.equals(other.networkAddress) &&
      this.netmask.toNumber() === other.netmask.toNumber()
    );
  }
  contains(other: IPv4Address): boolean {
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
  overlaps(other: IPv4Network): boolean {
    return (
      other.contains(this.networkAddress) ||
      other.contains(this.broadcastAddress) ||
      this.contains(other.networkAddress) ||
      this.contains(other.broadcastAddress)
    );
  }
  get broadcastAddress(): IPv4Address {
    return new IPv4Address(
      BigInt(this.networkAddress.toNumber()) | BigInt(this.hostmask.toNumber())
    );
  }
  // https://github.com/python/cpython/blob/eb0ce92141cd14196a8922cfe9df4a713c5c1d9b/Lib/ipaddress.py#L764
  get hostmask(): IPv4Address {
    return new IPv4Address(
      BigInt(this.networkAddress.toNumber()) ^ BigInt(IPv4Network._ALL_ONES)
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
  get numAddresses(): number {
    return (
      this.broadcastAddress.toNumber() - this.networkAddress.toNumber() + 1
    );
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
   *    IPv4Network("192.0.2.0/32"), IPv4Network("192.0.2.2/31"),
   *    IPv4Network("192.0.2.4/30"), IPv4Network("192.0.2.8/39")
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
   * @param other An IPv4Network object of the same type.
   * @returns {Generator<IPv4Network, void>} An iterator of the IPv4Network objects
   * which is this minus other.
   * @throws {Error} If this and other are of differing address versions, or if other
   * is not a network object.
   * @throws {Error} If other is not completely contained by this.
   */
  *addressExclude(other: IPv4Network): Generator<IPv4Network, void> {
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
    other = new IPv4Network(
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
   *    eg: IPv4Network("192.0.2.0/25") < IPv4Network("192.0.2.128"/25)
   *    IPv6Network("2001:db8::1000/124") < IPv6Network("2001:db8::2000/124")
   *
   *  0 if (this.equals(other)):
   *    eg: IPv4Network("192.0.2.0/24") == IPv4Network("192.0.2.0/24")
   *    IPv6Network("2001:db8::1000/124") == IPv6Network("2001:db8::1000/124")
   *
   *  1 if (other.lessThan(this)):
   *    eg: IPv4Network("192.0.2.128/25") > IPv4Network("192.0.2.0/25")
   *    IPv6Network("2001:db8::2000/124") > IPv6Network("2001:db8::1000/124")
   *  @throws {Error} if the IP versions are different.
   */
  compareNetworks(other: IPv4Network): 1 | 0 | -1 {
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
  _getNetworksKey(): [4, IPv4Address, IPv4Address] {
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
   * @returns {Generator<IPv4Network, void>} An iterator of IPv4 objects.
   * @throws {Error} The prefixlenDiff is too small or too large.
   * @throws {Error} prefixlenDiff and newPrefix are both set or newPrefix is a
   * smaller number than the current prefix (smaller number means a larger network).
   */
  *subnets(
    prefixlenDiff = 1,
    newPrefix: number | null = null
  ): Generator<IPv4Network, IPv4Network[]> {
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
    const subnets: IPv4Network[] = [];
    for (let newAddr = start; newAddr < end; step) {
      const current = new IPv4Network([newAddr, newPrefixlen]);
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
   * @returns {IPv4Network} An IPv4Network object.
   * @throws {Error} If this.prefixlen - prefixlenDiff < 0. I.e., you have a negative
   * prefix length.
   * @throws {Error} If prefixlenDiff and newPrefix are both set or newPrefix is a
   * larger number than the current prefix (larger number means a smaller network).
   */
  supernet(
    this: IPv4Network,
    prefixlenDiff = 1,
    newPrefix: number | null = null
  ): IPv4Network {
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

    let value: bigint | number =
      BigInt(this.networkAddress.toNumber()) &
      (BigInt(this.netmask.toNumber()) << BigInt(prefixlenDiff));

    if (isSafeNumber(value)) {
      value = Number(value);
    }

    if (isBigInt(value)) {
      throw new Error("Unexpected bigint in IPv4Network supernet");
    }

    return new IPv4Network([value, newPrefixlen]);
  }
  static _isSubnetOf(a: IPv4Network, b: IPv4Network): boolean {
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
  subnetOf(other: IPv4Network): boolean {
    return IPv4Network._isSubnetOf(this, other);
  }
  /**
   * @param other the other network
   * @returns {boolean} true if this network is a supernet of other.
   */
  supernetOf(other: IPv4Network): boolean {
    return IPv4Network._isSubnetOf(other, this);
  }
  // END: _BaseNetwork
  // BEGIN: _BaseV4

  _explodeShorthandIpString(): string {
    return this.toString();
  }

  /**
   * Make a [netmask, prefixlen] tuple from the given argument.
   * @param arg Argument can be:
   *  * - an integer (the prefix length)
   * - a string representing the prefix length (e.g. "24")
   * - a string representing the prefix netmask (e.g. "255.255.255.0")
   * @returns {NetmaskCacheValue} The [netmask, prefixlen] tuple.
   */
  static _makeNetmask(arg: string | Prefixlen): [IPv4Address, Prefixlen] {
    let prefixlen: Prefixlen;
    if (this._netmaskCache[arg] === undefined) {
      if (isNumber(arg)) {
        prefixlen = arg;
        if (!(0 <= prefixlen && prefixlen <= this._maxPrefixlen)) {
          throw new NetmaskValueError(`${prefixlen} is not a valid netmask`);
        }
      } else {
        try {
          prefixlen = this._prefixFromPrefixString(arg);
        } catch (err: unknown) {
          // Check for a netmask or hostmask in dotted-quad form.
          // This may raise NetmaskTypeError
          prefixlen = this._prefixFromIpString(arg);
        }
      }
      const netmask = new IPv4Address(this._ipIntFromPrefix(prefixlen));
      this._netmaskCache[arg] = [netmask, prefixlen];
    }
    const result = this._netmaskCache[arg];
    if (isUndefined(result)) {
      throw new Error("Unexpected cache miss");
    }

    return result;
  }

  /**
   * Turn the given IP string into an integer for comparison.
   * @param ipStr A string, the IP ipStr.
   * @returns {number} The IP ipStr as an integer.
   * @throws {AddressValueError} if ipStr isn't a valid IPv4 Address.
   */
  static _ipIntFromString(ipStr: string): number {
    if (ipStr === "") {
      throw new AddressValueError("Address cannot be empty");
    }

    const octets = ipStr.split(".");
    if (octets.length !== 4) {
      throw new AddressValueError(`Expected 4 octets in ${ipStr}`);
    }

    try {
      const parsedOctets = intFromBytes(
        octets.map((octet) => this._parseOctet(octet)),
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
  }

  /**
   * Convert a dotted decimal octet into an integer
   * @param octetStr A string, the number to parse.
   * @returns {number} The octet as an integer.
   * @throws {TypeError} if the octet isn't strictly a decimal [0..255].
   */
  static _parseOctet(octetStr: string): number {
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
  }

  /**
   * Turns a 32-bit integer into dotted decimal notation.
   * @param ipInt An integer, the IP Address.
   * @returns {string} The IP address as a string in dotted decimal notation.
   */
  static _stringFromIpInt(ipInt: number): string {
    return intToBytes(ipInt, 4, "big")
      .map((byte: ByteArray[number]) => byte.toString())
      .join(".");
  }

  /**
   * Turns a 32-bit integer into dotted decimal notation.
   * @param ipInt An integer, the IP Address.
   * @returns {string} The IP address as a string in dotted decimal notation.
   */
  _stringFromIpInt(ipInt: number): string {
    return intToBytes(ipInt, 4, "big")
      .map((byte: ByteArray[number]) => byte.toString())
      .join(".");
  }

  /**
   * Return the reverse DNS pointer name for the IPv4 address.
   * This implements the method described in RFC1035 3.5.
   * @returns {string} The reverse DNS pointer name.
   */
  _reversePointer(this: IPv4Network): string {
    return `${this.toString().split(".").reverse().join(".")}.in-addr.arpa`;
  }
  get maxPrefixlen(): 32 {
    return IPv4Network._maxPrefixlen;
  }
  get version(): 4 {
    return IPv4Network._version;
  }
  // END: _BaseV4

  get isGlobal(): boolean {
    const validNetAddr = !_IPv4Constants._publicNetwork.contains(
      this.networkAddress
    );
    const validBroadcast = _IPv4Constants._publicNetwork.contains(
      this.broadcastAddress
    );
    // @ts-expect-error this is broken until we finish adding isPrivate
    return validNetAddr && validBroadcast && !this.isPrivate;
  }
}
