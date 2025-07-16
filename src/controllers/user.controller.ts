import expressAsyncHandler from 'express-async-handler';
import { t } from 'i18next';
import mongoose from 'mongoose';
import { User } from '../models/user.model';
import { decryptData, generateToken, verifyToken } from '../utils/encrypt';
import { Role, IRole } from '../models/role.model';
import {
  UserRole,
  removeFile,
  STATUS_TYPE,
  SAVE_TYPE,
} from '../config/constants';
import { Otp } from '../models/otp.model';
import crypto from 'crypto';
import { sendMail } from '../utils/sendMail';
import { ICategory } from '../models/category.model';
import { config } from '../config/config';
import { Reel } from '../models/reel.model';
import { fetchReels } from './reel.controller';
import { rename } from 'fs';

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
    user.token = accessToken;
    await User.findByIdAndUpdate(user.id, { token: accessToken });
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
      name: name,
      $and: [{ status: { $ne: STATUS_TYPE.deleted } }],
    });
    res.status(200).send({
      status: true,
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
      $or: [{ email: userName }, { name: userName} ],
      $and: [{ status: { $ne: STATUS_TYPE.deleted } }],
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
    user.token = accessToken;
    await User.findByIdAndUpdate(user.id, { token: accessToken });
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
    user.token = accessToken;
    await User.findByIdAndUpdate(user.id, { token: accessToken });
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
      $and: [{ status: { $ne: STATUS_TYPE.deleted } }],
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
      $and: [{ status: { $ne: STATUS_TYPE.deleted } }],
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
        $and: [{ status: { $ne: STATUS_TYPE.deleted } }],
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
    const user = await User.findByIdAndUpdate(userId, { $unset: { token: '' } })
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

export const deleteUser = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findByIdAndUpdate(userId, {
      status: STATUS_TYPE.deleted,
      $unset: { token: '' },
    });
    if (!user) {
      res.status(404);
      throw new Error('user_not_found');
    }
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
    const tempFile = req.file?.path;
    const updateData: any = {};

    if (userData.name) updateData.name = userData.name;
    if (userData.email) updateData.email = userData.email;
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

    if (tempFile) {
      const profilePath = `profiles/${req.file.filename}`;
      const destPath = `files/${profilePath}`;
      await new Promise<void>((resolve, reject) => {
        rename(tempFile, destPath, (err) => {
          if (err) return reject(new Error('profile_upload_failed'));
          updateData.profile = req.file.filename;
          resolve();
        });
      });

      const user = await User.findByIdAndUpdate(userId, updateData, {
        new: true,
      })
        .populate<{ role: IRole }>('role')
        .populate<{ interests: ICategory }>('interests', 'name image')
        .exec();

      if (!user) {
        throw new Error('user_not_found');
      }
      if (userData.oldProfile) {
        removeFile(userData.oldProfile, 'files/profiles');
      }

      res.status(200).json({
        success: true,
        data: user,
      });
    } else {
      const user = await User.findByIdAndUpdate(userId, updateData, {
        new: true,
      })
        .populate<{ role: IRole }>('role')
        .populate<{ interests: ICategory }>('interests', 'name image')
        .exec();

      if (!user) {
        throw new Error('user_not_found');
      }
      res.status(200).json({
        success: true,
        data: user,
      });
    }
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
      $and: [{ status: { $ne: STATUS_TYPE.deleted } }],
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
    await user.save();
    res.status(200).json({
      success: true,
      message: t('password_changed'),
    });
  } catch (error: any) {
    console.log('updateUser');
    throw error;
  }
});

export const adminRegister = expressAsyncHandler(async (req: any, res) => {
  try {
    const { name, email, password, phone, gender, birthDate, roleId } =
      req.body;
    let newPassword = decryptData(password);
    newPassword = newPassword?.password?.split('-');
    if (newPassword?.length > 1) {
      newPassword = newPassword[1];
    }

    let user = await User.create({
      name,
      email,
      password: newPassword,
      phone,
      gender,
      birthDate,
      role: roleId,
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
        },
        { new: true }
      ).exec();
    } else if (action === SAVE_TYPE.unsave && alreadySaved) {
      user = await User.findByIdAndUpdate(
        userId,
        { $pull: { savedReels: new mongoose.Types.ObjectId(String(reelId)) } },
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
    const totalRecords = await Reel.countDocuments(matchQuery);
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

export const removeProfile = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId).exec();
    if (!user) {
      res.status(404);
      throw new Error('user_not_found');
    }
    if (user.profile) {
      await removeFile(user.profile, 'files/profiles');
    }
    await User.findByIdAndUpdate(userId, { $unset: { profile: '' } }).exec();
    res.status(200).json({
      success: true,
      message: t('profile_removed'),
    });
  } catch (error: any) {
    throw error;
  }
});
