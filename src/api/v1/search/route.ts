import express from 'express';

import * as SearchController from './controller';

const router = express.Router();

router.post('/', SearchController.search);
router.post('/count', SearchController.searchCount);
router.post('/archived', SearchController.searchArchived);

export default router;
