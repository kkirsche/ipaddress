/**
 * Equivalent of Python's built-in ValueError. Python's ipaddress module
 * raises it directly (e.g. for host bits being set) and uses it as the base
 * class of AddressValueError and NetmaskValueError.
 */
export class ValueError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = new.target.name;
  }
}

/**
 * A Value Error related to the address.
 */
export class AddressValueError extends ValueError {}

/**
 * A Value Error related to the netmask.
 */
export class NetmaskValueError extends ValueError {}
