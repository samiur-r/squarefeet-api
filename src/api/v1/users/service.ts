import { Between, In, LessThanOrEqual, Like, MoreThan, MoreThanOrEqual } from 'typeorm';
import logger from '../../../utils/logger';
import { hashPassword } from '../../../utils/passwordUtils';
import { getLocaleDate } from '../../../utils/timestampUtls';
import { IUser } from './interfaces';
import { User } from './model';

const findUserById = async (id: number) => {
  const user = await User.findOneBy({ id });
  return user;
};

const findUserByPhone = async (phone: string) => {
  try {
    const user = await User.findOneBy({ phone });
    return user;
  } catch (error) {
    logger.error(`${error.name}: ${error.message}`);
    return null;
  }
};

const saveUser = async (phone: string, hashedPassword: string, status: string) => {
  const newUser = User.create({
    phone,
    password: hashedPassword,
    status,
  });

  const user = await User.save(newUser);
  return user;
};

const updateUserStatus = async (id: number, status: string) => {
  const userObj = await User.findOneBy({ id });

  const user = await User.save({
    ...userObj,
    status,
  });
  return user;
};

const updateUserPassword = async (userObj: IUser, password: string) => {
  const hashedPassword = await hashPassword(password);
  await User.save({
    ...userObj,
    password: hashedPassword,
  });
};

const updateIsUserAnAgent = async (id: number, isAgent: boolean) => {
  const userObj = await User.findOneBy({ id });

  const user = await User.save({
    ...userObj,
    is_agent: isAgent,
  });
  return user;
};

const updateBulkIsUserAnAgent = async (ids: number[], status: boolean) => {
  await User.update({ id: In(ids) }, { is_agent: status });
};

const getLastActivity = (user: any) => {
  user.posts.sort(
    (a: { public_date: { getTime: () => number } }, b: { public_date: { getTime: () => number } }) =>
      b.public_date.getTime() - a.public_date.getTime(),
  );

  return user.posts[0].public_date;
};

const findUnVerifiedUsers = async () => {
  const lessThanFiveMins = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
  const users = await User.find({ where: { status: 'not_verified', created_at: MoreThan(lessThanFiveMins) } });
  return users;
};

const filterUsersForAdmin = async (
  statusToFilter: string | number,
  phoneToFilter: string,
  adminCommentToFilter: string,
  fromCreationDateToFilter: string | null,
  toCreationDateToFilter: string | null,
  orderByToFilter: string | undefined,
  offset: number,
) => {
  let where: any = {};
  let order = 'user.created_at';

  const today = getLocaleDate(new Date());
  const yesterday = getLocaleDate(new Date(new Date().setDate(new Date().getDate() - 1)));

  if (statusToFilter) {
    switch (statusToFilter) {
      case 'User':
        where.is_agent = false;
        break;
      case 'Agent':
        where.is_agent = true;
        break;
      case 'Verified':
        where.status = 'verified';
        break;
      case 'Not Verified':
        where.status = 'not_verified';
        break;
      case 'Has Regular Credits':
        where = 'credits.regular > 0';
        break;
      case 'Has Sticky Credits':
        where = 'credits.sticky > 0';
        break;
      case 'Has Agent Credits':
        where = 'credits.agent > 0';
        break;
      case 'Zero Free':
        where = `(credits.free < 1 OR user.status = 'not_verified')`;
        break;
      case 'Active Today':
        where = `post.public_date BETWEEN '${today} 00:00:00' AND '${today} 23:59:59'`;
        break;
      case 'Active Yesterday':
        where = `post.public_date BETWEEN '${yesterday} 00:00:00' AND '${yesterday} 23:59:59'`;
        break;
      case 'Has Regular Credit History':
        where = `transactions.status = 'completed' AND (transactions.package_title = 'regular1' OR transactions.package_title = 'regular2')`;
        break;
      case 'Has Sticky Credit History':
        where = `transactions.status = 'completed' AND (transactions.package_title = 'sticky1' OR transactions.package_title = 'sticky2')`;
        break;
      case 'Has Direct Sticky Credit History':
        where = `transactions.status = 'completed' AND transactions.package_title = 'stickyDirect'`;
        break;
      case 'Has Agent History':
        where = `transactions.status = 'completed' AND (transactions.package_title = 'agent1' OR transactions.package_title = 'agent2')`;
        break;
      default:
        break;
    }
  }

  if (phoneToFilter) {
    if (typeof where === 'string') where = `${where} AND phone = ${phoneToFilter}`;
    else where.phone = phoneToFilter;
  }

  if (adminCommentToFilter) {
    if (typeof where === 'string') where = `${where} AND admin_comment LIKE '%${adminCommentToFilter}%'`;
    else where.admin_comment = Like(`%${adminCommentToFilter}%`);
  }

  if (fromCreationDateToFilter && toCreationDateToFilter) {
    if (typeof where === 'string')
      where = `${where} AND user.created_at >= '${fromCreationDateToFilter} 00:00:00' and user.created_at <= '${toCreationDateToFilter} 23:59:59'`;
    else where.created_at = Between(`${fromCreationDateToFilter} 00:00:00`, `${toCreationDateToFilter} 23:59:59`);
  } else if (fromCreationDateToFilter) {
    if (typeof where === 'string') where = `${where} AND user.created_at >= '${fromCreationDateToFilter} 00:00:00'`;
    else where.created_at = MoreThanOrEqual(`${fromCreationDateToFilter} 00:00:00`);
  } else if (toCreationDateToFilter) {
    if (typeof where === 'string') where = `${where} and user.created_at <= '${toCreationDateToFilter} 23:59:59'`;
    else where.created_at = LessThanOrEqual(`${toCreationDateToFilter} 23:59:59`);
  }

  if (orderByToFilter) {
    switch (orderByToFilter) {
      case 'Registered':
        order = 'user.created_at';
        break;
      case 'Mobile':
        order = 'user.phone';
        break;
      // case 'Total Posts':
      //   order = 'total_posts';
      //   break;
      // case 'Active Posts':
      //   order = 'total_active_posts';
      //   break;
      // case 'Archived Posts':
      //   order = 'total_archive_post';
      //   break;
      // case 'Trashed Posts':
      //   order = 'total_deleted_post';
      //   break;
      default:
        break;
    }
  }

  let count = 0;
  let users: any = [];

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
    .groupBy('user.id, post.id, archive_post.id, deleted_post.id, credits.id, transactions.id, package.id, agent.id')
    .orderBy(order, 'DESC')
    .skip(offset)
    .take(50);

  count = await queryBuilder.getCount();
  users = await queryBuilder.getMany();

  if (orderByToFilter === 'Total Posts') {
    users.sort((a: any, b: any) => {
      const totalA = a.posts.length + a.archive_posts.length + a.deleted_posts.length;
      const totalB = b.posts.length + b.archive_posts.length + b.deleted_posts.length;
      return totalB - totalA;
    });
  } else if (orderByToFilter === 'Active Posts') {
    users.sort((a: any, b: any) => {
      const totalA = a.posts.length;
      const totalB = b.posts.length;
      return totalB - totalA;
    });
  } else if (orderByToFilter === 'Archive Posts') {
    users.sort((a: any, b: any) => {
      const totalA = a.archive_posts.length;
      const totalB = b.archive_posts.length;
      return totalB - totalA;
    });
  } else if (orderByToFilter === 'Deleted Posts') {
    users.sort((a: any, b: any) => {
      const totalA = a.deleted_posts.length;
      const totalB = b.deleted_posts.length;
      return totalB - totalA;
    });
  }

  return { users, count };
};

const findUserWithAgentInfo = async (userId: number) => {
  const userWithAgentInfo: any = await User.findOne({
    where: { id: userId },
    relations: ['agent'],
  });

  if (userWithAgentInfo) delete userWithAgentInfo?.password;
  if (userWithAgentInfo && userWithAgentInfo.agent.length) delete userWithAgentInfo?.agent[0]?.user.password;
  return userWithAgentInfo;
};

const updateUser = async (userObj: IUser, phone: string, adminComment: string | undefined, password: string) => {
  const updatedUser = await User.save({
    ...userObj,
    phone,
    admin_comment: adminComment,
  });

  if (password) {
    await updateUserPassword(updatedUser, password);
  }
};

export {
  findUserById,
  findUserByPhone,
  saveUser,
  updateUserStatus,
  updateUserPassword,
  updateIsUserAnAgent,
  updateBulkIsUserAnAgent,
  findUnVerifiedUsers,
  filterUsersForAdmin,
  findUserWithAgentInfo,
  updateUser,
  getLastActivity,
};
