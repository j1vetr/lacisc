import jwt from "jsonwebtoken";

export interface JwtPayload {
  userId: number;
  email: string;
  role?: "owner" | "admin" | "viewer";
  /** Bumped server-side to revoke all outstanding tokens for the user. */
  tv?: number;
}

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is required");
  }
  return secret;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, getSecret(), { expiresIn: "7d" });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, getSecret()) as JwtPayload;
}
