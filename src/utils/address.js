import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "tiny-secp256k1";
import { TESTNET } from "@lib/constants.config";

import SessionStorage, { SessionsStorageKeys } from "@services/session-storage";

bitcoin.initEccLib(ecc);

export const getAddressInfo = (publicKey) => {
    console.log(`Pubkey: ${publicKey.toString()}`);
    const pubkeyBuffer = Buffer.from(publicKey, "hex");
    
    let bip38 = SessionStorage.get(SessionsStorageKeys.BIP38);
    if (bip38) {
        const addrInfo = bitcoin.payments.p2pkh({
            pubkey: pubkeyBuffer,
            network: TESTNET ? bitcoin.networks.testnet : bitcoin.networks.bitcoin,
        });
        return addrInfo
    }
    const addrInfo = bitcoin.payments.p2tr({
        pubkey: pubkeyBuffer,
        network: TESTNET ? bitcoin.networks.testnet : bitcoin.networks.bitcoin,
    });
    return addrInfo;
};
