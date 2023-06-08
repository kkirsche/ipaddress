import { IPv4Address } from "./01-IPv4Address";
import { IPv4Network } from "./03-IPv4Network";

export class _IPv4Constants {
  static readonly _linklocalNetwork = new IPv4Network("169.254.0.0/16");

  static readonly _loopbackNetwork = new IPv4Network("127.0.0.0/8");

  static readonly _multicastNetwork = new IPv4Network("224.0.0.0/4");

  static readonly _publicNetwork = new IPv4Network("100.64.0.0/10");

  static readonly _privateNetworks = [
    new IPv4Network("0.0.0.0/8"),
    new IPv4Network("10.0.0.0/8"),
    new IPv4Network("127.0.0.0/8"),
    new IPv4Network("169.254.0.0/16"),
    new IPv4Network("172.16.0.0/12"),
    new IPv4Network("192.0.0.0/29"),
    new IPv4Network("192.0.0.170/31"),
    new IPv4Network("192.0.2.0/24"),
    new IPv4Network("192.168.0.0/16"),
    new IPv4Network("198.18.0.0/15"),
    new IPv4Network("198.51.100.0/24"),
    new IPv4Network("203.0.113.0/24"),
    new IPv4Network("240.0.0.0/4"),
    new IPv4Network("255.255.255.255/32"),
  ];

  static readonly _reservedNetwork = new IPv4Network("240.0.0.0/4");

  static readonly _unspecifiedAddress = new IPv4Address("0.0.0.0");
}
