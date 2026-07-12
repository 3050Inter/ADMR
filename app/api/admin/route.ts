import { NextRequest, NextResponse } from 'next/server';
import { authConfigured, clearAdminSession, isAdminRequest, setAdminSession, validPassword } from '../../lib/admin-auth';

export async function GET(req: NextRequest) {
  return NextResponse.json({ ok: true, isAdmin: isAdminRequest(req), configured: authConfigured() });
}

export async function POST(req: NextRequest) {
  if (!authConfigured()) {
    return NextResponse.json({ ok: false, error: '관리자 인증 환경변수가 설정되지 않았습니다.' }, { status: 503 });
  }
  const body = await req.json().catch(() => ({}));
  if (!validPassword(body.password)) {
    return NextResponse.json({ ok: false, error: '비밀번호가 맞지 않습니다.' }, { status: 401 });
  }
  return setAdminSession(NextResponse.json({ ok: true, isAdmin: true }));
}

export async function DELETE() {
  return clearAdminSession(NextResponse.json({ ok: true, isAdmin: false }));
}
