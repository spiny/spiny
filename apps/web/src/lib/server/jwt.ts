import jwt from "jsonwebtoken";

export type UserSessionTokenData = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  accessToken: string;
  accessTokenSecret?: string;
  refreshToken?: string;
  expiresAt: string;
}

const SECRET_KEY = "s3cr37";

export function jwtSign(data: UserSessionTokenData) {
  return jwt.sign(data, SECRET_KEY);
}


export function jwtVerify(token: string) {
  try {
    return jwt.verify(token, SECRET_KEY);
  } catch (e) {
    return null;
  }
}
