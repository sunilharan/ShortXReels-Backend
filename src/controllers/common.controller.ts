import expressAsyncHandler from 'express-async-handler';
import { AES, enc, mode, pad } from 'crypto-js';
import { config } from '../config/config';
import { decryptData } from '../utils/encrypt';
export const getEncodeData = expressAsyncHandler(async (req: any, res) => {
  const key = enc.Utf8.parse(config.aesKey);
  const iv = enc.Utf8.parse(config.aesIv);
  const val = req.body.data;
  const cipher = AES.encrypt(val, key, {
    iv: iv,
    mode: mode.CBC,
    padding: pad.Pkcs7,
  });
  const buff = enc.Base64.parse(cipher.toString());
  const decipher = AES.decrypt({ ciphertext: buff } as any, key, {
    iv: iv,
    mode: mode.CBC,
    padding: pad.Pkcs7,
  });
  const decrypted = decipher.toString(enc.Utf8);
  res.status(200).send({
    status: true,
    data: {
      encData: cipher.toString(),
      decData: decrypted,
    },
    message: '',
  });
});
export const getDecodedData = expressAsyncHandler(async (req, res) => {
  try {
    const { data } = req.body;
    res.status(200).send({
      status: true,
      data: decryptData(data),
      message: '',
    });
  } catch (error: any) {
    res.status(400);
    throw new Error(error.message);
  }
});
