import expressAsyncHandler from 'express-async-handler';
import { User } from '../models/user.model';
import { STATUS, GENDER, emailRegex, passwordRegex } from '../config/constants';

export const validateRegister = expressAsyncHandler(async (req, res, next) => {
  const { name, email, password, phone, gender, birthDate } = req.body;
  res.status(400);
  if (!name) {
    throw new Error('user_name_required');
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
  if (!birthDate) {
    throw new Error('birth_date_required');
  }
  if (gender && !Object.values(GENDER).includes(gender)) {
    throw new Error('gender_invalid');
  }
  if (!emailRegex.test(email)) {
    throw new Error('email_invalid');
  }
  if (!passwordRegex.test(password)) {
    throw new Error('password_invalid');
  }
  res.status(200);
  const nameExists = await User.findOne({
    name,
    $and: [{ status: { $ne: STATUS.deleted } }],
  }).exec();
  if (nameExists) {
    res.status(409);
    throw new Error('user_name_exist');
  }
  const emailExists = await User.findOne({
    email,
    $and: [{ status: { $ne: STATUS.deleted } }],
  }).exec();
  if (emailExists) {
    res.status(409);
    throw new Error('email_exist');
  }
  next();
});

export const validateUpdateUser = expressAsyncHandler(
  async (req:any, res, next) => {
    const userId = req.userId;
    const { name, email, phone, gender, birthDate } = req.body;
    res.status(400);
    if (gender && !Object.values(GENDER).includes(gender)) {
      throw new Error('gender_invalid');
    }
    if (email && !emailRegex.test(email)) {
      throw new Error('email_invalid');
    }
    const user = await User.findOne({
      email : email,
      $and: [{ _id: { $ne: userId }},{ status: { $ne: STATUS.deleted } }],
    })
    if(user){
      res.status(409);
      throw new Error('email_exist');
    }
    next();
  }
);
