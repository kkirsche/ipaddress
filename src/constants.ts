import { IPv4Address } from "./IPv4Address";
import { IPv6Address } from "./IPv6Address";

export type IPVersion = 4 | 6;
export type Prefixlen = number;

export const IPv4LENGTH = 32;
export const IPv4ALLONES = 2 ** IPv4LENGTH - 1;
export const IPv6LENGTH = 128;
// if we don't use BigInt, this will overflow
export const IPv6ALLONES = BigInt(2) ** BigInt(IPv6LENGTH) - BigInt(1);

export type IPV4Integer = number;
export type IPV6Integer = bigint;
export type IPInteger = IPV4Integer | IPV6Integer;

export type ByteOrder = "big" | "little";
export type ByteArray = number[];

export type NetmaskCacheKey = string | number;
export type V4NetmaskCacheValue = [IPv4Address, Prefixlen];
export type V6NetmaskCacheValue = [IPv6Address, Prefixlen];
export type Netmask = {
  netmask: IPv4Address;
  prefixlen: number;
};

export type UnparsedIPv4Address =
  | string
  | Exclude<IPInteger, IPV6Integer>
  | ByteArray;
export type UnparsedIPv6Address =
  | string
  | Exclude<IPInteger, IPV4Integer>
  | ByteArray;
export type UnparsedAddress = UnparsedIPv4Address | UnparsedIPv6Address;

export type UnparsedIPv4Network =
  | UnparsedIPv4Address
  | [UnparsedIPv4Address, number]; // [addr, mask]
export type UnparsedNetwork = UnparsedIPv4Network;
