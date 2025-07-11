import expressAsyncHandler from 'express-async-handler';
import { Report } from '../models/report.model';
import { ObjectId } from 'mongodb';
import { UserRole, Reasons, STATUS } from '../config/constants';
import { Reel } from '../models/reel.model';
import { t } from 'i18next';

export const createReport = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { reelId: reel, reason, description } = req.body;

    if (!reel || !ObjectId.isValid(reel)) {
      res.status(400);
      throw new Error('invalid_reel_id');
    }
    if (
      !reason ||
      typeof reason !== 'string' ||
      reason.trim() === '' ||
      !Reasons.includes(reason as (typeof Reasons)[number])
    ) {
      res.status(400);
      throw new Error('reason_required');
    }
    if (
      !description ||
      typeof description !== 'string' ||
      description.trim() === ''
    ) {
      res.status(400);
      throw new Error('description_required');
    }
    const reelExists = await Reel.findById(reel).exec();
    if (!reelExists) {
      res.status(404);
      throw new Error('reel_not_found');
    }
    const report = await Report.create({
      reportedBy: new ObjectId(userId),
      reel: new ObjectId(reel),
      reason,
      description,
    });

    res.status(201).json({
      success: true,
      data: report,
    });
  } catch (error: any) {
    throw error;
  }
});

export const getReports = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = req.user.id;
    const role = req.role;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const search = (req.query.search as string) || '';
    const sortBy = (req.query.sortBy as string) || 'createdAt';
    const sortOrder = (req.query.sortOrder as string) || 'desc';
    const reason = req.query.reason as string;
    const reviewBy = req.query.reviewBy as string;
    const reviewResultValid = req.query.reviewResultValid;
    const reel = req.query.reelId as string;
    const status = req.query.status as string;

    const matchQuery: any = {};

    if (role === UserRole.User) {
      matchQuery.reportedBy = userId;
    }

    if (search) {
      const searchRegex = new RegExp(search, 'i');
      matchQuery.$or = [{ description: searchRegex }, { reason: searchRegex }];
    }

    if (reason) {
      matchQuery.reason = reason;
    }

    if (reel) {
      matchQuery.reel = reel;
    }

    if (reviewBy) {
      matchQuery.reviewBy = reviewBy;
    }

    if (reviewResultValid !== undefined) {
      matchQuery.reviewResultValid = reviewResultValid === 'true';
    }
    if (status) {
      matchQuery.status = status;
    } else {
      matchQuery.status = { $ne: STATUS.deleted };
    }
    const reports = await Report.find(matchQuery)
      .skip(skip)
      .limit(limit)
      .sort({
        [sortBy]: sortOrder === 'asc' ? 1 : -1,
      })
      .populate('reportedBy', 'name profile')
      .populate('reel', 'caption video')
      .populate('reviewBy', 'name profile')
      .exec();

    const total = await Report.countDocuments(matchQuery);

    res.status(200).json({
      success: true,
      data: {
        reports,
        totalRecords: total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    throw error;
  }
});

export const editReport = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = req.user.id;
    const role = req.role;
    const { id, reason, description } = req.body;
    const updateData: any = {};
    if (!id || !ObjectId.isValid(id)) {
      res.status(400);
      throw new Error('invalid_report_id');
    }
    if (
      reason &&
      typeof reason === 'string' &&
      reason.trim() !== '' &&
      Reasons.includes(reason as (typeof Reasons)[number])
    ) {
      updateData.reason = reason;
    }
    if (
      description &&
      typeof description === 'string' &&
      description.trim() !== ''
    ) {
      updateData.description = description;
    }
    let report;
    if (role === UserRole.SuperAdmin || role === UserRole.Admin) {
      report = await Report.findByIdAndUpdate(
        id,
        { ...updateData },
        { new: true }
      ).exec();
    } else {
      report = await Report.findOneAndUpdate(
        {
          _id: new ObjectId(id),
          reportedBy: new ObjectId(userId),
          status: { $ne: STATUS.deleted },
        },
        { ...updateData },
        { new: true }
      ).exec();
    }

    if (!report) {
      res.status(404);
      throw new Error('report_not_found');
    }

    res.status(200).json({
      success: true,
      data: report,
    });
  } catch (error: any) {
    throw error;
  }
});

export const deleteReport = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = req.user.id;
    const role = req.role;
    const { id } = req.params;

    if (!id || !ObjectId.isValid(id)) {
      res.status(400);
      throw new Error('invalid_report_id');
    }
    let report;
    if (role === UserRole.SuperAdmin || role === UserRole.Admin) {
      report = await Report.findByIdAndUpdate(id, {
        status: STATUS.deleted,
      }).exec();
    } else {
      report = await Report.findOneAndUpdate(
        {
          _id: new ObjectId(id),
          reportedBy: new ObjectId(userId),
          status: { $ne: STATUS.deleted },
        },
        {
          status: STATUS.deleted,
        }
      ).exec();
    }
    if (!report) {
      res.status(404);
      throw new Error('report_not_found');
    }

    res.status(200).json({
      success: true,
      message: t('report_deleted'),
    });
  } catch (error: any) {
    throw error;
  }
});

export const validateReport = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = req.user.id;
    const role = req.role;
    const { id, reviewResultValid } = req.body;

    if (!id || !ObjectId.isValid(id)) {
      res.status(400);
      throw new Error('invalid_report_id');
    }

    if (typeof reviewResultValid !== 'boolean') {
      res.status(400);
      throw new Error('invalid_review_validated');
    }
    const report = await Report.findByIdAndUpdate(
      id,
      {
        reviewBy: new ObjectId(userId),
        reviewResultValid: reviewResultValid,
        reviewDate: new Date(),
      },
      {
        new: true,
      }
    )
      .populate('reportedBy', 'name profile')
      .populate('reel', 'caption video')
      .populate('reviewBy', 'name profile')
      .exec();

    if (!report) {
      res.status(404);
      throw new Error('report_not_found');
    }
    if (report.reviewResultValid) {
      await Reel.findByIdAndUpdate(report.reel, {
        status: STATUS.inactive,
      }).exec();
    }
    res.status(200).json({
      success: true,
      message: t('report_validated'),
    });
  } catch (error: any) {
    throw error;
  }
});
