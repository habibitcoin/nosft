import { NETWORK, ORDINALS_EXPLORER_URL_LEGACY, TESTNET, MEMPOOL_API_URL } from "@lib/constants.config";
import { signPsbt } from "@utils/psbt"
import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "tiny-secp256k1";
import SessionStorage, { SessionsStorageKeys } from "@services/session-storage";
import { getAddressInfo, toXOnly } from "@utils/crypto";

bitcoin.initEccLib(ecc);

export function isSaleOrder(order) {
    return order.tags.find((x) => x?.[0] === "s")?.[1];
}

function getInscriptionId(order) {
    return order.tags.find((x) => x?.[0] === "i")[1];
}

// TODO: REMOVE THIS, NO NEED TO RE-FETCH FROM ORDINALS EXPLORER
export async function getInscriptionDataById(inscriptionId, verifyIsInscriptionNumber) {
    const html = await fetch(`${ORDINALS_EXPLORER_URL_LEGACY}/inscription/${inscriptionId}`).then((response) =>
        response.text()
    );

    // Refactor the map to not reassign x[2]
    const data = [...html.matchAll(/<dt>(.*?)<\/dt>\s*<dd.*?>(.*?)<\/dd>/gm)]
        .map((x) => {
            // eslint-disable-next-line no-param-reassign
            x[2] = x[2].replace(/<.*?>/gm, "");
            return x;
        })
        .reduce((a, b) => ({ ...a, [b[1]]: b[2] }), {});

    const error = `Inscription ${
        verifyIsInscriptionNumber || inscriptionId
    } not found (maybe you're on signet and looking for a mainnet inscription or vice versa)`;
    try {
        // use array destructuring to get the first match of html.match(/<h1>Inscription (\d*)<\/h1>/)
        const [_, number] = html.match(/<h1>Inscription (\d*)<\/h1>/);

        data.number = number;
    } catch {
        throw new Error(error);
    }
    if (verifyIsInscriptionNumber && String(data.number) !== String(verifyIsInscriptionNumber)) {
        throw new Error(error);
    }

    return data;
}

function validatePbst(psbt, utxo) {
    const sellerInput = psbt.txInputs[0];
    const sellerSignedPsbtInput = `${sellerInput.hash.reverse().toString("hex")}:${sellerInput.index}`;

    if (sellerSignedPsbtInput !== utxo) {
        throw new Error(`Seller signed PSBT does not match this inscription\n\n${sellerSignedPsbtInput}`);
    }

    if (psbt.txInputs.length !== 1 || psbt.txInputs.length !== 1) {
        throw new Error(`Invalid seller signed PSBT`);
    }

    try {
        psbt.extractTransaction(true);
    } catch (e) {
        if (e.message === "Not finalized") {
            throw new Error("PSBT not signed");
        }

        if (e.message !== "Outputs are spending more than Inputs") {
            throw new Error(`Invalid PSBT ${e.message || e}`);
        }
    }
}

function getPsbtPrice(psbt) {
    const sellerOutput = psbt.txOutputs[0];
    return Number(sellerOutput.value);
}

export async function getOrderInformation(order) {
    const sellerSignedPsbt = bitcoin.Psbt.fromBase64(order.content, {
        NETWORK,
    });

    const inscriptionId = getInscriptionId(order);

    // TODO: Remove this call, not needed.
    const inscription = await getInscriptionDataById(inscriptionId);

    validatePbst(sellerSignedPsbt, inscription.output);

    const value = getPsbtPrice(sellerSignedPsbt);

    return {
        inscriptionId,
        ...order,
        value,
    };
}

async function getTxHexById(txId) {
    const txHex = await fetch(`${MEMPOOL_API_URL}/api/tx/${txId}/hex`).then((response) =>
        response.text()
    );

    return txHex;
};

// Sell
export async function generatePSBTListingInscriptionForSale(ordinalOutput, price, paymentAddress) {
    const publicKey = Buffer.from(await window.nostr.getPublicKey(), "hex");
    const network = TESTNET ? bitcoin.networks.testnet : bitcoin.networks.bitcoin;
    let psbt = new bitcoin.Psbt({ network });
    const pubKey = SessionStorage.get(SessionsStorageKeys.NOSTR_PUBLIC_KEY);
    const inputAddressInfo = getAddressInfo(pubKey);

    const [ordinalUtxoTxId, ordinalUtxoVout] = ordinalOutput.split(":");
    const tx = bitcoin.Transaction.fromHex(await getTxHexById(ordinalUtxoTxId));
    for (const output in tx.outs) {
        try {
            tx.setWitness(parseInt(output), []);
        } catch {}
    }

    psbt.addInput({
        hash: ordinalUtxoTxId,
        index: parseInt(ordinalUtxoVout),
        // nonWitnessUtxo: tx.toBuffer(),
        // witnessUtxo: tx.outs[ordinalUtxoVout],
        witnessUtxo: {
            value: price,
            script: inputAddressInfo.output,
        },
        tapInternalKey: toXOnly(publicKey),
        // sighashType:
        //     bitcoin.Transaction.SIGHASH_SINGLE |
        //     bitcoin.Transaction.SIGHASH_ANYONECANPAY,
    });

    psbt.addOutput({
        address: paymentAddress,
        value: price,
    });

    const signedPsbt = await signPsbt(psbt.toBase64())

    return signedPsbt.toBase64();
};

// Buy
export async function generatePSBTBuyingInscription(sellerPsbtBase64, payerAddress, receiverAddress) {
    const psbt = bitcoin.Psbt.fromBase64(sellerPsbtBase64);
    let totalValue = 0;
    let totalPaymentValue = 0;

    // Add dummy utxo input
    const tx = bitcoin.Transaction.fromHex(await this.getTxHexById(this.dummyUtxo.txid));
    for (const output in tx.outs) {
        try {
            tx.setWitness(parseInt(output), []);
        } catch {}
    }
    psbt.addInput({
        hash: this.dummyUtxo.txid,
        index: this.dummyUtxo.vout,
        nonWitnessUtxo: tx.toBuffer(),
        // witnessUtxo: tx.outs[this.dummyUtxo.vout],
    });

    // Add inscription output
    psbt.addOutput({
        address: receiverAddress,
        value: this.dummyUtxo.value + Number(inscription["output value"]),
    });

    // Add payer signed input
    psbt.addInput({
        ...sellerSignedPsbt.data.globalMap.unsignedTx.tx.ins[0],
        ...sellerSignedPsbt.data.inputs[0],
    });
    // Add payer output
    psbt.addOutput({
        ...sellerSignedPsbt.data.globalMap.unsignedTx.tx.outs[0],
    });

    // Add payment utxo inputs
    for (const utxo of this.paymentUtxos) {
        const tx = bitcoin.Transaction.fromHex(await this.getTxHexById(utxo.txid));
        for (const output in tx.outs) {
            try {
                tx.setWitness(parseInt(output), []);
            } catch {}
        }

        psbt.addInput({
            hash: utxo.txid,
            index: utxo.vout,
            nonWitnessUtxo: tx.toBuffer(),
            // witnessUtxo: tx.outs[utxo.vout],
        });

        totalValue += utxo.value;
        totalPaymentValue += utxo.value;
    }

    // Create a new dummy utxo output for the next purchase
    psbt.addOutput({
        address: payerAddress,
        value: dummyUtxoValue,
    });

    const fee = calculateFee(psbt.txInputs.length, psbt.txOutputs.length, await recommendedFeeRate);

    const changeValue = totalValue - this.dummyUtxo.value - price - fee;

    if (changeValue < 0) {
        throw `Your wallet address doesn't have enough funds to buy this inscription.
Price:          ${satToBtc(price)} BTC
Fees:       ${satToBtc(fee + dummyUtxoValue)} BTC
You have:   ${satToBtc(totalPaymentValue)} BTC
Required:   ${satToBtc(totalValue - changeValue)} BTC
Missing:     ${satToBtc(-changeValue)} BTC`;
    }

    // Change utxo
    psbt.addOutput({
        address: payerAddress,
        value: changeValue,
    });

    return psbt.toBase64();
};

export async function createDummuyUtxo(payerAddress) {
    return generatePSBTGeneratingDummyUtxos(payerAddress, 1, this.paymentUtxos);
};

export async function generatePSBTGeneratingDummyUtxos(payerAddress) {
    const psbt = new bitcoin.Psbt({ network });

    const publicKey = Buffer.from(await window.nostr.getPublicKey(), "hex");
    const inputAddressInfo = getAddressInfo(publicKey);

    debugger;
    let totalValue = 0;

    if (!this.payerUtxos.length) {
        throw new Error("Send some BTC to this address to generate the dummy utxo");
    }

    for (const utxo of this.payerUtxos) {
        const tx = bitcoin.Transaction.fromHex(await this.getTxHexById(utxo.txid));
        for (const output in tx.outs) {
            try {
                tx.setWitness(parseInt(output), []);
            } catch {}
        }
        psbt.addInput({
            hash: utxo.txid,
            index: utxo.vout,
            // nonWitnessUtxo: tx.toBuffer(),
            witnessUtxo: {
                value: utxo.value,
                script: inputAddressInfo.output,
            },
            tapInternalKey: toXOnly(publicKey),
        });

        totalValue += utxo.value;
    }

    for (let i = 0; i < numberOfDummyUtxosToCreate; i++) {
        psbt.addOutput({
            address: payerAddress,
            value: dummyUtxoValue,
        });
    }

    const fee = calculateFee(psbt.txInputs.length, psbt.txOutputs.length, await recommendedFeeRate);

    // Change utxo
    psbt.addOutput({
        address: payerAddress,
        value: totalValue - numberOfDummyUtxosToCreate * dummyUtxoValue - fee,
    });

    const sigHash = psbt.__CACHE.__TX.hashForWitnessV1(
        0,
        [inputAddressInfo.output],
        [totalValue],
        bitcoin.Transaction.SIGHASH_DEFAULT
    );

    const sig = await window.nostr.signSchnorr(sigHash.toString("hex"));
    psbt.updateInput(0, {
        tapKeySig: serializeTaprootSignature(Buffer.from(sig, "hex")),
    });

    psbt.finalizeAllInputs();

    debugger;
    const tx = psbt.extractTransaction();
    const hex = tx.toBuffer().toString("hex");
    const fullTx = bitcoin.Transaction.fromHex(hex);
    await axios.post(`https://mempool.space/api/tx`, hex);

    return fullTx.getId();
};

export async function updatePayerAddress(payerAddress){
    window.localStorage.setItem("payerAddress", payerAddress); // TODO: Use service

    try {
        this.payerUtxos = await getAddressUtxos(payerAddress);
    } catch (e) {
        throw new Error("missing dummy utxo");
    }

    const potentialDummyUtxos = this.payerUtxos.filter((utxo) => utxo.value <= dummyUtxoValue);
    this.dummyUtxo = undefined;

    debugger;
    for (const potentialDummyUtxo of potentialDummyUtxos) {
        if (!(await doesUtxoContainInscription(potentialDummyUtxo))) {
            // hideDummyUtxoElements();
            this.dummyUtxo = potentialDummyUtxo;
            break;
        }
    }

    let minimumValueRequired;
    let vins;
    let vouts;

    if (!this.dummyUtxo) {
        // showDummyUtxoElements();
        minimumValueRequired = numberOfDummyUtxosToCreate * dummyUtxoValue;
        vins = 0;
        vouts = numberOfDummyUtxosToCreate;
    } else {
        // hideDummyUtxoElements();
        minimumValueRequired = price + numberOfDummyUtxosToCreate * dummyUtxoValue;
        vins = 1;
        vouts = 2 + numberOfDummyUtxosToCreate;
    }

    try {
        this.paymentUtxos = await selectUtxos(
            this.payerUtxos,
            minimumValueRequired,
            vins,
            vouts,
            await recommendedFeeRate
        );
    } catch (e) {
        this.paymentUtxos = undefined;
        throw e;
    }
};
