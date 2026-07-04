# 안다미로 직원관리 V10 Final

Google Sheets MASTER_DB + Google Apps Script + Next.js + Vercel 기반 직원관리 홈페이지입니다.

## 포함 기능

- 직원관리 기본 조회/등록
- 휴무관리 월간표
- 휴 / V / 반차+V 입력 및 삭제
- 여러 직원 동시 휴무 입력
- 중복 휴무 입력 방지
- 토/일/공휴일 근무 인센티브 +1시간 자동 적립
- V 사용 -12시간, 반차+V -6시간 자동 기록
- 인센티브 현황 및 수기 조정
- 보건증 등록/갱신 및 D-Day 표시
- 공지사항 작성/삭제
- Dashboard 현황(오늘 근무/오늘 휴무/보건증 경고/공지 중심)
- 운영통계 탭
- 최근 활동 로그
- 월마감 로그
- MASTER_DB 백업 버튼
- 연결확인 탭

## 배포 순서

1. 이 ZIP 압축 해제
2. GitHub 저장소에 전체 업로드
3. Google Apps Script에 `apps-script.js` 전체 붙여넣기
4. Apps Script 저장 후 새 배포: 웹 앱
5. 실행 사용자: 나
6. 액세스 권한: Google 계정이 있는 모든 사용자
7. 웹 앱 URL(`/exec`) 복사
8. Vercel 환경변수 설정

```env
NEXT_PUBLIC_API_URL=https://script.google.com/macros/s/배포ID/exec
```

9. Vercel Redeploy
10. 홈페이지에서 연결확인

## 주의

- `.env.local`은 포함하지 않습니다.
- `package-lock.json`은 포함하지 않습니다.
- Vercel에서 `npm install`이 새로 실행되도록 구성했습니다.
- 배포 전 Apps Script의 `MASTER_DB_ID`가 실제 시트 ID인지 확인하세요.

## 핵심 시트명

- 직원관리
- 휴무입력
- 공휴일입력
- 수기조정
- 인센티브로그
- 인센티브요약
- 근무인원
- 보건증현황
- 공지사항
- 홈페이지로그
- 월마감로그

## 버전

V10 Final UI Polished Candidate
