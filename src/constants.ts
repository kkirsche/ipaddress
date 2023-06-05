export type IPVersion = 4 | 6;
export type Prefixlen = number;

export const IPv4LENGTH = 32;
export const IPv4ALLONES = 2 ** IPv4LENGTH - 1;
export const IPv6LENGTH = 128;
// if we don't use BigInt, this will overflow
export const IPv6ALLONES = BigInt(2) ** BigInt(IPv6LENGTH) - BigInt(1);

export type IPv4Integer = number;
export type IPv6Integer = bigint;
export type IPInteger = IPv4Integer | IPv6Integer;
export type ByteOrder = "big" | "little";
export type ByteArray = number[];
