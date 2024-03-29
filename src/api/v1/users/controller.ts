import { NextFunction, Request, Response } from 'express';

import ErrorHandler from '../../../utils/ErrorHandler';
import { hashPassword, verifyToken } from '../../../utils/passwordUtils';
import config from '../../../config';
import { findUserById, findUserByPhone, saveUser, updateUserPassword } from './service';
import { sendOtpVerificationSms } from '../otps/service';
import { IUser } from './interfaces';
import logger from '../../../utils/logger';
import { phoneSchema, passwordSchema } from './validation';
import { signJwt } from '../../../utils/jwtUtils';
import { alertOnSlack } from '../../../utils/slackUtils';
import { sendSms } from '../../../utils/smsUtils';
import { saveUserLog } from '../user_logs/service';
import { User } from './model';
import { Post } from '../posts/models/Post';
import { ArchivePost } from '../posts/models/ArchivePost';
import { removeArchivedPost, removePost, saveDeletedPost } from '../posts/service';
import { updateLocationCountValue } from '../locations/service';
import { findCreditByUserId } from '../credits/service';
import hasCredits from '../../../utils/doesUserHaveCredits';

const login = async (req: Request, res: Response, next: NextFunction) => {
  const { phone, password } = req.body;

  try {
    await phoneSchema.validate(phone, { abortEarly: false });
    await passwordSchema.validate(password, { abortEarly: false });

    const user = await findUserByPhone(phone);
    if (!user) return res.status(200).json({ isRedirectToRegister: true });

    if (user && user.status === 'not_verified')
      return res.status(200).json({ nextOperation: 'verify phone', userId: user.id });

    if (user && user.is_blocked) throw new ErrorHandler(403, 'You are blocked');
    if (user && user.is_deleted) throw new ErrorHandler(403, 'Your account has been deleted');

    const isValidPassword = await verifyToken(password, user.password);
    if (!isValidPassword) throw new ErrorHandler(403, 'Incorrect phone or password');

    const credits = await findCreditByUserId(user.id);

    const userHasCredits = credits ? hasCredits(credits) : false;

    const userPayload = {
      id: user.id,
      phone: user.phone,
      is_agent: user.is_agent,
      status: user.status,
      userHasCredits,
    };

    const token = await signJwt(userPayload);

    logger.info(`User: ${user?.phone} logged in successfully`);
    await saveUserLog([
      { post_id: undefined, transaction: undefined, user: user.phone, activity: 'Logged in successfully' },
    ]);

    // @ts-ignore
    res.cookie('token', token, config.cookieOptions);
    return res.status(200).json({ success: userPayload }); // Logged in successfully
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error) {
    const user = await findUserByPhone(phone);
    logger.error(`${error.name}: ${error.message}`);
    logger.error(`User: ${phone} logged in attempt failed`);
    await saveUserLog([
      { post_id: undefined, transaction: undefined, user: phone, activity: 'Logged in attempt failed' },
    ]);
    if (error.name === 'ValidationError') {
      error.message = 'Invalid payload passed';
    }
    const slackMsg = `Failed login attempt\n${phone ? `<https://wa.me/965${phone}|${phone}>` : ''} - ${
      user && user.admin_comment ? `${user.admin_comment}\n` : ''
    }\nError message: "${error.message}"`;
    await alertOnSlack('non-imp', slackMsg);
    return next(error);
  }
};

const register = async (req: Request, res: Response, next: NextFunction) => {
  const { phone, password } = req.body;

  try {
    await phoneSchema.validate(phone, { abortEarly: false });
    await passwordSchema.validate(password, { abortEarly: false });

    const user = await findUserByPhone(phone);
    if (user && user.status !== 'not_verified') return res.status(200).json({ isRedirectToLogin: true });

    if (user && user.status === 'not_verified')
      return res.status(200).json({ nextOperation: 'verify mobile', userId: user.id });

    const hashedPassword = await hashPassword(password);

    const userObj: IUser = await saveUser(phone, hashedPassword, 'not_verified');
    await sendOtpVerificationSms(phone, 'registration', userObj);

    logger.info(`Registration attempt by user ${phone}. Otp sent `);
    await saveUserLog([
      { post_id: undefined, transaction: undefined, user: phone, activity: 'Registration attempt. Otp sent' },
    ]);

    return res.status(200).json({ nextOperation: true, userId: userObj?.id });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    logger.error(`${error.name}: ${error.message}`);
    const slackMsg = `User registration failed\n${
      phone ? `<https://wa.me/965${phone}|${phone}>` : ''
    }\nError message: "${error.message}"`;
    await alertOnSlack('non-imp', slackMsg);
    if (error.name === 'ValidationError') {
      error.message = 'Invalid payload passed';
      return next(error);
    }
    if (error.message === 'All SMS messages failed to send') {
      error.message = 'Failed to send otp';
    }

    logger.error(`Registration attempt failed by user ${phone}`);
    await saveUserLog([
      { post_id: undefined, transaction: undefined, user: phone, activity: 'Registration attempt failed' },
    ]);

    return next(error);
  }
};

const logout = async (_req: Request, res: Response) => {
  res.clearCookie('token');
  return res.status(200).json({ success: 'Logged out successfully' });
};

const doesUserExists = async (req: Request, res: Response, next: NextFunction) => {
  const { phone } = req.body;

  try {
    await phoneSchema.validate(phone, { abortEarly: false });
    const user = await findUserByPhone(phone);

    if (!user) throw new ErrorHandler(404, 'No user with this phone is found. Please register');

    return res.status(200).json({ userId: user.id });
  } catch (error) {
    logger.error(`${error.name}: ${error.message}`);
    return next(error);
  }
};

const resetPassword = async (req: Request, res: Response, next: NextFunction) => {
  const { phone, password } = req.body;
  let user;

  try {
    await phoneSchema.validate(phone, { abortEarly: false });
    await passwordSchema.validate(password, { abortEarly: false });

    user = await findUserByPhone(phone);

    if (!user) throw new ErrorHandler(404, 'No user with this phone is found. Please register');

    await updateUserPassword(user, password);

    logger.info(`Password reset attempt by user ${phone} successful`);
    await saveUserLog([
      { post_id: undefined, transaction: undefined, user: phone, activity: 'Password reset attempt successful' },
    ]);

    const slackMsg = `Password reset successfully\n\n ${
      user?.phone ? `<https://wa.me/965${user?.phone}|${user?.phone}>` : ''
    } - ${user.admin_comment ? user.admin_comment : ''}`;
    await alertOnSlack('imp', slackMsg);
    await sendSms(user.phone, 'Password reset successfully');

    const credits = await findCreditByUserId(user.id);

    const userHasCredits = credits ? hasCredits(credits) : false;

    const userPayload = {
      id: user.id,
      phone: user.phone,
      is_agent: user.is_agent,
      status: user.status,
      userHasCredits,
    };

    const token = await signJwt(userPayload);
    // @ts-ignore
    res.cookie('token', token, config.cookieOptions);
    return res.status(200).json({ success: userPayload });
  } catch (error) {
    logger.error(`${error.name}: ${error.message}`);
    logger.error(
      `Password reset attempt failed.\n${user?.phone ? `<https://wa.me/965${user?.phone}|${user?.phone}>` : ''} - ${
        user?.admin_comment ? user.admin_comment : ''
      }`,
    );
    await saveUserLog([
      { post_id: undefined, transaction: undefined, user: phone, activity: 'Password reset attempt failed' },
    ]);
    return next(error);
  }
};

const removeUser = async (req: Request, res: Response, next: NextFunction) => {
  const { userId } = req.body;

  try {
    const user = await findUserById(userId);

    if (!user) throw new ErrorHandler(404, 'User not found');
    user.is_deleted = true;

    await User.save(user);

    const activePosts = await Post.find({ where: { user: { id: userId } } });
    const archivedPosts = await ArchivePost.find({ where: { user: { id: userId } } });

    activePosts.forEach(async (post) => {
      await removePost(post.id, post);
      await saveDeletedPost(post, post.user);
      await updateLocationCountValue(post.city_id, 'decrement');
    });

    archivedPosts.forEach(async (post) => {
      await removeArchivedPost(post.id, post);
      await saveDeletedPost(post, post.user);
      await updateLocationCountValue(post.city_id, 'decrement');
    });

    logger.info(`User ${user?.phone} deleted`);
    await saveUserLog([
      {
        post_id: undefined,
        transaction: undefined,
        user: user?.phone,
        activity: `User ${user?.phone} deleted`,
      },
    ]);

    const slackMsg = `User <https://wa.me/965${user.phone}|${user.phone}> - ${user?.admin_comment || ''} is deleted`;
    await alertOnSlack('imp', slackMsg);

    return res.status(200).json({ success: 'User deleted successfully' });
  } catch (error) {
    logger.error(`${error.name}: ${error.message}`);
    return next(error);
  }
};

const findAdminComment = async (req: Request, res: Response, next: NextFunction) => {
  const { phone } = req.body;

  try {
    const user = await findUserByPhone(phone);
    if (!user) throw new ErrorHandler(404, 'User not found');
    return res.status(200).json({ adminComment: user.admin_comment });
  } catch (error) {
    logger.error(`${error.name}: ${error.message}`);
    return next(error);
  }
};

export { login, logout, register, doesUserExists, resetPassword, removeUser, findAdminComment };
