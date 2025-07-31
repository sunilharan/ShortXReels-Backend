import expressAsyncHandler from 'express-async-handler';
import { t } from 'i18next';
import mongoose from 'mongoose';
import { User } from '../models/user.model';
import { decryptData, generateToken, verifyToken } from '../utils/encrypt';
import { Role, IRole } from '../models/role.model';
import { UserRole, removeFile } from '../config/constants';
import { STATUS_TYPE, SAVE_TYPE } from '../config/enums';
import { Otp } from '../models/otp.model';
import crypto from 'crypto';
import { sendMail } from '../utils/sendMail';
import { ICategory } from '../models/category.model';
import { config } from '../config/config';
import { Reel } from '../models/reel.model';
import { countActiveReelsWithActiveUsers, fetchReels } from './reel.controller';
import { rename } from 'fs';
import { Comment } from '../models/comment.model';
import { Report } from '../models/report.model';
import moment from 'moment';

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
    user = await user.populate('role');
    user = await user.populate('interests');
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
    await User.findByIdAndUpdate(user.id, { $push: { token: accessToken } });
    res.status(201).json({
      success: true,
      data: { ...user.toJSON(), accessToken, refreshToken },
    });
  } catch (error: any) {
    throw error;
  }
});

export const nameExist = expressAsyncHandler(async (req: any, res) => {
  try {
    const { name } = req.params;
    if (!name) {
      res.status(400);
      throw new Error('invalid_request');
    }
    let user = await User.findOne({
      $or: [{ name: name }, { email: { $regex: `^${name}$`, $options: 'i' } }],
      status: { $ne: STATUS_TYPE.deleted },
    });
    res.status(200).send({
      success: true,
      data: !!user,
    });
  } catch (error: any) {
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
    });
    const userData = JSON.parse(JSON.stringify(user));
    res.status(200).json({
      success: true,
      data: {
        ...userData,
        accessToken,
        refreshToken,
      },
    });
  } catch (error: any) {
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
    });
    const userData = JSON.parse(JSON.stringify(user));
    res.status(200).json({
      success: true,
      data: {
        ...userData,
        accessToken,
        refreshToken,
      },
    });
  } catch (error: any) {
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
      token: decoded?.token,
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
    });
    res.status(200).json({
      success: true,
      data: {
        accessToken,
        refreshToken,
      },
    });
  } catch (error: any) {
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
    const otpData = crypto.randomInt(1000, 9999);
    await Otp.findOneAndDelete({ userId: user.id }).exec();
    const otp = await Otp.create({ userId: user.id, otp: otpData });
    // await sendMail(user.email, 'your_otp_code', otpData?.otp?.toString() || '');
    res.status(200).json({
      success: true,
      data: otp?.otp,
      message: t('otp_sent_to_email'),
    });
  } catch (error: any) {
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
  } catch (error: any) {
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
      user.password = newPassword;
      user.updatedBy = user.id;
      user.updatedAt = new Date();
      await user.save();
      await Otp.deleteMany({ userId: user.id });
      res.status(200).json({
        success: true,
        isExpired: false,
        message: t('password_changed'),
      });
    }
  } catch (error: any) {
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
    if (!user) {
      res.status(404);
      throw new Error('user_not_found');
    }
    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error: any) {
    throw error;
  }
});

export const logout = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = req.user.id;
    const token = req.headers.authorization.split(' ')[1];
    const user = await User.findByIdAndUpdate(userId, {
      $pull: { token: token },
      updatedBy: userId,
      updatedAt: new Date().toISOString(),
    })
      .populate<{ role: IRole }>('role')
      .exec();
    if (!user) {
      res.status(404);
      throw new Error('user_not_found');
    }
    res.status(200).json({
      success: true,
      message: t('user_logged_out'),
    });
  } catch (error: any) {
    throw error;
  }
});

export const deleteAccount = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findByIdAndUpdate(userId, {
      status: STATUS_TYPE.deleted,
      $unset: { token: '' },
      updatedBy: userId,
      updatedAt: new Date().toISOString(),
    });
    if (!user) {
      res.status(404);
      throw new Error('user_not_found');
    }
    await Reel.updateMany(
      { createdBy: userId },
      { status: STATUS_TYPE.deleted }
    ).exec();
    await Comment.updateMany(
      { commentedBy: userId },
      { status: STATUS_TYPE.deleted }
    ).exec();
    await Comment.updateMany(
      { 'replies._id': userId },
      { $set: { 'replies.$.status': STATUS_TYPE.deleted } }
    ).exec();
    await Report.updateMany(
      { reportedBy: userId },
      { status: STATUS_TYPE.deleted }
    ).exec();
    res.status(200).json({
      success: true,
      message: t('user_deleted'),
    });
  } catch (error: any) {
    throw error;
  }
});

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
      .populate('role')
      .populate('interests', 'name image')
      .exec();

    if (!user) throw new Error('user_not_found');

    res.status(200).json({ success: true, data: user });
  } catch (error: any) {
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
      $and: [{ status: { $nin: [STATUS_TYPE.deleted, STATUS_TYPE.blocked] } }],
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
    user.password = newPassword;
    (user.updatedBy = userId), (user.updatedAt = new Date());
    await user.save();
    res.status(200).json({
      success: true,
      message: t('password_changed'),
    });
  } catch (error: any) {
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
    user = await user.populate('role');
    user = await user.populate('interests');
    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error: any) {
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
    user = await user.populate('role');
    user = await user.populate('interests');
    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error: any) {
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
    await Reel.updateMany(
      { user: id },
      {
        status: STATUS_TYPE.deleted,
        updatedBy: userId,
        updatedAt: new Date().toISOString(),
      }
    ).exec();
    await Comment.updateMany(
      { user: id },
      {
        status: STATUS_TYPE.deleted,
        updatedBy: userId,
        updatedAt: new Date().toISOString(),
      }
    ).exec();
    await Comment.updateMany(
      { 'replies._id': id },
      {
        $set: {
          'replies.$.status': STATUS_TYPE.deleted,
          'replies.$.updatedBy': userId,
          'replies.$.updatedAt': new Date().toISOString(),
        },
      }
    ).exec();
    await Report.updateMany(
      { user: id },
      {
        status: STATUS_TYPE.deleted,
        updatedBy: userId,
        updatedAt: new Date().toISOString(),
      }
    ).exec();
    res.status(200).json({
      success: true,
      message: t('user_deleted'),
    });
  } catch (error: any) {
    throw error;
  }
});

const getUsersByRole = async (req: any, res: any, roleName: string) => {
  const id = req.query.id;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  const status = req.query.status;
  const search = req.query.search;

  let matchQuery: any = {};
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
  return getUsersByRole(req, res, UserRole.User);
});

export const adminGetAdminUsers = expressAsyncHandler(async (req: any, res) => {
  return getUsersByRole(req, res, UserRole.Admin);
});

export const saveUnsaveReel = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = req.user.id;
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
    let user = await User.findById(userId).exec();
    if (!user) {
      res.status(404);
      throw new Error('user_not_found');
    }
    const alreadySaved = user.savedReels.some(
      (id: any) => id.toString() === reelId
    );
    if (action === SAVE_TYPE.save && !alreadySaved) {
      user = await User.findByIdAndUpdate(
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
      user = await User.findByIdAndUpdate(
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
  } catch (error: any) {
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
  } catch (error: any) {
    throw error;
  }
});

export const adminRemoveProfilePicture = expressAsyncHandler(
  async (req: any, res) => {
    try {
      const userId = req.params.id;
      const role = req.role;

      const user = await User.findById(userId)
        .populate<{ role: IRole }>('role')
        .exec();
      if (!user) {
        res.status(404);
        throw new Error('user_not_found');
      }
      if (role === UserRole.Admin && user.role.name !== UserRole.User) {
        throw new Error('forbidden');
      }
      if (user.profile) {
        await removeFile(user.profile, 'files/profiles');
      }
      await User.findByIdAndUpdate(userId, {
        $unset: { profile: '' },
        updatedBy: userId,
        updatedAt: new Date().toISOString(),
      }).exec();
      res.status(200).json({
        success: true,
        message: t('profile_removed'),
      });
    } catch (error: any) {
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
      throw new Error('invalid_request');
    }

    const user = await User.findById(id).populate<{ role: IRole }>('role');
    if (!user) throw new Error('user_not_found');
    if (role === UserRole.Admin && user.role.name !== UserRole.User) {
      throw new Error('forbidden');
    }
    await User.findByIdAndUpdate(id, {
      status,
      updatedBy: userId,
      updatedAt: new Date().toISOString(),
    });
    res.status(200).json({
      status: true,
      message: t('status_changed'),
    });
  } catch (error: any) {
    throw error;
  }
});

export const blockUnblockUser = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { id, isBlocked } = req.body;
    if (!id || typeof isBlocked !== 'boolean') {
      throw new Error('invalid_request');
    }
    const user = await User.findById(id).populate<{ role: IRole }>('role');
    if (!user) throw new Error('user_not_found');
    if (user.role.name !== UserRole.User) {
      throw new Error('forbidden');
    }

    if (Boolean(isBlocked) === true) {
      if (user.status === STATUS_TYPE.blocked) {
        throw new Error('data_already_blocked');
      }
      await User.findByIdAndUpdate(id, {
        status: STATUS_TYPE.blocked,
        updatedBy: userId,
        updatedAt: new Date().toISOString(),
      });
    } else if (Boolean(isBlocked) === false) {
      if (user.status !== STATUS_TYPE.blocked) {
        throw new Error('data_not_blocked');
      }
      await User.findByIdAndUpdate(id, {
        status: STATUS_TYPE.active,
        updatedBy: userId,
        updatedAt: new Date().toISOString(),
      });
    }
    res.status(200).json({
      success: true,
      message: t(Boolean(isBlocked) ? 'data_blocked' : 'data_unblocked'),
    });
  } catch (error: any) {
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
      res.status(400);
      throw new Error('user_not_found');
    }
    if (user.role.name !== UserRole.User) {
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
  } catch (error: any) {
    throw error;
  }
});

export const adminDashboardDetails = expressAsyncHandler(
  async (req: any, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 3;
      const skip = (page - 1) * limit;
      const startDate = req.query.startDate;
      const endDate = req.query.endDate;
      const search = req.query.search;
      const status = req.query.status;
      const matchQuery: any = {};
      if (startDate && endDate) {
        const newStartDate = moment(startDate).startOf('day').toDate();
        const newEndDate = moment(endDate).endOf('day').toDate();
        matchQuery.createdAt = { $gte: newStartDate, $lte: newEndDate };
      }
      if (status) {
        matchQuery.status = status;
      }
      const usersAgg = await User.aggregate([
        { $match: matchQuery },
        {
          $project: {
            _id: 0,
            id: '$_id',
            name: 1,
            email: 1,
            profile: {
              $cond: {
                if: {
                  $not: ['$profile'],
                },
                then: '$$REMOVE',
                else: {
                  $concat: [config.host + '/profile/', '$profile'],
                },
              },
            },
            status: 1,
          },
        },
        {
          $match: search
            ? {
                $or: [
                  { name: { $regex: search, $options: 'i' } },
                  { email: { $regex: search, $options: 'i' } },
                ],
              }
            : {},
        },
        {
          $facet: {
            users: [{ $skip: skip }, { $limit: limit }],
            pagination: [{ $count: 'total' }],
          },
        },
      ]);
      const totalUsers = usersAgg[0]?.pagination[0]?.total || 0;
      const filteredUsers = usersAgg[0]?.users || [];
      const reelAgg = await Reel.aggregate([
        { $match: matchQuery },
        {
          $project: {
            _id: 0,
            id: '$_id',
            caption: 1,
            viewCount: { $size: '$viewedBy' },
            likeCount: { $size: '$likedBy' },
          },
        },
        {
          $match: search
            ? {
                caption: { $regex: search, $options: 'i' },
              }
            : {},
        },
        { $sort: { viewCount: -1 } },
        {
          $facet: {
            topReels: [{ $skip: skip }, { $limit: limit }],
            pagination: [{ $count: 'total' }],
          },
        },
      ]);

      const topReels = reelAgg[0]?.topReels || [];
      const totalReels = reelAgg[0]?.pagination[0]?.total || 0;

      const commentAgg = await Comment.aggregate([
        { $match: matchQuery },
        {
          $project: {
            _id: 0,
            id: '$_id',
            content: 1,
            likeCount: { $size: '$likedBy' },
            replyCount: { $size: '$replies' },
          },
        },
        {
          $match: search
            ? {
                content: { $regex: search, $options: 'i' },
              }
            : {},
        },
        { $sort: { likeCount: -1 } },
        {
          $facet: {
            topComments: [{ $skip: skip }, { $limit: limit }],
            pagination: [{ $count: 'total' }],
          },
        },
      ]);

      const topComments = commentAgg[0]?.topComments || [];
      const totalComments = commentAgg[0]?.pagination[0]?.total || 0;

      const reportsAgg = await Report.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: {
              reel: '$reel',
              comment: {
                $cond: [
                  { $in: ['$reportType', ['comment', 'reply']] },
                  '$comment',
                  '$$REMOVE',
                ],
              },
              reply: {
                $cond: [
                  { $eq: ['$reportType', 'reply'] },
                  '$reply',
                  '$$REMOVE',
                ],
              },
              reportType: '$reportType',
            },
            count: { $sum: 1 },
          },
        },
        {
          $lookup: {
            from: 'reels',
            localField: '_id.reel',
            foreignField: '_id',
            as: 'reel',
          },
        },
        { $unwind: { path: '$reel', preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: 'comments',
            localField: '_id.comment',
            foreignField: '_id',
            as: 'comment',
          },
        },
        { $unwind: { path: '$comment', preserveNullAndEmptyArrays: true } },
        {
          $addFields: {
            replyObject: {
              $first: {
                $filter: {
                  input: '$comment.replies',
                  as: 'rep',
                  cond: { $eq: ['$$rep._id', '$_id.reply'] },
                },
              },
            },
          },
        },
        {
          $project: {
            _id: 0,
            count: 1,
            reel: {
              caption: '$reel.caption',
              media: {
                $cond: [
                  { $eq: ['$reel.mediaType', 'image'] },
                  {
                    $map: {
                      input: '$reel.media',
                      as: 'img',
                      in: {
                        $concat: [config.host, '/reel/', '$$img'],
                      },
                    },
                  },
                  {
                    $concat: [
                      config.host,
                      '/api/reel/view/',
                      { $toString: '$reel._id' },
                    ],
                  },
                ],
              },
              mediaType: '$reel.mediaType',
              thumbnail: {
                $cond: [
                  { $ifNull: ['$reel.thumbnail', false] },
                  {
                    $concat: [config.host, '/thumbnail/', '$reel.thumbnail'],
                  },
                  '$$REMOVE',
                ],
              },
            },
            reportType: {
              $cond: {
                if: { $eq: ['$_id.reportType', 'reel'] },
                then: 'reel',
                else: 'comment',
              },
            },
            id: {
              $cond: [
                { $eq: ['$_id.reportType', 'reel'] },
                '$_id.reel',
                {
                  $cond: [
                    { $in: ['$_id.reportType', ['comment', 'reply']] },
                    '$_id.comment',
                    null,
                  ],
                },
              ],
            },
            comment: {
              $cond: [
                { $eq: ['$_id.reportType', 'reply'] },
                {
                  content: '$replyObject.content',
                  commentId: '$comment._id',
                  commentContent: '$comment.content',
                },
                {
                  $cond: [
                    { $eq: ['$_id.reportType', 'comment'] },
                    {
                      content: '$comment.content',
                    },
                    '$$REMOVE',
                  ],
                },
              ],
            },
          },
        },
        {
          $match: search
            ? {
                $or: [
                  { 'reel.caption': { $regex: search, $options: 'i' } },
                  { 'comment.content': { $regex: search, $options: 'i' } },
                  {
                    'comment.commentContent': { $regex: search, $options: 'i' },
                  },
                ],
              }
            : {},
        },
        { $sort: { count: -1 } },
        {
          $facet: {
            mostReportedItems: [{ $skip: skip }, { $limit: limit }],
            pagination: [{ $count: 'total' }],
          },
        },
      ]);

      const mostReportedItems = reportsAgg[0]?.mostReportedItems || [];
      const totalReports = reportsAgg[0]?.pagination[0]?.total || 0;

      const categoryAgg = await Reel.aggregate([
        { $match: matchQuery },
        { $unwind: '$categories' },
        { $group: { _id: '$categories', count: { $sum: 1 } } },
        {
          $lookup: {
            from: 'categories',
            localField: '_id',
            foreignField: '_id',
            as: 'category',
          },
        },
        { $unwind: '$category' },
        {
          $project: {
            _id: 0,
            id: '$_id',
            name: '$category.name',
            count: 1,
          },
        },
        { $match: search ? { name: { $regex: search, $options: 'i' } } : {} },
        { $sort: { count: -1 } },
        {
          $facet: {
            topCategories: [{ $skip: skip }, { $limit: limit }],
            pagination: [{ $count: 'total' }],
          },
        },
      ]);

      const topCategories = categoryAgg[0]?.topCategories || [];
      const totalCategories = categoryAgg[0]?.pagination[0]?.total || 0;

      res.status(200).json({
        success: true,
        data: {
          users: {
            totalRecords: totalUsers,
            totalPages: Math.ceil(totalUsers / limit),
            filtered: filteredUsers,
          },
          reels: {
            totalRecords: totalReels,
            totalPages: Math.ceil(totalReels / limit),
            top: topReels,
          },
          comments: {
            totalRecords: totalComments,
            totalPages: Math.ceil(totalComments / limit),
            top: topComments,
          },
          reports: {
            totalRecords: totalReports,
            totalPages: Math.ceil(totalReports / limit),
            mostReported: mostReportedItems,
          },
          categories: {
            totalRecords: totalCategories,
            totalPages: Math.ceil(totalCategories / limit),
            topUsed: topCategories,
          },
        },
      });
    } catch (error) {
      throw error;
    }
  }
);
