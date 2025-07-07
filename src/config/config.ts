import dotenv from "dotenv";
dotenv.config();

export const config = {
    port: process.env.PORT || 0,
    host: process.env.HOST || "",
    databaseUrl: process.env.DATABASE_URL || "",
    otpExpire: process.env.OTP_EXPIRE_IN_SECONDS || "",
    jwtOtpExpire : process.env.JWT_OTP_EXPIRE || "",
    jwtAccessExpire: process.env.JWT_ACCESS_EXPIRE || "",
    jwtRefreshExpire: process.env.JWT_REFRESH_EXPIRE || "",
    jwtSecret: process.env.JWT_SECRET || "",
    timeZone: process.env.TIME_ZONE || "",
    defaultLanguage: process.env.DEFAULT_LANGUAGE || "",
    aesKey: process.env.AES_KEY || "",
    aesIv: process.env.AES_IV || "",
    nodeMailerHost: process.env.NODEMAILER_HOST || "smtp.gmail.com",
    nodeMailerPort: process.env.NODEMAILER_PORT || "587",
    nodeMailerUser: process.env.NODEMAILER_USER,
    nodeMailerPassword: process.env.NODEMAILER_PASSWORD,
}
