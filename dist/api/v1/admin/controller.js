"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateUserComment = exports.rePost = exports.deletePostPermanently = exports.updateUserBlockStatus = exports.fetchTestItems = exports.fetchDashboardInfo = exports.fetchTransactions = exports.verifyUser = exports.editAgent = exports.editUser = exports.fetchUserWithAgentInfo = exports.fetchUser = exports.updateCredit = exports.filterUsers = exports.fetchLogs = exports.deletePost = exports.stickPost = exports.filterPosts = exports.logout = exports.login = exports.register = exports.test = void 0;
const axios_1 = __importDefault(require("axios"));
const passwordUtils_1 = require("../../../utils/passwordUtils");
const logger_1 = __importDefault(require("../../../utils/logger"));
const service_1 = require("./service");
const ErrorHandler_1 = __importDefault(require("../../../utils/ErrorHandler"));
const jwtUtils_1 = require("../../../utils/jwtUtils");
const config_1 = __importDefault(require("../../../config"));
const service_2 = require("../posts/service");
const service_3 = require("../users/service");
const service_4 = require("../user_logs/service");
const service_5 = require("../credits/service");
const service_6 = require("../transactions/service");
const service_7 = require("../agents/service");
const model_1 = require("../credits/model");
const model_2 = require("../agents/model");
const smsUtils_1 = require("../../../utils/smsUtils");
const sortUsersFunctions_1 = __importDefault(require("../../../utils/sortUsersFunctions"));
const model_3 = require("../users/model");
const DeletedPost_1 = require("../posts/models/DeletedPost");
const service_8 = require("../locations/service");
const timestampUtls_1 = require("../../../utils/timestampUtls");
const register = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const { phone, password, name } = req.body;
    try {
        const hashedPassword = yield (0, passwordUtils_1.hashPassword)(password);
        yield (0, service_1.saveAdmin)(phone, hashedPassword, name);
        return res.status(200).json({ success: 'New admin created successfully' });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }
    catch (error) {
        logger_1.default.error(`${error.name}: ${error.message}`);
        return next(error);
    }
});
exports.register = register;
const login = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const { phone, password } = req.body;
    try {
        const admin = yield (0, service_1.findAdminByPhone)(phone);
        if (!admin)
            throw new ErrorHandler_1.default(403, 'Incorrect phone or password');
        const isValidPassword = yield (0, passwordUtils_1.verifyToken)(password, admin.password);
        if (!isValidPassword)
            throw new ErrorHandler_1.default(403, 'Incorrect phone or password');
        const adminPayload = {
            id: admin.id,
            phone: admin.phone,
            name: admin.name,
            is_super: admin.is_super,
            admin_status: true,
        };
        const token = yield (0, jwtUtils_1.signJwt)(adminPayload);
        // @ts-ignore
        res.cookie('token', token, config_1.default.cookieOptions);
        return res.status(200).json({ success: adminPayload });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }
    catch (error) {
        logger_1.default.error(`${error.name}: ${error.message}`);
        return next(error);
    }
});
exports.login = login;
const logout = (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    res.clearCookie('token');
    return res.status(200).json({ success: 'Logged out successfully' });
});
exports.logout = logout;
const filterPosts = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const { locationToFilter, categoryToFilter, propertyTypeToFilter, fromPriceToFilter, toPriceToFilter, fromCreationDateToFilter, toCreationDateToFilter, stickyStatusToFilter, userTypeToFilter, orderByToFilter, postStatusToFilter, userId, offset, } = req.body;
    try {
        const { posts, totalPages } = yield (0, service_2.filterPostsForAdmin)(locationToFilter, categoryToFilter, propertyTypeToFilter, fromPriceToFilter, toPriceToFilter, fromCreationDateToFilter, toCreationDateToFilter, stickyStatusToFilter, userTypeToFilter, orderByToFilter, postStatusToFilter, userId, offset);
        return res.status(200).json({ posts, totalPages });
    }
    catch (error) {
        logger_1.default.error(`${error.name}: ${error.message}`);
        return next(error);
    }
});
exports.filterPosts = filterPosts;
const stickPost = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const { postId } = req.body;
    const user = res.locals.user.payload;
    try {
        const post = yield (0, service_2.findPostById)(parseInt(postId, 10));
        if (!post)
            throw new ErrorHandler_1.default(401, 'Post not found');
        if (post.is_sticky)
            throw new ErrorHandler_1.default(304, 'Post is already sticky');
        yield (0, service_2.updatePostStickyVal)(post, true);
        logger_1.default.info(`Post ${post.id} sticked by user ${user === null || user === void 0 ? void 0 : user.phone}`);
        return res.status(200).json({ success: 'Post is sticked successfully' });
    }
    catch (error) {
        logger_1.default.error(`${error.name}: ${error.message}`);
        logger_1.default.error(`Post ${postId} stick attempt by user ${user === null || user === void 0 ? void 0 : user.phone}} failed`);
        return next(error);
    }
});
exports.stickPost = stickPost;
const deletePost = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const { postId, isArchive } = req.body;
    const userObj = res.locals.user.payload;
    try {
        if (!postId)
            throw new ErrorHandler_1.default(404, 'Post not found');
        let post;
        if (isArchive)
            post = yield (0, service_2.findArchivedPostById)(parseInt(postId, 10));
        else
            post = yield (0, service_2.findPostById)(parseInt(postId, 10));
        if (!post)
            throw new ErrorHandler_1.default(401, 'Post not found');
        const user = yield (0, service_3.findUserById)(post.user.id);
        if (!user)
            throw new ErrorHandler_1.default(500, 'Something went wrong');
        if (isArchive)
            yield (0, service_2.removeArchivedPost)(post.id, post);
        else
            yield (0, service_2.removePost)(post.id, post);
        yield (0, service_8.updateLocationCountValue)(post.city_id, 'decrement');
        post.media = [];
        yield (0, service_2.saveDeletedPost)(post, user);
        logger_1.default.info(`Post ${postId} deleted by user ${userObj.phone}`);
        return res.status(200).json({ success: 'Post deleted successfully' });
    }
    catch (error) {
        logger_1.default.error(`${error.name}: ${error.message}`);
        logger_1.default.error(`Post ${postId} delete attempt by user ${userObj.phone} failed`);
        return next(error);
    }
});
exports.deletePost = deletePost;
const deletePostPermanently = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const { postId } = req.body;
    const userObj = res.locals.user.payload;
    try {
        if (!postId)
            throw new ErrorHandler_1.default(404, 'Post not found');
        yield (0, service_2.removePost)(postId);
        yield (0, service_2.removeArchivedPost)(postId);
        yield DeletedPost_1.DeletedPost.delete({ id: postId });
        logger_1.default.info(`Post ${postId} permanently deleted by user ${userObj.phone}`);
        return res.status(200).json({ success: 'Post deleted successfully' });
    }
    catch (error) {
        logger_1.default.error(`${error.name}: ${error.message}`);
        logger_1.default.error(`Post ${postId} permanently delete attempt by user ${userObj.phone} failed`);
        return next(error);
    }
});
exports.deletePostPermanently = deletePostPermanently;
const rePost = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const user = res.locals.user.payload;
    const { postId } = req.body;
    try {
        if (!postId)
            throw new ErrorHandler_1.default(404, 'Invalid payload passed');
        let post;
        post = yield (0, service_2.findArchivedPostById)(postId);
        if (post)
            yield (0, service_2.removeArchivedPost)(post.id);
        else
            post = yield (0, service_2.findDeletedPostById)(postId);
        if (post)
            yield DeletedPost_1.DeletedPost.delete({ id: postId });
        else
            throw new ErrorHandler_1.default(404, 'Post not found');
        const publicDate = post.public_date;
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
            views: post.views,
        };
        const newPost = yield (0, service_2.savePost)(postInfo, post.user, 'regular', publicDate);
        const repostCount = post.repost_count + 1;
        yield (0, service_2.updatePostRepostVals)(newPost, true, repostCount);
        yield (0, service_8.updateLocationCountValue)(post.city_id, 'increment');
        logger_1.default.info(`Post ${post.id} reposted by user ${user === null || user === void 0 ? void 0 : user.phone}`);
        return res.status(200).json({ success: 'Post is reposted successfully' });
    }
    catch (error) {
        logger_1.default.error(`${error.name}: ${error.message}`);
        logger_1.default.error(`Post ${postId} repost by user ${user.phone} failed`);
        return next(error);
    }
});
exports.rePost = rePost;
const fetchLogs = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const { postId, user, offset } = req.body;
    let response;
    try {
        if (postId)
            response = yield (0, service_4.fetchLogsByPostId)(postId, offset);
        else if (user)
            response = yield (0, service_4.fetchLogsByUser)(user, offset);
        return res.status(200).json({ logs: response.logs, totalPages: response.totalPages });
    }
    catch (error) {
        logger_1.default.error(`${error.name}: ${error.message}`);
        return next(error);
    }
});
exports.fetchLogs = fetchLogs;
const filterUsers = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const { statusToFilter, phoneToFilter, adminCommentToFilter, fromCreationDateToFilter, toCreationDateToFilter, orderByToFilter, offset, } = req.body;
    let totalPages = null;
    try {
        const { users, count } = yield (0, service_3.filterUsersForAdmin)(statusToFilter, phoneToFilter, adminCommentToFilter, fromCreationDateToFilter, toCreationDateToFilter, orderByToFilter, offset);
        totalPages = Math.ceil(count / 10);
        const parsedUsers = users.map((user) => {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u;
            return ({
                id: user.id,
                phone: user.phone,
                status: user.status,
                is_agent: user.is_agent,
                adminComment: user.admin_comment,
                is_blocked: user.is_blocked,
                lastPostDate: user.posts && user.posts.length ? (0, timestampUtls_1.parseTimestamp)((0, service_3.getLastActivity)(user)).parsedDate : null,
                lastPostTime: user.posts && user.posts.length ? (0, timestampUtls_1.parseTimestamp)((0, service_3.getLastActivity)(user)).parsedTime : null,
                registeredDate: (0, timestampUtls_1.parseTimestamp)(user.created_at).parsedDate,
                registeredTime: (0, timestampUtls_1.parseTimestamp)(user.created_at).parsedTime,
                created_at: user.created_at,
                subscriptionStartDate: user.agent && user.agent.length && ((_a = user === null || user === void 0 ? void 0 : user.agent[0]) === null || _a === void 0 ? void 0 : _a.subscription_start_date)
                    ? (0, timestampUtls_1.parseTimestamp)(user.agent[0].subscription_start_date).parsedDate
                    : null,
                subscriptionStartTime: user.agent && user.agent.length && ((_b = user === null || user === void 0 ? void 0 : user.agent[0]) === null || _b === void 0 ? void 0 : _b.subscription_start_date)
                    ? (0, timestampUtls_1.parseTimestamp)(user.agent[0].subscription_start_date).parsedTime
                    : null,
                subscriptionEndsDate: user.agent && user.agent.length && ((_c = user === null || user === void 0 ? void 0 : user.agent[0]) === null || _c === void 0 ? void 0 : _c.subscription_ends_date)
                    ? (0, timestampUtls_1.parseTimestamp)(user.agent[0].subscription_ends_date).parsedDate
                    : null,
                subscriptionEndsTime: user.agent && user.agent.length && ((_d = user === null || user === void 0 ? void 0 : user.agent[0]) === null || _d === void 0 ? void 0 : _d.subscription_ends_date)
                    ? (0, timestampUtls_1.parseTimestamp)(user.agent[0].subscription_ends_date).parsedTime
                    : null,
                post: {
                    active: (_e = user.posts) === null || _e === void 0 ? void 0 : _e.length,
                    repost: user.posts.filter((post) => post.is_reposted).length,
                    archived: (_f = user.archive_posts) === null || _f === void 0 ? void 0 : _f.length,
                    deleted: (_g = user.deleted_posts) === null || _g === void 0 ? void 0 : _g.length,
                },
                credits: {
                    free: (_j = (_h = user === null || user === void 0 ? void 0 : user.credits[0]) === null || _h === void 0 ? void 0 : _h.free) !== null && _j !== void 0 ? _j : 0,
                    regular: (_l = (_k = user === null || user === void 0 ? void 0 : user.credits[0]) === null || _k === void 0 ? void 0 : _k.regular) !== null && _l !== void 0 ? _l : 0,
                    sticky: (_o = (_m = user === null || user === void 0 ? void 0 : user.credits[0]) === null || _m === void 0 ? void 0 : _m.sticky) !== null && _o !== void 0 ? _o : 0,
                    agent: (_q = (_p = user === null || user === void 0 ? void 0 : user.credits[0]) === null || _p === void 0 ? void 0 : _p.agent) !== null && _q !== void 0 ? _q : 0,
                },
                has_zero_credits: ((_r = user === null || user === void 0 ? void 0 : user.credits[0]) === null || _r === void 0 ? void 0 : _r.free) <= 0 &&
                    ((_s = user === null || user === void 0 ? void 0 : user.credits[0]) === null || _s === void 0 ? void 0 : _s.regular) <= 0 &&
                    ((_t = user === null || user === void 0 ? void 0 : user.credits[0]) === null || _t === void 0 ? void 0 : _t.sticky) <= 0 &&
                    ((_u = user === null || user === void 0 ? void 0 : user.credits[0]) === null || _u === void 0 ? void 0 : _u.agent) <= 0,
                payment: {
                    regular: user === null || user === void 0 ? void 0 : user.transactions.filter((transaction) => transaction.status === 'completed' && ['regular1', 'regular2'].includes(transaction.package_title)).reduce((total, transaction) => total + transaction.package.numberOfCredits, 0),
                    sticky: user.transactions
                        .filter((transaction) => transaction.status === 'completed' && ['sticky1', 'sticky2'].includes(transaction.package_title))
                        .reduce((total, transaction) => total + transaction.package.numberOfCredits, 0),
                    agent: user.transactions
                        .filter((transaction) => transaction.status === 'completed' && ['agent1', 'agent2'].includes(transaction.package_title))
                        .reduce((total, transaction) => total + transaction.package.numberOfCredits, 0),
                },
            });
        });
        if (orderByToFilter && sortUsersFunctions_1.default[orderByToFilter]) {
            parsedUsers.sort(sortUsersFunctions_1.default[orderByToFilter]);
        }
        return res.status(200).json({ users: parsedUsers, totalPages });
    }
    catch (error) {
        logger_1.default.error(`${error.name}: ${error.message}`);
        return next(error);
    }
});
exports.filterUsers = filterUsers;
const fetchUser = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r;
    const { userId } = req.body;
    try {
        const user = yield model_3.User.findOne({
            where: { id: userId },
            relations: ['posts', 'archive_posts', 'deleted_posts', 'credits', 'transactions', 'agent'],
        });
        user === null || user === void 0 ? true : delete user.password;
        const parsedUser = {
            id: user.id,
            phone: user.phone,
            status: user.status,
            is_agent: user.is_agent,
            adminComment: user.admin_comment,
            is_blocked: user.is_blocked,
            registeredDate: (0, timestampUtls_1.parseTimestamp)(user.created_at).parsedDate,
            registeredTime: (0, timestampUtls_1.parseTimestamp)(user.created_at).parsedTime,
            subscriptionStartDate: user.agent && user.agent.length && ((_a = user === null || user === void 0 ? void 0 : user.agent[0]) === null || _a === void 0 ? void 0 : _a.subscription_start_date)
                ? (0, timestampUtls_1.parseTimestamp)(user.agent[0].subscription_start_date).parsedDate
                : null,
            subscriptionStartTime: user.agent && user.agent.length && ((_b = user === null || user === void 0 ? void 0 : user.agent[0]) === null || _b === void 0 ? void 0 : _b.subscription_start_date)
                ? (0, timestampUtls_1.parseTimestamp)(user.agent[0].subscription_start_date).parsedTime
                : null,
            subscriptionEndsDate: user.agent && user.agent.length && ((_c = user === null || user === void 0 ? void 0 : user.agent[0]) === null || _c === void 0 ? void 0 : _c.subscription_ends_date)
                ? (0, timestampUtls_1.parseTimestamp)(user.agent[0].subscription_ends_date).parsedDate
                : null,
            subscriptionEndsTime: user.agent && user.agent.length && ((_d = user === null || user === void 0 ? void 0 : user.agent[0]) === null || _d === void 0 ? void 0 : _d.subscription_ends_date)
                ? (0, timestampUtls_1.parseTimestamp)(user.agent[0].subscription_ends_date).parsedTime
                : null,
            lastPostDate: user.posts && user.posts.length ? (0, timestampUtls_1.parseTimestamp)((0, service_3.getLastActivity)(user)).parsedDate : null,
            lastPostTime: user.posts && user.posts.length ? (0, timestampUtls_1.parseTimestamp)((0, service_3.getLastActivity)(user)).parsedTime : null,
            post: {
                active: (_e = user.posts) === null || _e === void 0 ? void 0 : _e.length,
                repost: (_f = user.posts) === null || _f === void 0 ? void 0 : _f.filter((post) => post.is_reposted).length,
                archived: (_g = user.archive_posts) === null || _g === void 0 ? void 0 : _g.length,
                deleted: (_h = user.deleted_posts) === null || _h === void 0 ? void 0 : _h.length,
            },
            credits: {
                free: (_k = (_j = user === null || user === void 0 ? void 0 : user.credits[0]) === null || _j === void 0 ? void 0 : _j.free) !== null && _k !== void 0 ? _k : 0,
                regular: (_m = (_l = user === null || user === void 0 ? void 0 : user.credits[0]) === null || _l === void 0 ? void 0 : _l.regular) !== null && _m !== void 0 ? _m : 0,
                sticky: (_p = (_o = user === null || user === void 0 ? void 0 : user.credits[0]) === null || _o === void 0 ? void 0 : _o.sticky) !== null && _p !== void 0 ? _p : 0,
                agent: (_r = (_q = user === null || user === void 0 ? void 0 : user.credits[0]) === null || _q === void 0 ? void 0 : _q.agent) !== null && _r !== void 0 ? _r : 0,
            },
            payment: {
                regular: user === null || user === void 0 ? void 0 : user.transactions.filter((transaction) => ['regular1', 'regular2'].includes(transaction.package_title)).reduce((total, transaction) => total + transaction.amount, 0),
                sticky: user === null || user === void 0 ? void 0 : user.transactions.filter((transaction) => ['sticky1', 'sticky2'].includes(transaction.package_title)).reduce((total, transaction) => total + transaction.amount, 0),
                agent: user === null || user === void 0 ? void 0 : user.transactions.filter((transaction) => ['agent1', 'agent2'].includes(transaction.package_title)).reduce((total, transaction) => total + transaction.amount, 0),
            },
        };
        return res.status(200).json({ user: parsedUser });
    }
    catch (error) {
        logger_1.default.error(`${error.name}: ${error.message}`);
        return next(error);
    }
});
exports.fetchUser = fetchUser;
const updateCredit = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const { creditAmount, creditType, userId } = req.body;
    try {
        const credit = yield (0, service_5.findCreditByUserId)(userId);
        if (!credit)
            throw new ErrorHandler_1.default(401, 'Credit record not found');
        yield model_1.Credit.save(Object.assign(Object.assign({}, credit), { [creditType]: creditAmount }));
        return res.status(200).json({ success: 'Credit updated successfully' });
    }
    catch (error) {
        logger_1.default.error(`${error.name}: ${error.message}`);
        return next(error);
    }
});
exports.updateCredit = updateCredit;
const fetchUserWithAgentInfo = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const { userId } = req.body;
    try {
        const user = yield (0, service_3.findUserWithAgentInfo)(userId);
        if (!user)
            throw new ErrorHandler_1.default(401, 'User not found');
        return res.status(200).json({ user });
    }
    catch (error) {
        logger_1.default.error(`${error.name}: ${error.message}`);
        return next(error);
    }
});
exports.fetchUserWithAgentInfo = fetchUserWithAgentInfo;
const editUser = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const { id, phone, adminComment, password } = req.body;
    try {
        const user = yield (0, service_3.findUserById)(id);
        if (!user)
            throw new ErrorHandler_1.default(401, 'User not found');
        yield (0, service_3.updateUser)(user, phone, adminComment, password);
        return res.status(200).json({ success: 'User updated successfully' });
    }
    catch (error) {
        logger_1.default.error(`${error.name}: ${error.message}`);
        return next(error);
    }
});
exports.editUser = editUser;
const editAgent = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const { userId, agentId, name, email, instagram, facebook, twitter, website, description } = req.body;
    try {
        if (!name)
            throw new ErrorHandler_1.default(404, 'Invalid agent id or name');
        if (agentId) {
            const agent = yield (0, service_7.findAgentById)(agentId);
            if (!agent)
                throw new ErrorHandler_1.default(401, 'Agent not found');
            const agentData = model_2.Agent.create(Object.assign(Object.assign({}, agent), { name,
                email,
                instagram,
                facebook,
                twitter,
                website,
                description }));
            yield model_2.Agent.save(agentData);
        }
        else {
            const user = yield (0, service_3.findUserById)(userId);
            if (!user)
                throw new ErrorHandler_1.default(401, 'user not found');
            const agentData = model_2.Agent.create({
                name,
                email,
                instagram,
                facebook,
                twitter,
                website,
                description,
                user,
            });
            yield model_2.Agent.save(agentData);
        }
        return res.status(200).json({ success: 'Agent updated successfully' });
    }
    catch (error) {
        logger_1.default.error(`${error.name}: ${error.message}`);
        return next(error);
    }
});
exports.editAgent = editAgent;
const verifyUser = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const { userId } = req.body;
    try {
        if (!userId)
            throw new ErrorHandler_1.default(404, 'Invalid agent id or name');
        const user = yield (0, service_3.findUserById)(userId);
        if (!user)
            throw new ErrorHandler_1.default(401, 'Agent not found');
        yield (0, service_3.updateUserStatus)(userId, 'verified');
        yield (0, service_5.initCredits)(user);
        yield (0, smsUtils_1.sendSms)(user.phone, 'Congratulations! you have been registered successfully');
        return res.status(200).json({ success: 'User verified successfully' });
    }
    catch (error) {
        logger_1.default.error(`${error.name}: ${error.message}`);
        return next(error);
    }
});
exports.verifyUser = verifyUser;
const fetchTransactions = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const { statusToFilter, typeToFilter, fromCreationDateToFilter, toCreationDateToFilter, userId, offset } = req.body;
    try {
        const { transactions, totalPages } = yield (0, service_6.filterTransactionsForAdmin)(statusToFilter, typeToFilter, fromCreationDateToFilter, toCreationDateToFilter, userId, offset);
        return res.status(200).json({ transactions, totalPages });
    }
    catch (error) {
        logger_1.default.error(`${error.name}: ${error.message}`);
        return next(error);
    }
});
exports.fetchTransactions = fetchTransactions;
const fetchDashboardInfo = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userSummary = yield (0, service_1.getUserSummary)();
        const postSummary = yield (0, service_1.getPostSummary)();
        const transactionSummary = yield (0, service_1.getTransactionSummary)();
        const creditSummary = yield (0, service_1.geCreditsSummary)();
        return res.status(200).json({ userSummary, postSummary, transactionSummary, creditSummary });
    }
    catch (error) {
        logger_1.default.error(`${error.name}: ${error.message}`);
        return next(error);
    }
});
exports.fetchDashboardInfo = fetchDashboardInfo;
const fetchTestItems = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const { offset } = req.body;
    try {
        let totalPages = null;
        if (offset === 0)
            totalPages = Math.ceil(100 / 10);
        const { data } = yield axios_1.default.get(`https://jsonplaceholder.typicode.com/posts?_start=${offset}&_limit=10`);
        return res.status(200).json({ totalPages, items: data });
    }
    catch (error) {
        logger_1.default.error(`${error.name}: ${error.message}`);
        return next(error);
    }
});
exports.fetchTestItems = fetchTestItems;
const updateUserBlockStatus = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const { userId, status } = req.body;
    try {
        if (!userId)
            throw new ErrorHandler_1.default(404, 'Invalid user id');
        const user = yield (0, service_3.findUserById)(userId);
        if (!user)
            throw new ErrorHandler_1.default(401, 'User not found');
        if (user.is_blocked && status)
            throw new ErrorHandler_1.default(403, 'User is already blocked');
        if (!user.is_blocked && status === false)
            throw new ErrorHandler_1.default(403, 'You can not unblock a non blocked user');
        yield model_3.User.save(Object.assign(Object.assign({}, user), { is_agent: status ? false : user.is_agent, is_blocked: status }));
        if (status) {
            // const socketIo: any = await getSocketIo();
            // socketIo.emit('userBlocked', { user: user.phone });
            yield (0, service_2.removeAllPostsOfUser)(userId);
            yield (0, service_5.setCreditsToZeroByUserId)(userId);
        }
        return res.status(200).json({ success: `User ${status === true ? ' blocked' : ' unblocked'} successfully` });
    }
    catch (error) {
        logger_1.default.error(`${error.name}: ${error.message}`);
        return next(error);
    }
});
exports.updateUserBlockStatus = updateUserBlockStatus;
const updateUserComment = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const { userId, adminComment } = req.body;
    try {
        if (!userId)
            throw new ErrorHandler_1.default(404, 'Invalid user id');
        const user = yield (0, service_3.findUserById)(userId);
        if (!user)
            throw new ErrorHandler_1.default(401, 'User not found');
        yield model_3.User.save(Object.assign(Object.assign({}, user), { admin_comment: adminComment && adminComment !== '' ? adminComment : null }));
        return res.status(200).json({ success: `User comment updated successfully` });
    }
    catch (error) {
        logger_1.default.error(`${error.name}: ${error.message}`);
        return next(error);
    }
});
exports.updateUserComment = updateUserComment;
const test = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { totalActiveRegular } = yield model_1.Credit.createQueryBuilder()
            .select('SUM(credit.regular)', 'totalActiveRegular')
            .getRawOne();
        return res.status(200).json({ totalActiveRegular });
    }
    catch (error) {
        logger_1.default.error(`${error.name}: ${error.message}`);
        return next(error);
    }
});
exports.test = test;
//# sourceMappingURL=controller.js.map