import expressAsyncHandler from 'express-async-handler';
import { verifyToken } from '../utils/encrypt';
import { User } from '../models/user.model';
import { UserRole } from '../config/constants';
import { STATUS_TYPE } from '../config/enums';
import { IRole } from '../models/role.model';

export const authenticate = expressAsyncHandler(async (req: any, res, next) => {
  try {
    let token;
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer ')
    ) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.query.at) {
      token = req.query.at;
    }
    if (!token) {
      res.status(401);
      throw new Error('unauthorized');
    }
    const decoded: any = verifyToken(token);
    if (!decoded || !decoded?.id) {
      res.status(401);
      throw new Error('unauthorized');
    }
    const user = await User.findOne({
      _id: decoded?.id,
      status: STATUS_TYPE.active,
    })
      .populate<{ role: IRole }>('role')
      .exec();
    if (!user || !user?.token?.includes(token)) {
      res.status(401);
      throw new Error('unauthorized');
    }
    req.user = user;
    req.role = user.role.name;
    next();
  } catch (error) {
    throw error;
  }
});

export const adminOnly = expressAsyncHandler(async (req: any, res, next) => {
  try {
    const userRole = req.role;
    if (userRole !== UserRole.SuperAdmin && userRole !== UserRole.Admin) {
      res.status(403);
      throw new Error('forbidden');
    }
    next();
  } catch (error) {
    throw error;
  }
});

export const superAdminOnly = expressAsyncHandler(
  async (req: any, res, next) => {
    try {
      const userRole = req.role;
      if (userRole !== UserRole.SuperAdmin) {
        res.status(403);
        throw new Error('forbidden');
      }
      next();
    } catch (error) {
      throw error;
    }
  }
);
