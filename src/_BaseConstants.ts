import { IPv4Network } from "./03-IPv4Network";
import { IPv6Network } from "./IPv6Network";

export class _BaseConstants {
  static _privateNetworks: IPv4Network | IPv6Network[] = [];
}
