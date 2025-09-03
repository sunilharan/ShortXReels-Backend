import expressAsyncHandler from 'express-async-handler';
import { User } from '../models/user.model';
import { STATUS_TYPE, GENDER_TYPE } from '../config/enums';
import {
  nameRegex,
  emailRegex,
  passwordRegex,
  UserRole,
} from '../config/constants';
import { decryptData } from '../utils/encrypt';

export const validateRegister = expressAsyncHandler(async (req, res, next) => {
  try {
    const { name, email, password, phone, gender, displayName } = req.body;
    res.status(400);
    if (!name) {
      throw new Error('name_required');
    }
    if (!email) {
      throw new Error('email_required');
    }
    if (!password) {
      throw new Error('password_required');
    }
    if (!phone) {
      throw new Error('phone_required');
    }
    if (!gender) {
      throw new Error('gender_required');
    }
    if (!displayName.trim()) {
      throw new Error('display_name_required');
    }
    if (gender && !Object.values(GENDER_TYPE).includes(gender)) {
      throw new Error('gender_invalid');
    }
    if (!nameRegex.test(name)) {
      throw new Error('name_invalid');
    }
    if (!emailRegex.test(email)) {
      throw new Error('email_invalid');
    }
    let newPassword = decryptData(password);
    newPassword = newPassword?.password.split('-');
    if (newPassword?.length > 1) {
      newPassword = newPassword[1];
    }
    if (!newPassword) {
      throw new Error('password_required');
    }
    if (!passwordRegex.test(newPassword)) {
      throw new Error('password_invalid');
    }
    const emailExists = await User.findOne({
      $or: [
        { email: { $regex: `^${email}$`, $options: 'i' } },
        { name: email },
      ],
      $and: [{ status: { $ne: STATUS_TYPE.deleted } }],
    }).exec();
    if (emailExists) {
      res.status(409);
      throw new Error('email_exist');
    }
    const nameExists = await User.findOne({
      $or: [{ name: name }, { email: { $regex: `^${name}$`, $options: 'i' } }],
      $and: [{ status: { $ne: STATUS_TYPE.deleted } }],
    }).exec();
    if (nameExists) {
      res.status(409);
      throw new Error('name_exist');
    }
    next();
  } catch (error) {
    throw error;
  }
});

export const validateUpdateUser = expressAsyncHandler(
  async (req: any, res, next) => {
    try {
      let userId = req.user.id;
      const { gender, interests, displayName, name } = req.body;
      if (req.body.id && req.role === UserRole.SuperAdmin) {
        userId = req.body.id;
      }
      if (gender && !Object.values(GENDER_TYPE).includes(gender)) {
        res.status(400);
        throw new Error('gender_invalid');
      }
      if (interests) {
        const parsed = JSON.parse(interests);
        if (!Array.isArray(parsed) || parsed.length === 0) {
          res.status(400);
          throw new Error('interests_invalid');
        }
      }

      if (displayName && !displayName.trim()) {
        res.status(400);
        throw new Error('display_name_invalid');
      }
      if (name) {
        if (!nameRegex.test(name)) {
          res.status(400);
          throw new Error('name_invalid');
        }
        const nameExists = await User.findOne({
          $or: [
            { name: name },
            { email: { $regex: `^${name}$`, $options: 'i' } },
          ],
          _id: { $ne: userId },
          status: { $ne: STATUS_TYPE.deleted },
        }).exec();
        if (nameExists) {
          res.status(409);
          throw new Error('name_exist');
        }
      }
      next();
    } catch (error) {
      throw error;
    }
  }
);
