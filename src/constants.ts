import { IPV4Address } from "./IPV4Address";

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
export type NetmaskCacheValue = [IPV4Address, Prefixlen];
export type Netmask = {
  netmask: IPV4Address;
  prefixlen: number;
};

export type UnparsedIPV4Address =
  | string
  | Exclude<IPInteger, IPV6Integer>
  | ByteArray;
export type UnparsedIPV6Address =
  | string
  | Exclude<IPInteger, IPV4Integer>
  | ByteArray;
export type UnparsedAddress = UnparsedIPV4Address | UnparsedIPV6Address;
