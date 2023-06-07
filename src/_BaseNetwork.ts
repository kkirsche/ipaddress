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
import { isNull } from "./typeGuards";
import { isSafeNumber } from "./utilities";

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
  getItem: <C extends NetworkClass>(
    cls: C,
    obj: NetworkInstance,
    n: number
  ) => {
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
  contains: <I extends NetworkInstance, O extends AddressInstance>(
    obj: I,
    other: O
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
  overlaps: <I extends NetworkInstance, O extends NetworkInstance>(
    obj: I,
    other: O
  ): boolean => {
    return (
      other.contains(obj.networkAddress) ||
      other.contains(obj.broadcastAddress) ||
      obj.contains(other.networkAddress) ||
      obj.contains(other.broadcastAddress)
    );
  },
  broadcastAddress: <C extends NetworkClass, I extends NetworkInstance>(
    cls: C,
    obj: I
  ): AddressInstance => {
    return new cls._addressClass(
      BigInt(obj.networkAddress.toNumber()) | BigInt(obj.hostmask.toNumber())
    );
  },
  hostmask: <T extends NetworkClass>(
    cls: T,
    obj: NetworkInstance
  ): AddressInstance => {
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
  addressExclude,
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
  _getNetworksKey: <O extends NetworkInstance>(
    obj: O
  ): [IPVersion, O["networkAddress"], O["netmask"]] => {
    return [obj.version, obj.networkAddress, obj.netmask];
  },
  subnets,
  supernet: <C extends NetworkClass, O extends NetworkInstance>(
    cls: C,
    obj: O,
    prefixlenDiff = 1,
    newPrefix: number | null = null
  ): O => {
    if (obj._prefixlen === 0) {
      return obj;
    }

    if (!isNull(newPrefix)) {
      if (newPrefix > obj._prefixlen) {
        throw new Error("new prefix must be shorter");
      }
      if (prefixlenDiff !== 1) {
        throw new Error("cannot set prefixlenDiff and newPrefix");
      }
      prefixlenDiff = obj._prefixlen - prefixlenDiff;
    }

    const newPrefixlen = obj._prefixlen - prefixlenDiff;
    if (newPrefixlen < 0) {
      throw new Error(
        `current prefixlen is ${obj._prefixlen}, cannot have a prefixlenDiff of ${prefixlenDiff}`
      );
    }

    let value: bigint | number =
      BigInt(obj.networkAddress.toNumber()) &
      (BigInt(obj.netmask.toNumber()) << BigInt(prefixlenDiff));

    if (isSafeNumber(value)) {
      value = Number(value);
    }

    // @ts-expect-error temporary because we don't have IPv6 stuff yet
    return new cls([value, newPrefixlen]);
  },
  _isSubnetOf: (a: NetworkInstance, b: NetworkInstance): boolean => {
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
  },
  subnetOf: (
    cls: NetworkClass,
    obj: NetworkInstance,
    other: NetworkInstance
  ): boolean => {
    return cls._isSubnetOf(obj, other);
  },
  supernetOf: (
    cls: NetworkClass,
    obj: NetworkInstance,
    other: NetworkInstance
  ): boolean => {
    return cls._isSubnetOf(other, obj);
  },
};

function* subnets<C extends NetworkClass, O extends NetworkInstance>(
  cls: C,
  obj: O,
  prefixlenDiff = 1,
  newPrefix: number | null = null
): Generator<O, O> {
  if (obj._prefixlen === obj.maxPrefixlen) {
    yield obj;
    return obj;
  }

  if (!isNull(newPrefix)) {
    if (newPrefix < obj._prefixlen) {
      throw new Error("new prefix must be longer");
    }
    if (prefixlenDiff !== 1) {
      throw new Error("cannot set prefixlenDiff and newPrefix");
    }
    prefixlenDiff = newPrefix - obj._prefixlen;
  }

  if (prefixlenDiff < 0) {
    throw new Error("prefix length diff must be > 0");
  }
  const newPrefixlen = obj._prefixlen + prefixlenDiff;
  if (newPrefixlen > obj.maxPrefixlen) {
    throw new Error(
      `prefix length diff ${newPrefixlen} is invalid for netblock ${obj.toString()}`
    );
  }

  const start = obj.networkAddress.toNumber();
  const end = obj.broadcastAddress.toNumber();
  const step =
    (BigInt(obj.hostmask.toNumber()) + BigInt(1)) >> BigInt(prefixlenDiff);
  const subnets: (typeof obj)[] = [];
  for (let newAddr = start; newAddr < end; step) {
    const current = new cls([newAddr, newPrefixlen]);
    yield current;
    subnets.push(current);
  }
  return subnets;
}

function* addressExclude<T extends NetworkClass, O extends NetworkInstance>(
  cls: T,
  obj: O,
  other: NetworkInstance
): Generator<O, null | undefined> {
  if (obj.version !== other.version) {
    throw new Error(
      `${obj.toString()} and ${other.toString()} are not of the same version`
    );
  }

  if (!other.subnetOf(obj)) {
    throw new Error(
      `${other.toString()} is not contained in ${obj.toString()}`
    );
  }

  if (other.equals(obj)) {
    return null;
  }

  // Make sure we're comparing the network of other.
  other = new cls(`${other.networkAddress.toString()}/${other.prefixlen}`);

  const subnetGenerator = obj.subnets();
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
