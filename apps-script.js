// 안다미로 직원관리 홈페이지 API - MASTER_DB V6/V13
// 휴무 입력 저장 + 휴무갯수/인센티브변동 기록 + 토/일/공휴일 근무 인센티브 자동 적립
const MASTER_DB_ID = '1O-v-26uvnmj9B2n1pB98DMl1IV9mB3s-y9w0elcIMqU';

const V6 = {
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
    notices: '공지사항'
  }
};

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || 'all';
  return json(handle(action, e && e.parameter ? e.parameter : {}));
}

function doPost(e) {
  let body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) {}
  return json(handle(body.action || 'all', body));
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function ss() { return SpreadsheetApp.openById(MASTER_DB_ID); }
function sheet(name) { return ss().getSheetByName(name); }
function clean(value) { return String(value == null ? '' : value).trim(); }
function fmt(value) {
  if (Object.prototype.toString.call(value) === '[object Date]') return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return value == null ? '' : value;
}

function findHeaderRow(values, requiredHeaders) {
  const limit = Math.min(values.length, 30);
  for (let r = 0; r < limit; r++) {
    const row = values[r].map(clean);
    const hit = requiredHeaders.filter(h => row.indexOf(h) !== -1 || row.join('|').indexOf(h) !== -1).length;
    if (hit >= Math.min(requiredHeaders.length, 2)) return r;
  }
  // fallback: 가장 헤더처럼 보이는 줄 찾기
  let best = -1, score = -1;
  for (let r = 0; r < limit; r++) {
    const joined = values[r].map(clean).join('|');
    let s = 0;
    ['이름','직원명','날짜','구분','상태','직급','부서','현재누적','보건증','만료','잔여','시간'].forEach(k => { if (joined.indexOf(k) !== -1) s++; });
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
    const obj = { _row: r + 1 };
    let hasValue = false;
    headers.forEach(function(h, i) {
      const v = fmt(row[i]);
      obj[h] = v;
      if (v !== '' && v !== null && v !== undefined) hasValue = true;
    });
    if (hasValue) { obj._row = r + 1; obj._sheet = sheetName; rows.push(obj); }
  }
  return rows;
}

function dashboardPairs() {
  const s = sheet(V6.sheets.dashboard);
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
function employees() { return tableRows(V6.sheets.employees, ['이름', '현재누적', '상태', '직급', '부서']).filter(function(r) { return clean(r['이름'] || r['직원명']) !== ''; }); }
function leaveRows() { return tableRows(V6.sheets.leave, ['날짜', '이름', '구분']).concat(tableRows(V6.sheets.holiday, ['날짜', '공휴일', '이름', '구분'])); }
function healthRows() { return tableRows(V6.sheets.health, ['이름', '보건증', '만료일', '상태']); }
function incentiveRows() {
  return tableRows(V6.sheets.incentiveSummary, ['이름', '현재누적', '누적', '잔여'])
    .concat(tableRows(V6.sheets.incentiveLog, ['날짜', '이름', '구분', '시간']))
    .concat(tableRows(V6.sheets.manualAdjust, ['날짜', '이름', '구분', '시간']));
}
function staffingRows() { return tableRows(V6.sheets.staffing, ['날짜', '이름', '구분', '근무인원']); }
function noticeRows() {
  return tableRows(V6.sheets.notices, ['작성일', '제목', '내용']).sort(function(a,b){
    return Number(b._row||0)-Number(a._row||0);
  });
}

function homepageLogRows() {
  return tableRows(V6.sheets.homepageLog, ['시간', '액션', '내용']).sort(function(a,b){
    return Number(b._row||0)-Number(a._row||0);
  }).slice(0, 200);
}

function stats() {
  const emp = employees();
  const active = emp.filter(function(r) { const status = clean(r['상태']); return status !== '제외' && status !== '퇴사' && status !== '퇴사자'; });
  const incentiveTarget = emp.filter(function(r) { return clean(r['직급']) !== '사장' && clean(r['상태']) !== '제외'; });
  const twelvePlus = emp.filter(function(r) { return Number(r['현재누적'] || 0) >= 12; });
  const totalHours = emp.reduce(function(sum, r) { return sum + (Number(r['현재누적'] || 0) || 0); }, 0);
  return { totalEmployees: emp.length, activeEmployees: active.length, incentiveTarget: incentiveTarget.length, twelvePlus: twelvePlus.length, totalHours: totalHours, dashboard: dashboardPairs() };
}

function all(params) {
  const month = clean(params && params.month) || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM');
  const workSync = syncWorkIncentives(month);
  return {
    ok: true,
    version: 'v10-final-operations-20260704',
    spreadsheet: ss().getName(),
    sheets: Object.keys(V6.sheets).reduce(function(acc, k) { acc[k] = !!sheet(V6.sheets[k]); return acc; }, {}),
    stats: stats(),
    employees: employees(),
    holidays: leaveRows(),
    leave: leaveRows(),
    health: healthRows(),
    incentives: incentiveRows(),
    staffing: staffingRows(),
    notices: noticeRows(),
    logs: homepageLogRows(),
    dashboard: dashboardPairs(),
    workIncentiveSync: workSync
  };
}

function handle(action, body) {
  try {
    if (action === 'ping') return { ok: true, spreadsheet: ss().getName(), version: 'v10-final-operations-20260704' };
    if (action === 'all') return all(body);
    if (action === 'employees') return { ok: true, employees: employees(), stats: stats() };
    if (action === 'syncWorkIncentives') return syncWorkIncentives(clean(body.month) || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM'));
    if (action === 'saveLeave') return saveLeave(body);
    if (action === 'deleteLeave') return deleteLeave(body);
    if (action === 'saveEmployee') return saveEmployee(body);
    if (action === 'saveHealth') return saveHealth(body);
    if (action === 'manualAdjust') return manualAdjust(body);
    if (action === 'saveNotice') return saveNotice(body);
    if (action === 'deleteNotice') return deleteNotice(body);
    if (action === 'backupMaster') return backupMaster(body);
    if (action === 'closeMonth') return closeMonth(body);
    return all(body);
  } catch (err) { return { ok: false, error: String(err && err.message ? err.message : err), stack: String(err && err.stack ? err.stack : '') }; }
}

function ensureSheet(name, headers) {
  let s = sheet(name);
  if (!s) s = ss().insertSheet(name);
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
  type = clean(type);
  if (type === '반차+V') return 0.5;
  if (type === 'V') return 1;
  if (type === '휴무') return 1;
  return 0;
}

function leaveDelta(type) {
  type = clean(type);
  if (type === '반차+V') return -6;
  if (type === 'V') return -12;
  return 0;
}

function saveLeave(body) {
  const name = clean(body.name);
  const date = clean(body.date);
  const type = clean(body.type || '휴무');
  const memo = clean(body.memo);
  const inputMonth = clean(body.inputMonth) || date.slice(0, 7);
  if (!name) return { ok: false, error: '이름을 선택하세요.' };
  if (!date) return { ok: false, error: '날짜를 선택하세요.' };
  if (['휴무', '반차+V', 'V'].indexOf(type) === -1) return { ok: false, error: '구분은 휴무/반차+V/V만 가능합니다.' };

  const count = leaveCount(type);
  const delta = leaveDelta(type);
  const leaveSheet = ensureSheet(V6.sheets.leave, ['입력월', '날짜', '이름', '구분', '휴무갯수', '인센티브변동', '메모', '입력자', '입력시간']);

  // 같은 직원/날짜 중복 입력 방지: 기존 값이 있으면 저장 차단
  const existingRows = tableRows(V6.sheets.leave, ['날짜', '이름', '구분']);
  for (let i = 0; i < existingRows.length; i++) {
    const r = existingRows[i];
    const d = toDateKey(r['날짜'] || r['일자'] || r['휴무일']);
    const n = clean(r['이름'] || r['직원명'] || r['성명']);
    if (d === date && n === name) {
      return { ok: false, error: name + ' / ' + date + ' 은 이미 휴무가 등록되어 있습니다. 삭제 후 다시 입력하세요.' };
    }
  }

  appendByHeader(leaveSheet, {
    '입력월': inputMonth,
    '날짜': date,
    '이름': name,
    '구분': type,
    '휴무갯수': count,
    '인센티브변동': delta,
    '메모': memo,
    '입력자': '홈페이지',
    '입력시간': new Date()
  });

  if (delta !== 0) {
    const adjSheet = ensureSheet(V6.sheets.manualAdjust, ['날짜', '이름', '구분', '휴무갯수', '시간', '메모', '입력자', '입력시간']);
    appendByHeader(adjSheet, {
      '날짜': date,
      '이름': name,
      '구분': type,
      '휴무갯수': count,
      '시간': delta,
      '메모': memo || (type + ' 자동 차감'),
      '입력자': '홈페이지',
      '입력시간': new Date()
    });
  }

  logHomepage('saveLeave', name + ' / ' + date + ' / ' + type + ' / count ' + count + ' / delta ' + delta);
  return { ok: true, message: '휴무 입력 완료', count: count, delta: delta };
}


function deleteLeave(body) {
  const row = Number(body.row || 0);
  const sheetName = clean(body.sheetName);
  const date = clean(body.date);
  const name = clean(body.name);
  const type = clean(body.type || '휴무');
  if (!row || row < 2) return { ok: false, error: '삭제할 행 정보가 없습니다.' };
  if (sheetName !== V6.sheets.leave) return { ok: false, error: '휴무입력 시트 자료만 삭제할 수 있습니다.' };
  const s = sheet(V6.sheets.leave);
  if (!s) return { ok: false, error: '휴무입력 시트를 찾을 수 없습니다.' };
  if (row > s.getLastRow()) return { ok: false, error: '삭제할 행이 시트 범위를 벗어났습니다.' };

  const delta = leaveDelta(type);
  let restoreDelta = 0;
  if (delta !== 0 && name && date) {
    restoreDelta = -delta;
    const adjSheet = ensureSheet(V6.sheets.manualAdjust, ['날짜', '이름', '구분', '휴무갯수', '시간', '메모', '입력자', '입력시간']);
    appendByHeader(adjSheet, {
      '날짜': date,
      '이름': name,
      '구분': type + ' 삭제복구',
      '휴무갯수': leaveCount(type),
      '시간': restoreDelta,
      '메모': '홈페이지 휴무 삭제로 자동 복구',
      '입력자': '홈페이지',
      '입력시간': new Date()
    });
  }
  s.deleteRow(row);
  logHomepage('deleteLeave', name + ' / ' + date + ' / ' + type + ' / restore ' + restoreDelta);
  return { ok: true, message: '휴무 삭제 완료', restoreDelta: restoreDelta };
}

function saveEmployee(body) {
  const s = ensureSheet(V6.sheets.newEmployee, ['입력일', '이름', '직급', '부서', '상태', '메모']);
  if (!clean(body.name)) return { ok: false, error: '이름을 입력하세요.' };
  s.appendRow([new Date(), body.name || '', body.position || '', body.dept || '', body.status || '사용가능', '홈페이지 입력']);
  return { ok: true, message: '직원 입력 완료' };
}

function toDateKey(value) {
  const s = clean(fmt(value));
  const m = s.match(/(\d{4})[.\/-]\s*(\d{1,2})[.\/-]\s*(\d{1,2})/);
  if (m) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  return s.slice(0, 10);
}
function dateRangeOfMonth(month) {
  const y = Number(month.slice(0,4));
  const m = Number(month.slice(5,7));
  const out = [];
  if (!y || !m) return out;
  const last = new Date(y, m, 0).getDate();
  for (let d = 1; d <= last; d++) out.push(new Date(y, m - 1, d));
  return out;
}
function isActiveEmployee(row) {
  const status = clean(row['상태'] || row['재직상태'] || row['사용여부']);
  return status.indexOf('퇴사') === -1 && status.indexOf('제외') === -1 && status.indexOf('비활성') === -1;
}
function employeeName(row) { return clean(row['이름'] || row['직원명'] || row['성명'] || row['name']); }
function getHolidayMap() {
  const rows = tableRows(V6.sheets.holiday, ['날짜', '공휴일']);
  const map = {};
  rows.forEach(function(r) {
    const d = toDateKey(r['날짜'] || r['일자'] || r['공휴일일자']);
    if (d) map[d] = clean(r['공휴일'] || r['명칭'] || r['이름'] || r['구분'] || '공휴일');
  });
  return map;
}
function getLeaveOffMap(month) {
  const rows = tableRows(V6.sheets.leave, ['날짜', '이름', '구분']);
  const map = {};
  rows.forEach(function(r) {
    const d = toDateKey(r['날짜'] || r['일자'] || r['휴무일']);
    if (d.slice(0,7) !== month) return;
    const name = clean(r['이름'] || r['직원명'] || r['성명']);
    const type = clean(r['구분'] || r['휴무구분'] || '휴무');
    if (!d || !name) return;
    if (type === '휴무' || type === 'V' || type === '반차+V') map[d + '|' + name] = type;
  });
  return map;
}
function existingAutoIncentiveKeys() {
  const rows = tableRows(V6.sheets.incentiveLog, ['날짜', '이름', '구분', '시간']);
  const map = {};
  rows.forEach(function(r) {
    const d = toDateKey(r['날짜'] || r['일자']);
    const name = clean(r['이름'] || r['직원명'] || r['성명']);
    const type = clean(r['구분'] || r['사유'] || r['내용']);
    const memo = clean(r['메모'] || r['비고'] || r['내용']);
    if (memo.indexOf('AUTO_WORK_INC:') !== -1) {
      const m = memo.match(/AUTO_WORK_INC:([^\s]+)/);
      if (m) map[m[1]] = true;
    }
    if (d && name && (type === '토요일근무' || type === '일요일근무' || type === '공휴일근무')) map[d + '|' + name] = true;
  });
  return map;
}
function syncWorkIncentives(month) {
  month = clean(month) || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM');
  const lock = LockService.getScriptLock();
  try { lock.waitLock(5000); } catch (e) {}
  try {
    const holidays = getHolidayMap();
    const offMap = getLeaveOffMap(month);
    const existing = existingAutoIncentiveKeys();
    const active = employees().filter(isActiveEmployee).map(employeeName).filter(Boolean);
    const logSheet = ensureSheet(V6.sheets.incentiveLog, ['날짜', '이름', '구분', '시간', '메모', '입력자', '입력시간']);
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
        logSheet.appendRow([date, name, reason, 1, 'AUTO_WORK_INC:' + key + ' 토/일/공휴일 근무 자동 적립', '홈페이지', new Date()]);
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
    const s = ensureSheet(V6.sheets.homepageLog, ['시간', '액션', '내용']);
    s.appendRow([new Date(), action, detail]);
  } catch (e) {}
}


function saveNotice(body) {
  const title = clean(body.title);
  const content = clean(body.content);
  const author = clean(body.author || '관리자');
  if (!title) return { ok: false, error: '제목을 입력하세요.' };
  if (!content) return { ok: false, error: '내용을 입력하세요.' };
  const s = ensureSheet(V6.sheets.notices, ['작성일', '제목', '내용', '작성자', '입력시간']);
  appendByHeader(s, {
    '작성일': Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
    '제목': title,
    '내용': content,
    '작성자': author,
    '입력시간': new Date()
  });
  logHomepage('saveNotice', title);
  return { ok: true, message: '공지 저장 완료' };
}

function deleteNotice(body) {
  const row = Number(body.row || 0);
  const sheetName = clean(body.sheetName);
  if (sheetName !== V6.sheets.notices) return { ok: false, error: '공지사항 시트 자료만 삭제할 수 있습니다.' };
  if (!row || row < 2) return { ok: false, error: '삭제할 행 정보가 없습니다.' };
  const s = sheet(V6.sheets.notices);
  if (!s) return { ok: false, error: '공지사항 시트를 찾을 수 없습니다.' };
  if (row > s.getLastRow()) return { ok: false, error: '삭제할 행이 시트 범위를 벗어났습니다.' };
  s.deleteRow(row);
  logHomepage('deleteNotice', 'row ' + row);
  return { ok: true, message: '공지 삭제 완료' };
}


function saveHealth(body) {
  const name = clean(body.name);
  const expire = clean(body.expire || body.expireDate || body.date);
  const memo = clean(body.memo);
  if (!name) return { ok: false, error: '직원을 선택하세요.' };
  if (!expire) return { ok: false, error: '보건증 만료일을 입력하세요.' };
  const s = ensureSheet(V6.sheets.health, ['이름', '만료일', '상태', '메모', '입력자', '입력시간']);
  ensureColumns(s, ['이름', '만료일', '상태', '메모', '입력자', '입력시간']);
  const lastCol = Math.max(s.getLastColumn(), 1);
  const headers = s.getRange(1, 1, 1, lastCol).getValues()[0].map(clean);
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
      if (inputTimeCol) s.getRange(r, inputTimeCol).setValue(new Date());
      logHomepage('saveHealth', name + ' / ' + expire + ' 갱신');
      return { ok: true, message: '보건증 갱신 완료' };
    }
  }
  appendByHeader(s, {
    '이름': name,
    '만료일': expire,
    '상태': healthStatusText(expire),
    '메모': memo,
    '입력자': '홈페이지',
    '입력시간': new Date()
  });
  logHomepage('saveHealth', name + ' / ' + expire + ' 신규');
  return { ok: true, message: '보건증 저장 완료' };
}

function healthStatusText(expire) {
  const d = new Date(clean(expire) + 'T00:00:00');
  if (isNaN(d.getTime())) return '날짜확인';
  const today = new Date(Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd') + 'T00:00:00');
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
  const date = clean(body.date) || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  if (!name) return { ok: false, error: '직원을 선택하세요.' };
  if (!hours) return { ok: false, error: '조정 시간을 입력하세요.' };
  const s = ensureSheet(V6.sheets.manualAdjust, ['날짜', '이름', '구분', '휴무갯수', '시간', '메모', '입력자', '입력시간']);
  appendByHeader(s, {
    '날짜': date,
    '이름': name,
    '구분': hours > 0 ? '수기적립' : '수기차감',
    '휴무갯수': '',
    '시간': hours,
    '메모': memo || '홈페이지 수기조정',
    '입력자': '홈페이지',
    '입력시간': new Date()
  });
  logHomepage('manualAdjust', name + ' / ' + hours + '시간 / ' + memo);
  return { ok: true, message: '인센티브 수기조정 완료', hours: hours };
}


function backupMaster(body) {
  const tz = Session.getScriptTimeZone();
  const stamp = Utilities.formatDate(new Date(), tz, 'yyyyMMdd_HHmmss');
  const file = DriveApp.getFileById(MASTER_DB_ID);
  const copy = file.makeCopy('MASTER_DB_BACKUP_' + stamp);
  logHomepage('backupMaster', '백업 생성: ' + copy.getName());
  return { ok: true, message: 'MASTER_DB 백업 생성 완료', backupName: copy.getName(), backupId: copy.getId() };
}

function closeMonth(body) {
  const month = clean(body.month) || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM');
  const s = ensureSheet('월마감로그', ['마감월', '마감일시', '재직직원', '휴무건수', '인센티브총시간', '보건증건수', '공지건수', '입력자']);
  const emp = employees().filter(isActiveEmployee);
  const leaves = tableRows(V6.sheets.leave, ['날짜', '이름', '구분']).filter(function(r){
    return toDateKey(r['날짜'] || r['일자'] || r['휴무일']).slice(0,7) === month;
  });
  const incTotal = employees().reduce(function(sum, r){ return sum + (Number(r['현재누적'] || r['누적'] || r['인센티브'] || 0) || 0); }, 0);
  s.appendRow([month, new Date(), emp.length, leaves.length, incTotal, healthRows().length, noticeRows().length, '홈페이지']);
  logHomepage('closeMonth', month + ' 월마감 / 재직 ' + emp.length + ' / 휴무 ' + leaves.length + ' / 인센티브 ' + incTotal);
  return { ok: true, message: month + ' 월마감 완료', month: month, employees: emp.length, leaves: leaves.length, incentiveTotal: incTotal };
}
