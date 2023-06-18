import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "tiny-secp256k1";
import * as bip38 from "bip38"
import * as wif from "wif"
import { ECPairFactory } from "ecpair";

import { ethers } from "ethers";
import BIP32Factory from "bip32";
import { DEFAULT_DERIV_PATH, NETWORK } from "@lib/constants.config";
import { toXOnly } from "@utils/crypto";
import SessionStorage, { SessionsStorageKeys } from "@services/session-storage";


bitcoin.initEccLib(ecc);

const bip32 = BIP32Factory(ecc);
const ECPair = ECPairFactory(ecc);


// sign message with first sign transaction
export const TAPROOT_MESSAGE = (domain) =>
    // will switch to nosft.xyz once sends are implemented
    `Sign this message to generate your Bitcoin Taproot key. This key will be used for your ${domain} transactions.`;

// Used to prove ownership of address and associated ordinals
// https://github.com/LegReq/bip0322-signatures/blob/master/BIP0322_signing.ipynb

export const connectWallet = async (metamask) => {
    const { ethereum } = window;

    if (metamask == "Ballet") {

        let savedKey = await SessionStorage.get(SessionsStorageKeys.BIP38S);
        if (savedKey) {
            var keyPair1 = await ECPair.fromWIF(savedKey, bitcoin.networks.bitcoin)
            const addrInfo1 = bitcoin.payments.p2pkh({
                pubkey: keyPair1.publicKey,
                network: bitcoin.networks.bitcoin,
            });
            return addrInfo1.pubkey.toString("hex");
        }
        let encryptedKey = await prompt("Please scan the BIP38 private key", "6Lyz...");
        let passPhrase = await prompt("Please enter the decryption password", "ABCD-1234-ABCD-etc");
        SessionStorage.set(SessionsStorageKeys.BIP38, passPhrase);
        var decryptedKey = await bip38.decrypt(encryptedKey, passPhrase)
        var dec = await wif.encode(0x80, decryptedKey.privateKey, decryptedKey.compressed)
        console.log(dec);
        console.log(decryptedKey);
        SessionStorage.set(SessionsStorageKeys.BIP38S, dec);
        var keyPair = ECPair.fromWIF(dec, bitcoin.networks.bitcoin)
        const addrInfo = bitcoin.payments.p2pkh({
            pubkey: keyPair.publicKey,
            network: bitcoin.networks.bitcoin,
        });
        return addrInfo.pubkey.toString("hex");
    }



    if (ethereum && metamask) {
        let ethAddress = ethereum.selectedAddress;
        if (!ethAddress) {
            await ethereum.request({ method: "eth_requestAccounts" });
            ethAddress = ethereum.selectedAddress;
        }
        const provider = new ethers.providers.Web3Provider(window.ethereum);
        const toSign = `0x${Buffer.from(TAPROOT_MESSAGE(metamask)).toString("hex")}`;
        const signature = await provider.send("personal_sign", [toSign, ethAddress]);
        const seed = ethers.utils.arrayify(ethers.utils.keccak256(ethers.utils.arrayify(signature)));
        const root = bip32.fromSeed(Buffer.from(seed));
        const taprootChild = root.derivePath(DEFAULT_DERIV_PATH);
        const taprootAddress = bitcoin.payments.p2tr({
            internalPubkey: toXOnly(taprootChild.publicKey),
            network: NETWORK,
        });
        return taprootAddress.pubkey.toString("hex");
    }

    if (window.nostr && window.nostr.enable) {
        await window.nostr.enable();
    } else {
        alert(
            "Oops, it looks like you haven't set up your Nostr key yet or installed Metamask." +
                "Go to your Alby Account Settings and create or import a Nostr key."
        );
        return undefined;
    }
    return window.nostr.getPublicKey();
};
