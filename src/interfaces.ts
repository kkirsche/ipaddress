import type { _IPAddressBase } from "./base";

export type ByteOrder = "big" | "little";

/** A prefix length, e.g. 24 in 192.0.2.0/24. */
export type Prefixlen = number;

/**
 * Anything that can be parsed as a single IP address:
 * - a string, e.g. "192.0.2.1" or "2001:db8::1%eth0"
 * - an integer (number or bigint)
 * - packed bytes in network (big-endian) order (equivalent of Python bytes)
 * - another IP object, which is converted with its string representation
 */
export type AddressInput =
  | string
  | number
  | bigint
  | Uint8Array
  | _IPAddressBase;

/** A netmask, as a prefix length or a string ("24" or "255.255.255.0"). */
export type NetmaskInput = string | number | bigint;

/**
 * Anything that can be parsed as an IP network or interface. In addition to
 * the address inputs (strings may include a "/mask"), a tuple of
 * `[address]` or `[address, mask]` is accepted, the equivalent of Python's
 * `(address, mask)` tuple form.
 */
export type NetworkInput =
  | AddressInput
  | [AddressInput]
  | [AddressInput, NetmaskInput];

/** Keyword arguments accepted by `subnets` and `supernet`. */
export interface PrefixOptions {
  prefixlenDiff?: number;
  newPrefix?: number | null;
}
