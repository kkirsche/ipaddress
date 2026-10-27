/**
 * Tests for the JavaScript specific parts of the API, which the Python
 * compatibility fixtures cannot exercise directly.
 */
import {
  AddressValueError,
  IPV4LENGTH,
  IPV6LENGTH,
  IPv4Address,
  IPv4Interface,
  IPv4Network,
  IPv6Address,
  IPv6Network,
  NetmaskValueError,
  NotImplemented,
  ValueError,
  collapseAddresses,
  getMixedTypeKey,
  ipAddress,
  ipInterface,
  ipNetwork,
  summarizeAddressRange,
} from "./index";

describe("integer inputs", () => {
  it("accepts numbers and bigints interchangeably", () => {
    expect(
      new IPv4Address(3221225985).equals(new IPv4Address(3221225985n))
    ).toBe(true);
    expect(new IPv6Address(1).equals(new IPv6Address(1n))).toBe(true);
    expect(new IPv4Network([3221225984n, 24]).toString()).toBe("192.0.2.0/24");
    expect(new IPv4Network([3221225984, 24n]).toString()).toBe("192.0.2.0/24");
  });

  it("returns a number for IPv4 and a bigint for IPv6", () => {
    expect(new IPv4Address("192.0.2.1").toNumber()).toBe(3221225985);
    expect(new IPv6Address("::1").toNumber()).toBe(1n);
    expect(new IPv4Network("10.0.0.0/8").numAddresses).toBe(2 ** 24);
    expect(new IPv6Network("::/64").numAddresses).toBe(2n ** 64n);
  });

  it("treats non-integer numbers like Python treats floats", () => {
    expect(() => new IPv4Address(1.5)).toThrow(
      new AddressValueError("Expected 4 octets in '1.5'")
    );
    expect(() => new IPv4Address("1.2.3.4").add(1.5)).toThrow(
      new TypeError(
        "unsupported operand type(s) for +: 'IPv4Address' and 'float'"
      )
    );
  });
});

describe("packed addresses", () => {
  it("uses Uint8Array as the equivalent of Python bytes", () => {
    const address = new IPv4Address(Uint8Array.from([192, 0, 2, 1]));
    expect(address.toString()).toBe("192.0.2.1");
    expect(address.packed).toStrictEqual(Uint8Array.from([192, 0, 2, 1]));
    expect(ipAddress(new IPv6Address("::1").packed).toString()).toBe("::1");
  });

  it("accepts Node.js Buffers", () => {
    expect(new IPv4Address(Buffer.from([10, 0, 0, 1])).toString()).toBe(
      "10.0.0.1"
    );
  });
});

describe("networks", () => {
  it("are iterable", () => {
    const network = new IPv4Network("192.0.2.0/30");
    expect([...network].map(String)).toStrictEqual([
      "192.0.2.0",
      "192.0.2.1",
      "192.0.2.2",
      "192.0.2.3",
    ]);
    expect([...network.hosts()].map(String)).toStrictEqual([
      "192.0.2.1",
      "192.0.2.2",
    ]);
  });

  it("iterate lazily over huge networks", () => {
    const hosts = new IPv6Network("::/0").hosts();
    expect(hosts.next().value?.toString()).toBe("::1");
  });

  it("accept keyword arguments for subnets and supernet as an options object", () => {
    const network = ipNetwork("192.0.2.0/24");
    expect([...network.subnets({ newPrefix: 26 })].map(String)).toStrictEqual(
      [...network.subnets(1, 26)].map(String)
    );
    expect(network.supernet({ newPrefix: 16 }).toString()).toBe("192.0.0.0/16");
    expect(network.supernet({ prefixlenDiff: 8 }).toString()).toBe(
      "192.0.0.0/16"
    );
  });

  it("accept strict as the second argument", () => {
    expect(() => ipNetwork("192.0.2.1/24")).toThrow(
      new ValueError("192.0.2.1/24 has host bits set")
    );
    expect(ipNetwork("192.0.2.1/24", false).toString()).toBe("192.0.2.0/24");
  });

  it("raise errors from generators when they are iterated, like Python", () => {
    const network = ipNetwork("10.0.0.0/8");
    const subnets = network.subnets(-1);
    expect(() => subnets.next()).toThrow(
      new ValueError("prefix length diff must be > 0")
    );
    const exclude = network.addressExclude(ipNetwork("11.0.0.0/8"));
    expect(() => exclude.next()).toThrow(ValueError);
  });

  it("throws RangeError, the equivalent of IndexError, for out of range indexes", () => {
    expect(() => ipNetwork("10.0.0.0/30").getItem(4)).toThrow(
      new RangeError("address out of range")
    );
    expect(ipNetwork("10.0.0.0/30").getItem(-1).toString()).toBe("10.0.0.3");
  });
});

describe("errors", () => {
  it("mirror Python's exception hierarchy", () => {
    expect(new AddressValueError()).toBeInstanceOf(ValueError);
    expect(new NetmaskValueError()).toBeInstanceOf(ValueError);
    expect(new ValueError()).toBeInstanceOf(Error);
    expect(new AddressValueError("x").name).toBe("AddressValueError");
  });

  it("are raised by the module functions", () => {
    expect(() => ipAddress("nope")).toThrow(
      new ValueError("'nope' does not appear to be an IPv4 or IPv6 address")
    );
    expect(() => ipInterface("1.2.3.4/33")).toThrow(ValueError);
    expect(() => new IPv4Network("1.2.3.0/33")).toThrow(
      new NetmaskValueError("'33' is not a valid netmask")
    );
  });
});

describe("module functions", () => {
  it("summarizeAddressRange returns an iterator of networks", () => {
    const networks = summarizeAddressRange(
      new IPv4Address("192.0.2.0"),
      new IPv4Address("192.0.2.130")
    );
    expect([...networks].map((n) => n.toRepr())).toStrictEqual([
      "IPv4Network('192.0.2.0/25')",
      "IPv4Network('192.0.2.128/31')",
      "IPv4Network('192.0.2.130/32')",
    ]);
  });

  it("collapseAddresses accepts any iterable", () => {
    function* networks() {
      yield new IPv4Network("192.0.2.0/25");
      yield new IPv4Network("192.0.2.128/25");
    }
    expect([...collapseAddresses(networks())].map(String)).toStrictEqual([
      "192.0.2.0/24",
    ]);
  });

  it("getMixedTypeKey returns NotImplemented for unsupported objects", () => {
    expect(getMixedTypeKey("1.2.3.4")).toBe(NotImplemented);
    const address = new IPv4Address("1.2.3.4");
    expect(getMixedTypeKey(address)).toStrictEqual([4, address]);
  });

  it("exports the address lengths", () => {
    expect(IPV4LENGTH).toBe(32);
    expect(IPV6LENGTH).toBe(128);
  });
});

describe("typing", () => {
  it("supports calling methods on the union types returned by the factories", () => {
    const network = ipNetwork("10.0.0.0/8");
    const other = ipNetwork("10.1.0.0/16");
    expect([...network.addressExclude(other)]).toHaveLength(8);
    expect(other.subnetOf(network)).toBe(true);
    expect(network.overlaps(other)).toBe(true);
    expect(network.compareNetworks(other)).toBe(-1);
    expect(network.contains(ipAddress("10.0.0.1"))).toBe(true);
    expect([
      ...summarizeAddressRange(ipAddress("10.0.0.0"), ipAddress("10.0.0.3")),
    ]).toHaveLength(1);
    expect([...collapseAddresses([network, other])]).toHaveLength(1);
  });
});

describe("interfaces", () => {
  it("can be sorted together with addresses", () => {
    const items = [
      new IPv4Interface("1.1.1.1/24"),
      new IPv4Address("1.1.1.1"),
      new IPv4Interface("1.1.1.0/24"),
    ];
    items.sort((a, b) => (a.lessThan(b) ? -1 : b.lessThan(a) ? 1 : 0));
    expect(items.map((i) => i.toRepr())).toStrictEqual([
      "IPv4Address('1.1.1.1')",
      "IPv4Interface('1.1.1.0/24')",
      "IPv4Interface('1.1.1.1/24')",
    ]);
  });

  it("work in template literals", () => {
    expect(`${new IPv4Interface("10.1.2.3/8")}`).toBe("10.1.2.3/8");
  });
});
