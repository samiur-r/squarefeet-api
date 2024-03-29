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
exports.findAdminComment = exports.removeUser = exports.resetPassword = exports.doesUserExists = exports.register = exports.logout = exports.login = void 0;
const ErrorHandler_1 = __importDefault(require("../../../utils/ErrorHandler"));
const passwordUtils_1 = require("../../../utils/passwordUtils");
const config_1 = __importDefault(require("../../../config"));
const service_1 = require("./service");
const service_2 = require("../otps/service");
const logger_1 = __importDefault(require("../../../utils/logger"));
const validation_1 = require("./validation");
const jwtUtils_1 = require("../../../utils/jwtUtils");
const slackUtils_1 = require("../../../utils/slackUtils");
const smsUtils_1 = require("../../../utils/smsUtils");
const service_3 = require("../user_logs/service");
const model_1 = require("./model");
const Post_1 = require("../posts/models/Post");
const ArchivePost_1 = require("../posts/models/ArchivePost");
const service_4 = require("../posts/service");
const service_5 = require("../locations/service");
const service_6 = require("../credits/service");
const doesUserHaveCredits_1 = __importDefault(require("../../../utils/doesUserHaveCredits"));
const login = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const { phone, password } = req.body;
    try {
        yield validation_1.phoneSchema.validate(phone, { abortEarly: false });
        yield validation_1.passwordSchema.validate(password, { abortEarly: false });
        const user = yield (0, service_1.findUserByPhone)(phone);
        if (!user)
            return res.status(200).json({ isRedirectToRegister: true });
        if (user && user.status === 'not_verified')
            return res.status(200).json({ nextOperation: 'verify phone', userId: user.id });
        if (user && user.is_blocked)
            throw new ErrorHandler_1.default(403, 'You are blocked');
        if (user && user.is_deleted)
            throw new ErrorHandler_1.default(403, 'Your account has been deleted');
        const isValidPassword = yield (0, passwordUtils_1.verifyToken)(password, user.password);
        if (!isValidPassword)
            throw new ErrorHandler_1.default(403, 'Incorrect phone or password');
        const credits = yield (0, service_6.findCreditByUserId)(user.id);
        const userHasCredits = credits ? (0, doesUserHaveCredits_1.default)(credits) : false;
        const userPayload = {
            id: user.id,
            phone: user.phone,
            is_agent: user.is_agent,
            status: user.status,
            userHasCredits,
        };
        const token = yield (0, jwtUtils_1.signJwt)(userPayload);
        logger_1.default.info(`User: ${user === null || user === void 0 ? void 0 : user.phone} logged in successfully`);
        yield (0, service_3.saveUserLog)([
            { post_id: undefined, transaction: undefined, user: user.phone, activity: 'Logged in successfully' },
        ]);
        // @ts-ignore
        res.cookie('token', token, config_1.default.cookieOptions);
        return res.status(200).json({ success: userPayload }); // Logged in successfully
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }
    catch (error) {
        const user = yield (0, service_1.findUserByPhone)(phone);
        logger_1.default.error(`${error.name}: ${error.message}`);
        logger_1.default.error(`User: ${phone} logged in attempt failed`);
        yield (0, service_3.saveUserLog)([
            { post_id: undefined, transaction: undefined, user: phone, activity: 'Logged in attempt failed' },
        ]);
        if (error.name === 'ValidationError') {
            error.message = 'Invalid payload passed';
        }
        const slackMsg = `Failed login attempt\n${phone ? `<https://wa.me/965${phone}|${phone}>` : ''} - ${user && user.admin_comment ? `${user.admin_comment}\n` : ''}\nError message: "${error.message}"`;
        yield (0, slackUtils_1.alertOnSlack)('non-imp', slackMsg);
        return next(error);
    }
});
exports.login = login;
const register = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const { phone, password } = req.body;
    try {
        yield validation_1.phoneSchema.validate(phone, { abortEarly: false });
        yield validation_1.passwordSchema.validate(password, { abortEarly: false });
        const user = yield (0, service_1.findUserByPhone)(phone);
        if (user && user.status !== 'not_verified')
            return res.status(200).json({ isRedirectToLogin: true });
        if (user && user.status === 'not_verified')
            return res.status(200).json({ nextOperation: 'verify mobile', userId: user.id });
        const hashedPassword = yield (0, passwordUtils_1.hashPassword)(password);
        const userObj = yield (0, service_1.saveUser)(phone, hashedPassword, 'not_verified');
        yield (0, service_2.sendOtpVerificationSms)(phone, 'registration', userObj);
        logger_1.default.info(`Registration attempt by user ${phone}. Otp sent `);
        yield (0, service_3.saveUserLog)([
            { post_id: undefined, transaction: undefined, user: phone, activity: 'Registration attempt. Otp sent' },
        ]);
        return res.status(200).json({ nextOperation: true, userId: userObj === null || userObj === void 0 ? void 0 : userObj.id });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }
    catch (error) {
        logger_1.default.error(`${error.name}: ${error.message}`);
        const slackMsg = `User registration failed\n${phone ? `<https://wa.me/965${phone}|${phone}>` : ''}\nError message: "${error.message}"`;
        yield (0, slackUtils_1.alertOnSlack)('non-imp', slackMsg);
        if (error.name === 'ValidationError') {
            error.message = 'Invalid payload passed';
            return next(error);
        }
        if (error.message === 'All SMS messages failed to send') {
            error.message = 'Failed to send otp';
        }
        logger_1.default.error(`Registration attempt failed by user ${phone}`);
        yield (0, service_3.saveUserLog)([
            { post_id: undefined, transaction: undefined, user: phone, activity: 'Registration attempt failed' },
        ]);
        return next(error);
    }
});
exports.register = register;
const logout = (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    res.clearCookie('token');
    return res.status(200).json({ success: 'Logged out successfully' });
});
exports.logout = logout;
const doesUserExists = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const { phone } = req.body;
    try {
        yield validation_1.phoneSchema.validate(phone, { abortEarly: false });
        const user = yield (0, service_1.findUserByPhone)(phone);
        if (!user)
            throw new ErrorHandler_1.default(404, 'No user with this phone is found. Please register');
        return res.status(200).json({ userId: user.id });
    }
    catch (error) {
        logger_1.default.error(`${error.name}: ${error.message}`);
        return next(error);
    }
});
exports.doesUserExists = doesUserExists;
const resetPassword = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const { phone, password } = req.body;
    let user;
    try {
        yield validation_1.phoneSchema.validate(phone, { abortEarly: false });
        yield validation_1.passwordSchema.validate(password, { abortEarly: false });
        user = yield (0, service_1.findUserByPhone)(phone);
        if (!user)
            throw new ErrorHandler_1.default(404, 'No user with this phone is found. Please register');
        yield (0, service_1.updateUserPassword)(user, password);
        logger_1.default.info(`Password reset attempt by user ${phone} successful`);
        yield (0, service_3.saveUserLog)([
            { post_id: undefined, transaction: undefined, user: phone, activity: 'Password reset attempt successful' },
        ]);
        const slackMsg = `Password reset successfully\n\n ${(user === null || user === void 0 ? void 0 : user.phone) ? `<https://wa.me/965${user === null || user === void 0 ? void 0 : user.phone}|${user === null || user === void 0 ? void 0 : user.phone}>` : ''} - ${user.admin_comment ? user.admin_comment : ''}`;
        yield (0, slackUtils_1.alertOnSlack)('imp', slackMsg);
        yield (0, smsUtils_1.sendSms)(user.phone, 'Password reset successfully');
        const credits = yield (0, service_6.findCreditByUserId)(user.id);
        const userHasCredits = credits ? (0, doesUserHaveCredits_1.default)(credits) : false;
        const userPayload = {
            id: user.id,
            phone: user.phone,
            is_agent: user.is_agent,
            status: user.status,
            userHasCredits,
        };
        const token = yield (0, jwtUtils_1.signJwt)(userPayload);
        // @ts-ignore
        res.cookie('token', token, config_1.default.cookieOptions);
        return res.status(200).json({ success: userPayload });
    }
    catch (error) {
        logger_1.default.error(`${error.name}: ${error.message}`);
        logger_1.default.error(`Password reset attempt failed.\n${(user === null || user === void 0 ? void 0 : user.phone) ? `<https://wa.me/965${user === null || user === void 0 ? void 0 : user.phone}|${user === null || user === void 0 ? void 0 : user.phone}>` : ''} - ${(user === null || user === void 0 ? void 0 : user.admin_comment) ? user.admin_comment : ''}`);
        yield (0, service_3.saveUserLog)([
            { post_id: undefined, transaction: undefined, user: phone, activity: 'Password reset attempt failed' },
        ]);
        return next(error);
    }
});
exports.resetPassword = resetPassword;
const removeUser = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const { userId } = req.body;
    try {
        const user = yield (0, service_1.findUserById)(userId);
        if (!user)
            throw new ErrorHandler_1.default(404, 'User not found');
        user.is_deleted = true;
        yield model_1.User.save(user);
        const activePosts = yield Post_1.Post.find({ where: { user: { id: userId } } });
        const archivedPosts = yield ArchivePost_1.ArchivePost.find({ where: { user: { id: userId } } });
        activePosts.forEach((post) => __awaiter(void 0, void 0, void 0, function* () {
            yield (0, service_4.removePost)(post.id, post);
            yield (0, service_4.saveDeletedPost)(post, post.user);
            yield (0, service_5.updateLocationCountValue)(post.city_id, 'decrement');
        }));
        archivedPosts.forEach((post) => __awaiter(void 0, void 0, void 0, function* () {
            yield (0, service_4.removeArchivedPost)(post.id, post);
            yield (0, service_4.saveDeletedPost)(post, post.user);
            yield (0, service_5.updateLocationCountValue)(post.city_id, 'decrement');
        }));
        logger_1.default.info(`User ${user === null || user === void 0 ? void 0 : user.phone} deleted`);
        yield (0, service_3.saveUserLog)([
            {
                post_id: undefined,
                transaction: undefined,
                user: user === null || user === void 0 ? void 0 : user.phone,
                activity: `User ${user === null || user === void 0 ? void 0 : user.phone} deleted`,
            },
        ]);
        const slackMsg = `User <https://wa.me/965${user.phone}|${user.phone}> - ${(user === null || user === void 0 ? void 0 : user.admin_comment) || ''} is deleted`;
        yield (0, slackUtils_1.alertOnSlack)('imp', slackMsg);
        return res.status(200).json({ success: 'User deleted successfully' });
    }
    catch (error) {
        logger_1.default.error(`${error.name}: ${error.message}`);
        return next(error);
    }
});
exports.removeUser = removeUser;
const findAdminComment = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const { phone } = req.body;
    try {
        const user = yield (0, service_1.findUserByPhone)(phone);
        if (!user)
            throw new ErrorHandler_1.default(404, 'User not found');
        return res.status(200).json({ adminComment: user.admin_comment });
    }
    catch (error) {
        logger_1.default.error(`${error.name}: ${error.message}`);
        return next(error);
    }
});
exports.findAdminComment = findAdminComment;
//# sourceMappingURL=controller.js.map