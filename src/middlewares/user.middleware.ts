import expressAsyncHandler from 'express-async-handler';
import { User } from '../models/user.model';
import { STATUS_TYPE, GENDER_TYPE, emailRegex, passwordRegex } from '../config/constants';
import { decryptData } from '../utils/encrypt';
import { Role } from '../models/role.model';

export const validateRegister = expressAsyncHandler(async (req, res, next) => {
  const { name, email, password, phone, gender, roleId ,displayName} = req.body;
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
  if (!displayName) {
    throw new Error('display_name_required');
  }
  if (gender && !Object.values(GENDER_TYPE).includes(gender)) {
    throw new Error('gender_invalid');
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
    res.status(400);
    throw new Error('password_required');
  }
  if (!passwordRegex.test(newPassword)) {
    throw new Error('password_invalid');
  }
  if (roleId) {
    const roleExists = await Role.findById(roleId).exec();
    if (!roleExists) {
      res.status(404);
      throw new Error('role_not_found');
    }
  }
  const emailExists = await User.findOne({
    email : {$regex : email, $options: 'i'},
    $and: [{ status: { $ne: STATUS_TYPE.deleted } }],
  }).exec();
  if (emailExists) {
    res.status(409);
    throw new Error('email_exist');
  }
  const nameExists = await User.findOne({
    name,
    $and: [{ status: { $ne: STATUS_TYPE.deleted } }],
  }).exec();
  if (nameExists) {
    res.status(409);
    throw new Error('name_exist');
  }
  res.status(200);
  next();
});

export const validateUpdateUser = expressAsyncHandler(
  async (req: any, res, next) => {
    const userId = req.user.id;
    const {  gender, interests, displayName, name } = req.body;
    res.status(400);
    if (gender && !Object.values(GENDER_TYPE).includes(gender)) {
      throw new Error('gender_invalid');
    }
    if (interests) {
      if (typeof interests === 'string' && JSON.parse(interests).length <= 0) {
        throw new Error('interests_invalid');
      }
    }
    if (displayName) {
      if (typeof displayName !== 'string' || displayName.trim().length === 0) {
        throw new Error('display_name_invalid');
      }
    }
    const nameExists = await User.findOne({
      name,
      $and: [{ _id: { $ne: userId } }, { status: { $ne: STATUS_TYPE.deleted } }],
    }).exec();
    if (nameExists) {
      res.status(409);
      throw new Error('name_exist');
    }
    next();
  }
);
