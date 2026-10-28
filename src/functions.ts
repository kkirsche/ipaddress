import type { AddressInput, NetworkInput } from "./interfaces";
import { AddressValueError, NetmaskValueError, ValueError } from "./errors";
import type { NotImplementedType } from "./base";
import { NotImplemented, _BaseAddress, _BaseNetwork } from "./base";
import { IPv4Address, IPv4Interface, IPv4Network } from "./ipv4";
import { IPv6Address, IPv6Interface, IPv6Network } from "./ipv6";
import { _countRighthandZeroBits, bitLength, reprValue } from "./utilities";

export type IPAddress = IPv4Address | IPv6Address;
export type IPInterface = IPv4Interface | IPv6Interface;
export type IPNetwork = IPv4Network | IPv6Network;

function _tryEach<T>(
  address: unknown,
  kind: string,
  constructors: (() => T)[]
): T {
  for (const construct of constructors) {
    try {
      return construct();
    } catch (err: unknown) {
      if (
        !(err instanceof AddressValueError || err instanceof NetmaskValueError)
      ) {
        throw err;
      }
    }
  }
  throw new ValueError(
    `${reprValue(address)} does not appear to be an IPv4 or IPv6 ${kind}`
  );
}

/**
 * Take an IP string/int and return an object of the correct type.
 * @param address A string or integer, the IP address. Either IPv4 or IPv6
 * addresses may be supplied; integers less than 2**32 will be considered to
 * be IPv4 by default.
 * @returns {IPv4Address | IPv6Address} An IPv4Address or IPv6Address object.
 * @throws {ValueError} if the address passed isn't either a v4 or a v6
 * address.
 */
export function ipAddress(address: AddressInput): IPAddress {
  return _tryEach<IPAddress>(address, "address", [
    () => new IPv4Address(address),
    () => new IPv6Address(address),
  ]);
}

/**
 * Take an IP string/int and return an object of the correct type.
 * @param address A string or integer, the IP network. Either IPv4 or IPv6
 * networks may be supplied; integers less than 2**32 will be considered to
 * be IPv4 by default.
 * @param strict If true, raise a ValueError if host bits are set.
 * @returns {IPv4Network | IPv6Network} An IPv4Network or IPv6Network object.
 * @throws {ValueError} if the string passed isn't either a v4 or a v6
 * address. Or if the network has host bits set.
 */
export function ipNetwork(address: NetworkInput, strict = true): IPNetwork {
  return _tryEach<IPNetwork>(address, "network", [
    () => new IPv4Network(address, strict),
    () => new IPv6Network(address, strict),
  ]);
}

/**
 * Take an IP string/int and return an object of the correct type.
 *
 * The IPv?Interface classes describe an Address on a particular Network, so
 * they're basically a combination of both the Address and Network classes.
 * @param address A string or integer, the IP address. Either IPv4 or IPv6
 * addresses may be supplied; integers less than 2**32 will be considered to
 * be IPv4 by default.
 * @returns {IPv4Interface | IPv6Interface} An IPv4Interface or IPv6Interface
 * object.
 * @throws {ValueError} if the string passed isn't either a v4 or a v6
 * address.
 */
export function ipInterface(address: NetworkInput): IPInterface {
  return _tryEach<IPInterface>(address, "interface", [
    () => new IPv4Interface(address),
    () => new IPv6Interface(address),
  ]);
}

/**
 * Find a sequence of sorted deduplicated IPv#Address.
 * @param addresses a list of IPv#Address objects.
 * @returns A generator of [first, last] tuples of each sequence.
 */
function* _findAddressRange<A extends _BaseAddress>(
  addresses: A[]
): Generator<[A, A], void, undefined> {
  let first = addresses[0];
  let last = first;
  for (const ip of addresses.slice(1)) {
    if (ip._ip !== last._ip + 1n) {
      yield [first, last];
      first = ip;
    }
    last = ip;
  }
  yield [first, last];
}

/**
 * Summarize a network range given the first and last IP addresses.
 *
 * Example:
 *   [...summarizeAddressRange(new IPv4Address('192.0.2.0'),
 *                             new IPv4Address('192.0.2.130'))]
 *   [IPv4Network('192.0.2.0/25'), IPv4Network('192.0.2.128/31'),
 *    IPv4Network('192.0.2.130/32')]
 * @param first the first IPv4Address or IPv6Address in the range.
 * @param last the last IPv4Address or IPv6Address in the range.
 * @returns An iterator of the summarized IPv(4|6) network objects.
 * @throws {TypeError} If the first and last objects are not IP addresses, or
 * are not the same version.
 * @throws {ValueError} If the last object is not greater than the first.
 */
export function summarizeAddressRange(
  first: IPv4Address,
  last: IPv4Address
): Generator<IPv4Network, void, undefined>;
export function summarizeAddressRange(
  first: IPv6Address,
  last: IPv6Address
): Generator<IPv6Network, void, undefined>;
export function summarizeAddressRange(
  first: IPAddress,
  last: IPAddress
): Generator<IPNetwork, void, undefined>;
export function* summarizeAddressRange(
  first: IPAddress,
  last: IPAddress
): Generator<IPNetwork, void, undefined> {
  if (!(first instanceof _BaseAddress && last instanceof _BaseAddress)) {
    throw new TypeError("first and last must be IP addresses, not networks");
  }
  if (first.version !== last.version) {
    throw new TypeError(
      `${first.toString()} and ${last.toString()} are not of the same version`
    );
  }
  if (first.greaterThan(last)) {
    throw new ValueError("last IP address must be greater than first");
  }

  const ip = (address: [bigint, number]): IPNetwork =>
    first.version === 4 ? new IPv4Network(address) : new IPv6Network(address);
  const ipBits = first.maxPrefixlen;
  const allOnes = first._info.allOnes;
  let firstInt = first._ip;
  const lastInt = last._ip;
  while (firstInt <= lastInt) {
    const nbits = Math.min(
      _countRighthandZeroBits(firstInt, ipBits),
      bitLength(lastInt - firstInt + 1n) - 1
    );
    yield ip([firstInt, ipBits - nbits]);
    firstInt += 1n << BigInt(nbits);
    if (firstInt - 1n === allOnes) {
      break;
    }
  }
}

/**
 * A key that is equal for two addresses exactly when Python considers them
 * equal, used in place of Python's set() to deduplicate addresses.
 */
function _dedupKey(obj: _BaseAddress): string {
  if (obj instanceof IPv4Interface || obj instanceof IPv6Interface) {
    const scopeId = obj instanceof IPv6Address ? obj._scopeId ?? "" : "";
    return `I|${obj.version}|${obj._ip}|${scopeId}|${obj.network.networkAddress._ip}|${obj.network._prefixlen}`;
  }
  return `A|${obj.version}|${obj._ip}|${
    obj instanceof IPv6Address ? obj._scopeId ?? "" : ""
  }`;
}

function _sorted<T extends { lessThan(other: unknown): boolean }>(
  items: T[]
): T[] {
  return [...items].sort((a, b) =>
    a.lessThan(b) ? -1 : b.lessThan(a) ? 1 : 0
  );
}

/**
 * Loops through the addresses, collapsing concurrent netblocks.
 * @param addresses A list of IPv4Network's or IPv6Network's
 * @returns A generator of IPv4Network's or IPv6Network's depending on what
 * we were passed.
 */
function* _collapseAddressesInternal(
  addresses: IPNetwork[]
): Generator<IPNetwork, void, undefined> {
  // First merge
  const toMerge = [...addresses];
  const subnets = new Map<string, IPNetwork>();
  while (toMerge.length > 0) {
    const net = toMerge.pop() as IPNetwork;
    const supernet = net.supernet();
    const key = `${supernet.version}|${supernet.networkAddress._ip}|${supernet.netmask._ip}`;
    const existing = subnets.get(key);
    if (existing === undefined) {
      subnets.set(key, net);
    } else if (!existing.equals(net)) {
      // Merge consecutive subnets
      subnets.delete(key);
      toMerge.push(supernet);
    }
  }

  // Then iterate over resulting networks, skipping subsumed subnets
  let last: IPNetwork | null = null;
  for (const net of _sorted([...subnets.values()])) {
    if (last !== null) {
      // Since they are sorted, last.networkAddress <= net.networkAddress
      // is a given.
      if (last.broadcastAddress.greaterThanOrEqual(net.broadcastAddress)) {
        continue;
      }
    }
    yield net;
    last = net;
  }
}

/**
 * Collapse a list of IP objects.
 *
 * Example:
 *   [...collapseAddresses([new IPv4Network('192.0.2.0/25'),
 *                          new IPv4Network('192.0.2.128/25')])]
 *   [IPv4Network('192.0.2.0/24')]
 * @param addresses An iterable of IPv4Network or IPv6Network objects.
 * @returns An iterator of the collapsed IPv(4|6)Network objects.
 * @throws {TypeError} If passed a list of mixed version objects.
 */
export function collapseAddresses(
  addresses: Iterable<IPv4Address | IPv4Network>
): Generator<IPv4Network, void, undefined>;
export function collapseAddresses(
  addresses: Iterable<IPv6Address | IPv6Network>
): Generator<IPv6Network, void, undefined>;
export function collapseAddresses(
  addresses: Iterable<IPAddress | IPNetwork>
): Generator<IPNetwork, void, undefined>;
export function collapseAddresses(
  addresses: Iterable<IPAddress | IPNetwork>
): Generator<IPNetwork, void, undefined> {
  const addrs: IPNetwork[] = [];
  let ips: IPAddress[] = [];
  const nets: IPNetwork[] = [];

  // split IP addresses and networks
  for (const ip of addresses) {
    if (ip instanceof _BaseAddress) {
      const last = ips[ips.length - 1];
      if (ips.length && last.version !== ip.version) {
        throw new TypeError(
          `${ip.toString()} and ${last.toString()} are not of the same version`
        );
      }
      ips.push(ip);
    } else if (ip._prefixlen === ip.maxPrefixlen) {
      const last = ips[ips.length - 1];
      if (ips.length && last.version !== ip.version) {
        throw new TypeError(
          `${ip.toString()} and ${last.toString()} are not of the same version`
        );
      }
      ips.push(ip.networkAddress);
    } else {
      const last = nets[nets.length - 1];
      if (nets.length && last.version !== ip.version) {
        throw new TypeError(
          `${ip.toString()} and ${last.toString()} are not of the same version`
        );
      }
      nets.push(ip);
    }
  }

  // sort and dedup
  const unique = new Map<string, IPAddress>();
  for (const ip of ips) {
    unique.set(_dedupKey(ip), ip);
  }
  ips = _sorted([...unique.values()]);

  // find consecutive address ranges in the sorted sequence and summarize them
  if (ips.length) {
    for (const [first, last] of _findAddressRange(ips)) {
      addrs.push(...summarizeAddressRange(first, last));
    }
  }

  return _collapseAddressesInternal([...addrs, ...nets]);
}

/**
 * Return a key suitable for sorting between networks and addresses.
 *
 * Address and Network objects are not sortable by default; they're
 * fundamentally different so the expression
 *   new IPv4Address('192.0.2.0').lessThanOrEqual(new IPv4Network('192.0.2.0/24'))
 * doesn't make any sense. There are some times however, where you may wish
 * to have ipaddress sort these for you anyway.
 * @param obj either a Network or Address object.
 * @returns appropriate key: [version, address] for addresses and
 * [version, networkAddress, netmask] for networks.
 */
export function getMixedTypeKey(
  obj: unknown
): [4 | 6, IPAddress] | [4 | 6, IPAddress, IPAddress] | NotImplementedType {
  if (obj instanceof _BaseNetwork) {
    return (obj as IPNetwork)._getNetworksKey();
  } else if (obj instanceof _BaseAddress) {
    return (obj as IPAddress)._getAddressKey();
  }
  return NotImplemented;
}
