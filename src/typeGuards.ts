import { ByteArray } from "./interfaces";

export function isUndefined(v: unknown): v is undefined {
  return v === undefined;
}

export function isNull(v: unknown): v is null {
  return v === null;
}

export function isNumber(v: unknown): v is number {
  return typeof v === "number";
}

export function isBigInt(v: unknown): v is bigint {
  return typeof v === "bigint";
}

export function isString(v: unknown): v is string {
  return typeof v === "string";
}

export function isByteArray(v: unknown): v is ByteArray {
  return (
    Array.isArray(v) &&
    v.every((potentialByte) => typeof potentialByte === "number")
  );
}
