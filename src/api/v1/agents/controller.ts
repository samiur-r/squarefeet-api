import { NextFunction, Request, Response } from 'express';
import ErrorHandler from '../../../utils/ErrorHandler';
import logger from '../../../utils/logger';
import { findAgentByUserId, updateAgent } from './service';
import { agentSchema } from './validation';

const fetch = async (req: Request, res: Response, next: NextFunction) => {
  const user = res.locals.user.payload;

  try {
    const agent = await findAgentByUserId(user.id);
    return res.status(200).json({ agent });
  } catch (error) {
    logger.error(`${error.name}: ${error.message}`);
    return next(error);
  }
};

const update = async (req: Request, res: Response, next: NextFunction) => {
  const { payload } = req.body;
  const user = res.locals.user.payload;

  try {
    if (!user.is_agent) throw new ErrorHandler(403, 'You are not an agent');
    await agentSchema.validate(payload);
    await updateAgent(payload, user.id);
    return res.status(200).json({ success: 'Your info is updated successfully' });
  } catch (error) {
    logger.error(`${error.name}: ${error.message}`);
    if (error.name === 'ValidationError') {
      error.message = 'Invalid payload passed';
    }
    return next(error);
  }
};

export { fetch, update };
