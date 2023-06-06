import { IPv4Address } from "./IPv4Address";
import { IPv4Network } from "./IPv4Network";
import { UnparsedIPv4Address } from "./constants";

export class IPv4Interface extends IPv4Address {
  network: IPv4Network;
  netmask: IPv4Address;
  _prefixlen: number;

  constructor(address: UnparsedIPv4Address) {
    const [addr, mask] = IPv4Interface._splitAddrPrefix(address);
    super(addr);
    this.network = new IPv4Network([addr, mask], false);
    this.netmask = this.network.netmask;
    this._prefixlen = this.network._prefixlen;
  }

  get hostmask(): IPv4Address {
    return this.network.hostmask;
  }

  toString(this: IPv4Interface): string {
    return `${this._stringFromIpInt(this._ip)}/${this._prefixlen}`;
  }
  equals(this: IPv4Interface, other: IPv4Interface): boolean {
    const addressEqual = super.equals(other);
    if (addressEqual === false) {
      return addressEqual;
    }
    return this.network.equals(other.network);
  }
  lessThan(this: IPv4Interface, other: IPv4Interface): boolean {
    const addressLess = super.lessThan(other);
    return (
      this.network.lessThan(other.network) ||
      (this.network.equals(other.network) && addressLess)
    );
  }
  get ip(): IPv4Address {
    return new IPv4Address(this._ip);
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
}
