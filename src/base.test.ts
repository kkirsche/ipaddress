import { AddressTypeError } from "./errors";
import { IPv4Address } from "./base";

describe("IPv4Address", () => {
  it.each([
    ["number", 3232235521],
    ["big-endian bytes", [192, 168, 0, 1]],
    ["dotted-decimal string", "192.168.0.1"],
  ])("constructs from a %s", (_, addr) => {
    const ip = new IPv4Address(addr);
    expect(ip.toNumber()).toStrictEqual(3232235521);
    expect(ip.toString()).toStrictEqual("192.168.0.1");
    expect(ip.toRepresentation()).toStrictEqual("'192.168.0.1'");
    expect(ip.packed()).toStrictEqual([192, 168, 0, 1]);
    expect(ip.reversePointer()).toStrictEqual("1.0.168.192.in-addr.arpa");
    expect(ip.compressed()).toStrictEqual("192.168.0.1");
    expect(ip.exploded()).toStrictEqual("192.168.0.1");
  });
  it("throws if a non-byte type array is received", () => {
    expect(() => {
      // @ts-expect-error We are intentionally triggering a type error.
      new IPv4Address(["192", "168", "0", "1"]);
    }).toThrowError(TypeError);
  });
  it("throw if the incorrect number of bytes is received", () => {
    expect(() => {
      // addresses should only be of length four
      new IPv4Address([192, 168, 0, 1, 1]);
    }).toThrowError(AddressTypeError);
  });
  it("throws if the address is below 0", () => {
    expect(() => {
      new IPv4Address(-1);
    }).toThrowError(AddressTypeError);
  });
  it("throw if an address is greater than 4294967295 (maximum integer IPv4 address", () => {
    expect(() => {
      // maximum IPv4 address is (2**32)-1 == 4294967295
      new IPv4Address(5000000000);
    }).toThrowError(AddressTypeError);
  });
  it("throws if the address is empty", () => {
    expect(() => {
      new IPv4Address("");
    }).toThrowError(AddressTypeError);
  });
  it.each([["192"], ["192.168"], ["192.168.0"], ["192.168.0.1.1"]])(
    "throws if the address '%s' doesn't have 4 octets",
    (addr) => {
      expect(() => {
        new IPv4Address(addr);
      }).toThrowError(AddressTypeError);
    }
  );
  it.each([[".168.0.1", "192..0.1", "192.168..1", "192.168.0.."]])(
    "throws if the address '%s' has an empty octet",
    (addr) => {
      expect(() => {
        new IPv4Address(addr);
      }).toThrowError(AddressTypeError);
    }
  );
  it.each([
    ["1923.168.0.1"],
    ["192.1688.0.1"],
    ["192.168.1111.1"],
    ["192.168.1.1111"],
  ])(
    "throws if the address '%s' contains an octet with more than three characters",
    (addr) => {
      expect(() => {
        new IPv4Address(addr);
      }).toThrowError(AddressTypeError);
    }
  );
  it.each([
    ["010.168.0.1"],
    ["192.068.0.1"],
    ["192.168.00.1"],
    ["192.168.0.01"],
  ])(
    "throws if the address '%s' contains leading zeroes (to prevent a security bug)",
    (addr) => {
      expect(() => {
        new IPv4Address(addr);
      }).toThrowError(AddressTypeError);
    }
  );
  it.each([
    ["256.168.0.1"],
    ["192.256.0.1"],
    ["192.168.256.1"],
    ["192.168.0.256"],
  ])("throws if the address '%s' contains an octet larger than 255", (addr) => {
    expect(() => {
      new IPv4Address(addr);
    }).toThrowError(AddressTypeError);
  });
});
