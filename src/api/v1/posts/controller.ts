import { NextFunction, Request, Response } from 'express';
import ErrorHandler from '../../../utils/ErrorHandler';

import logger from '../../../utils/logger';
import { findUserById } from '../users/service';
import { typeOfCreditToDeduct, updateCredit } from '../credits/service';
import { postSchema } from './validation';
import { findPostById, removePostMedia, savePost, saveTempPost, updatePost } from './service';

const fetchOne = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const post = await findPostById(parseInt(req.params.id, 10));

    if (!post) throw new ErrorHandler(500, 'Something went wrong');

    return res.status(200).json({ success: post });
  } catch (error) {
    logger.error(`${error.name}: ${error.message}`);
    return next(error);
  }
};

const insert = async (req: Request, res: Response, next: NextFunction) => {
  const { postInfo } = req.body;
  const userId = res.locals.user.payload.id;
  const files = req.files as Express.Multer.File[];
  postInfo.media = [];
  postInfo.title = `${postInfo.propertyTitle} ل${postInfo.categoryTitle} في ${postInfo.cityTitle}`;
  postInfo.isStickyPost = postInfo.isStickyPost === 'true';
  const endpoint = req.originalUrl.substring(13, req.originalUrl.length);
  const isTempPost = endpoint === 'temp';

  if (files && files.length) {
    files.forEach((file) => {
      postInfo.media.push(file.filename);
    });
  }

  try {
    await postSchema.validate(postInfo);
    const user = await findUserById(userId);
    if (!user) throw new ErrorHandler(500, 'Something went wrong');

    if (isTempPost) {
      const typeOfCredit = 'sticky';
      await saveTempPost(postInfo, user, typeOfCredit);
    } else {
      const { typeOfCredit, credit } = await typeOfCreditToDeduct(user.id, user.is_agent, postInfo.isStickyPost);
      if (!typeOfCredit) throw new ErrorHandler(402, 'You do not have enough credit');

      await savePost(postInfo, user, typeOfCredit);
      await updateCredit(userId, typeOfCredit, 1, 'SUB', credit);
    }

    return res.status(200).json({ success: 'Post created successfully' });
  } catch (error) {
    logger.error(`${error.name}: ${error.message}`);
    if (error.name === 'ValidationError') {
      error.message = 'Invalid payload passed';
    }
    return next(error);
  }
};

const update = async (req: Request, res: Response, next: NextFunction) => {
  const { postInfo, postId } = req.body;
  postInfo.media = [];
  const files = req.files as Express.Multer.File[];

  if (files && files.length) {
    files.forEach((file) => {
      postInfo.media.push(file.filename);
    });
  }

  try {
    await postSchema.validate(postInfo);
    await removePostMedia(postId);
    await updatePost(postInfo, postId);

    return res.status(200).json({ success: 'Post Updated successfully' });
  } catch (error) {
    logger.error(`${error.name}: ${error.message}`);
    if (error.name === 'ValidationError') {
      error.message = 'Invalid payload passed';
    }
    return next(error);
  }
};

export { insert, update, fetchOne };
