import crypto from 'crypto';
import { Otp } from '../models/otp.model';
import { config } from '../config/config';
import moment from 'moment';
export const generateOTP = async () => {
  let otp;
  let isUnique = false;
  let expiresAt;
  while (!isUnique) {
    otp = crypto.randomInt(100000, 999999);
    const checkOTP = await Otp.findOne({ otp });
    if (!checkOTP) {
      isUnique = true;
      expiresAt = moment()
        .add(parseInt(config.otpExpire || '10'), 'minutes')
        .toDate();
    }
  }
  return { otp, expiresAt };
};
