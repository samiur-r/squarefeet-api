/* eslint-disable no-param-reassign */
import { Between, MoreThanOrEqual, LessThanOrEqual, Like, Not, And, In } from 'typeorm';
import { alertOnSlack } from '../../../utils/slackUtils';
import { sendSms } from '../../../utils/smsUtils';
import { parseTimestamp } from '../../../utils/timestampUtls';
import { IPackage } from '../packages/interfaces';
import { IUser } from '../users/interfaces';
import { findUserById, findUserByPhone } from '../users/service';
import { Transaction } from './model';

const saveTransaction = async (
  payload: {
    trackId: string;
    amount: number;
    packageTitle: string;
    status: string;
    user: IUser;
    packageObj: IPackage;
  },
  postInfo?: any,
) => {
  const {
    trackId,
    amount,
    packageTitle,
    status,
    user,
    packageObj,
  }: {
    trackId: string;
    amount: number;
    packageTitle: string;
    status: string;
    user: IUser;
    packageObj: IPackage;
  } = payload;

  const newTransaction = Transaction.create({
    track_id: trackId,
    package_title: packageTitle,
    amount,
    status,
    user,
    package: packageObj,
  });

  const transaction = await Transaction.save(newTransaction);

  let title;

  if (postInfo) {
    title = `${postInfo.propertyTitle} ل${postInfo.categoryTitle} في ${postInfo.cityTitle}`;
  }

  if (status === 'created') {
    const slackMsg = `Payment created - ${user?.phone ? `<https://wa.me/965${user?.phone}|${user?.phone}>` : ''} - ${
      user?.admin_comment ? `${user.admin_comment}` : ''
    }\n${title ? `${title} - ` : ''}${packageTitle} - ${amount}`;
    await alertOnSlack('imp', slackMsg);
  }
  return transaction;
};

const findTransactionByTrackId = async (track_id: string) => {
  const transaction = await Transaction.findOne({ where: { track_id } });
  return transaction;
};

const findTransactionsByUserId = async (userId: number) => {
  const transaction = await Transaction.find({ where: { user: { id: userId } } });
  return transaction;
};

const editTransaction = async (trackId: number, reference_id: string, tran_id: string, status: string) => {
  const transaction = await findTransactionByTrackId(trackId.toString());
  if (!transaction) return { status: 404 };

  const user = await findUserById(transaction.user.id);
  if (!user) return { status: 404 };

  const transactionObj = await Transaction.save({
    ...transaction,
    reference_id,
    tran_id,
    status,
  });
  let smsMsg = '';

  if (transactionObj) {
    let packageTitle = transactionObj.package_title || '';
    packageTitle = packageTitle.slice(0, -1);

    switch (packageTitle) {
      case 'agent':
        smsMsg = `Payment ${status === 'completed' ? 'successful. Subscription started.' : 'failed.'}`;
        break;
      case 'stickyDirec':
        smsMsg = `Payment ${status === 'completed' ? 'successful. Post sticked.' : 'failed.'}`;
        break;
      default:
        smsMsg = `Payment ${status === 'completed' ? 'successful.' : 'failed.'}`;
        break;
    }
  }

  const slackMsg = `Payment ${status} - ${user?.phone ? `<https://wa.me/965${user?.phone}|${user?.phone}>` : ''} - ${
    user?.admin_comment ? `${user.admin_comment}` : ''
  }\n${transactionObj.package_title} - ${transactionObj.amount}`;

  await alertOnSlack('imp', slackMsg);
  await sendSms(transactionObj.user.phone, smsMsg);
  return { status: 200, data: transactionObj };
};

const editTransactionStatus = async (trackId: string | null, status: string) => {
  if (trackId === null) return { status: 404 };
  const transaction = await findTransactionByTrackId(trackId);
  if (!transaction) return { status: 404 };

  const user: any = await findUserById(transaction.user.id);
  if (!user) return { status: 404 };

  await Transaction.save({
    ...transaction,
    status,
  });

  const slackMsg = `Payment canceled - ${user.phone ? `<https://wa.me/965${user?.phone}|${user?.phone}>` : ''} - ${
    user.admin_comment || ''
  }\n${transaction.package_title} - ${transaction.amount}`;
  const smsMsg = `Payment canceled`;

  await alertOnSlack('imp', slackMsg);
  await sendSms(transaction.user.phone, smsMsg);
  return { status: 200 };
};

const filterTransactionsForAdmin = async (
  statusToFilter: string,
  typeToFilter: string,
  fromCreationDateToFilter: Date | undefined,
  toCreationDateToFilter: Date | undefined,
  userId: string,
  offset: number,
) => {
  const where: any = {};

  if (userId) {
    where.user = { id: parseInt(userId, 10) };
  }

  if (statusToFilter && statusToFilter !== '-') where.status = statusToFilter.toLowerCase();
  if (typeToFilter && typeToFilter !== '-') {
    switch (typeToFilter) {
      case 'Regular':
        where.package_title = Like('regular%');
        break;
      case 'Sticky':
        where.package_title = In(['sticky1', 'sticky2']);
        break;
      case 'Sticky Direct':
        where.package_title = 'stickyDirect';
        break;
      case 'Agent':
        where.package_title = Like('agent%');
        break;
      default:
        break;
    }
  }

  if (fromCreationDateToFilter && toCreationDateToFilter)
    where.created_at = Between(`${fromCreationDateToFilter} 00:00:00`, `${toCreationDateToFilter} 23:59:59`);
  else if (fromCreationDateToFilter) where.created_at = MoreThanOrEqual(`${fromCreationDateToFilter} 00:00:00`);
  else if (toCreationDateToFilter) where.created_at = LessThanOrEqual(`${toCreationDateToFilter} 23:59:59`);

  const [transactions, count] = await Transaction.findAndCount({
    where,
    order: { created_at: 'desc' },
    skip: offset,
    take: 50,
  });

  transactions.forEach((transactionItem: any) => {
    transactionItem.createdDate = parseTimestamp(transactionItem.created_at).parsedDate;
    transactionItem.createdTime = parseTimestamp(transactionItem.created_at).parsedTime;
    transactionItem.updatedDate = parseTimestamp(transactionItem.updated_at).parsedDate;
    transactionItem.updatedTime = parseTimestamp(transactionItem.updated_at).parsedTime;
  });

  const totalPages = Math.ceil(count / 50);
  return { transactions, totalPages, totalResults: count };
};

const findTransactionById = async (transactionId: number) => {
  const transaction = await Transaction.findOne({ where: { id: transactionId } });
  return transaction;
};

export {
  saveTransaction,
  editTransaction,
  editTransactionStatus,
  findTransactionsByUserId,
  filterTransactionsForAdmin,
  findTransactionById,
};
