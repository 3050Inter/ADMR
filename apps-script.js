// 안다미로 스시 API - v1.1.0 Stable Recovery
// 재조회 최소화 + 첫 화면 경량화 + 저장 후 빠른 응답

const MASTER_DB_ID = '1O-v-26uvnmj9B2n1pB98DMl1IV9mB3s-y9w0elcIMqU';
const API_VERSION = 'v1.1.0-stable-recovery-20260708';

const DB = {
  sheets: {
    dashboard: '00_Dashboard',
    employees: '직원관리',
    newEmployee: '신규입사_입력',
    retire: '퇴사자_입력',
    leave: '휴무입력',
    holiday: '공휴일입력',
    incentiveBase: '인센티브기초값',
    incentiveRaw: '기존인센티브현황_원본',
    manualAdjust: '수기조정',
    incentiveLog: '인센티브로그',
    incentiveSummary: '인센티브요약',
    staffing: '근무인원',
    health: '보건증현황',
    homepageLog: '홈페이지로그',
    notices: '공지사항',
    closeLog: '월마감로그'
  }
};

let _spreadsheet = null;
let _sheetMap = {};

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  return json(handle(params.action || 'dashboard', params));
}

function doPost(e) {
  let body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) {}
  return json(handle(body.action || 'dashboard', body));
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function ss() {
  if (!_spreadsheet) _spreadsheet = SpreadsheetApp.openById(MASTER_DB_ID);
  return _spreadsheet;
}
function sheet(name) {
  if (!_sheetMap[name]) _sheetMap[name] = ss().getSheetByName(name);
  return _sheetMap[name];
}
function clean(v) { return String(v == null ? '' : v).trim(); }
function fmt(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return v == null ? '' : v;
}
function todayKey() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'); }
function thisMonth() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM'); }
function nowKst() { return Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss'); }
function baseInfo() { return { ok: true, version: API_VERSION, spreadsheet: ss().getName() }; }

function cacheKey(parts) { return parts.map(function(p){ return clean(p).replace(/[^A-Za-z0-9_:-]/g, '_'); }).join(':'); }
function cacheGet(key) {
  try {
    const raw = CacheService.getScriptCache().get(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function cachePut(key, value, seconds) {
  try { CacheService.getScriptCache().put(key, JSON.stringify(value), seconds || 60); } catch (e) {}
}
function cacheRemove(keys) {
  try { CacheService.getScriptCache().removeAll(keys.filter(Boolean)); } catch (e) {}
}
function clearDashboardCache(month) {
  cacheRemove([
    cacheKey(['dashboard', month, todayKey()]),
    cacheKey(['employees']),
    cacheKey(['leave', month]),
    cacheKey(['incentives', month]),
    cacheKey(['health']),
    cacheKey(['all', month])
  ]);
}
function employeesCached() {
  // 직원 목록은 시트 직접 수정이 잦아서 캐시하지 않는다.
  return employees();
}
function leaveRowsCached(month) {
  const key = cacheKey(['leave', month]);
  const cached = cacheGet(key);
  if (cached) return cached;
  const rows = leaveRows(month);
  cachePut(key, rows, 120);
  return rows;
}
function healthRowsCached() {
  const key = cacheKey(['health']);
  const cached = cacheGet(key);
  if (cached) return cached;
  const rows = healthRows();
  cachePut(key, rows, 180);
  return rows;
}

function handle(action, body) {
  try {
    const month = clean(body.month) || thisMonth();
    if (action === 'ping') return baseInfo();
    if (action === 'dashboard') return dashboardPayload(month);
    if (action === 'employees') return employeesPayload(month);
    if (action === 'leave') return leavePayload(month);
    if (action === 'health') return healthPayload();
    if (action === 'incentives') return incentivesPayload(month);
    if (action === 'notices') return noticesPayload();
    if (action === 'staffing') return staffingPayload(month);
    if (action === 'all') return allPayload(month);
    if (action === 'saveLeave') return saveLeave(body);
    if (action === 'saveLeaveBulk') return saveLeaveBulk(body);
    if (action === 'updateLeave') return updateLeave(body);
    if (action === 'deleteLeave') return deleteLeave(body);
    if (action === 'saveEmployee') return saveEmployee(body);
    if (action === 'deleteEmployee') return deleteEmployee(body);
    if (action === 'repairEmployees') return repairEmployeesPayload();
    if (action === 'clearCache') { clearDashboardCache(month); cacheRemove([cacheKey(['employees']), cacheKey(['health']), cacheKey(['leave', month]), cacheKey(['incentives', month]), cacheKey(['all', month])]); return { ok: true, message: '캐시 삭제 완료' }; }
    if (action === 'saveHealth') return saveHealth(body);
    if (action === 'manualAdjust') return manualAdjust(body);
    if (action === 'saveNotice') return saveNotice(body);
    if (action === 'deleteNotice') return deleteNotice(body);
    if (action === 'backupMaster') return backupMaster(body);
    if (action === 'closeMonth') return closeMonth(body);
    if (action === 'syncWorkIncentives') return syncWorkIncentives(month);
    return dashboardPayload(month);
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err), stack: String(err && err.stack ? err.stack : '') };
  }
}

function findHeaderRow(values, requiredHeaders) {
  const limit = Math.min(values.length, 30);
  const required = requiredHeaders || [];
  for (let r = 0; r < limit; r++) {
    const row = values[r].map(clean);
    const joined = row.join('|');
    const hit = required.filter(h => row.indexOf(h) !== -1 || joined.indexOf(h) !== -1).length;
    if (required.length === 0 && joined) return r;
    if (hit >= Math.min(required.length, 2)) return r;
  }
  let best = -1, score = -1;
  for (let r = 0; r < limit; r++) {
    const joined = values[r].map(clean).join('|');
    let s = 0;
    ['이름','직원명','날짜','일자','구분','상태','직급','부서','현재누적','보건증','만료','잔여','시간','제목','내용'].forEach(k => { if (joined.indexOf(k) !== -1) s++; });
    if (s > score) { score = s; best = r; }
  }
  return score > 0 ? best : -1;
}

function tableRows(sheetName, requiredHeaders) {
  const s = sheet(sheetName);
  if (!s) return [];
  const values = s.getDataRange().getValues();
  if (!values.length) return [];
  const headerIndex = findHeaderRow(values, requiredHeaders || []);
  if (headerIndex < 0) return [];
  const headers = values[headerIndex].map(function(h, i) { return clean(h) || ('col' + (i + 1)); });
  const rows = [];
  for (let r = headerIndex + 1; r < values.length; r++) {
    const row = values[r];
    const obj = { _row: r + 1, _sheet: sheetName };
    let hasValue = false;
    headers.forEach(function(h, i) {
      const v = fmt(row[i]);
      obj[h] = v;
      if (v !== '' && v !== null && v !== undefined) hasValue = true;
    });
    if (hasValue) rows.push(obj);
  }
  return rows;
}

function dateKey(value) {
  const s = clean(fmt(value));
  const m = s.match(/(\d{4})[.\/-]\s*(\d{1,2})[.\/-]\s*(\d{1,2})/);
  if (m) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  return s.slice(0, 10);
}
function monthFilter(rows, month) {
  return rows.filter(function(r) {
    const d = dateKey(r['날짜'] || r['일자'] || r['휴무일'] || r['입력일'] || r['작성일'] || r['입력시간']);
    return !month || d.slice(0, 7) === month;
  });
}
function nameOf(r) { return clean(r['이름'] || r['직원명'] || r['성명'] || r['name']); }
function isActiveEmployee(r) {
  const status = clean(r['상태'] || r['재직상태'] || r['사용여부']);
  return status.indexOf('퇴사') === -1 && status.indexOf('제외') === -1 && status.indexOf('비활성') === -1;
}

function leaveInputLayout() {
  const s = sheet(DB.sheets.leave);
  if (!s) return null;
  const values = s.getDataRange().getValues();
  let headerRow = -1;
  for (let r = 0; r < Math.min(values.length, 80); r++) {
    const row = values[r].map(clean);
    const joined = row.join('|');
    if (joined.indexOf('일자') !== -1 && joined.indexOf('휴무입력') !== -1) {
      headerRow = r + 1;
      break;
    }
  }
  if (headerRow < 0) return null;
  const headers = values[headerRow - 1].map(clean);
  const dayCol = headers.indexOf('일자') + 1;
  const weekCol = headers.indexOf('요일') + 1;
  const inputCol = headers.indexOf('휴무입력') + 1;
  const memoCol = headers.indexOf('비고') + 1;
  if (!dayCol || !inputCol) return null;
  return { sheet: s, headerRow, dayCol, weekCol, inputCol, memoCol, values };
}
function leaveInputMonth(month) {
  const layout = leaveInputLayout();
  if (!layout) return month || thisMonth();
  const values = layout.values;
  let y = '';
  let m = '';
  for (let r = 0; r < Math.min(values.length, 8); r++) {
    for (let c = 0; c < Math.min(values[r].length, 8); c++) {
      const v = fmt(values[r][c]);
      const s = clean(v);
      if (!y && /^20\d{2}$/.test(s)) y = s;
      if (!m && /^\d{1,2}$/.test(s) && Number(s) >= 1 && Number(s) <= 12) m = ('0' + Number(s)).slice(-2);
      const ym = s.match(/(20\d{2})\s*[년\-.\/]\s*(\d{1,2})/);
      if (ym) { y = ym[1]; m = ('0' + Number(ym[2])).slice(-2); }
    }
  }
  if (y && m) return y + '-' + m;
  return month || thisMonth();
}
function knownLeaveTypes() {
  return ['휴무', '휴', '1', '2', 'V', 'V2', '반차+V', '1/2+V', '오전반차', '오후반차', '오전반차(V)', '오후반차(V)'];
}
function normalizeLeaveType(type) {
  type = clean(type || '휴무');
  if (type === '휴' || type === '1' || type === '2') return '휴무';
  if (type === '1/2+V') return '반차+V';
  return type || '휴무';
}
function parseLeaveEntry(entry) {
  let s = clean(entry);
  if (!s) return null;
  s = s.replace(/^[-•·\s]+/, '').trim();

  let name = s;
  let type = '휴무';

  // Apps Script에서 1/2+V 같은 표기가 정규식 리터럴을 깨는 경우가 있어서
  // 괄호 파싱은 정규식 대신 문자열 기준으로 처리한다.
  const openIdx1 = s.lastIndexOf('(');
  const openIdx2 = s.lastIndexOf('（');
  const openIdx = Math.max(openIdx1, openIdx2);
  const closeIdx1 = s.lastIndexOf(')');
  const closeIdx2 = s.lastIndexOf('）');
  const closeIdx = Math.max(closeIdx1, closeIdx2);

  if (openIdx > 0 && closeIdx > openIdx) {
    const inside = clean(s.substring(openIdx + 1, closeIdx));
    const before = clean(s.substring(0, openIdx));
    if (knownLeaveTypes().indexOf(inside) !== -1) {
      name = before;
      type = normalizeLeaveType(inside);
    }
  } else {
    const parts = s.split(/\s+/).filter(Boolean);
    const last = parts[parts.length - 1];
    if (knownLeaveTypes().indexOf(last) !== -1) {
      type = normalizeLeaveType(last);
      name = parts.slice(0, -1).join(' ');
    }
  }

  if (!name) return null;
  return { name: clean(name), type: normalizeLeaveType(type) };
}
function splitLeaveEntries(value) {
  return clean(value)
    .split(/[\n,，;；]+/)
    .map(clean)
    .filter(Boolean)
    .map(parseLeaveEntry)
    .filter(Boolean);
}
function formatLeaveEntry(name, type) {
  name = clean(name);
  type = normalizeLeaveType(type || '휴무');
  if (!name) return '';
  if (type === '휴무') return name;
  return name + '(' + type + ')';
}
function findLeaveDayRow(date) {
  const layout = leaveInputLayout();
  if (!layout) return null;
  const d = dateKey(date);
  const day = Number(d.slice(8, 10));
  if (!day) return null;
  const s = layout.sheet;
  const lastRow = s.getLastRow();
  for (let r = layout.headerRow + 1; r <= lastRow; r++) {
    const v = s.getRange(r, layout.dayCol).getValue();
    const n = Number(clean(v));
    if (n === day) return { layout, row: r, day: day, date: d };
  }
  const row = Math.max(layout.headerRow + day, layout.headerRow + 1);
  if (row > s.getMaxRows()) s.insertRowsAfter(s.getMaxRows(), row - s.getMaxRows());
  s.getRange(row, layout.dayCol).setValue(day);
  return { layout, row: row, day: day, date: d };
}
function setLeaveCellEntries(rowInfo, entries) {
  const text = entries.map(function(e){ return formatLeaveEntry(e.name, e.type); }).filter(Boolean).join('\n');
  rowInfo.layout.sheet.getRange(rowInfo.row, rowInfo.layout.inputCol).setValue(text);
}
function leaveRows(month) {
  month = clean(month) || thisMonth();
  const layout = leaveInputLayout();
  const rows = [];
  if (layout) {
    const m = leaveInputMonth(month);
    const s = layout.sheet;
    const lastRow = s.getLastRow();
    const startRow = layout.headerRow + 1;
    if (lastRow >= startRow) {
      const numRows = lastRow - startRow + 1;
      const lastCol = Math.max(s.getLastColumn(), layout.inputCol, layout.memoCol || 1, layout.dayCol);
      const values = s.getRange(startRow, 1, numRows, lastCol).getValues();
      values.forEach(function(row, idx) {
        const day = Number(clean(row[layout.dayCol - 1]));
        if (!day || day < 1 || day > 31) return;
        const date = m + '-' + ('0' + day).slice(-2);
        if (month && date.slice(0, 7) !== month) return;
        const memo = layout.memoCol ? fmt(row[layout.memoCol - 1]) : '';
        const entries = splitLeaveEntries(row[layout.inputCol - 1]);
        entries.forEach(function(e, entryIdx) {
          rows.push({ _row: startRow + idx, _entry: entryIdx, _sheet: DB.sheets.leave, 날짜: date, 일자: date, 이름: e.name, 구분: e.type, 휴무갯수: leaveCount(e.type), 인센티브변동: leaveDelta(e.type), 메모: memo });
        });
      });
    }
  } else {
    // 예비 호환: 표 구조가 바뀐 경우 기존 헤더 방식으로 읽는다.
    Array.prototype.push.apply(rows, tableRows(DB.sheets.leave, ['날짜', '이름', '구분']));
  }
  const holidays = tableRows(DB.sheets.holiday, ['날짜', '공휴일', '이름', '구분']);
  return monthFilter(rows.concat(holidays), month);
}
function healthRows() { return tableRows(DB.sheets.health, ['이름', '보건증', '만료일', '상태']); }
function noticeRows() {
  return tableRows(DB.sheets.notices, ['작성일', '제목', '내용']).sort(function(a, b) { return Number(b._row || 0) - Number(a._row || 0); });
}
function staffingRows(month) { return monthFilter(tableRows(DB.sheets.staffing, ['날짜', '이름', '구분', '근무인원']), month); }
function homepageLogRows() {
  return tableRows(DB.sheets.homepageLog, ['시간', '액션', '내용']).sort(function(a, b) { return Number(b._row || 0) - Number(a._row || 0); }).slice(0, 100);
}
function dashboardPairs() {
  const s = sheet(DB.sheets.dashboard);
  if (!s) return {};
  const values = s.getDataRange().getValues();
  const out = {};
  values.forEach(function(row) {
    for (let i = 0; i < row.length - 1; i++) {
      const key = clean(row[i]);
      const val = fmt(row[i + 1]);
      if (key && val !== '') out[key] = val;
    }
  });
  return out;
}
function statsFromEmployees(emp) {
  const active = emp.filter(isActiveEmployee);
  const incentiveTarget = emp.filter(function(r) { return clean(r['직급']) !== '사장' && clean(r['상태']) !== '제외'; });
  const totalHours = emp.reduce(function(sum, r) { return sum + (Number(r['현재누적'] || r['누적'] || r['인센티브'] || 0) || 0); }, 0);
  const twelvePlus = emp.filter(function(r) { return Number(r['현재누적'] || r['누적'] || r['인센티브'] || 0) >= 12; });
  return { totalEmployees: emp.length, activeEmployees: active.length, incentiveTarget: incentiveTarget.length, twelvePlus: twelvePlus.length, totalHours: totalHours };
}

function dashboardPayload(month) {
  const key = cacheKey(['dashboard', month, todayKey()]);
  const cached = cacheGet(key);
  if (cached) return cached;

  const out = baseInfo();
  // V11.2: 첫 화면은 직원 + 이번달 휴무만 읽는다. 보건증/공지/인센티브는 탭 진입 시 별도 로드.
  const emp = employeesCached();
  const leave = leaveRowsCached(month);
  out.employees = emp;
  out.leave = leave;
  out.holidays = leave;
  out.health = [];
  out.notices = [];
  out.stats = statsFromEmployees(emp);
  out.dashboard = {};
  out.workIncentiveSync = { ok: true, skipped: true, reason: 'V11.2 첫 화면 경량화 + 캐시' };
  cachePut(key, out, 90);
  return out;
}
function employeesPayload(month) { const out = baseInfo(); const emp = employeesCached(); out.employees = emp; out.leave = leaveRowsCached(month); out.holidays = out.leave; out.health = healthRowsCached(); out.incentives = incentiveRows(month); out.stats = statsFromEmployees(emp); return out; }
function leavePayload(month) { const out = baseInfo(); out.employees = employeesCached(); out.leave = leaveRowsCached(month); out.holidays = out.leave; return out; }
function healthPayload() { const out = baseInfo(); out.employees = employeesCached(); out.health = healthRowsCached(); return out; }
function noticesPayload() { const out = baseInfo(); out.notices = noticeRows(); return out; }

function staffingPayload(month) {
  const out = baseInfo();
  const emp = employeesCached ? employeesCached() : employees();
  const leave = leaveRowsCached ? leaveRowsCached(month) : leaveRows(month);
  let staffing = staffingRows(month);
  if (!staffing.length) {
    const today = todayKey();
    const offMap = {};
    leave.forEach(function(r){
      const d = dateKey(r['날짜'] || r['일자'] || r['휴무일'] || r['입력일']);
      const n = nameOf(r);
      const t = clean(r['구분'] || r['휴무구분'] || r['종류']);
      if (d === today && n && leaveCount(t) > 0) offMap[n] = t;
    });
    staffing = emp.filter(isActiveEmployee).map(function(e){
      const n = nameOf(e);
      return { _sheet: 'V11_계산', 날짜: today, 이름: n, 구분: offMap[n] ? '휴무' : '근무', 근무여부: offMap[n] ? '휴무' : '근무', 휴무구분: offMap[n] || '', 부서: e['부서'] || '', 직급: e['직급'] || '' };
    });
  }
  out.staffing = staffing;
  out.employees = emp;
  out.leave = leave;
  return out;
}

function allPayload(month) {
  const out = dashboardPayload(month);
  out.incentives = incentiveRows(month);
  out.staffing = staffingRows(month);
  out.logs = homepageLogRows();
  out.dashboard = dashboardPairs();
  out.sheets = Object.keys(DB.sheets).reduce(function(acc, k) { acc[k] = !!sheet(DB.sheets[k]); return acc; }, {});
  return out;
}

function numberOf(v) { const n = Number(clean(v)); return isNaN(n) ? 0 : n; }
function incentiveRows(month) {
  const emp = employees();
  const summary = tableRows(DB.sheets.incentiveSummary, ['이름', '현재누적', '누적', '잔여']);
  const logs = monthFilter(tableRows(DB.sheets.incentiveLog, ['날짜', '이름', '구분', '시간']), month);
  const manual = monthFilter(tableRows(DB.sheets.manualAdjust, ['날짜', '이름', '구분', '시간']), month);
  const map = {};

  emp.forEach(function(e) {
    const n = nameOf(e);
    if (!n) return;
    map[n] = numberOf(e['현재누적'] || e['누적'] || e['인센티브']);
  });
  summary.forEach(function(r) {
    const n = nameOf(r);
    if (!n) return;
    const v = numberOf(r['현재누적'] || r['누적'] || r['잔여'] || r['인센티브']);
    if (v !== 0) map[n] = v;
  });
  // 수기조정이 기존 시트 현재누적에 반영되지 않는 문제를 해결하기 위해 V11 화면 계산값에 더한다.
  manual.forEach(function(r) {
    const n = nameOf(r);
    if (!n) return;
    map[n] = (map[n] || 0) + numberOf(r['시간'] || r['인센티브변동']);
  });

  const computed = Object.keys(map).map(function(n) {
    return { _sheet: 'V11_계산', 이름: n, 현재누적: map[n], 누적: map[n], 잔여: map[n] % 12, 사용가능: Math.floor(map[n] / 12), 구분: 'V11계산' };
  });
  return computed.concat(logs).concat(manual);
}
function incentivesPayload(month) { const out = baseInfo(); out.employees = employees(); out.incentives = incentiveRows(month); return out; }

function ensureSheet(name, headers) {
  let s = sheet(name);
  if (!s) { s = ss().insertSheet(name); _sheetMap[name] = s; }
  if (s.getLastRow() === 0) s.appendRow(headers);
  ensureColumns(s, headers);
  return s;
}
function ensureColumns(s, headers) {
  const lastCol = Math.max(s.getLastColumn(), 1);
  const current = s.getRange(1, 1, 1, lastCol).getValues()[0].map(clean);
  headers.forEach(function(h) {
    if (current.indexOf(h) === -1) {
      s.getRange(1, s.getLastColumn() + 1).setValue(h);
      current.push(h);
    }
  });
}
function appendByHeader(s, obj) {
  const lastCol = Math.max(s.getLastColumn(), 1);
  const headers = s.getRange(1, 1, 1, lastCol).getValues()[0].map(clean);
  const row = headers.map(function(h) { return Object.prototype.hasOwnProperty.call(obj, h) ? obj[h] : ''; });
  s.appendRow(row);
}

function leaveCount(type) {
  type = normalizeLeaveType(type);
  if (type === '반차+V' || type === '오전반차' || type === '오후반차' || type === '오전반차(V)' || type === '오후반차(V)') return 0.5;
  if (type === 'V') return 1;
  if (type === 'V2') return 2;
  if (type === '휴무') return 1;
  return 0;
}
function leaveDelta(type) {
  type = normalizeLeaveType(type);
  if (type === '반차+V' || type === '오전반차(V)' || type === '오후반차(V)') return -6;
  if (type === 'V') return -12;
  if (type === 'V2') return -24;
  return 0;
}
function saveLeave(body) {
  const name = clean(body.name);
  const date = clean(body.date);
  const type = normalizeLeaveType(body.type || '휴무');
  const memo = clean(body.memo);
  const inputMonth = clean(body.inputMonth) || date.slice(0, 7);
  if (!name) return { ok: false, error: '이름을 선택하세요.' };
  if (!date) return { ok: false, error: '날짜를 선택하세요.' };
  if (knownLeaveTypes().map(normalizeLeaveType).indexOf(type) === -1 && type !== 'V2') return { ok: false, error: '구분 오류: ' + type };

  const rowInfo = findLeaveDayRow(date);
  if (!rowInfo) return { ok: false, error: '휴무입력 시트의 일자/휴무입력 구조를 찾을 수 없습니다.' };
  const s = rowInfo.layout.sheet;
  const cell = s.getRange(rowInfo.row, rowInfo.layout.inputCol);
  const entries = splitLeaveEntries(cell.getValue());
  let oldType = '';
  let updated = false;
  for (let i = 0; i < entries.length; i++) {
    if (clean(entries[i].name) === name) {
      oldType = clean(entries[i].type || '휴무');
      entries[i].type = type;
      updated = true;
      break;
    }
  }
  if (!updated) entries.push({ name: name, type: type });
  setLeaveCellEntries(rowInfo, entries);
  if (rowInfo.layout.memoCol && memo) {
    const memoCell = s.getRange(rowInfo.row, rowInfo.layout.memoCol);
    const oldMemo = clean(memoCell.getValue());
    memoCell.setValue(oldMemo ? oldMemo + '\n' + name + ': ' + memo : name + ': ' + memo);
  }

  const count = leaveCount(type);
  const oldDelta = oldType ? leaveDelta(oldType) : 0;
  const newDelta = leaveDelta(type);
  const diffDelta = newDelta - oldDelta;
  if (diffDelta !== 0) {
    const adjSheet = ensureSheet(DB.sheets.manualAdjust, ['날짜', '이름', '구분', '휴무갯수', '시간', '메모', '입력자', '입력시간']);
    appendByHeader(adjSheet, { '날짜': date, '이름': name, '구분': updated ? (oldType + '→' + type) : type, '휴무갯수': count, '시간': diffDelta, '메모': memo || (updated ? '홈페이지 휴무 수정 자동 보정' : type + ' 자동 차감'), '입력자': '홈페이지', '입력시간': nowKst() });
  }
  clearDashboardCache(inputMonth);
  return { ok: true, message: updated ? '휴무 수정 완료' : '휴무 입력 완료', updated: updated, count: count, delta: diffDelta, name: name, date: date, type: type };
}
function saveLeaveBulk(body) {
  const names = Array.isArray(body.names) ? body.names.map(clean).filter(Boolean) : [];
  if (!names.length) return { ok: false, error: '저장할 직원이 없습니다.' };
  const savedNames = [];
  const results = [];
  for (let i = 0; i < names.length; i++) {
    const res = saveLeave(Object.assign({}, body, { name: names[i] }));
    results.push(res);
    if (res && res.ok !== false) savedNames.push(names[i]);
  }
  const failed = results.filter(function(r){ return !r || r.ok === false; });
  if (failed.length) return { ok: false, error: failed[0].error || '일부 휴무 저장 실패', savedNames: savedNames, results: results };
  return { ok: true, message: '휴무 일괄 저장 완료', savedNames: savedNames, results: results };
}
function updateLeave(body) {
  const name = clean(body.name);
  const date = clean(body.date);
  const type = normalizeLeaveType(body.type || body.newType || '휴무');
  if (!name) return { ok: false, error: '수정할 직원 정보가 없습니다.' };
  if (!date) return { ok: false, error: '수정할 날짜 정보가 없습니다.' };
  return saveLeave(Object.assign({}, body, { name: name, date: date, type: type }));
}
function deleteLeave(body) {
  const row = Number(body.row || 0);
  const date = clean(body.date);
  const name = clean(body.name);
  const type = clean(body.type || '휴무');
  if (!date || !name) return { ok: false, error: '삭제할 날짜와 이름 정보가 없습니다.' };
  const rowInfo = findLeaveDayRow(date);
  if (!rowInfo) return { ok: false, error: '휴무입력 시트의 일자/휴무입력 구조를 찾을 수 없습니다.' };
  const s = rowInfo.layout.sheet;
  const cell = s.getRange(rowInfo.row, rowInfo.layout.inputCol);
  const entries = splitLeaveEntries(cell.getValue());
  let deleted = null;
  const next = entries.filter(function(e) {
    if (!deleted && clean(e.name) === name && (!type || clean(e.type || '휴무') === type)) {
      deleted = e;
      return false;
    }
    return true;
  });
  if (!deleted) {
    const next2 = entries.filter(function(e) {
      if (!deleted && clean(e.name) === name) { deleted = e; return false; }
      return true;
    });
    setLeaveCellEntries(rowInfo, next2);
  } else {
    setLeaveCellEntries(rowInfo, next);
  }
  if (!deleted) return { ok: false, error: '삭제할 휴무를 찾지 못했습니다.' };

  const deletedType = clean(deleted.type || type || '휴무');
  const delta = leaveDelta(deletedType);
  let restoreDelta = 0;
  if (delta !== 0) {
    restoreDelta = -delta;
    const adjSheet = ensureSheet(DB.sheets.manualAdjust, ['날짜', '이름', '구분', '휴무갯수', '시간', '메모', '입력자', '입력시간']);
    appendByHeader(adjSheet, { '날짜': date, '이름': name, '구분': deletedType + ' 삭제복구', '휴무갯수': leaveCount(deletedType), '시간': restoreDelta, '메모': '홈페이지 휴무 삭제로 자동 복구', '입력자': '홈페이지', '입력시간': nowKst() });
  }
  logHomepage('deleteLeave', name + ' / ' + date + ' / ' + deletedType + ' / restore ' + restoreDelta);
  clearDashboardCache(date.slice(0, 7));
  return { ok: true, message: '휴무 삭제 완료', restoreDelta: restoreDelta, deletedType: deletedType };
}
function saveHealth(body) {
  const name = clean(body.name);
  const expire = clean(body.expire || body.expireDate || body.date);
  const memo = clean(body.memo);
  if (!name) return { ok: false, error: '직원을 선택하세요.' };
  if (!expire) return { ok: false, error: '보건증 만료일을 입력하세요.' };
  const s = ensureSheet(DB.sheets.health, ['이름', '만료일', '상태', '메모', '입력자', '입력시간']);
  ensureColumns(s, ['이름', '만료일', '상태', '메모', '입력자', '입력시간']);
  const headers = s.getRange(1, 1, 1, Math.max(s.getLastColumn(), 1)).getValues()[0].map(clean);
  const nameCol = headers.indexOf('이름') + 1;
  const expireCol = headers.indexOf('만료일') + 1;
  const statusCol = headers.indexOf('상태') + 1;
  const memoCol = headers.indexOf('메모') + 1;
  const inputByCol = headers.indexOf('입력자') + 1;
  const inputTimeCol = headers.indexOf('입력시간') + 1;
  for (let r = 2; r <= s.getLastRow(); r++) {
    if (clean(s.getRange(r, nameCol).getValue()) === name) {
      if (expireCol) s.getRange(r, expireCol).setValue(expire);
      if (statusCol) s.getRange(r, statusCol).setValue(healthStatusText(expire));
      if (memoCol) s.getRange(r, memoCol).setValue(memo);
      if (inputByCol) s.getRange(r, inputByCol).setValue('홈페이지');
      if (inputTimeCol) s.getRange(r, inputTimeCol).setValue(nowKst());
      logHomepage('saveHealth', name + ' / ' + expire + ' 갱신');
      clearDashboardCache(thisMonth());
      return { ok: true, message: '보건증 갱신 완료' };
    }
  }
  appendByHeader(s, { '이름': name, '만료일': expire, '상태': healthStatusText(expire), '메모': memo, '입력자': '홈페이지', '입력시간': nowKst() });
  logHomepage('saveHealth', name + ' / ' + expire + ' 신규');
  clearDashboardCache(thisMonth());
  return { ok: true, message: '보건증 저장 완료' };
}
function healthStatusText(expire) {
  const d = new Date(clean(expire) + 'T00:00:00');
  if (isNaN(d.getTime())) return '날짜확인';
  const today = new Date(todayKey() + 'T00:00:00');
  const diff = Math.ceil((d.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return '만료';
  if (diff <= 30) return '30일이내';
  if (diff <= 60) return '60일이내';
  return '정상';
}
function manualAdjust(body) {
  const name = clean(body.name);
  const hours = Number(body.hours || body.time || 0);
  const memo = clean(body.memo);
  const date = clean(body.date) || todayKey();
  if (!name) return { ok: false, error: '직원을 선택하세요.' };
  if (!hours) return { ok: false, error: '조정 시간을 입력하세요.' };
  const s = ensureSheet(DB.sheets.manualAdjust, ['날짜', '이름', '구분', '휴무갯수', '시간', '메모', '입력자', '입력시간']);
  appendByHeader(s, { '날짜': date, '이름': name, '구분': hours > 0 ? '수기적립' : '수기차감', '휴무갯수': '', '시간': hours, '메모': memo || '홈페이지 수기조정', '입력자': '홈페이지', '입력시간': nowKst() });
  // V11.1: 속도 우선. 수기조정 저장 후 별도 홈페이지로그 기록은 생략한다.
  clearDashboardCache(date.slice(0, 7));
  return { ok: true, message: '인센티브 수기조정 완료', hours: hours, name: name, date: date };
}
function saveNotice(body) {
  const title = clean(body.title);
  const content = clean(body.content);
  const author = clean(body.author || '관리자');
  if (!title) return { ok: false, error: '제목을 입력하세요.' };
  if (!content) return { ok: false, error: '내용을 입력하세요.' };
  const s = ensureSheet(DB.sheets.notices, ['작성일', '제목', '내용', '작성자', '입력시간']);
  appendByHeader(s, { '작성일': todayKey(), '제목': title, '내용': content, '작성자': author, '입력시간': nowKst() });
  logHomepage('saveNotice', title);
  return { ok: true, message: '공지 저장 완료' };
}
function deleteNotice(body) {
  const row = Number(body.row || 0);
  const sheetName = clean(body.sheetName);
  if (sheetName !== DB.sheets.notices) return { ok: false, error: '공지사항 시트 자료만 삭제할 수 있습니다.' };
  if (!row || row < 2) return { ok: false, error: '삭제할 행 정보가 없습니다.' };
  const s = sheet(DB.sheets.notices);
  if (!s) return { ok: false, error: '공지사항 시트를 찾을 수 없습니다.' };
  if (row > s.getLastRow()) return { ok: false, error: '삭제할 행이 시트 범위를 벗어났습니다.' };
  s.deleteRow(row);
  logHomepage('deleteNotice', 'row ' + row);
  return { ok: true, message: '공지 삭제 완료' };
}
function backupMaster(body) {
  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss');
  const file = DriveApp.getFileById(MASTER_DB_ID);
  const copy = file.makeCopy('MASTER_DB_BACKUP_' + stamp);
  logHomepage('backupMaster', '백업 생성: ' + copy.getName());
  return { ok: true, message: 'MASTER_DB 백업 생성 완료', backupName: copy.getName(), backupId: copy.getId() };
}
function closeMonth(body) {
  const month = clean(body.month) || thisMonth();
  const s = ensureSheet(DB.sheets.closeLog, ['마감월', '마감일시', '재직직원', '휴무건수', '인센티브총시간', '보건증건수', '공지건수', '입력자']);
  const emp = employees().filter(isActiveEmployee);
  const leaves = leaveRows(month).filter(function(r) { return r._sheet === DB.sheets.leave; });
  const incTotal = incentiveRows(month).filter(function(r){ return r._sheet === 'V11_계산'; }).reduce(function(sum, r){ return sum + numberOf(r['현재누적']); }, 0);
  s.appendRow([month, nowKst(), emp.length, leaves.length, incTotal, healthRows().length, noticeRows().length, '홈페이지']);
  logHomepage('closeMonth', month + ' 월마감 / 재직 ' + emp.length + ' / 휴무 ' + leaves.length + ' / 인센티브 ' + incTotal);
  return { ok: true, message: month + ' 월마감 완료', month: month, employees: emp.length, leaves: leaves.length, incentiveTotal: incTotal };
}

function dateRangeOfMonth(month) {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const out = [];
  if (!y || !m) return out;
  const last = new Date(y, m, 0).getDate();
  for (let d = 1; d <= last; d++) out.push(new Date(y, m - 1, d));
  return out;
}
function getHolidayMap() {
  const rows = tableRows(DB.sheets.holiday, ['날짜', '공휴일']);
  const map = {};
  rows.forEach(function(r) { const d = dateKey(r['날짜'] || r['일자'] || r['공휴일일자']); if (d) map[d] = clean(r['공휴일'] || r['명칭'] || r['이름'] || r['구분'] || '공휴일'); });
  return map;
}
function getLeaveOffMap(month) {
  const rows = leaveRows(month);
  const map = {};
  rows.forEach(function(r) {
    const d = dateKey(r['날짜'] || r['일자'] || r['휴무일']);
    const name = nameOf(r);
    const type = clean(r['구분'] || r['휴무구분'] || '휴무');
    if (d && name && leaveCount(type) > 0) map[d + '|' + name] = type;
  });
  return map;
}
function existingAutoIncentiveKeys() {
  const rows = tableRows(DB.sheets.incentiveLog, ['날짜', '이름', '구분', '시간']);
  const map = {};
  rows.forEach(function(r) {
    const d = dateKey(r['날짜'] || r['일자']);
    const name = nameOf(r);
    const type = clean(r['구분'] || r['사유'] || r['내용']);
    const memo = clean(r['메모'] || r['비고'] || r['내용']);
    if (memo.indexOf('AUTO_WORK_INC:') !== -1) { const m = memo.match(/AUTO_WORK_INC:([^\s]+)/); if (m) map[m[1]] = true; }
    if (d && name && (type === '토요일근무' || type === '일요일근무' || type === '공휴일근무')) map[d + '|' + name] = true;
  });
  return map;
}
function syncWorkIncentives(month) {
  month = clean(month) || thisMonth();
  const lock = LockService.getScriptLock();
  try { lock.waitLock(5000); } catch (e) {}
  try {
    const holidays = getHolidayMap();
    const offMap = getLeaveOffMap(month);
    const existing = existingAutoIncentiveKeys();
    const active = employees().filter(isActiveEmployee).map(nameOf).filter(Boolean);
    const logSheet = ensureSheet(DB.sheets.incentiveLog, ['날짜', '이름', '구분', '시간', '메모', '입력자', '입력시간']);
    let added = 0;
    const preview = [];
    dateRangeOfMonth(month).forEach(function(dt) {
      const date = Utilities.formatDate(dt, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      const day = dt.getDay();
      const isSat = day === 6;
      const isSun = day === 0;
      const isHoliday = !!holidays[date];
      if (!isSat && !isSun && !isHoliday) return;
      const reason = isHoliday ? '공휴일근무' : (isSat ? '토요일근무' : '일요일근무');
      active.forEach(function(name) {
        if (offMap[date + '|' + name]) return;
        const key = date + '|' + name;
        preview.push({ 날짜: date, 이름: name, 구분: reason, 시간: 1, 공휴일: holidays[date] || '' });
        if (existing[key]) return;
        logSheet.appendRow([date, name, reason, 1, 'AUTO_WORK_INC:' + key + ' 토/일/공휴일 근무 자동 적립', '홈페이지', nowKst()]);
        existing[key] = true;
        added++;
      });
    });
    return { ok: true, month: month, added: added, previewCount: preview.length, preview: preview.slice(0, 200), rule: '토요일/일요일/공휴일 근무 +1시간' };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}
function logHomepage(action, detail) {
  try {
    const s = ensureSheet(DB.sheets.homepageLog, ['시간', '액션', '내용']);
    s.appendRow([nowKst(), action, detail]);
  } catch (e) {}
}

// ===== V1.0.8.1 Employee Sheet Recovery / Safe Register Patch =====
// 이전 패치에서 직원관리 시트 1행 기준으로 잘못 인식되는 문제를 막기 위한 안전 오버라이드.
function findEmployeeHeaderInfo_() {
  const s = sheet(DB.sheets.employees);
  if (!s) return null;
  const values = s.getDataRange().getValues();
  if (!values.length) return null;
  const limit = Math.min(values.length, 60);
  let best = null;
  for (let r = 0; r < limit; r++) {
    const headers = values[r].map(clean);
    const nameCol = Math.max(headers.indexOf('이름'), headers.indexOf('직원명'), headers.indexOf('성명'));
    if (nameCol < 0) continue;
    let count = 0;
    let fieldScore = 0;
    ['닉네임','별명','직급','직책','부서','상태','재직상태','사용여부','연락처','전화번호','휴대폰','현재누적','누적','인센티브'].forEach(function(h){ if (headers.indexOf(h) !== -1) fieldScore++; });
    for (let rr = r + 1; rr < values.length; rr++) {
      const n = clean(values[rr][nameCol]);
      if (n && n !== '이름' && n !== '직원명' && n !== '성명') count++;
    }
    const score = count * 10 + fieldScore - (r === 0 ? 3 : 0);
    if (!best || score > best.score) best = { sheet: s, values: values, headerIndex: r, headerRow: r + 1, headers: headers, nameCol: nameCol + 1, score: score, count: count };
  }
  return best;
}

function ensureHeaderColumnAtRow_(s, headerRow, headerName) {
  const lastCol = Math.max(s.getLastColumn(), 1);
  const headers = s.getRange(headerRow, 1, 1, lastCol).getValues()[0].map(clean);
  let idx = headers.indexOf(headerName);
  if (idx !== -1) return idx + 1;
  const col = lastCol + 1;
  s.getRange(headerRow, col).setValue(headerName);
  return col;
}

function setByHeaderRow_(s, headerRow, row, obj, onlyNonEmpty) {
  Object.keys(obj).forEach(function(h) {
    if (onlyNonEmpty && obj[h] === '') return;
    const c = ensureHeaderColumnAtRow_(s, headerRow, h);
    s.getRange(row, c).setValue(obj[h]);
  });
}

function appendByHeaderRow_(s, headerRow, obj) {
  Object.keys(obj).forEach(function(h){ ensureHeaderColumnAtRow_(s, headerRow, h); });
  const lastCol = Math.max(s.getLastColumn(), 1);
  const headers = s.getRange(headerRow, 1, 1, lastCol).getValues()[0].map(clean);
  const row = headers.map(function(h) { return Object.prototype.hasOwnProperty.call(obj, h) ? obj[h] : ''; });
  s.appendRow(row);
}

function repairBadEmployeeRows_() {
  const s = sheet(DB.sheets.employees);
  if (!s) return;
  const info = findEmployeeHeaderInfo_();
  if (!info || info.headerIndex === 0) return;
  const values = s.getDataRange().getValues();
  const topHeaders = values[0].map(clean);
  const badNameIdx = topHeaders.indexOf('이름');
  if (badNameIdx < 0) return;
  const realNameIdx = info.nameCol - 1;
  const existing = {};
  for (let r = info.headerIndex + 1; r < values.length; r++) {
    const n = clean(values[r][realNameIdx]);
    if (n) existing[n] = true;
  }
  for (let r = 1; r < values.length; r++) {
    const badName = clean(values[r][badNameIdx]);
    const realName = clean(values[r][realNameIdx]);
    if (!badName || realName || existing[badName]) continue;
    const obj = { '이름': badName };
    ['닉네임','직급','부서','상태','연락처','보건증만료일','메모','입력시간','수정시간','현재누적'].forEach(function(h) {
      const idx = topHeaders.indexOf(h);
      if (idx !== -1 && clean(values[r][idx]) !== '') obj[h] = values[r][idx];
    });
    if (!obj['상태']) obj['상태'] = '사용가능';
    if (!obj['현재누적']) obj['현재누적'] = 0;
    appendByHeaderRow_(s, info.headerRow, obj);
    existing[badName] = true;
  }
}

function employees() {
  const s = sheet(DB.sheets.employees);
  if (!s) return [];
  const info = findEmployeeHeaderInfo_();
  if (!info) return tableRows(DB.sheets.employees, ['이름', '현재누적', '상태', '직급', '부서']).filter(function(r) { return nameOf(r) !== ''; });
  const values = s.getDataRange().getValues();
  const headers = s.getRange(info.headerRow, 1, 1, Math.max(s.getLastColumn(), 1)).getValues()[0].map(function(h, i) { return clean(h) || ('col' + (i + 1)); });
  const rows = [];
  for (let r = info.headerIndex + 1; r < values.length; r++) {
    const row = values[r];
    const obj = { _row: r + 1, _sheet: DB.sheets.employees };
    let hasValue = false;
    headers.forEach(function(h, i) {
      const v = fmt(row[i]);
      obj[h] = v;
      if (v !== '' && v !== null && v !== undefined) hasValue = true;
    });
    if (hasValue && nameOf(obj) !== '') rows.push(obj);
  }
  return rows;
}

function saveEmployee(body) {
  const name = clean(body.name);
  if (!name) return { ok: false, error: '이름을 입력하세요.' };
  const nickname = clean(body.nickname || body.nick || '');
  const position = clean(body.position || body.job || body.role || '');
  const dept = clean(body.dept || body.department || '');
  const status = clean(body.status || '사용가능');
  const phone = clean(body.phone || body.tel || body.contact || '');
  const healthExpire = clean(body.healthExpire || body.expire || body.expireDate || '');
  const memo = clean(body.memo || '홈페이지 입력');
  const now = nowKst();

  const inputSheet = ensureSheet(DB.sheets.newEmployee, ['입력일', '이름', '닉네임', '직급', '부서', '상태', '연락처', '보건증만료일', '메모', '입력시간']);
  appendByHeader(inputSheet, { '입력일': todayKey(), '이름': name, '닉네임': nickname, '직급': position, '부서': dept, '상태': status, '연락처': phone, '보건증만료일': healthExpire, '메모': memo, '입력시간': now });

  const empSheet = sheet(DB.sheets.employees) || ensureSheet(DB.sheets.employees, ['이름', '닉네임', '직급', '부서', '상태', '연락처', '보건증만료일', '현재누적', '메모', '입력시간']);
  let info = findEmployeeHeaderInfo_();
  if (!info) {
    info = { sheet: empSheet, headerRow: 1, headerIndex: 0, nameCol: 1, headers: ['이름'], values: empSheet.getDataRange().getValues() };
    ensureHeaderColumnAtRow_(empSheet, 1, '이름');
  }
  ['이름','닉네임','직급','부서','상태','연락처','보건증만료일','현재누적','메모','입력시간','수정시간'].forEach(function(h){ ensureHeaderColumnAtRow_(empSheet, info.headerRow, h); });
  const values = empSheet.getDataRange().getValues();
  const headers = empSheet.getRange(info.headerRow, 1, 1, Math.max(empSheet.getLastColumn(), 1)).getValues()[0].map(clean);
  const nameIdx = Math.max(headers.indexOf('이름'), headers.indexOf('직원명'), headers.indexOf('성명'));
  let targetRow = 0;
  for (let r = info.headerIndex + 1; r < values.length; r++) {
    if (clean(values[r][nameIdx]) === name) { targetRow = r + 1; break; }
  }
  const obj = {
    '이름': name,
    '닉네임': nickname,
    '직급': position,
    '부서': dept,
    '상태': status,
    '연락처': phone,
    '보건증만료일': healthExpire,
    '메모': memo,
    '수정시간': now
  };
  if (targetRow) {
    setByHeaderRow_(empSheet, info.headerRow, targetRow, obj, true);
  } else {
    appendByHeaderRow_(empSheet, info.headerRow, Object.assign({ '현재누적': 0, '입력시간': now }, obj));
  }

  if (healthExpire) saveHealth({ name: name, expire: healthExpire, memo: '직원 등록 시 입력' });
  logHomepage('saveEmployee', name);
  cacheRemove([cacheKey(['employees']), cacheKey(['health'])]);
  clearDashboardCache(thisMonth());
  return { ok: true, message: targetRow ? '직원 정보 갱신 완료' : '직원 등록 완료' };
}


function deleteEmployee(body) {
  const row = Number(body.row || 0);
  const name = clean(body.name);
  const s = sheet(DB.sheets.employees);
  if (!s) return { ok: false, error: '직원관리 시트를 찾을 수 없습니다.' };
  const info = findEmployeeHeaderInfo_();
  if (!info) return { ok: false, error: '직원관리 헤더를 찾을 수 없습니다.' };
  if (row && row > info.headerRow && row <= s.getLastRow()) {
    const rowValues = s.getRange(row, 1, 1, Math.max(s.getLastColumn(), 1)).getValues()[0];
    const rowName = clean(rowValues[info.nameCol - 1]);
    if (name && rowName && rowName !== name) return { ok: false, error: '삭제 대상 이름이 일치하지 않습니다.' };
    s.deleteRow(row);
    logHomepage('deleteEmployee', (name || rowName) + ' / row ' + row);
    cacheRemove([cacheKey(['employees']), cacheKey(['health'])]);
    clearDashboardCache(thisMonth());
    return { ok: true, message: '직원 삭제 완료', deletedName: name || rowName, row: row };
  }
  if (!name) return { ok: false, error: '삭제할 직원 정보가 없습니다.' };
  const values = s.getDataRange().getValues();
  for (let r = info.headerIndex + 1; r < values.length; r++) {
    if (clean(values[r][info.nameCol - 1]) === name) {
      s.deleteRow(r + 1);
      logHomepage('deleteEmployee', name + ' / row ' + (r + 1));
      cacheRemove([cacheKey(['employees']), cacheKey(['health'])]);
      clearDashboardCache(thisMonth());
      return { ok: true, message: '직원 삭제 완료', deletedName: name, row: r + 1 };
    }
  }
  return { ok: false, error: '삭제할 직원을 찾지 못했습니다.' };
}

function repairEmployeesPayload() {
  try {
    repairBadEmployeeRows_();
    cacheRemove([cacheKey(['employees'])]);
    clearDashboardCache(thisMonth());
    return { ok: true, message: '직원 데이터 복구 검사 완료' };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
}
