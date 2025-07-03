import expressAsyncHandler from 'express-async-handler';
import { verifyToken } from '../utils/encrypt';
import { User } from '../models/user.model';
import { JwtPayload } from 'jsonwebtoken';
import { STATUS, UserRole } from '../config/constants';
import { IRole } from '../models/role.model';
export const authenticate = expressAsyncHandler(async (req: any, res, next) => {
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer ')
  ) {
    token = req.headers.authorization.split(' ')[1];
    const decoded = verifyToken(token) as JwtPayload;
    if (!decoded || typeof decoded === 'string' || !('id' in decoded)) {
      res.status(401);
      throw new Error('unauthorized');
    }
    const user = await User.findOne({
      _id: decoded.id,
      token: token,
      status: STATUS.active,
    })
      .populate<{ role: IRole }>('role')
      .exec();
    if (!user) {
      res.status(401);
      throw new Error('unauthorized');
    }
    req.userId = user.id;
    req.role = user.role.name;
  }
  if (!token) {
    res.status(401);
    throw new Error('unauthorized');
  }
  next();
});

export const adminOnly = expressAsyncHandler(async (req: any, res, next) => {
  const userRole = req.role;
  if (userRole !== UserRole.SuperAdmin && userRole !== UserRole.Admin) {
    res.status(403);
    throw new Error('forbidden');
  }
  next();
});
