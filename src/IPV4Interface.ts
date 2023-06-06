import { ByteArray, IPInteger } from "./constants";
import { IPV4AddressT, IPV4AddressTInstance } from "./IPV4Address";

import { _BaseAddressT } from "./_BaseAddress";
import { _BaseNetworkT } from "./_BaseNetwork";

export interface IPV4InterfaceT extends IPV4AddressT {
  new (address: string | IPInteger | ByteArray): IPV4InterfaceTInstance;
}

export interface IPV4InterfaceTInstance
  extends Omit<IPV4AddressTInstance, "equals" | "lessThan"> {
  network: _BaseNetworkT; // todo: update
  netmask: _BaseAddressT; // todo: confirm this!
  _prefixlen: number;
  hostmask: IPV4AddressT;
  toString: () => string;
  equals: (other: IPV4InterfaceT) => boolean;
  lessThan: (other: IPV4InterfaceT) => boolean;
  ip: IPV4AddressT;
  withPrefixlen: string;
  withNetmask: string;
  withHostmask: string;
}
