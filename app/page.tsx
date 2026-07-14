'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type Row = Record<string, any>;
const tabs = ['대시보드', '직원관리', '휴무관리', '근무인원', '보건증', '인센티브', '공지사항', '운영통계', '시스템', '연결확인'];
const ADMIN_PASSWORD = '8654';
const ADMIN_STORAGE_KEY = 'andamiro_admin_until';

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
function localDateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function localMonthKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
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
  const [month, setMonth] = useState(localMonthKey());
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    try {
      const until = Number(localStorage.getItem(ADMIN_STORAGE_KEY) || '0');
      setIsAdmin(until > Date.now());
    } catch (e) {}
  }, []);
  function unlockAdmin() {
    const pw = window.prompt('관리자 비밀번호를 입력하세요.');
    if (pw !== ADMIN_PASSWORD) return alert('비밀번호가 맞지 않습니다.');
    const until = Date.now() + 1000 * 60 * 60 * 24 * 30;
    localStorage.setItem(ADMIN_STORAGE_KEY, String(until));
    setIsAdmin(true);
    alert('관리자 모드가 활성화되었습니다.');
  }
  function lockAdmin() {
    localStorage.removeItem(ADMIN_STORAGE_KEY);
    setIsAdmin(false);
  }
  async function loadAction(action = 'dashboard') {
    setLoading(true); setErr('');
    try {
      const j = await apiGet(action, { month });
      if (j.ok === false) setErr(j.error || 'API 오류');
      setData(prev => ({ ...prev, ...j }));
      setLoaded(prev => ({ ...prev, [action]: true }));
    } catch (e: any) { setErr(String(e?.message || e)); }
    finally { setLoading(false); }
  }
  async function loadDashboard() { return loadAction('dashboard'); }
  async function loadFull() { return loadAction('all'); }

  function addLeaveLocal(items: Row[]) {
    setData(prev => {
      const nextLeave = [...(prev.leave || prev.holidays || []), ...items];
      return { ...prev, leave: nextLeave, holidays: nextLeave };
    });
  }
  function removeLeaveLocal(target: Row) {
    setData(prev => {
      const oldRows: Row[] = prev.leave || prev.holidays || [];
      const nextLeave = oldRows.filter(r => {
        if (target._row && r._row) return r._row !== target._row;
        return !(dateOnly(val(r, ['날짜','일자','휴무일'])) === dateOnly(val(target, ['날짜','일자','휴무일'])) && nameOf(r) === nameOf(target));
      });
      return { ...prev, leave: nextLeave, holidays: nextLeave };
    });
  }
  function updateLeaveLocal(before: Row, after: Row) {
    setData(prev => {
      const oldRows: Row[] = prev.leave || prev.holidays || [];
      const nextLeave = oldRows.map(r => {
        const sameByRow = before._row && r._row && r._row === before._row;
        const sameByKey = dateOnly(val(r, ['날짜','일자','휴무일'])) === dateOnly(val(before, ['날짜','일자','휴무일'])) && nameOf(r) === nameOf(before);
        return sameByRow || sameByKey ? { ...r, ...after } : r;
      });
      return { ...prev, leave: nextLeave, holidays: nextLeave };
    });
  }
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
    const action = actionForTab(t);
    setTab(t);
    if (!loaded[action]) loadAction(action);
  }
  useEffect(() => { loadDashboard(); }, [month]);
  const employees: Row[] = data.employees || [];
  const leave: Row[] = data.leave || data.holidays || [];
  const health: Row[] = data.health || [];
  const incentives: Row[] = data.incentives || [];
  const staffing: Row[] = data.staffing || [];
  const notices: Row[] = data.notices || [];
  const active = employees.filter(isActive);
  const today = localDateKey();
  const todayOff = leave.filter(r => dateOnly(val(r, ['날짜', '일자', '휴무일', '입력일'])) === today);
  const todayOffNames = new Set(todayOff.map(r => nameOf(r) || val(r, ['이름', '직원명'])));
  const todayWork = active.filter(r => !todayOffNames.has(nameOf(r)));
  const healthWarnings = health.filter(r => {
    const exp = val(r, ['만료일','보건증만료일','보건증 만료일','날짜']);
    const days = dday(exp);
    return days === null || days <= 30;
  });
  return <main>
    <div className="top"><div><h1 style={{ margin: '0 0 6px' }}>안다미로 스시 v1.1.5 Month-End Incentive</h1><div className="muted">v1.1.5 / 월 말일까지 자동 인센티브 계산 · 표 붙여넣기 지원</div></div><div className="row"><input className="input" type="month" value={month} onChange={e => setMonth(e.target.value)} /><button className="btn" onClick={() => loadAction(actionForTab(tab))}>새로고침</button><button className={isAdmin ? 'btn secondary' : 'btn'} onClick={isAdmin ? lockAdmin : unlockAdmin}>{isAdmin ? '🔓 관리자 모드' : '🔒 조회 모드'}</button></div></div>
    <div className="cards dashboard-main-cards"><Stat t="👥 오늘 근무" v={todayWork.length} /><Stat t="🏖 오늘 휴무" v={todayOff.length} /><Stat t="🩺 보건증 만료" v={healthWarnings.length} /></div>
    <div className="nav">{tabs.map(t => <button key={t} className={tab === t ? 'active' : ''} onClick={() => goTab(t)}>{t}</button>)}</div>
    {loading && <div className="card">불러오는 중...</div>}{err && <div className="card err">오류: {err}</div>}
    {!loading && !err && <>
      {tab === '대시보드' && <Dashboard data={data} active={active} todayWork={todayWork} todayOff={todayOff} healthWarnings={healthWarnings} notices={notices} />}
      {tab === '직원관리' && <Employees rows={employees} leave={leave} health={health} incentives={incentives} month={month} onSaved={() => loadAction('employees')} isAdmin={isAdmin} />}
      {tab === '휴무관리' && <Leave rows={leave} employees={employees} month={month} onAdded={addLeaveLocal} onDeleted={removeLeaveLocal} onUpdated={updateLeaveLocal} isAdmin={isAdmin} />}
      {tab === '근무인원' && <Staffing rows={staffing} employees={employees} leave={leave} month={month} />}
      {tab === '보건증' && <Health rows={health} employees={employees} onSaved={() => loadAction('health')} isAdmin={isAdmin} />}
      {tab === '인센티브' && <Incentive rows={incentives} employees={employees} onSaved={() => loadAction('incentives')} isAdmin={isAdmin} />}
      {tab === '공지사항' && <Notice rows={notices} onSaved={() => loadAction('notices')} isAdmin={isAdmin} />}
      {tab === '운영통계' && <Operations data={data} employees={employees} leave={leave} incentives={incentives} health={health} month={month} />}
      {tab === '시스템' && <SystemTools data={data} month={month} onSaved={loadFull} isAdmin={isAdmin} />}
      {tab === '연결확인' && <Debug data={data} />}
    </>}
    <div className="mobile-bottom-nav">
      {[
        ['대시보드', '🏠', '홈'],
        ['직원관리', '👥', '직원'],
        ['휴무관리', '🏖', '휴무'],
        ['인센티브', '⏱️', '인센티브'],
        ['시스템', '⚙️', '더보기'],
      ].map(([target, icon, label]) => (
        <button key={target} className={tab === target ? 'active' : ''} onClick={() => goTab(target)}>
          <span>{icon}</span><em>{label}</em>
        </button>
      ))}
    </div>
    <style jsx global>{`

      .rich-notice-editor { min-height: 220px; padding: 12px; border: 1px solid #d1d5db; border-radius: 12px; background: white; line-height: 1.55; outline: none; overflow-x: auto; }
      .rich-notice-editor:empty:before { content: attr(data-placeholder); color: #9ca3af; }
      .notice-editor-toolbar { margin-bottom: 8px; }
      .rich-notice-editor table, .notice-content table { border-collapse: collapse; width: max-content; max-width: 100%; margin: 8px 0; background: white; }
      .rich-notice-editor th, .rich-notice-editor td, .notice-content th, .notice-content td { border: 1px solid #9ca3af; padding: 7px 9px; min-width: 72px; vertical-align: top; }
      .rich-notice-editor th, .notice-content th { background: #f3f4f6; font-weight: 800; }
      .notice-content { overflow-x: auto; }
      .notice-content p { margin: 8px 0; }

      .mobile-bottom-nav { display: none; }
      .calendar-cell.selected-cell { outline: 3px solid #111827; outline-offset: -3px; background: #fef3c7 !important; }
      @media (max-width: 768px) {
        body { padding-bottom: 84px; }
        main { padding: 12px 10px 92px !important; }
        .top { flex-direction: column; align-items: stretch !important; gap: 10px; }
        .top .row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .top .row .input { grid-column: 1 / -1; width: 100%; }
        h1 { font-size: 22px !important; line-height: 1.25; }
        h2 { font-size: 18px; }
        .nav { display: none !important; }
        .mobile-bottom-nav {
          position: fixed;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 9999;
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 0;
          padding: 8px 8px calc(8px + env(safe-area-inset-bottom));
          background: rgba(255,255,255,0.96);
          border-top: 1px solid rgba(0,0,0,0.12);
          box-shadow: 0 -8px 24px rgba(0,0,0,0.08);
          backdrop-filter: blur(10px);
        }
        .mobile-bottom-nav button {
          border: 0;
          background: transparent;
          border-radius: 14px;
          min-height: 54px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 2px;
          font-size: 18px;
          color: #6b7280;
        }
        .mobile-bottom-nav button em { font-style: normal; font-size: 11px; font-weight: 700; }
        .mobile-bottom-nav button.active { background: #111827; color: white; }
        .cards, .grid2 { grid-template-columns: 1fr !important; gap: 10px !important; }
        .dashboard-main-cards { grid-template-columns: repeat(3, 1fr) !important; }
        .dashboard-main-cards .card { padding: 12px 8px !important; text-align: center; }
        .dashboard-main-cards .num { font-size: 24px !important; }
        .card { border-radius: 16px !important; padding: 14px !important; }
        .row, .leave-controls { gap: 8px !important; }
        .row { flex-wrap: wrap; }
        .btn, button, select, .input { min-height: 44px; font-size: 15px; }
        .input, select { width: 100%; }
        table { font-size: 13px; }
        th, td { padding: 8px 6px !important; }
        .calendar-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .calendar-table th, .calendar-table td { min-width: 42px; height: 42px; }
        .sticky-name { min-width: 82px !important; }
        .employee-checks { display: grid !important; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
        .check { min-height: 42px; display: flex; align-items: center; }
        .leave-list-row, .health-row, .notice-row, .timeline-row { gap: 8px; }
        .notice-row { flex-direction: column; align-items: stretch !important; }
        .modal, .sheet, .popup { max-width: calc(100vw - 24px) !important; }
      }

      .notice-content p { margin: 8px 0; }
      .notice-table-wrap { overflow-x: auto; margin: 10px 0; }
      .notice-table { width: 100%; border-collapse: collapse; background: white; }
      .notice-table th, .notice-table td { border: 1px solid #d1d5db; padding: 8px 10px; text-align: left; vertical-align: top; }
      .notice-table th { background: #f3f4f6; font-weight: 800; }
      .notice-content.compact .notice-table th, .notice-content.compact .notice-table td { padding: 5px 7px; font-size: 12px; }
    `}</style>
  </main>;
}
function Stat({ t, v }: { t: string, v: any }) { return <div className="card"><div className="muted">{t}</div><div className="num">{v}</div></div>; }
function Dashboard({ data, active, todayWork, todayOff, healthWarnings, notices }: any) {
  const workNames = (todayWork || []).map((r: Row) => nameOf(r)).filter(Boolean);
  const offNames = (todayOff || []).map((r: Row) => nameOf(r) || val(r, ['이름', '직원명'])).filter(Boolean);
  return <>
    <div className="notice-hero card">
      <div className="top"><h2>📢 공지사항</h2><span className="muted small">최근 5건</span></div>
      {notices?.slice(0, 5).map((n: Row, i: number) => <div key={i} className="notice-mini"><b>{val(n, ['제목']) || '제목 없음'}</b><NoticeContent content={val(n, ['내용'])} compact /></div>)}
      {!notices?.length && <p className="muted">등록된 공지가 없습니다.</p>}
    </div>
    <div className="grid2">
      <div className="card"><h2>👥 오늘 근무자</h2>{workNames.length ? <p>{workNames.join(', ')}</p> : <p className="muted">표시할 근무자가 없습니다.</p>}<p className="muted small">재직 직원 {active.length}명 기준</p></div>
      <div className="card"><h2>🏖 오늘 휴무자</h2>{offNames.length ? <p>{offNames.join(', ')}</p> : <p className="muted">오늘 휴무자가 없습니다.</p>}</div>
      <div className="card"><h2>🩺 보건증 경고</h2>{healthWarnings?.slice(0, 6).map((r: Row, i: number) => { const exp = val(r, ['만료일','보건증만료일','보건증 만료일','날짜']); const st = healthStatus(dday(exp)); return <p key={i}>• <b>{nameOf(r)}</b> <span className={`status ${st.cls}`}>{st.text}</span></p>; })}{!healthWarnings?.length && <p className="muted">만료 예정 없음</p>}</div>
      <div className="card"><h2>시스템 정보</h2><p className="muted small">API 버전: {data.version || '-'} / 시트: {data.spreadsheet || '-'}</p><p className="muted small">현재 상태: {data.version || '-'} / 수정 권한은 관리자 모드에서만 가능합니다.</p></div>
    </div>
  </>;
}

function employeeLeaveStats(name: string, leave: Row[], month: string) {
  const mine = leave.filter(r => nameOf(r) === name && dateOnly(val(r, ['날짜','일자','휴무일'])).startsWith(month));
  const count = (type: string) => mine.filter(r => leaveTypeOf(r) === type).length;
  const off = count('휴무');
  const am = count('오전반차');
  const pm = count('오후반차');
  const v = count('V');
  const amv = count('오전반차(V)');
  const pmv = count('오후반차(V)');
  const total = off + v + (am + pm + amv + pmv) * 0.5;
  return { off, am, pm, v, amv, pmv, total };
}
function employeeIncentiveHours(name: string, employee: Row, incentives: Row[]) {
  const targets = new Set([normName(name), ...rowNames(employee)]);
  let hours = Number(val(employee, ['현재누적','누적','인센티브','잔여']) || 0) || 0;
  incentives.forEach(r => {
    if (!rowNames(r).some(n => targets.has(n))) return;
    const currentText = val(r, ['현재누적','누적','인센티브','잔여']);
    const current = Number(currentText || '');
    if (!isNaN(current) && currentText !== '') hours = current;
  });
  return hours;
}
function normName(v: any) {
  return String(v || '').replace(/\s+/g, '').trim().toLowerCase();
}
function rowNames(r: Row) {
  return [
    nameOf(r),
    val(r, ['이름','직원명','성명','닉네임','별명','name']),
    val(r, ['이름(실명)','실명','대상자','성함'])
  ].map(normName).filter(Boolean);
}
function employeeHealthExpire(name: string, employee: Row, health: Row[]) {
  const targets = new Set([normName(name), ...rowNames(employee)]);
  const h = health.find(r => rowNames(r).some(n => targets.has(n)));
  return h ? dateOnly(val(h, ['만료일','보건증만료일','보건증 만료일','유효기간','유효기간만료일','날짜'])) : '';
}
function EmployeeDetailModal({ employee, leave, health, incentives, month, onClose }: { employee: Row, leave: Row[], health: Row[], incentives: Row[], month: string, onClose: () => void }) {
  const n = nameOf(employee);
  const stats = employeeLeaveStats(n, leave, month);
  const inc = employeeIncentiveHours(n, employee, incentives);
  const exp = employeeHealthExpire(n, employee, health);
  return <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }} onClick={onClose}>
    <div className="card" style={{ width:'min(560px, 96vw)', maxHeight:'90vh', overflowY:'auto' }} onClick={e => e.stopPropagation()}>
      <div className="top"><h2>👤 {n || '직원 상세정보'}</h2><button className="btn secondary" onClick={onClose}>닫기</button></div>
      <div className="grid2">
        <div><div className="muted small">닉네임</div><b>{val(employee, ['닉네임','별명']) || '-'}</b></div>
        <div><div className="muted small">직급</div><b>{val(employee, ['직급','직책']) || '-'}</b></div>
        <div><div className="muted small">부서</div><b>{val(employee, ['부서','구분']) || '-'}</b></div>
        <div><div className="muted small">재직상태</div><b>{val(employee, ['상태','재직상태','사용여부']) || '-'}</b></div>
        <div><div className="muted small">입사일</div><b>{dateOnly(val(employee, ['입사일','입사일자','근무시작일','등록일','입력일'])) || '-'}</b></div>
        <div style={{gridColumn:'1/-1'}}><div className="muted small">연락처</div><b>{val(employee, ['연락처','전화번호','휴대폰','핸드폰']) || '-'}</b></div>
      </div>
      <hr />
      <h3>{month} 휴무 현황</h3>
      <div className="cards">
        <Stat t="총휴무" v={stats.total} />
        <Stat t="휴무" v={stats.off} />
        <Stat t="오전반차" v={stats.am} />
        <Stat t="오후반차" v={stats.pm} />
        <Stat t="V" v={stats.v} />
        <Stat t="오전반차(V)" v={stats.amv} />
        <Stat t="오후반차(V)" v={stats.pmv} />
      </div>
      <div className="grid2">
        <div className="card"><h3>인센티브</h3><p><b>{inc}시간</b></p><p className="muted small">사용가능 {Math.floor(inc / 12)}개 / 잔여 {inc % 12}시간</p></div>
        <div className="card"><h3>보건증</h3><p><b>{exp || '미등록'}</b></p></div>
      </div>
    </div>
  </div>;
}
function Employees({ rows, leave, health, incentives, month, onSaved, isAdmin }: { rows: Row[], leave: Row[], health: Row[], incentives: Row[], month: string, onSaved: () => void, isAdmin: boolean }) {
  const [q, setQ] = useState('');
  const [name, setName] = useState('');
  const [nickname, setNickname] = useState('');
  const [position, setPosition] = useState('');
  const [dept, setDept] = useState('');
  const [status, setStatus] = useState('사용가능');
  const [phone, setPhone] = useState('');
  const [healthExpire, setHealthExpire] = useState('');
  const [hireDate, setHireDate] = useState(localDateKey());
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Row | null>(null);
  const filtered = rows.filter(r => nameOf(r).includes(q) || val(r, ['닉네임','부서','직급','연락처','전화번호','휴대폰','핸드폰']).includes(q));
  async function save() {
    if (!name.trim()) return alert('이름을 입력하세요.');
    setSaving(true);
    try {
      const j = await apiPost({ action: 'saveEmployee', name, nickname, position, dept, status, phone, healthExpire, hireDate, memo });
      if (j.ok === false) return alert(j.error || '저장 실패');
      setName(''); setNickname(''); setPosition(''); setDept(''); setStatus('사용가능'); setPhone(''); setHealthExpire(''); setHireDate(localDateKey()); setMemo('');
      alert(j.message || '직원 저장 완료');
      onSaved();
    } catch (e: any) {
      alert(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  }
  return <>
    <div className="card"><h2>직원 등록</h2>{!isAdmin && <p className="muted">조회 전용입니다. 수정은 관리자 모드에서 가능합니다.</p>}{isAdmin && <>
      <div className="row">
        <input className="input grow" placeholder="이름" value={name} onChange={e => setName(e.target.value)} />
        <input className="input" placeholder="닉네임" value={nickname} onChange={e => setNickname(e.target.value)} />
        <input className="input" placeholder="직급" value={position} onChange={e => setPosition(e.target.value)} />
        <select value={dept} onChange={e => setDept(e.target.value)}><option value="">부서</option><option>홀</option><option>주방</option></select>
        <select value={status} onChange={e => setStatus(e.target.value)}><option>사용가능</option><option>휴직</option><option>퇴사</option></select>
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <input className="input" placeholder="연락처" value={phone} onChange={e => setPhone(e.target.value)} />
        <input className="input" type="date" value={hireDate} onChange={e => setHireDate(e.target.value)} title="입사일" />
        <input className="input" type="date" value={healthExpire} onChange={e => setHealthExpire(e.target.value)} title="보건증 만료일" />
        <input className="input grow" placeholder="메모" value={memo} onChange={e => setMemo(e.target.value)} />
        <button className="btn" onClick={save} disabled={saving}>{saving ? '저장중' : '직원 저장'}</button>
      </div>
      <p className="muted small">입사일 이후의 토/일/공휴일 근무만 인센티브 +1시간으로 계산됩니다. 보건증 날짜는 보건증현황에도 함께 저장됩니다.</p>
    </>}</div>
    <div className="card"><h2>직원 목록</h2><input className="input" placeholder="이름/닉네임/부서/직급/연락처 검색" value={q} onChange={e => setQ(e.target.value)} style={{ marginBottom: 12 }} />
      {!filtered.length && <p className="muted">표시할 직원이 없습니다.</p>}
      {!!filtered.length && <div style={{ overflowX:'auto' }}><table><thead><tr><th>이름</th><th>닉네임</th><th>직급</th><th>부서</th><th>재직상태</th><th>입사일</th><th>연락처</th><th>보건증</th></tr></thead><tbody>{filtered.map((r, i) => <tr key={i} onClick={() => setSelected(r)} style={{ cursor:'pointer' }}><td><b>{nameOf(r)}</b></td><td>{val(r, ['닉네임','별명'])}</td><td>{val(r, ['직급','직책'])}</td><td>{val(r, ['부서','구분'])}</td><td>{val(r, ['상태','재직상태','사용여부'])}</td><td>{dateOnly(val(r, ['입사일','입사일자','근무시작일','등록일','입력일'])) || '-'}</td><td>{val(r, ['연락처','전화번호','휴대폰','핸드폰'])}</td><td>{employeeHealthExpire(nameOf(r), r, health) || dateOnly(val(r, ['보건증만료일','만료일'])) || '-'}</td></tr>)}</tbody></table></div>}
      <p className="muted small">직원 행을 클릭하면 상세정보가 열립니다.</p>
    </div>
    {selected && <EmployeeDetailModal employee={selected} leave={leave} health={health} incentives={incentives} month={month} onClose={() => setSelected(null)} />}
  </>;
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

function normalizeLeaveTypeText(type: string) {
  const t = String(type || '').trim();
  if (t === '휴' || t === '1' || t === '2') return '휴무';
  if (t === '1/2+V') return '반차+V';
  return t;
}

function leaveTypeOf(r?: Row) {
  return normalizeLeaveTypeText(val(r || {}, ['구분', '휴무구분', '종류']) || '');
}
function leaveBadgeClass(type: string) {
  if (type === 'V') return 'leave-badge v';
  if (type === '오전반차(V)' || type === '오후반차(V)') return 'leave-badge v';
  if (type === '반차+V' || type === '오전반차' || type === '오후반차' || type === '오전반차(V)' || type === '오후반차(V)') return 'leave-badge half';
  if (type === '휴무') return 'leave-badge off';
  return 'leave-badge work';
}
function leaveCountOf(type: string) {
  if (type === '반차+V' || type === '오전반차' || type === '오후반차' || type === '오전반차(V)' || type === '오후반차(V)') return 0.5;
  if (type === 'V') return 1;
  if (type === '휴무') return 1;
  return 0;
}
function leaveDeltaOf(type: string) {
  if (type === 'V') return -12;
  if (type === '반차+V' || type === '오전반차(V)' || type === '오후반차(V)') return -6;
  return 0;
}
const leaveTypeOptions = ['휴무', '오전반차', '오후반차', 'V', '오전반차(V)', '오후반차(V)'];
function Leave({ rows, employees, month, onAdded, onDeleted, onUpdated, isAdmin }: { rows: Row[], employees: Row[], month: string, onAdded: (items: Row[]) => void, onDeleted: (item: Row) => void, onUpdated: (before: Row, after: Row) => void, isAdmin: boolean }) {
  const activeEmployees = employees.filter(isActive).filter(r => nameOf(r));
  const [date, setDate] = useState(`${month}-01`);
  const [type, setType] = useState('휴무');
  const [memo, setMemo] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedCells, setSelectedCells] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'calendar'>('table');
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const days = useMemo(() => daysInMonth(month), [month]);
  const monthRows = rows.filter(r => dateOnly(val(r, ['날짜', '일자', '휴무일'])).startsWith(month));
  const holidays = monthRows.filter(r => val(r, ['공휴일', '명칭']) || val(r, ['_sheet']) === '공휴일입력');
  const byKey = new Map<string, Row>();
  monthRows.forEach(r => {
    const d = dateOnly(val(r, ['날짜', '일자', '휴무일']));
    const n = nameOf(r);
    const t = leaveTypeOf(r);
    if (d && n && ['휴무','V','반차+V','오전반차','오후반차','오전반차(V)','오후반차(V)'].includes(t)) byKey.set(`${d}|${n}`, r);
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
    return { name: n, total: counts.total || 0, off: counts['휴무'] || 0, v: counts['V'] || 0, half: counts['반차+V'] || 0, amHalf: counts['오전반차'] || 0, pmHalf: counts['오후반차'] || 0, amHalfV: counts['오전반차(V)'] || 0, pmHalfV: counts['오후반차(V)'] || 0 };
  });
  function toggleName(name: string) {
    setSelected(prev => prev.includes(name) ? prev.filter(v => v !== name) : [...prev, name]);
  }
  function clickCell(name: string, d: string) {
    setDate(d);
    setSelected([name]);
    const key = `${d}|${name}`;
    if (!isAdmin) return;
    setSelectedCells(prev => prev.includes(key) ? prev.filter(v => v !== key) : [...prev, key]);
    const existing = byKey.get(key);
    if (existing) setType(leaveTypeOf(existing) || '휴무');
  }
  async function saveBulk() {
    const targets = selectedCells.length
      ? selectedCells.map(k => { const [targetDate, ...nameParts] = k.split('|'); return { date: targetDate, name: nameParts.join('|') }; })
      : selected.map(n => ({ date, name: n }));
    if (!targets.length || targets.some(t => !t.date || !t.name)) return alert('날짜와 직원을 선택하세요.');

    const existingRows = targets
      .map(t => byKey.get(`${t.date}|${t.name}`))
      .filter(Boolean) as Row[];
    const existingKeys = new Set(existingRows.map(r => `${dateOnly(val(r, ['날짜','일자','휴무일']))}|${nameOf(r)}`));
    const newTargets = targets.filter(t => !existingKeys.has(`${t.date}|${t.name}`));
    const newNames = selectedCells.length ? [] : newTargets.map(t => t.name);

    if (existingRows.length) {
      const preview = existingRows
        .slice(0, 5)
        .map(r => `${nameOf(r)}: ${leaveTypeOf(r) || '휴무'} → ${type}`)
        .join('\n');
      const more = existingRows.length > 5 ? `
외 ${existingRows.length - 5}명` : '';
      const ok = confirm(`이미 등록된 휴무가 있습니다.

${preview}${more}

기존 휴무를 선택한 종류로 수정할까요?`);
      if (!ok) return;
    }

    setSaving(true);
    try {
      let changed = 0;
      for (const r of existingRows) {
        const current = leaveTypeOf(r) || '휴무';
        if (current === type) continue;
        const j = await apiPost({
          action: 'updateLeave',
          row: r._row,
          sheetName: '휴무입력',
          date: dateOnly(val(r, ['날짜', '일자', '휴무일'])),
          name: nameOf(r),
          oldType: current,
          type,
          memo: memo || val(r, ['메모', '비고']),
        });
        if (j.ok === false) throw new Error(j.error || `${nameOf(r)} 수정 실패`);
        onUpdated(r, { ...r, 구분: type, 휴무갯수: leaveCountOf(type), 인센티브변동: leaveDeltaOf(type), 메모: memo || val(r, ['메모', '비고']) });
        changed += 1;
      }

      let saved = 0;
      const added: Row[] = [];
      if (selectedCells.length) {
        const byTargetDate = new Map<string, string[]>();
        newTargets.forEach(t => {
          if (!byTargetDate.has(t.date)) byTargetDate.set(t.date, []);
          byTargetDate.get(t.date)!.push(t.name);
        });
        for (const [targetDate, names] of Array.from(byTargetDate.entries())) {
          if (!names.length) continue;
          const j = await apiPost({ action: 'saveLeaveBulk', names, date: targetDate, type, memo, inputMonth: month });
          if (j.ok === false) throw new Error(j.error || '휴무 저장 실패');
          const savedNames: string[] = Array.isArray(j.savedNames) && j.savedNames.length ? j.savedNames : names;
          savedNames.forEach((name: string) => added.push({ _sheet: '휴무입력', 입력월: month, 날짜: targetDate, 이름: name, 구분: type, 휴무갯수: leaveCountOf(type), 인센티브변동: leaveDeltaOf(type), 메모: memo, 입력자: '홈페이지' }));
          saved += savedNames.length;
        }
      } else if (newNames.length) {
        const j = await apiPost({ action: 'saveLeaveBulk', names: newNames, date, type, memo, inputMonth: month });
        if (j.ok === false) throw new Error(j.error || '휴무 저장 실패');
        const savedNames: string[] = Array.isArray(j.savedNames) && j.savedNames.length ? j.savedNames : newNames;
        savedNames.forEach((name: string) => added.push({ _sheet: '휴무입력', 입력월: month, 날짜: date, 이름: name, 구분: type, 휴무갯수: leaveCountOf(type), 인센티브변동: leaveDeltaOf(type), 메모: memo, 입력자: '홈페이지' }));
        saved = savedNames.length;
      }
      if (added.length) onAdded(added);

      setMemo('');
      setSelectedCells([]);
      if (!changed && !saved) alert('이미 같은 휴무로 등록되어 있습니다.');
      else alert(`휴무 처리 완료: 신규 ${saved}명 / 수정 ${changed}명`);
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
      sheetName: '휴무입력',
      date: dateOnly(val(r, ['날짜', '일자', '휴무일'])),
      name: nameOf(r),
      type: leaveTypeOf(r),
    });
    if (j.ok === false) return alert(j.error || '삭제 실패');
    onDeleted(r);
    alert(j.message || '휴무 삭제 완료');
  }
  async function editOne(r: Row) {
    const current = leaveTypeOf(r) || '휴무';
    const next = window.prompt(`변경할 휴무 종류를 입력하세요.\n${leaveTypeOptions.join(' / ')}`, current);
    if (next === null) return;
    const nextType = next.trim();
    if (!leaveTypeOptions.includes(nextType)) return alert('휴무 종류가 올바르지 않습니다.');
    if (nextType === current) return;
    const j = await apiPost({
      action: 'updateLeave',
      row: r._row,
      sheetName: '휴무입력',
      date: dateOnly(val(r, ['날짜', '일자', '휴무일'])),
      name: nameOf(r),
      oldType: current,
      type: nextType,
      memo: val(r, ['메모', '비고']),
    });
    if (j.ok === false) return alert(j.error || '수정 실패');
    onUpdated(r, { ...r, 구분: nextType, 휴무갯수: leaveCountOf(nextType), 인센티브변동: leaveDeltaOf(nextType) });
    alert(j.message || '휴무 수정 완료');
  }
  return <>
    <div className="card">
      <div className="top"><h2>휴무관리</h2><div className="row"><button className={viewMode === 'table' ? 'btn' : 'btn secondary'} onClick={() => setViewMode('table')}>표 보기</button><button className={viewMode === 'calendar' ? 'btn' : 'btn secondary'} onClick={() => setViewMode('calendar')}>📅 달력 보기</button></div></div><div className="muted">{month} / 직원별 월간 휴무표</div>
      {isAdmin ? <div className="leave-controls">
        <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
        <select value={type} onChange={e => setType(e.target.value)}>{leaveTypeOptions.map(opt => <option key={opt}>{opt}</option>)}</select>
        <input className="input grow" placeholder="메모" value={memo} onChange={e => setMemo(e.target.value)} />
        <button className="btn" onClick={saveBulk} disabled={saving}>{saving ? '저장중' : `${selectedCells.length || selected.length || 0}칸 저장`}</button>
      </div> : <p className="muted">조회 전용입니다. 휴무 입력/삭제는 관리자 모드에서 가능합니다.</p>}
      {isAdmin && <div className="employee-checks">
        {activeEmployees.map((e, i) => {
          const n = nameOf(e);
          return <label key={i} className={selected.includes(n) ? 'check active' : 'check'}><input type="checkbox" checked={selected.includes(n)} onChange={() => toggleName(n)} /> {n}</label>;
        })}
      </div>}
      <div className="legend"><span className="leave-badge work">근무</span><span className="leave-badge off">휴</span><span className="leave-badge v">V</span><span className="leave-badge half">오전반차</span><span className="leave-badge half">오후반차</span><span className="leave-badge v">오전반차(V)</span><span className="leave-badge v">오후반차(V)</span><span className="muted small">칸 여러 개 클릭 후 저장 버튼을 누르면 한 번에 반영됩니다.</span></div>
    </div>

    {viewMode === 'table' && <div className="card calendar-wrap">
      <table className="calendar-table">
        <thead><tr><th className="sticky-name">직원명</th>{days.map(d => <th key={d} className={dayClass(d, holidays)}>{dayLabel(d)}</th>)}</tr></thead>
        <tbody>
          {activeEmployees.map((emp, i) => {
            const n = nameOf(emp);
            return <tr key={i}><th className="sticky-name emp-name">{n}</th>{days.map(d => {
              const r = byKey.get(`${d}|${n}`);
              const t = leaveTypeOf(r);
              const selectedCell = selectedCells.includes(`${d}|${n}`);
              return <td key={d} onClick={() => clickCell(n, d)} className={`${r ? 'calendar-cell has-leave' : 'calendar-cell'}${selectedCell ? ' selected-cell' : ''}`}><span className={leaveBadgeClass(t)}>{selectedCell && !t ? type : (t || '○')}</span></td>;
            })}</tr>;
          })}
        </tbody>
      </table>
    </div>}

    {viewMode === 'calendar' && <MonthlyLeaveCalendar month={month} days={days} rows={monthRows} onSelect={setSelectedDay} />}
    {selectedDay && <DayLeaveModal date={selectedDay} rows={monthRows.filter(r => dateOnly(val(r, ['날짜','일자','휴무일'])) === selectedDay)} onClose={() => setSelectedDay(null)} />}

    <div className="grid2">
      <div className="card"><h2>직원별 휴무 개수</h2><table><thead><tr><th>직원</th><th>총휴무</th><th>휴</th><th>V</th><th>오전반차</th><th>오후반차</th><th>오전반차(V)</th><th>오후반차(V)</th></tr></thead><tbody>{summary.map(s => <tr key={s.name}><td>{s.name}</td><td><b>{s.total}</b></td><td>{s.off}</td><td>{s.v}</td><td>{s.amHalf}</td><td>{s.pmHalf}</td><td>{s.amHalfV}</td><td>{s.pmHalfV}</td></tr>)}</tbody></table></div>
      <div className="card"><h2>{month} 휴무 목록</h2>{!monthRows.length && <p className="muted">등록된 휴무가 없습니다.</p>}{monthRows.slice(0, 80).map((r, i) => <div key={i} className="leave-list-row"><span>{dateOnly(val(r, ['날짜', '일자', '휴무일']))}</span><b>{nameOf(r)}</b><span className={leaveBadgeClass(leaveTypeOf(r))}>{leaveTypeOf(r)}</span>{isAdmin && nameOf(r) && dateOnly(val(r, ['날짜', '일자', '휴무일'])) && <><button className="btn secondary" onClick={() => editOne(r)}>수정</button><button className="btn secondary" onClick={() => deleteOne(r)}>삭제</button></>}</div>)}</div>
    </div>
  </>;
}

function groupByDate(rows: Row[]) {
  const map = new Map<string, Row[]>();
  rows.forEach(r => {
    const d = dateOnly(val(r, ['날짜','일자','휴무일']));
    if (!d) return;
    if (!map.has(d)) map.set(d, []);
    map.get(d)!.push(r);
  });
  return map;
}
function MonthlyLeaveCalendar({ month, days, rows, onSelect }: { month: string, days: string[], rows: Row[], onSelect: (d: string) => void }) {
  const byDate = groupByDate(rows);
  const first = new Date(`${month}-01T00:00:00`).getDay();
  const cells = [...Array(first).fill(''), ...days];
  while (cells.length % 7 !== 0) cells.push('');
  return <div className="card"><h2>📅 {month} 휴무 달력</h2><div style={{display:'grid', gridTemplateColumns:'repeat(7, minmax(90px, 1fr))', gap:8}}>
    {['일','월','화','수','목','금','토'].map((w,i)=><div key={w} className="muted" style={{fontWeight:700, color:i===0?'#ef4444':i===6?'#2563eb':undefined}}>{w}</div>)}
    {cells.map((d, i) => {
      const list = d ? (byDate.get(d) || []) : [];
      const isToday = d === localDateKey();
      const dow = i % 7;
      return <button key={i} onClick={() => d && onSelect(d)} className="card" style={{textAlign:'left', minHeight:96, border:isToday?'2px solid #2563eb':undefined, cursor:d?'pointer':'default', opacity:d?1:0.35}}>
        <b style={{color:dow===0?'#ef4444':dow===6?'#2563eb':undefined}}>{d ? Number(d.slice(8,10)) : ''}</b>
        <div style={{marginTop:6, fontSize:12}}>{list.slice(0,4).map((r,idx)=><div key={idx}><span className={leaveBadgeClass(leaveTypeOf(r))}>{nameOf(r)}{leaveTypeOf(r) && `(${leaveTypeOf(r)})`}</span></div>)}{list.length>4 && <span className="muted">+{list.length-4}명</span>}{d && !list.length && <span className="muted">휴무없음</span>}</div>
      </button>;
    })}
  </div></div>;
}
function DayLeaveModal({ date, rows, onClose }: { date: string, rows: Row[], onClose: () => void }) {
  const groups = ['휴무','오전반차','오후반차','V','오전반차(V)','오후반차(V)'];
  return <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,.35)', zIndex:50, display:'flex', alignItems:'center', justifyContent:'center'}} onClick={onClose}>
    <div className="card" style={{width:'min(520px, 92vw)', maxHeight:'80vh', overflow:'auto'}} onClick={e=>e.stopPropagation()}>
      <div className="top"><h2>{date} 휴무</h2><button className="btn secondary" onClick={onClose}>닫기</button></div>
      {!rows.length && <p className="muted">휴무자가 없습니다.</p>}
      {groups.map(g => {
        const list = rows.filter(r => leaveTypeOf(r) === g);
        if (!list.length) return null;
        return <div key={g} style={{margin:'12px 0'}}><b className={leaveBadgeClass(g)}>{g}</b><p>{list.map(r=>nameOf(r)).filter(Boolean).join(', ')}</p></div>;
      })}
    </div>
  </div>;
}

function dday(dateValue: any) {
  const d = dateOnly(dateValue);
  if (!d) return null;
  const today0 = new Date(localDateKey() + 'T00:00:00');
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
function Incentive({ rows, employees, onSaved, isAdmin }: { rows: Row[], employees: Row[], onSaved: () => void, isAdmin: boolean }) {
  const [name, setName] = useState('');
  const [hours, setHours] = useState('');
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);
  const activeNames = employees.filter(isActive).map(nameOf).filter(Boolean);
  const [optimisticLogs, setOptimisticLogs] = useState<Row[]>([]);
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
  optimisticLogs.forEach(r => {
    const n = nameOf(r);
    if (!n) return;
    summaryMap.set(n, (summaryMap.get(n) || 0) + (Number(val(r, ['시간','인센티브변동']) || 0) || 0));
  });

  const summary = activeNames.map(n => ({ name: n, hours: summaryMap.get(n) || 0 }))
    .sort((a,b) => b.hours - a.hours);
  // V11_계산 행은 현재 잔액을 보여 주기 위한 계산 결과이므로, 실제 변경 이력 목록에는 표시하지 않는다.
  const logs = [...optimisticLogs, ...rows.filter(r =>
    r._sheet !== 'V11_계산' &&
    (val(r, ['날짜','일자']) || val(r, ['구분','사유']) || val(r, ['시간']))
  )].slice(0, 120);

  async function adjust() {
    if (!name) return alert('직원을 선택하세요.');
    const h = Number(hours);
    if (!h) return alert('조정 시간을 입력하세요. 예: 3 또는 -2');
    setSaving(true);
    try {
      const j = await apiPost({ action: 'manualAdjust', name, hours: h, memo });
      if (j.ok === false) return alert(j.error || '저장 실패');
      setOptimisticLogs(prev => [{ 날짜: localDateKey(), 이름: name, 구분: h > 0 ? '수기적립' : '수기차감', 시간: h, 메모: memo || '홈페이지 수기조정' }, ...prev]);
      setHours(''); setMemo('');
      alert('인센티브 조정 저장 완료');
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return <div className="grid2">
    <div className="card"><h2>직원별 인센티브 현황</h2><table><thead><tr><th>직원</th><th>현재누적</th><th>사용가능</th><th>잔여</th></tr></thead><tbody>{summary.map(s => <tr key={s.name}><td><b>{s.name}</b></td><td>{s.hours}시간</td><td>{Math.floor(s.hours / 12)}개</td><td>{s.hours % 12}시간</td></tr>)}</tbody></table><p className="muted small">표시는 12시간 = 휴무 1개 기준입니다.</p></div>
    <div className="card"><h2>수기 조정</h2>{!isAdmin && <p className="muted">조회 전용입니다. 수기 조정은 관리자 모드에서 가능합니다.</p>}{isAdmin && <div className="row"><select value={name} onChange={e => setName(e.target.value)}><option value="">직원 선택</option>{activeNames.map(n => <option key={n}>{n}</option>)}</select><input className="input" type="number" placeholder="시간 예: 3 / -2" value={hours} onChange={e => setHours(e.target.value)} /><input className="input grow" placeholder="메모" value={memo} onChange={e => setMemo(e.target.value)} /><button className="btn" onClick={adjust} disabled={saving}>{saving ? '저장중' : '조정 저장'}</button></div>}<p className="muted small">V -12, 오전반차(V)/오후반차(V) -6은 휴무 저장 시 자동 기록됩니다.</p></div>
    <div className="card" style={{gridColumn:'1/-1'}}><h2>인센티브 로그</h2>{!logs.length && <p className="muted">로그가 없습니다.</p>}<table><thead><tr><th>날짜</th><th>직원</th><th>구분</th><th>시간</th><th>메모</th></tr></thead><tbody>{logs.map((r,i) => <tr key={i}><td>{dateOnly(val(r, ['날짜','일자','입력시간']))}</td><td>{nameOf(r)}</td><td>{val(r, ['구분','사유','내용'])}</td><td>{val(r, ['시간','인센티브변동'])}</td><td>{val(r, ['메모','비고','내용'])}</td></tr>)}</tbody></table></div>
  </div>;
}

function Staffing({ rows, employees, leave, month }: { rows: Row[], employees: Row[], leave: Row[], month: string }) {
  const today = localDateKey();
  const activeEmployees = employees.filter(isActive).filter(r => nameOf(r));
  const todayOff = leave.filter(r => dateOnly(val(r, ['날짜', '일자', '휴무일', '입력일'])) === today);
  const todayOffNames = new Set(todayOff.map(r => nameOf(r) || val(r, ['이름', '직원명'])));
  const todayWork = activeEmployees.filter(r => !todayOffNames.has(nameOf(r)));
  const monthRows = rows.filter(r => {
    const d = dateOnly(val(r, ['날짜', '일자', '근무일', '입력일']));
    return !d || d.startsWith(month);
  });
  return <div className="grid2">
    <div className="card"><h2>오늘 근무인원</h2><div className="num">{todayWork.length}</div><p>{todayWork.map(nameOf).filter(Boolean).join(', ') || '표시할 근무자가 없습니다.'}</p><p className="muted small">기준일: {today}</p></div>
    <div className="card"><h2>오늘 휴무인원</h2><div className="num">{todayOff.length}</div><p>{todayOff.map(r => nameOf(r) || val(r, ['이름','직원명'])).filter(Boolean).join(', ') || '오늘 휴무자가 없습니다.'}</p></div>
    <div className="card" style={{ gridColumn: '1/-1' }}><h2>근무인원 시트 데이터</h2>{monthRows.length ? <Table title="" rows={monthRows} /> : <p className="muted">근무인원 시트에 표시할 데이터가 없어 오늘 근무/휴무 기준으로 계산 표시했습니다.</p>}</div>
  </div>;
}

function Health({ rows, employees, onSaved, isAdmin }: { rows: Row[], employees: Row[], onSaved: () => void, isAdmin: boolean }) {
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
    <div className="card"><h2>보건증 등록/수정</h2>{!isAdmin && <p className="muted">조회 전용입니다. 보건증 수정은 관리자 모드에서 가능합니다.</p>}{isAdmin && <div className="row"><select value={name} onChange={e => setName(e.target.value)}><option value="">직원 선택</option>{activeEmployees.map(n => <option key={n}>{n}</option>)}</select><input className="input" type="date" value={expire} onChange={e => setExpire(e.target.value)} /><input className="input grow" placeholder="메모" value={memo} onChange={e => setMemo(e.target.value)} /><button className="btn" onClick={save} disabled={saving}>{saving ? '저장중' : '보건증 저장'}</button></div>}<p className="muted small">기존 직원은 같은 이름으로 저장하면 최신 만료일로 갱신됩니다.</p></div>
    <div className="card"><h2>보건증 만료 현황</h2>{!sorted.length && <p className="muted">보건증 데이터가 없습니다.</p>}{sorted.map((r, i) => { const exp = val(r, ['만료일','보건증만료일','보건증 만료일','날짜']); const st = healthStatus(dday(exp)); return <div key={i} className="health-row"><b>{nameOf(r) || val(r, ['이름','직원명'])}</b><span>{dateOnly(exp) || '-'}</span><span className={`status ${st.cls}`}>{st.text}</span></div>; })}</div>
  </>;
}
function isMarkdownTableBlock(lines: string[]) {
  return lines.length >= 2 && lines[0].includes('|') && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[1] || '');
}
function parseTableLine(line: string) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(v => v.trim());
}
function escapeHtmlText(text: string) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function textToNoticeHtml(text: string) {
  const raw = String(text || '').replace(/\r\n/g, '\n');
  const lines = raw.split('\n');
  const hasTabs = lines.some(line => line.includes('\t'));
  if (hasTabs) {
    const rows = lines.filter(line => line.trim() !== '').map(line => line.split('\t'));
    if (rows.length) {
      const maxCols = Math.max(...rows.map(r => r.length));
      return `<table><tbody>${rows.map((row, rIdx) => `<tr>${Array.from({ length: maxCols }).map((_, cIdx) => {
        const tag = rIdx === 0 ? 'th' : 'td';
        return `<${tag}>${escapeHtmlText(row[cIdx] || '')}</${tag}>`;
      }).join('')}</tr>`).join('')}</tbody></table>`;
    }
  }
  return `<p>${lines.map(escapeHtmlText).join('<br>')}</p>`;
}
function sanitizeNoticeHtml(html: string) {
  return String(html || '')
    .replace(/<\s*(script|style|iframe|object|embed|form|input|button|textarea|select|option|link|meta)[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|style|iframe|object|embed|form|input|button|textarea|select|option|link|meta)[^>]*>/gi, '')
    .replace(/\s+on\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\s+on\w+\s*=\s*'[^']*'/gi, '')
    .replace(/\s+on\w+\s*=\s*[^\s>]+/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/data:text\/html/gi, '')
    .replace(/<\/?\s*(html|body|head)[^>]*>/gi, '')
    .trim();
}
function hasRichNoticeHtml(content: string) {
  return /<\s*(table|tbody|thead|tr|td|th|p|div|br|span|b|strong|em|u|ul|ol|li)/i.test(String(content || ''));
}
function RichNoticeEditor({ content, onChange }: { content: string, onChange: (value: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const next = hasRichNoticeHtml(content) ? sanitizeNoticeHtml(content) : textToNoticeHtml(content);
    if (ref.current.innerHTML !== next) ref.current.innerHTML = next;
  }, [content]);
  function sync() {
    onChange(sanitizeNoticeHtml(ref.current?.innerHTML || ''));
  }
  function insertHtml(html: string) {
    const safe = sanitizeNoticeHtml(html);
    if (!safe) return;
    document.execCommand('insertHTML', false, safe);
    sync();
  }
  function onPaste(e: React.ClipboardEvent<HTMLDivElement>) {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');
    if (html && /<\s*table/i.test(html)) return insertHtml(html);
    if (html && html.trim()) return insertHtml(html);
    insertHtml(textToNoticeHtml(text));
  }
  function clearFormat() {
    onChange('');
    if (ref.current) ref.current.innerHTML = '';
  }
  return <div>
    <div className="notice-editor-toolbar row">
      <button type="button" className="btn secondary" onClick={() => document.execCommand('bold')}>굵게</button>
      <button type="button" className="btn secondary" onClick={() => insertHtml('<table><tbody><tr><th>날짜</th><th>내용</th><th>담당</th></tr><tr><td></td><td></td><td></td></tr></tbody></table>')}>빈 표</button>
      <button type="button" className="btn secondary" onClick={clearFormat}>내용 지우기</button>
      <span className="muted small">구글시트 표를 복사해서 아래 칸에 바로 붙여넣으세요.</span>
    </div>
    <div
      ref={ref}
      className="rich-notice-editor"
      contentEditable
      suppressContentEditableWarning
      onInput={sync}
      onBlur={sync}
      onPaste={onPaste}
      data-placeholder="공지 내용을 입력하거나 구글시트 표를 Ctrl+V로 붙여넣으세요."
    />
  </div>;
}
function NoticeContent({ content, compact = false }: { content: string, compact?: boolean }) {
  const raw = String(content || '').trim();
  if (!raw) return null;
  if (hasRichNoticeHtml(raw)) {
    return <div className={compact ? 'notice-content compact' : 'notice-content'} dangerouslySetInnerHTML={{ __html: sanitizeNoticeHtml(raw) }} />;
  }
  const lines = raw.split('\n');
  const blocks: any[] = [];
  let i = 0;
  while (i < lines.length) {
    if (isMarkdownTableBlock(lines.slice(i, i + 2))) {
      const tableLines = [lines[i], lines[i + 1]];
      i += 2;
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        tableLines.push(lines[i]);
        i += 1;
      }
      blocks.push({ type: 'table', lines: tableLines });
      continue;
    }
    const textLines: string[] = [];
    while (i < lines.length && !isMarkdownTableBlock(lines.slice(i, i + 2))) {
      textLines.push(lines[i]);
      i += 1;
    }
    blocks.push({ type: 'text', text: textLines.join('\n') });
  }
  return <div className={compact ? 'notice-content compact' : 'notice-content'}>
    {blocks.map((b, idx) => {
      if (b.type === 'table') {
        const headers = parseTableLine(b.lines[0]);
        const body = b.lines.slice(2).map(parseTableLine);
        return <div key={idx} className="notice-table-wrap"><table className="notice-table"><thead><tr>{headers.map((h: string, i: number) => <th key={i}>{h}</th>)}</tr></thead><tbody>{body.map((row: string[], rIdx: number) => <tr key={rIdx}>{headers.map((_: string, cIdx: number) => <td key={cIdx}>{row[cIdx] || ''}</td>)}</tr>)}</tbody></table></div>;
      }
      return b.text.trim() ? <p key={idx} style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{b.text}</p> : null;
    })}
  </div>;
}
function Notice({ rows, onSaved, isAdmin }: { rows: Row[], onSaved: () => void, isAdmin: boolean }) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  function cancelEdit() {
    setEditing(null);
    setTitle('');
    setContent('');
  }
  function startEdit(r: Row) {
    setEditing(r);
    setTitle(val(r, ['제목']));
    setContent(val(r, ['내용']));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  async function save() {
    const plain = content.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
    if (!title.trim() || !plain) return alert('제목과 내용을 입력하세요.');
    setSaving(true);
    const body: Row = editing?._row
      ? { action: 'updateNotice', row: editing._row, sheetName: editing._sheet || '공지사항', title, content: sanitizeNoticeHtml(content), author: '관리자' }
      : { action: 'saveNotice', title, content: sanitizeNoticeHtml(content), author: '관리자' };
    const j = await apiPost(body);
    setSaving(false);
    if (j.ok === false) return alert(j.error || '저장 실패');
    cancelEdit();
    onSaved();
  }
  async function remove(r: Row) {
    if (!confirm('공지사항을 삭제할까요?')) return;
    const j = await apiPost({ action: 'deleteNotice', row: r._row, sheetName: r._sheet || '공지사항' });
    if (j.ok === false) return alert(j.error || '삭제 실패');
    if (editing?._row === r._row) cancelEdit();
    onSaved();
  }
  return <>
    <div className="card">
      <div className="top"><h2>{editing ? '공지 수정' : '공지 작성'}</h2>{editing && <button className="btn secondary" onClick={cancelEdit}>수정 취소</button>}</div>
      {!isAdmin && <p className="muted">조회 전용입니다. 공지 작성/수정/삭제는 관리자 모드에서 가능합니다.</p>}
      {isAdmin && <div style={{ display: 'grid', gap: 10 }}>
        <input className="input" placeholder="제목" value={title} onChange={e => setTitle(e.target.value)} />
        <RichNoticeEditor content={content} onChange={setContent} />
        <div className="card" style={{ background: '#f9fafb' }}><b>미리보기</b><NoticeContent content={content || '<p>내용을 입력하면 여기에 미리보기가 표시됩니다.</p>'} /></div>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="muted small">구글시트/엑셀 표를 복사해 붙여넣으면 표 형태로 저장됩니다.</span>
          <button className="btn" onClick={save} disabled={saving}>{saving ? '저장중' : (editing ? '공지 수정 저장' : '공지 저장')}</button>
        </div>
      </div>}
    </div>
    <div className="card">
      <h2>공지사항</h2>
      {!rows.length && <p className="muted">공지 없음</p>}
      {rows.map((r, i) => <div key={i} className="notice-row">
        <div style={{ flex: 1, minWidth: 0 }}>
          <b>{val(r, ['제목'])}</b>
          <NoticeContent content={val(r, ['내용'])} />
          <span className="muted small">{dateOnly(val(r, ['작성일','입력시간']))}</span>
        </div>
        {isAdmin && r._row && <div className="row"><button className="btn secondary" onClick={() => startEdit(r)}>수정</button><button className="btn secondary" onClick={() => remove(r)}>삭제</button></div>}
      </div>)}
    </div>
  </>;
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
    const amHalf = mine.filter(r => leaveTypeOf(r) === '오전반차').length;
    const pmHalf = mine.filter(r => leaveTypeOf(r) === '오후반차').length;
    const amHalfV = mine.filter(r => leaveTypeOf(r) === '오전반차(V)').length;
    const pmHalfV = mine.filter(r => leaveTypeOf(r) === '오후반차(V)').length;
    const totalLeave = off + v + (half + amHalf + pmHalf + amHalfV + pmHalfV) * 0.5;
    const h = healthMap.get(n);
    const exp = h ? val(h, ['만료일','보건증만료일','보건증 만료일','날짜']) : '';
    const st = healthStatus(dday(exp));
    const inc = incentiveMap.get(n) || 0;
    return { name: n, dept: val(emp, ['부서']), position: val(emp, ['직급']), off, v, half, amHalf, pmHalf, amHalfV, pmHalfV, totalLeave, inc, health: exp ? `${dateOnly(exp)} / ${st.text}` : '미등록' };
  }).sort((a,b) => b.totalLeave - a.totalLeave || b.inc - a.inc);
  const totals = rows.reduce((acc: Row, r) => {
    acc.off += r.off; acc.v += r.v; acc.half += r.half; acc.amHalf += r.amHalf || 0; acc.pmHalf += r.pmHalf || 0; acc.amHalfV += r.amHalfV || 0; acc.pmHalfV += r.pmHalfV || 0; acc.totalLeave += r.totalLeave; acc.inc += r.inc;
    return acc;
  }, { off: 0, v: 0, half: 0, amHalf: 0, pmHalf: 0, amHalfV: 0, pmHalfV: 0, totalLeave: 0, inc: 0 });
  return <>
    <div className="cards">
      <Stat t="월 휴무 합계" v={totals.totalLeave} />
      <Stat t="V 사용" v={totals.v} />
      <Stat t="반차 합계" v={`${totals.amHalf + totals.pmHalf + totals.amHalfV + totals.pmHalfV}`} />
      <Stat t="총 인센티브" v={`${totals.inc}h`} />
    </div>
    <div className="grid2">
      <div className="card"><h2>{month} 직원별 운영 통계</h2><div className="ops-table"><table><thead><tr><th>직원</th><th>부서</th><th>휴</th><th>V</th><th>오전</th><th>오후</th><th>오전V</th><th>오후V</th><th>총휴무</th><th>인센티브</th><th>보건증</th></tr></thead><tbody>{rows.map(r => <tr key={r.name}><td><b>{r.name}</b><div className="muted small">{r.position}</div></td><td>{r.dept}</td><td>{r.off}</td><td>{r.v}</td><td>{r.amHalf}</td><td>{r.pmHalf}</td><td>{r.amHalfV}</td><td>{r.pmHalfV}</td><td><b>{r.totalLeave}</b></td><td>{incentiveDisplay(r.inc)}</td><td>{r.health}</td></tr>)}</tbody></table></div></div>
      <div className="card"><h2>최근 활동 로그</h2>{!logs.length && <p className="muted">아직 로그가 없습니다.</p>}{logs.map((r: Row, i: number) => <div key={i} className="timeline-row"><b>{dateOnly(val(r, ['시간','입력시간','날짜'])) || '-'}</b><span>{val(r, ['액션','구분','내용'])}</span><p>{val(r, ['내용','메모','비고'])}</p></div>)}</div>
    </div>
  </>;
}

function SystemTools({ data, month, onSaved, isAdmin }: { data: Row, month: string, onSaved: () => void, isAdmin: boolean }) {
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
    {!isAdmin && <div className="card" style={{gridColumn:'1/-1'}}><h2>조회 전용</h2><p className="muted">월마감과 백업은 관리자 모드에서만 가능합니다.</p></div>}
    {isAdmin && <div className="card"><h2>월 마감</h2><p className="muted">현재 월({month})의 휴무·인센티브·로그 상태를 마감 기록으로 남깁니다. 인센티브 누적은 유지됩니다.</p><button className="btn" disabled={!!busy} onClick={() => run('closeMonth', `${month} 월마감을 진행할까요?`)}>{busy === 'closeMonth' ? '처리중...' : `${month} 월마감`}</button></div>}
    {isAdmin && <div className="card"><h2>MASTER_DB 백업</h2><p className="muted">현재 스프레드시트 사본을 생성합니다. 배포 전이나 월말에 사용하세요.</p><button className="btn" disabled={!!busy} onClick={() => run('backupMaster', 'MASTER_DB 백업을 생성할까요?')}>{busy === 'backupMaster' ? '처리중...' : '백업 생성'}</button></div>}
    <div className="card"><h2>시스템 정보</h2><p>버전: {data.version || '-'}</p><p>스프레드시트: {data.spreadsheet || '-'}</p><p>이번달 자동 인센티브 추가: {data.workIncentiveSync?.added ?? '-'}</p>{isAdmin && <button className="btn secondary" disabled={!!busy} onClick={() => run('repairWorkIncentives', `${month} 자동 인센티브를 입사일/월말 기준으로 재정리할까요? 기존 자동 로그는 정리하고 다시 계산합니다.`)}>자동 인센티브 재계산</button>}</div>
    <Table title="시트 연결상태" rows={data.sheets ? Object.entries(data.sheets).map(([key, connected]) => ({ key, connected: connected ? 'OK' : '없음' })) : []} />
  </div>;
}

function Table({ title, rows }: { title: string, rows: Row[] }) { if (!rows?.length) return <div className="card">{title && <h2>{title}</h2>}<p className="muted">표시할 데이터가 없습니다.</p></div>; const keys = Object.keys(rows[0]).slice(0, 10); return <div className="card" style={{ overflowX: 'auto' }}>{title && <h2>{title}</h2>}<table><thead><tr>{keys.map(k => <th key={k}>{k}</th>)}</tr></thead><tbody>{rows.slice(0, 100).map((r, i) => <tr key={i}>{keys.map(k => <td key={k}>{String(r[k] ?? '')}</td>)}</tr>)}</tbody></table></div>; }
function Debug({ data }: { data: Row }) { return <div className="card"><h2>연결 확인</h2><pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{JSON.stringify(data, null, 2).slice(0, 16000)}</pre></div>; }
