import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '../../lib/admin-auth';

export const dynamic = 'force-dynamic';

function gasUrl(req: Request) {
  const base = process.env.MASTERDB_API_URL || process.env.NEXT_PUBLIC_API_URL;
  if (!base) throw new Error('MASTERDB_API_URL 없음');
  const inUrl = new URL(req.url);
  const url = new URL(base);
  inUrl.searchParams.forEach((v, k) => url.searchParams.set(k, v));
  if (!url.searchParams.get('action')) url.searchParams.set('action', 'all');
  return url.toString();
}

async function parseGasResponse(res: Response, apiUrl: string) {
  const text = await res.text();
  try {
    return NextResponse.json(JSON.parse(text));
  } catch {
    console.error('Apps Script returned a non-JSON response', { status: res.status, apiUrl });
    return NextResponse.json({
      ok: false,
      error: '데이터 서버 응답을 처리할 수 없습니다.',
      status: res.status,
    }, { status: 200 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const url = gasUrl(req);
    const res = await fetch(url, { cache: 'no-store', redirect: 'follow' });
    return parseGasResponse(res, url);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!isAdminRequest(req)) {
      return NextResponse.json({ ok: false, error: '관리자 로그인이 필요합니다.' }, { status: 401 });
    }
    const base = process.env.MASTERDB_API_URL || process.env.NEXT_PUBLIC_API_URL;
    if (!base) throw new Error('MASTERDB_API_URL 없음');
    const body = await req.json();
    const res = await fetch(base, {
      method: 'POST',
      cache: 'no-store',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
    });
    return parseGasResponse(res, base);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
