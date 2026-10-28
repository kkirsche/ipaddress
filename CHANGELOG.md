# Changelog

## Unreleased

### Breaking changes

- Requires Node.js 22 or newer. Node.js 20 reached end-of-life on
  2026-04-30.

## 2.0.0

A rewrite that matches the public API and behavior of Python 3.15's
`ipaddress` module, verified by a test suite generated from CPython.

### Breaking changes

- The library is now a single package, `@ipaddress/core`. The
  `@ipaddress/addresses`, `@ipaddress/networks`, `@ipaddress/interfaces` and
  `@ipaddress/constants` packages are deprecated; import everything from
  `@ipaddress/core` instead.
- Only the package root can be imported; deep imports of internal files are no
  longer supported.
- `@ipaddress/core` no longer exports low-level helpers (type guards such as
  `isNumber`, `intToBytes`, `intFromBytes`, `bitLength`, `strIsAscii`,
  `_compressHextets`, `IPv4ALLONES`, ...). `IPv4LENGTH` and `IPv6LENGTH` are
  renamed `IPV4LENGTH` and `IPV6LENGTH`, as in Python.
- The `ipv4Network` and `ipv6Network` functions are removed; use
  `new IPv4Network(...)`, `new IPv6Network(...)` or `ipNetwork(...)`.
- `_IPv4Constants` and `_IPv6Constants` are no longer exported; use the `is*`
  properties instead.
- Packed addresses (`packed`, `v4IntToPacked`, `v6IntToPacked` and packed
  constructor input) are `Uint8Array`s instead of `number[]`. A plain array is
  read as an `[address, mask]` tuple.
- `add` and `sub` take an integer and return a new address, like Python's
  `address + n`. They previously took an address and returned a number.
- `scope_id` is renamed `scopeId`.
- Networks are iterated with `for...of` or `[...network]` instead of
  `iterate()`.
- Errors match Python's: `AddressValueError` and `NetmaskValueError` extend
  the new `ValueError`, and messages are identical to Python's.
- Requires Node.js 20 or newer.

### Added

- Module functions `ipInterface`, `summarizeAddressRange`,
  `collapseAddresses` and `getMixedTypeKey`.
- All `is*` properties on IPv4 and IPv6 addresses, interfaces and networks,
  and `IPv4Address.ipv6Mapped`.
- `lessThanOrEqual`, `greaterThan` and `greaterThanOrEqual`, following
  Python's comparison rules.
- `format()`, the equivalent of Python's `format(address, spec)`.
- `subnets` and `supernet` accept an options object for keyword arguments,
  e.g. `subnets({ newPrefix: 26 })`.
- Interfaces have `network` and `netmask`.
- The package works with both `import` and `require`, and ships without
  test files (34 kB instead of over 1 MB).

### Fixed

- Results and error messages now match Python for parsing, IPv6 compression,
  masks, reverse pointers, special-purpose address ranges and every other
  operation covered by the compatibility test suite.
