/**
 * Replays the behavior of CPython's ipaddress module against this library.
 * Every result, including the type and message of every error, must be
 * identical. Two sets of fixtures are replayed:
 * - scripts/generate_fixtures.py: operations on a broad set of inputs
 * - scripts/record_cpython_tests.py: every operation performed by CPython's
 *   own test suite, Lib/test/test_ipaddress.py
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
import rawCPythonTests from "./__fixtures__/cpython-test-suite.json";

type Encoded =
  | string
  | boolean
  | null
  | Encoded[]
  | { int: string }
  | { float: string }
  | { foreign: string }
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

interface CPythonTestRecord {
  kind: "ctor" | "func" | "prop" | "method" | "op";
  test: string;
  cls?: keyof typeof CLASSES;
  name?: string;
  op?: string;
  recv?: Spec;
  args?: Encoded[];
  kwargs?: { strict?: boolean; prefixlen_diff?: number; new_prefix?: number };
  result: Captured;
}

const fixtures = rawFixtures as unknown as Fixtures;
const cpythonTests = rawCPythonTests as unknown as {
  python_version: string;
  tests_run: number;
  records: CPythonTestRecord[];
};

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
  if ("float" in value) {
    return Number(value.float);
  }
  if ("foreign" in value) {
    // A plain Python object() with no IP semantics.
    return {};
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
  collapse_addresses: (addresses) =>
    take(ipaddress.collapseAddresses(addresses), 300),
  get_mixed_type_key: (obj) => ipaddress.getMixedTypeKey(obj),
};

// The number of items CPython's test suite recorder takes from iterators.
const RECORDED_ITEMS = 300;
const GENERATOR_METHODS = new Set(["hosts", "subnets", "address_exclude"]);

/** Perform one operation recorded from CPython's test suite. */
function replay(r: CPythonTestRecord): unknown {
  const args = (r.args ?? []).map(decode) as AnyIP[];
  const kwargs = r.kwargs ?? {};
  switch (r.kind) {
    case "ctor": {
      const Cls = CLASSES[r.cls as keyof typeof CLASSES] as AnyIP;
      return "strict" in kwargs
        ? new Cls(...args, kwargs.strict)
        : new Cls(...args);
    }
    case "func": {
      if (r.name === "ip_network" && "strict" in kwargs) {
        return ipaddress.ipNetwork(args[0], kwargs.strict);
      }
      return FUNCTIONS[r.name as string](...args);
    }
    case "prop":
      return (construct(r.recv as Spec) as AnyIP)[camel(r.name as string)];
    case "method": {
      const recv = construct(r.recv as Spec) as AnyIP;
      const name = r.name as string;
      const result =
        Object.keys(kwargs).length > 0
          ? recv[camel(name)]({
              prefixlenDiff: kwargs.prefixlen_diff ?? args[0],
              newPrefix: kwargs.new_prefix,
            })
          : recv[camel(name)](...args);
      return GENERATOR_METHODS.has(name)
        ? take(result, RECORDED_ITEMS)
        : result;
    }
    case "op": {
      const recv = construct(r.recv as Spec) as AnyIP;
      const [other] = args;
      switch (r.op) {
        case "in":
          return recv.contains(other);
        case "getitem":
          return recv.getItem(other);
        case "iter":
          return take(recv, RECORDED_ITEMS);
        case "+":
          return recv.add(other);
        case "-":
          return recv.sub(other);
        case "int":
          return recv.toNumber();
        case "str":
          return recv.toString();
        case "repr":
          return recv.toRepr();
        case "format":
          return recv.format(other);
        default:
          return COMPARE[r.op as string](recv, other);
      }
    }
  }
}

function describeRecord(r: CPythonTestRecord): string {
  const what = r.kind === "op" ? `${r.op}` : r.kind === "ctor" ? r.cls : r.name;
  const on = r.recv ? `${describeSpec(r.recv)} ` : "";
  return `${r.test}: ${on}${what}(${JSON.stringify(r.args ?? [])})`;
}

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

  describe(`CPython ${cpythonTests.python_version} test suite (Lib/test/test_ipaddress.py)`, () => {
    it("recorded the whole suite", () => {
      expect(cpythonTests.tests_run).toBeGreaterThan(200);
      expect(cpythonTests.records.length).toBeGreaterThan(5000);
    });

    it.each(cpythonTests.records.map((r) => [describeRecord(r), r] as const))(
      "%s",
      (_, r) => {
        expect(capture(() => replay(r))).toEqual(expected(r.result));
      }
    );
  });
});
