/**
 * A TypeScript port of Python's ipaddress module.
 *
 * https://docs.python.org/3/library/ipaddress.html
 */
export { IPV4LENGTH, IPV6LENGTH } from "./constants";
export { AddressValueError, NetmaskValueError, ValueError } from "./errors";
export { NotImplemented } from "./base";
export type { NotImplementedType } from "./base";
export type {
  AddressInput,
  NetmaskInput,
  NetworkInput,
  PrefixOptions,
} from "./interfaces";
export { IPv4Address, IPv4Interface, IPv4Network } from "./ipv4";
export { IPv6Address, IPv6Interface, IPv6Network } from "./ipv6";
export {
  collapseAddresses,
  getMixedTypeKey,
  ipAddress,
  ipInterface,
  ipNetwork,
  summarizeAddressRange,
} from "./functions";
export type { IPAddress, IPInterface, IPNetwork } from "./functions";
export { v4IntToPacked, v6IntToPacked } from "./utilities";
