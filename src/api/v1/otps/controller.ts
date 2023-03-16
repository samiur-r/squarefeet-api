import { NextFunction, Request, Response } from 'express';

import { findOtpByUserId, sendOtpVerificationSms, updateOtpStatus } from './service';
import ErrorHandler from '../../../utils/ErrorHandler';
import { verifyToken } from '../../../utils/passwordUtils';
import { findUserById, updateUserStatus } from '../users/service';
import logger from '../../../utils/logger';
import { initCredits } from '../credits/service';

const verifyOtp = async (req: Request, res: Response, next: NextFunction) => {
  const { userId, otpCode, nextOperation } = req.body;

  try {
    const otpObj = await findOtpByUserId(userId);
    if (!otpObj) throw new ErrorHandler(500, 'Otp not found. Please try again with new otp');

    if (new Date() > otpObj.expiration_time)
      throw new ErrorHandler(403, 'Otp has expired. Please try again with a new otp');

    if (otpObj.verified) throw new ErrorHandler(403, 'Otp has already been used. Please try again with a new otp');

    const isValid = await verifyToken(otpCode.toString(), otpObj.token);

    if (!isValid) throw new ErrorHandler(403, 'Incorrect otp');

    await updateOtpStatus(otpObj.id, true);
    if (!nextOperation) {
      await updateUserStatus(userId, 'verified');
      const user = await findUserById(userId);
      if (user) await initCredits(user);
      return res.status(200).json({ success: 'Phone verified successfully' });
    }
    return res.status(200).json({ success: 'Otp verified successfully' });
  } catch (error) {
    logger.error(`${error.name}: ${error.message}`);
    return next(error);
  }
};

const resendOtp = async (req: Request, res: Response, next: NextFunction) => {
  const { userId, type } = req.body;

  try {
    const user = await findUserById(userId);

    if (!user) throw new ErrorHandler(500, 'Unable to send otp. Please contact support');

    await sendOtpVerificationSms(user.phone, type, user);
    return res.status(200).json({ success: 'New otp sent to your phone' });
  } catch (error) {
    logger.error(`${error.name}: ${error.message}`);
    if (error.message === 'All SMS messages failed to send') {
      error.message = 'Failed to send otp';
    }
    return next(error);
  }
};

export { verifyOtp, resendOtp };
