import { createHmac, timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

const COOKIE_NAME = 'andamiro_admin_session';
const SESSION_SECONDS = 60 * 60 * 12;

function config() {
  const password = process.env.ADMIN_PASSWORD;
  const secret = process.env.AUTH_SECRET;
  if (!password || !secret || secret.length < 32) return null;
  return { password, secret };
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function sign(expires: string, secret: string) {
  return createHmac('sha256', secret).update(expires).digest('hex');
}

export function authConfigured() {
  return Boolean(config());
}

export function validPassword(value: unknown) {
  const c = config();
  return Boolean(c && typeof value === 'string' && safeEqual(value, c.password));
}

export function isAdminRequest(req: NextRequest) {
  const c = config();
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!c || !token) return false;
  const [expires, signature] = token.split('.');
  if (!expires || !signature || Number(expires) <= Date.now()) return false;
  return safeEqual(signature, sign(expires, c.secret));
}

export function setAdminSession(res: NextResponse) {
  const c = config();
  if (!c) return res;
  const expires = String(Date.now() + SESSION_SECONDS * 1000);
  res.cookies.set(COOKIE_NAME, `${expires}.${sign(expires, c.secret)}`, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_SECONDS,
  });
  return res;
}

export function clearAdminSession(res: NextResponse) {
  res.cookies.set(COOKIE_NAME, '', { httpOnly: true, sameSite: 'strict', path: '/', maxAge: 0 });
  return res;
}
