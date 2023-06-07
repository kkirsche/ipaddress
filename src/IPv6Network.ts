import {
  ByteArray,
  IPVersion,
  IPv6ALLONES,
  IPv6LENGTH,
  NetmaskCacheKey,
  Prefixlen,
  UnparsedIPv6Address,
  UnparsedIPv6Network,
  V6NetmaskCacheValue,
} from "./constants";

import { IPv4Address } from "./IPv4Address";
import { IPv6Address } from "./IPv6Address";
import { _BaseNetworkStruct } from "./_BaseNetwork";
import { _BaseV6Struct } from "./_BaseV6";
import { _IPAddressBaseStruct } from "./_IPAddressBase";
import { isNumber } from "./typeGuards";

export class IPv6Network {
  static readonly _version = 6;
  static readonly _ALL_ONES = IPv6ALLONES;
  static readonly _maxPrefixlen = IPv6LENGTH;
  static _netmaskCache: Record<NetmaskCacheKey, V6NetmaskCacheValue> = {};
  static readonly _addressClass = IPv6Address;

  networkAddress: IPv6Address;
  netmask: IPv6Address;
  _prefixlen: number;

  constructor(address: string) {
    this.networkAddress = new IPv6Address(address);
    this.netmask = new IPv6Address(address);
    this._prefixlen = -1;
  }

  // BEGIN: _IPAddressBase

  /**
   * Return the longhand version of the IP address as a string.
   */
  get exploded(): string {
    return _IPAddressBaseStruct.exploded(this);
  }

  /**
   * Return the shorthand version of the IP address as a string.
   */
  get compressed(): string {
    return _IPAddressBaseStruct.compressed(this);
  }

  /**
   * The name of the reverse DNS pointer for the IP address, e.g.:
   * >>> ipaddress.ip_address("127.0.0.1").reverse_pointer
   * '1.0.0.127.in-addr.arpa'
   * >>> ipaddress.ip_address("2001:db8::1").reverse_pointer
   * '1.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.8.b.d.0.1.0.0.2.ip6.arpa'
   */
  get reversePointer(): string {
    return _IPAddressBaseStruct.reversePointer(this);
  }

  _checkIntAddress(this: IPv6Network, address: number): void {
    return _IPAddressBaseStruct._checkIntAddress(IPv6Network, address);
  }

  _checkPackedAddress(
    this: IPv6Network,
    address: ByteArray,
    expectedLen: number
  ): void {
    return _IPAddressBaseStruct._checkPackedAddress(
      IPv6Network,
      address,
      expectedLen
    );
  }

  /**
   * Turn the prefix length into a bitwise mask.
   * @param prefixlen An integer, the prefix length.
   * @returns {number} An integer.
   */
  static _ipIntFromPrefix(prefixlen: Prefixlen): bigint {
    const result = _IPAddressBaseStruct._ipIntFromPrefix(
      IPv4Address,
      prefixlen
    );
    if (isNumber(result)) {
      throw new Error("Unexpected number in IPV6 Address");
    }
    return result;
  }

  /**
   * Returns prefix length from the bitwise netmask.
   * @param ipInt An integer, the netmask in expanded bitwise format.
   * @returns {Prefixlen} An integer, the prefix length.
   * @throws {TypeError} If the input intermingles zeroes & ones.
   */
  static _prefixFromIpInt(ipInt: number): Prefixlen {
    return _IPAddressBaseStruct._prefixFromIpInt(IPv4Address, ipInt);
  }

  static _reportInvalidNetmask(netmaskStr: string): never {
    return _IPAddressBaseStruct._reportInvalidNetmask(netmaskStr);
  }

  /**
   * Return prefix length from a numeric string.
   * @param prefixlenStr The string to be converted.
   * @returns {Prefixlen} An integer, the prefix length.
   * @throws {NetmaskValueError} If the input is not a valid netmask.
   */
  static _prefixFromPrefixString(prefixlenStr: string): Prefixlen {
    return _IPAddressBaseStruct._prefixFromPrefixString(
      IPv4Address,
      prefixlenStr
    );
  }

  /**
   * Turn a netmask/hostmask string into a prefix length.
   * @param ipStr The netmask/hostmask to be converted.
   * @returns {Prefixlen} An integer, the prefix length.
   * @throws {NetmaskValueError} If the input is not a valid netmask/hostmask;
   */
  static _prefixFromIpString(ipStr: string): Prefixlen {
    return _IPAddressBaseStruct._prefixFromIpString(IPv4Address, ipStr);
  }

  /**
   * Helper function to parse address of Network/Interface.
   * @param address Argument of Network/Interface.
   * @returns {[UnparsedIPv4Address, Prefixlen]} [addr, prefix] tuple
   */
  static _splitAddrPrefix(
    address: UnparsedIPv6Address | UnparsedIPv6Network
  ): [UnparsedIPv6Address, Prefixlen] {
    const [_addr, prefixlen] = _IPAddressBaseStruct._splitAddrPrefix(
      address,
      IPv4Address._maxPrefixlen
    );
    if (isNumber(_addr)) {
      throw new TypeError("Unexpected bigint in split addr prefix.");
    }
    return [_addr, prefixlen];
  }

  // END: _IPAddressBase
  // BEGIN: _BaseNetwork
  toRepr(this: IPv6Network): string {
    return _BaseNetworkStruct.toRepr("IPv6Network", this);
  }
  toString(this: IPv6Network): string {
    return _BaseNetworkStruct.toString(this);
  }
  /**
   * Generate iterator over usable hosts in a network.
   *
   * This is a like iterate except it doesn't return the network
   * or broadcast addresses.
   */
  *hosts(this: IPv6Network): Generator<IPv4Address> {
    yield* _BaseNetworkStruct.hosts(IPv6Network, this);
  }
  *iterate(this: IPv6Network): Generator<IPv4Address> {
    yield* _BaseNetworkStruct.iterate(IPv6Network, this);
  }
  getItem(this: IPv6Network, n: number): IPv6Address {
    const result = _BaseNetworkStruct.getItem(IPv6Network, this, n);
    if (result instanceof IPv4Address) {
      throw new Error("Unexpected IPv4 address in IPv6 network");
    }
    return result;
  }
  lessThan(this: IPv6Network, other: IPv6Network): boolean {
    return _BaseNetworkStruct.lessThan(this, other);
  }
  equals(this: IPv6Network, other: IPv6Network): boolean {
    return _BaseNetworkStruct.equals(this, other);
  }
  contains(this: IPv6Network, other: IPv4Address): boolean {
    return _BaseNetworkStruct.contains(this, other);
  }
  /**
   * Tell if this is partly contained in other
   * @param other The other network
   * @returns {boolean} true if contained, false otherwise.
   */
  overlaps(this: IPv6Network, other: IPv6Network): boolean {
    return _BaseNetworkStruct.overlaps(this, other);
  }
  get broadcastAddress(): IPv6Address {
    const result = _BaseNetworkStruct.broadcastAddress(IPv6Network, this);
    if (result instanceof IPv4Address) {
      throw new Error("Unexpected IPv4 address");
    }
    return result;
  }
  // https://github.com/python/cpython/blob/eb0ce92141cd14196a8922cfe9df4a713c5c1d9b/Lib/ipaddress.py#L764
  get hostmask(): IPv6Address {
    const result = _BaseNetworkStruct.hostmask(IPv6Network, this);
    if (result instanceof IPv4Address) {
      throw new Error("Unexpected IPv4 address");
    }
    return result;
  }
  get withPrefixlen(): string {
    return _BaseNetworkStruct.withPrefixlen(this);
  }
  get withNetmask(): string {
    return _BaseNetworkStruct.withNetmask(this);
  }
  get withHostmask(): string {
    return _BaseNetworkStruct.withHostmask(this);
  }
  /**
   * Number of hosts in the current subnet.
   */
  get numAddresses(): number {
    return _BaseNetworkStruct.numAddresses(this);
  }
  get prefixlen(): number {
    return _BaseNetworkStruct.prefixlen(this);
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
    yield* _BaseNetworkStruct.addressExclude(IPv6Network, this, other);
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
  compareNetworks(this: IPv6Network, other: IPv6Network): 1 | 0 | -1 {
    return _BaseNetworkStruct.compareNetworks(this, other);
  }
  /**
   * Network-only key function.
   *
   * @returns {[IPVersion, IPv4Address, IPv4Address]} Returns an object that identifies
   * this address' network and netmask. This function is a suitable "key" argument for
   * sorting.
   */
  getNetworksKey(): [IPVersion, IPv6Address, IPv6Address] {
    return _BaseNetworkStruct._getNetworksKey(this);
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
    this: IPv6Network,
    prefixlenDiff = 1,
    newPrefix: number | null = null
  ): Generator<IPv6Network, void> {
    yield* _BaseNetworkStruct.subnets(
      IPv6Network,
      this,
      prefixlenDiff,
      newPrefix
    );
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
  supernet(
    this: IPv6Network,
    prefixlenDiff = 1,
    newPrefix: number | null = null
  ): IPv6Network {
    return _BaseNetworkStruct.supernet(
      IPv6Network,
      this,
      prefixlenDiff,
      newPrefix
    );
  }
  static _isSubnetOf(a: IPv6Network, b: IPv6Network): boolean {
    return _BaseNetworkStruct._isSubnetOf(a, b);
  }
  /**
   * @param other the other network
   * @returns {boolean} true if this network is a subnet of other.
   */
  subnetOf(this: IPv6Network, other: IPv6Network): boolean {
    return _BaseNetworkStruct.subnetOf(IPv6Network, this, other);
  }
  /**
   * @param other the other network
   * @returns {boolean} true if this network is a supernet of other.
   */
  supernetOf(this: IPv6Network, other: IPv6Network): boolean {
    return _BaseNetworkStruct.supernetOf(IPv6Network, this, other);
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
  static _makeNetmask(arg: NetmaskCacheKey): V6NetmaskCacheValue {
    return _BaseV6Struct._makeNetmask(IPv6Address, arg);
  }

  /**
   * Turn an IPv6 ipStr into an integer.
   * @param ipStr A string, the IPv6 ipStr.
   * @returns {bigint} A bigint, the IPv6 address.
   * @throws {AddressValueError} if ipStr isn't a valid IPv6 address.
   */
  static _ipBigIntFromString(ipStr: string): bigint {
    return _BaseV6Struct._ipBigIntFromString(IPv6Address, ipStr);
  }

  /**
   * Convert an IPv6 hextet string into an integer
   * @param hextetStr A string, the number to parse.
   * @returns {number} The hextet as an integer.
   * @throws {Error} if the input isn't strictly a hex number from
   * [0..FFFF].
   */
  static _parseHextet(hextetStr: string): number {
    return _BaseV6Struct._parseHextet(IPv6Address, hextetStr);
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
    return _BaseV6Struct._compressHextets(hextets);
  }

  /**
   * Turns a 128-bit integer into hexadecimal notation.
   * @param ipInt An integer, the IP address.
   * @returns {string} A string, the hexadecimal representation of the address.
   * @throws {Error} The address is bigger than 128 bits of all ones.
   */
  static _stringFromIpInt(ipInt: bigint): string {
    return _BaseV6Struct._stringFromIpInt(IPv6Address, ipInt);
  }

  /**
   * Expand a shortened IPv6 address.
   * @returns {string} A string, the expanded IPv6 address.
   */
  _explodeShorthandIpString(this: IPv6Address): string {
    return _BaseV6Struct._explodeShorthandIpString(IPv6Address, this);
  }

  /**
   * Return the reverse DNS pointer name for the IPv6 address.
   *
   * This implements the method described in RFC3596 2.5.
   */
  _reversePointer(this: IPv6Address): string {
    return _BaseV6Struct._reversePointer(this);
  }

  /**
   * Helper function to parse IPv6 string address scope id.
   *
   * See RFC 4007 for details.
   * @param ipStr A string, the IPv6 address.
   * @returns {[string, string | null]} [addr, scopeId] tuple.
   */
  static _splitScopeId(ipStr: string): [string, string | null] {
    return _BaseV6Struct._splitScopeId(ipStr);
  }

  get maxPrefixlen() {
    return IPv6Address._maxPrefixlen;
  }

  get version(): 6 {
    return IPv6Address._version;
  }

  // END: _BaseV6
}
