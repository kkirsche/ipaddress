import { IPV4AddressT } from "./IPV4Address";
import { _BaseNetworkT, _BaseNetworkTInstance } from "./_BaseNetwork";
import { , _BaseV4T, _BaseV4TInstance } from "./_BaseV4";
import { ByteArray, IPInteger, Prefixlen, NetmaskCacheValue } from "./constants";

export interface IPV4NetworkT extends _BaseV4T, _BaseNetworkT {
    new(address: string | IPInteger | ByteArray, strict: boolean): IPV4NetworkTInstance;
    _addressClass: IPV4AddressT
}

export interface IPV4NetworkTInstance extends _BaseV4TInstance, _BaseNetworkTInstance {
   networkAddress: IPV4AddressT 
   netmask: NetmaskCacheValue;
   _prefixlen: Prefixlen;

}
