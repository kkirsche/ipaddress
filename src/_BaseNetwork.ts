import { IPInteger, IPVersion } from "./constants";

import { Netmask } from "./base";
import { _BaseAddressT } from "./_BaseAddress";
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

export const _BaseNetworkStruct = {};
