import { CryptoTypes } from "@walletconnect/types";
import * as eccryptoJS from "eccrypto-js";
import * as encUtils from "enc-utils";

export function generateKeyPair(): CryptoTypes.KeyPair {
  const keyPairBuffer = eccryptoJS.generateKeyPair();
  return {
    privateKey: encUtils.bufferToHex(keyPairBuffer.privateKey),
    publicKey: encUtils.bufferToHex(eccryptoJS.compress(keyPairBuffer.publicKey)),
  };
}

export function generateRandomBytes32(): string {
  return encUtils.bufferToHex(eccryptoJS.randomBytes(32));
}

export function deriveSharedKey(privateKeyA: string, publicKeyB: string): string {
  return encUtils.bufferToHex(
    eccryptoJS.derive(
      encUtils.hexToBuffer(privateKeyA),
      eccryptoJS.decompress(encUtils.hexToBuffer(publicKeyB)),
    ),
  );
}

export async function sha256(msg: string): Promise<string> {
  return encUtils.bufferToHex(await eccryptoJS.sha256(encUtils.hexToBuffer(msg)));
}

async function getEciesKeys(sharedKeyHex: string, publicKeyHex: string) {
  const publicKey = encUtils.hexToBuffer(publicKeyHex);
  const hash = await eccryptoJS.sha512(encUtils.hexToBuffer(sharedKeyHex));
  const key = Buffer.from(hash.slice(eccryptoJS.LENGTH_0, eccryptoJS.KEY_LENGTH));
  const macKey = Buffer.from(hash.slice(eccryptoJS.KEY_LENGTH));
  return { publicKey, key, macKey };
}

export function encodeEncryptedMessage(encryptedBuffer: CryptoTypes.EncryptedBuffer): string {
  return (
    encUtils.bufferToHex(encryptedBuffer.iv) +
    encUtils.bufferToHex(encryptedBuffer.mac) +
    encUtils.bufferToHex(encryptedBuffer.data)
  );
}

export async function encrypt(params: CryptoTypes.EncryptParams): Promise<string> {
  const { publicKey, key, macKey } = await getEciesKeys(params.sharedKey, params.publicKey);
  const iv = params.iv
    ? encUtils.hexToBuffer(params.iv)
    : eccryptoJS.randomBytes(eccryptoJS.IV_LENGTH);
  const msg = encUtils.utf8ToBuffer(params.message);
  const data = await eccryptoJS.aesCbcEncrypt(iv, key, msg);
  const dataToMac = encUtils.concatBuffers(iv, publicKey, data);
  const mac = await eccryptoJS.hmacSha256Sign(macKey, dataToMac);
  return encodeEncryptedMessage({ iv, mac, data });
}

export function decodeEncryptedMessage(encrypted: string): CryptoTypes.EncryptedBuffer {
  const buffer = encUtils.hexToBuffer(encrypted);
  const slice0 = eccryptoJS.LENGTH_0;
  const slice1 = slice0 + eccryptoJS.IV_LENGTH;
  const slice2 = slice1 + eccryptoJS.KEY_LENGTH;
  return {
    iv: buffer.slice(slice0, slice1),
    mac: buffer.slice(slice1, slice2),
    data: buffer.slice(slice2),
  };
}

export async function decrypt(params: CryptoTypes.DecryptParams): Promise<string> {
  const { publicKey, key, macKey } = await getEciesKeys(params.sharedKey, params.publicKey);
  const { iv, mac, data } = decodeEncryptedMessage(params.encrypted);
  const dataToMac = encUtils.concatBuffers(iv, publicKey, data);
  const macTest = await eccryptoJS.hmacSha256Verify(macKey, dataToMac, mac);
  eccryptoJS.assert(macTest, eccryptoJS.ERROR_BAD_MAC);
  const msg = await eccryptoJS.aesCbcDecrypt(iv, key, data);
  return encUtils.bufferToUtf8(msg);
}
