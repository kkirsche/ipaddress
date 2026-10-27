export const IPV4LENGTH = 32;
export const IPV6LENGTH = 128;

// Equivalent to 255.255.255.255 or 32 bits of 1's.
export const IPV4_ALL_ONES = (1n << BigInt(IPV4LENGTH)) - 1n;
// if we don't use BigInt, this will overflow
export const IPV6_ALL_ONES = (1n << BigInt(IPV6LENGTH)) - 1n;
