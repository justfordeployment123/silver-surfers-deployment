import { Router } from 'express';

import { asyncHandler } from '../../shared/http/async-handler.ts';
import { authRequired } from '../auth/auth.middleware.ts';
import { getEbookDownloadLink } from './ebook.controller.ts';

const router = Router();

router.get('/ebooks/:id/download-link', authRequired, asyncHandler(getEbookDownloadLink));

export default router;
