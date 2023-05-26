import {
  intFromBytes,
  intToBytes,
  v4IntToPacked,
  v6IntToPacked,
} from "./utilities";

describe("integer methods", () => {
  describe("intToBytes", () => {
    it.each([
      [3232235521, 4, [0xc0, 0xa8, 0x00, 0x01]], // IPv4 - 192.168.0.1
      [
        42544930009679042476373200873331884032,
        16,
        [
          0x20, // first octet
          0x01, // second
          0xdb, // third
          0x00, // fourth
          0x00, // fifth
          0x00, // sixth
          0x00, // seventh
          0x00, // eighth
          0x00, // ninth
          0x00, // tenth
          0x00, // eleventh
          0x00, // twelfth
          0x00, // thirteenth
          0x00, // fourteenth
          0x00, // fifteenth
          0x00, // sixteenth (IPv6 is 16 bytes / octets)
        ],
      ], // IPv6 - 2001:db00::0
    ])("converts %d to byte array", (n, length, expected) => {
      const result = intToBytes(n, length, "big");
      expect(result).toStrictEqual(expected);
    });
  });
  describe("intFromBytes", () => {
    it.each([
      [[0xc0, 0xa8, 0x00, 0x01], 3232235521], // IPv4 - 192.168.0.1
      [
        [
          0x20, // first octet
          0x01, // second
          0xdb, // third
          0x00, // fourth
          0x00, // fifth
          0x00, // sixth
          0x00, // seventh
          0x00, // eighth
          0x00, // ninth
          0x00, // tenth
          0x00, // eleventh
          0x00, // twelfth
          0x00, // thirteenth
          0x00, // fourteenth
          0x00, // fifteenth
          0x00, // sixteenth (IPv6 is 16 bytes / octets)
        ],
        42544930009679042476373200873331884032,
      ], // IPv6 - 2001:db00::0
      [
        [
          0x20, // first octet
          0x01, // second
          0xdb, // third
          0x00, // fourth
          0x00, // fifth
          0x00, // sixth
          0x00, // seventh
          0x00, // eighth
          0x00, // ninth
          0x00, // tenth
          0x00, // eleventh
          0x00, // twelfth
          0x00, // thirteenth
          0x00, // fourteenth
          0x00, // fifteenth
          0x00, // sixteenth (IPv6 is 16 bytes / octets)
        ],
        BigInt(42544930009679042476373200873331884032),
      ], // IPv6 - 2001:db00::0
    ])("converts byte array to digits", (bytes, expected) => {
      const result = intFromBytes(bytes, "big", false);
      if (typeof result === "bigint") {
        expect(result).toStrictEqual(BigInt(expected));
      } else {
        expect(result).toStrictEqual(expected);
      }
    });
  });
  it.each([
    [3232235521, 4],
    [42544930009679042476373200873331884032, 16],
    [BigInt(42544930009679042476373200873331884032), 16],
  ])("converts the integer %d to a byte array and back safely", (n, length) => {
    const bytes = intToBytes(n, length, "big");
    const numberFromArray = intFromBytes(bytes, "big");
    if (typeof numberFromArray === "bigint") {
      expect(numberFromArray).toStrictEqual(BigInt(n));
    } else {
      expect(numberFromArray).toStrictEqual(n);
    }
  });
});

describe("pack methods", () => {
  describe("v4IntToPacked", () => {
    it.each([
      [0, [0x00, 0x00, 0x00, 0x00]], // 0.0.0.0
      [3232235521, [0xc0, 0xa8, 0x00, 0x01]], // 192.168.0.1
      [4294967295, [0xff, 0xff, 0xff, 0xff]], // 255.255.255.255
    ])("packs the v4 address %d to a byte array", (address, expected) => {
      expect(v4IntToPacked(address)).toStrictEqual(expected);
    });
    it("throws a type error when above the maximum address", () => {
      const maximumIPv4Addr = 2 ** 32 - 1;
      expect(() => {
        v4IntToPacked(maximumIPv4Addr + 1);
      }).toThrowError(TypeError);
    });
    it("throws a type error when a negative value is received", () => {
      expect(() => {
        v4IntToPacked(-1);
      }).toThrowError(TypeError);
    });
  });
  describe("v6IntToPacked", () => {
    it.each([
      [
        0,
        [
          0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
          0x00, 0x00, 0x00, 0x00, 0x00,
        ],
      ], // ::
      [
        BigInt("340282366920938463463374607431768211455"),
        [
          0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
          0xff, 0xff, 0xff, 0xff, 0xff,
        ],
      ], // IPv6 - ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff
    ])("packs the v6 address %d to a byte array", (address, expected) => {
      expect(v6IntToPacked(address)).toStrictEqual(expected);
    });
    it("throws a type error when above the maximum address", () => {
      const maximumIPv6Addr = BigInt("340282366920938463463374607431768211455");
      expect(() => {
        v6IntToPacked(maximumIPv6Addr + BigInt(1));
      }).toThrowError(TypeError);
    });
    it("throws a type error when a negative value is received", () => {
      expect(() => {
        v6IntToPacked(-1);
      }).toThrowError(TypeError);
    });
  });
});
