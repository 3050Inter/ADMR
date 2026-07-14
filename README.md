# 안다미로 직원관리 V11 Final

Google Sheets MASTER_DB + Google Apps Script + Next.js + Vercel 기반 직원관리 홈페이지입니다.

## V11 Final 반영 내용

- 화면별 API 호출 분리: dashboard / employees / leave / health / incentives / notices / staffing / all
- 첫 화면 전체 `all` 호출 제거
- 빠른 실행 버튼 정상 연결
- 저장 후 전체 새로고침 방지: 해당 탭 데이터만 갱신
- 인센티브 수기조정 반영 개선
- Apps Script `openById()` 반복 호출 최소화
- 기존 V10 MASTER_DB 시트 구조 유지

## 배포 순서

1. 이 ZIP 압축 해제
2. GitHub ADMR 저장소에 기존 파일 전체 삭제 후 이 파일들 전체 업로드
3. Commit changes
4. Vercel 자동 배포 확인
5. `apps-script-v11-final.gs` 내용을 Google Apps Script `Code.gs`에 전체 붙여넣기
6. 저장 → 배포 관리 → 새 버전 배포
7. 기존 Vercel 환경변수 `NEXT_PUBLIC_API_URL`은 그대로 사용

## 중요

`.git` 폴더를 직접 건드리지 않아도 됩니다. GitHub 웹 업로드 방식으로 진행하면 충돌을 피할 수 있습니다.
