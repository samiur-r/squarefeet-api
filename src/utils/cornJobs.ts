import cron from 'node-cron';
import { fireAgentExpirationAlert, getExpiredAgentUserIds } from '../api/v1/agents/service';
import { updateAgentCredit } from '../api/v1/credits/service';
import { moveExpiredPosts, removeArchivedPostsMedia, unstickPost } from '../api/v1/posts/service';
import { findUnVerifiedUsers, updateBulkIsUserAnAgent } from '../api/v1/users/service';
import logger from './logger';
import { alertOnSlack } from './slackUtils';

async function scheduledTaskPerMonth() {
  try {
    logger.info('Running monthly cron job');
    await removeArchivedPostsMedia();
  } catch (error) {
    logger.error(error.message);
  }
}

async function scheduledTaskPerHour() {
  try {
    logger.info('Running half hourly cron job');
    const ids = await getExpiredAgentUserIds();
    await updateBulkIsUserAnAgent(ids, false);
    await updateAgentCredit(ids, 0);
    await fireAgentExpirationAlert(ids);
    await moveExpiredPosts();
    await unstickPost();
  } catch (error) {
    logger.error(error.message);
  }
}

async function scheduledTaskPerFiveMins() {
  try {
    logger.info('Running per 5 mins cron job');
    const users = await findUnVerifiedUsers();

    let slackMsg = `Unverified users: `;

    users.forEach((user) => {
      slackMsg = `${slackMsg}\n ${user?.phone ? `<https://wa.me/965${user?.phone}|${user?.phone}>` : ''}`;
    });
    if (users && users.length) await alertOnSlack('imp', slackMsg);
  } catch (error) {
    logger.error(error.message);
  }
}

const cronJobPerMonth = cron.schedule('0 0 1 * *', scheduledTaskPerMonth);
const cronJobPerHour = cron.schedule('*/30 * * * *', scheduledTaskPerHour);
const cronJobPerFiveMins = cron.schedule('*/5 * * * *', scheduledTaskPerFiveMins);

cronJobPerMonth.on('error', (err) => {
  logger.info('Cron job error:', err.message);
});

cronJobPerHour.on('error', (err) => {
  logger.info('Cron job error:', err.message);
});

cronJobPerFiveMins.on('error', (err) => {
  logger.info('Cron job error:', err.message);
});

// // Stop the cron job when the application is shutting down
// process.on('SIGINT', () => {
//   logger.info('Stopping cron job...');
//   job.stop();
//   process.exit();
// });

export { cronJobPerMonth, cronJobPerHour, cronJobPerFiveMins };
