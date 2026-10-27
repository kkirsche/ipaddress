# ipaddress

A TypeScript port of the Python [`ipaddress`](https://docs.python.org/3/library/ipaddress.html) module.

The port follows CPython's [`Lib/ipaddress.py`](https://github.com/python/cpython/blob/main/Lib/ipaddress.py)
and is verified against the behavior of Python 3.15 (see [Compatibility testing](#compatibility-testing)).

```ts
import { ipAddress, ipNetwork, collapseAddresses } from "ipaddress";

const network = ipNetwork("192.0.2.0/24");
network.contains(ipAddress("192.0.2.7")); // true
[...network.subnets({ newPrefix: 26 })].map(String);
// ["192.0.2.0/26", "192.0.2.64/26", "192.0.2.128/26", "192.0.2.192/26"]

ipAddress("2001:db8::1").exploded; // "2001:0db8:0000:0000:0000:0000:0000:0001"
ipAddress("10.0.0.1").isPrivate; // true
```

## API

Everything public in Python's module has an equivalent export. Names are
converted to camelCase:

| Python                                       | TypeScript                                        |
| -------------------------------------------- | ------------------------------------------------- |
| `ip_address`, `ip_network`, `ip_interface`   | `ipAddress`, `ipNetwork`, `ipInterface`           |
| `summarize_address_range`                    | `summarizeAddressRange`                           |
| `collapse_addresses`, `get_mixed_type_key`   | `collapseAddresses`, `getMixedTypeKey`            |
| `v4_int_to_packed`, `v6_int_to_packed`       | `v4IntToPacked`, `v6IntToPacked`                  |
| `IPV4LENGTH`, `IPV6LENGTH`                   | `IPV4LENGTH`, `IPV6LENGTH`                        |
| `AddressValueError`, `NetmaskValueError`     | `AddressValueError`, `NetmaskValueError`          |
| `IPv4Address`, `IPv4Interface`, ...          | `IPv4Address`, `IPv4Interface`, ...               |
| `network_address`, `is_private`, ...         | `networkAddress`, `isPrivate`, ...                |
| `subnets(new_prefix=26)`                     | `subnets({ newPrefix: 26 })` or `subnets(1, 26)`  |
| `IPv4Network(addr, strict=False)`            | `new IPv4Network(addr, false)`                    |

Python operators are methods:

| Python                         | TypeScript                                                       |
| ------------------------------ | ---------------------------------------------------------------- |
| `a == b`, `a != b`             | `a.equals(b)`, `!a.equals(b)`                                    |
| `a < b`, `a <= b`              | `a.lessThan(b)`, `a.lessThanOrEqual(b)`                          |
| `a > b`, `a >= b`              | `a.greaterThan(b)`, `a.greaterThanOrEqual(b)`                    |
| `address + 1`, `address - 1`   | `address.add(1)`, `address.sub(1)`                               |
| `int(address)`                 | `address.toNumber()` (a `number` for IPv4, a `bigint` for IPv6)  |
| `str(obj)`, `repr(obj)`        | `obj.toString()` / `` `${obj}` ``, `obj.toRepr()`                |
| `format(address, "#_x")`       | `address.format("#_x")`                                          |
| `address in network`           | `network.contains(address)`                                      |
| `network[n]`                   | `network.getItem(n)`                                             |
| `for address in network`       | `for (const address of network)`                                 |

Comparisons follow Python's dispatch rules exactly, including comparing
addresses with interfaces and raising `TypeError` for unsupported comparisons.

### Types

| Python            | TypeScript                                                       |
| ----------------- | ---------------------------------------------------------------- |
| `int`             | `number` or `bigint` (use `bigint` above `Number.MAX_SAFE_INTEGER`) |
| `bytes`           | `Uint8Array` (including Node.js `Buffer`)                        |
| `(addr, mask)`    | `[addr, mask]`                                                   |
| `None`            | `null`                                                           |
| iterators         | generators                                                       |

### Errors

`AddressValueError` and `NetmaskValueError` extend the exported `ValueError`,
as in Python. Error messages are identical to Python's. Python exceptions
without a JavaScript counterpart are mapped as follows:

| Python           | TypeScript   |
| ---------------- | ------------ |
| `ValueError`     | `ValueError` |
| `TypeError`      | `TypeError`  |
| `IndexError`     | `RangeError` |
| `AttributeError` | `TypeError`  |

Hashing (`__hash__`) and pickling (`__reduce__`) have no JavaScript
equivalent and are not provided.

## Development

```sh
yarn install
yarn test       # run the test suite
yarn typecheck  # type check the sources and tests
yarn lint
yarn build      # compile to build/
```

### Compatibility testing

`scripts/generate_fixtures.py` runs thousands of operations through CPython's
`ipaddress` module: constructors with valid and invalid input, every property,
formatting, arithmetic, comparisons between every pair of object kinds, network
methods and the module functions. It records each result, or the exception type
and message, in `src/__fixtures__/python-ipaddress.json`.
`src/compatibility.test.ts` replays every case against this library and
requires identical results. It also checks that every public name in Python's
module and classes has an equivalent here.

To regenerate the fixtures with a different Python version:

```sh
yarn fixtures  # runs python3 scripts/generate_fixtures.py
```
