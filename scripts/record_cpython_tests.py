#!/usr/bin/env python3
"""Record CPython's own test suite for ipaddress as JSON test fixtures.

Runs Lib/test/test_ipaddress.py (shipped with CPython) unmodified, with the
public API of the ipaddress module instrumented. Every top-level operation the
tests perform (constructors, functions, properties, methods and operators) is
recorded with CPython's result or exact exception. src/compatibility.test.ts
replays each one against this library.

Operations that depend on Python-only features (pickle, copy, weakref, hash,
operator.index, sentinel objects with custom comparisons, floats equal to
integers) cannot be expressed in JavaScript and are skipped; the summary on
stderr lists them.

Usage:
    python3 scripts/record_cpython_tests.py [OUTPUT]

Without OUTPUT the JSON is written to stdout. With OUTPUT it is written
atomically, so a failed run never leaves a truncated fixture behind.
"""
import collections
import functools
import ipaddress
import json
import operator
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import generate_fixtures as g  # noqa: E402

LIMIT = 300  # items recorded from iterators
CLASSES = {c.__name__: c for c in (
    ipaddress.IPv4Address, ipaddress.IPv4Interface, ipaddress.IPv4Network,
    ipaddress.IPv6Address, ipaddress.IPv6Interface, ipaddress.IPv6Network)}
FUNCTIONS = ["ip_address", "ip_network", "ip_interface", "v4_int_to_packed",
             "v6_int_to_packed", "summarize_address_range", "collapse_addresses",
             "get_mixed_type_key"]
GENERATOR_FUNCS = {"summarize_address_range", "collapse_addresses"}
GENERATOR_METHODS = {"hosts", "subnets", "address_exclude"}
OPERATORS = {"__eq__": ("==", operator.eq), "__lt__": ("<", operator.lt),
             "__le__": ("<=", operator.le), "__gt__": (">", operator.gt),
             "__ge__": (">=", operator.ge)}
OTHER_DUNDERS = {"__contains__": "in", "__getitem__": "getitem", "__iter__": "iter",
                 "__add__": "+", "__sub__": "-", "__int__": "int", "__str__": "str",
                 "__repr__": "repr", "__format__": "format"}
PUBLIC_ATTRS = set().union(*(
    {a for a in dir(c) if not a.startswith("_")} for c in CLASSES.values()))

state = {"depth": 0, "test": None}
records, seen = [], set()
skipped = collections.Counter()


class Quiet:
    """Suppress recording for nested/internal calls."""
    def __enter__(self):
        state["depth"] += 1

    def __exit__(self, *exc):
        state["depth"] -= 1


class Unencodable(Exception):
    pass


def enc(v):
    if type(v) is object or v is object:
        return {"foreign": "object"}  # a plain object with no IP semantics
    if isinstance(v, float):
        if v.is_integer() or v != v or v in (float("inf"), float("-inf")):
            raise Unencodable("integral/non-finite float (same as int in JS)")
        return {"float": repr(v)}
    if isinstance(v, list):
        return [enc(x) for x in v]
    if isinstance(v, tuple(CLASSES.values())):
        if type(v) not in CLASSES.values():
            raise Unencodable("subclass instance")
        return {"obj": receiver(v)}
    try:
        return g.enc(v)
    except TypeError:
        raise Unencodable(type(v).__name__) from None


def receiver(obj):
    """Spec to rebuild obj; only if it round-trips through str()."""
    if type(obj) not in CLASSES.values():
        raise Unencodable("subclass instance")
    rebuilt = type(obj)(str(obj))
    if repr(rebuilt) != repr(obj) or rebuilt != obj:
        raise Unencodable("receiver does not round-trip")
    return g.spec(obj)


def record(kind, fn, **fields):
    if state["depth"]:
        return
    with Quiet():
        try:
            entry = {"kind": kind, **{k: v() if callable(v) else v for k, v in fields.items()}}
        except Unencodable as exc:
            skipped[f"{kind}: {exc}"] += 1
            return
        result = g.capture(fn)
        if "error" not in result:
            try:
                json.dumps(result)
            except TypeError:
                skipped[f"{kind}: unserializable result"] += 1
                return
        entry["result"] = result
        key = json.dumps(entry, sort_keys=True)
        if key in seen:
            return
        seen.add(key)
        entry["test"] = state["test"]
        records.append(entry)


def kwargs_ok(kwargs):
    return set(kwargs) <= {"strict", "prefixlen_diff", "new_prefix"}


def wrap_init(cls, orig):
    @functools.wraps(orig)
    def __init__(self, *args, **kwargs):
        if type(self) is cls and kwargs_ok(kwargs):
            record("ctor", lambda: cls(*args, **kwargs), cls=cls.__name__,
                   args=lambda: [enc(a) for a in args], kwargs=dict(kwargs))
        with Quiet():
            return orig(self, *args, **kwargs)
    return __init__


def wrap_function(name, orig):
    @functools.wraps(orig)
    def wrapper(*args, **kwargs):
        if kwargs_ok(kwargs):
            fn = (lambda: g.take(orig(*args, **kwargs), LIMIT)) if name in GENERATOR_FUNCS \
                else (lambda: orig(*args, **kwargs))
            record("func", fn, name=name, args=lambda: [enc(a) for a in args],
                   kwargs=dict(kwargs))
        with Quiet():
            return orig(*args, **kwargs)
    return wrapper


def wrap_method(name, orig):
    @functools.wraps(orig)
    def wrapper(self, *args, **kwargs):
        if kwargs_ok(kwargs):
            fn = (lambda: g.take(orig(self, *args, **kwargs), LIMIT)) if name in GENERATOR_METHODS \
                else (lambda: orig(self, *args, **kwargs))
            record("method", fn, name=name, recv=lambda: receiver(self),
                   args=lambda: [enc(a) for a in args], kwargs=dict(kwargs))
        with Quiet():
            return orig(self, *args, **kwargs)
    return wrapper


def wrap_property(name, fget):
    def getter(self):
        record("prop", lambda: fget(self), name=name, recv=lambda: receiver(self))
        with Quiet():
            return fget(self)
    return property(getter)


def wrap_operator(dunder, orig):
    op, opfunc = OPERATORS[dunder]

    @functools.wraps(orig)
    def wrapper(self, other):
        # Record the full operator (with Python's dispatch), not the dunder.
        record("op", lambda: opfunc(self, other), op=op, recv=lambda: receiver(self),
               args=lambda: [enc(other)])
        with Quiet():
            return orig(self, other)
    return wrapper


def wrap_dunder(dunder, orig):
    op = OTHER_DUNDERS[dunder]

    @functools.wraps(orig)
    def wrapper(self, *args):
        if op == "iter":
            fn = lambda: g.take(orig(self), LIMIT)  # noqa: E731
        elif op == "int":
            fn = lambda: int(self)  # noqa: E731
        else:
            fn = lambda: orig(self, *args)  # noqa: E731
        record("op", fn, op=op, recv=lambda: receiver(self), args=lambda: [enc(a) for a in args])
        with Quiet():
            return orig(self, *args)
    return wrapper


def instrument():
    for name in FUNCTIONS:
        setattr(ipaddress, name, wrap_function(name, getattr(ipaddress, name)))
    mro = {k for c in CLASSES.values() for k in c.__mro__ if k is not object}
    for cls in mro:
        for name, attr in list(vars(cls).items()):
            if name == "__init__" and cls in CLASSES.values():
                setattr(cls, name, wrap_init(cls, attr))
            elif name in OPERATORS:
                setattr(cls, name, wrap_operator(name, attr))
            elif name in OTHER_DUNDERS:
                setattr(cls, name, wrap_dunder(name, attr))
            elif name.startswith("_") or name not in PUBLIC_ATTRS:
                continue
            elif isinstance(attr, property):
                setattr(cls, name, wrap_property(name, attr.fget))
            elif isinstance(attr, functools.cached_property):
                cached = functools.cached_property(wrap_property(name, attr.func).fget)
                cached.__set_name__(cls, name)
                setattr(cls, name, cached)
            elif callable(attr):
                setattr(cls, name, wrap_method(name, attr))


class RecordingResult(unittest.TextTestResult):
    def startTest(self, test):
        state["test"] = test.id().removeprefix("test.test_ipaddress.")
        super().startTest(test)


instrument()
import test.test_ipaddress  # noqa: E402  (imported after instrumenting)

suite = unittest.defaultTestLoader.loadTestsFromModule(test.test_ipaddress)
runner = unittest.TextTestRunner(stream=sys.stderr, resultclass=RecordingResult, verbosity=0)
result = runner.run(suite)
if not result.wasSuccessful():
    sys.exit("CPython's test suite failed with instrumentation; not writing fixtures")
print(f"CPython tests: ran {result.testsRun}, failures {len(result.failures)}, "
      f"errors {len(result.errors)} (with instrumentation)", file=sys.stderr)
print(f"recorded {len(records)} distinct operations from "
      f"{len({r['test'] for r in records})} tests", file=sys.stderr)
for reason, n in skipped.most_common():
    print(f"  skipped {n:5}  {reason}", file=sys.stderr)
g.write_json({"python_version": sys.version.split()[0], "tests_run": result.testsRun,
              "records": records}, sys.argv[1] if len(sys.argv) > 1 else None)
