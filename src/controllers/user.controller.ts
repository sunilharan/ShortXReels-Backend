import expressAsyncHandler from 'express-async-handler';
import { User } from '../models/user.model';
import {
  decryptData,
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
} from '../utils/encrypt';
import { Role, IRole } from '../models/role.model';
import { UserRole, removeFile, STATUS } from '../config/constants';
import { Otp } from '../models/otp.model';
import { generateOTP } from '../utils/generateOtp';
import { sendMail } from '../utils/sendMail';
import { t } from 'i18next';

export const register = expressAsyncHandler(async (req: any, res) => {
  try {
    const { name, email, password, phone, gender, birthDate } = req.body;
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
    if (!newPassword) {
      res.status(400);
      throw new Error('password_required');
    }

    let user = await User.create({
      name,
      email,
      password: newPassword,
      phone,
      gender,
      birthDate,
      role: role?.id,
    });
    if (user) {
      user = await user.populate('role');
      const roleName =
        typeof user.role === 'object' &&
        user.role !== null &&
        'name' in user.role
          ? (user.role as IRole).name
          : '';
      const accessToken = generateAccessToken(user.id, roleName);
      const refreshToken = generateRefreshToken(user.id, accessToken);
      user.token = accessToken;
      await User.findByIdAndUpdate(user.id, { token: accessToken });
      res.status(201).json({
        success: true,
        data: { ...user.toJSON(), accessToken, refreshToken },
      });
    } else {
      res.status(400);
      throw new Error('user_register_failed');
    }
  } catch (error: any) {
    res.status(400);
    throw new Error(error.message);
  }
});

export const login = expressAsyncHandler(async (req: any, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({
      email,
    })
      .populate<{ role: IRole }>('role')
      .exec();
    if (!user) {
      res.status(404);
      throw new Error('user_not_found');
    }
    let newPassword = decryptData(password);
    newPassword = newPassword?.password?.split('-');
    if (newPassword?.length > 1) {
      newPassword = newPassword[1];
    }
    if (!newPassword) {
      res.status(400);
      throw new Error('password_required');
    }
    const isMatch = user && (await user.matchPassword(newPassword));

    if (user && isMatch && user.status === STATUS.active) {
      const accessToken = generateAccessToken(user.id, user.role.name);
      const refreshToken = generateRefreshToken(user.id, accessToken);
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
    } else {
      res.status(401);
      throw new Error('user_login_failed');
    }
  } catch (error: any) {
    res.status(400);
    throw new Error(error.message);
  }
});

export const refreshToken = expressAsyncHandler(async (req: any, res) => {
  try {
    const { refreshToken: token } = req.body;
    if (!token) {
      res.status(401);
      throw new Error('refresh_token_required');
    }
    const decoded = verifyToken(token);
    if (decoded && typeof decoded === 'object' && 'id' in decoded) {
      const user = await User.findOne({
        _id: decoded?.id,
        token: decoded?.token,
        status: STATUS.active,
      })
        .populate<{ role: IRole }>('role')
        .exec();
      if (!user) {
        res.status(401);
        throw new Error('user_not_found');
      }
      const accessToken = generateAccessToken(user.id, user.role.name);
      const refreshToken = generateRefreshToken(user.id, accessToken);
      user.token = accessToken;
      await User.findByIdAndUpdate(user.id, { token: accessToken });
      res.status(201).json({
        success: true,
        data: {
          accessToken,
          refreshToken,
        },
      });
    } else {
      res.status(401);
      throw new Error('invalid_refresh_token');
    }
  } catch (error: any) {
    res.status(400);
    throw new Error(error.message);
  }
});

export const sendOtp = expressAsyncHandler(async (req: any, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({
      email,
      $and: [{ status: { $ne: STATUS.deleted } }],
    }).exec();
    if (!user) {
      res.status(404);
      throw new Error('user_not_found');
    }
    const otpData = await generateOTP();
    let existingOtp = await Otp.findOne({ userId: user.id }).exec();
    if (existingOtp) {
      await Otp.findByIdAndUpdate(existingOtp.id, {
        otp: otpData.otp,
        expiresAt: otpData.expiresAt,
      });
    } else {
      existingOtp = await Otp.create({ userId: user.id, otp: otpData.otp });
    }

    // await sendMail(user.email, 'your_otp_code', otpData?.otp?.toString() || '');
    res.status(201).json({
      success: true,
      data: otpData.otp,
      message: t('otp_sent_to_email'),
    });
  } catch (error: any) {
    res.status(400);
    throw new Error(error.message);
  }
});

export const verifyOtp = expressAsyncHandler(async (req: any, res) => {
  try {
    const { email, otp } = req.body;
    const user = await User.findOne({
      email,
      $and: [{ status: { $ne: STATUS.deleted } }],
    })
      .populate<{ role: IRole }>('role')
      .exec();
    if (!user) {
      res.status(404);
      throw new Error('user_not_found');
    }
    const otpData = await Otp.findOne({ userId: user.id, otp }).exec();
    if (!otpData) {
      res.status(404);
      throw new Error('otp_invalid');
    }
    const accessToken = generateAccessToken(user.id, user.role.name);
    await User.findByIdAndUpdate(user.id, { token: accessToken });
    res.status(200).json({
      success: true,
      data: accessToken,
      message: t('otp_verified'),
    });
  } catch (error: any) {
    res.status(400);
    throw new Error(error.message);
  }
});
export const resetPassword = expressAsyncHandler(async (req: any, res) => {
  try {
    const { email, accessToken, password } = req.body;
    const user = await User.findOne({
      email,
      token: accessToken,
      $and: [{ status: { $ne: STATUS.deleted } }],
    }).exec();
    if (!user) {
      res.status(404);
      throw new Error('user_not_found');
    }
    
    const same = await user.matchPassword(password);
    if (same) {
      res.status(400);
      throw new Error('password_same');
    }
    user.password = password;
    await user.save();
    await Otp.deleteMany({ userId: user.id });
    res.status(201).json({
      success: true,
      message: t('password_changed'),
    });
  } catch (error: any) {
    res.status(400);
    throw new Error(error.message);
  }
});

export const currentUser = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = req.userId;
    const user = await User.findById(userId)
      .populate<{ role: IRole }>('role')
      .exec();
    if (!user) {
      res.status(404);
      throw new Error('user_not_found');
    }
    res.status(201).json({
      success: true,
      data: user,
    });
  } catch (error: any) {
    res.status(400);
    throw new Error(error.message);
  }
});

export const logout = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = req.userId;
    const user = await User.findByIdAndUpdate(userId, { token: null })
      .populate<{ role: IRole }>('role')
      .exec();
    if (!user) {
      res.status(404);
      throw new Error('user_not_found');
    }
    res.status(201).json({
      success: true,
      message: t('user_logged_out'),
    });
  } catch (error: any) {
    res.status(400);
    throw new Error(error.message);
  }
});

export const deleteUser = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = req.userId;
    const user = await User.findByIdAndUpdate(userId, {
      status: STATUS.deleted,
      token: null,
    });
    if (!user) {
      res.status(404);
      throw new Error('user_not_found');
    }
    res.status(201).json({
      success: true,
      message: t('user_deleted'),
    });
  } catch (error: any) {
    res.status(400);
    throw new Error(error.message);
  }
});

export const updateUser = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = req.userId;
    const userData = req.body;
    let updateData: any = {};
    if (userData.name) {
      updateData.name = userData.name;
    }
    if (userData.email) {
      updateData.email = userData.email;
    }
    if (userData.phone) {
      updateData.phone = userData.phone;
    }
    if (userData.gender) {
      updateData.gender = userData.gender;
    }
    if (userData.birthDate) {
      updateData.birthDate = userData.birthDate;
    }
    if (req.file) {
      updateData.profile = req.file.filename;
      if (userData.oldProfile) {
        await removeFile(userData.oldProfile, 'uploads/profiles');
      }
    }
    const user = await User.findByIdAndUpdate(userId, updateData, {
      new: true,
    })
      .populate<{ role: IRole }>('role')
      .exec();
    if (!user) {
      res.status(404);
      throw new Error('user_not_found');
    }
    res.status(201).json({
      success: true,
      data: user,
    });
  } catch (error: any) {
    res.status(400);
    throw new Error(error.message);
  }
});

export const changePassword = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = req.userId;
    const { password, oldPassword } = req.body;
    const user = await User.findOne({
      _id: userId,
      $and: [{ status: { $ne: STATUS.deleted } }],
    }).exec();
    if (!user) {
      res.status(404);
      throw new Error('user_not_found');
    }
    const isMatch = await user.matchPassword(oldPassword);
    if (!isMatch) {
      res.status(400);
      throw new Error('password_not_match');
    }
    const same = await user.matchPassword(password);
    if (same) {
      res.status(400);
      throw new Error('password_same');
    }
    user.password = password;
    user.populate<{ role: IRole }>('role');
    await user.save();
    res.status(201).json({
      success: true,
      message: t('password_changed'),
    });
  } catch (error: any) {
    res.status(400);
    throw new Error(error.message);
  }
});
