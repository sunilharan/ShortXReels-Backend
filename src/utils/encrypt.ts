import jwt, { SignOptions } from 'jsonwebtoken';
import { config } from '../config/config';
import { AES, enc, mode, pad } from 'crypto-js';

export const generateToken = (
  data: any,
  expiresIn: string | number = config.jwtAccessExpire
): string => {
  return jwt.sign(data, config.jwtSecret, {
    expiresIn,
  } as SignOptions);
};

export const verifyToken = (token: string) => {
  try {
    return jwt.verify(token, config.jwtSecret);
  } catch {
    return {
      isExpired: true,
    };
  }
};

export const decryptData = (base64String: string) => {
  const key = enc.Utf8.parse(config.aesKey);
  const iv = enc.Utf8.parse(config.aesIv);
  const buff = enc.Base64.parse(base64String);
  const decipher = AES.decrypt({ ciphertext: buff } as any, key, {
    iv: iv,
    mode: mode.CBC,
    padding: pad.Pkcs7,
  });
  const decrypted = decipher.toString(enc.Utf8);
  return JSON.parse(decrypted);
};

export const encryptData = (jsonObject: unknown) => {
  const val = JSON.stringify(jsonObject);
  const key = enc.Utf8.parse(config.aesKey);
  const iv = enc.Utf8.parse(config.aesIv);
  const cipher = AES.encrypt(val, key, {
    iv: iv,
    mode: mode.CBC,
    padding: pad.Pkcs7,
  });
  return cipher.toString();
};
