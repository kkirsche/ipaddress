#!/usr/bin/env python3
"""Record the behavior of CPython's ipaddress module as JSON test fixtures.

The TypeScript test suite (src/compatibility.test.ts) replays every case in
the generated file against this library and requires identical results,
including exception types and messages.

Usage:
    python3 scripts/generate_fixtures.py > src/__fixtures__/python-ipaddress.json
"""

import ipaddress
import itertools
import json
import random
import sys

CLASSES = {
    name: getattr(ipaddress, name)
    for name in (
        "IPv4Address",
        "IPv4Interface",
        "IPv4Network",
        "IPv6Address",
        "IPv6Interface",
        "IPv6Network",
    )
}
IP_TYPES = tuple(CLASSES.values())

# Limit on the number of items recorded from (potentially huge) iterators.
ITER_LIMIT = 8


def enc(value):
    """Encode a constructor argument so the TypeScript side can rebuild it."""
    if isinstance(value, bool) or value is None:
        return value
    if isinstance(value, int):
        return {"int": str(value)}
    if isinstance(value, bytes):
        return {"bytes": value.hex()}
    if isinstance(value, tuple):
        return {"tuple": [enc(v) for v in value]}
    if isinstance(value, str):
        return value
    if isinstance(value, IP_TYPES):
        return {"obj": spec(value)}
    raise TypeError(f"cannot encode {value!r}")


def spec(obj):
    """Describe how to construct an IP object."""
    return {"cls": type(obj).__name__, "args": [enc(str(obj))]}


def ser(value):
    """Serialize a result value."""
    if isinstance(value, bool) or value is None:
        return value
    if value is NotImplemented:
        return {"NotImplemented": True}
    if isinstance(value, int):
        return {"int": str(value)}
    if isinstance(value, bytes):
        return {"bytes": value.hex()}
    if isinstance(value, str):
        return value
    if isinstance(value, IP_TYPES):
        return {"repr": repr(value)}
    if isinstance(value, (tuple, list)):
        return [ser(v) for v in value]
    raise TypeError(f"cannot serialize {value!r}")


def capture(fn):
    try:
        return {"value": ser(fn())}
    except Exception as exc:  # noqa: BLE001 - recording every failure mode
        return {"error": [type(exc).__name__, str(exc)]}


def take(iterable, limit=ITER_LIMIT):
    return list(itertools.islice(iterable, limit))


ADDRESS_PROPS = [
    "str", "repr", "int", "exploded", "compressed", "reverse_pointer",
    "version", "max_prefixlen", "packed", "is_multicast", "is_private",
    "is_global", "is_reserved", "is_loopback", "is_link_local",
    "is_unspecified",
]
V4_ADDRESS_PROPS = ADDRESS_PROPS + ["ipv6_mapped"]
V6_ADDRESS_PROPS = ADDRESS_PROPS + [
    "scope_id", "is_site_local", "ipv4_mapped", "teredo", "sixtofour",
]
INTERFACE_PROPS = [
    "ip", "network", "netmask", "hostmask", "with_prefixlen", "with_netmask",
    "with_hostmask",
]
NETWORK_PROPS = [
    "str", "repr", "exploded", "compressed", "reverse_pointer", "version",
    "max_prefixlen", "network_address", "broadcast_address", "netmask",
    "hostmask", "prefixlen", "num_addresses", "with_prefixlen",
    "with_netmask", "with_hostmask", "is_multicast", "is_private",
    "is_global", "is_reserved", "is_loopback", "is_link_local",
    "is_unspecified", "hosts", "iter", "supernet", "subnets",
]

PROPS = {
    "IPv4Address": V4_ADDRESS_PROPS,
    "IPv4Interface": V4_ADDRESS_PROPS + INTERFACE_PROPS,
    "IPv4Network": NETWORK_PROPS,
    "IPv6Address": V6_ADDRESS_PROPS,
    "IPv6Interface": V6_ADDRESS_PROPS + INTERFACE_PROPS,
    "IPv6Network": NETWORK_PROPS + ["is_site_local"],
}


def get_prop(obj, name):
    if name == "str":
        return str(obj)
    if name == "repr":
        return repr(obj)
    if name == "int":
        return int(obj)
    if name == "hosts":
        return take(obj.hosts())
    if name == "iter":
        return take(obj)
    if name == "supernet":
        return obj.supernet()
    if name == "subnets":
        return take(obj.subnets())
    return getattr(obj, name)


def record_object(cls_name, args):
    cls = CLASSES[cls_name]
    case = {"cls": cls_name, "args": [enc(a) for a in args]}
    try:
        obj = cls(*args)
    except Exception as exc:  # noqa: BLE001
        case["error"] = [type(exc).__name__, str(exc)]
        return case
    case["props"] = {
        name: capture(lambda: get_prop(obj, name)) for name in PROPS[cls_name]
    }
    return case


V4_STRINGS = [
    "0.0.0.0", "0.0.0.1", "1.2.3.4", "10.0.0.1", "100.64.0.1",
    "127.0.0.1", "169.254.1.1", "172.16.0.1", "192.0.0.9", "192.0.0.10",
    "192.0.0.170", "192.0.2.1", "192.168.1.1", "198.18.0.1", "203.0.113.5",
    "224.0.0.1", "239.255.255.255", "240.0.0.1", "255.255.255.255",
    "8.8.8.8", "1.1.1.1",
    # invalid
    "", " ", "1", "1.2", "1.2.3", "1.2.3.4.5", "1.2.3.", ".1.2.3",
    "1..2.3", "256.0.0.0", "1.2.3.256", "01.2.3.4", "1.02.3.4", "00.0.0.0",
    "1234.0.0.0", "-1.2.3.4", "+1.2.3.4", "1.2.3.4 ", " 1.2.3.4", "a.b.c.d",
    "0x1.2.3.4", "1.2.3.4\n", "１.2.3.4", "1.2.3.4%eth0", "1.2.3.4/",
    "1.2.3.4//24", "it's", 'say "hi"', "back\\slash",
]
V4_NETWORK_STRINGS = [
    "0.0.0.0/0", "0.0.0.0/8", "10.0.0.0/8", "10.0.0.0/255.0.0.0",
    "10.0.0.0/0.255.255.255", "10.1.2.3/8", "10.1.2.3/255.0.0.0",
    "100.64.0.0/10", "100.64.0.0/11", "127.0.0.0/8", "169.254.0.0/16",
    "172.16.0.0/12", "192.0.0.0/24", "192.0.0.8/29", "192.0.0.170/31",
    "192.0.2.0/24", "192.0.2.0/25", "192.0.2.0/27", "192.0.2.0/31",
    "192.0.2.1/31", "192.0.2.1/32", "192.0.2.5/32", "192.168.0.0/16",
    "198.18.0.0/15", "224.0.0.0/4", "240.0.0.0/4", "255.255.255.255/32",
    "1.0.0.0/8", "8.8.8.0/24", "1.2.3.4/0",
    # invalid
    "1.2.3.4/33", "1.2.3.4/-1", "1.2.3.4/+24", "1.2.3.4/ 24", "1.2.3.4/24 ",
    "1.2.3.4/", "1.2.3.4/a", "1.2.3.4/255.0.255.0", "1.2.3.4/0.0.255.255.0",
    "1.2.3.4/255.255.255.256", "1.2.3.4/024", "1.2.3.4/1.2.3.4/5",
    "/24", "1.2.3.4/２４",
]
V6_STRINGS = [
    "::", "::1", "::2", "1::", "1::1", "2001:db8::", "2001:db8::1",
    "2001:DB8::1", "2001:0db8:0000:0000:0000:0000:0000:0001",
    "2001:db8:0:0:1:0:0:1", "2001:db8::1:0:0:1", "2001:0:0:1::1",
    "1:0:0:0:0:0:0:0", "0:0:0:0:0:0:0:1", "1:2:3:4:5:6:7:8",
    "1:2:3:4:5:6:7::", "::2:3:4:5:6:7:8", "1:0:2:0:3:0:4:0",
    "fe80::1", "fe80::1%eth0", "fe80::1%1", "fec0::1", "fc00::1", "ff02::1",
    "100::1", "2001::1", "2001:1::1", "2001:1::2", "2001:1::3", "2001:3::1",
    "2001:4:112::1", "2001:20::1", "2001:30::1", "2002:c000:0204::1",
    "2001:0:4136:e378:8000:63bf:3fff:fdd2", "3fff::1", "64:ff9b:1::1",
    "::ffff:1.2.3.4", "::ffff:10.0.0.1", "::ffff:127.0.0.1", "::ffff:0.0.0.0",
    "::ffff:224.0.0.1", "::ffff:169.254.1.1", "::ffff:240.0.0.1",
    "::ffff:100.64.0.1", "::ffff:102:304", "::ffff:1.2.3.4%scope",
    "::1.2.3.4", "1:2:3:4:5:6:1.2.3.4", "::ffff:ffff:ffff",
    "ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff", "a:b:c:d:e:f:0:0",
    "0:0:1:0:0:1:0:0", "1:0:0:2:0:0:0:3",
    # invalid
    "", ":", ":::", "1:2", "1:2:3:4:5:6:7", "1:2:3:4:5:6:7:8:9",
    "1:2:3:4:5:6:7:8:9:10:11", "1::2::3", ":1:2:3:4:5:6:7", "1:2:3:4:5:6:7:",
    ":1::2", "1::2:", "1:2:3:4::5:6:7:8", "12345::", "g::", "::1.2.3",
    "::1.2.3.256", "1:2:3:4:5:6:7:1.2.3.4", "fe80::1%", "fe80::1%a%b",
    "%eth0", "::1/", "1" * 50, "1:" * 60, "fe80::1%ét", "::٣",
    "::1 ", " ::1", "::-1", "::+1", "::0x1",
]
V6_NETWORK_STRINGS = [
    "::/0", "::/128", "::1/128", "::/96", "2001:db8::/32", "2001:db8::/64",
    "2001:db8::1/64", "2001:db8::1000/124", "2001:db8::/127",
    "2001:db8::/126", "2001:db8::1/128", "fe80::/10", "fe80::/64",
    "fe80::%eth0/64", "fe80::1%eth0/64", "fe80::1%eth0/128", "fec0::/10",
    "fc00::/7", "ff00::/8", "ff02::/16", "2001::/23", "2001:1::1/128",
    "2001:3::/32", "2002::/16", "3fff::/20", "100::/64", "::ffff:0:0/96",
    "::ffff:1.2.3.0/120", "::ffff:1.2.3.4/128", "2000::/3", "1::/16",
    "64:ff9b:1::/48", "2001:db8::1/032",
    # invalid
    "2001:db8::/129", "2001:db8::/-1", "2001:db8::/ffff::", "2001:db8::/a",
    "2001:db8::/", "2001:db8::/64/64", "::1/+64", "::1/６４",
]

INTS = [
    0, 1, 255, 2**24, 3221225985, 2**32 - 1, 2**32, 2**48, 2**53 + 1,
    2**64, 42540766411282592856903984951653826560, 2**128 - 1, 2**128, -1,
]
BYTES = [
    b"", b"\x01\x02\x03", b"\xc0\x00\x02\x01", b"\x7f\x00\x00\x01\x00",
    b"\x00" * 16, b"\x20\x01\x0d\xb8" + b"\x00" * 11 + b"\x01",
    b"\xff" * 16, b"\x00" * 17, b"'\"\\\n\t\r a~",
]
TUPLES = [
    ("192.0.2.0", 24), ("192.0.2.0", "24"), ("192.0.2.0", "255.255.255.0"),
    ("192.0.2.0", "0.0.0.255"), ("192.0.2.5", 24), (3221225984, 24),
    (3221225984, "255.255.255.0"), (b"\xc0\x00\x02\x00", 24), ("192.0.2.0",),
    ("192.0.2.0", 33), ("192.0.2.0", -1), ("192.0.2.0", "x"),
    ("1.2.3.4", 24, 1), ("2001:db8::", 32), ("2001:db8::", "32"),
    ("2001:db8::1", 32), ("2001:db8::", 129), (2**64, 64),
    (b"\x20\x01\x0d\xb8" + b"\x00" * 12, 32), ("2001:db8::",),
    ("2001:db8::", "ffff:ffff::"),
]


def random_inputs(rng):
    v4 = [rng.getrandbits(32) for _ in range(40)]
    v6 = []
    for _ in range(80):
        # Build addresses with random runs of zero hextets to exercise the
        # "::" compression rules.
        hextets = [
            0 if rng.random() < 0.45 else rng.getrandbits(rng.choice((4, 8, 16)))
            for _ in range(8)
        ]
        v6.append(int("".join(f"{h:04x}" for h in hextets), 16))
    v4_nets = [
        str(ipaddress.IPv4Network((rng.getrandbits(32), rng.randint(0, 32)), strict=False))
        for _ in range(25)
    ]
    v6_nets = [
        str(ipaddress.IPv6Network((rng.choice(v6), rng.randint(0, 128)), strict=False))
        for _ in range(25)
    ]
    return v4, v6, v4_nets, v6_nets


def main():
    rng = random.Random(20261027)
    rand_v4, rand_v6, rand_v4_nets, rand_v6_nets = random_inputs(rng)

    addr_strings = V4_STRINGS + V6_STRINGS
    net_strings = V4_NETWORK_STRINGS + V6_NETWORK_STRINGS
    all_inputs = (
        addr_strings + net_strings + INTS + BYTES + TUPLES
        + [ipaddress.IPv4Address("1.2.3.4"), ipaddress.IPv6Interface("::1/64")]
    )

    constructors = []
    for cls_name in CLASSES:
        for value in all_inputs:
            constructors.append(record_object(cls_name, [value]))
        if cls_name.endswith("Network"):
            for value in net_strings + TUPLES:
                constructors.append(record_object(cls_name, [value, False]))
    for value in rand_v4:
        for cls_name in ("IPv4Address", "IPv4Interface"):
            constructors.append(record_object(cls_name, [value]))
        constructors.append(
            record_object("IPv4Address", [str(ipaddress.IPv4Address(value))])
        )
    for value in rand_v6:
        for cls_name in ("IPv6Address", "IPv6Interface"):
            constructors.append(record_object(cls_name, [value]))
        exploded = ipaddress.IPv6Address(value).exploded
        constructors.append(record_object("IPv6Address", [exploded]))
    for value in rand_v4_nets:
        constructors.append(record_object("IPv4Network", [value]))
        constructors.append(record_object("IPv4Interface", [value]))
    for value in rand_v6_nets:
        constructors.append(record_object("IPv6Network", [value]))
        constructors.append(record_object("IPv6Interface", [value]))

    A4, A6 = ipaddress.IPv4Address, ipaddress.IPv6Address
    I4, I6 = ipaddress.IPv4Interface, ipaddress.IPv6Interface
    N4, N6 = ipaddress.IPv4Network, ipaddress.IPv6Network

    format_addresses = [
        A4("0.0.0.0"), A4("1.2.3.4"), A4("255.255.255.255"), I4("10.1.2.3/8"),
        A6("::"), A6("2001:db8::1"), A6("fe80::1%eth0"), A6("::ffff:1.2.3.4"),
        I6("2001:db8::5/64"),
    ]
    format_specs = [
        "", "s", "b", "x", "X", "n", "#b", "#x", "#X", "#n", "_b", "_x", "_X",
        "_n", "#_b", "#_x", "#_X", "#_n", "20s", ">20s", "<20s", "^20s",
        "*^21s", "05s", ".3s", "^9.5s", ">50", "10", "d", "o", "c", "#bs",
        "+s", "#s", ",s", "_s", "=10s", "z5s", "%s", "x_", "##x", "b#",
    ]
    formats = [
        {"obj": spec(a), "fmt": f, "result": capture(lambda: format(a, f))}
        for a in format_addresses
        for f in format_specs
    ]

    arithmetic = []
    for a in [
        A4("0.0.0.0"), A4("1.2.3.4"), A4("255.255.255.255"), I4("10.1.2.3/8"),
        A6("::"), A6("2001:db8::1"), A6("fe80::1%eth0"),
        A6("ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff"), I6("2001:db8::5/64"),
    ]:
        for n in [0, 1, -1, 256, 2**32, 2**64, 2**128]:
            arithmetic.append({"obj": spec(a), "op": "+", "n": enc(n),
                               "result": capture(lambda: a + n)})
            arithmetic.append({"obj": spec(a), "op": "-", "n": enc(n),
                               "result": capture(lambda: a - n)})

    compare_objects = [
        A4("1.1.1.1"), A4("1.1.1.2"), I4("1.1.1.1/24"), I4("1.1.1.1/32"),
        I4("1.1.1.2/24"), I4("1.1.1.0/25"), N4("1.1.1.0/24"), N4("1.1.1.1/32"),
        N4("1.1.1.0/25"), A6("::1"), A6("::2"), A6("fe80::1%a"),
        A6("fe80::1%b"), A6("fe80::1"), I6("::1/64"), I6("::1/128"),
        N6("::/64"), N6("::1/128"), N6("fe80::1%a/128"),
    ]
    ops = {
        "==": lambda a, b: a == b,
        "!=": lambda a, b: a != b,
        "<": lambda a, b: a < b,
        "<=": lambda a, b: a <= b,
        ">": lambda a, b: a > b,
        ">=": lambda a, b: a >= b,
    }
    comparisons = [
        {"a": spec(a), "b": spec(b), "op": op,
         "result": capture(lambda: fn(a, b))}
        for a in compare_objects
        for b in compare_objects
        for op, fn in ops.items()
    ]
    for a in compare_objects[:3] + compare_objects[6:7]:
        for other in [1, "1.1.1.1"]:
            for op, fn in ops.items():
                comparisons.append({"a": spec(a), "b": enc(other), "op": op,
                                    "result": capture(lambda: fn(a, other))})

    networks = [
        N4("0.0.0.0/0"), N4("10.0.0.0/8"), N4("10.1.0.0/16"), N4("10.1.2.0/24"),
        N4("10.1.2.3/32"), N4("192.0.2.0/28"), N4("192.0.2.0/31"),
        N4("100.64.0.0/10"), N6("::/0"), N6("2001:db8::/32"),
        N6("2001:db8::/64"), N6("2001:db8::1/128"), N6("2001:db8::/126"),
        N6("fe80::1%eth0/128"),
    ]
    members = networks + [
        A4("10.1.2.3"), A4("192.0.2.15"), I4("10.1.2.3/8"), I4("10.1.2.3/30"),
        A6("2001:db8::1"), A6("fe80::1%eth0"), I6("2001:db8::1/16"),
    ]
    network_ops = []
    for net in networks:
        for other in members:
            entry = {"a": spec(net), "b": spec(other)}
            entry["contains"] = capture(lambda: other in net)
            entry["overlaps"] = capture(lambda: net.overlaps(other))
            entry["subnet_of"] = capture(lambda: net.subnet_of(other))
            entry["supernet_of"] = capture(lambda: net.supernet_of(other))
            entry["compare_networks"] = capture(lambda: net.compare_networks(other))
            entry["address_exclude"] = capture(
                lambda: take(net.address_exclude(other), 200)
            )
            network_ops.append(entry)

    subnet_calls = [
        ((), {}), ((0,), {}), ((2,), {}), ((-1,), {}), ((33,), {}),
        ((129,), {}), ((), {"new_prefix": 30}), ((), {"new_prefix": 7}),
        ((2,), {"new_prefix": 30}), ((1,), {"new_prefix": 30}),
        ((), {"new_prefix": 200}),
    ]
    supernet_calls = [
        ((), {}), ((0,), {}), ((3,), {}), ((33,), {}), ((200,), {}),
        ((), {"new_prefix": 8}), ((), {"new_prefix": 31}),
        ((2,), {"new_prefix": 8}), ((1,), {"new_prefix": 8}),
        ((), {"new_prefix": -1}),
    ]
    method_calls = []
    for net in networks:
        for args, kwargs in subnet_calls:
            method_calls.append({
                "obj": spec(net), "method": "subnets", "args": list(args),
                "kwargs": kwargs,
                "result": capture(lambda: take(net.subnets(*args, **kwargs), 16)),
            })
        for args, kwargs in supernet_calls:
            method_calls.append({
                "obj": spec(net), "method": "supernet", "args": list(args),
                "kwargs": kwargs,
                "result": capture(lambda: net.supernet(*args, **kwargs)),
            })
        for n in [0, 1, 2, 15, 16, 255, 256, 2**32, -1, -2, -16, -17, -256, -(2**32) - 1]:
            method_calls.append({
                "obj": spec(net), "method": "getitem", "args": [enc(n)],
                "kwargs": {}, "result": capture(lambda: net[n]),
            })

    functions = []
    for value in all_inputs:
        functions.append({"fn": "ip_address", "args": [enc(value)],
                          "result": capture(lambda: ipaddress.ip_address(value))})
        functions.append({"fn": "ip_interface", "args": [enc(value)],
                          "result": capture(lambda: ipaddress.ip_interface(value))})
        for strict in (True, False):
            functions.append({
                "fn": "ip_network", "args": [enc(value), strict],
                "result": capture(lambda: ipaddress.ip_network(value, strict)),
            })
    for value in INTS + rand_v4[:5] + rand_v6[:5]:
        functions.append({"fn": "v4_int_to_packed", "args": [enc(value)],
                          "result": capture(lambda: ipaddress.v4_int_to_packed(value))})
        functions.append({"fn": "v6_int_to_packed", "args": [enc(value)],
                          "result": capture(lambda: ipaddress.v6_int_to_packed(value))})

    ranges = [
        (A4("192.0.2.0"), A4("192.0.2.130")), (A4("0.0.0.0"), A4("255.255.255.255")),
        (A4("1.2.3.4"), A4("1.2.3.4")), (A4("1.2.3.5"), A4("1.2.3.4")),
        (A4("10.0.0.1"), A4("10.0.3.254")), (A4("255.255.255.0"), A4("255.255.255.255")),
        (A6("::"), A6("ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff")),
        (A6("2001:db8::1"), A6("2001:db8::1:0")), (A6("::1"), A6("::")),
        (A4("1.2.3.4"), A6("::1")), (I4("10.0.0.1/8"), I4("10.0.0.9/24")),
        (N4("10.0.0.0/8"), A4("10.0.0.1")),
    ]
    for _ in range(10):
        lo, hi = sorted(rng.getrandbits(32) for _ in range(2))
        ranges.append((A4(lo), A4(hi)))
        lo, hi = sorted(rng.choice(rand_v6) for _ in range(2))
        ranges.append((A6(lo), A6(hi)))
    for first, last in ranges:
        functions.append({
            "fn": "summarize_address_range", "args": [{"obj": spec(first)}, {"obj": spec(last)}],
            "result": capture(lambda: take(ipaddress.summarize_address_range(first, last), 300)),
        })

    collapse_inputs = [
        [N4("192.0.2.0/25"), N4("192.0.2.128/25")],
        [N4("192.0.2.0/26"), N4("192.0.2.64/26"), N4("192.0.2.128/26"), N4("192.0.2.192/26")],
        [A4("192.0.2.0"), A4("192.0.2.1"), A4("192.0.2.2"), A4("192.0.2.3"), A4("192.0.2.5")],
        [A4("1.1.1.1"), A4("1.1.1.1"), N4("1.1.1.0/24"), N4("1.1.0.0/16")],
        [N4("1.1.1.1/32"), A4("1.1.1.0"), I4("1.1.1.2/24"), I4("1.1.1.3/32")],
        [N4("10.0.0.0/8"), N4("10.0.0.0/8"), N4("10.1.0.0/16")],
        [N6("2001:db8::/33"), N6("2001:db8:8000::/33"), A6("::1"), A6("::2"), A6("::3")],
        [A6("fe80::1%eth0"), A6("fe80::2")],
        [A4("1.1.1.1"), A6("::1")],
        [N4("1.1.1.0/24"), N6("::/64")],
        [A4("1.1.1.1"), N6("::1/128")],
        [],
        [A4("255.255.255.255"), A4("255.255.255.254")],
        [A6("ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff")],
    ]
    for _ in range(5):
        collapse_inputs.append([A4(rng.getrandbits(8) + 2**24) for _ in range(40)])
        base = rng.getrandbits(32) & ~0xFFF
        collapse_inputs.append([
            N4((base + (rng.getrandbits(12) & ~0xF), 28)) for _ in range(30)
        ])
    for addrs in collapse_inputs:
        functions.append({
            "fn": "collapse_addresses", "args": [[{"obj": spec(a)} for a in addrs]],
            "result": capture(lambda: list(ipaddress.collapse_addresses(addrs))),
        })

    for obj in compare_objects:
        functions.append({
            "fn": "get_mixed_type_key", "args": [{"obj": spec(obj)}],
            "result": capture(lambda: ipaddress.get_mixed_type_key(obj)),
        })

    # The public API: module level names, and the public attributes and
    # operator overloads of an instance of each class.
    dunders = [
        "__eq__", "__lt__", "__le__", "__gt__", "__ge__", "__add__",
        "__sub__", "__int__", "__str__", "__repr__", "__format__",
        "__contains__", "__iter__", "__getitem__",
    ]
    samples = {
        "IPv4Address": A4("1.2.3.4"), "IPv4Interface": I4("1.2.3.4/24"),
        "IPv4Network": N4("1.2.3.0/24"), "IPv6Address": A6("::1"),
        "IPv6Interface": I6("::1/64"), "IPv6Network": N6("::/64"),
    }
    api = {
        "module": sorted(
            name for name in dir(ipaddress)
            if not name.startswith("_") and name != "functools"
        ),
        "classes": {
            name: sorted(
                [attr for attr in dir(obj) if not attr.startswith("_")]
                + [d for d in dunders
                   if getattr(type(obj), d, None) is not getattr(object, d, None)]
            )
            for name, obj in samples.items()
        },
    }

    json.dump({
        "python_version": sys.version.split()[0],
        "api": api,
        "constructors": constructors,
        "formats": formats,
        "arithmetic": arithmetic,
        "comparisons": comparisons,
        "network_ops": network_ops,
        "method_calls": method_calls,
        "functions": functions,
    }, sys.stdout, ensure_ascii=False, separators=(",", ":"))
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
