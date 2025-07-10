import expressAsyncHandler from 'express-async-handler';
import { t } from 'i18next';
import { ObjectId } from 'mongodb';
import { User } from '../models/user.model';
import { decryptData, generateToken, verifyToken } from '../utils/encrypt';
import { Role, IRole } from '../models/role.model';
import { UserRole, removeFile, STATUS } from '../config/constants';
import { Otp } from '../models/otp.model';
import { generateOTP } from '../utils/generateOtp';
import { sendMail } from '../utils/sendMail';
import { ICategory } from '../models/category.model';
import { config } from '../config/config';

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
    let user = await User.create({
      name,
      email,
      password: newPassword,
      phone,
      gender,
      birthDate,
      role: role?.id,
    });
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

export const login = expressAsyncHandler(async (req: any, res) => {
  try {
    const { email, password } = req.body;
    if (!email) {
      res.status(400);
      throw new Error('email_required');
    }
    if (!password) {
      res.status(400);
      throw new Error('password_required');
    }
    const user = await User.findOne({
      email,
    })
      .populate<{ role: IRole }>('role')
      .populate<{ interests: ICategory }>('interests', 'name image')
      .exec();
    if (!user) {
      res.status(404);
      throw new Error('invalid_email_or_password');
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
      throw new Error('invalid_email_or_password');
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
    const decoded = verifyToken(token);
    if (!decoded || typeof decoded !== 'object' || !('id' in decoded)) {
      res.status(401);
      throw new Error('refresh_token_invalid');
    }
    const user = await User.findOne({
      _id: decoded?.id,
      token: decoded?.token,
      status: STATUS.active,
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
      $and: [{ status: { $ne: STATUS.deleted } }],
    }).exec();
    if (!user) {
      res.status(404);
      throw new Error('email_does_not_exist');
    }
    const otpData = await generateOTP();
    let existingOtp = await Otp.findOne({ userId: user.id }).exec();
    if (existingOtp) {
      existingOtp = await Otp.findByIdAndUpdate(existingOtp.id, {
        otp: otpData.otp,
        expiresAt: otpData.expiresAt,
      }, { new: true });
    } else {
      existingOtp = await Otp.create({ userId: user.id, otp: otpData.otp });
    }
    // await sendMail(user.email, 'your_otp_code', otpData?.otp?.toString() || '');
    res.status(200).json({
      success: true,
      data: existingOtp?.otp,
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
      $and: [{ status: { $ne: STATUS.deleted } }],
    })
      .populate('role')
      .exec();
    if (!user) {
      res.status(404);
      throw new Error('email_does_not_exist');
    }
    const otpData = await Otp.findOne({ userId: user.id, otp }).exec();
    if (!otpData) {
      res.status(404);
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
      throw new Error('access_token_required');
    }
    if (!password) {
      res.status(400);
      throw new Error('password_required');
    }
    const decoded = verifyToken(token);
    if (
      decoded &&
      typeof decoded === 'object' &&
      'isExpired' in decoded &&
      (decoded as any).isExpired
    ) {
      res.status(200).json({
        success: true,
        isExpired: true,
      });
    } else {
      if (!decoded || typeof decoded !== 'object' || !('id' in decoded)) {
        res.status(400);
        throw new Error('invalid_token');
      }
      const user = await User.findOne({
        _id: decoded?.id,
        $and: [{ status: { $ne: STATUS.deleted } }],
      }).exec();
      if (!user) {
        res.status(404);
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
    const userId = req.userId;
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
    const userId = req.userId;
    const user = await User.findByIdAndUpdate(userId, { token: null })
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
    const userId = req.userId;
    const user = await User.findByIdAndUpdate(userId, {
      status: STATUS.deleted,
      token: null,
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
    if (userData.notification) {
      updateData.notification = JSON.parse(userData.notification);
    }
    if (userData.interests) {
      updateData.interests = JSON.parse(userData.interests).map(
        (id: string) => new ObjectId(id)
      );
    }
    const user = await User.findByIdAndUpdate(userId, updateData, {
      new: true,
    })
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

export const changePassword = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = req.userId;
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
      $and: [{ status: { $ne: STATUS.deleted } }],
    }).exec();

    if (!user) {
      res.status(404);
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
