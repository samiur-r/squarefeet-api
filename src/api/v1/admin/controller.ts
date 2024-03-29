/* eslint-disable security/detect-object-injection */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-param-reassign */
import { NextFunction, Request, Response } from 'express';

import { hashPassword, verifyToken } from '../../../utils/passwordUtils';
import logger from '../../../utils/logger';
import {
  findAdminByPhone,
  geCreditsSummary,
  getPostSummary,
  getTransactionSummary,
  getUserSummary,
  saveAdmin,
} from './service';
import ErrorHandler from '../../../utils/ErrorHandler';
import { signJwt } from '../../../utils/jwtUtils';
import config from '../../../config';
import {
  filterPostsForAdmin,
  findArchivedPostById,
  findDeletedPostById,
  findPostById,
  generatePostId,
  removeAllPostsOfUser,
  removeArchivedPost,
  removeDeletedPost,
  removePost,
  saveDeletedPost,
  savePost,
  updatePostRepostVals,
  updatePostStickyVal,
} from '../posts/service';
import {
  filterUsersForAdmin,
  findUserById,
  findUserWithAgentInfo,
  getLastActivity,
  updateIsUserAnAgent,
  updateUser,
  updateUserStatus,
} from '../users/service';
import { fetchLogsByPostId, fetchLogsByUser, saveUserLog, updatePhoneOfLogs } from '../user_logs/service';
import { findCreditByUserId, initCredits, setCreditsToZeroByUserId, updateCredit } from '../credits/service';
import { filterTransactionsForAdmin, findTransactionById } from '../transactions/service';
import { findAgentById, findAgentByUserId, initOrUpdateAgent, setSubscriptionNull } from '../agents/service';
import { Credit } from '../credits/model';
import { Agent } from '../agents/model';
import { sendSms } from '../../../utils/smsUtils';
import { IPost } from '../posts/interfaces';
import { ITransaction } from '../transactions/interfaces';
import sortFunctions from '../../../utils/sortUsersFunctions';
import { User } from '../users/model';
import { getSocketIo } from '../../../utils/socketIO';
import { DeletedPost } from '../posts/models/DeletedPost';
import { Post } from '../posts/models/Post';
import { ArchivePost } from '../posts/models/ArchivePost';
import { updateLocationCountValue } from '../locations/service';
import { parseTimestamp } from '../../../utils/timestampUtls';
import AppDataSource from '../../../db';
import { Transaction } from '../transactions/model';
import { Package } from '../packages/model';
import { Otp } from '../otps/model';
import { alertOnSlack } from '../../../utils/slackUtils';

const register = async (req: Request, res: Response, next: NextFunction) => {
  const { phone, password, name } = req.body;

  try {
    const hashedPassword = await hashPassword(password);

    await saveAdmin(phone, hashedPassword, name);
    return res.status(200).json({ success: 'New admin created successfully' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    logger.error(`${error.name}: ${error.message}`);
    return next(error);
  }
};

const login = async (req: Request, res: Response, next: NextFunction) => {
  const { phone, password } = req.body;

  try {
    const admin = await findAdminByPhone(phone);
    if (!admin) throw new ErrorHandler(403, 'Incorrect phone or password');

    const isValidPassword = await verifyToken(password, admin.password);
    if (!isValidPassword) throw new ErrorHandler(403, 'Incorrect phone or password');

    const adminPayload = {
      id: admin.id,
      phone: admin.phone,
      name: admin.name,
      is_super: admin.is_super,
      admin_status: true,
    };

    const token = await signJwt(adminPayload);

    // @ts-ignore
    res.cookie('token', token, config.cookieOptions);
    return res.status(200).json({ success: adminPayload });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error) {
    logger.error(`${error.name}: ${error.message}`);
    return next(error);
  }
};

const logout = async (_req: Request, res: Response) => {
  res.clearCookie('token');
  return res.status(200).json({ success: 'Logged out successfully' });
};

const filterPosts = async (req: Request, res: Response, next: NextFunction) => {
  const {
    locationToFilter,
    categoryToFilter,
    propertyTypeToFilter,
    fromPriceToFilter,
    toPriceToFilter,
    fromCreationDateToFilter,
    toCreationDateToFilter,
    fromPublicDateToFilter,
    toPublicDateToFilter,
    stickyStatusToFilter,
    userTypeToFilter,
    orderByToFilter,
    postStatusToFilter,
    userId,
    offset,
  } = req.body;
  try {
    const { posts, totalPages, totalResults } = await filterPostsForAdmin(
      locationToFilter,
      categoryToFilter,
      propertyTypeToFilter,
      fromPriceToFilter,
      toPriceToFilter,
      fromCreationDateToFilter,
      toCreationDateToFilter,
      fromPublicDateToFilter,
      toPublicDateToFilter,
      stickyStatusToFilter,
      userTypeToFilter,
      orderByToFilter,
      postStatusToFilter,
      userId,
      offset,
    );
    return res.status(200).json({ posts, totalPages, totalResults });
  } catch (error) {
    logger.error(`${error.name}: ${error.message}`);
    return next(error);
  }
};

const stickPost = async (req: Request, res: Response, next: NextFunction) => {
  const { postId } = req.body;
  const userId = res.locals.user.payload.id;
  let user;

  try {
    const post = await findPostById(parseInt(postId, 10));
    if (!post) throw new ErrorHandler(401, 'Post not found');
    if (post.is_sticky) throw new ErrorHandler(304, 'Post is already sticky');

    user = await findUserById(userId);

    await updatePostStickyVal(post, true);
    const slackMsg = `Post titled ${post.title} is sticked by\n<https://wa.me/965${user?.phone}|${user?.phone}> - ${
      user?.admin_comment || ''
    }`;
    await alertOnSlack('imp', slackMsg);
    logger.info(`Post ${post.id} sticked by user ${user?.phone}`);
    return res.status(200).json({ success: 'Post is sticked successfully' });
  } catch (error) {
    logger.error(`${error.name}: ${error.message}`);
    logger.error(`Post ${postId} stick attempt by user ${user?.phone}} failed`);
    return next(error);
  }
};

const deletePost = async (req: Request, res: Response, next: NextFunction) => {
  const { postId } = req.body;
  const userObj = res.locals.user.payload;
  let isArchive = false;

  try {
    if (!postId) throw new ErrorHandler(404, 'Post not found');
    let post: any;

    post = await findPostById(parseInt(postId, 10));

    if (!post) {
      post = await findArchivedPostById(parseInt(postId, 10));
      isArchive = true;
    }

    if (!post) throw new ErrorHandler(401, 'Post not found');

    const user = await findUserById(post.user.id);
    if (!user) throw new ErrorHandler(500, 'Something went wrong');

    if (isArchive) await removeArchivedPost(post.id, post);
    else await removePost(post.id, post);

    await updateLocationCountValue(post.city_id, 'decrement');

    post.media = [];

    await saveDeletedPost(post, user);
    logger.info(`Post ${postId} deleted by user ${userObj.phone}`);
    return res.status(200).json({ success: 'Post deleted successfully' });
  } catch (error) {
    logger.error(`${error.name}: ${error.message}`);
    logger.error(`Post ${postId} delete attempt by user ${userObj.phone} failed`);
    return next(error);
  }
};

const deletePostPermanently = async (req: Request, res: Response, next: NextFunction) => {
  const { postId } = req.body;
  const userObj = res.locals.user.payload;

  try {
    if (!postId) throw new ErrorHandler(404, 'Post not found');
    const post = await findPostById(postId);
    if (!post) throw new ErrorHandler(404, 'Post not found');

    await removePost(postId);
    await removeArchivedPost(postId);
    await DeletedPost.delete({ id: postId });
    await updateLocationCountValue(post.city_id, 'decrement');
    logger.info(`Post ${postId} permanently deleted by user ${userObj.phone}`);
    return res.status(200).json({ success: 'Post deleted successfully' });
  } catch (error) {
    logger.error(`${error.name}: ${error.message}`);
    logger.error(`Post ${postId} permanently delete attempt by user ${userObj.phone} failed`);
    return next(error);
  }
};

const rePost = async (req: Request, res: Response, next: NextFunction) => {
  const user = res.locals.user.payload;
  const { postId } = req.body;

  try {
    if (!postId) throw new ErrorHandler(404, 'Invalid payload passed');
    let post;

    post = await findPostById(postId);
    if (!post) post = await findArchivedPostById(postId);
    if (!post) throw new ErrorHandler(500, 'Something went wrong');

    const postedDate = post.posted_date;
    const publicDate = new Date();

    const postInfo = {
      id: post.id,
      title: post.title,
      cityId: post.city_id,
      cityTitle: post.city_title,
      stateId: post.state_id,
      stateTitle: post.state_title,
      propertyId: post.property_id,
      propertyTitle: post.property_title,
      categoryId: post.category_id,
      categoryTitle: post.category_title,
      price: post.price,
      description: post.description,
      media: post.media,
      sticked_date: post.sticked_date,
      repost_count: post.repost_count + 1,
      views: 0,
    };

    const newPost = await savePost(postInfo, post.user, 'regular', postedDate, publicDate);
    await removeArchivedPost(post.id);
    const repostCount = post.repost_count + 1;
    await updatePostRepostVals(newPost, true, repostCount);

    logger.info(`Post ${post.id} reposted by admin ${user?.phone}`);
    await saveUserLog([
      {
        post_id: post.id,
        transaction: undefined,
        user: post.user.id,
        activity: `Post ${post.id} reposted by admin ${user?.phone}`,
      },
    ]);
    return res.status(200).json({ success: 'Post is reposted successfully' });
  } catch (error) {
    logger.error(`${error.name}: ${error.message}`);
    logger.error(`Post ${postId} repost by user ${user.phone} failed`);
    return next(error);
  }
};

const fetchLogs = async (req: Request, res: Response, next: NextFunction) => {
  const { postId, user, offset } = req.body;
  let response: any;

  try {
    if (postId) response = await fetchLogsByPostId(postId, offset);
    else if (user) response = await fetchLogsByUser(user, offset);
    response?.logs.forEach((log: any) => {
      log.date = parseTimestamp(log.created_at).parsedDate;
      log.time = parseTimestamp(log.created_at).parsedTime;
    });
    return res
      .status(200)
      .json({ logs: response.logs, totalPages: response.totalPages, totalResults: response.totalResults });
  } catch (error) {
    logger.error(`${error.name}: ${error.message}`);
    return next(error);
  }
};

const filterUsers = async (req: Request, res: Response, next: NextFunction) => {
  const {
    statusToFilter,
    phoneToFilter,
    adminCommentToFilter,
    fromCreationDateToFilter,
    toCreationDateToFilter,
    orderByToFilter,
    offset,
  } = req.body;
  let totalPages = null;

  try {
    const { users, count }: any = await filterUsersForAdmin(
      statusToFilter,
      phoneToFilter,
      adminCommentToFilter,
      fromCreationDateToFilter,
      toCreationDateToFilter,
      orderByToFilter,
      offset,
    );

    totalPages = Math.ceil(count / 50);

    const parsedUsers = users.map((user: any) => ({
      id: user.id,
      phone: user.phone,
      status: user.status,
      is_agent: user.is_agent,
      adminComment: user.admin_comment,
      is_blocked: user.is_blocked,
      is_deleted: user.is_deleted,
      lastActivityDate: user.posts && user.posts.length ? parseTimestamp(getLastActivity(user)).parsedDate : null,
      lastActivityTime: user.posts && user.posts.length ? parseTimestamp(getLastActivity(user)).parsedTime : null,
      registeredDate: parseTimestamp(user.created_at).parsedDate,
      registeredTime: parseTimestamp(user.created_at).parsedTime,
      created_at: user.created_at,
      subscriptionStartDate:
        user.agent && user.agent.length && user?.agent[0]?.subscription_start_date
          ? parseTimestamp(user.agent[0].subscription_start_date).parsedDate
          : null,
      subscriptionStartTime:
        user.agent && user.agent.length && user?.agent[0]?.subscription_start_date
          ? parseTimestamp(user.agent[0].subscription_start_date).parsedTime
          : null,
      subscriptionEndsDate:
        user.agent && user.agent.length && user?.agent[0]?.subscription_ends_date
          ? parseTimestamp(user.agent[0].subscription_ends_date).parsedDate
          : null,
      subscriptionEndsTime:
        user.agent && user.agent.length && user?.agent[0]?.subscription_ends_date
          ? parseTimestamp(user.agent[0].subscription_ends_date).parsedTime
          : null,
      post: {
        active: user.posts?.length,
        repost: user.posts?.filter((post: IPost) => post.is_reposted).length,
        archived: user.archive_posts?.length,
        deleted: user.deleted_posts?.length,
      },
      credits: {
        free: user?.credits[0]?.free ?? 0,
        regular: user?.credits[0]?.regular ?? 0,
        sticky: user?.credits[0]?.sticky ?? 0,
        agent: user?.credits[0]?.agent ?? 0,
      },
      has_zero_credits: user?.credits[0]?.free === 0 || user.status === 'not_verified',
      payment: {
        regular: user?.transactions
          .filter(
            (transaction: ITransaction) =>
              transaction.status === 'completed' && ['regular1', 'regular2'].includes(transaction.package_title),
          )
          .reduce((total: number, transaction: any) => total + transaction.package.numberOfCredits, 0),
        sticky: user.transactions
          .filter(
            (transaction: ITransaction) =>
              transaction.status === 'completed' && ['sticky1', 'sticky2'].includes(transaction.package_title),
          )
          .reduce((total: number, transaction: any) => total + transaction.package.numberOfCredits, 0),
        agent: user.transactions
          .filter(
            (transaction: ITransaction) =>
              transaction.status === 'completed' && ['agent1', 'agent2'].includes(transaction.package_title),
          )
          .reduce((total: number, transaction: any) => total + transaction.package.numberOfCredits, 0),
      },
    }));

    return res.status(200).json({ users: parsedUsers, totalPages, totalResults: count });
  } catch (error) {
    logger.error(`${error.name}: ${error.message}`);
    return next(error);
  }
};

const fetchUser = async (req: Request, res: Response, next: NextFunction) => {
  const { userId } = req.body;

  try {
    const where: any = {};
    where.id = userId;

    const queryBuilder = User.createQueryBuilder('user')
      .leftJoin('user.posts', 'post')
      .leftJoin('user.archive_posts', 'archive_post')
      .leftJoin('user.deleted_posts', 'deleted_post')
      .leftJoin('user.credits', 'credits')
      .leftJoin('user.transactions', 'transactions')
      .leftJoin('transactions.package', 'package')
      .leftJoin('user.agent', 'agent')
      .select([
        'user.id',
        'user.is_agent',
        'user.status',
        'user.phone',
        'user.admin_comment',
        'user.created_at',
        'user.is_blocked',
        'user.is_deleted',
        'post.id',
        'post.public_date',
        'post.is_reposted',
        'archive_post.id',
        'deleted_post.id',
        'credits.free',
        'credits.regular',
        'credits.sticky',
        'credits.agent',
        'transactions.status',
        'transactions.package_title',
        'package.numberOfCredits',
        'agent.subscription_start_date',
        'agent.subscription_ends_date',
      ])
      .where(where)
      .groupBy('user.id, post.id, archive_post.id, deleted_post.id, credits.id, transactions.id, package.id, agent.id');

    const user: any = await queryBuilder.getOne();

    const parsedUser = {
      id: user.id,
      phone: user.phone,
      status: user.status,
      is_agent: user.is_agent,
      adminComment: user.admin_comment,
      is_blocked: user.is_blocked,
      is_deleted: user.is_deleted,
      registeredDate: parseTimestamp(user.created_at).parsedDate,
      registeredTime: parseTimestamp(user.created_at).parsedTime,
      subscriptionStartDate:
        user.agent && user.agent.length && user?.agent[0]?.subscription_start_date
          ? parseTimestamp(user.agent[0].subscription_start_date).parsedDate
          : null,
      subscriptionStartTime:
        user.agent && user.agent.length && user?.agent[0]?.subscription_start_date
          ? parseTimestamp(user.agent[0].subscription_start_date).parsedTime
          : null,
      subscriptionEndsDate:
        user.agent && user.agent.length && user?.agent[0]?.subscription_ends_date
          ? parseTimestamp(user.agent[0].subscription_ends_date).parsedDate
          : null,
      subscriptionEndsTime:
        user.agent && user.agent.length && user?.agent[0]?.subscription_ends_date
          ? parseTimestamp(user.agent[0].subscription_ends_date).parsedTime
          : null,
      lastActivityDate: user.posts && user.posts.length ? parseTimestamp(getLastActivity(user)).parsedDate : null,
      lastActivityTime: user.posts && user.posts.length ? parseTimestamp(getLastActivity(user)).parsedTime : null,
      post: {
        active: user.posts?.length,
        repost: user.posts?.filter((post: IPost) => post.is_reposted).length,
        archived: user.archive_posts?.length,
        deleted: user.deleted_posts?.length,
      },
      credits: {
        free: user?.credits[0]?.free ?? 0,
        regular: user?.credits[0]?.regular ?? 0,
        sticky: user?.credits[0]?.sticky ?? 0,
        agent: user?.credits[0]?.agent ?? 0,
      },
      payment: {
        regular: user?.transactions
          .filter(
            (transaction: ITransaction) =>
              transaction.status === 'completed' && ['regular1', 'regular2'].includes(transaction.package_title),
          )
          .reduce((total: number, transaction: any) => total + transaction.package.numberOfCredits, 0),
        sticky: user.transactions
          .filter(
            (transaction: ITransaction) =>
              transaction.status === 'completed' && ['sticky1', 'sticky2'].includes(transaction.package_title),
          )
          .reduce((total: number, transaction: any) => total + transaction.package.numberOfCredits, 0),
        agent: user.transactions
          .filter(
            (transaction: ITransaction) =>
              transaction.status === 'completed' && ['agent1', 'agent2'].includes(transaction.package_title),
          )
          .reduce((total: number, transaction: any) => total + transaction.package.numberOfCredits, 0),
      },
    };

    return res.status(200).json({ user: parsedUser });
  } catch (error) {
    logger.error(`${error.name}: ${error.message}`);
    return next(error);
  }
};

const updateUserCredit = async (req: Request, res: Response, next: NextFunction) => {
  const { creditAmount, creditType, userId } = req.body;
  const admin = res.locals.user.payload;

  try {
    const credit = await findCreditByUserId(userId);
    if (!credit) throw new ErrorHandler(401, 'Credit record not found');

    const updatedCredit = await Credit.save({
      ...credit,
      [creditType]: creditAmount,
    });
    logger.info(
      `User ${credit?.user?.phone} credits updated from ${credit.free}/${credit.regular}/${credit.sticky}/${credit.agent} to ${updatedCredit.free}/${updatedCredit.regular}/${updatedCredit.sticky}/${updatedCredit.agent}`,
    );
    await saveUserLog([
      {
        post_id: undefined,
        transaction: undefined,
        user: credit?.user?.phone,
        activity: `User ${credit?.user?.phone} credits updated from ${credit.free}/${credit.regular}/${credit.sticky}/${credit.agent} to ${updatedCredit.free}/${updatedCredit.regular}/${updatedCredit.sticky}/${updatedCredit.agent}`,
      },
    ]);
    const user = await findUserById(userId);
    const slackMsg = `User credits updated by admin ${admin.phone}\n<https://wa.me/965${credit?.user?.phone}|${
      credit?.user?.phone
    }> - ${user?.admin_comment || ''}\ncredits updated from ${credit.free}/${credit.regular}/${credit.sticky}/${
      credit.agent
    } to ${updatedCredit.free}/${updatedCredit.regular}/${updatedCredit.sticky}/${updatedCredit.agent}`;
    await alertOnSlack('imp', slackMsg);
    return res.status(200).json({ success: 'Credit updated successfully' });
  } catch (error) {
    logger.error(`${error.name}: ${error.message}`);
    return next(error);
  }
};

const fetchUserWithAgentInfo = async (req: Request, res: Response, next: NextFunction) => {
  const { userId } = req.body;

  try {
    const user = await findUserWithAgentInfo(userId);
    if (!user) throw new ErrorHandler(401, 'User not found');
    return res.status(200).json({ user });
  } catch (error) {
    logger.error(`${error.name}: ${error.message}`);
    return next(error);
  }
};

const editUser = async (req: Request, res: Response, next: NextFunction) => {
  const { id, phone, adminComment, password } = req.body;
  const admin = res.locals?.user?.payload;

  try {
    const user = await findUserById(id);
    if (!user) throw new ErrorHandler(401, 'User not found');

    await updateUser(user, phone, adminComment, password);

    if (phone !== user.phone) {
      await updatePhoneOfLogs(user.phone, phone);
      logger.info(`User ${user?.phone} phone updated to ${phone} by the admin ${admin?.phone}`);
      await saveUserLog([
        {
          post_id: undefined,
          transaction: undefined,
          user: phone !== user.phone ? phone : user?.phone,
          activity: `User ${user?.phone} phone updated to ${phone} by the admin ${admin?.phone}`,
        },
      ]);
      const slackMsg = `User ${user?.phone} - ${
        user.admin_comment || ''
      } phone updated to <https://wa.me/965${phone}|${phone}> by the admin ${admin?.phone}`;
      await alertOnSlack('imp', slackMsg);
    }

    if (password) {
      logger.info(`User ${user?.phone} password updated`);
      await saveUserLog([
        {
          post_id: undefined,
          transaction: undefined,
          user: user?.phone,
          activity: `User ${user?.phone} password updated`,
        },
      ]);
    }

    return res.status(200).json({ success: 'User updated successfully' });
  } catch (error) {
    logger.error(`${error.name}: ${error.message}`);
    return next(error);
  }
};

const editAgent = async (req: Request, res: Response, next: NextFunction) => {
  const { userId, agentId, name, email, instagram, twitter, description } = req.body;

  try {
    if (!name) throw new ErrorHandler(404, 'Invalid agent id or name');

    if (agentId) {
      const agent = await findAgentById(agentId);
      if (!agent) throw new ErrorHandler(401, 'Agent not found');

      const agentData = Agent.create({
        ...agent,
        name,
        email,
        instagram,
        twitter,
        description,
      });

      await Agent.save(agentData);
    } else {
      const user = await findUserById(userId);
      if (!user) throw new ErrorHandler(401, 'user not found');

      const agentData = Agent.create({
        name,
        email,
        instagram,
        twitter,
        description,
        user,
      });

      await Agent.save(agentData);
    }

    return res.status(200).json({ success: 'Agent updated successfully' });
  } catch (error) {
    logger.error(`${error.name}: ${error.message}`);
    return next(error);
  }
};

const verifyUser = async (req: Request, res: Response, next: NextFunction) => {
  const { userId } = req.body;

  try {
    if (!userId) throw new ErrorHandler(404, 'Invalid agent id or name');
    const user = await findUserById(userId);
    if (!user) throw new ErrorHandler(401, 'Agent not found');

    await updateUserStatus(userId, 'verified');
    await initCredits(user);
    await sendSms(user.phone, 'Congratulations! you have been registered successfully');

    return res.status(200).json({ success: 'User verified successfully' });
  } catch (error) {
    logger.error(`${error.name}: ${error.message}`);
    return next(error);
  }
};

const fetchTransactions = async (req: Request, res: Response, next: NextFunction) => {
  const { statusToFilter, typeToFilter, fromCreationDateToFilter, toCreationDateToFilter, userId, offset } = req.body;

  try {
    const { transactions, totalPages, totalResults } = await filterTransactionsForAdmin(
      statusToFilter,
      typeToFilter,
      fromCreationDateToFilter,
      toCreationDateToFilter,
      userId,
      offset,
    );
    return res.status(200).json({ transactions, totalPages, totalResults });
  } catch (error) {
    logger.error(`${error.name}: ${error.message}`);
    return next(error);
  }
};

const fetchDashboardInfo = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userSummary = await getUserSummary();
    const postSummary = await getPostSummary();
    const transactionSummary = await getTransactionSummary();
    const creditSummary = await geCreditsSummary();
    return res.status(200).json({ userSummary, postSummary, transactionSummary, creditSummary });
  } catch (error) {
    logger.error(`${error.name}: ${error.message}`);
    return next(error);
  }
};

const updateUserBlockStatus = async (req: Request, res: Response, next: NextFunction) => {
  const { userId, status } = req.body;
  const admin = res.locals?.user?.payload;

  try {
    if (!userId) throw new ErrorHandler(404, 'Invalid user id');
    const user = await findUserById(userId);
    if (!user) throw new ErrorHandler(401, 'User not found');

    if (user.is_blocked && status) throw new ErrorHandler(403, 'User is already blocked');

    if (!user.is_blocked && status === false) throw new ErrorHandler(403, 'You can not unblock a non blocked user');

    await User.save({
      ...user,
      is_agent: status ? false : user.is_agent,
      is_blocked: status,
    });

    if (status) {
      // const socketIo: any = await getSocketIo();
      // socketIo.emit('userBlocked', { user: user.phone });

      await setSubscriptionNull(userId);
      await removeAllPostsOfUser(userId);
      await setCreditsToZeroByUserId(userId);
    }

    logger.info(`User ${user.phone} ${status ? 'blocked' : 'unblocked'} by admin ${admin.phone}`);
    await saveUserLog([
      {
        post_id: undefined,
        transaction: undefined,
        user: user.phone,
        activity: `User ${user.phone} ${status ? 'blocked' : 'unblocked'} by admin ${admin.phone}`,
      },
    ]);

    return res.status(200).json({ success: `User ${status === true ? ' blocked' : ' unblocked'} successfully` });
  } catch (error) {
    logger.error(`${error.name}: ${error.message}`);
    return next(error);
  }
};

const updateUserComment = async (req: Request, res: Response, next: NextFunction) => {
  const { userId, adminComment } = req.body;

  try {
    if (!userId) throw new ErrorHandler(404, 'Invalid user id');
    const user = await findUserById(userId);
    if (!user) throw new ErrorHandler(401, 'User not found');

    await User.save({
      ...user,
      admin_comment: adminComment && adminComment !== '' ? adminComment : null,
    });

    return res.status(200).json({ success: `User comment updated successfully` });
  } catch (error) {
    logger.error(`${error.name}: ${error.message}`);
    return next(error);
  }
};

const updateTransactionStatus = async (req: Request, res: Response, next: NextFunction) => {
  const { transactionId, transactionStatus } = req.body;

  try {
    if (!transactionId) throw new ErrorHandler(404, 'Invalid transaction id');
    const transaction = await findTransactionById(transactionId);
    if (!transaction) throw new ErrorHandler(401, 'transaction not found');

    await Transaction.save({
      ...transaction,
      status: transactionStatus,
    });

    if (transactionStatus === 'completed') {
      const packageTitle = transaction.package_title.slice(0, -1);

      await updateCredit(transaction.user.id, packageTitle, transaction.package.numberOfCredits, 'ADD');

      if (packageTitle === 'agent') {
        await updateIsUserAnAgent(transaction.user.id, true);
        await initOrUpdateAgent(transaction.user, transaction.package_title);
      }
    }

    return res.status(200).json({ success: `Transaction updated successfully` });
  } catch (error) {
    logger.error(`${error.name}: ${error.message}`);
    return next(error);
  }
};

const removeUserPermanently = async (req: Request, res: Response, next: NextFunction) => {
  const { userId } = req.body;

  try {
    if (!userId) throw new ErrorHandler(404, 'Invalid payload passed');

    await Credit.delete({ user: { id: userId } });
    await Transaction.delete({ user: { id: userId } });
    await Otp.delete({ user: { id: userId } });
    await Agent.delete({ user: { id: userId } });
    await Credit.delete({ user: { id: userId } });
    await Transaction.delete({ user: { id: userId } });
    await DeletedPost.delete({ user: { id: userId } });

    const activePosts = await Post.find({ where: { user: { id: userId } } });
    const archivedPosts = await ArchivePost.find({ where: { user: { id: userId } } });

    activePosts.forEach(async (post) => {
      await removePost(post.id, post);
      await updateLocationCountValue(post.city_id, 'decrement');
    });

    archivedPosts.forEach(async (post) => {
      await removeArchivedPost(post.id, post);
      await updateLocationCountValue(post.city_id, 'decrement');
    });

    await User.delete({ id: userId });

    return res.status(200).json({ success: 'User deleted permanently' });
  } catch (error) {
    logger.error(`${error.name}: ${error.message}`);
    return next(error);
  }
};

const restore = async (req: Request, res: Response, next: NextFunction) => {
  const user = res.locals.user.payload;
  const { userId } = req.body;

  try {
    if (!userId) throw new ErrorHandler(404, 'Invalid payload passed');
    const userObj = await findUserById(userId);
    if (!userObj) throw new ErrorHandler(500, 'Something went wrong');

    userObj.is_deleted = false;
    await User.save(userObj);

    const posts = await DeletedPost.find({ where: { user: { id: userId } } });

    posts.forEach(async (post) => {
      await removeDeletedPost(post.id);

      const postInfo = Post.create({
        ...post,
        post_type: 'active',
      });

      await Post.save(postInfo);
      await updateLocationCountValue(post.city_id, 'increment');
    });

    logger.info(`User ${userObj.phone} restored by admin ${user?.phone}`);
    await saveUserLog([
      {
        post_id: undefined,
        transaction: undefined,
        user: userObj?.phone ?? undefined,
        activity: `User ${userObj.phone} restored by admin ${user?.phone}`,
      },
    ]);
    return res.status(200).json({ success: 'User is restored successfully' });
  } catch (error) {
    logger.error(`${error.name}: ${error.message}`);
    logger.error(`User ${userId} restore attempt by admin ${user.phone} failed`);
    await saveUserLog([
      { post_id: undefined, transaction: undefined, user: userId, activity: 'User restoration failed' },
    ]);
    return next(error);
  }
};

const test = async (req: Request, res: Response, next: NextFunction) => {
  const { userId } = req.body;
  try {
    const posts = await DeletedPost.find({ where: { user: { id: userId } } });

    return res.status(200).json({ posts });
  } catch (error) {
    logger.error(`${error.name}: ${error.message}`);
    return next(error);
  }
};

export {
  test,
  register,
  login,
  logout,
  filterPosts,
  stickPost,
  deletePost,
  fetchLogs,
  filterUsers,
  updateUserCredit,
  fetchUser,
  fetchUserWithAgentInfo,
  editUser,
  editAgent,
  verifyUser,
  fetchTransactions,
  fetchDashboardInfo,
  updateUserBlockStatus,
  deletePostPermanently,
  rePost,
  updateUserComment,
  removeUserPermanently,
  restore,
  updateTransactionStatus,
};
