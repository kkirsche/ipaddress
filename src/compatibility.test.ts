/**
 * Replays the behavior of CPython's ipaddress module, recorded by
 * scripts/generate_fixtures.py, against this library. Every result, including
 * the type and message of every error, must be identical.
 */
import * as ipaddress from "./index";
import {
  AddressValueError,
  IPv4Address,
  IPv4Interface,
  IPv4Network,
  IPv6Address,
  IPv6Interface,
  IPv6Network,
  NetmaskValueError,
  NotImplemented,
  ValueError,
} from "./index";
import { _IPAddressBase } from "./base";
import rawFixtures from "./__fixtures__/python-ipaddress.json";

type Encoded =
  | string
  | boolean
  | null
  | Encoded[]
  | { int: string }
  | { bytes: string }
  | { tuple: Encoded[] }
  | { obj: Spec };
type Spec = { cls: keyof typeof CLASSES; args: Encoded[] };
type Captured = { value: unknown } | { error: [string, string] };
type Call = { args: Encoded[]; kwargs: Record<string, number> };

interface Fixtures {
  python_version: string;
  api: { module: string[]; classes: Record<keyof typeof CLASSES, string[]> };
  constructors: (Spec & {
    error?: [string, string];
    props?: Record<string, Captured>;
  })[];
  formats: { obj: Spec; fmt: string; result: Captured }[];
  arithmetic: { obj: Spec; op: "+" | "-"; n: Encoded; result: Captured }[];
  comparisons: { a: Spec; b: Spec | Encoded; op: string; result: Captured }[];
  network_ops: ({ a: Spec; b: Spec } & Record<string, Captured>)[];
  method_calls: ({ obj: Spec; method: string; result: Captured } & Call)[];
  functions: { fn: string; args: Encoded[]; result: Captured }[];
}

const fixtures = rawFixtures as unknown as Fixtures;

const CLASSES = {
  IPv4Address,
  IPv4Interface,
  IPv4Network,
  IPv6Address,
  IPv6Interface,
  IPv6Network,
};

function decode(value: Encoded): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(decode);
  }
  if ("int" in value) {
    const n = BigInt(value.int);
    // Exercise both of the integer types accepted by the API.
    return n >= BigInt(Number.MIN_SAFE_INTEGER) &&
      n <= BigInt(Number.MAX_SAFE_INTEGER)
      ? Number(n)
      : n;
  }
  if ("bytes" in value) {
    return Uint8Array.from(value.bytes.match(/../g) ?? [], (byte) =>
      parseInt(byte, 16)
    );
  }
  if ("tuple" in value) {
    return value.tuple.map(decode);
  }
  return construct(value.obj);
}

function construct(spec: Spec): _IPAddressBase {
  const Cls = CLASSES[spec.cls] as unknown as new (
    ...args: unknown[]
  ) => _IPAddressBase;
  return new Cls(...spec.args.map(decode));
}

function serialize(value: unknown): unknown {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return value;
  }
  if (value === NotImplemented) {
    return { NotImplemented: true };
  }
  if (typeof value === "number" || typeof value === "bigint") {
    return { int: BigInt(value).toString() };
  }
  if (value instanceof Uint8Array) {
    return { bytes: Buffer.from(value).toString("hex") };
  }
  if (value instanceof _IPAddressBase) {
    return { repr: value.toRepr() };
  }
  if (Array.isArray(value)) {
    return value.map(serialize);
  }
  throw new Error(`cannot serialize ${String(value)}`);
}

// Python exceptions without a direct JavaScript equivalent.
const PYTHON_ERROR_EQUIVALENTS: Record<string, string> = {
  AttributeError: "TypeError",
  AssertionError: "Error",
};

function errorName(err: unknown): string {
  if (err instanceof AddressValueError) return "AddressValueError";
  if (err instanceof NetmaskValueError) return "NetmaskValueError";
  if (err instanceof ValueError) return "ValueError";
  if (err instanceof TypeError) return "TypeError";
  if (err instanceof RangeError) return "IndexError";
  return "Error";
}

function capture(fn: () => unknown): Captured {
  try {
    return { value: serialize(fn()) };
  } catch (err: unknown) {
    return { error: [errorName(err), (err as Error).message] };
  }
}

function expected(result: Captured): Captured {
  if ("error" in result) {
    const [name, message] = result.error;
    return { error: [PYTHON_ERROR_EQUIVALENTS[name] ?? name, message] };
  }
  return result;
}

function take<T>(iterable: Iterable<T>, limit: number): T[] {
  const items: T[] = [];
  if (limit <= 0) return items;
  for (const item of iterable) {
    items.push(item);
    if (items.length >= limit) break;
  }
  return items;
}

/** snake_case Python name to the camelCase name used by this library. */
function camel(name: string): string {
  return name.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

const DUNDERS: Record<string, string | symbol> = {
  __eq__: "equals",
  __lt__: "lessThan",
  __le__: "lessThanOrEqual",
  __gt__: "greaterThan",
  __ge__: "greaterThanOrEqual",
  __add__: "add",
  __sub__: "sub",
  __int__: "toNumber",
  __str__: "toString",
  __repr__: "toRepr",
  __format__: "format",
  __contains__: "contains",
  __iter__: Symbol.iterator,
  __getitem__: "getItem",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyIP = any;

function getProp(obj: AnyIP, name: string): unknown {
  switch (name) {
    case "str":
      return obj.toString();
    case "repr":
      return obj.toRepr();
    case "int":
      return obj.toNumber();
    case "hosts":
      return take(obj.hosts(), 8);
    case "iter":
      return take(obj, 8);
    case "supernet":
      return obj.supernet();
    case "subnets":
      return take(obj.subnets(), 8);
    default:
      return obj[camel(name)];
  }
}

const COMPARE: Record<string, (a: AnyIP, b: unknown) => boolean> = {
  "==": (a, b) => a.equals(b),
  "!=": (a, b) => !a.equals(b),
  "<": (a, b) => a.lessThan(b),
  "<=": (a, b) => a.lessThanOrEqual(b),
  ">": (a, b) => a.greaterThan(b),
  ">=": (a, b) => a.greaterThanOrEqual(b),
};

const NETWORK_OPS: Record<string, (a: AnyIP, b: AnyIP) => unknown> = {
  contains: (a, b) => a.contains(b),
  overlaps: (a, b) => a.overlaps(b),
  subnet_of: (a, b) => a.subnetOf(b),
  supernet_of: (a, b) => a.supernetOf(b),
  compare_networks: (a, b) => a.compareNetworks(b),
  address_exclude: (a, b) => take(a.addressExclude(b), 200),
};

const FUNCTIONS: Record<string, (...args: AnyIP[]) => unknown> = {
  ip_address: (address) => ipaddress.ipAddress(address),
  ip_interface: (address) => ipaddress.ipInterface(address),
  ip_network: (address, strict) => ipaddress.ipNetwork(address, strict),
  v4_int_to_packed: (address) => ipaddress.v4IntToPacked(address),
  v6_int_to_packed: (address) => ipaddress.v6IntToPacked(address),
  summarize_address_range: (first, last) =>
    take(ipaddress.summarizeAddressRange(first, last), 300),
  collapse_addresses: (addresses) => [
    ...ipaddress.collapseAddresses(addresses),
  ],
  get_mixed_type_key: (obj) => ipaddress.getMixedTypeKey(obj),
};

function describeSpec(spec: Spec): string {
  return `${spec.cls}(${spec.args.map((a) => JSON.stringify(a)).join(", ")})`;
}

describe(`compatibility with Python ${fixtures.python_version} ipaddress`, () => {
  describe("public API", () => {
    it.each(fixtures.api.module)("exports an equivalent of %s", (name) => {
      expect(ipaddress).toHaveProperty(camel(name));
    });

    const members = Object.entries(fixtures.api.classes).flatMap(
      ([cls, attrs]) =>
        attrs.map((attr) => [cls, attr] as [keyof typeof CLASSES, string])
    );
    it.each(members)("%s has an equivalent of %s", (cls, attr) => {
      const sample = construct({
        cls,
        args: [
          cls.endsWith("Address")
            ? cls === "IPv4Address"
              ? "1.2.3.4"
              : "::1"
            : cls.startsWith("IPv4")
            ? "1.2.3.0/24"
            : "::/64",
        ],
      }) as AnyIP;
      const jsName = DUNDERS[attr] ?? camel(attr);
      expect(jsName in sample).toBe(true);
    });
  });

  describe("constructors and properties", () => {
    it.each(fixtures.constructors.map((c) => [describeSpec(c), c] as const))(
      "%s",
      (_, c) => {
        if (c.error !== undefined) {
          expect(capture(() => construct(c))).toEqual(
            expected({ error: c.error })
          );
          return;
        }
        const obj = construct(c);
        const props = c.props as Record<string, Captured>;
        const actual = Object.fromEntries(
          Object.keys(props).map((name) => [
            name,
            capture(() => getProp(obj, name)),
          ])
        );
        const wanted = Object.fromEntries(
          Object.entries(props).map(([name, result]) => [
            name,
            expected(result),
          ])
        );
        expect(actual).toEqual(wanted);
      }
    );
  });

  describe("format", () => {
    it.each(
      fixtures.formats.map((f) => [describeSpec(f.obj), f.fmt, f] as const)
    )("format(%s, %j)", (_, fmt, f) => {
      const obj = construct(f.obj) as AnyIP;
      expect(capture(() => obj.format(fmt))).toEqual(expected(f.result));
    });
  });

  describe("arithmetic", () => {
    it.each(
      fixtures.arithmetic.map(
        (a) => [describeSpec(a.obj), a.op, JSON.stringify(a.n), a] as const
      )
    )("%s %s %s", (_, op, __, a) => {
      const obj = construct(a.obj) as AnyIP;
      const n = decode(a.n);
      const result = capture(() => (op === "+" ? obj.add(n) : obj.sub(n)));
      expect(result).toEqual(expected(a.result));
    });
  });

  describe("comparisons", () => {
    it.each(
      fixtures.comparisons.map((c) => {
        const b =
          typeof c.b === "object" && c.b !== null && "cls" in c.b
            ? describeSpec(c.b as Spec)
            : JSON.stringify(c.b);
        return [describeSpec(c.a), c.op, b, c] as const;
      })
    )("%s %s %s", (_, op, __, c) => {
      const a = construct(c.a);
      const b =
        typeof c.b === "object" && c.b !== null && "cls" in c.b
          ? construct(c.b as Spec)
          : decode(c.b as Encoded);
      expect(capture(() => COMPARE[op](a, b))).toEqual(expected(c.result));
    });
  });

  describe("network operations", () => {
    it.each(
      fixtures.network_ops.flatMap((entry) =>
        Object.keys(NETWORK_OPS).map(
          (op) =>
            [describeSpec(entry.a), op, describeSpec(entry.b), entry] as const
        )
      )
    )("%s.%s(%s)", (_, op, __, entry) => {
      const a = construct(entry.a);
      const b = construct(entry.b);
      expect(capture(() => NETWORK_OPS[op](a, b))).toEqual(expected(entry[op]));
    });
  });

  describe("network methods", () => {
    it.each(
      fixtures.method_calls.map(
        (m) =>
          [
            describeSpec(m.obj),
            m.method,
            JSON.stringify(m.args),
            JSON.stringify(m.kwargs),
            m,
          ] as const
      )
    )("%s.%s(*%s, **%s)", (_, method, __, ___, m) => {
      const obj = construct(m.obj) as AnyIP;
      const args = m.args.map(decode) as number[];
      const want = expected(m.result);
      if (method === "getitem") {
        expect(capture(() => obj.getItem(args[0]))).toEqual(want);
        return;
      }
      const limit =
        method === "subnets" ? (x: AnyIP) => take(x, 16) : (x: AnyIP) => x;
      const newPrefix = m.kwargs.new_prefix;
      // Positional arguments, as in the Python signature.
      const positional =
        newPrefix === undefined ? args : [args[0] ?? 1, newPrefix];
      expect(capture(() => limit(obj[method](...positional)))).toEqual(want);
      // Keyword arguments, passed as an options object.
      const options = { prefixlenDiff: args[0], newPrefix };
      expect(capture(() => limit(obj[method](options)))).toEqual(want);
    });
  });

  describe("module functions", () => {
    it.each(
      fixtures.functions.map((f) => [f.fn, JSON.stringify(f.args), f] as const)
    )("%s(%s)", (fn, _, f) => {
      const args = f.args.map(decode);
      expect(capture(() => FUNCTIONS[fn](...args))).toEqual(expected(f.result));
    });
  });
});
