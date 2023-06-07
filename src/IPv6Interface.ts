import { IPv6Address } from "./IPv6Address";
import { IPv6Network } from "./IPv6Network";

export class IPv6Interface extends IPv6Address {
  network: IPv6Network;
  netmask: IPv6Network["netmask"];
  _prefixlen: number;

  constructor() {
    super("fake");
    this.network = new IPv6Network("fake");
    this.netmask = new IPv6Address("fake");
    this._prefixlen = -1;
  }

  get ip(): IPv6Address {
    return new IPv6Address(this._ip);
  }
}
