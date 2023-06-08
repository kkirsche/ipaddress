export const IPv4LENGTH = 32;
export const IPv4ALLONES = 2 ** IPv4LENGTH - 1;
export const IPv6LENGTH = 128;
// if we don't use BigInt, this will overflow
export const IPv6ALLONES = BigInt(2) ** BigInt(IPv6LENGTH) - BigInt(1);
