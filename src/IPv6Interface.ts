import { IPv6Address } from "./IPv6Address";

export class IPv6Interface {
  _ip: bigint;
  _prefixlen: number;

  get ip(): IPv6Address {
    return new IPv6Address(this._ip);
  }
}
