import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function gasUrl(req: Request) {
  const base = process.env.NEXT_PUBLIC_API_URL;
  if (!base) throw new Error('NEXT_PUBLIC_API_URL 없음');
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
    return NextResponse.json({
      ok: false,
      error: 'Apps Script JSON 아님',
      status: res.status,
      apiUrl,
      raw: text.slice(0, 1200),
    }, { status: 200 });
  }
}

export async function GET(req: Request) {
  try {
    const url = gasUrl(req);
    const res = await fetch(url, { cache: 'no-store', redirect: 'follow' });
    return parseGasResponse(res, url);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const base = process.env.NEXT_PUBLIC_API_URL;
    if (!base) throw new Error('NEXT_PUBLIC_API_URL 없음');
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
