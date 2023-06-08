import { IPv6Address, IPv6Network } from "./internal";

export class _IPv6Constants {
  static readonly _linklocalNetwork = new IPv6Network("169.254.0.0/16");

  static readonly _loopbackNetwork = new IPv6Network("127.0.0.0/8");

  static readonly _multicastNetwork = new IPv6Network("224.0.0.0/4");

  static readonly _publicNetwork = new IPv6Network("100.64.0.0/10");

  static readonly _privateNetworks = [
    new IPv6Network("0.0.0.0/8"),
    new IPv6Network("10.0.0.0/8"),
    new IPv6Network("127.0.0.0/8"),
    new IPv6Network("169.254.0.0/16"),
    new IPv6Network("172.16.0.0/12"),
    new IPv6Network("192.0.0.0/29"),
    new IPv6Network("192.0.0.170/31"),
    new IPv6Network("192.0.2.0/24"),
    new IPv6Network("192.168.0.0/16"),
    new IPv6Network("198.18.0.0/15"),
    new IPv6Network("198.51.100.0/24"),
    new IPv6Network("203.0.113.0/24"),
    new IPv6Network("240.0.0.0/4"),
    new IPv6Network("255.255.255.255/32"),
  ];

  static readonly _reservedNetwork = new IPv6Network("240.0.0.0/4");

  static readonly _unspecifiedAddress = new IPv6Address("0.0.0.0");
}
