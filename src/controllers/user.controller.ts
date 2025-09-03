import expressAsyncHandler from 'express-async-handler';
import { t } from 'i18next';
import mongoose from 'mongoose';
import { User } from '../models/user.model';
import { decryptData, generateToken, verifyToken } from '../utils/encrypt';
import { Role, IRole } from '../models/role.model';
import {
  UserRole,
  emailRegex,
  nameRegex,
  passwordRegex,
  removeFile,
} from '../config/constants';
import { STATUS_TYPE, SAVE_TYPE } from '../config/enums';
import { Otp } from '../models/otp.model';
import crypto from 'crypto';
// import { sendMail } from '../utils/sendMail';
import { ICategory } from '../models/category.model';
import { config } from '../config/config';
import { Reel } from '../models/reel.model';
import { countActiveReelsWithActiveUsers, fetchReels } from './reel.controller';
import { rename } from 'fs';
import { parseISO, isValid, startOfDay, endOfDay } from 'date-fns';

export const register = expressAsyncHandler(async (req: any, res) => {
  try {
    const {
      name,
      email,
      password,
      phone,
      gender,
      birthDate,
      displayName,
      description,
    } = req.body;
    const role = await Role.findOne({ name: UserRole.User }).exec();
    if (!role) {
      res.status(400);
      throw new Error('role_not_found');
    }
    let newPassword = decryptData(password);
    newPassword = newPassword?.password?.split('-');
    if (newPassword?.length > 1) {
      newPassword = newPassword[1];
    }
    let createData: any = {
      name,
      displayName,
      email,
      password: newPassword,
      phone,
      gender,
      birthDate,
      role: role?.id,
    };
    if (description) {
      createData.description = description;
    }
    let user = await User.create(createData);
    if (!user) {
      res.status(400);
      throw new Error('user_register_failed');
    }
    user = await user.populate(['role', 'interests']);
    const roleName =
      typeof user.role === 'object' && user.role !== null && 'name' in user.role
        ? (user.role as IRole).name
        : '';
    const accessToken = generateToken(
      { id: user.id, role: roleName },
      config.jwtAccessExpire
    );
    const refreshToken = generateToken(
      {
        id: user.id,
        token: accessToken,
      },
      config.jwtRefreshExpire
    );
    await User.findByIdAndUpdate(user.id, {
      $push: { token: accessToken },
    }).exec();
    res.status(201).json({
      success: true,
      data: { ...user?.toJSON(), accessToken, refreshToken },
    });
  } catch (error) {
    throw error;
  }
});

export const nameExist = expressAsyncHandler(async (req: any, res) => {
  try {
    const { name } = req.body;
    if (!name || !nameRegex.test(name)) {
      res.status(400);
      throw new Error('name_invalid');
    }
    let user = await User.findOne({
      $or: [{ name: name }, { email: { $regex: `^${name}$`, $options: 'i' } }],
      status: { $ne: STATUS_TYPE.deleted },
    }).exec();
    res.status(200).send({
      success: true,
      data: !!user,
    });
  } catch (error) {
    throw error;
  }
});

export const login = expressAsyncHandler(async (req: any, res) => {
  try {
    const { userName, password } = req.body;
    if (!userName) {
      res.status(400);
      throw new Error('username_required');
    }
    if (!password) {
      res.status(400);
      throw new Error('password_required');
    }
    const user = await User.findOne({
      $or: [{ email: userName }, { name: userName }],
      status: STATUS_TYPE.active,
    })
      .populate<{ role: IRole }>('role')
      .populate<{ interests: ICategory }>('interests', 'name image')
      .exec();
    if (!user) {
      res.status(400);
      throw new Error('invalid_username_or_password');
    }
    if (user.role.name !== UserRole.User) {
      res.status(403);
      throw new Error('forbidden');
    }
    let newPassword = decryptData(password);
    newPassword = newPassword?.password?.split('-');
    if (newPassword?.length > 1) {
      newPassword = newPassword[1];
    }
    const isMatch = user && (await user.matchPassword(newPassword));
    if (!isMatch) {
      res.status(400);
      throw new Error('invalid_username_or_password');
    }
    const accessToken = generateToken(
      { id: user.id, role: user.role.name },
      config.jwtAccessExpire
    );
    const refreshToken = generateToken(
      {
        id: user.id,
        token: accessToken,
      },
      config.jwtRefreshExpire
    );
    await User.findByIdAndUpdate(user.id, {
      $push: { token: accessToken },
      updatedBy: user.id,
      updatedAt: new Date().toISOString(),
    }).exec();
    res.status(200).json({
      success: true,
      data: {
        ...user?.toJSON(),
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    throw error;
  }
});

export const adminLogin = expressAsyncHandler(async (req: any, res) => {
  try {
    const { userName, password } = req.body;
    if (!userName) {
      res.status(400);
      throw new Error('username_required');
    }
    if (!password) {
      res.status(400);
      throw new Error('password_required');
    }
    const user = await User.findOne({
      $or: [{ email: userName }, { name: userName }],
      status: STATUS_TYPE.active,
    })
      .populate<{ role: IRole }>('role')
      .populate<{ interests: ICategory }>('interests', 'name image')
      .exec();
    if (!user) {
      res.status(400);
      throw new Error('invalid_username_or_password');
    }
    if (!password) {
      res.status(400);
      throw new Error('password_required');
    }
    let newPassword = decryptData(password);
    newPassword = newPassword?.password?.split('-');
    if (newPassword?.length > 1) {
      newPassword = newPassword[1];
    }
    const isMatch = user && (await user.matchPassword(newPassword));
    if (!isMatch) {
      res.status(400);
      throw new Error('invalid_username_or_password');
    }
    if (
      user.role.name !== UserRole.Admin &&
      user.role.name !== UserRole.SuperAdmin
    ) {
      res.status(400);
      throw new Error('invalid_username_or_password');
    }
    const accessToken = generateToken(
      { id: user.id, role: user.role.name },
      config.jwtAccessExpire
    );
    const refreshToken = generateToken(
      {
        id: user.id,
        token: accessToken,
      },
      config.jwtRefreshExpire
    );
    await User.findByIdAndUpdate(user.id, {
      $push: { token: accessToken },
      updatedBy: user.id,
      updatedAt: new Date().toISOString(),
    }).exec();
    res.status(200).json({
      success: true,
      data: {
        ...user?.toJSON(),
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    throw error;
  }
});

export const refreshToken = expressAsyncHandler(async (req: any, res) => {
  try {
    const { refreshToken: token } = req.body;
    if (!token) {
      res.status(401);
      throw new Error('refresh_token_required');
    }
    const decoded: any = verifyToken(token);
    if (!decoded) {
      res.status(401);
      throw new Error('refresh_token_invalid');
    }
    const user = await User.findOne({
      _id: decoded?.id,
      token: { $in: [decoded?.token] },
      status: STATUS_TYPE.active,
    })
      .populate<{ role: IRole }>('role')
      .exec();
    if (!user) {
      res.status(401);
      throw new Error('refresh_token_invalid');
    }
    const accessToken = generateToken(
      { id: user.id, role: user.role.name },
      config.jwtAccessExpire
    );
    const refreshToken = generateToken(
      {
        id: user.id,
        token: accessToken,
      },
      config.jwtRefreshExpire
    );
    await User.findByIdAndUpdate(user.id, {
      $push: { token: accessToken },
      updatedBy: user.id,
      updatedAt: new Date().toISOString(),
    }).exec();
    await User.findByIdAndUpdate(user.id, {
      $pull: { token: decoded?.token },
      updatedBy: user.id,
      updatedAt: new Date().toISOString(),
    }).exec();
    res.status(200).json({
      success: true,
      data: {
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    throw error;
  }
});

export const sendOtp = expressAsyncHandler(async (req: any, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      res.status(400);
      throw new Error('email_required');
    }
    const user = await User.findOne({
      email,
      status: STATUS_TYPE.active,
    }).exec();
    if (!user) {
      res.status(400);
      throw new Error('email_does_not_exist');
    }
    const otpData = crypto.randomInt(1000, 10000);
    await Otp.findOneAndDelete({ userId: user.id }).exec();
    const otp = await Otp.create({ userId: user.id, otp: otpData });
    // await sendMail(user.email, 'your_otp_code', otpData?.otp?.toString() || '');
    res.status(200).json({
      success: true,
      data: otp?.otp,
      message: t('otp_sent_to_email'),
    });
  } catch (error) {
    throw error;
  }
});

export const verifyOtp = expressAsyncHandler(async (req: any, res) => {
  try {
    const { email, otp } = req.body;
    if (!email) {
      res.status(400);
      throw new Error('email_required');
    }
    if (!otp) {
      res.status(400);
      throw new Error('otp_required');
    }
    const user = await User.findOne({
      email,
      status: STATUS_TYPE.active,
    })
      .populate('role')
      .exec();
    if (!user) {
      res.status(404);
      throw new Error('email_does_not_exist');
    }
    const otpData = await Otp.findOne({ userId: user.id, otp }).exec();
    if (!otpData) {
      res.status(400);
      throw new Error('otp_invalid');
    }
    const token = generateToken({ id: user.id }, config.jwtOtpExpire);
    res.status(200).json({
      success: true,
      data: token,
      message: t('otp_verified'),
    });
  } catch (error) {
    throw error;
  }
});

export const resetPassword = expressAsyncHandler(async (req: any, res) => {
  try {
    const { token, password } = req.body;
    if (!token) {
      res.status(400);
      throw new Error('invalid_token');
    }
    if (!password) {
      res.status(400);
      throw new Error('password_required');
    }
    const decoded: any = verifyToken(token);
    if (!decoded) {
      res.status(400).json({
        success: true,
        isExpired: true,
      });
    } else {
      const user = await User.findOne({
        _id: decoded?.id,
        status: STATUS_TYPE.active,
      }).exec();
      if (!user) {
        res.status(400);
        throw new Error('invalid_email_or_token');
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
      const same = await user.matchPassword(newPassword);
      if (same) {
        res.status(400);
        throw new Error('password_same');
      }
      await User.findByIdAndUpdate(user.id, {
        password: newPassword,
        updatedBy: user.id,
        updatedAt: new Date().toISOString(),
      }).exec();
      await Otp.deleteMany({ userId: user.id });
      res.status(200).json({
        success: true,
        isExpired: false,
        message: t('password_changed'),
      });
    }
  } catch (error) {
    throw error;
  }
});

export const currentUser = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId)
      .populate<{ role: IRole }>('role')
      .populate<{ interests: ICategory }>('interests', 'name image')
      .exec();
    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    throw error;
  }
});

export const logout = expressAsyncHandler(async (req: any, res) => {
  try {
    const token = req.headers.authorization.split(' ')[1];
    const decoded: any = verifyToken(token);
    if (decoded?.id) {
      await User.findByIdAndUpdate(decoded?.id, {
        $pull: { token: token },
        updatedBy: decoded?.id,
        updatedAt: new Date().toISOString(),
      })
        .populate<{ role: IRole }>('role')
        .exec();
    }
    res.status(200).json({
      success: true,
      message: t('user_logged_out'),
    });
  } catch (error) {
    throw error;
  }
});

export const deleteAccountWithoutReason = expressAsyncHandler(
  async (req: any, res) => {
    try {
      const userId = req.user.id;
      await User.findByIdAndUpdate(userId, {
        status: STATUS_TYPE.deleted,
        $unset: { token: '' },
        updatedBy: userId,
        updatedAt: new Date().toISOString(),
      }).exec();
      res.status(200).json({
        success: true,
        message: t('user_deleted'),
      });
    } catch (error) {
      throw error;
    }
  }
);

export const deleteAccountWithReason = expressAsyncHandler(
  async (req: any, res) => {
    try {
      const userId = req.user.id;
      const deleteReason = req.body.deleteReason || '';
      await User.findByIdAndUpdate(userId, {
        status: STATUS_TYPE.deleted,
        $unset: { token: '' },
        deleteReason,
        updatedBy: userId,
        updatedAt: new Date().toISOString(),
      }).exec();
      res.status(200).json({
        success: true,
        message: t('user_deleted'),
      });
    } catch (error) {
      throw error;
    }
  }
);

export const updateUser = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = req.user.id;
    const userData = req.body;
    const profile = req.files?.profile?.[0];
    const updateData: any = {};

    if (userData.name) updateData.name = userData.name;
    if (userData.phone) updateData.phone = userData.phone;
    if (userData.gender) updateData.gender = userData.gender;
    if (userData.birthDate) updateData.birthDate = userData.birthDate;
    if (userData.description) updateData.description = userData.description;
    if (userData.displayName) updateData.displayName = userData.displayName;
    if (userData.notification) {
      updateData.notification = JSON.parse(userData.notification);
    }
    if (userData.interests) {
      updateData.interests = JSON.parse(userData.interests).map(
        (id: string) => new mongoose.Types.ObjectId(String(id))
      );
    }

    if (profile) {
      const destPath = `files/profiles/${profile.filename}`;
      await new Promise<void>((resolve, reject) => {
        rename(profile.path, destPath, (err) => {
          if (err) return reject(new Error('profile_upload_failed'));
          updateData.profile = profile.filename;
          resolve();
        });
      });
      if (userData.oldProfile) {
        removeFile(userData.oldProfile, 'files/profiles');
      }
    }
    updateData.updatedBy = userId;
    updateData.updatedAt = new Date().toISOString();
    const user = await User.findByIdAndUpdate(userId, updateData, { new: true })
      .populate([
        { path: 'role', select: 'name' },
        { path: 'interests', select: 'name image' },
      ])
      .exec();

    res.status(200).json({ success: true, data: user });
  } catch (error) {
    throw error;
  }
});

export const changePassword = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = req.user.id;
    let password = req.body.password;

    if (!password) {
      res.status(400);
      throw new Error('password_required');
    }

    password = decryptData(password);
    const newPassword = password?.password;
    const oldPassword = password?.oldPassword;

    if (!newPassword) {
      res.status(400);
      throw new Error('password_required');
    }
    if (!oldPassword) {
      res.status(400);
      throw new Error('old_password_required');
    }

    const user = await User.findOne({
      _id: userId,
      status: STATUS_TYPE.active,
    }).exec();

    if (!user) {
      res.status(400);
      throw new Error('access_token_invalid');
    }
    const isMatch = await user.matchPassword(oldPassword);
    if (!isMatch) {
      res.status(400);
      throw new Error('password_not_match');
    }
    const same = await user.matchPassword(newPassword);
    if (same) {
      res.status(400);
      throw new Error('password_same');
    }
    await User.findByIdAndUpdate(userId, {
      password: newPassword,
      updatedBy: userId,
      updatedAt: new Date().toISOString(),
    }).exec();
    res.status(200).json({
      success: true,
      message: t('password_changed'),
    });
  } catch (error) {
    throw error;
  }
});

export const adminRegister = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { name, email, password, phone, gender, birthDate, displayName } =
      req.body;
    const profile = req.files?.profile?.[0];
    let newPassword = decryptData(password);
    newPassword = newPassword?.password?.split('-');
    if (newPassword?.length > 1) {
      newPassword = newPassword[1];
    }
    const role = await Role.findOne({ name: UserRole.Admin }).exec();
    let userData: any = {};
    if (name) {
      userData.name = name;
    }
    if (email) {
      userData.email = email;
    }
    if (password) {
      userData.password = newPassword;
    }
    if (phone) {
      userData.phone = phone;
    }
    if (gender) {
      userData.gender = gender;
    }
    if (displayName) {
      userData.displayName = displayName;
    }
    if (birthDate) {
      userData.birthDate = birthDate;
    }
    if (profile) {
      const destPath = `files/profiles/${profile.filename}`;
      await new Promise<void>((resolve, reject) => {
        rename(profile.path, destPath, (err) => {
          if (err) return reject(new Error('profile_upload_failed'));
          userData.profile = profile.filename;
          resolve();
        });
      });
    }
    let user = await User.create({
      ...userData,
      role: role?.id,
      createdBy: userId,
      updatedBy: userId,
      updatedAt: new Date().toISOString(),
    });
    if (!user) {
      res.status(400);
      throw new Error('user_register_failed');
    }
    user = await user.populate([
      { path: 'role', select: 'name' },
      { path: 'interests', select: 'name image' },
    ]);
    res.status(201).json({
      success: true,
      data: user,
    });
  } catch (error) {
    throw error;
  }
});

export const adminEdit = expressAsyncHandler(async (req: any, res) => {
  try {
    const userData = req.body;
    const userId = req.body.id;
    const profile = req.files?.profile?.[0];
    if (!userId) {
      res.status(400);
      throw new Error('invalid_request');
    }
    const updateData: any = {};
    if (userData.name) updateData.name = userData.name;
    if (userData.phone) updateData.phone = userData.phone;
    if (userData.gender) updateData.gender = userData.gender;
    if (userData.birthDate) updateData.birthDate = userData.birthDate;
    if (userData.displayName) updateData.displayName = userData.displayName;
    if (userData.password) {
      let newPassword = decryptData(userData.password);
      newPassword = newPassword?.password?.split('-');
      if (newPassword?.length > 1) {
        newPassword = newPassword[1];
      }
      updateData.password = newPassword;
    }
    if (profile) {
      const destPath = `files/profiles/${profile.filename}`;
      await new Promise<void>((resolve, reject) => {
        rename(profile.path, destPath, (err) => {
          if (err) return reject(new Error('profile_upload_failed'));
          updateData.profile = profile.filename;
          resolve();
        });
      });
    }
    if (userData.oldProfile) {
      removeFile(userData.oldProfile, 'files/profiles');
    }

    let user = await User.findByIdAndUpdate(
      userId,
      { ...updateData, updatedBy: userId, updatedAt: new Date().toISOString() },
      { new: true }
    ).exec();
    if (!user) {
      res.status(400);
      throw new Error('invalid_request');
    }
    user = await user.populate([
      { path: 'role', select: 'name' },
      { path: 'interests', select: 'name image' },
    ]);
    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    throw error;
  }
});

export const adminDelete = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    if (!id) {
      res.status(400);
      throw new Error('invalid_request');
    }
    let user = await User.findByIdAndUpdate(
      id,
      {
        status: STATUS_TYPE.deleted,
        updatedBy: userId,
        updatedAt: new Date().toISOString(),
      },
      { new: true }
    ).exec();
    if (!user) {
      res.status(400);
      throw new Error('invalid_request');
    }
    res.status(200).json({
      success: true,
      message: t('user_deleted'),
    });
  } catch (error) {
    throw error;
  }
});

const getUsersByRole = async (req: any, res: any, roleName: string) => {
  const id = req.query.id;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  const status = req.query.status;
  const search = (
    typeof req?.query?.search === 'string' ? req?.query?.search : ''
  ).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const matchQuery: any = {};
  const role = await Role.findOne({ name: roleName }).exec();
  if (!role) {
    res.status(400);
    throw new Error('invalid_request');
  }
  matchQuery.role = role?.id;

  if (status) {
    matchQuery.status = status;
  }
  if (id) {
    matchQuery._id = new mongoose.Types.ObjectId(String(id));
  }
  if (search) {
    matchQuery.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } },
      { displayName: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
    ];
  }

  const users = await User.find(matchQuery)
    .skip(skip)
    .limit(limit)
    .sort({ createdAt: -1 })
    .populate('role')
    .select('-interests')
    .exec();

  const total = await User.countDocuments(matchQuery).exec();

  res.status(200).json({
    success: true,
    data: {
      users,
      totalRecords: total,
      totalPages: Math.ceil(total / limit),
    },
  });
};

export const adminGetAppUsers = expressAsyncHandler(async (req: any, res) => {
  try {
    return getUsersByRole(req, res, UserRole.User);
  } catch (error) {
    throw error;
  }
});

export const adminGetAdminUsers = expressAsyncHandler(async (req: any, res) => {
  try {
    return getUsersByRole(req, res, UserRole.Admin);
  } catch (error) {
    throw error;
  }
});

export const saveUnsaveReel = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = req.user.id;
    const savedReels = req.user.savedReels;
    const { reelId, action } = req.body;
    if (!reelId) {
      res.status(400);
      throw new Error('invalid_request');
    }
    let reel = await Reel.findById(reelId).exec();
    if (!reel) {
      res.status(404);
      throw new Error('reel_not_found');
    }
    const alreadySaved = savedReels.some((id: any) => id.toString() === reelId);
    if (action === SAVE_TYPE.save && !alreadySaved) {
      await User.findByIdAndUpdate(
        userId,
        {
          $addToSet: {
            savedReels: new mongoose.Types.ObjectId(String(reelId)),
          },
          updatedBy: userId,
          updatedAt: new Date().toISOString(),
        },
        { new: true }
      ).exec();
    } else if (action === SAVE_TYPE.unsave && alreadySaved) {
      await User.findByIdAndUpdate(
        userId,
        {
          $pull: { savedReels: new mongoose.Types.ObjectId(String(reelId)) },
          updatedBy: userId,
          updatedAt: new Date().toISOString(),
        },
        { new: true }
      ).exec();
    }
    res.status(200).json({
      success: true,
      message: t('save_unsave_reel'),
    });
  } catch (error) {
    throw error;
  }
});

export const getSavedReels = expressAsyncHandler(async (req: any, res) => {
  try {
    const user = req.user;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const matchQuery = {
      _id: { $in: user.savedReels },
      status: STATUS_TYPE.active,
    };
    const reels = await fetchReels(
      user.id,
      matchQuery,
      { skip, limit },
      user.savedReels
    );
    const totalRecords = await countActiveReelsWithActiveUsers(matchQuery);
    const totalPages = Math.ceil(totalRecords / limit);
    res.status(200).json({
      success: true,
      data: {
        reels,
        totalRecords,
        totalPages,
      },
    });
  } catch (error) {
    throw error;
  }
});

export const adminRemoveProfilePicture = expressAsyncHandler(
  async (req: any, res) => {
    try {
      const userId = req.user.id;
      const removeUserId = req.params.id;
      const role = req.role;

      const user = await User.findById(removeUserId)
        .populate<{ role: IRole }>('role')
        .exec();
      if (!user) {
        res.status(404);
        throw new Error('user_not_found');
      }
      if (
        userId !== removeUserId &&
        role === UserRole.Admin &&
        user.role.name !== UserRole.User
      ) {
        res.status(403);
        throw new Error('forbidden');
      }
      if (user.profile) {
        await removeFile(user.profile, 'files/profiles');
      }
      await User.findByIdAndUpdate(removeUserId, {
        $unset: { profile: '' },
        updatedBy: userId,
        updatedAt: new Date().toISOString(),
      }).exec();
      res.status(200).json({
        success: true,
        message: t('profile_removed'),
      });
    } catch (error) {
      throw error;
    }
  }
);

export const statusChange = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { id, status } = req.body;
    const role = req.role;

    const allowedStatuses = Object.values(STATUS_TYPE);
    if (!id || !status || !allowedStatuses.includes(status)) {
      res.status(400);
      throw new Error('invalid_request');
    }

    const user = await User.findById(id)
      .populate<{ role: IRole }>('role')
      .exec();
    if (!user) {
      res.status(404);
      throw new Error('user_not_found');
    }
    if (role === UserRole.Admin && user.role.name !== UserRole.User) {
      res.status(403);
      throw new Error('forbidden');
    }
    await User.findByIdAndUpdate(id, {
      status,
      updatedBy: userId,
      updatedAt: new Date().toISOString(),
    }).exec();
    res.status(200).json({
      success: true,
      message: t('status_changed'),
    });
  } catch (error) {
    throw error;
  }
});

export const blockUnblockUser = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { id, isBlocked } = req.body;
    if (!id || typeof isBlocked !== 'boolean') {
      res.status(400);
      throw new Error('invalid_request');
    }
    const user = await User.findById(id)
      .populate<{ role: IRole }>('role')
      .exec();
    if (!user) {
      res.status(404);
      throw new Error('user_not_found');
    }
    if (user.role.name !== UserRole.User) {
      res.status(403);
      throw new Error('forbidden');
    }

    if (Boolean(isBlocked) === true) {
      if (user.status === STATUS_TYPE.blocked) {
        res.status(409);
        throw new Error('data_already_blocked');
      }
      await User.findByIdAndUpdate(id, {
        status: STATUS_TYPE.blocked,
        updatedBy: userId,
        updatedAt: new Date().toISOString(),
      }).exec();
    } else if (Boolean(isBlocked) === false) {
      if (user.status !== STATUS_TYPE.blocked) {
        res.status(409);
        throw new Error('data_not_blocked');
      }
      await User.findByIdAndUpdate(id, {
        status: STATUS_TYPE.active,
        updatedBy: userId,
        updatedAt: new Date().toISOString(),
      }).exec();
    }
    res.status(200).json({
      success: true,
      message: t(Boolean(isBlocked) ? 'data_blocked' : 'data_unblocked'),
    });
  } catch (error) {
    throw error;
  }
});

export const deleteUser = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    if (!id) {
      res.status(400);
      throw new Error('invalid_request');
    }
    const user = await User.findById(id)
      .populate<{ role: IRole }>('role')
      .exec();
    if (!user) {
      res.status(404);
      throw new Error('user_not_found');
    }
    if (user.role.name !== UserRole.User) {
      res.status(403);
      throw new Error('forbidden');
    }
    await User.findByIdAndUpdate(
      id,
      {
        status: STATUS_TYPE.deleted,
        updatedBy: userId,
        updatedAt: new Date().toISOString(),
      },
      { new: true }
    )
      .populate<{ role: IRole }>('role')
      .exec();
    res.status(200).json({
      success: true,
      message: t('user_deleted'),
    });
  } catch (error) {
    throw error;
  }
});

export const topUsersAggregation = (): any[] => {
  const userAggregation: any[] = [
    {
      $match: {
        status: STATUS_TYPE.active,
      },
    },
    {
      $lookup: {
        from: 'comments',
        let: { reelId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$reel', '$$reelId'] },
                  { $eq: ['$status', STATUS_TYPE.active] },
                ],
              },
            },
          },
          {
            $lookup: {
              from: 'users',
              localField: 'commentedBy',
              foreignField: '_id',
              as: 'commentedByUser',
            },
          },
          { $unwind: '$commentedByUser' },
          {
            $match: { 'commentedByUser.status': STATUS_TYPE.active },
          },
          { $count: 'count' },
        ],
        as: 'commentStats',
      },
    },
    {
      $group: {
        _id: '$createdBy',
        totalReels: { $sum: 1 },
        totalComments: {
          $sum: {
            $cond: {
              if: { $gt: [{ $size: '$commentStats' }, 0] },
              then: { $arrayElemAt: ['$commentStats.count', 0] },
              else: 0,
            },
          },
        },
        totalViews: { $sum: { $size: '$viewedBy' } },
        totalLikes: { $sum: { $size: '$likedBy' } },
      },
    },
    {
      $addFields: {
        engagementScore: {
          $cond: {
            if: { $eq: ['$totalViews', 0] },
            then: 0,
            else: {
              $divide: [
                { $sum: ['$totalComments', '$totalLikes'] },
                '$totalViews',
              ],
            },
          },
        },
        rankingScore: {
          $sum: [
            {
              $multiply: [
                {
                  $cond: {
                    if: { $eq: ['$totalViews', 0] },
                    then: 0,
                    else: '$totalViews',
                  },
                },
                0.5,
              ],
            },
            {
              $multiply: [
                {
                  $cond: {
                    if: { $eq: ['$totalLikes', 0] },
                    then: 0,
                    else: '$totalLikes',
                  },
                },
                2,
              ],
            },
            {
              $multiply: [
                {
                  $cond: {
                    if: { $eq: ['$totalReels', 0] },
                    then: 0,
                    else: '$totalReels',
                  },
                },
                3,
              ],
            },
          ],
        },
      },
    },
    {
      $sort: {
        // rankingScore: -1,
        // engagementScore: -1,
        totalLikes: -1,
        totalViews: -1,
        totalComments: -1,
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'user',
      },
    },
    {
      $unwind: '$user',
    },
    {
      $lookup: {
        from: 'roles',
        localField: 'user.role',
        foreignField: '_id',
        as: 'role',
      },
    },
    {
      $unwind: '$role',
    },
    {
      $match: {
        'role.name': { $eq: UserRole.User },
      },
    },
    {
      $project: {
        _id: 0,
        id: '$user._id',
        name: '$user.name',
        displayName: '$user.displayName',
        totalReels: '$totalReels',
        totalViews: '$totalViews',
        totalLikes: '$totalLikes',
        totalComments: '$totalComments',
        rankingScore: '$rankingScore',
        engagementScore: '$engagementScore',
        profile: {
          $cond: {
            if: { $not: ['$user.profile'] },
            then: '$$REMOVE',
            else: {
              $concat: [config.host + '/profile/', '$user.profile'],
            },
          },
        },
      },
    },
  ];
  return userAggregation;
};

export const topUsers = expressAsyncHandler(async (req: any, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const startDate = req.query.startDate
      ? parseISO(req.query.startDate)
      : null;
    const endDate = req.query.endDate ? parseISO(req.query.endDate) : null;
    const matchQuery: any = {};
    const isStartValid = startDate && isValid(startDate);
    const isEndValid = endDate && isValid(endDate);

    if (isStartValid && isEndValid) {
      matchQuery.createdAt = { $gte: startDate, $lte: endDate };
    } else if (isStartValid) {
      matchQuery.createdAt = {
        $gte: startOfDay(startDate),
        $lte: endOfDay(startDate),
      };
    }
    const aggregation = topUsersAggregation();
    const reelAgg = await Reel.aggregate([
      {
        $match: matchQuery,
      },
      ...aggregation,
      {
        $facet: {
          users: [
            {
              $skip: skip,
            },
            {
              $limit: limit,
            },
          ],
          pagination: [
            {
              $count: 'count',
            },
          ],
        },
      },
    ]).exec();
    const users = reelAgg[0]?.users || [];
    const totalRecords = reelAgg[0]?.pagination[0]?.count || 0;
    const totalPages = Math.ceil(totalRecords / limit);

    res.status(200).json({
      success: true,
      data: {
        users,
        totalRecords,
        totalPages,
      },
    });
  } catch (error) {
    throw error;
  }
});

export const createSuperAdmin = expressAsyncHandler(async (req: any, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name) {
      res.status(400);
      throw new Error('name_required');
    }
    if (!email) {
      res.status(400);
      throw new Error('email_required');
    }
    if (!password || (password && !password.trim())) {
      res.status(400);
      throw new Error('password_required');
    }
    if (!nameRegex.test(name)) {
      res.status(400);
      throw new Error('name_invalid');
    }
    if (!emailRegex.test(email)) {
      res.status(400);
      throw new Error('email_invalid');
    }
    let newPassword = decryptData(password);
    newPassword = newPassword?.password?.split('-');
    if (newPassword?.length > 1) {
      newPassword = newPassword[1];
    }
    if (!passwordRegex.test(newPassword) || !newPassword) {
      res.status(400);
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
    const role = await Role.findOne({ name: UserRole.SuperAdmin }).exec();
    await User.create({
      name,
      email,
      password: newPassword,
      role: role?._id,
      status: STATUS_TYPE.active,
    });
    res.status(201).json({
      success: true,
      message: 'Super admin created successfully',
    });
  } catch (error) {
    throw error;
  }
});
