import { Between, In, LessThanOrEqual, MoreThan, MoreThanOrEqual } from 'typeorm';
import { getLocaleDate } from '../../../utils/timestampUtls';
import { Credit } from '../credits/model';
import { Package } from '../packages/model';
import { IPost } from '../posts/interfaces';
import { ArchivePost } from '../posts/models/ArchivePost';
import { DeletedPost } from '../posts/models/DeletedPost';
import { Post } from '../posts/models/Post';
import { findArchivedPostByUserId, findPostByUserId } from '../posts/service';
import { ITransaction } from '../transactions/interfaces';
import { Transaction } from '../transactions/model';
import { User } from '../users/model';
import { Admin } from './model';

const saveAdmin = async (phone: string, password: string, name: string) => {
  const newAdmin = Admin.create({
    phone,
    password,
    name,
  });

  await Admin.save(newAdmin);
};

const findAdminByPhone = async (phone: string) => {
  const admin = await Admin.findOneBy({ phone });
  return admin;
};

const getPaymentHistory = (transactions: ITransaction[] | null) => {
  const payment = {
    regular: 0,
    sticky: 0,
    agent: 0,
  };

  if (transactions) {
    transactions.forEach((transaction: ITransaction) => {
      if (transaction.package_title === 'regular1' || transaction.package_title === 'regular2')
        payment.regular += transaction.amount;
      else if (transaction.package_title === 'sticky1' || transaction.package_title === 'sticky2')
        payment.sticky += transaction.amount;
      else if (transaction.package_title === 'agent1' || transaction.package_title === 'agent2')
        payment.agent += transaction.amount;
    });
  }

  return payment;
};

const getPostHistory = async (userId: number) => {
  const postHistory = {
    total: 0,
    active: 0,
    archived: 0,
    repost: 0,
    deleted: 0,
  };

  const countActivePosts = await Post.count({
    where: { user: { id: userId } },
  });
  const countRepostedPosts = await Post.count({
    where: { is_reposted: true },
  });
  const countArchivedPosts = await ArchivePost.count({
    where: { user: { id: userId } },
  });
  const countDeletedPosts = await DeletedPost.count({
    where: { user: { id: userId } },
  });

  postHistory.active = countActivePosts;
  postHistory.archived = countArchivedPosts;
  postHistory.deleted = countDeletedPosts;
  postHistory.repost = countRepostedPosts;
  postHistory.total = countActivePosts + countArchivedPosts + countDeletedPosts + countRepostedPosts;

  return postHistory;
};

const getUserSummary = async () => {
  const [users, totalUsers] = await User.findAndCount();
  const posts = await Post.find();

  const today = getLocaleDate(new Date());
  const yesterday = getLocaleDate(new Date(new Date().setDate(new Date().getDate() - 1)));

  const registeredToday = users.filter((user) => user.created_at >= new Date(`${today} 00:00:00`)).length;

  const registeredYesterday = users.filter(
    (user) =>
      user.created_at >= new Date(`${yesterday} 00:00:00`) && user.created_at <= new Date(`${yesterday} 23:59:59`),
  ).length;
  const notVerifiedToday = users.filter(
    (user) => user.status === 'not_verified' && user.created_at >= new Date(`${today} 00:00:00`),
  ).length;
  const notVerifiedYesterday = users.filter(
    (user) =>
      user.status === 'not_verified' &&
      user.created_at >= new Date(`${yesterday} 00:00:00`) &&
      user.created_at <= new Date(`${yesterday} 23:59:59`),
  ).length;
  const activeToday = users.filter((user) => {
    return posts.some((post) => post.user.id === user.id && post.public_date >= new Date(`${today} 00:00:00`));
  }).length;
  const activeYesterday = users.filter((user) => {
    return posts.some(
      (post) =>
        post.user.id === user.id &&
        post.public_date >= new Date(`${yesterday} 00:00:00`) &&
        post.public_date <= new Date(`${yesterday} 23:59:59`),
    );
  }).length;
  const activeAgents = users.filter((user) => user.is_agent).length;

  return {
    totalUsers,
    activeAgents,
    registeredToday,
    registeredYesterday,
    notVerifiedToday,
    notVerifiedYesterday,
    activeToday,
    activeYesterday,
  };
};

const getPostSummary = async () => {
  const [posts, totalActivePosts] = await Post.findAndCount();
  const [archivedPosts, totalArchivedPosts] = await ArchivePost.findAndCount();
  const [deletedPosts, totalDeletedPosts] = await DeletedPost.findAndCount();

  const totalPosts = totalActivePosts + totalArchivedPosts + totalDeletedPosts;

  const today = getLocaleDate(new Date());
  const yesterday = getLocaleDate(new Date(new Date().setDate(new Date().getDate() - 1)));

  const activePostsToday = posts.filter((post) => post.posted_date >= new Date(`${today} 00:00:00`)).length;
  const archivedPostsToday = archivedPosts.filter((post) => post.posted_date >= new Date(`${today} 00:00:00`)).length;
  const deletedPostsToday = deletedPosts.filter((post) => post.posted_date >= new Date(`${today} 00:00:00`)).length;

  const postsToday = activePostsToday + archivedPostsToday + deletedPostsToday;

  const activePostsYesterday = posts.filter(
    (post) =>
      post.posted_date >= new Date(`${yesterday} 00:00:00`) && post.posted_date <= new Date(`${yesterday} 23:59:59`),
  ).length;
  const archivedPostsYesterday = archivedPosts.filter(
    (post) =>
      post.posted_date >= new Date(`${yesterday} 00:00:00`) && post.posted_date <= new Date(`${yesterday} 23:59:59`),
  ).length;
  const deletedPostsYesterday = deletedPosts.filter(
    (post) =>
      post.posted_date >= new Date(`${yesterday} 00:00:00`) && post.posted_date <= new Date(`${yesterday} 23:59:59`),
  ).length;

  const postsYesterday = activePostsYesterday + archivedPostsYesterday + deletedPostsYesterday;

  const activePostsByAgentToday =
    postsToday === 0
      ? 0
      : (posts.filter((post) => post.user.is_agent && post.posted_date >= new Date(`${today} 00:00:00`)).length /
          postsToday) *
        100;
  const archivedPostsByAgentToday =
    postsToday === 0
      ? 0
      : (archivedPosts.filter((post) => post.user.is_agent && post.posted_date >= new Date(`${today} 00:00:00`))
          .length /
          postsToday) *
        100;
  const deletedPostsByAgentToday =
    postsToday === 0
      ? 0
      : (deletedPosts.filter((post) => post.user.is_agent && post.posted_date >= new Date(`${today} 00:00:00`)).length /
          postsToday) *
        100;

  const postsByAgentToday = (activePostsByAgentToday + archivedPostsByAgentToday + deletedPostsByAgentToday).toFixed(2);

  const activePostsByAgentYesterday =
    postsYesterday === 0
      ? 0
      : (posts.filter(
          (post) =>
            post.user.is_agent &&
            post.posted_date >= new Date(`${yesterday} 00:00:00`) &&
            post.posted_date <= new Date(`${yesterday} 23:59:59`),
        ).length /
          postsYesterday) *
        100;
  const archivedPostsByAgentYesterday =
    postsYesterday === 0
      ? 0
      : (archivedPosts.filter(
          (post) =>
            post.user.is_agent &&
            post.posted_date >= new Date(`${yesterday} 00:00:00`) &&
            post.posted_date <= new Date(`${yesterday} 23:59:59`),
        ).length /
          postsYesterday) *
        100;
  const deletedPostsByAgentYesterday =
    postsYesterday === 0
      ? 0
      : (deletedPosts.filter(
          (post) =>
            post.user.is_agent &&
            post.posted_date >= new Date(`${yesterday} 00:00:00`) &&
            post.posted_date <= new Date(`${yesterday} 23:59:59`),
        ).length /
          postsYesterday) *
        100;

  const postsByAgentYesterday = (
    activePostsByAgentYesterday +
    archivedPostsByAgentYesterday +
    deletedPostsByAgentYesterday
  ).toFixed(2);

  const totalActiveStickyPosts = posts.filter((post) => post.is_sticky).length;
  const totalActiveAgentPosts =
    totalActivePosts === 0
      ? 0
      : ((posts.filter((post) => post.user.is_agent).length / totalActivePosts) * 100).toFixed(2);

  return {
    totalPosts,
    totalActivePosts,
    totalArchivedPosts,
    totalDeletedPosts,
    postsToday,
    postsYesterday,
    postsByAgentToday,
    postsByAgentYesterday,
    totalActiveStickyPosts,
    totalActiveAgentPosts,
  };
};

const getTransactionSummary = async () => {
  const transactions = await Transaction.find();

  const today = getLocaleDate(new Date());
  const yesterday = getLocaleDate(new Date(new Date().setDate(new Date().getDate() - 1)));

  // Get the current month's and previous month's start and end dates
  const now = new Date();
  const currentMonthStartDate = getLocaleDate(new Date(now.getFullYear(), now.getMonth(), 1));
  const currentMonthEndDate = getLocaleDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  const prevMonthStartDate = getLocaleDate(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const prevMonthEndDate = getLocaleDate(new Date(now.getFullYear(), now.getMonth(), 0));

  const transactionsToday = transactions.filter(
    (transaction) => transaction.status === 'completed' && transaction.created_at >= new Date(`${today} 00:00:00`),
  );
  const transactionsYesterday = transactions.filter(
    (transaction) =>
      transaction.status === 'completed' &&
      transaction.created_at >= new Date(`${yesterday} 00:00:00`) &&
      transaction.created_at <= new Date(`${yesterday} 23:59:59`),
  );

  const completedTransactionsToday = transactionsToday.length;
  const completedTransactionsYesterday = transactionsYesterday.length;

  const totalTransactionsToday = transactions.filter(
    (transaction) => transaction.created_at >= new Date(`${today} 00:00:00`),
  ).length;
  const totalTransactionsYesterday = transactions.filter(
    (transaction) =>
      transaction.created_at >= new Date(`${yesterday} 00:00:00`) &&
      transaction.created_at <= new Date(`${yesterday} 23:59:59`),
  ).length;

  const incomeToday = transactionsToday.reduce((sum, transaction) => sum + transaction.amount, 0);
  const incomeYesterday = transactionsYesterday.reduce((sum, transaction) => sum + transaction.amount, 0);

  const transactionsLastTwoMonths = await Transaction.find({
    where: {
      status: 'completed',
      created_at: Between(new Date(`${prevMonthStartDate} 00:00:00`), new Date(`${currentMonthEndDate} 23:59:59`)),
    },
  });

  const totalIncomeThisMonth = transactionsLastTwoMonths.reduce((acc, curr) => {
    if (
      curr.created_at >= new Date(`${currentMonthStartDate} 00:00:00`) &&
      curr.created_at <= new Date(`${currentMonthEndDate} 23:59:59`)
    ) {
      return acc + curr.amount;
    }
    return acc;
  }, 0);

  const totalIncomeLastMonth = transactionsLastTwoMonths.reduce((acc, curr) => {
    if (
      curr.created_at >= new Date(`${prevMonthStartDate} 00:00:00`) &&
      curr.created_at <= new Date(`${prevMonthEndDate} 23:59:59`)
    ) {
      return acc + curr.amount;
    }
    return acc;
  }, 0);

  const totalRegularIncomeThisMonth = transactionsLastTwoMonths.reduce((acc, curr) => {
    if (
      curr.created_at >= new Date(`${currentMonthStartDate} 00:00:00`) &&
      curr.created_at <= new Date(`${currentMonthEndDate} 23:59:59`) &&
      (curr.package.id === 1 || curr.package.id === 2)
    ) {
      return acc + curr.amount;
    }
    return acc;
  }, 0);

  const totalRegularIncomeLastMonth = transactionsLastTwoMonths.reduce((acc, curr) => {
    if (
      curr.created_at >= new Date(`${prevMonthStartDate} 00:00:00`) &&
      curr.created_at <= new Date(`${prevMonthEndDate} 23:59:59`) &&
      (curr.package.id === 1 || curr.package.id === 2)
    ) {
      return acc + curr.amount;
    }
    return acc;
  }, 0);

  const totalStickyIncomeThisMonth = transactionsLastTwoMonths.reduce((acc, curr) => {
    if (
      curr.created_at >= new Date(`${currentMonthStartDate} 00:00:00`) &&
      curr.created_at <= new Date(`${currentMonthEndDate} 23:59:59`) &&
      (curr.package.id === 5 || curr.package.id === 6)
    ) {
      return acc + curr.amount;
    }
    return acc;
  }, 0);

  const totalStickyIncomeLastMonth = transactionsLastTwoMonths.reduce((acc, curr) => {
    if (
      curr.created_at >= new Date(`${prevMonthStartDate} 00:00:00`) &&
      curr.created_at <= new Date(`${prevMonthEndDate} 23:59:59`) &&
      (curr.package.id === 5 || curr.package.id === 6)
    ) {
      return acc + curr.amount;
    }
    return acc;
  }, 0);

  const totalStickyDirectIncomeThisMonth = transactionsLastTwoMonths.reduce((acc, curr) => {
    if (
      curr.created_at >= new Date(`${currentMonthStartDate} 00:00:00`) &&
      curr.created_at <= new Date(`${currentMonthEndDate} 23:59:59`) &&
      curr.package.id === 7
    ) {
      return acc + curr.amount;
    }
    return acc;
  }, 0);

  const totalStickyDirectIncomeLastMonth = transactionsLastTwoMonths.reduce((acc, curr) => {
    if (
      curr.created_at >= new Date(`${prevMonthStartDate} 00:00:00`) &&
      curr.created_at <= new Date(`${prevMonthEndDate} 23:59:59`) &&
      curr.package.id === 7
    ) {
      return acc + curr.amount;
    }
    return acc;
  }, 0);

  const totalAgentTwoIncomeThisMonth = transactionsLastTwoMonths.reduce((acc, curr) => {
    if (
      curr.created_at >= new Date(`${currentMonthStartDate} 00:00:00`) &&
      curr.created_at <= new Date(`${currentMonthEndDate} 23:59:59`) &&
      curr.package.id === 3
    ) {
      return acc + curr.amount;
    }
    return acc;
  }, 0);

  const totalAgentTwoIncomeLastMonth = transactionsLastTwoMonths.reduce((acc, curr) => {
    if (
      curr.created_at >= new Date(`${prevMonthStartDate} 00:00:00`) &&
      curr.created_at <= new Date(`${prevMonthEndDate} 23:59:59`) &&
      curr.package.id === 3
    ) {
      return acc + curr.amount;
    }
    return acc;
  }, 0);

  const totalAgentSixIncomeThisMonth = transactionsLastTwoMonths.reduce((acc, curr) => {
    if (
      curr.created_at >= new Date(`${currentMonthStartDate} 00:00:00`) &&
      curr.created_at <= new Date(`${currentMonthEndDate} 23:59:59`) &&
      curr.package.id === 4
    ) {
      return acc + curr.amount;
    }
    return acc;
  }, 0);

  const totalAgentSixIncomeLastMonth = transactionsLastTwoMonths.reduce((acc, curr) => {
    if (
      curr.created_at >= new Date(`${prevMonthStartDate} 00:00:00`) &&
      curr.created_at <= new Date(`${prevMonthEndDate} 23:59:59`) &&
      curr.package.id === 4
    ) {
      return acc + curr.amount;
    }
    return acc;
  }, 0);

  return {
    completedTransactionsToday,
    completedTransactionsYesterday,
    totalTransactionsToday,
    totalTransactionsYesterday,
    incomeToday,
    incomeYesterday,
    totalIncomeThisMonth,
    totalIncomeLastMonth,
    totalRegularIncomeThisMonth,
    totalRegularIncomeLastMonth,
    totalStickyIncomeThisMonth,
    totalStickyIncomeLastMonth,
    totalStickyDirectIncomeThisMonth,
    totalStickyDirectIncomeLastMonth,
    totalAgentTwoIncomeThisMonth,
    totalAgentTwoIncomeLastMonth,
    totalAgentSixIncomeThisMonth,
    totalAgentSixIncomeLastMonth,
  };
};

const geCreditsSummary = async () => {
  const usersWithHistoryRegular = await Transaction.createQueryBuilder('transaction')
    .select('COUNT(DISTINCT transaction.user_id)', 'count')
    .where('transaction.status = :status', { status: 'completed' })
    .andWhere('transaction.package_title IN (:...titles)', { titles: ['regular1', 'regular2'] })
    .getRawOne();

  const usersWithHistorySticky = await Transaction.createQueryBuilder('transaction')
    .select('COUNT(DISTINCT transaction.user_id)', 'count')
    .where('transaction.status = :status', { status: 'completed' })
    .andWhere('transaction.package_title IN (:...titles)', { titles: ['sticky1', 'sticky2'] })
    .getRawOne();

  const usersWithHistoryStickyDirect = await Transaction.createQueryBuilder('transaction')
    .select('COUNT(DISTINCT transaction.user_id)', 'count')
    .where('transaction.status = :status', { status: 'completed' })
    .andWhere('transaction.package_title IN (:...titles)', { titles: ['stickyDirect'] })
    .getRawOne();

  const usersWithHistoryAgent = await Transaction.createQueryBuilder('transaction')
    .select('COUNT(DISTINCT transaction.user_id)', 'count')
    .where('transaction.status = :status', { status: 'completed' })
    .andWhere('transaction.package_title IN (:...titles)', { titles: ['agent1', 'agent2'] })
    .getRawOne();

  const totalHistoryRegular = await Transaction.createQueryBuilder('transaction')
    .select('SUM(package.numberOfCredits)', 'count')
    .leftJoin(Package, 'package', 'transaction.package_id = package.id')
    .where('transaction.status = :status', { status: 'completed' })
    .andWhere('transaction.package_title IN (:...titles)', { titles: ['regular1', 'regular2'] })
    .getRawOne();

  const totalHistorySticky = await Transaction.createQueryBuilder('transaction')
    .select('SUM(package.numberOfCredits)', 'count')
    .leftJoin(Package, 'package', 'transaction.package_id = package.id')
    .where('transaction.status = :status', { status: 'completed' })
    .andWhere('transaction.package_title IN (:...titles)', { titles: ['sticky1', 'sticky2'] })
    .getRawOne();

  const totalHistoryStickyDirect = await Transaction.createQueryBuilder('transaction')
    .select('SUM(package.numberOfCredits)', 'count')
    .leftJoin(Package, 'package', 'transaction.package_id = package.id')
    .where('transaction.status = :status', { status: 'completed' })
    .andWhere('transaction.package_title IN (:...titles)', { titles: ['stickyDirect'] })
    .getRawOne();

  const totalHistoryAgent = await Transaction.createQueryBuilder('transaction')
    .select('SUM(package.numberOfCredits)', 'count')
    .leftJoin(Package, 'package', 'transaction.package_id = package.id')
    .where('transaction.status = :status', { status: 'completed' })
    .andWhere('transaction.package_title IN (:...titles)', { titles: ['agent1', 'agent2'] })
    .getRawOne();

  const userWithActiveRegular = await Credit.count({ where: { regular: MoreThan(0) } });
  const userWithActiveSticky = await Credit.count({ where: { sticky: MoreThan(0) } });
  const userWithActiveAgent = await Credit.count({ where: { agent: MoreThan(0) } });

  const { totalActiveRegular } = await Credit.createQueryBuilder('credit')
    .select('SUM(credit.regular)', 'totalActiveRegular')
    .getRawOne();
  const { totalActiveSticky } = await Credit.createQueryBuilder('credit')
    .select('SUM(credit.sticky)', 'totalActiveSticky')
    .getRawOne();
  const { totalActiveAgent } = await Credit.createQueryBuilder('credit')
    .select('SUM(credit.agent)', 'totalActiveAgent')
    .getRawOne();

  const usersWithHistory = {
    regular: usersWithHistoryRegular.count,
    sticky: usersWithHistorySticky.count,
    stickyDirect: usersWithHistoryStickyDirect.count,
    agent: usersWithHistoryAgent.count,
  };

  const totalHistory = {
    regular: totalHistoryRegular.count ?? 0,
    sticky: totalHistorySticky.count ?? 0,
    stickyDirect: totalHistoryStickyDirect.count ?? 0,
    agent: totalHistoryAgent.count ?? 0,
  };

  const userWithActive = {
    regular: userWithActiveRegular,
    sticky: userWithActiveSticky,
    agent: userWithActiveAgent,
  };

  const totalActive = {
    regular: totalActiveRegular,
    sticky: totalActiveSticky,
    agent: totalActiveAgent,
  };

  const unVerifiedUsersCount = await User.count({ where: { status: 'not_verified' } });
  let totalZeroFreeCredits = await Credit.count({ where: { free: 0 } });
  totalZeroFreeCredits += unVerifiedUsersCount ?? 0;

  return { totalZeroFreeCredits, usersWithHistory, totalHistory, userWithActive, totalActive };
};

export {
  saveAdmin,
  findAdminByPhone,
  getPaymentHistory,
  getPostHistory,
  getUserSummary,
  getPostSummary,
  getTransactionSummary,
  geCreditsSummary,
};
