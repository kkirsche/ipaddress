import { IPv6Address } from "./IPv6Address";
import { IPv6Network } from "./IPv6Network";
import { UnparsedIPv6Address } from "./constants";

export class IPv6Interface extends IPv6Address {
  network: IPv6Network;
  netmask: IPv6Network["netmask"];
  _prefixlen: number;

  constructor(address: UnparsedIPv6Address) {
    const [addr, mask] = IPv6Interface._splitAddrPrefix(address);
    super(addr);
    this.network = new IPv6Network([addr, mask], false);
    this.netmask = this.network.netmask;
    this._prefixlen = this.network._prefixlen;
  }

  // BEGIN: IPv6Interface
  get hostmask(): IPv6Address {
    return this.network.hostmask;
  }

  toString(this: IPv6Interface): string {
    return `${super.toString()}/${this._prefixlen}`;
  }

  equals(this: IPv6Interface, other: IPv6Interface): boolean {
    const addressEqual = super.equals(other);
    if (!addressEqual) {
      return addressEqual;
    }
    return this.network.equals(other.network);
  }

  lessThan(this: IPv6Interface, other: IPv6Interface): boolean {
    const addressLess = super.lessThan(other);
    return (
      this.network.lessThan(other.network) ||
      (this.network.equals(other.network) && addressLess)
    );
  }

  get ip(): IPv6Address {
    return new IPv6Address(this._ip);
  }

  get withPrefixlen(): string {
    return `${this._stringFromIpInt(this._ip)}/${this._prefixlen}`;
  }

  get withNetmask(): string {
    return `${this._stringFromIpInt(this._ip)}/${this.netmask.toString()}`;
  }

  get withHostmask(): string {
    return `${this._stringFromIpInt(this._ip)}/${this.hostmask.toString()}`;
  }

  // END: IPv6Interface
}
