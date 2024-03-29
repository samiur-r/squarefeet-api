import express from 'express';

import { isUserAuth, isRequestAuth } from '../../../middlewares/AuthMiddleware';

import * as TransactionController from './controller';

const router = express.Router();

router.post('/', isUserAuth, TransactionController.insert);
router.put('/update-status', isRequestAuth, TransactionController.updateStatus);
router.post('/response', TransactionController.handleKpayResponse);
router.get('/response', TransactionController.handleKpayError);

export default router;
