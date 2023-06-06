import {
  HasNetworkAddressAndNetmask,
  HasNetworkAddressAndPrefixlen,
  MayIterHosts,
  Stringable,
  Versionable,
} from "./interfaces";
import { IPInteger, IPVersion } from "./constants";

import { IPv4Address } from "./IPv4Address";
import { _BaseConstants } from "./_BaseConstants";
import { _IPAddressBaseT } from "./_IPAddressBase";

/**
 * A generic IP network object.
 * This IP interface contains the version independent methods which are
 * used by networks.
 */
export interface _BaseNetworkT extends _IPAddressBaseT {
  new (): _BaseNetworkTInstance;
  _isSubnetOf: (a: _BaseNetworkT, b: _BaseNetworkT) => boolean;
  _constants: _BaseConstants;
}

export interface _BaseNetworkTInstance {
  // instance
  toRepr: () => string;
  toString: () => string;
  hosts: () => Generator<_BaseAddressT>; // TODO: identify
  iterate: () => Generator<_BaseAddressT>;
  getItem: (n: IPInteger) => _BaseAddressT;
  lessThan: (other: _BaseNetworkT) => boolean;
  equals: (other: _BaseNetworkT) => boolean;
  // hash: () => bigint;
  contains: (other: _BaseAddressT) => boolean;
  overlaps: (other: _BaseNetworkT) => boolean;
  addressExclude: (other: _BaseAddressT) => _BaseNetworkT[];
  compareNetworks: (other: _BaseNetworkT) => 1 | 0 | -1;
  _getNetworkKey: () => [IPVersion, _BaseAddressT, Netmask];
  subnetOf: (other: _BaseNetworkT) => boolean;
  supernetOf: (other: _BaseNetworkT) => boolean;
  subnets: (
    prefixlenDiff: number,
    newPrefix: number | null
  ) => Generator<_BaseNetworkT>;
  supernet: (prefixlenDiff: number, newPrefix: number | null) => _BaseNetworkT;
  // property
  broadcastAddress: _BaseAddressT;
  hostmask: _BaseAddressT;
  withPrefixlen: string;
  withNetmask: string;
  withHostmask: string;
  numAddresses: number;
  prefixlen: number;
  isMulticast: boolean;
  isReserved: boolean;
  isLinkLocal: boolean;
  isPrivate: boolean;
  isGlobal: boolean;
  isUnspecified: boolean;
  isLoopback: boolean;
}
function* hosts(obj: MayIterHosts): Generator<IPv4Address> {
  const network = obj.networkAddress.toNumber();
  const broadcast = obj.broadcastAddress.toNumber();
  for (let x = network + 1; x < broadcast; x++) {
    yield new obj._addressClass(x);
  }
}

export const _BaseNetworkStruct = {
  toRepr: (clsName: string, obj: Stringable): string => {
    return `${clsName}('${obj.toString()}')`;
  },
  toString: (obj: HasNetworkAddressAndPrefixlen): string => {
    return `${obj.networkAddress.toString()}/${obj.prefixlen}`;
  },
  hosts,
  iterate: hosts,
  getItem: (obj: MayIterHosts, n: number) => {
    const network = obj.networkAddress.toNumber();
    const broadcast = obj.broadcastAddress.toNumber();
    if (n >= 0) {
      if (network + n > broadcast) {
        throw new Error("address out of range");
      }
      return new obj._addressClass(network + n);
    } else {
      n += 1;
      if (broadcast + n < network) {
        throw new Error("address out of range");
      }
      return new obj._addressClass(broadcast + n);
    }
  },
  lessThan: (
    obj: HasNetworkAddressAndNetmask,
    other: HasNetworkAddressAndNetmask
  ): boolean => {
    if (obj.version !== other.version) {
      throw new TypeError(
        `${obj.toString()} and ${other.toString()} are not of the same version`
      );
    }
    if (!obj.networkAddress.equals(other.networkAddress)) {
      return obj.networkAddress.lessThan(other.networkAddress);
    }
    if (!obj.netmask.equals(other.netmask)) {
      return obj.netmask.lessThan(other.netmask);
    }
    return false;
  },
  equals: (
    obj: HasNetworkAddressAndNetmask,
    other: HasNetworkAddressAndNetmask
  ): boolean => {
    return (
      obj.version === other.version &&
      obj.networkAddress.equals(other.networkAddress) &&
      obj.netmask.toNumber() === other.netmask.toNumber()
    );
  },
  contains: (
    obj: IPv4Address & HasNetworkAddressAndNetmask,
    other: Versionable & HasNetworkAddressAndNetmask
  ): boolean => {
    // always false if one is v4 and the other is v6
    if (obj.version !== other.version) {
      return false;
    }
    return (
      (BigInt(other._ip) & BigInt(obj.netmask._ip)) ==
      BigInt(obj.networkAddress._ip)
    );
  },
  overlaps: (
    obj: {
      contains: (other: Versionable & HasNetworkAddressAndNetmask) => boolean;
    } & HasNetworkAddressAndNetmask,
    other: {
      contains: (other: Versionable & HasNetworkAddressAndNetmask) => boolean;
    } & HasNetworkAddressAndNetmask
  ): boolean => {
    return (
      other.contains(obj.networkAddress) ||
      other.contains(obj.broadcastAddress) ||
      obj.contains(other.networkAddress) ||
      obj.contains(other.broadcastAddress)
    );
  },
};
