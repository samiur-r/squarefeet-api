import dotenv from 'dotenv';

dotenv.config();

const config = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: process.env.PORT ?? 5000,
  origin: process.env.DEV_ORIGIN ?? 'http://localhost:3000',
  jwtSecret: process.env.JWT_SECRET ?? 'majoron_boshamlan',
  cookieSecret: process.env.COOKIE_SECRET ?? 'alpha_centauri',
  vonageApiKey: process.env.VONAGE_API_KEY ?? '',
  vonageApiSecret: process.env.VONAGE_API_SECRET ?? '',
  cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME ?? '',
  cloudinaryApiKey: process.env.CLOUDINARY_API_KEY ?? '',
  cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET ?? '',
  slackWebHookImpUrl: process.env.SLACK_WEBHOOK_IMP ?? '',
  slackWebHookNonImpUrl: process.env.SLACK_WEBHOOK_NON_IMP ?? '',
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    signed: true,
    sameSite: 'strict',
    maxAge: 728 * 86400000, // 2 years
  },
  knetTermResourceKey: process.env.KNET_TERM_RESOURCE_KEY,
};

export default config;
