import {
  AddressInstance,
  NetworkClass,
  NetworkInstance,
  Stringable,
} from "./interfaces";
import { IPInteger, IPVersion, Netmask } from "./constants";

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
  hosts: () => Generator<AddressInstance>; // TODO: identify
  iterate: () => Generator<AddressInstance>;
  getItem: (n: IPInteger) => AddressInstance;
  lessThan: (other: NetworkInstance) => boolean;
  equals: (other: NetworkInstance) => boolean;
  // hash: () => bigint;
  contains: (other: AddressInstance) => boolean;
  overlaps: (other: AddressInstance) => boolean;
  addressExclude: (other: AddressInstance) => _BaseNetworkT[];
  compareNetworks: (other: NetworkInstance) => 1 | 0 | -1;
  _getNetworkKey: () => [IPVersion, AddressInstance, Netmask];
  subnetOf: (other: NetworkInstance) => boolean;
  supernetOf: (other: NetworkInstance) => boolean;
  subnets: (
    prefixlenDiff: number,
    newPrefix: number | null
  ) => Generator<NetworkInstance>;
  supernet: (
    prefixlenDiff: number,
    newPrefix: number | null
  ) => NetworkInstance;
  // property
  broadcastAddress: AddressInstance;
  hostmask: AddressInstance;
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
function* hosts(
  cls: NetworkClass,
  obj: NetworkInstance
): Generator<IPv4Address> {
  const network = obj.networkAddress.toNumber();
  const broadcast = obj.broadcastAddress.toNumber();
  for (let x = network + 1; x < broadcast; x++) {
    yield new cls._addressClass(x);
  }
}

export const _BaseNetworkStruct = {
  toRepr: (clsName: string, obj: Stringable): string => {
    return `${clsName}('${obj.toString()}')`;
  },
  toString: (obj: NetworkInstance): string => {
    return `${obj.networkAddress.toString()}/${obj.prefixlen}`;
  },
  hosts,
  iterate: hosts,
  getItem: (cls: NetworkClass, obj: NetworkInstance, n: number) => {
    const network = obj.networkAddress.toNumber();
    const broadcast = obj.broadcastAddress.toNumber();
    if (n >= 0) {
      if (network + n > broadcast) {
        throw new Error("address out of range");
      }
      return new cls._addressClass(network + n);
    } else {
      n += 1;
      if (broadcast + n < network) {
        throw new Error("address out of range");
      }
      return new cls._addressClass(broadcast + n);
    }
  },
  lessThan: (obj: NetworkInstance, other: NetworkInstance): boolean => {
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
  equals: (obj: NetworkInstance, other: NetworkInstance): boolean => {
    return (
      obj.version === other.version &&
      obj.networkAddress.equals(other.networkAddress) &&
      obj.netmask.toNumber() === other.netmask.toNumber()
    );
  },
  contains: (obj: NetworkInstance, other: AddressInstance): boolean => {
    // always false if one is v4 and the other is v6
    if (obj.version !== other.version) {
      return false;
    }
    return (
      (BigInt(other._ip) & BigInt(obj.netmask._ip)) ==
      BigInt(obj.networkAddress._ip)
    );
  },
  overlaps: (obj: NetworkInstance, other: NetworkInstance): boolean => {
    return (
      other.contains(obj.networkAddress) ||
      other.contains(obj.broadcastAddress) ||
      obj.contains(other.networkAddress) ||
      obj.contains(other.broadcastAddress)
    );
  },
  broadcastAddress: (
    cls: NetworkClass,
    obj: NetworkInstance
  ): AddressInstance => {
    return new cls._addressClass(
      BigInt(obj.networkAddress.toNumber()) | BigInt(obj.hostmask.toNumber())
    );
  },
  hostmask: (cls: NetworkClass, obj: NetworkInstance): AddressInstance => {
    return new cls._addressClass(
      BigInt(obj.networkAddress.toNumber()) ^ BigInt(cls._ALL_ONES)
    );
  },
  withPrefixlen: (obj: NetworkInstance): string => {
    return `${obj.networkAddress.toString()}/${obj._prefixlen}`;
  },
  withNetmask: (obj: NetworkInstance): string => {
    return `${obj.networkAddress.toString()}/${obj.netmask.toString()}`;
  },
  withHostmask: (obj: NetworkInstance): string => {
    return `${obj.networkAddress.toString()}/${obj.hostmask.toString()}`;
  },
  numAddresses: (obj: NetworkInstance): number => {
    return obj.broadcastAddress.toNumber() - obj.networkAddress.toNumber() + 1;
  },
  prefixlen: (obj: NetworkInstance): number => {
    return obj._prefixlen;
  },
  compareNetworks: (
    obj: NetworkInstance,
    other: NetworkInstance
  ): 1 | 0 | -1 => {
    if (obj.version !== other.version) {
      throw new TypeError(
        `${obj.toString()} and ${other.toString()} are not of the same type`
      );
    }
    // self._version == other._version below here:
    if (obj.networkAddress.lessThan(other.networkAddress)) {
      return -1;
    }
    if (other.networkAddress.lessThan(obj.networkAddress)) {
      return 1;
    }
    // self.network_address == other.network_address below here:
    if (obj.netmask.lessThan(other.netmask)) {
      return -1;
    }
    if (other.netmask.lessThan(obj.netmask)) {
      return 1;
    }
    return 0;
  },
  _getNetworksKey: (
    obj: NetworkInstance
  ): [IPVersion, AddressInstance, AddressInstance] => {
    return [obj.version, obj.networkAddress, obj.netmask];
  },
};
