import expressAsyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import { AES, enc, mode, pad } from 'crypto-js';
import { config } from '../config/config';
import { decryptData } from '../utils/encrypt';
import { Role } from '../models/role.model';

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
    success: true,
    data: {
      encData: cipher.toString(),
      decData: decrypted,
    },
    message: '',
  });
});

export const getDecodedData = expressAsyncHandler(async (req: any, res) => {
  try {
    const { data } = req.body;
    res.status(200).send({
      success: true,
      data: decryptData(data),
      message: '',
    });
  } catch (error: any) {
    throw error;
  }
});

export const getRoles = expressAsyncHandler(async (req: any, res) => {
  try {
    const roles = await Role.find();
    res.status(200).send({
      success: true,
      data: roles,
    });
  } catch (error: any) {
    throw error;
  }
});

export const checkHealth = expressAsyncHandler(async (req: any, res) => {
  const mongoState = mongoose.connection.readyState;
  const mongoStates = [
    'disconnected',
    'connected',
    'connecting',
    'disconnecting',
  ];
  const isHealthy = mongoState === 1;
  const success = isHealthy ? true : false;
  const status = isHealthy ? 200 : 503;
  res.status(status).json({
    success,
    server: {
      status: 'running',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    },
    database: {
      type: 'MongoDB',
      status: mongoStates[mongoState],
    },
  });
});
