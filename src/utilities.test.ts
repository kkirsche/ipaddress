import {
  bytesRepr,
  formatString,
  intFromBytes,
  intToBytes,
  pyRepr,
  pySplit,
  v4IntToPacked,
  v6IntToPacked,
} from "./utilities";
import { ValueError } from "./errors";

const IPV6_BYTES = Uint8Array.from([
  0x20, 0x01, 0xdb, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00,
]); // 2001:db00::
const IPV6_INT = 42544930009679042476373200873331884032n;

describe("integer methods", () => {
  describe("intToBytes", () => {
    it.each([
      [3232235521, 4, [0xc0, 0xa8, 0x00, 0x01]], // IPv4 - 192.168.0.1
      [3232235521n, 4, [0xc0, 0xa8, 0x00, 0x01]],
      [IPV6_INT, 16, [...IPV6_BYTES]],
      [0, 4, [0, 0, 0, 0]],
    ])("converts %d to a %d byte array", (n, length, expected) => {
      expect(intToBytes(n, length, "big")).toStrictEqual(
        Uint8Array.from(expected)
      );
    });
    it("supports little-endian byte order", () => {
      expect(intToBytes(0x0102, 2, "little")).toStrictEqual(
        Uint8Array.from([2, 1])
      );
    });
    it("throws a RangeError when the integer does not fit", () => {
      expect(() => intToBytes(256, 1)).toThrow(RangeError);
      expect(() => intToBytes(-1, 4)).toThrow(RangeError);
    });
  });

  describe("intFromBytes", () => {
    it.each([
      [Uint8Array.from([0xc0, 0xa8, 0x00, 0x01]), 3232235521n],
      [IPV6_BYTES, IPV6_INT],
      [new Uint8Array(), 0n],
    ])("converts %p to an integer", (bytes, expected) => {
      expect(intFromBytes(bytes, "big")).toStrictEqual(expected);
    });
    it("does not modify its input", () => {
      const bytes = Uint8Array.from([1, 2]);
      expect(intFromBytes(bytes, "little")).toBe(0x0201n);
      expect(bytes).toStrictEqual(Uint8Array.from([1, 2]));
    });
  });

  it.each([
    [3232235521n, 4],
    [IPV6_INT, 16],
  ])("converts the integer %d to a byte array and back safely", (n, length) => {
    expect(intFromBytes(intToBytes(n, length, "big"), "big")).toBe(n);
  });
});

describe("pack methods", () => {
  describe("v4IntToPacked", () => {
    it.each([
      [0, [0x00, 0x00, 0x00, 0x00]], // 0.0.0.0
      [3232235521, [0xc0, 0xa8, 0x00, 0x01]], // 192.168.0.1
      [4294967295n, [0xff, 0xff, 0xff, 0xff]], // 255.255.255.255
    ])("packs the v4 address %d to a byte array", (address, expected) => {
      expect(v4IntToPacked(address)).toStrictEqual(Uint8Array.from(expected));
    });
    it.each([[2 ** 32], [-1]])("throws a ValueError for %d", (address) => {
      expect(() => v4IntToPacked(address)).toThrow(
        new ValueError("Address negative or too large for IPv4")
      );
    });
    it("throws a TypeError for non-integers", () => {
      expect(() => v4IntToPacked(1.5)).toThrow(TypeError);
    });
  });
  describe("v6IntToPacked", () => {
    it.each([
      [0, new Uint8Array(16)],
      [2n ** 128n - 1n, new Uint8Array(16).fill(0xff)],
    ])("packs the v6 address %d to a byte array", (address, expected) => {
      expect(v6IntToPacked(address)).toStrictEqual(expected);
    });
    it.each([[2n ** 128n], [-1]])("throws a ValueError for %d", (address) => {
      expect(() => v6IntToPacked(address)).toThrow(
        new ValueError("Address negative or too large for IPv6")
      );
    });
  });
});

describe("python helpers", () => {
  it.each([
    ["abc", "'abc'"],
    ["it's", `"it's"`],
    [`it's "x"`, `'it\\'s "x"'`],
    ["a\\b", "'a\\\\b'"],
    ["\n\t\r\x00\x7f", "'\\n\\t\\r\\x00\\x7f'"],
    ["é١", "'é١'"],
    ["\u2028", "'\\u2028'"],
  ])("pyRepr(%j) is %s", (value, expected) => {
    expect(pyRepr(value)).toBe(expected);
  });

  it("bytesRepr matches Python's repr of bytes", () => {
    expect(bytesRepr(Uint8Array.from([0x27, 0x41, 0xff, 0x0a]))).toBe(
      `b"'A\\xff\\n"`
    );
  });

  it.each([
    ["a:b:c", 1, ["a", "b:c"]],
    ["a:b:c", 5, ["a", "b", "c"]],
    ["", 2, [""]],
  ])("pySplit(%j, ':', %d)", (value, maxsplit, expected) => {
    expect(pySplit(value, ":", maxsplit)).toStrictEqual(expected);
  });

  it.each([
    ["", "ab"],
    ["5", "ab   "],
    [">5", "   ab"],
    ["^6", "  ab  "],
    ["*^5s", "*ab**"],
    ["05", "ab000"],
    [".1", "a"],
  ])("formatString('ab', %j)", (spec, expected) => {
    expect(formatString("ab", spec)).toBe(expected);
  });
});
