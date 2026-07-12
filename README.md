# 안다미로 스시 직원관리

Google Sheets, Google Apps Script, Next.js를 사용하는 내부 직원관리 홈페이지입니다.

## 권한 정책

- 로그인 없이 대시보드, 직원, 휴무, 근무인원, 보건증, 인센티브, 공지사항, 운영통계, 시스템 현황을 조회할 수 있습니다.
- 등록, 수정, 삭제, 월 마감, 백업 등 데이터가 변경되는 작업은 관리자 로그인 후에만 가능합니다.
- 관리자 비밀번호는 브라우저 코드에 포함되지 않으며 서버 환경변수로 관리합니다.
- `연결확인`의 원시 API 응답은 관리자에게만 표시됩니다.

## 필수 환경변수

Vercel 프로젝트 설정에 다음 값을 등록합니다.

```text
MASTERDB_API_URL=https://script.google.com/macros/s/배포_ID/exec
ADMIN_PASSWORD=충분히_긴_관리자_비밀번호
AUTH_SECRET=32자_이상의_무작위_문자열
```

`AUTH_SECRET`은 비밀번호와 다른 무작위 값을 사용해야 합니다. 환경변수를 변경한 뒤에는 다시 배포해야 합니다.

기존 `NEXT_PUBLIC_API_URL`도 전환 기간에는 동작하지만, 공개 접두사가 없는 `MASTERDB_API_URL`로 교체하는 것을 권장합니다.

## 로컬 실행

1. `.env.example`을 참고해 `.env.local`을 만듭니다.
2. `npm install`을 실행합니다.
3. `npm run dev`를 실행합니다.

## 배포

1. 변경사항을 GitHub에 올립니다.
2. Vercel 환경변수가 설정됐는지 확인합니다.
3. Vercel에서 새 배포를 실행합니다.
4. 조회 화면과 관리자 로그인 후 저장·수정·삭제를 각각 확인합니다.

Google Apps Script를 변경했다면 `apps-script-v11-final.gs`의 내용을 Apps Script 프로젝트에 반영하고 새 버전으로 배포합니다.
