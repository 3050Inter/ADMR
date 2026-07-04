'use client';

import { useEffect, useMemo, useState } from 'react';

type Row = Record<string, any>;
const tabs = ['대시보드', '직원관리', '휴무관리', '근무인원', '보건증', '인센티브', '공지사항', '운영통계', '시스템', '연결확인'];

function val(r: Row, keys: string[]) {
  for (const k of keys) {
    const v = r?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}
function dateOnly(v: any) {
  const s = String(v || '');
  const m = s.match(/(\d{4})[.\/-]\s*(\d{1,2})[.\/-]\s*(\d{1,2})/);
  if (m) return `${m[1]}-${String(Number(m[2])).padStart(2, '0')}-${String(Number(m[3])).padStart(2, '0')}`;
  return s.slice(0, 10);
}
function isActive(r: Row) {
  const s = val(r, ['상태', '재직상태', '사용여부']);
  return !s.includes('퇴사') && !s.includes('제외') && !s.includes('비활성');
}
function nameOf(r: Row) { return val(r, ['이름', '직원명', '성명', 'name']); }
async function apiGet(action = 'all', params: Row = {}) {
  const url = new URL('/api/masterdb', location.origin);
  url.searchParams.set('action', action);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  const res = await fetch(url.toString(), { cache: 'no-store' });
  return res.json();
}
async function apiPost(body: Row) {
  const res = await fetch('/api/masterdb', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

export default function Page() {
  const [tab, setTab] = useState('대시보드');
  const [data, setData] = useState<Row>({});
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  async function loadAction(action = 'dashboard') {
    setLoading(true); setErr('');
    try {
      const j = await apiGet(action, { month });
      if (j.ok === false) setErr(j.error || 'API 오류');
      setData(prev => ({ ...prev, ...j }));
    } catch (e: any) { setErr(String(e?.message || e)); }
    finally { setLoading(false); }
  }
  async function loadDashboard() { return loadAction('dashboard'); }
  async function loadFull() { return loadAction('all'); }
  function actionForTab(t: string) {
    if (t === '직원관리') return 'employees';
    if (t === '휴무관리') return 'leave';
    if (t === '근무인원') return 'staffing';
    if (t === '보건증') return 'health';
    if (t === '인센티브') return 'incentives';
    if (t === '공지사항') return 'notices';
    if (t === '운영통계' || t === '시스템' || t === '연결확인') return 'all';
    return 'dashboard';
  }
  function goTab(t: string) {
    setTab(t);
    loadAction(actionForTab(t));
  }
  useEffect(() => { loadDashboard(); }, [month]);
  const employees: Row[] = data.employees || [];
  const leave: Row[] = data.leave || data.holidays || [];
  const health: Row[] = data.health || [];
  const incentives: Row[] = data.incentives || [];
  const staffing: Row[] = data.staffing || [];
  const notices: Row[] = data.notices || [];
  const active = employees.filter(isActive);
  const today = new Date().toISOString().slice(0, 10);
  const todayOff = leave.filter(r => dateOnly(val(r, ['날짜', '일자', '휴무일', '입력일'])) === today);
  const todayOffNames = new Set(todayOff.map(r => nameOf(r) || val(r, ['이름', '직원명'])));
  const todayWork = active.filter(r => !todayOffNames.has(nameOf(r)));
  const healthWarnings = health.filter(r => {
    const exp = val(r, ['만료일','보건증만료일','보건증 만료일','날짜']);
    const days = dday(exp);
    return days === null || days <= 30;
  });
  return <main>
    <div className="top"><div><h1 style={{ margin: '0 0 6px' }}>안다미로 직원관리 V10 Final</h1><div className="muted">점장용 Dashboard / MASTER_DB 실데이터 연결</div></div><div className="row"><input className="input" type="month" value={month} onChange={e => setMonth(e.target.value)} /><button className="btn" onClick={() => loadAction(actionForTab(tab))}>새로고침</button></div></div>
    <div className="cards dashboard-main-cards"><Stat t="👥 오늘 근무" v={todayWork.length} /><Stat t="🏖 오늘 휴무" v={todayOff.length} /><Stat t="🩺 보건증 만료" v={healthWarnings.length} /></div>
    <div className="nav">{tabs.map(t => <button key={t} className={tab === t ? 'active' : ''} onClick={() => goTab(t)}>{t}</button>)}</div>
    {loading && <div className="card">불러오는 중...</div>}{err && <div className="card err">오류: {err}</div>}
    {!loading && !err && <>
      {tab === '대시보드' && <Dashboard data={data} active={active} todayWork={todayWork} todayOff={todayOff} healthWarnings={healthWarnings} notices={notices} goTab={goTab} />}
      {tab === '직원관리' && <Employees rows={employees} onSaved={() => loadAction('employees')} />}
      {tab === '휴무관리' && <Leave rows={leave} employees={employees} month={month} onSaved={() => loadAction('leave')} />}
      {tab === '근무인원' && <Table title="근무인원" rows={staffing} />}
      {tab === '보건증' && <Health rows={health} employees={employees} onSaved={() => loadAction('health')} />}
      {tab === '인센티브' && <Incentive rows={incentives} employees={employees} onSaved={() => loadAction('incentives')} />}
      {tab === '공지사항' && <Notice rows={notices} onSaved={() => loadAction('notices')} />}
      {tab === '운영통계' && <Operations data={data} employees={employees} leave={leave} incentives={incentives} health={health} month={month} />}
      {tab === '시스템' && <SystemTools data={data} month={month} onSaved={loadFull} />}
      {tab === '연결확인' && <Debug data={data} />}
    </>}
  </main>;
}
function Stat({ t, v }: { t: string, v: any }) { return <div className="card"><div className="muted">{t}</div><div className="num">{v}</div></div>; }
function Dashboard({ data, active, todayWork, todayOff, healthWarnings, notices, goTab }: any) {
  const workNames = (todayWork || []).map((r: Row) => nameOf(r)).filter(Boolean);
  const offNames = (todayOff || []).map((r: Row) => nameOf(r) || val(r, ['이름', '직원명'])).filter(Boolean);
  return <>
    <div className="notice-hero card">
      <div className="top"><h2>📢 공지사항</h2><span className="muted small">최근 5건</span></div>
      {notices?.slice(0, 5).map((n: Row, i: number) => <div key={i} className="notice-mini"><b>{val(n, ['제목']) || '제목 없음'}</b><p>{val(n, ['내용'])}</p></div>)}
      {!notices?.length && <p className="muted">등록된 공지가 없습니다.</p>}
    </div>
    <div className="grid2">
      <div className="card"><h2>👥 오늘 근무자</h2>{workNames.length ? <p>{workNames.join(', ')}</p> : <p className="muted">표시할 근무자가 없습니다.</p>}<p className="muted small">재직 직원 {active.length}명 기준</p></div>
      <div className="card"><h2>🏖 오늘 휴무자</h2>{offNames.length ? <p>{offNames.join(', ')}</p> : <p className="muted">오늘 휴무자가 없습니다.</p>}</div>
      <div className="card"><h2>🩺 보건증 경고</h2>{healthWarnings?.slice(0, 6).map((r: Row, i: number) => { const exp = val(r, ['만료일','보건증만료일','보건증 만료일','날짜']); const st = healthStatus(dday(exp)); return <p key={i}>• <b>{nameOf(r)}</b> <span className={`status ${st.cls}`}>{st.text}</span></p>; })}{!healthWarnings?.length && <p className="muted">만료 예정 없음</p>}</div>
      <div className="card"><h2>빠른 실행</h2><div className="row"><button className="btn" onClick={() => goTab('직원관리')}>➕ 직원 추가</button><button className="btn" onClick={() => goTab('휴무관리')}>📅 휴무 입력</button><button className="btn" onClick={() => goTab('공지사항')}>📢 공지 작성</button><button className="btn secondary" onClick={() => goTab('시스템')}>📦 월마감</button></div><p className="muted small">API 버전: {data.version || '-'} / 시트: {data.spreadsheet || '-'}</p></div>
    </div>
  </>;
}
function Employees({ rows, onSaved }: { rows: Row[], onSaved: () => void }) {
  const [q, setQ] = useState(''); const [name, setName] = useState(''); const [position, setPosition] = useState(''); const [dept, setDept] = useState(''); const [status, setStatus] = useState('사용가능'); const [saving, setSaving] = useState(false);
  const filtered = rows.filter(r => nameOf(r).includes(q));
  async function save() { if (!name.trim()) return alert('이름을 입력하세요.'); setSaving(true); const j = await apiPost({ action: 'saveEmployee', name, position, dept, status }); setSaving(false); if (j.ok === false) return alert(j.error || '저장 실패'); setName(''); setPosition(''); setDept(''); onSaved(); }
  return <><div className="card"><h2>직원 등록</h2><div className="row"><input className="input grow" placeholder="이름" value={name} onChange={e => setName(e.target.value)} /><input className="input" placeholder="직급" value={position} onChange={e => setPosition(e.target.value)} /><select value={dept} onChange={e => setDept(e.target.value)}><option value="">부서</option><option>홀</option><option>주방</option></select><select value={status} onChange={e => setStatus(e.target.value)}><option>사용가능</option><option>휴직</option><option>퇴사</option></select><button className="btn" onClick={save} disabled={saving}>{saving ? '저장중' : '직원 저장'}</button></div></div><div className="card"><h2>직원 목록</h2><input className="input" placeholder="이름 검색" value={q} onChange={e => setQ(e.target.value)} style={{ marginBottom: 12 }} /><Table title="" rows={filtered} /></div></>;
}

function daysInMonth(month: string) {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return Array.from({ length: last }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
}
function dayLabel(date: string) {
  return String(Number(date.slice(8, 10)));
}
function dayClass(date: string, holidays: Row[]) {
  const d = new Date(`${date}T00:00:00`);
  const isHoliday = holidays.some(r => dateOnly(val(r, ['날짜', '일자', '공휴일일자'])) === date);
  if (isHoliday || d.getDay() === 0) return 'day sun';
  if (d.getDay() === 6) return 'day sat';
  return 'day';
}
function leaveTypeOf(r?: Row) {
  return val(r || {}, ['구분', '휴무구분', '종류']) || '';
}
function leaveBadgeClass(type: string) {
  if (type === 'V') return 'leave-badge v';
  if (type === '반차+V') return 'leave-badge half';
  if (type === '휴무') return 'leave-badge off';
  return 'leave-badge work';
}
function leaveCountOf(type: string) {
  if (type === '반차+V') return 0.5;
  if (type === 'V') return 1;
  if (type === '휴무') return 1;
  return 0;
}
function Leave({ rows, employees, month, onSaved }: { rows: Row[], employees: Row[], month: string, onSaved: () => void }) {
  const activeEmployees = employees.filter(isActive).filter(r => nameOf(r));
  const [date, setDate] = useState(`${month}-01`);
  const [type, setType] = useState('휴무');
  const [memo, setMemo] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const days = useMemo(() => daysInMonth(month), [month]);
  const monthRows = rows.filter(r => dateOnly(val(r, ['날짜', '일자', '휴무일'])).startsWith(month));
  const holidays = monthRows.filter(r => val(r, ['공휴일', '명칭']) || val(r, ['_sheet']) === '공휴일입력');
  const byKey = new Map<string, Row>();
  monthRows.forEach(r => {
    const d = dateOnly(val(r, ['날짜', '일자', '휴무일']));
    const n = nameOf(r);
    const t = leaveTypeOf(r);
    if (d && n && (t === '휴무' || t === 'V' || t === '반차+V')) byKey.set(`${d}|${n}`, r);
  });
  const summary = activeEmployees.map(emp => {
    const n = nameOf(emp);
    const mine = monthRows.filter(r => nameOf(r) === n);
    const counts = mine.reduce((acc: Row, r) => {
      const t = leaveTypeOf(r);
      acc.total = (acc.total || 0) + leaveCountOf(t);
      acc[t] = (acc[t] || 0) + 1;
      return acc;
    }, { total: 0 });
    return { name: n, total: counts.total || 0, off: counts['휴무'] || 0, v: counts['V'] || 0, half: counts['반차+V'] || 0 };
  });
  function toggleName(name: string) {
    setSelected(prev => prev.includes(name) ? prev.filter(v => v !== name) : [...prev, name]);
  }
  function clickCell(name: string, d: string) {
    setDate(d);
    setSelected([name]);
    const existing = byKey.get(`${d}|${name}`);
    if (existing) setType(leaveTypeOf(existing) || '휴무');
  }
  async function saveBulk() {
    if (!date || selected.length === 0) return alert('날짜와 직원을 선택하세요.');
    setSaving(true);
    try {
      for (const name of selected) {
        const j = await apiPost({ action: 'saveLeave', name, date, type, memo, inputMonth: month });
        if (j.ok === false) throw new Error(j.error || `${name} 저장 실패`);
      }
      setMemo('');
      onSaved();
      alert(`${selected.length}명 휴무 저장 완료`);
    } catch (e: any) {
      alert(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  }
  async function deleteOne(r: Row) {
    if (!confirm('이 휴무를 삭제할까요?')) return;
    const j = await apiPost({
      action: 'deleteLeave',
      row: r._row,
      sheetName: r._sheet || '휴무입력',
      date: dateOnly(val(r, ['날짜', '일자', '휴무일'])),
      name: nameOf(r),
      type: leaveTypeOf(r),
    });
    if (j.ok === false) return alert(j.error || '삭제 실패');
    onSaved();
  }
  return <>
    <div className="card">
      <div className="top"><h2>휴무관리 달력</h2><div className="muted">{month} / 직원별 월간 휴무표</div></div>
      <div className="leave-controls">
        <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
        <select value={type} onChange={e => setType(e.target.value)}><option>휴무</option><option>V</option><option>반차+V</option></select>
        <input className="input grow" placeholder="메모" value={memo} onChange={e => setMemo(e.target.value)} />
        <button className="btn" onClick={saveBulk} disabled={saving}>{saving ? '저장중' : `${selected.length || 0}명 저장`}</button>
      </div>
      <div className="employee-checks">
        {activeEmployees.map((e, i) => {
          const n = nameOf(e);
          return <label key={i} className={selected.includes(n) ? 'check active' : 'check'}><input type="checkbox" checked={selected.includes(n)} onChange={() => toggleName(n)} /> {n}</label>;
        })}
      </div>
      <div className="legend"><span className="leave-badge work">근무</span><span className="leave-badge off">휴</span><span className="leave-badge v">V</span><span className="leave-badge half">반차+V</span><span className="muted small">칸 클릭 = 해당 직원/날짜 선택</span></div>
    </div>

    <div className="card calendar-wrap">
      <table className="calendar-table">
        <thead><tr><th className="sticky-name">직원명</th>{days.map(d => <th key={d} className={dayClass(d, holidays)}>{dayLabel(d)}</th>)}</tr></thead>
        <tbody>
          {activeEmployees.map((emp, i) => {
            const n = nameOf(emp);
            return <tr key={i}><th className="sticky-name emp-name">{n}</th>{days.map(d => {
              const r = byKey.get(`${d}|${n}`);
              const t = leaveTypeOf(r);
              return <td key={d} onClick={() => clickCell(n, d)} className={r ? 'calendar-cell has-leave' : 'calendar-cell'}><span className={leaveBadgeClass(t)}>{t || '○'}</span></td>;
            })}</tr>;
          })}
        </tbody>
      </table>
    </div>

    <div className="grid2">
      <div className="card"><h2>직원별 휴무 개수</h2><table><thead><tr><th>직원</th><th>총휴무</th><th>휴</th><th>V</th><th>반차+V</th></tr></thead><tbody>{summary.map(s => <tr key={s.name}><td>{s.name}</td><td><b>{s.total}</b></td><td>{s.off}</td><td>{s.v}</td><td>{s.half}</td></tr>)}</tbody></table></div>
      <div className="card"><h2>{month} 휴무 목록</h2>{!monthRows.length && <p className="muted">등록된 휴무가 없습니다.</p>}{monthRows.slice(0, 80).map((r, i) => <div key={i} className="leave-list-row"><span>{dateOnly(val(r, ['날짜', '일자', '휴무일']))}</span><b>{nameOf(r)}</b><span className={leaveBadgeClass(leaveTypeOf(r))}>{leaveTypeOf(r)}</span>{r._sheet === '휴무입력' && <button className="btn secondary" onClick={() => deleteOne(r)}>삭제</button>}</div>)}</div>
    </div>
  </>;
}
function dday(dateValue: any) {
  const d = dateOnly(dateValue);
  if (!d) return null;
  const today0 = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00');
  const target = new Date(d + 'T00:00:00');
  const diff = Math.ceil((target.getTime() - today0.getTime()) / 86400000);
  return diff;
}
function healthStatus(days: number | null) {
  if (days === null) return { text: '미등록', cls: 'danger' };
  if (days < 0) return { text: `만료 ${Math.abs(days)}일`, cls: 'danger' };
  if (days <= 30) return { text: `D-${days}`, cls: 'danger' };
  if (days <= 60) return { text: `D-${days}`, cls: 'warn' };
  return { text: `D-${days}`, cls: 'ok' };
}

function incentiveHoursOf(row: Row) {
  return Number(val(row, ['현재누적', '누적', '잔여', '시간', '인센티브']) || 0) || 0;
}
function incentiveDisplay(hours: number) {
  const usable = Math.floor(hours / 12);
  const remain = hours % 12;
  return `${hours}시간 (${usable}개 + ${remain}시간)`;
}
function Incentive({ rows, employees, onSaved }: { rows: Row[], employees: Row[], onSaved: () => void }) {
  const [name, setName] = useState('');
  const [hours, setHours] = useState('');
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);
  const activeNames = employees.filter(isActive).map(nameOf).filter(Boolean);
  const summaryMap = new Map<string, number>();

  employees.forEach(e => {
    const n = nameOf(e);
    if (n) summaryMap.set(n, Number(val(e, ['현재누적','누적','인센티브']) || 0) || 0);
  });
  rows.forEach(r => {
    const n = nameOf(r);
    if (!n) return;
    const current = Number(val(r, ['현재누적','누적','인센티브']) || '');
    if (!isNaN(current) && current !== 0) summaryMap.set(n, current);
  });

  const summary = activeNames.map(n => ({ name: n, hours: summaryMap.get(n) || 0 }))
    .sort((a,b) => b.hours - a.hours);
  const logs = rows.filter(r => val(r, ['날짜','일자']) || val(r, ['구분','사유']) || val(r, ['시간'])).slice(0, 120);

  async function adjust() {
    if (!name) return alert('직원을 선택하세요.');
    const h = Number(hours);
    if (!h) return alert('조정 시간을 입력하세요. 예: 3 또는 -2');
    setSaving(true);
    const j = await apiPost({ action: 'manualAdjust', name, hours: h, memo });
    setSaving(false);
    if (j.ok === false) return alert(j.error || '저장 실패');
    setHours(''); setMemo(''); onSaved();
  }

  return <div className="grid2">
    <div className="card"><h2>직원별 인센티브 현황</h2><table><thead><tr><th>직원</th><th>현재누적</th><th>사용가능</th><th>잔여</th></tr></thead><tbody>{summary.map(s => <tr key={s.name}><td><b>{s.name}</b></td><td>{s.hours}시간</td><td>{Math.floor(s.hours / 12)}개</td><td>{s.hours % 12}시간</td></tr>)}</tbody></table><p className="muted small">표시는 12시간 = 휴무 1개 기준입니다.</p></div>
    <div className="card"><h2>수기 조정</h2><div className="row"><select value={name} onChange={e => setName(e.target.value)}><option value="">직원 선택</option>{activeNames.map(n => <option key={n}>{n}</option>)}</select><input className="input" type="number" placeholder="시간 예: 3 / -2" value={hours} onChange={e => setHours(e.target.value)} /><input className="input grow" placeholder="메모" value={memo} onChange={e => setMemo(e.target.value)} /><button className="btn" onClick={adjust} disabled={saving}>{saving ? '저장중' : '조정 저장'}</button></div><p className="muted small">토/일/공휴일 +1, V -12, 반차+V -6은 휴무 저장 시 자동 기록됩니다.</p></div>
    <div className="card" style={{gridColumn:'1/-1'}}><h2>인센티브 로그</h2>{!logs.length && <p className="muted">로그가 없습니다.</p>}<table><thead><tr><th>날짜</th><th>직원</th><th>구분</th><th>시간</th><th>메모</th></tr></thead><tbody>{logs.map((r,i) => <tr key={i}><td>{dateOnly(val(r, ['날짜','일자','입력시간']))}</td><td>{nameOf(r)}</td><td>{val(r, ['구분','사유','내용'])}</td><td>{val(r, ['시간','인센티브변동'])}</td><td>{val(r, ['메모','비고','내용'])}</td></tr>)}</tbody></table></div>
  </div>;
}

function Health({ rows, employees, onSaved }: { rows: Row[], employees: Row[], onSaved: () => void }) {
  const [name, setName] = useState('');
  const [expire, setExpire] = useState('');
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);
  const activeEmployees = employees.filter(isActive).map(nameOf).filter(Boolean);
  const sorted = [...rows].sort((a, b) => {
    const ad = dday(val(a, ['만료일','보건증만료일','보건증 만료일','날짜']));
    const bd = dday(val(b, ['만료일','보건증만료일','보건증 만료일','날짜']));
    return (ad ?? 99999) - (bd ?? 99999);
  });
  async function save() {
    if (!name || !expire) return alert('직원과 만료일을 입력하세요.');
    setSaving(true);
    const j = await apiPost({ action: 'saveHealth', name, expire, memo });
    setSaving(false);
    if (j.ok === false) return alert(j.error || '저장 실패');
    setName(''); setExpire(''); setMemo(''); onSaved();
  }
  return <>
    <div className="card"><h2>보건증 등록/수정</h2><div className="row"><select value={name} onChange={e => setName(e.target.value)}><option value="">직원 선택</option>{activeEmployees.map(n => <option key={n}>{n}</option>)}</select><input className="input" type="date" value={expire} onChange={e => setExpire(e.target.value)} /><input className="input grow" placeholder="메모" value={memo} onChange={e => setMemo(e.target.value)} /><button className="btn" onClick={save} disabled={saving}>{saving ? '저장중' : '보건증 저장'}</button></div><p className="muted small">기존 직원은 같은 이름으로 저장하면 최신 만료일로 갱신됩니다.</p></div>
    <div className="card"><h2>보건증 만료 현황</h2>{!sorted.length && <p className="muted">보건증 데이터가 없습니다.</p>}{sorted.map((r, i) => { const exp = val(r, ['만료일','보건증만료일','보건증 만료일','날짜']); const st = healthStatus(dday(exp)); return <div key={i} className="health-row"><b>{nameOf(r) || val(r, ['이름','직원명'])}</b><span>{dateOnly(exp) || '-'}</span><span className={`status ${st.cls}`}>{st.text}</span></div>; })}</div>
  </>;
}
function Notice({ rows, onSaved }: { rows: Row[], onSaved: () => void }) {
  const [title, setTitle] = useState(''); const [content, setContent] = useState(''); const [saving, setSaving] = useState(false);
  async function save() { if (!title || !content) return alert('제목과 내용을 입력하세요.'); setSaving(true); const j = await apiPost({ action: 'saveNotice', title, content, author: '관리자' }); setSaving(false); if (j.ok === false) return alert(j.error || '저장 실패'); setTitle(''); setContent(''); onSaved(); }
  async function remove(r: Row) { if (!confirm('공지사항을 삭제할까요?')) return; const j = await apiPost({ action: 'deleteNotice', row: r._row, sheetName: r._sheet || '공지사항' }); if (j.ok === false) return alert(j.error || '삭제 실패'); onSaved(); }
  return <><div className="card"><h2>공지 작성</h2><div className="row"><input className="input grow" placeholder="제목" value={title} onChange={e => setTitle(e.target.value)} /><input className="input grow" placeholder="내용" value={content} onChange={e => setContent(e.target.value)} /><button className="btn" onClick={save} disabled={saving}>{saving ? '저장중' : '공지 저장'}</button></div></div><div className="card"><h2>공지사항</h2>{!rows.length && <p className="muted">공지 없음</p>}{rows.map((r, i) => <div key={i} className="notice-row"><div><b>{val(r, ['제목'])}</b><p>{val(r, ['내용'])}</p><span className="muted small">{dateOnly(val(r, ['작성일','입력시간']))}</span></div>{r._row && <button className="btn secondary" onClick={() => remove(r)}>삭제</button>}</div>)}</div></>;
}

function Operations({ data, employees, leave, incentives, health, month }: { data: Row, employees: Row[], leave: Row[], incentives: Row[], health: Row[], month: string }) {
  const activeEmployees = employees.filter(isActive).filter(r => nameOf(r));
  const monthLeave = leave.filter(r => dateOnly(val(r, ['날짜','일자','휴무일'])).startsWith(month));
  const logs = (data.logs || data.homepageLog || []).slice(0, 30);
  const healthMap = new Map<string, Row>();
  health.forEach(r => { const n = nameOf(r); if (n) healthMap.set(n, r); });
  const incentiveMap = new Map<string, number>();
  employees.forEach(e => { const n = nameOf(e); if (n) incentiveMap.set(n, Number(val(e, ['현재누적','누적','인센티브']) || 0) || 0); });
  incentives.forEach(r => {
    const n = nameOf(r);
    if (!n) return;
    const current = Number(val(r, ['현재누적','누적','인센티브']) || '');
    if (!isNaN(current) && current !== 0) incentiveMap.set(n, current);
  });
  const rows = activeEmployees.map(emp => {
    const n = nameOf(emp);
    const mine = monthLeave.filter(r => nameOf(r) === n);
    const off = mine.filter(r => leaveTypeOf(r) === '휴무').length;
    const v = mine.filter(r => leaveTypeOf(r) === 'V').length;
    const half = mine.filter(r => leaveTypeOf(r) === '반차+V').length;
    const totalLeave = off + v + half * 0.5;
    const h = healthMap.get(n);
    const exp = h ? val(h, ['만료일','보건증만료일','보건증 만료일','날짜']) : '';
    const st = healthStatus(dday(exp));
    const inc = incentiveMap.get(n) || 0;
    return { name: n, dept: val(emp, ['부서']), position: val(emp, ['직급']), off, v, half, totalLeave, inc, health: exp ? `${dateOnly(exp)} / ${st.text}` : '미등록' };
  }).sort((a,b) => b.totalLeave - a.totalLeave || b.inc - a.inc);
  const totals = rows.reduce((acc: Row, r) => {
    acc.off += r.off; acc.v += r.v; acc.half += r.half; acc.totalLeave += r.totalLeave; acc.inc += r.inc;
    return acc;
  }, { off: 0, v: 0, half: 0, totalLeave: 0, inc: 0 });
  return <>
    <div className="cards">
      <Stat t="월 휴무 합계" v={totals.totalLeave} />
      <Stat t="V 사용" v={totals.v} />
      <Stat t="반차+V" v={totals.half} />
      <Stat t="총 인센티브" v={`${totals.inc}h`} />
    </div>
    <div className="grid2">
      <div className="card"><h2>{month} 직원별 운영 통계</h2><div className="ops-table"><table><thead><tr><th>직원</th><th>부서</th><th>휴</th><th>V</th><th>반차</th><th>총휴무</th><th>인센티브</th><th>보건증</th></tr></thead><tbody>{rows.map(r => <tr key={r.name}><td><b>{r.name}</b><div className="muted small">{r.position}</div></td><td>{r.dept}</td><td>{r.off}</td><td>{r.v}</td><td>{r.half}</td><td><b>{r.totalLeave}</b></td><td>{incentiveDisplay(r.inc)}</td><td>{r.health}</td></tr>)}</tbody></table></div></div>
      <div className="card"><h2>최근 활동 로그</h2>{!logs.length && <p className="muted">아직 로그가 없습니다.</p>}{logs.map((r: Row, i: number) => <div key={i} className="timeline-row"><b>{dateOnly(val(r, ['시간','입력시간','날짜'])) || '-'}</b><span>{val(r, ['액션','구분','내용'])}</span><p>{val(r, ['내용','메모','비고'])}</p></div>)}</div>
    </div>
  </>;
}

function SystemTools({ data, month, onSaved }: { data: Row, month: string, onSaved: () => void }) {
  const [busy, setBusy] = useState('');
  async function run(action: string, confirmText: string) {
    if (!confirm(confirmText)) return;
    setBusy(action);
    try {
      const j = await apiPost({ action, month });
      if (j.ok === false) return alert(j.error || '실패');
      alert(j.message || '완료');
      onSaved();
    } catch (e: any) { alert(String(e?.message || e)); }
    finally { setBusy(''); }
  }
  return <div className="grid2">
    <div className="card"><h2>월 마감</h2><p className="muted">현재 월({month})의 휴무·인센티브·로그 상태를 마감 기록으로 남깁니다. 인센티브 누적은 유지됩니다.</p><button className="btn" disabled={!!busy} onClick={() => run('closeMonth', `${month} 월마감을 진행할까요?`)}>{busy === 'closeMonth' ? '처리중...' : `${month} 월마감`}</button></div>
    <div className="card"><h2>MASTER_DB 백업</h2><p className="muted">현재 스프레드시트 사본을 생성합니다. 배포 전이나 월말에 사용하세요.</p><button className="btn" disabled={!!busy} onClick={() => run('backupMaster', 'MASTER_DB 백업을 생성할까요?')}>{busy === 'backupMaster' ? '처리중...' : '백업 생성'}</button></div>
    <div className="card"><h2>시스템 정보</h2><p>버전: {data.version || '-'}</p><p>스프레드시트: {data.spreadsheet || '-'}</p><p>이번달 자동 인센티브 추가: {data.workIncentiveSync?.added ?? '-'}</p></div>
    <Table title="시트 연결상태" rows={data.sheets ? Object.entries(data.sheets).map(([key, connected]) => ({ key, connected: connected ? 'OK' : '없음' })) : []} />
  </div>;
}

function Table({ title, rows }: { title: string, rows: Row[] }) { if (!rows?.length) return <div className="card">{title && <h2>{title}</h2>}<p className="muted">표시할 데이터가 없습니다.</p></div>; const keys = Object.keys(rows[0]).slice(0, 10); return <div className="card" style={{ overflowX: 'auto' }}>{title && <h2>{title}</h2>}<table><thead><tr>{keys.map(k => <th key={k}>{k}</th>)}</tr></thead><tbody>{rows.slice(0, 100).map((r, i) => <tr key={i}>{keys.map(k => <td key={k}>{String(r[k] ?? '')}</td>)}</tr>)}</tbody></table></div>; }
function Debug({ data }: { data: Row }) { return <div className="card"><h2>연결 확인</h2><pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{JSON.stringify(data, null, 2).slice(0, 16000)}</pre></div>; }
