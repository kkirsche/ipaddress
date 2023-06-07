import {
  ByteArray,
  IPVersion,
  IPv4ALLONES,
  IPv4LENGTH,
  NetmaskCacheKey,
  NetmaskCacheValue,
  Prefixlen,
  UnparsedIPv4Address,
  UnparsedIPv4Network,
} from "./constants";

import { IPv4Address } from "./IPv4Address";
import { _BaseNetworkStruct } from "./_BaseNetwork";
import { _BaseV4Struct } from "./_BaseV4";
import { _IPAddressBaseStruct } from "./_IPAddressBase";
import { _IPv4Constants } from "./_IPv4Constants";
import { isBigInt } from "./typeGuards";

// extends _BaseV4, _BaseNetwork
export class IPv4Network {
  static readonly _version = 4;
  static readonly _ALL_ONES = IPv4ALLONES;
  static readonly _maxPrefixlen = IPv4LENGTH;
  static readonly _constants = _IPv4Constants;
  static _netmaskCache: Record<NetmaskCacheKey, NetmaskCacheValue> = {};
  static readonly _addressClass = IPv4Address;

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
    this.networkAddress = new IPv4Network._addressClass(addr);
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

  _checkIntAddress(this: IPv4Network, address: number): void {
    return _IPAddressBaseStruct._checkIntAddress(IPv4Network, address);
  }

  _checkPackedAddress(
    this: IPv4Network,
    address: ByteArray,
    expectedLen: number
  ): void {
    return _IPAddressBaseStruct._checkPackedAddress(
      IPv4Network,
      address,
      expectedLen
    );
  }

  /**
   * Turn the prefix length into a bitwise mask.
   * @param prefixlen An integer, the prefix length.
   * @returns {number} An integer.
   */
  static _ipIntFromPrefix(prefixlen: Prefixlen): number {
    const result = _IPAddressBaseStruct._ipIntFromPrefix(
      IPv4Address,
      prefixlen
    );
    if (isBigInt(result)) {
      throw new Error("Unexpected bigint in IPV4 Address");
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
    address: UnparsedIPv4Address | UnparsedIPv4Network
  ): [UnparsedIPv4Address, Prefixlen] {
    const [_addr, prefixlen] = _IPAddressBaseStruct._splitAddrPrefix(
      address,
      IPv4Address._maxPrefixlen
    );
    if (isBigInt(_addr)) {
      throw new TypeError("Unexpected bigint in split addr prefix.");
    }
    return [_addr, prefixlen];
  }

  // END: _IPAddressBase
  // BEGIN: _BaseNetwork
  toRepr(this: IPv4Network): string {
    return _BaseNetworkStruct.toRepr("IPv4Network", this);
  }
  toString(this: IPv4Network): string {
    return _BaseNetworkStruct.toString(this);
  }
  /**
   * Generate iterator over usable hosts in a network.
   *
   * This is a like iterate except it doesn't return the network
   * or broadcast addresses.
   */
  *hosts(this: IPv4Network): Generator<IPv4Address> {
    yield* _BaseNetworkStruct.hosts(IPv4Network, this);
  }
  *iterate(this: IPv4Network): Generator<IPv4Address> {
    yield* _BaseNetworkStruct.iterate(IPv4Network, this);
  }
  getItem(this: IPv4Network, n: number): IPv4Address {
    return _BaseNetworkStruct.getItem(IPv4Network, this, n);
  }
  lessThan(this: IPv4Network, other: IPv4Network): boolean {
    return _BaseNetworkStruct.lessThan(this, other);
  }
  equals(this: IPv4Network, other: IPv4Network): boolean {
    return _BaseNetworkStruct.equals(this, other);
  }
  contains(this: IPv4Network, other: IPv4Address): boolean {
    return _BaseNetworkStruct.contains(this, other);
  }
  /**
   * Tell if this is partly contained in other
   * @param other The other network
   * @returns {boolean} true if contained, false otherwise.
   */
  overlaps(this: IPv4Network, other: IPv4Network): boolean {
    return _BaseNetworkStruct.overlaps(this, other);
  }
  get broadcastAddress(): IPv4Address {
    return _BaseNetworkStruct.broadcastAddress(IPv4Network, this);
  }
  // https://github.com/python/cpython/blob/eb0ce92141cd14196a8922cfe9df4a713c5c1d9b/Lib/ipaddress.py#L764
  get hostmask(): IPv4Address {
    return _BaseNetworkStruct.hostmask(IPv4Network, this);
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
  *addressExclude(
    this: IPv4Network,
    other: IPv4Network
  ): Generator<IPv4Network, void> {
    yield* _BaseNetworkStruct.addressExclude(IPv4Network, this, other);
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
  compareNetworks(this: IPv4Network, other: IPv4Network): 1 | 0 | -1 {
    return _BaseNetworkStruct.compareNetworks(this, other);
  }
  /**
   * Network-only key function.
   *
   * @returns {[IPVersion, IPv4Address, IPv4Address]} Returns an object that identifies
   * this address' network and netmask. This function is a suitable "key" argument for
   * sorting.
   */
  getNetworksKey(): [IPVersion, IPv4Address, IPv4Address] {
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
   * @returns {Generator<IPv4Network, void>} An iterator of IPv4 objects.
   * @throws {Error} The prefixlenDiff is too small or too large.
   * @throws {Error} prefixlenDiff and newPrefix are both set or newPrefix is a
   * smaller number than the current prefix (smaller number means a larger network).
   */
  *subnets(
    this: IPv4Network,
    prefixlenDiff = 1,
    newPrefix: number | null = null
  ): Generator<IPv4Network, void> {
    yield* _BaseNetworkStruct.subnets(
      IPv4Network,
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
    return _BaseNetworkStruct.supernet(
      IPv4Network,
      this,
      prefixlenDiff,
      newPrefix
    );
  }
  static _isSubnetOf(a: IPv4Network, b: IPv4Network): boolean {
    return _BaseNetworkStruct._isSubnetOf(a, b);
  }
  /**
   * @param other the other network
   * @returns {boolean} true if this network is a subnet of other.
   */
  subnetOf(this: IPv4Network, other: IPv4Network): boolean {
    return _BaseNetworkStruct.subnetOf(IPv4Network, this, other);
  }
  /**
   * @param other the other network
   * @returns {boolean} true if this network is a supernet of other.
   */
  supernetOf(this: IPv4Network, other: IPv4Network): boolean {
    return _BaseNetworkStruct.supernetOf(IPv4Network, this, other);
  }
  // END: _BaseNetwork
  // BEGIN: _BaseV4

  _explodeShorthandIpString(this: IPv4Network): string {
    return _BaseV4Struct._explodeShorthandIpString(this);
  }

  /**
   * Make a [netmask, prefixlen] tuple from the given argument.
   * @param arg Argument can be:
   *  * - an integer (the prefix length)
   * - a string representing the prefix length (e.g. "24")
   * - a string representing the prefix netmask (e.g. "255.255.255.0")
   * @returns {NetmaskCacheValue} The [netmask, prefixlen] tuple.
   */
  static _makeNetmask(arg: string | Prefixlen): NetmaskCacheValue {
    return _BaseV4Struct._makeNetmask(IPv4Address, arg);
  }

  /**
   * Turn the given IP string into an integer for comparison.
   * @param ipStr A string, the IP ipStr.
   * @returns {number} The IP ipStr as an integer.
   * @throws {AddressValueError} if ipStr isn't a valid IPv4 Address.
   */
  static _ipIntFromString(ipStr: string): number {
    return _BaseV4Struct._ipIntFromString(IPv4Address, ipStr);
  }

  /**
   * Convert a dotted decimal octet into an integer
   * @param octetStr A string, the number to parse.
   * @returns {number} The octet as an integer.
   * @throws {TypeError} if the octet isn't strictly a decimal [0..255].
   */
  static _parseOctet(octetStr: string): number {
    return _BaseV4Struct._parseOctet(octetStr);
  }

  /**
   * Turns a 32-bit integer into dotted decimal notation.
   * @param ipInt An integer, the IP Address.
   * @returns {string} The IP address as a string in dotted decimal notation.
   */
  static _stringFromIpInt(ipInt: number): string {
    return _BaseV4Struct._stringFromIpInt(ipInt);
  }

  /**
   * Turns a 32-bit integer into dotted decimal notation.
   * @param ipInt An integer, the IP Address.
   * @returns {string} The IP address as a string in dotted decimal notation.
   */
  _stringFromIpInt(ipInt: number): string {
    return _BaseV4Struct._stringFromIpInt(ipInt);
  }

  /**
   * Return the reverse DNS pointer name for the IPv4 address.
   * This implements the method described in RFC1035 3.5.
   * @returns {string} The reverse DNS pointer name.
   */
  _reversePointer(this: IPv4Network): string {
    return _BaseV4Struct._reversePointer(this);
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
