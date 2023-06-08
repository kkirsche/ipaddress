import { IPv6Address } from "./IPv6Address";
import { IPv6Network } from "./IPv6Network";
import { UnparsedIPv6Address } from "./interfaces";

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

  toString(): string {
    return `${super.toString()}/${this._prefixlen}`;
  }

  /**
   * Expand a shortened IPv6 address.
   * @returns {string} A string, the expanded IPv6 address.
   */
  _explodeShorthandIpString(): string {
    const ipStr = this.ip.toString();

    const ipInt = IPv6Interface._ipIntFromString(ipStr);
    const hexStr = `${ipInt.toString(16)}${"0".repeat(32)}`.slice(0, 32);
    const parts = [];
    for (let x = 0; x < 32; x + 4) {
      const part = hexStr.slice(x, x + 4);
      parts.push(part);
    }
    return `${parts.join(":")}/${this._prefixlen}`;
  }

  equals(other: {
    version: number;
    _ip: bigint;
    network: IPv6Network;
  }): boolean {
    const addressEqual = super.equals(other);
    if (!addressEqual) {
      return addressEqual;
    }
    return this.network.equals(other.network);
  }

  toRepr(): string {
    return `IPv6Interface('${this.toString()}')`;
  }

  lessThan(other: {
    version: number;
    _ip: bigint;
    network: IPv6Network;
  }): boolean {
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
    return `${IPv6Interface._stringFromIpInt(this._ip)}/${this._prefixlen}`;
  }

  get withNetmask(): string {
    return `${IPv6Interface._stringFromIpInt(
      this._ip
    )}/${this.netmask.toString()}`;
  }

  get withHostmask(): string {
    return `${IPv6Interface._stringFromIpInt(
      this._ip
    )}/${this.hostmask.toString()}`;
  }

  // END: IPv6Interface
}
