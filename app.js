/*
  테니스 복식 기록 - 앱 로직 (app.js)

  이 파일은 설계 문서(design.md §3.6)에 따라 아래 4개 계층으로 나누어 작성한다.
  Task 1에서는 파일만 생성하고 계층 구획(주석)만 잡아 둔다.
  실제 기능은 이후 Task에서 각 계층에 함수를 추가하며 채운다.

  - Storage 계층 : localStorage 읽기/쓰기 (Task 3)
  - Data 계층    : matchId/createdAt 생성, 이름 정규화, 경기 추가/수정/삭제 (Task 4, 6, 8, 9)
  - Stats 계층   : 통계 계산 (순수 함수) (Task 10, 11)
  - UI 계층      : 화면 렌더링과 이벤트 처리 (Task 2, 5, 7, 12~14)
*/

// ============================================================
// Storage 계층 (localStorage 읽기/쓰기)  -- Task 3
// ============================================================
/*
  [Task 3] Storage 계층
  - localStorage 읽기/쓰기를 이 계층에서만 담당한다.
  - 다른 계층(Data/Stats/UI)은 localStorage를 직접 만지지 않고 아래 함수들만 사용한다.
    (이렇게 분리해 두면 향후 JSON 백업/복원 기능을 이 계층에만 추가하면 된다.)
  - 저장된 값이 없거나 형식이 깨져 있어도 앱이 멈추지 않도록 안전하게 처리한다.
*/

// localStorage에서 사용하는 키 이름 모음 (한 곳에서 관리)
var STORAGE_KEYS = {
  matches: "tennis_matches",
  partners: "tennis_partners",
  opponents: "tennis_opponents",
  venues: "tennis_venues",
  schemaVersion: "tennis_schema_version",
  lastBackupAt: "tennis_last_backup_at",
  username: "tennis_username",
  opponentMaster: "tennis_opponent_master",
  myNtrp: "tennis_my_ntrp"
};

// 현재 데이터 스키마 버전 (향후 데이터 형식 변경 시 구분용)
var CURRENT_SCHEMA_VERSION = "1";

// [공통] 주어진 키에서 "배열"을 안전하게 읽어온다.
// 값이 없거나, JSON이 깨졌거나, 배열이 아니면 빈 배열([])을 돌려준다.
function readArray(key) {
  try {
    var raw = localStorage.getItem(key);
    if (raw === null) {
      return []; // 저장된 적이 없음
    }
    var parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return []; // 배열이 아닌 이상한 값이면 빈 배열로 처리
  } catch (e) {
    // JSON.parse 실패 등 오류가 나도 앱이 멈추지 않도록 빈 배열 반환
    console.warn("Storage 읽기 오류 (" + key + "):", e);
    return [];
  }
}

// [공통] 주어진 키에 "배열"을 안전하게 저장한다.
function writeArray(key, arrayValue) {
  try {
    localStorage.setItem(key, JSON.stringify(arrayValue));
  } catch (e) {
    // 저장 공간 초과 등 오류가 나도 앱이 멈추지 않도록 경고만 남긴다.
    console.warn("Storage 저장 오류 (" + key + "):", e);
  }
}

// 경기 기록 배열 읽기/쓰기
function loadMatches() {
  return readArray(STORAGE_KEYS.matches);
}
function saveMatches(matches) {
  writeArray(STORAGE_KEYS.matches, matches);
}

// 파트너 이름 목록 읽기/쓰기 (자동완성 후보)
function loadPartners() {
  return readArray(STORAGE_KEYS.partners);
}
function savePartners(partners) {
  writeArray(STORAGE_KEYS.partners, partners);
}

// 상대 선수 이름 목록 읽기/쓰기 (자동완성 후보)
function loadOpponents() {
  return readArray(STORAGE_KEYS.opponents);
}
function saveOpponents(opponents) {
  writeArray(STORAGE_KEYS.opponents, opponents);
}

// 구장 이름 목록 읽기/쓰기 (자동완성 후보)
function loadVenues() {
  return readArray(STORAGE_KEYS.venues);
}
function saveVenues(venues) {
  writeArray(STORAGE_KEYS.venues, venues);
}

// 상대방 Master 배열 읽기/쓰기. 각 항목: { name: "김철수", ntrp: 3.0 }
// (이름 목록용 tennis_opponents와는 별도 키라서 기존 기능과 충돌하지 않는다.)
function loadOpponentMaster() {
  return readArray(STORAGE_KEYS.opponentMaster);
}
function saveOpponentMaster(list) {
  writeArray(STORAGE_KEYS.opponentMaster, list);
}

// 사용자명 읽기/쓰기 (문자열 하나). 없으면 null.
function loadUsername() {
  try {
    return localStorage.getItem(STORAGE_KEYS.username);
  } catch (e) {
    return null;
  }
}
function saveUsername(name) {
  try {
    localStorage.setItem(STORAGE_KEYS.username, name);
  } catch (e) {
    console.warn("사용자명 저장 오류:", e);
  }
}

// 내(사용자 본인) NTRP 읽기/쓰기. 이름 조회 대상이 아니라 사용자 1명의 고정 값(숫자 하나).
// 미설정이면 null. 저장 시 normalizeNtrp로 소수 1자리 정리(빈값/비숫자는 삭제).
function loadMyNtrp() {
  try {
    var raw = localStorage.getItem(STORAGE_KEYS.myNtrp);
    return normalizeNtrp(raw); // 없으면(raw=null) null 반환
  } catch (e) {
    return null;
  }
}
function saveMyNtrp(value) {
  try {
    var n = normalizeNtrp(value);
    if (n === null) {
      localStorage.removeItem(STORAGE_KEYS.myNtrp); // "모름"으로 되돌리면 값 삭제
    } else {
      localStorage.setItem(STORAGE_KEYS.myNtrp, String(n));
    }
  } catch (e) {
    console.warn("내 NTRP 저장 오류:", e);
  }
}

// 스키마 버전 읽기
function loadSchemaVersion() {
  try {
    return localStorage.getItem(STORAGE_KEYS.schemaVersion); // 없으면 null
  } catch (e) {
    console.warn("Storage 스키마 버전 읽기 오류:", e);
    return null;
  }
}

// 앱 시작 시 스키마 버전을 확인하고, 없으면 현재 버전을 기록한다.
function ensureSchemaVersion() {
  var version = loadSchemaVersion();
  if (version === null) {
    try {
      localStorage.setItem(STORAGE_KEYS.schemaVersion, CURRENT_SCHEMA_VERSION);
    } catch (e) {
      console.warn("Storage 스키마 버전 저장 오류:", e);
    }
  }
}

/*
  [백업/복원] Storage 계층에만 추가되는 내보내기·가져오기 함수.
  - 다른 계층은 기존 load/save 함수를 그대로 사용하므로 통계·화면 코드는 바뀌지 않는다.
*/

// 마지막 백업 시각(Unix ms) 읽기/쓰기.
function loadLastBackupAt() {
  try {
    return localStorage.getItem(STORAGE_KEYS.lastBackupAt); // 없으면 null
  } catch (e) {
    return null;
  }
}
function saveLastBackupAt(timestamp) {
  try {
    localStorage.setItem(STORAGE_KEYS.lastBackupAt, String(timestamp));
  } catch (e) {
    console.warn("마지막 백업 시각 저장 오류:", e);
  }
}

// 현재 localStorage의 테니스 데이터를 백업용 객체 하나로 모아 반환한다.
function createBackupData() {
  return {
    backupVersion: 1,
    exportedAt: Date.now(),
    username: loadUsername() || "",
    myNtrp: loadMyNtrp(), // 내 NTRP (없으면 null)
    opponentMaster: loadOpponentMaster(), // 상대방/파트너 공용 NTRP Master
    matches: loadMatches(),
    partners: loadPartners(),
    opponents: loadOpponents(),
    venues: loadVenues(),
    schemaVersion: loadSchemaVersion() || CURRENT_SCHEMA_VERSION
  };
}

// 백업 객체(data)가 올바른 형식인지 검증한다. { ok: true } 또는 { ok: false, reason }.
// localStorage를 건드리지 않는 순수 검증 함수다.
function validateBackupData(data) {
  if (!data || typeof data !== "object") {
    return { ok: false, reason: "객체가 아님" };
  }
  if (typeof data.backupVersion === "undefined") {
    return { ok: false, reason: "backupVersion 없음" };
  }
  if (!Array.isArray(data.matches)) return { ok: false, reason: "matches 배열 아님" };
  if (!Array.isArray(data.partners)) return { ok: false, reason: "partners 배열 아님" };
  if (!Array.isArray(data.opponents)) return { ok: false, reason: "opponents 배열 아님" };
  if (!Array.isArray(data.venues)) return { ok: false, reason: "venues 배열 아님" };
  if (typeof data.schemaVersion === "undefined") return { ok: false, reason: "schemaVersion 없음" };
  return { ok: true };
}

// matches 배열의 각 항목을 안전하게 정리한다. (필드 누락/타입 이상 방어)
// - 객체가 아닌 항목은 건너뛴다.
// - 현재 앱이 사용하는 필드를 안전한 기본값으로 채운다. (기존 구조 유지)
function sanitizeMatches(rawMatches) {
  var safe = [];
  (rawMatches || []).forEach(function (m) {
    if (!m || typeof m !== "object") return; // 비정상 항목 제외
    safe.push({
      matchId: typeof m.matchId === "string" && m.matchId !== "" ? m.matchId : createMatchId(),
      createdAt: typeof m.createdAt === "number" ? m.createdAt : Date.now(),
      date: typeof m.date === "string" ? m.date : "",
      type: typeof m.type === "string" ? m.type : MATCH_TYPE_DOUBLES,
      venue: typeof m.venue === "string" ? m.venue : "",
      partner: typeof m.partner === "string" ? m.partner : "",
      opponent1: typeof m.opponent1 === "string" ? m.opponent1 : "",
      opponent2: typeof m.opponent2 === "string" ? m.opponent2 : "",
      result: (m.result === "W" || m.result === "L" || m.result === "D") ? m.result : "",
      myScore: normalizeScore(m.myScore),   // 숫자 또는 null (구버전 데이터엔 없음)
      oppScore: normalizeScore(m.oppScore), // 숫자 또는 null
      score: typeof m.score === "string" ? m.score : "",
      duration: typeof m.duration === "string" ? m.duration : "",
      memo: typeof m.memo === "string" ? m.memo : ""
    });
  });
  return safe;
}

// 상대방 Master 배열의 각 항목을 안전하게 정리한다. ({ name, ntrp } 구조 방어)
// - 객체가 아니거나 이름이 빈 항목은 제외한다.
// - ntrp는 normalizeNtrp로 정리(숫자 아니면 null = 미등록).
function sanitizeOpponentMaster(rawList) {
  var safe = [];
  (rawList || []).forEach(function (m) {
    if (!m || typeof m !== "object") return;
    var name = normalizeName(m.name);
    if (name === "") return; // 이름 없는 항목 제외
    safe.push({ name: name, ntrp: normalizeNtrp(m.ntrp) });
  });
  return safe;
}

// 검증된 백업 객체(data)를 localStorage에 원자적으로 저장한다.
// - 저장 전 기존 데이터를 스냅샷으로 보관하고, 저장 중 오류가 나면 롤백한다.
// - 반드시 validateBackupData 통과 후에만 호출한다.
// 반환: { ok: true } 또는 { ok: false }
function restoreBackup(data) {
  // 1) 기존 데이터 스냅샷 (롤백 대비)
  var snapshot = {
    matches: loadMatches(),
    partners: loadPartners(),
    opponents: loadOpponents(),
    venues: loadVenues(),
    schemaVersion: loadSchemaVersion(),
    username: loadUsername(),
    myNtrp: loadMyNtrp(),
    opponentMaster: loadOpponentMaster()
  };

  try {
    // 2) 메모리에서 안전하게 가공한 뒤 한 번에 저장
    var cleanMatches = sanitizeMatches(data.matches);
    var version = data.schemaVersion != null ? String(data.schemaVersion) : CURRENT_SCHEMA_VERSION;

    saveMatches(cleanMatches);
    savePartners(Array.isArray(data.partners) ? data.partners : []);
    saveOpponents(Array.isArray(data.opponents) ? data.opponents : []);
    saveVenues(Array.isArray(data.venues) ? data.venues : []);
    localStorage.setItem(STORAGE_KEYS.schemaVersion, version);

    // 사용자명: 백업에 값이 있을 때만 복원. 없으면 기존 사용자명을 유지한다.
    if (typeof data.username === "string") {
      var cleanUsername = data.username.trim();
      if (cleanUsername !== "") {
        saveUsername(cleanUsername);
      }
    }

    // 내 NTRP: 백업에 필드가 있을 때만 복원한다. (구버전 백업엔 없을 수 있으므로 없으면 기존 값 유지)
    if (typeof data.myNtrp !== "undefined") {
      saveMyNtrp(data.myNtrp); // normalizeNtrp가 null/빈값이면 삭제 처리
    }

    // 상대방/파트너 공용 NTRP Master: 필드가 배열일 때만 복원한다. (구버전 백업엔 없을 수 있음)
    if (Array.isArray(data.opponentMaster)) {
      saveOpponentMaster(sanitizeOpponentMaster(data.opponentMaster));
    }

    return { ok: true };
  } catch (e) {
    // 3) 저장 중 오류 → 기존 데이터로 롤백
    console.warn("복원 저장 오류, 롤백 시도:", e);
    try {
      saveMatches(snapshot.matches);
      savePartners(snapshot.partners);
      saveOpponents(snapshot.opponents);
      saveVenues(snapshot.venues);
      if (snapshot.schemaVersion != null) {
        localStorage.setItem(STORAGE_KEYS.schemaVersion, snapshot.schemaVersion);
      }
      if (snapshot.username != null) {
        saveUsername(snapshot.username);
      }
      saveMyNtrp(snapshot.myNtrp); // null이면 삭제되어 원래 미설정 상태로 복구
      saveOpponentMaster(snapshot.opponentMaster || []); // Master 원복
    } catch (e2) {
      console.warn("롤백 중 오류:", e2);
    }
    return { ok: false };
  }
}


// ============================================================
// Data 계층 (데이터 생성·정규화·조작)     -- Task 4
// ============================================================
/*
  [Task 4] 데이터 유틸 함수
  - 경기 고유 ID(matchId)와 생성 시각(createdAt) 생성
  - 선수 이름 정규화(trim) 및 목록 중복 방지
  - 동일 경기 내 상대 이름 중복 제거 기반 마련(통계에서 중복 집계 방지용)
  - 이 함수들은 localStorage를 직접 만지지 않는 순수 유틸이다. (저장은 Storage 계층 담당)
*/

// 경기마다 고유한 matchId를 생성한다.
// 형식: "m_" + 현재시각(ms) + "_" + 짧은 랜덤문자열
// - 날짜(YYYY-MM-DD)를 ID로 쓰지 않으므로 같은 날 여러 경기도 서로 다른 ID를 갖는다.
// - 같은 밀리초에 연속 생성해도 랜덤 부분 덕분에 충돌하지 않는다.
function createMatchId() {
  var randomPart = Math.random().toString(36).slice(2, 8); // 예: "ab3f9k"
  return "m_" + Date.now() + "_" + randomPart;
}

// 경기 생성 시각(createdAt)을 만든다. (같은 날짜 경기의 정렬 기준으로 사용)
function createCreatedAt() {
  return Date.now();
}

// 선수 이름의 앞뒤 공백을 제거한다.
// 값이 문자열이 아니거나 없으면 빈 문자열("")을 돌려준다.
function normalizeName(name) {
  if (typeof name !== "string") {
    return "";
  }
  return name.trim();
}

// 이름 목록(list)에 새 이름(name)을 추가하되:
//  - trim 후 빈 이름은 추가하지 않는다.
//  - 이미 목록에 있는 이름이면 추가하지 않는다(중복 방지).
// 원본 배열을 직접 바꾸지 않고, 결과 배열을 새로 만들어 돌려준다.
function addNameIfNew(list, name) {
  var safeList = Array.isArray(list) ? list.slice() : [];
  var cleanName = normalizeName(name);

  if (cleanName === "") {
    return safeList; // 빈 이름은 무시
  }
  if (safeList.indexOf(cleanName) !== -1) {
    return safeList; // 이미 있으면 그대로
  }

  safeList.push(cleanName);
  return safeList;
}

// 한 경기의 상대 이름 목록을 정리한다.
//  - 각 이름을 trim 하고, 빈 이름은 제외한다.
//  - 같은 이름이 두 번 들어오면 하나로 합친다(중복 제거).
// 반환 예: uniqueOpponentNames("김철수", " 김철수 ") -> ["김철수"]
// 이 결과를 통계에서 사용하면, 동일 경기에서 상대 이름이 중복돼도 1경기로만 집계된다.
function uniqueOpponentNames(opponent1, opponent2) {
  var result = [];
  var names = [normalizeName(opponent1), normalizeName(opponent2)];

  names.forEach(function (n) {
    if (n !== "" && result.indexOf(n) === -1) {
      result.push(n);
    }
  });

  return result;
}

// 점수 입력값을 0 이상의 정수로 정규화한다.
// - 빈값/미입력/음수/숫자 아님 → null (유효하지 않은 점수)
// - 숫자면 내림하여 정수로
function normalizeScore(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  var num = Number(value);
  if (isNaN(num) || num < 0) {
    return null;
  }
  return Math.floor(num);
}

// 내 점수/상대 점수로 경기 결과(W/L/D)를 판정한다.
// - 두 점수가 모두 유효한 정수일 때만 판정한다.
// - 내 점수 > 상대 점수 → "W", 작으면 "L", 같으면 "D"
// - 점수가 유효하지 않으면 "" (판정 불가)
function decideResultFromScores(myScore, oppScore) {
  var my = normalizeScore(myScore);
  var opp = normalizeScore(oppScore);
  if (my === null || opp === null) {
    return "";
  }
  if (my > opp) return "W";
  if (my < opp) return "L";
  return "D";
}

/*
  [상대방 Master + NTRP] Data 계층
  - 상대방 이름과 NTRP를 별도 Master(tennis_opponent_master)로 관리한다.
  - 경기 데이터에는 NTRP를 저장하지 않고, 이름으로 Master에서 조회한다.
  - 이 함수들은 localStorage를 직접 만지지 않고 Storage 계층(load/saveOpponentMaster)만 사용한다.
*/

// NTRP 입력 범위 (향후 변경이 쉽도록 상수로 관리)
var NTRP_MIN = 2.5;
var NTRP_MAX = 4.5;
var NTRP_STEP = 0.1;

// NTRP 선택 후보 값들을 배열로 반환한다. (예: [2.5, 2.6, ... 4.5])
// 부동소수 오차를 막기 위해 정수 연산으로 만든 뒤 소수 1자리로 반올림한다.
function getNtrpOptions() {
  var options = [];
  var steps = Math.round((NTRP_MAX - NTRP_MIN) / NTRP_STEP);
  for (var i = 0; i <= steps; i++) {
    var value = Math.round((NTRP_MIN + i * NTRP_STEP) * 10) / 10;
    options.push(value);
  }
  return options;
}

// 입력된 NTRP 값을 정규화한다.
// - 빈 값/미입력이면 null (NTRP 모름)
// - 숫자로 바꿀 수 없으면 null
// - 숫자면 소수 1자리로 반올림
function normalizeNtrp(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  var num = Number(value);
  if (isNaN(num)) {
    return null;
  }
  return Math.round(num * 10) / 10;
}

// NTRP 조회/중복판정 전용 비교 키. trim + 소문자화하여 대소문자 구분 없이 비교한다.
// (표시 이름·저장·통계 집계에는 사용하지 않고, Master 조회 비교에만 쓴다.)
function opponentNameKey(name) {
  return normalizeName(name).toLowerCase();
}

// Master에서 이름으로 항목을 찾는다. (trim + 대소문자 무시 일치) 없으면 null.
function findOpponentMaster(name) {
  var target = opponentNameKey(name);
  if (target === "") return null;
  var list = loadOpponentMaster();
  for (var i = 0; i < list.length; i++) {
    if (opponentNameKey(list[i].name) === target) {
      return list[i];
    }
  }
  return null;
}

// 상대방 Master 추가. 이름 trim, 빈 이름 불가, 동일 이름 중복 불가.
// 반환: { ok: true } 또는 { ok: false, reason }
function addOpponentMaster(name, ntrp) {
  var cleanName = normalizeName(name);
  if (cleanName === "") {
    return { ok: false, reason: "빈 이름" };
  }
  if (findOpponentMaster(cleanName)) {
    return { ok: false, reason: "중복 이름" };
  }
  var list = loadOpponentMaster();
  list.push({ name: cleanName, ntrp: normalizeNtrp(ntrp) });
  saveOpponentMaster(list);
  return { ok: true };
}

// 상대방 Master 수정. oldName으로 찾아 새 이름/NTRP로 갱신한다.
// - 이름을 바꾸는 경우, 바뀐 이름이 다른 항목과 중복되면 실패.
// 반환: { ok: true } 또는 { ok: false, reason }
function updateOpponentMaster(oldName, newName, ntrp) {
  var cleanOld = normalizeName(oldName);
  var cleanNew = normalizeName(newName);
  if (cleanNew === "") {
    return { ok: false, reason: "빈 이름" };
  }
  var list = loadOpponentMaster();
  var index = -1;
  for (var i = 0; i < list.length; i++) {
    if (normalizeName(list[i].name) === cleanOld) {
      index = i;
      break;
    }
  }
  if (index === -1) {
    return { ok: false, reason: "대상 없음" };
  }
  // 이름이 바뀌었는데 다른 항목과 중복되면 실패
  if (cleanNew !== cleanOld) {
    for (var j = 0; j < list.length; j++) {
      if (j !== index && normalizeName(list[j].name) === cleanNew) {
        return { ok: false, reason: "중복 이름" };
      }
    }
  }
  list[index] = { name: cleanNew, ntrp: normalizeNtrp(ntrp) };
  saveOpponentMaster(list);
  return { ok: true };
}

// 상대방 Master 삭제. (경기 기록은 건드리지 않는다 — 이름 기반 조회이므로 무관)
function deleteOpponentMaster(name) {
  var target = normalizeName(name);
  var list = loadOpponentMaster();
  var filtered = list.filter(function (m) {
    return normalizeName(m.name) !== target;
  });
  saveOpponentMaster(filtered);
}

// 이름으로 NTRP를 조회한다. Master에 없거나 NTRP 미등록이면 null.
function getOpponentNtrp(name) {
  var master = findOpponentMaster(name);
  if (!master) return null;
  return (typeof master.ntrp === "number") ? master.ntrp : null;
}

/*
  [NTRP 전력 분석] 계산 계층 (순수 계산 중심)
  - 경기(match)의 이름들로 Master/내 NTRP를 조회해 팀 평균 NTRP와 전력차를 계산한다.
  - 경기 데이터(match)에는 NTRP를 저장하지 않고, 이번에도 조회만 한다. (요구사항 2·3)
  - NTRP가 하나라도 미등록이면 계산하지 않고 available:false로 반환한다. (요구사항 6)
  - opponent2가 비어 있어도 오류 없이 동작한다. (요구사항 7)
*/

// 전력 구분 기준값. 나중에 쉽게 바꿀 수 있도록 상수로 관리한다.
// difference = 상대팀 평균 - 우리팀 평균
//   - UNDERDOG_MIN(+0.20) 이상: 우리 팀 열세
//   - -0.19 ~ +0.19: 동급
//   - FAVORED_MAX(-0.20) 이하: 우리 팀 우세
var NTRP_ANALYSIS_CONFIG = {
  UNDERDOG_MIN: 0.20, // 이 값 이상이면 우리 팀 열세(harder)
  FAVORED_MAX: -0.20  // 이 값 이하이면 우리 팀 우세(easier)
};

// 사용자(본인) NTRP를 조회한다. 미설정이면 null. (loadMyNtrp 재사용)
function getUserNtrp() {
  return loadMyNtrp();
}

// 두 NTRP로 팀 평균을 계산한다.
// - 인원이 1명뿐이면(상대2 없음 등) null을 넘기고, 유효한 값만으로 평균을 낸다.
// - 유효한 값이 하나도 없으면 null 반환.
// 반환: 숫자(소수 2자리 반올림) 또는 null
function calculateTeamNtrp(ntrpA, ntrpB) {
  var vals = [];
  if (typeof ntrpA === "number") vals.push(ntrpA);
  if (typeof ntrpB === "number") vals.push(ntrpB);
  if (vals.length === 0) return null;
  var sum = vals.reduce(function (a, b) { return a + b; }, 0);
  return Math.round((sum / vals.length) * 100) / 100;
}

// 전력차(상대팀 평균 - 우리팀 평균)를 계산한다. 둘 중 하나라도 null이면 null.
// 반환: 숫자(소수 2자리 반올림) 또는 null
function calculateNtrpDifference(myTeamNtrp, opponentTeamNtrp) {
  if (typeof myTeamNtrp !== "number" || typeof opponentTeamNtrp !== "number") {
    return null;
  }
  return Math.round((opponentTeamNtrp - myTeamNtrp) * 100) / 100;
}

// 전력차 값을 난이도 구분 문자열로 바꾼다.
// 반환: "harder"(우리 팀 열세) | "even"(동급) | "easier"(우리 팀 우세) | "unknown"(계산 불가)
function getNtrpDifficultyType(difference) {
  if (typeof difference !== "number") return "unknown";
  if (difference >= NTRP_ANALYSIS_CONFIG.UNDERDOG_MIN) return "harder";
  if (difference <= NTRP_ANALYSIS_CONFIG.FAVORED_MAX) return "easier";
  return "even";
}

// 경기 한 건의 NTRP 전력 분석을 계산해 반환한다.
// - match의 partner/opponent1/opponent2 이름으로 Master에서 NTRP를 조회한다.
// - 사용자·파트너·상대1은 필수. 상대2는 이름이 있을 때만 계산에 포함한다(없으면 상대1 단독 평균).
// - NTRP가 하나라도 미등록이면 available:false로 반환한다.
// 반환 형태:
//   { userNtrp, partnerNtrp, opponent1Ntrp, opponent2Ntrp,
//     myTeamNtrp, opponentTeamNtrp, ntrpDifference, difficultyType, available }
function getMatchNtrpAnalysis(match) {
  var safeMatch = match || {};

  var userNtrp = getUserNtrp();
  var partnerNtrp = getOpponentNtrp(safeMatch.partner);   // 파트너도 공용 Master에서 조회
  var opponent1Ntrp = getOpponentNtrp(safeMatch.opponent1);

  // opponent2는 이름이 비어 있으면 계산 대상에서 제외(기존 데이터 호환). 조회 자체는 안전.
  var hasOpponent2 = normalizeName(safeMatch.opponent2) !== "";
  var opponent2Ntrp = hasOpponent2 ? getOpponentNtrp(safeMatch.opponent2) : null;

  // 필수 인원의 NTRP가 하나라도 없으면 미등록 처리(요구사항 6).
  // - 우리 팀: 사용자 + 파트너
  // - 상대 팀: 상대1 (+ 상대2가 있으면 상대2도 필수)
  var missing =
    (typeof userNtrp !== "number") ||
    (typeof partnerNtrp !== "number") ||
    (typeof opponent1Ntrp !== "number") ||
    (hasOpponent2 && typeof opponent2Ntrp !== "number");

  if (missing) {
    return {
      userNtrp: userNtrp,
      partnerNtrp: partnerNtrp,
      opponent1Ntrp: opponent1Ntrp,
      opponent2Ntrp: opponent2Ntrp,
      myTeamNtrp: null,
      opponentTeamNtrp: null,
      ntrpDifference: null,
      difficultyType: "unknown",
      available: false
    };
  }

  var myTeamNtrp = calculateTeamNtrp(userNtrp, partnerNtrp);
  var opponentTeamNtrp = calculateTeamNtrp(opponent1Ntrp, opponent2Ntrp);
  var ntrpDifference = calculateNtrpDifference(myTeamNtrp, opponentTeamNtrp);

  return {
    userNtrp: userNtrp,
    partnerNtrp: partnerNtrp,
    opponent1Ntrp: opponent1Ntrp,
    opponent2Ntrp: opponent2Ntrp,
    myTeamNtrp: myTeamNtrp,
    opponentTeamNtrp: opponentTeamNtrp,
    ntrpDifference: ntrpDifference,
    difficultyType: getNtrpDifficultyType(ntrpDifference),
    available: true
  };
}

// NTRP 전력 구간별 경기 통계를 계산한다. (순수 계산 — localStorage/화면에 의존하지 않음)
// - 각 경기의 getMatchNtrpAnalysis로 난이도 구간(우세/동급/열세)을 판정한다.
// - NTRP 미등록(available:false) 경기는 집계에서 제외한다. (요구사항 4)
// - DRAW는 경기 수에는 포함하고, 승률 계산에서는 제외한다. (요구사항 5) 승률 = 승 / (승+패)
// - 전체 평균 전력차는 available 경기들의 ntrpDifference 평균.
// 반환:
//   {
//     favored: { total, wins, losses, draws, winRate },  // 우리 팀 우세 (easier)
//     even:    { total, wins, losses, draws, winRate },  // 동급
//     underdog:{ total, wins, losses, draws, winRate },  // 우리 팀 열세 (harder)
//     analyzedCount,       // NTRP 계산이 가능했던 경기 수
//     avgDifference        // 평균 전력차 (숫자, 소수 2자리) 또는 null(분석 경기 0건)
//   }
function calcNtrpDifficultyStats(matches) {
  var list = Array.isArray(matches) ? matches : [];

  function emptyGroup() {
    return { total: 0, wins: 0, losses: 0, draws: 0, winRate: "-" };
  }
  var groups = {
    favored: emptyGroup(),  // easier
    even: emptyGroup(),     // even
    underdog: emptyGroup()  // harder
  };

  var analyzedCount = 0;
  var diffSum = 0;

  list.forEach(function (m) {
    var analysis = getMatchNtrpAnalysis(m);
    if (!analysis.available) {
      return; // 미등록 경기는 제외
    }
    analyzedCount++;
    if (typeof analysis.ntrpDifference === "number") {
      diffSum += analysis.ntrpDifference;
    }

    var key = analysis.difficultyType === "easier" ? "favored"
            : (analysis.difficultyType === "harder" ? "underdog" : "even");
    var g = groups[key];
    g.total++;
    if (m.result === "W") {
      g.wins++;
    } else if (m.result === "L") {
      g.losses++;
    } else if (m.result === "D") {
      g.draws++;
    }
  });

  // 승률 계산 (승 / (승+패)). 승패합 0이면 "-" (기존 calcWinRate 재사용)
  ["favored", "even", "underdog"].forEach(function (key) {
    var g = groups[key];
    g.winRate = calcWinRate(g.wins, g.wins + g.losses);
  });

  var avgDifference = analyzedCount > 0
    ? Math.round((diffSum / analyzedCount) * 100) / 100
    : null;

  return {
    favored: groups.favored,
    even: groups.even,
    underdog: groups.underdog,
    analyzedCount: analyzedCount,
    avgDifference: avgDifference
  };
}

// 전력 열세/우세 경기(업셋) 분석. (순수 계산 — localStorage/화면에 의존하지 않음)
// - 전력 열세 경기: ntrpDifference >= UNDERDOG_MIN(+0.20) (상대팀 NTRP가 더 높음)
// - 전력 우세 경기: ntrpDifference <= FAVORED_MAX(-0.20) (우리팀 NTRP가 더 높음)
// - NTRP 미등록(available:false) 경기는 제외. DRAW는 경기 수엔 포함하되 승률에선 제외.
// - 가장 큰 전력 열세 승리: 열세 경기 중 결과가 WIN이면서 ntrpDifference가 가장 큰 경기.
// - 전력 우세 패배: 우세 경기 중 결과가 LOSE인 경기 수.
// 반환:
//   {
//     underdog: { total, wins, losses, draws, winRate },  // 전력 열세 경기 집계
//     biggestUpsetWin: { match, analysis } | null,        // 가장 큰 열세 승리(없으면 null)
//     favoredLossCount: 숫자                                // 전력 우세인데 패배한 경기 수
//   }
function calcNtrpUpsetStats(matches) {
  var list = Array.isArray(matches) ? matches : [];

  var underdog = { total: 0, wins: 0, losses: 0, draws: 0, winRate: "-" };
  var biggestUpsetWin = null; // { match, analysis }
  var favoredLossCount = 0;

  list.forEach(function (m) {
    var analysis = getMatchNtrpAnalysis(m);
    if (!analysis.available || typeof analysis.ntrpDifference !== "number") {
      return; // 미등록/계산불가 경기 제외
    }
    var diff = analysis.ntrpDifference;

    // 전력 열세 경기 (상대가 더 강함)
    if (diff >= NTRP_ANALYSIS_CONFIG.UNDERDOG_MIN) {
      underdog.total++;
      if (m.result === "W") {
        underdog.wins++;
        // 가장 큰 열세 승리: diff가 더 큰 경기로 갱신
        if (biggestUpsetWin === null || diff > biggestUpsetWin.analysis.ntrpDifference) {
          biggestUpsetWin = { match: m, analysis: analysis };
        }
      } else if (m.result === "L") {
        underdog.losses++;
      } else if (m.result === "D") {
        underdog.draws++;
      }
    }

    // 전력 우세 경기인데 패배 (우리가 더 강했는데 짐)
    if (diff <= NTRP_ANALYSIS_CONFIG.FAVORED_MAX && m.result === "L") {
      favoredLossCount++;
    }
  });

  underdog.winRate = calcWinRate(underdog.wins, underdog.wins + underdog.losses);

  return {
    underdog: underdog,
    biggestUpsetWin: biggestUpsetWin,
    favoredLossCount: favoredLossCount
  };
}

// 경기 배열을 "최근 경기 우선"으로 정렬해 새 배열로 반환한다. (원본은 바꾸지 않음)
// 정렬 기준 (설계 §4.2 공통 기준):
//   1) date 내림차순 (최근 날짜가 먼저)
//   2) 같은 날짜면 createdAt 내림차순 (나중에 등록한 경기가 먼저)
// 이 함수는 목록 표시뿐 아니라 최근 5/10경기·연승연패 계산에서도 재사용한다.
function sortMatchesByRecent(matches) {
  var safe = Array.isArray(matches) ? matches.slice() : [];

  safe.sort(function (a, b) {
    // 1차: 날짜 문자열(YYYY-MM-DD) 비교 → 내림차순
    if (a.date > b.date) return -1;
    if (a.date < b.date) return 1;

    // 2차: 같은 날짜면 createdAt(숫자) 내림차순
    var aCreated = a.createdAt || 0;
    var bCreated = b.createdAt || 0;
    return bCreated - aCreated;
  });

  return safe;
}

// 경기 형태 고정값 (저장 데이터의 type 값). UI 표시 문구는 "복식"으로 유지.
var MATCH_TYPE_DOUBLES = "doubles";

// 폼에서 읽은 값들(formData)로 "신규 경기 객체"를 만든다.
// - matchId / createdAt은 새로 생성한다.
// - 이름은 normalizeName으로 정리한다.
// - opponent1/opponent2는 원본 입력 구조를 보존한다.
//   (상대1과 상대2가 같은 이름이어도 각각 그대로 저장한다.
//    통계에서 중복을 한 번만 세야 할 때는 uniqueOpponentNames()로 가공한다.)
// - opponents 배열 필드는 저장하지 않는다.
function buildNewMatch(formData) {
  var my = normalizeScore(formData.myScore);
  var opp = normalizeScore(formData.oppScore);
  return {
    matchId: createMatchId(),
    createdAt: createCreatedAt(),
    date: formData.date,
    type: MATCH_TYPE_DOUBLES,
    venue: normalizeName(formData.venue),
    partner: normalizeName(formData.partner),
    opponent1: normalizeName(formData.opponent1),
    opponent2: normalizeName(formData.opponent2),
    result: decideResultFromScores(my, opp), // 점수로 자동 판정: "W"/"L"/"D"
    myScore: my,   // 내 점수 (숫자 또는 null)
    oppScore: opp, // 상대 점수 (숫자 또는 null)
    score: "",     // 세트 스코어 텍스트 필드는 UI에서 제거됨. 하위호환을 위해 필드만 빈 값으로 남긴다.
    duration: formData.duration,
    memo: formData.memo
  };
}

// 경기 배열에서 특정 matchId 항목을 제거한 "새 배열"을 반환한다. (원본은 바꾸지 않음)
function deleteMatchById(matches, matchId) {
  var safe = Array.isArray(matches) ? matches : [];
  return safe.filter(function (m) {
    return m.matchId !== matchId;
  });
}

// 기존 경기(existingMatch)의 내용을 폼 값(formData)으로 갱신한 새 객체를 만든다.
// - matchId와 createdAt은 기존 값을 그대로 유지한다. (수정해도 식별자·생성순서 보존)
// - 나머지 필드는 신규 저장과 같은 방식(이름 정규화 등)으로 정리한다.
function buildUpdatedMatch(existingMatch, formData) {
  var my = normalizeScore(formData.myScore);
  var opp = normalizeScore(formData.oppScore);
  return {
    matchId: existingMatch.matchId,     // 유지
    createdAt: existingMatch.createdAt, // 유지
    date: formData.date,
    type: MATCH_TYPE_DOUBLES,
    venue: normalizeName(formData.venue),
    partner: normalizeName(formData.partner),
    opponent1: normalizeName(formData.opponent1),
    opponent2: normalizeName(formData.opponent2),
    result: decideResultFromScores(my, opp), // 점수로 자동 판정: "W"/"L"/"D"
    myScore: my,
    oppScore: opp,
    // 세트 스코어 텍스트는 UI에서 제거됨. 기존 기록에 값이 있으면 지우지 않고 그대로 보존한다.
    score: (existingMatch && typeof existingMatch.score === "string") ? existingMatch.score : "",
    duration: formData.duration,
    memo: formData.memo
  };
}


// ============================================================
// Stats 계층 (통계 계산 - 순수 함수)       -- Task 10
// ============================================================
/*
  [Task 10] 전체 통계 계산 함수 (순수 함수)
  - 입력은 경기 배열, 출력은 계산 결과다. localStorage나 화면(DOM)에 의존하지 않는다.
  - 정렬이 필요한 계산은 Data 계층의 sortMatchesByRecent()를 재사용한다.
  - 화면 표시는 Task 12에서 이 결과들을 받아 그린다.
*/

// 승률(%)을 계산한다. 경기 수가 0이면 "-"를 반환한다(0으로 나누기 방지).
// 승률(%)을 계산한다. 분모(decided)는 "승패가 갈린 경기 수(=승+패)"이며 무승부는 제외한다.
// 분모가 0이면 "-"를 반환한다(0으로 나누기 방지).
// 반환 예: 3승 1패(무승부 제외) -> 75, 승패 0 -> "-"
function calcWinRate(wins, decided) {
  if (!decided || decided <= 0) {
    return "-";
  }
  return Math.round((wins / decided) * 100);
}

// 경기 배열에서 승(W)/패(L)/무(D) 개수를 센다. { wins, losses, draws } 반환.
function countResults(matches) {
  var wins = 0;
  var losses = 0;
  var draws = 0;
  (matches || []).forEach(function (m) {
    if (m.result === "W") {
      wins++;
    } else if (m.result === "L") {
      losses++;
    } else if (m.result === "D") {
      draws++;
    }
  });
  return { wins: wins, losses: losses, draws: draws };
}

// 전체 통계: 총 경기 수, 승, 패, 무, 승률.
// 승률은 무승부를 제외한 승패합(승+패)을 분모로 한다.
// 반환 예: { total: 5, wins: 3, losses: 1, draws: 1, winRate: 75 }
function calcTotals(matches) {
  var list = Array.isArray(matches) ? matches : [];
  var counts = countResults(list);
  var total = list.length;
  return {
    total: total,
    wins: counts.wins,
    losses: counts.losses,
    draws: counts.draws,
    winRate: calcWinRate(counts.wins, counts.wins + counts.losses)
  };
}

// 최근 n경기 성적. 최근 우선 정렬 후 앞에서 n개를 집계한다.
// 경기 수가 n보다 적으면 있는 만큼만 계산한다.
// 승률은 무승부를 제외한 승패합(승+패)을 분모로 한다.
// 반환 예: { count: 5, wins: 3, losses: 1, draws: 1, winRate: 75 }
function calcRecent(matches, n) {
  var sorted = sortMatchesByRecent(matches);
  var recent = sorted.slice(0, n);
  var counts = countResults(recent);
  return {
    count: recent.length,
    wins: counts.wins,
    losses: counts.losses,
    draws: counts.draws,
    winRate: calcWinRate(counts.wins, counts.wins + counts.losses)
  };
}

// 현재 연승/연패. 최근 경기부터 같은 결과가 연속되는 개수를 센다.
// 무승부(D)는 연속을 끊는 것으로 본다: 가장 최근 경기가 무승부면 연승/연패 없음(none).
// 반환: { type: "win" | "loss" | "none", count: 숫자 }
//   - type "win"  => count 연승
//   - type "loss" => count 연패
//   - 경기가 없거나 최근 경기가 무승부면 { type: "none", count: 0 }
function calcStreak(matches) {
  var sorted = sortMatchesByRecent(matches);
  if (sorted.length === 0) {
    return { type: "none", count: 0 };
  }

  var firstResult = sorted[0].result; // 가장 최근 경기 결과

  // 최근 경기가 승/패가 아니면(무승부·빈값 등) 연승/연패로 보지 않는다.
  if (firstResult !== "W" && firstResult !== "L") {
    return { type: "none", count: 0 };
  }

  var count = 0;
  for (var i = 0; i < sorted.length; i++) {
    if (sorted[i].result === firstResult) {
      count++;
    } else {
      break; // 결과가 바뀌면(무승부 포함) 멈춤
    }
  }

  var type = firstResult === "W" ? "win" : "loss";
  return { type: type, count: count };
}

// 월별 통계: 경기 날짜의 YYYY-MM으로 그룹화해 월별 경기 수와 승률을 계산한다.
// 승률은 무승부를 제외한 승패합(승+패)을 분모로 한다.
// 최근 월이 위로 오도록 내림차순 정렬한 배열을 반환한다.
// 반환 예: [ { month: "2026-09", total: 3, wins: 2, losses: 1, draws: 0, winRate: 67 }, ... ]
function calcMonthly(matches) {
  var list = Array.isArray(matches) ? matches : [];
  var groups = {}; // { "2026-09": { total, wins, losses, draws } }

  list.forEach(function (m) {
    var date = m.date || "";
    var month = date.slice(0, 7); // "YYYY-MM"
    if (month === "") {
      return;
    }
    if (!groups[month]) {
      groups[month] = { total: 0, wins: 0, losses: 0, draws: 0 };
    }
    groups[month].total++;
    if (m.result === "W") {
      groups[month].wins++;
    } else if (m.result === "L") {
      groups[month].losses++;
    } else if (m.result === "D") {
      groups[month].draws++;
    }
  });

  // 객체를 배열로 바꾸고 월 내림차순 정렬
  var result = Object.keys(groups).map(function (month) {
    var g = groups[month];
    return {
      month: month,
      total: g.total,
      wins: g.wins,
      losses: g.losses,
      draws: g.draws,
      winRate: calcWinRate(g.wins, g.wins + g.losses)
    };
  });

  result.sort(function (a, b) {
    if (a.month > b.month) return -1;
    if (a.month < b.month) return 1;
    return 0;
  });

  return result;
}

// 월별 통계 + NTRP 분석. (순수 계산)
// - 기본 전적(경기/승/패/무/승률)은 기존 calcMonthly를 그대로 사용한다.
//   → 월 정렬 기준과 기존 데이터가 그대로 유지되고, NTRP 미등록 경기도 전적에 포함된다.
// - NTRP 관련 항목만 "NTRP 계산 가능한 경기(available:true)"로 제한해 월별 집계 후 병합한다.
// 각 항목에 추가되는 NTRP 필드:
//   ntrpCount            : NTRP 계산 가능했던 경기 수
//   avgMyTeamNtrp        : 평균 우리팀 NTRP (숫자 2자리) 또는 null
//   avgOpponentTeamNtrp  : 평균 상대팀 NTRP (숫자 2자리) 또는 null
//   avgDifference        : 평균 전력차 (숫자 2자리) 또는 null
//   underdogTotal        : 전력 열세 경기 수
//   underdogWins/Losses  : 전력 열세 경기 승/패
//   underdogWinRate      : 전력 열세 경기 승률 (승/(승+패), calcWinRate 규칙)
function calcMonthlyWithNtrp(matches) {
  var base = calcMonthly(matches); // 기존 결과(월 정렬·전적 유지)
  var list = Array.isArray(matches) ? matches : [];

  var ntrpAcc = {}; // "YYYY-MM" -> { count, myTeamSum, oppTeamSum, diffSum, uTotal, uWins, uLosses }
  function accFor(month) {
    if (!ntrpAcc[month]) {
      ntrpAcc[month] = {
        count: 0, myTeamSum: 0, oppTeamSum: 0, diffSum: 0,
        uTotal: 0, uWins: 0, uLosses: 0
      };
    }
    return ntrpAcc[month];
  }

  list.forEach(function (m) {
    var date = m.date || "";
    var month = date.slice(0, 7); // "YYYY-MM" (기존 calcMonthly와 동일 규칙)
    if (month === "") return;

    var analysis = getMatchNtrpAnalysis(m);
    if (!analysis.available || typeof analysis.ntrpDifference !== "number") {
      return; // NTRP 계산 불가 경기는 NTRP 항목에서만 제외 (전적엔 이미 포함됨)
    }

    var acc = accFor(month);
    acc.count++;
    acc.myTeamSum += analysis.myTeamNtrp;
    acc.oppTeamSum += analysis.opponentTeamNtrp;
    acc.diffSum += analysis.ntrpDifference;

    // 전력 열세 경기 (상대가 더 강함)
    if (analysis.ntrpDifference >= NTRP_ANALYSIS_CONFIG.UNDERDOG_MIN) {
      acc.uTotal++;
      if (m.result === "W") acc.uWins++;
      else if (m.result === "L") acc.uLosses++;
    }
  });

  base.forEach(function (row) {
    var acc = ntrpAcc[row.month];
    if (!acc || acc.count === 0) {
      row.ntrpCount = 0;
      row.avgMyTeamNtrp = null;
      row.avgOpponentTeamNtrp = null;
      row.avgDifference = null;
      row.underdogTotal = 0;
      row.underdogWins = 0;
      row.underdogLosses = 0;
      row.underdogWinRate = "-";
      return;
    }
    row.ntrpCount = acc.count;
    row.avgMyTeamNtrp = Math.round((acc.myTeamSum / acc.count) * 100) / 100;
    row.avgOpponentTeamNtrp = Math.round((acc.oppTeamSum / acc.count) * 100) / 100;
    row.avgDifference = Math.round((acc.diffSum / acc.count) * 100) / 100;
    row.underdogTotal = acc.uTotal;
    row.underdogWins = acc.uWins;
    row.underdogLosses = acc.uLosses;
    row.underdogWinRate = calcWinRate(acc.uWins, acc.uWins + acc.uLosses);
  });

  return base;
}

/*
  [Task 11] 파트너별 / 상대별 통계
  - calcByPartner: 파트너 이름으로 그룹화해 경기 수·승·패·승률 집계.
  - calcByOpponent: 상대 이름으로 그룹화. 한 경기의 상대1·상대2를 각각 반영하되,
    동일 경기에서 상대 이름이 겹치면 uniqueOpponentNames()로 1경기로만 집계한다.
  - 빈 이름은 제외. 승률은 calcWinRate(0경기 시 "-") 규칙을 따른다.
  - 두 결과 모두 경기 수 많은 순으로 정렬한다.
*/

// [내부 공통] 이름별 집계 결과(groups 객체)를 배열로 바꾸고 정렬해 반환한다.
// 정렬: 경기 수 내림차순 → 승률(숫자일 때) 내림차순 → 이름 오름차순(안정적 순서)
function buildSortedNameStats(groups) {
  var list = Object.keys(groups).map(function (name) {
    var g = groups[name];
    return {
      name: name,
      total: g.total,
      wins: g.wins,
      losses: g.losses,
      draws: g.draws || 0,
      winRate: calcWinRate(g.wins, g.wins + g.losses)
    };
  });

  list.sort(function (a, b) {
    if (b.total !== a.total) {
      return b.total - a.total; // 경기 수 많은 순
    }
    // 승률은 "-"일 수 있으므로 숫자일 때만 비교
    var aRate = typeof a.winRate === "number" ? a.winRate : -1;
    var bRate = typeof b.winRate === "number" ? b.winRate : -1;
    if (bRate !== aRate) {
      return bRate - aRate;
    }
    // 마지막으로 이름 오름차순 (동점 시 순서 안정화)
    if (a.name < b.name) return -1;
    if (a.name > b.name) return 1;
    return 0;
  });

  return list;
}

// [내부 공통] 특정 이름 그룹에 경기 한 건의 결과(W/L/D)를 반영한다.
function addResultToGroup(groups, name, result) {
  if (!groups[name]) {
    groups[name] = { total: 0, wins: 0, losses: 0, draws: 0 };
  }
  groups[name].total++;
  if (result === "W") {
    groups[name].wins++;
  } else if (result === "L") {
    groups[name].losses++;
  } else if (result === "D") {
    groups[name].draws++;
  }
}

// 파트너별 통계. (trim된) partner로 그룹화, 빈 이름 제외.
// 반환 예: [ { name: "홍길동", total: 3, wins: 2, losses: 1, winRate: 67 }, ... ]
function calcByPartner(matches) {
  var list = Array.isArray(matches) ? matches : [];
  var groups = {};

  list.forEach(function (m) {
    var name = normalizeName(m.partner);
    if (name === "") {
      return; // 빈 파트너 이름은 제외
    }
    addResultToGroup(groups, name, m.result);
  });

  return buildSortedNameStats(groups);
}

// 파트너별 통계 + NTRP 분석. (순수 계산)
// - 기본 전적(경기/승/패/무/승률)은 기존 calcByPartner를 그대로 사용한다.
//   → 정렬 기준과 기존 데이터가 그대로 유지되고, NTRP 미등록 경기도 전적에 포함된다.
// - NTRP 관련 항목만 별도로 "NTRP 계산 가능한 경기(available:true)"로 제한해 집계한 뒤 병합한다.
// 각 항목에 추가되는 NTRP 필드:
//   ntrpCount            : NTRP 계산 가능했던 경기 수
//   avgMyTeamNtrp        : 평균 우리팀 NTRP (숫자 2자리) 또는 null
//   avgOpponentTeamNtrp  : 평균 상대팀 NTRP (숫자 2자리) 또는 null
//   avgDifference        : 평균 전력차 (숫자 2자리) 또는 null
//   underdogTotal        : 전력 열세 경기 수
//   underdogWins/Losses  : 전력 열세 경기 승/패
//   underdogWinRate      : 전력 열세 경기 승률 (승/(승+패), calcWinRate 규칙)
function calcByPartnerWithNtrp(matches) {
  var base = calcByPartner(matches); // 기존 결과(정렬·전적 유지)
  var list = Array.isArray(matches) ? matches : [];

  // 파트너 이름별 NTRP 집계 누적기
  var ntrpAcc = {}; // name -> { count, myTeamSum, oppTeamSum, diffSum, uTotal, uWins, uLosses }
  function accFor(name) {
    if (!ntrpAcc[name]) {
      ntrpAcc[name] = {
        count: 0, myTeamSum: 0, oppTeamSum: 0, diffSum: 0,
        uTotal: 0, uWins: 0, uLosses: 0
      };
    }
    return ntrpAcc[name];
  }

  list.forEach(function (m) {
    var name = normalizeName(m.partner);
    if (name === "") return; // 빈 파트너 제외 (기존 규칙과 동일)

    var analysis = getMatchNtrpAnalysis(m);
    if (!analysis.available || typeof analysis.ntrpDifference !== "number") {
      return; // NTRP 미등록/계산불가 경기는 NTRP 항목에서만 제외 (전적에는 이미 포함됨)
    }

    var acc = accFor(name);
    acc.count++;
    acc.myTeamSum += analysis.myTeamNtrp;
    acc.oppTeamSum += analysis.opponentTeamNtrp;
    acc.diffSum += analysis.ntrpDifference;

    // 전력 열세 경기 (상대가 더 강함)
    if (analysis.ntrpDifference >= NTRP_ANALYSIS_CONFIG.UNDERDOG_MIN) {
      acc.uTotal++;
      if (m.result === "W") acc.uWins++;
      else if (m.result === "L") acc.uLosses++;
    }
  });

  // 기존 결과(base)에 NTRP 항목을 병합 (base의 순서·전적은 그대로 둔다)
  base.forEach(function (row) {
    var acc = ntrpAcc[row.name];
    if (!acc || acc.count === 0) {
      row.ntrpCount = 0;
      row.avgMyTeamNtrp = null;
      row.avgOpponentTeamNtrp = null;
      row.avgDifference = null;
      row.underdogTotal = 0;
      row.underdogWins = 0;
      row.underdogLosses = 0;
      row.underdogWinRate = "-";
      return;
    }
    row.ntrpCount = acc.count;
    row.avgMyTeamNtrp = Math.round((acc.myTeamSum / acc.count) * 100) / 100;
    row.avgOpponentTeamNtrp = Math.round((acc.oppTeamSum / acc.count) * 100) / 100;
    row.avgDifference = Math.round((acc.diffSum / acc.count) * 100) / 100;
    row.underdogTotal = acc.uTotal;
    row.underdogWins = acc.uWins;
    row.underdogLosses = acc.uLosses;
    row.underdogWinRate = calcWinRate(acc.uWins, acc.uWins + acc.uLosses);
  });

  return base;
}

// 상대별 통계. 한 경기의 상대1·상대2를 각각 반영하되,
// 동일 경기에서 이름이 겹치면 1경기로만 집계(uniqueOpponentNames).
// 반환 예: [ { name: "김철수", total: 4, wins: 1, losses: 3, winRate: 25 }, ... ]
function calcByOpponent(matches) {
  var list = Array.isArray(matches) ? matches : [];
  var groups = {};

  list.forEach(function (m) {
    // 한 경기 안에서 중복 제거된 상대 이름 목록 (빈 이름도 제외됨)
    var opponents = uniqueOpponentNames(m.opponent1, m.opponent2);
    opponents.forEach(function (name) {
      addResultToGroup(groups, name, m.result);
    });
  });

  return buildSortedNameStats(groups);
}

// 상대별 통계 + NTRP 분석. (순수 계산)
// - 기본 전적(경기/승/패/무/승률)은 기존 calcByOpponent를 그대로 사용한다.
//   → 정렬 기준, 동일 경기 내 상대 이름 중복 1회 처리, 기존 데이터가 그대로 유지된다.
// - NTRP 관련 항목만 "NTRP 계산 가능한 경기(available:true)"로 제한해 집계 후 병합한다.
//   (한 경기에서 같은 이름이 opponent1·opponent2에 중복돼도 uniqueOpponentNames로 1회만 반영)
// 각 항목에 추가되는 NTRP 필드:
//   registeredNtrp       : 그 상대방 개인의 Master 등록 NTRP (숫자) 또는 null(미등록)
//   ntrpCount            : NTRP 계산 가능했던 (이 상대 등장) 경기 수
//   avgMyTeamNtrp        : 평균 우리팀 NTRP (숫자 2자리) 또는 null
//   avgOpponentTeamNtrp  : 평균 상대팀 NTRP (숫자 2자리) 또는 null
//   avgDifference        : 평균 전력차 (숫자 2자리) 또는 null
function calcByOpponentWithNtrp(matches) {
  var base = calcByOpponent(matches); // 기존 결과(정렬·전적·중복처리 유지)
  var list = Array.isArray(matches) ? matches : [];

  var ntrpAcc = {}; // name -> { count, myTeamSum, oppTeamSum, diffSum }
  function accFor(name) {
    if (!ntrpAcc[name]) {
      ntrpAcc[name] = { count: 0, myTeamSum: 0, oppTeamSum: 0, diffSum: 0 };
    }
    return ntrpAcc[name];
  }

  list.forEach(function (m) {
    var analysis = getMatchNtrpAnalysis(m);
    if (!analysis.available || typeof analysis.ntrpDifference !== "number") {
      return; // NTRP 계산 불가 경기는 NTRP 항목에서만 제외 (전적엔 이미 포함됨)
    }
    // 동일 경기 내 상대 이름 중복은 1회만 반영 (기존 통계 규칙과 동일)
    var opponents = uniqueOpponentNames(m.opponent1, m.opponent2);
    opponents.forEach(function (name) {
      var acc = accFor(name);
      acc.count++;
      acc.myTeamSum += analysis.myTeamNtrp;
      acc.oppTeamSum += analysis.opponentTeamNtrp;
      acc.diffSum += analysis.ntrpDifference;
    });
  });

  base.forEach(function (row) {
    // 등록된 NTRP는 그 상대 개인의 Master 값 (경기 available과 무관하게 조회)
    row.registeredNtrp = getOpponentNtrp(row.name);

    var acc = ntrpAcc[row.name];
    if (!acc || acc.count === 0) {
      row.ntrpCount = 0;
      row.avgMyTeamNtrp = null;
      row.avgOpponentTeamNtrp = null;
      row.avgDifference = null;
      return;
    }
    row.ntrpCount = acc.count;
    row.avgMyTeamNtrp = Math.round((acc.myTeamSum / acc.count) * 100) / 100;
    row.avgOpponentTeamNtrp = Math.round((acc.oppTeamSum / acc.count) * 100) / 100;
    row.avgDifference = Math.round((acc.diffSum / acc.count) * 100) / 100;
  });

  return base;
}

// 구장별 통계. (trim된) venue로 그룹화, 빈 구장(정보 없음)은 제외.
// 정렬·승률 규칙은 파트너/상대 통계와 동일(경기 수 많은 순, 0경기 시 "-").
// 반환 예: [ { name: "올림픽공원 테니스장", total: 12, wins: 8, losses: 4, winRate: 67 }, ... ]
function calcByVenue(matches) {
  var list = Array.isArray(matches) ? matches : [];
  var groups = {};

  list.forEach(function (m) {
    var name = normalizeName(m.venue);
    if (name === "") {
      return; // 구장 정보 없는 경기는 제외
    }
    addResultToGroup(groups, name, m.result);
  });

  return buildSortedNameStats(groups);
}


// ============================================================
// UI 계층 (화면 렌더링 · 이벤트 처리)      -- Task 2, 5, 7, 12~14에서 구현
// ============================================================

/*
  [Task 2] 탭 전환 기능
  - 탭 버튼을 누르면 해당 탭 영역만 보이고 나머지는 숨긴다.
  - 처음 열면 대시보드 탭이 기본 선택된다. (HTML에 이미 대시보드가 is-active로 지정됨)
  - 각 탭 버튼의 data-tab 값과, 같은 id를 가진 tab-panel을 짝지어 전환한다.
*/

// 선택한 탭 이름(tabName)에 해당하는 버튼과 패널만 활성화한다.
function activateTab(tabName) {
  var tabButtons = document.querySelectorAll(".tab-button");
  var tabPanels = document.querySelectorAll(".tab-panel");

  // 모든 탭 버튼을 확인해, 선택된 버튼만 강조(is-active)한다.
  tabButtons.forEach(function (button) {
    if (button.dataset.tab === tabName) {
      button.classList.add("is-active");
    } else {
      button.classList.remove("is-active");
    }
  });

  // 모든 탭 패널을 확인해, 선택된 패널만 보이게(is-active)한다.
  tabPanels.forEach(function (panel) {
    if (panel.id === tabName) {
      panel.classList.add("is-active");
    } else {
      panel.classList.remove("is-active");
    }
  });
}

// 각 탭 버튼에 클릭 이벤트를 연결한다.
function setupTabs() {
  var tabButtons = document.querySelectorAll(".tab-button");
  tabButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      activateTab(button.dataset.tab);

      // 경기 기록 탭에 들어갈 때 저장 데이터를 다시 읽어 목록을 갱신한다. (Task 7)
      if (button.dataset.tab === "records") {
        renderMatchList();
        updateNtrpHints(); // 이미 입력된 상대 이름의 NTRP 힌트를 최신 Master 기준으로 표시
      }

      // 통계 탭에 들어갈 때 최신 데이터로 통계를 다시 그린다. (Task 12)
      if (button.dataset.tab === "stats") {
        renderStats();
      }

      // 대시보드 탭에 들어갈 때 최신 데이터로 다시 그린다. (Task 13/14)
      if (button.dataset.tab === "dashboard") {
        renderDashboard();
      }
    });
  });
}

/*
  [Task 5] 경기 입력 폼 UI
  - 날짜 기본값을 오늘로 설정
  - 파트너/상대 자동완성(datalist)을 저장된 이름 목록으로 채움
  - 승/패 큰 버튼: 클릭하면 선택 표시 + 숨은 input(result)에 값 저장
  - 저장 버튼 클릭 시 실제 저장은 Task 6에서 구현 (지금은 폼 기본 제출만 막음)
*/

// 오늘 날짜(YYYY-MM-DD)를 반환한다.
function getTodayDateString() {
  var now = new Date();
  var year = now.getFullYear();
  var month = String(now.getMonth() + 1).padStart(2, "0");
  var day = String(now.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}

// 날짜 입력칸의 기본값을 오늘로 설정한다.
function setDefaultDate() {
  var dateInput = document.getElementById("input-date");
  if (dateInput && dateInput.value === "") {
    dateInput.value = getTodayDateString();
  }
}

// 저장된 이름 목록을 자동완성(datalist)에 채운다.
// - 파트너 목록 -> #partner-list, 상대 목록 -> #opponent-list
function fillNameDatalists() {
  var partnerList = document.getElementById("partner-list");
  var opponentList = document.getElementById("opponent-list");

  if (partnerList) {
    partnerList.innerHTML = "";
    loadPartners().forEach(function (name) {
      var option = document.createElement("option");
      option.value = name;
      partnerList.appendChild(option);
    });
  }

  if (opponentList) {
    opponentList.innerHTML = "";
    loadOpponents().forEach(function (name) {
      var option = document.createElement("option");
      option.value = name;
      opponentList.appendChild(option);
    });
  }

  var venueList = document.getElementById("venue-list");
  if (venueList) {
    venueList.innerHTML = "";
    loadVenues().forEach(function (name) {
      var option = document.createElement("option");
      option.value = name;
      venueList.appendChild(option);
    });
  }
}

/*
  [상대방 Master + NTRP] UI 계층
  - 경기 입력 화면: 상대 이름 입력 시 Master에서 NTRP를 조회해 작게 표시
  - 상대방 관리: NTRP select 채우기, 목록/추가/수정/삭제
*/

// 경기 입력 화면에서 상대 이름 옆 NTRP 표시를 갱신한다.
function updateNtrpHints() {
  // 나(본인): 이름은 사용자명, NTRP는 저장된 내 NTRP 값 (입력칸이 아니라 고정값)
  var meName = document.getElementById("me-name");
  if (meName) {
    var uname = loadUsername();
    meName.textContent = (uname && uname.trim() !== "") ? uname : "나";
  }
  var meHint = document.getElementById("ntrp-me");
  if (meHint) {
    var myNtrp = loadMyNtrp();
    if (typeof myNtrp === "number") {
      meHint.textContent = "NTRP " + myNtrp.toFixed(1);
      meHint.classList.remove("is-muted");
    } else {
      meHint.textContent = "NTRP 미설정";
      meHint.classList.add("is-muted");
    }
  }

  var pairs = [
    { inputId: "input-partner", hintId: "ntrp-partner" },
    { inputId: "input-opponent1", hintId: "ntrp-opponent1" },
    { inputId: "input-opponent2", hintId: "ntrp-opponent2" }
  ];
  pairs.forEach(function (p) {
    var input = document.getElementById(p.inputId);
    var hint = document.getElementById(p.hintId);
    if (!input || !hint) return;

    var name = normalizeName(input.value);
    if (name === "") {
      hint.textContent = "";
      return;
    }
    var master = findOpponentMaster(name);
    if (!master) {
      hint.textContent = "NTRP 미등록";
      hint.classList.add("is-muted");
    } else if (typeof master.ntrp === "number") {
      hint.textContent = "NTRP " + master.ntrp.toFixed(1);
      hint.classList.remove("is-muted");
    } else {
      hint.textContent = "NTRP 미등록";
      hint.classList.add("is-muted");
    }
  });
}

// 상대 이름 입력칸에 NTRP 표시 갱신 이벤트를 연결한다.
function setupNtrpHints() {
  ["input-partner", "input-opponent1", "input-opponent2"].forEach(function (id) {
    var input = document.getElementById(id);
    if (input) {
      input.addEventListener("input", updateNtrpHints);
      input.addEventListener("change", updateNtrpHints);
    }
  });
}

// NTRP select 요소에 후보 옵션을 채운다. (관리 폼용)
function fillNtrpOptions() {
  var select = document.getElementById("master-ntrp-input");
  if (!select) return;
  // 첫 옵션("모름")은 유지하고 나머지만 채운다.
  select.length = 1;
  getNtrpOptions().forEach(function (v) {
    var opt = document.createElement("option");
    opt.value = String(v);
    opt.textContent = v.toFixed(1);
    select.appendChild(opt);
  });
}

// 상대방 관리 영역의 안내 메시지 표시.
function showMasterMessage(text, type) {
  var el = document.getElementById("master-message");
  if (!el) return;
  el.textContent = text;
  el.classList.remove("is-success", "is-error");
  el.classList.add(type === "success" ? "is-success" : "is-error");
}

// 현재 수정 중인 Master 이름 (신규 추가 모드면 null)
var editingMasterName = null;

// 상대방 관리 목록 페이지네이션 상태 (1-base) 및 페이지당 개수
var masterListPage = 1;
var MASTER_LIST_PAGE_SIZE = 10;

// 상대방 Master 목록을 표로 그린다.
function renderOpponentMasterList() {
  var el = document.getElementById("master-list");
  if (!el) return;
  el.innerHTML = "";

  var list = loadOpponentMaster().slice();
  // 이름 오름차순 정렬 (안정적 표시)
  list.sort(function (a, b) {
    var an = normalizeName(a.name), bn = normalizeName(b.name);
    if (an < bn) return -1;
    if (an > bn) return 1;
    return 0;
  });

  if (list.length === 0) {
    var p = document.createElement("p");
    p.className = "stats-empty";
    p.textContent = "등록된 상대방이 없습니다.";
    el.appendChild(p);
    return;
  }

  // 페이지 범위 보정 (삭제 등으로 현재 페이지가 범위를 벗어난 경우)
  var totalPages = Math.max(1, Math.ceil(list.length / MASTER_LIST_PAGE_SIZE));
  if (masterListPage > totalPages) masterListPage = totalPages;
  if (masterListPage < 1) masterListPage = 1;

  // 현재 페이지 구간만 표시
  var start = (masterListPage - 1) * MASTER_LIST_PAGE_SIZE;
  var pageItems = list.slice(start, start + MASTER_LIST_PAGE_SIZE);

  var table = document.createElement("table");
  table.className = "stats-table";

  var thead = document.createElement("thead");
  var htr = document.createElement("tr");
  ["상대방", "NTRP", "관리"].forEach(function (h) {
    var th = document.createElement("th");
    th.textContent = h;
    htr.appendChild(th);
  });
  thead.appendChild(htr);
  table.appendChild(thead);

  var tbody = document.createElement("tbody");
  pageItems.forEach(function (m) {
    var tr = document.createElement("tr");

    var nameTd = document.createElement("td");
    nameTd.textContent = m.name; // textContent로 안전하게
    tr.appendChild(nameTd);

    var ntrpTd = document.createElement("td");
    ntrpTd.textContent = (typeof m.ntrp === "number") ? m.ntrp.toFixed(1) : "-";
    tr.appendChild(ntrpTd);

    var actionTd = document.createElement("td");
    var editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "edit-button";
    editBtn.textContent = "수정";
    editBtn.addEventListener("click", function () {
      startEditMaster(m.name);
    });
    var delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "delete-button";
    delBtn.textContent = "삭제";
    delBtn.addEventListener("click", function () {
      handleDeleteMaster(m.name);
    });
    actionTd.appendChild(editBtn);
    actionTd.appendChild(delBtn);
    tr.appendChild(actionTd);

    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  el.appendChild(table);

  // 페이지가 2개 이상일 때만 페이지네이션 표시
  if (totalPages > 1) {
    el.appendChild(createPaginationControls(masterListPage, totalPages, function (newPage) {
      masterListPage = newPage;
      renderOpponentMasterList();
    }));
  }
}

// 관리 폼을 신규 추가 모드로 초기화한다.
function resetMasterForm() {
  editingMasterName = null;
  var nameInput = document.getElementById("master-name-input");
  var ntrpInput = document.getElementById("master-ntrp-input");
  var addButton = document.getElementById("master-add-button");
  var cancelButton = document.getElementById("master-cancel-button");
  if (nameInput) nameInput.value = "";
  if (ntrpInput) ntrpInput.value = "";
  if (addButton) addButton.textContent = "추가";
  if (cancelButton) cancelButton.hidden = true;
}

// [수정] 클릭: 해당 Master 값을 폼에 채우고 수정 모드로 전환.
function startEditMaster(name) {
  var master = findOpponentMaster(name);
  if (!master) return;
  editingMasterName = master.name;
  var nameInput = document.getElementById("master-name-input");
  var ntrpInput = document.getElementById("master-ntrp-input");
  var addButton = document.getElementById("master-add-button");
  var cancelButton = document.getElementById("master-cancel-button");
  if (nameInput) nameInput.value = master.name;
  if (ntrpInput) ntrpInput.value = (typeof master.ntrp === "number") ? String(master.ntrp) : "";
  if (addButton) addButton.textContent = "저장";
  if (cancelButton) cancelButton.hidden = false;
  showMasterMessage("", "success");
  if (nameInput) nameInput.focus();
}

// [삭제] 클릭: 확인 후 Master만 삭제 (경기 기록은 유지).
function handleDeleteMaster(name) {
  var confirmed = window.confirm("'" + name + "' 상대방 정보를 삭제할까요? (경기 기록은 그대로 유지됩니다.)");
  if (!confirmed) return;
  deleteOpponentMaster(name);
  if (editingMasterName === name) {
    resetMasterForm();
  }
  renderOpponentMasterList();
  updateNtrpHints(); // 경기 입력 화면 NTRP 표시도 갱신
  showMasterMessage("삭제했습니다.", "success");
}

// 추가/저장 버튼 처리.
function handleSaveMaster() {
  var nameInput = document.getElementById("master-name-input");
  var ntrpInput = document.getElementById("master-ntrp-input");
  if (!nameInput || !ntrpInput) return;

  var name = nameInput.value;
  var ntrp = ntrpInput.value; // "" 이면 normalizeNtrp에서 null 처리

  var result;
  if (editingMasterName !== null) {
    result = updateOpponentMaster(editingMasterName, name, ntrp);
  } else {
    result = addOpponentMaster(name, ntrp);
  }

  if (!result.ok) {
    if (result.reason === "빈 이름") {
      showMasterMessage("상대방 이름을 입력해주세요.", "error");
    } else if (result.reason === "중복 이름") {
      // 기존에 등록된 상대의 NTRP를 함께 안내한다. (대소문자 무시 조회)
      var existing = findOpponentMaster(name);
      var ntrpText = (existing && typeof existing.ntrp === "number")
        ? ("NTRP " + existing.ntrp.toFixed(1))
        : "NTRP 미등록";
      showMasterMessage("이미 등록된 상대방입니다. (" + ntrpText + ")", "error");
    } else {
      showMasterMessage("저장하지 못했습니다.", "error");
    }
    return;
  }

  resetMasterForm();
  renderOpponentMasterList();
  updateNtrpHints();
  showMasterMessage("저장했습니다.", "success");
}

// 상대방 관리 UI 이벤트 연결.
function setupOpponentMaster() {
  fillNtrpOptions();
  renderOpponentMasterList();

  var addButton = document.getElementById("master-add-button");
  var cancelButton = document.getElementById("master-cancel-button");
  if (addButton) addButton.addEventListener("click", handleSaveMaster);
  if (cancelButton) cancelButton.addEventListener("click", function () {
    resetMasterForm();
    showMasterMessage("", "success");
  });
}

// [내 NTRP] select에 후보 옵션을 채운다. (첫 옵션 "모름"은 유지)
function fillMyNtrpOptions() {
  var select = document.getElementById("my-ntrp-input");
  if (!select) return;
  select.length = 1;
  getNtrpOptions().forEach(function (v) {
    var opt = document.createElement("option");
    opt.value = String(v);
    opt.textContent = v.toFixed(1);
    select.appendChild(opt);
  });
}

// [내 NTRP] 현재 값을 select와 안내 텍스트에 반영한다.
function renderMyNtrp() {
  var select = document.getElementById("my-ntrp-input");
  var current = document.getElementById("my-ntrp-current");
  var my = loadMyNtrp();
  if (select) select.value = (typeof my === "number") ? String(my) : "";
  if (current) {
    if (typeof my === "number") {
      current.textContent = "현재 내 NTRP " + my.toFixed(1);
      current.classList.remove("is-muted");
    } else {
      current.textContent = "내 NTRP 미설정";
      current.classList.add("is-muted");
    }
  }
}

// [내 NTRP] 설정 UI 이벤트 연결.
function setupMyNtrp() {
  fillMyNtrpOptions();
  renderMyNtrp();
  var saveButton = document.getElementById("my-ntrp-save-button");
  if (saveButton) {
    saveButton.addEventListener("click", function () {
      var select = document.getElementById("my-ntrp-input");
      saveMyNtrp(select ? select.value : "");
      renderMyNtrp();
      updateNtrpHints(); // 경기 입력 화면의 내 NTRP 표시도 갱신
    });
  }
}

// 내 점수/상대 점수로 자동 판정된 결과를 숨은 input(result)과 미리보기 텍스트에 반영한다.
// (버튼 방식에서 점수 자동 판정 방식으로 대체되었다.)
function updateResultPreview() {
  var myInput = document.getElementById("input-my-score");
  var oppInput = document.getElementById("input-opp-score");
  var resultInput = document.getElementById("input-result");
  var preview = document.getElementById("result-preview");

  var myRaw = myInput ? myInput.value : "";
  var oppRaw = oppInput ? oppInput.value : "";
  var result = decideResultFromScores(myRaw, oppRaw);

  if (resultInput) {
    resultInput.value = result; // "" 이면 아직 판정 불가(양쪽 점수 필요)
  }
  if (preview) {
    preview.classList.remove("is-win", "is-loss", "is-draw");
    if (result === "") {
      preview.textContent = "두 점수를 입력하면 승/무/패가 자동으로 정해집니다.";
    } else {
      preview.textContent = "결과: " + resultToLabel(result);
      preview.classList.add(resultToClass(result));
    }
  }
}

// 점수 입력칸에 이벤트를 연결해, 입력할 때마다 결과를 자동 판정·표시한다.
function setupScoreInputs() {
  ["input-my-score", "input-opp-score"].forEach(function (id) {
    var input = document.getElementById(id);
    if (input) {
      input.addEventListener("input", updateResultPreview);
      input.addEventListener("change", updateResultPreview);
    }
  });
  updateResultPreview(); // 초기 표시
}

/*
  [Task 6] 경기 저장 로직 (신규 등록)
  - 저장 버튼 클릭 시 폼 값을 읽어 신규 경기 객체를 만들고 tennis_matches에 추가 저장한다.
  - 필수 항목(날짜, 경기 결과)을 검증한다.
  - 새 파트너/상대 이름을 이름 목록에 반영한다(빈값·중복 제외).
  - 저장 후 폼을 초기화하고 안내 메시지를 표시한다. 탭은 경기 기록 화면에 유지한다.
*/

// 폼 화면에서 입력값들을 읽어 하나의 객체로 반환한다.
function readMatchForm() {
  return {
    date: document.getElementById("input-date").value,
    venue: document.getElementById("input-venue").value,
    partner: document.getElementById("input-partner").value,
    opponent1: document.getElementById("input-opponent1").value,
    opponent2: document.getElementById("input-opponent2").value,
    result: document.getElementById("input-result").value,
    myScore: document.getElementById("input-my-score").value,
    oppScore: document.getElementById("input-opp-score").value,
    duration: document.getElementById("input-duration").value,
    memo: document.getElementById("input-memo").value
  };
}

// 저장 결과 안내 메시지를 표시한다. (type: "success" 또는 "error")
function showFormMessage(text, type) {
  var messageEl = document.getElementById("form-message");
  if (!messageEl) {
    return;
  }
  messageEl.textContent = text;
  messageEl.classList.remove("is-success", "is-error");
  messageEl.classList.add(type === "success" ? "is-success" : "is-error");
}

// 새 파트너/상대/구장 이름을 각 목록에 반영한다. (빈값·중복 제외는 addNameIfNew가 처리)
function updateNameLists(partnerName, opponentNames, venueName) {
  // 파트너 목록 갱신
  var partners = loadPartners();
  partners = addNameIfNew(partners, partnerName);
  savePartners(partners);

  // 상대 목록 갱신 (정리된 상대 이름들을 하나씩 반영)
  var opponents = loadOpponents();
  opponentNames.forEach(function (name) {
    opponents = addNameIfNew(opponents, name);
  });
  saveOpponents(opponents);

  // 구장 목록 갱신 (빈 값이면 addNameIfNew가 무시)
  var venues = loadVenues();
  venues = addNameIfNew(venues, venueName);
  saveVenues(venues);
}

// 폼을 초기화한다. (날짜는 다시 오늘로, 승/패 선택 해제)
function resetMatchForm() {
  var form = document.getElementById("match-form");
  if (form) {
    form.reset();
  }

  // 날짜 다시 오늘로
  var dateInput = document.getElementById("input-date");
  if (dateInput) {
    dateInput.value = getTodayDateString();
  }

  // 숨은 결과값 비우기 (form.reset()이 점수 number 칸은 비우지만 hidden은 남을 수 있음)
  var resultInput = document.getElementById("input-result");
  if (resultInput) {
    resultInput.value = "";
  }

  // 점수 기반 결과 미리보기를 초기 상태(안내 문구)로 되돌린다.
  updateResultPreview();

  // 폼을 비운 뒤에도 이벤트가 발생하지 않으므로, 이전에 표시되던 NTRP 힌트를 정리한다.
  updateNtrpHints();
}

// 현재 수정 중인 경기의 matchId. 신규 입력 모드면 null.
var editingMatchId = null;

// 저장(제출) 시 실행. 수정 모드면 갱신, 아니면 신규 등록한다.
function handleSaveMatch() {
  var formData = readMatchForm();

  // --- 필수 항목 검증 (날짜, 경기 점수) ---
  if (formData.date === "") {
    showFormMessage("경기 날짜를 입력해주세요.", "error");
    return;
  }
  // 점수 필수: 내 점수/상대 점수가 모두 0 이상의 정수여야 한다. (결과는 점수로 자동 판정)
  if (normalizeScore(formData.myScore) === null || normalizeScore(formData.oppScore) === null) {
    showFormMessage("내 점수와 상대 점수를 모두 입력해주세요. (0 이상의 숫자)", "error");
    return;
  }

  var matches = loadMatches();
  var savedMatch;

  if (editingMatchId !== null) {
    // --- 수정 모드: 같은 matchId 항목을 찾아 내용만 갱신 ---
    var index = matches.findIndex(function (m) {
      return m.matchId === editingMatchId;
    });

    if (index === -1) {
      // 이미 삭제되는 등으로 대상을 못 찾은 경우: 안전하게 신규 모드로 되돌림
      showFormMessage("수정할 경기를 찾지 못했습니다.", "error");
      exitEditMode();
      refreshViews();
      return;
    }

    savedMatch = buildUpdatedMatch(matches[index], formData);
    matches[index] = savedMatch;
    saveMatches(matches);
  } else {
    // --- 신규 등록: 기존 데이터에 추가 (덮어쓰기 방지) ---
    savedMatch = buildNewMatch(formData);
    matches.push(savedMatch);
    saveMatches(matches);
    matchListPage = 1; // 방금 등록한 경기가 최근 목록 첫 페이지에 보이도록
  }

  // --- 새 이름들을 이름 목록에 반영하고, 자동완성 목록도 갱신 ---
  updateNameLists(savedMatch.partner, [savedMatch.opponent1, savedMatch.opponent2], savedMatch.venue);
  fillNameDatalists();

  // --- 폼 초기화(신규 모드로 복귀) + 성공 메시지 ---
  var wasEditing = editingMatchId !== null;
  exitEditMode(); // 폼 초기화 + 수정 상태 해제
  showFormMessage(wasEditing ? "경기가 수정되었습니다." : "경기가 저장되었습니다.", "success");

  // 목록(및 준비된 통계·대시보드)을 다시 그려 방금 저장/수정한 내용을 반영한다.
  refreshViews();
}

/*
  [Task 8] 경기 수정
  - [수정] 클릭 시 해당 matchId의 값을 폼에 채우고 수정 모드로 전환한다.
  - 저장 시 같은 matchId 항목을 갱신한다(matchId·createdAt 유지).
  - [취소] 시 폼을 초기화하고 신규 입력 모드로 돌아간다.
*/

// 폼에 경기 값을 채운다. (수정 모드 진입 시 사용)
function fillMatchForm(match) {
  document.getElementById("input-date").value = match.date || "";
  document.getElementById("input-venue").value = match.venue || "";
  document.getElementById("input-partner").value = match.partner || "";
  document.getElementById("input-opponent1").value = match.opponent1 || "";
  document.getElementById("input-opponent2").value = match.opponent2 || "";
  document.getElementById("input-duration").value = match.duration || "";
  document.getElementById("input-memo").value = match.memo || "";

  // 점수 칸 채우기 (숫자가 있으면 그 값, 없으면 빈칸)
  var myInput = document.getElementById("input-my-score");
  var oppInput = document.getElementById("input-opp-score");
  if (myInput) myInput.value = (typeof match.myScore === "number") ? String(match.myScore) : "";
  if (oppInput) oppInput.value = (typeof match.oppScore === "number") ? String(match.oppScore) : "";

  var resultInput = document.getElementById("input-result");
  var preview = document.getElementById("result-preview");
  var hasScores = typeof match.myScore === "number" && typeof match.oppScore === "number";

  if (hasScores) {
    // 점수가 있으면 점수 기반으로 결과·미리보기를 갱신한다.
    updateResultPreview();
  } else {
    // 구버전 경기(점수 없음): 저장돼 있던 result를 유지하고, 미리보기에 기존 결과를 표시한다.
    if (resultInput) resultInput.value = match.result || "";
    if (preview) {
      preview.classList.remove("is-win", "is-loss", "is-draw");
      if (match.result) {
        preview.textContent = "결과: " + resultToLabel(match.result) + " (점수 미입력 기록)";
        preview.classList.add(resultToClass(match.result));
      } else {
        preview.textContent = "두 점수를 입력하면 승/무/패가 자동으로 정해집니다.";
      }
    }
  }

  // 값을 .value로 직접 채우면 input/change 이벤트가 발생하지 않으므로,
  // NTRP 힌트(나·파트너·상대1·상대2)를 명시적으로 한 번 갱신한다.
  updateNtrpHints();
}

// 수정 모드로 전환한다. (취소 버튼 표시, 저장 버튼 문구 변경)
function enterEditMode(matchId) {
  editingMatchId = matchId;

  var cancelButton = document.getElementById("cancel-edit-button");
  if (cancelButton) {
    cancelButton.hidden = false;
  }
  var saveButton = document.querySelector(".save-button");
  if (saveButton) {
    saveButton.textContent = "수정 저장";
  }
}

// 신규 입력 모드로 되돌린다. (폼 초기화 + 취소 버튼 숨김 + 저장 버튼 문구 원복)
function exitEditMode() {
  editingMatchId = null;
  resetMatchForm();

  var cancelButton = document.getElementById("cancel-edit-button");
  if (cancelButton) {
    cancelButton.hidden = true;
  }
  var saveButton = document.querySelector(".save-button");
  if (saveButton) {
    saveButton.textContent = "저장";
  }
}

// [수정] 버튼 클릭 처리: 해당 경기를 폼에 채우고 수정 모드로 전환한다.
function startEditMatch(matchId) {
  var matches = loadMatches();
  var match = matches.find(function (m) {
    return m.matchId === matchId;
  });
  if (!match) {
    showFormMessage("수정할 경기를 찾지 못했습니다.", "error");
    return;
  }

  fillMatchForm(match);
  enterEditMode(matchId);
  showFormMessage("수정 중입니다. 내용을 바꾼 뒤 저장을 눌러주세요.", "success");

  // 입력 폼이 잘 보이도록 화면 맨 위로 스크롤
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/*
  [Task 9] 경기 삭제
  - [삭제] 클릭 시 확인 후 해당 matchId 경기를 제거하고 저장한다.
  - 삭제 후 목록(그리고 통계·대시보드가 준비되면 그것들도) 다시 그린다.
*/

// 저장/수정/삭제 후 화면을 다시 그린다.
// 아직 만들어지지 않은 렌더 함수(통계·대시보드)는 존재할 때만 호출한다.
// (Task 12·13에서 해당 함수가 추가되면 자동으로 함께 갱신된다.)
function refreshViews() {
  renderMatchList();
  if (typeof renderStats === "function") {
    renderStats();
  }
  if (typeof renderDashboard === "function") {
    renderDashboard();
  }
}

// [삭제] 버튼 클릭 처리: 확인 후 해당 경기를 제거한다.
function handleDeleteMatch(matchId) {
  var confirmed = window.confirm("정말 삭제할까요?");
  if (!confirmed) {
    return;
  }

  var matches = loadMatches();
  var updated = deleteMatchById(matches, matchId);
  saveMatches(updated);

  // 삭제한 경기를 마침 수정 중이었다면, 수정 모드를 종료해 폼을 정리한다.
  if (editingMatchId === matchId) {
    exitEditMode();
  }

  refreshViews();
  showFormMessage("경기가 삭제되었습니다.", "success");
}

// 폼 제출 이벤트와 취소 버튼에 로직을 연결한다.
function setupMatchForm() {
  var form = document.getElementById("match-form");
  if (form) {
    form.addEventListener("submit", function (event) {
      event.preventDefault(); // 폼 기본 제출(새로고침) 방지
      handleSaveMatch();
    });
  }

  // 취소 버튼: 수정 모드를 끝내고 신규 입력 모드로 되돌린다.
  var cancelButton = document.getElementById("cancel-edit-button");
  if (cancelButton) {
    cancelButton.addEventListener("click", function () {
      exitEditMode();
      showFormMessage("수정을 취소했습니다.", "success");
    });
  }
}

/*
  [Task 7] 경기 목록 표시 (조회 + 최근 우선 정렬)
  - loadMatches()로 저장 데이터를 읽어 sortMatchesByRecent()로 정렬한다.
  - 각 경기를 카드로 표시한다. 사용자 입력은 textContent로만 넣어 HTML 해석을 막는다.
  - 저장된 경기가 없으면 빈 상태 안내를 표시한다.
*/

// 결과 코드(W/L/D)를 사람이 읽기 쉬운 문구로 바꾼다.
function resultToLabel(result) {
  if (result === "W") return "승리";
  if (result === "L") return "패배";
  if (result === "D") return "무승부";
  return "";
}

// 결과 코드(W/L/D)를 배지 색상 클래스로 바꾼다.
function resultToClass(result) {
  if (result === "W") return "is-win";
  if (result === "L") return "is-loss";
  if (result === "D") return "is-draw";
  return "";
}

// 경기의 점수를 "내점수 : 상대점수" 문자열로 만든다.
// 숫자 점수가 둘 다 있으면 "3 : 1", 없으면 "" 반환(구버전 경기는 세트 스코어 텍스트로 폴백).
function scoreToText(match) {
  if (typeof match.myScore === "number" && typeof match.oppScore === "number") {
    return match.myScore + " : " + match.oppScore;
  }
  return "";
}

// 전력차 숫자를 부호 포함 문자열로 만든다. 예: 0.25 -> "+0.25", -0.3 -> "-0.30", 0 -> "0.00"
function formatNtrpDifference(diff) {
  if (typeof diff !== "number") return "";
  var sign = diff > 0 ? "+" : (diff < 0 ? "-" : "");
  return sign + Math.abs(diff).toFixed(2);
}

// 난이도 타입을 사람이 읽는 문구로 바꾼다.
function difficultyTypeToLabel(type) {
  if (type === "easier") return "우리 전력 우세";
  if (type === "harder") return "상대 전력 우세";
  if (type === "even") return "동급";
  return "NTRP 미등록";
}

// 경기 카드에 붙일 NTRP 전력 분석 블록(DOM)을 만든다.
// - available:false(미등록)면 "NTRP 미등록"만 표시한다.
// - 사용자 입력값은 textContent로만 넣어 안전하게 표시한다.
function createNtrpAnalysisBlock(match) {
  var analysis = getMatchNtrpAnalysis(match);

  var block = document.createElement("div");
  block.className = "ntrp-analysis";

  if (!analysis.available) {
    block.classList.add("is-unavailable");
    var na = document.createElement("span");
    na.className = "ntrp-analysis-na";
    na.textContent = "NTRP 미등록";
    block.appendChild(na);
    return block;
  }

  // 팀 평균 줄: "우리팀 2.90  vs  상대팀 3.15"
  var teamLine = document.createElement("div");
  teamLine.className = "ntrp-analysis-teams";
  teamLine.textContent =
    "우리팀 " + analysis.myTeamNtrp.toFixed(2) +
    "  vs  상대팀 " + analysis.opponentTeamNtrp.toFixed(2);

  // 전력차 줄: "전력차 +0.25 · 상대 전력 우세"
  var diffLine = document.createElement("div");
  diffLine.className = "ntrp-analysis-diff " + resultDifficultyClass(analysis.difficultyType);
  diffLine.textContent =
    "전력차 " + formatNtrpDifference(analysis.ntrpDifference) +
    " · " + difficultyTypeToLabel(analysis.difficultyType);

  block.appendChild(teamLine);
  block.appendChild(diffLine);
  return block;
}

// 난이도 타입을 색상 구분 클래스로 바꾼다. (우세=초록, 열세=빨강, 동급=회색)
function resultDifficultyClass(type) {
  if (type === "easier") return "is-favored";
  if (type === "harder") return "is-underdog";
  return "is-even";
}

// "라벨 + 값" 한 줄을 만들어 반환한다. (값은 textContent로 넣어 안전)
function createInfoRow(labelText, valueText) {
  var row = document.createElement("div");
  row.className = "match-row";

  var label = document.createElement("span");
  label.className = "match-label";
  label.textContent = labelText;

  var value = document.createElement("span");
  value.className = "match-value";
  value.textContent = valueText;

  row.appendChild(label);
  row.appendChild(value);
  return row;
}

// 경기 한 건을 카드(DOM 요소)로 만들어 반환한다.
function createMatchCard(match) {
  var card = document.createElement("div");
  card.className = "match-card";

  // 상단: 날짜 + 승/패 배지
  var header = document.createElement("div");
  header.className = "match-card-header";

  var dateEl = document.createElement("span");
  dateEl.className = "match-date";
  dateEl.textContent = match.date || "";

  var resultEl = document.createElement("span");
  // 승/무/패에 따라 색 구분 클래스 부여 (텍스트도 함께 표시)
  resultEl.className = "match-result " + resultToClass(match.result);
  resultEl.textContent = resultToLabel(match.result) + " " + (match.result || "");

  header.appendChild(dateEl);
  header.appendChild(resultEl);
  card.appendChild(header);

  // 상대 표시: 상대2가 비어 있으면 "/" 없이 상대1만 표시
  var opponentText = match.opponent1 || "";
  if (match.opponent2 && match.opponent2 !== "") {
    opponentText = opponentText + " / " + match.opponent2;
  }

  // 세부 정보 행들 (구장은 값이 있을 때만 표시)
  if (match.venue && match.venue !== "") {
    card.appendChild(createInfoRow("구장", match.venue));
  }
  card.appendChild(createInfoRow("파트너", match.partner || ""));
  card.appendChild(createInfoRow("상대", opponentText));

  // 점수: 숫자 점수(내:상대)가 있으면 그것을 표시. 없으면(구버전 경기) 기존 스코어 텍스트로 폴백.
  var scoreText = scoreToText(match);
  if (scoreText !== "") {
    card.appendChild(createInfoRow("점수", scoreText));
  } else if (match.score && match.score !== "") {
    card.appendChild(createInfoRow("점수", match.score));
  }

  card.appendChild(createInfoRow("시간", match.duration || ""));
  card.appendChild(createInfoRow("메모", match.memo || ""));

  // NTRP 전력 분석 블록 (Master에서 조회해 계산, 경기 데이터는 변경하지 않음)
  card.appendChild(createNtrpAnalysisBlock(match));

  // 카드 하단: 동작 버튼 영역 ([수정] — 삭제는 Task 9에서 추가)
  var actions = document.createElement("div");
  actions.className = "match-actions";

  var editButton = document.createElement("button");
  editButton.type = "button";
  editButton.className = "edit-button";
  editButton.textContent = "수정";
  editButton.addEventListener("click", function () {
    startEditMatch(match.matchId);
  });

  var deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "delete-button";
  deleteButton.textContent = "삭제";
  deleteButton.addEventListener("click", function () {
    handleDeleteMatch(match.matchId);
  });

  actions.appendChild(editButton);
  actions.appendChild(deleteButton);
  card.appendChild(actions);

  return card;
}

// 빈 상태 안내 요소를 만들어 반환한다.
function createEmptyState() {
  var box = document.createElement("div");
  box.className = "empty-state";

  var line1 = document.createElement("p");
  line1.textContent = "아직 기록된 경기가 없습니다.";
  var line2 = document.createElement("p");
  line2.textContent = "경기를 입력하면 이곳에 기록이 표시됩니다.";

  box.appendChild(line1);
  box.appendChild(line2);
  return box;
}

// 경기 목록을 화면에 그린다. (저장 데이터를 다시 읽어 최신 상태로 표시)
// 목록 페이지네이션 컨트롤(이전/다음 + "N / M 페이지")을 만든다. (경기·상대방 목록 공용)
// onGo(newPage): 페이지 이동 시 호출할 콜백. page/totalPages는 1-base.
function createPaginationControls(page, totalPages, onGo) {
  var nav = document.createElement("div");
  nav.className = "pagination";

  var prev = document.createElement("button");
  prev.type = "button";
  prev.className = "pagination-button";
  prev.textContent = "이전";
  prev.disabled = page <= 1;
  prev.addEventListener("click", function () {
    if (page > 1) onGo(page - 1);
  });

  var info = document.createElement("span");
  info.className = "pagination-info";
  info.textContent = page + " / " + totalPages + " 페이지";

  var next = document.createElement("button");
  next.type = "button";
  next.className = "pagination-button";
  next.textContent = "다음";
  next.disabled = page >= totalPages;
  next.addEventListener("click", function () {
    if (page < totalPages) onGo(page + 1);
  });

  nav.appendChild(prev);
  nav.appendChild(info);
  nav.appendChild(next);
  return nav;
}

// 경기 목록 페이지네이션 상태 (1-base) 및 페이지당 개수
var matchListPage = 1;
var MATCH_LIST_PAGE_SIZE = 5;

function renderMatchList() {
  var listEl = document.getElementById("match-list");
  if (!listEl) {
    return;
  }

  // 기존 내용 비우기
  listEl.innerHTML = "";

  var matches = sortMatchesByRecent(loadMatches());

  // 빈 상태 처리
  if (matches.length === 0) {
    listEl.appendChild(createEmptyState());
    return;
  }

  // 페이지 범위 보정 (삭제 등으로 현재 페이지가 범위를 벗어난 경우)
  var totalPages = Math.max(1, Math.ceil(matches.length / MATCH_LIST_PAGE_SIZE));
  if (matchListPage > totalPages) matchListPage = totalPages;
  if (matchListPage < 1) matchListPage = 1;

  // 현재 페이지 구간만 표시
  var start = (matchListPage - 1) * MATCH_LIST_PAGE_SIZE;
  var pageItems = matches.slice(start, start + MATCH_LIST_PAGE_SIZE);
  pageItems.forEach(function (match) {
    listEl.appendChild(createMatchCard(match));
  });

  // 페이지가 2개 이상일 때만 페이지네이션 표시
  if (totalPages > 1) {
    listEl.appendChild(createPaginationControls(matchListPage, totalPages, function (newPage) {
      matchListPage = newPage;
      renderMatchList();
    }));
  }
}

/*
  [Task 12] 통계 탭 화면 렌더링
  - Task 10·11의 계산 함수 결과를 화면에 표시한다.
  - 전체 통계는 요약 카드로, 월별/파트너별/상대별은 표로 표시한다.
  - 이름 등 사용자 입력값은 textContent로만 넣어 HTML 해석을 막는다.
  - 기록이 없으면 안내 문구를 표시한다.
*/

// 승률 값을 표시용 문자열로 바꾼다. 숫자면 "67%", "-"면 그대로.
function formatWinRate(winRate) {
  if (typeof winRate === "number") {
    return winRate + "%";
  }
  return "-";
}

// 요약 카드 한 개(제목 + 값)를 만든다. (값은 textContent로 안전하게)
function createStatCard(labelText, valueText) {
  var card = document.createElement("div");
  card.className = "stat-card";

  var value = document.createElement("div");
  value.className = "stat-value";
  value.textContent = valueText;

  var label = document.createElement("div");
  label.className = "stat-label";
  label.textContent = labelText;

  card.appendChild(value);
  card.appendChild(label);
  return card;
}

// 연승/연패 상태를 사람이 읽기 쉬운 문구로 바꾼다.
function streakToText(streak) {
  if (!streak || streak.type === "none" || streak.count === 0) {
    return "-";
  }
  if (streak.type === "win") {
    return streak.count + "연승";
  }
  return streak.count + "연패";
}

// 최근 n경기 결과를 "3승 2패" 형태로 바꾼다. 무승부가 있으면 "3승 1무 2패"로 표시한다.
function recentToText(recent) {
  if (!recent || recent.count === 0) {
    return "-";
  }
  var draws = recent.draws || 0;
  if (draws > 0) {
    return recent.wins + "승 " + draws + "무 " + recent.losses + "패";
  }
  return recent.wins + "승 " + recent.losses + "패";
}

// 전체 통계 요약을 그린다.
function renderOverallStats(matches) {
  var el = document.getElementById("stats-overall");
  if (!el) return;
  el.innerHTML = "";

  var totals = calcTotals(matches);
  var recent5 = calcRecent(matches, 5);
  var recent10 = calcRecent(matches, 10);
  var streak = calcStreak(matches);

  var grid = document.createElement("div");
  grid.className = "stat-card-grid";

  grid.appendChild(createStatCard("총 경기", String(totals.total)));
  grid.appendChild(createStatCard("승 / 무 / 패", totals.wins + " / " + totals.draws + " / " + totals.losses));
  grid.appendChild(createStatCard("승률", formatWinRate(totals.winRate)));
  grid.appendChild(createStatCard("연승/연패", streakToText(streak)));
  grid.appendChild(createStatCard("최근 5경기", recentToText(recent5)));
  grid.appendChild(createStatCard("최근 10경기", recentToText(recent10)));

  el.appendChild(grid);
}

// 표 헤더(thead) 행을 만든다. (헤더 텍스트 배열)
function createTableHead(headers) {
  var thead = document.createElement("thead");
  var tr = document.createElement("tr");
  headers.forEach(function (h) {
    var th = document.createElement("th");
    th.textContent = h;
    tr.appendChild(th);
  });
  thead.appendChild(tr);
  return thead;
}

// 표 본문 행 하나를 만든다. (셀 텍스트 배열, 값은 textContent로 안전)
function createTableRow(cells) {
  var tr = document.createElement("tr");
  cells.forEach(function (c) {
    var td = document.createElement("td");
    td.textContent = c;
    tr.appendChild(td);
  });
  return tr;
}

// 빈 안내 문구 요소를 만든다.
function createStatsEmpty(text) {
  var p = document.createElement("p");
  p.className = "stats-empty";
  p.textContent = text;
  return p;
}

// 월별 통계 표를 그린다.
function renderMonthlyStats(matches) {
  var el = document.getElementById("stats-monthly");
  if (!el) return;
  el.innerHTML = "";

  var rows = calcMonthly(matches);
  if (rows.length === 0) {
    el.appendChild(createStatsEmpty("표시할 월별 통계가 없습니다."));
    return;
  }

  var table = document.createElement("table");
  table.className = "stats-table";
  table.appendChild(createTableHead(["월", "경기", "승", "무", "패", "승률"]));

  var tbody = document.createElement("tbody");
  rows.forEach(function (r) {
    tbody.appendChild(createTableRow([
      r.month,
      String(r.total),
      String(r.wins),
      String(r.draws || 0),
      String(r.losses),
      formatWinRate(r.winRate)
    ]));
  });
  table.appendChild(tbody);
  el.appendChild(table);
}

// 이름별 통계 표(파트너/상대 공용)를 그린다.
function renderNameStatsTable(elementId, rows, firstColumnLabel, emptyText) {
  var el = document.getElementById(elementId);
  if (!el) return;
  el.innerHTML = "";

  if (rows.length === 0) {
    el.appendChild(createStatsEmpty(emptyText));
    return;
  }

  var table = document.createElement("table");
  table.className = "stats-table";
  table.appendChild(createTableHead([firstColumnLabel, "경기", "승", "무", "패", "승률"]));

  var tbody = document.createElement("tbody");
  rows.forEach(function (r) {
    tbody.appendChild(createTableRow([
      r.name,
      String(r.total),
      String(r.wins),
      String(r.draws || 0),
      String(r.losses),
      formatWinRate(r.winRate)
    ]));
  });
  table.appendChild(tbody);
  el.appendChild(table);
}

// NTRP 전력 구간별 통계 표 + 평균 전력차를 그린다.
function renderNtrpDifficultyStats(matches) {
  var el = document.getElementById("stats-ntrp");
  if (!el) return;
  el.innerHTML = "";

  var stats = calcNtrpDifficultyStats(matches);

  // NTRP 계산 가능한 경기가 하나도 없으면 안내만 표시
  if (stats.analyzedCount === 0) {
    el.appendChild(createStatsEmpty("NTRP가 등록된 경기가 없어 전력별 분석을 표시할 수 없습니다."));
    return;
  }

  var table = document.createElement("table");
  table.className = "stats-table";
  table.appendChild(createTableHead(["전력 구간", "경기", "승", "패", "무", "승률"]));

  var tbody = document.createElement("tbody");
  var rows = [
    { label: "우리 팀 우세", g: stats.favored },
    { label: "동급", g: stats.even },
    { label: "우리 팀 열세", g: stats.underdog }
  ];
  rows.forEach(function (row) {
    var g = row.g;
    tbody.appendChild(createTableRow([
      row.label,
      String(g.total),
      String(g.wins),
      String(g.losses),
      String(g.draws),
      formatWinRate(g.winRate)
    ]));
  });
  table.appendChild(tbody);
  el.appendChild(table);

  // 평균 전력차 표시
  var avg = document.createElement("p");
  avg.className = "ntrp-avg-diff";
  if (typeof stats.avgDifference === "number") {
    var text = "평균 전력차 " + formatNtrpDifference(stats.avgDifference) + " · ";
    if (stats.avgDifference > 0) {
      text += "평균적으로 상대팀 NTRP가 높았음";
    } else if (stats.avgDifference < 0) {
      text += "평균적으로 우리 팀 NTRP가 높았음";
    } else {
      text += "평균적으로 양 팀 NTRP가 비슷했음";
    }
    avg.textContent = text;
  } else {
    avg.textContent = "평균 전력차 -";
  }
  el.appendChild(avg);
}

// 전력 열세/우세(업셋) 분석을 그린다.
function renderNtrpUpsetStats(matches) {
  var el = document.getElementById("stats-ntrp-upset");
  if (!el) return;
  el.innerHTML = "";

  var stats = calcNtrpUpsetStats(matches);
  var u = stats.underdog;

  // 전력 열세 경기가 하나도 없으면 안내만 표시
  if (u.total === 0) {
    el.appendChild(createStatsEmpty("전력 열세로 분석된 경기가 없습니다."));
    return;
  }

  // 전력 열세 경기 집계 표
  var table = document.createElement("table");
  table.className = "stats-table";
  table.appendChild(createTableHead(["구분", "경기", "승", "패", "무", "승률"]));
  var tbody = document.createElement("tbody");
  tbody.appendChild(createTableRow([
    "전력 열세 경기",
    String(u.total),
    String(u.wins),
    String(u.losses),
    String(u.draws),
    formatWinRate(u.winRate)
  ]));
  table.appendChild(tbody);
  el.appendChild(table);

  // 가장 큰 전력 열세 승리
  var upsetP = document.createElement("p");
  upsetP.className = "ntrp-upset-line";
  if (stats.biggestUpsetWin) {
    var a = stats.biggestUpsetWin.analysis;
    var m = stats.biggestUpsetWin.match;
    var scoreText = scoreToText(m); // "6 : 4" 또는 ""
    var line = "가장 큰 전력 열세 승리 · 전력차 " + formatNtrpDifference(a.ntrpDifference) +
               " (우리팀 " + a.myTeamNtrp.toFixed(2) + " vs 상대팀 " + a.opponentTeamNtrp.toFixed(2) + ")";
    if (scoreText !== "") {
      line += " · 스코어 " + scoreText;
    }
    upsetP.textContent = line;
    upsetP.classList.add("is-favored");
  } else {
    upsetP.textContent = "가장 큰 전력 열세 승리 · 아직 없음";
    upsetP.classList.add("is-even");
  }
  el.appendChild(upsetP);

  // 전력 우세 경기 패배
  var favLossP = document.createElement("p");
  favLossP.className = "ntrp-upset-line is-underdog";
  favLossP.textContent = "전력 우세 경기 패배 · " + stats.favoredLossCount + "경기";
  el.appendChild(favLossP);
}

// 파트너별 통계 표(기본 전적 + NTRP 분석)를 그린다.
// - 기본 전적 열은 기존과 동일. 그 뒤에 NTRP 분석 열을 덧붙인다.
// - NTRP 항목이 없는(계산 불가) 파트너는 해당 칸을 "-"로 표시한다.
function renderPartnerStatsTable(rows) {
  var el = document.getElementById("stats-partner");
  if (!el) return;
  el.innerHTML = "";

  if (rows.length === 0) {
    el.appendChild(createStatsEmpty("표시할 파트너 통계가 없습니다."));
    return;
  }

  // 가로 스크롤 래퍼 (열이 많아 모바일에서 넘칠 수 있으므로)
  var wrap = document.createElement("div");
  wrap.className = "stats-table-scroll";

  var table = document.createElement("table");
  table.className = "stats-table";
  table.appendChild(createTableHead([
    "파트너", "경기", "승", "무", "패", "승률",
    "평균 우리팀", "평균 상대팀", "평균 전력차", "열세 경기", "열세 승률"
  ]));

  var tbody = document.createElement("tbody");
  rows.forEach(function (r) {
    var avgMy = (typeof r.avgMyTeamNtrp === "number") ? r.avgMyTeamNtrp.toFixed(2) : "-";
    var avgOpp = (typeof r.avgOpponentTeamNtrp === "number") ? r.avgOpponentTeamNtrp.toFixed(2) : "-";
    var avgDiff = (typeof r.avgDifference === "number") ? formatNtrpDifference(r.avgDifference) : "-";
    var underdog = (r.underdogTotal > 0) ? String(r.underdogTotal) : "0";
    var underdogRate = (r.underdogTotal > 0) ? formatWinRate(r.underdogWinRate) : "-";

    tbody.appendChild(createTableRow([
      r.name,
      String(r.total),
      String(r.wins),
      String(r.draws || 0),
      String(r.losses),
      formatWinRate(r.winRate),
      avgMy,
      avgOpp,
      avgDiff,
      underdog,
      underdogRate
    ]));
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
  el.appendChild(wrap);
}

// 상대별 통계 표(기본 전적 + NTRP 분석)를 그린다.
// - 기본 전적 열은 기존과 동일. 그 뒤에 NTRP 분석 열을 덧붙인다.
// - NTRP 항목이 없는(계산 불가/미등록) 상대는 해당 칸을 "-"로 표시한다.
function renderOpponentStatsTable(rows) {
  var el = document.getElementById("stats-opponent");
  if (!el) return;
  el.innerHTML = "";

  if (rows.length === 0) {
    el.appendChild(createStatsEmpty("표시할 상대 통계가 없습니다."));
    return;
  }

  var wrap = document.createElement("div");
  wrap.className = "stats-table-scroll";

  var table = document.createElement("table");
  table.className = "stats-table";
  table.appendChild(createTableHead([
    "상대", "경기", "승", "무", "패", "승률",
    "등록 NTRP", "평균 우리팀", "평균 상대팀", "평균 전력차"
  ]));

  var tbody = document.createElement("tbody");
  rows.forEach(function (r) {
    var reg = (typeof r.registeredNtrp === "number") ? r.registeredNtrp.toFixed(1) : "-";
    var avgMy = (typeof r.avgMyTeamNtrp === "number") ? r.avgMyTeamNtrp.toFixed(2) : "-";
    var avgOpp = (typeof r.avgOpponentTeamNtrp === "number") ? r.avgOpponentTeamNtrp.toFixed(2) : "-";
    var avgDiff = (typeof r.avgDifference === "number") ? formatNtrpDifference(r.avgDifference) : "-";

    tbody.appendChild(createTableRow([
      r.name,
      String(r.total),
      String(r.wins),
      String(r.draws || 0),
      String(r.losses),
      formatWinRate(r.winRate),
      reg,
      avgMy,
      avgOpp,
      avgDiff
    ]));
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
  el.appendChild(wrap);
}

// 월별 통계 표(기본 전적 + NTRP 분석)를 그린다.
// - 기본 전적 열은 기존과 동일. 그 뒤에 NTRP 분석 열을 덧붙인다.
// - NTRP 항목이 없는(계산 불가) 월은 해당 칸을 "-"로 표시한다.
function renderMonthlyStatsWithNtrp(rows) {
  var el = document.getElementById("stats-monthly");
  if (!el) return;
  el.innerHTML = "";

  if (rows.length === 0) {
    el.appendChild(createStatsEmpty("표시할 월별 통계가 없습니다."));
    return;
  }

  var wrap = document.createElement("div");
  wrap.className = "stats-table-scroll";

  var table = document.createElement("table");
  table.className = "stats-table";
  table.appendChild(createTableHead([
    "월", "경기", "승", "무", "패", "승률",
    "평균 우리팀", "평균 상대팀", "평균 전력차", "열세 경기", "열세 승률"
  ]));

  var tbody = document.createElement("tbody");
  rows.forEach(function (r) {
    var avgMy = (typeof r.avgMyTeamNtrp === "number") ? r.avgMyTeamNtrp.toFixed(2) : "-";
    var avgOpp = (typeof r.avgOpponentTeamNtrp === "number") ? r.avgOpponentTeamNtrp.toFixed(2) : "-";
    var avgDiff = (typeof r.avgDifference === "number") ? formatNtrpDifference(r.avgDifference) : "-";
    var underdog = (r.underdogTotal > 0) ? String(r.underdogTotal) : "0";
    var underdogRate = (r.underdogTotal > 0) ? formatWinRate(r.underdogWinRate) : "-";

    tbody.appendChild(createTableRow([
      r.month,
      String(r.total),
      String(r.wins),
      String(r.draws || 0),
      String(r.losses),
      formatWinRate(r.winRate),
      avgMy,
      avgOpp,
      avgDiff,
      underdog,
      underdogRate
    ]));
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
  el.appendChild(wrap);
}

// 통계 탭 전체를 그린다. 기록이 없으면 전체 안내만 표시한다.
function renderStats() {
  var matches = loadMatches();

  renderOverallStats(matches);
  renderNtrpDifficultyStats(matches);
  renderNtrpUpsetStats(matches);
  renderMonthlyStatsWithNtrp(calcMonthlyWithNtrp(matches));
  renderPartnerStatsTable(calcByPartnerWithNtrp(matches));
  renderOpponentStatsTable(calcByOpponentWithNtrp(matches));
  renderNameStatsTable("stats-venue", calcByVenue(matches), "구장", "표시할 구장 통계가 없습니다.");
}

/*
  [Task 13] 대시보드 화면 렌더링
  - 주요 통계 요약 카드(총 경기/승-패/승률/연승·연패)를 표시한다.
  - 최근 경기 몇 건을 요약해서 표시한다.
  - 기록이 없으면 시작 안내와 경기 기록 탭으로 이동하는 버튼을 표시한다.
*/

// 대시보드의 주요 통계 요약 카드를 그린다.
function renderDashboardSummary(matches) {
  var el = document.getElementById("dashboard-summary");
  if (!el) return;
  el.innerHTML = "";

  var totals = calcTotals(matches);
  var streak = calcStreak(matches);

  var grid = document.createElement("div");
  grid.className = "stat-card-grid";

  grid.appendChild(createStatCard("총 경기", String(totals.total)));
  grid.appendChild(createStatCard("승 / 무 / 패", totals.wins + " / " + totals.draws + " / " + totals.losses));
  grid.appendChild(createStatCard("승률", formatWinRate(totals.winRate)));
  grid.appendChild(createStatCard("연승/연패", streakToText(streak)));

  el.appendChild(grid);
}

// 최근 경기 한 건을 간단한 요약 줄로 만든다. (값은 textContent로 안전)
function createRecentMatchLine(match) {
  var line = document.createElement("div");
  line.className = "recent-line";

  // 승/무/패 배지
  var badge = document.createElement("span");
  badge.className = "recent-badge " + resultToClass(match.result);
  badge.textContent = match.result || "";

  // 날짜
  var dateEl = document.createElement("span");
  dateEl.className = "recent-date";
  dateEl.textContent = match.date || "";

  // 상대 (상대2 없으면 "/" 없이 상대1만)
  var opponentText = match.opponent1 || "";
  if (match.opponent2 && match.opponent2 !== "") {
    opponentText = opponentText + " / " + match.opponent2;
  }
  var vsEl = document.createElement("span");
  vsEl.className = "recent-vs";
  vsEl.textContent = opponentText === "" ? "" : "vs " + opponentText;

  line.appendChild(badge);
  line.appendChild(dateEl);
  line.appendChild(vsEl);

  // 점수 표시: 내 점수 - 상대 점수 (새 점수 구조 사용, 숫자 점수가 있을 때만)
  if (typeof match.myScore === "number" && typeof match.oppScore === "number") {
    var scoreEl = document.createElement("div");
    scoreEl.className = "recent-score";
    scoreEl.textContent = match.myScore + " - " + match.oppScore;
    line.appendChild(scoreEl);
  }

  // NTRP 분석 정보 (Master에서 조회해 계산, 경기 데이터는 변경하지 않음)
  var analysis = getMatchNtrpAnalysis(match);
  var ntrpEl = document.createElement("div");
  ntrpEl.className = "recent-ntrp";
  if (!analysis.available) {
    ntrpEl.classList.add("is-unavailable");
    ntrpEl.textContent = "NTRP 미등록";
  } else {
    var teams = document.createElement("div");
    teams.className = "recent-ntrp-teams";
    teams.textContent =
      "우리팀 " + analysis.myTeamNtrp.toFixed(2) +
      " · 상대팀 " + analysis.opponentTeamNtrp.toFixed(2);
    var diff = document.createElement("div");
    diff.className = "recent-ntrp-diff " + resultDifficultyClass(analysis.difficultyType);
    diff.textContent =
      "전력차 " + formatNtrpDifference(analysis.ntrpDifference) +
      " · " + difficultyTypeToLabel(analysis.difficultyType);
    ntrpEl.appendChild(teams);
    ntrpEl.appendChild(diff);
  }
  line.appendChild(ntrpEl);

  return line;
}

// 빈 상태: 시작 안내 + 경기 기록 탭으로 이동하는 버튼.
function createDashboardEmpty() {
  var box = document.createElement("div");
  box.className = "empty-state";

  var msg = document.createElement("p");
  msg.textContent = "첫 경기를 기록해보세요.";
  box.appendChild(msg);

  var goButton = document.createElement("button");
  goButton.type = "button";
  goButton.className = "save-button";
  goButton.textContent = "경기 기록하러 가기";
  goButton.addEventListener("click", function () {
    activateTab("records");
    renderMatchList();
  });
  box.appendChild(goButton);

  return box;
}

// 대시보드용 전체 NTRP 요약 계산: 분석 가능한 경기들의 팀 평균 NTRP와 평균 전력차.
// (기존 함수에 없던 "전체 우리팀/상대팀 평균 NTRP"만 여기서 집계한다. 계산 규칙은 getMatchNtrpAnalysis 재사용)
// 반환: { analyzedCount, avgMyTeamNtrp|null, avgOpponentTeamNtrp|null, avgDifference|null }
function calcDashboardNtrpSummary(matches) {
  var list = Array.isArray(matches) ? matches : [];
  var count = 0, mySum = 0, oppSum = 0, diffSum = 0;

  list.forEach(function (m) {
    var a = getMatchNtrpAnalysis(m);
    if (!a.available || typeof a.ntrpDifference !== "number") return;
    count++;
    mySum += a.myTeamNtrp;
    oppSum += a.opponentTeamNtrp;
    diffSum += a.ntrpDifference;
  });

  if (count === 0) {
    return { analyzedCount: 0, avgMyTeamNtrp: null, avgOpponentTeamNtrp: null, avgDifference: null };
  }
  return {
    analyzedCount: count,
    avgMyTeamNtrp: Math.round((mySum / count) * 100) / 100,
    avgOpponentTeamNtrp: Math.round((oppSum / count) * 100) / 100,
    avgDifference: Math.round((diffSum / count) * 100) / 100
  };
}

// 대시보드: NTRP 경기 분석 요약(평균 우리팀/상대팀 NTRP, 평균 전력차)을 그린다.
function renderDashboardNtrpSummary(matches) {
  var el = document.getElementById("dashboard-ntrp");
  if (!el) return;
  el.innerHTML = "";

  var s = calcDashboardNtrpSummary(matches);
  if (s.analyzedCount === 0) {
    el.appendChild(createStatsEmpty("NTRP 분석 데이터가 없습니다."));
    return;
  }

  var grid = document.createElement("div");
  grid.className = "stat-card-grid";
  grid.appendChild(createStatCard("평균 우리팀 NTRP", s.avgMyTeamNtrp.toFixed(2)));
  grid.appendChild(createStatCard("평균 상대팀 NTRP", s.avgOpponentTeamNtrp.toFixed(2)));
  grid.appendChild(createStatCard("평균 전력차", formatNtrpDifference(s.avgDifference)));
  el.appendChild(grid);
}

// 대시보드: NTRP 전력별 승률(우세/동급/열세)을 간단히 그린다. (기존 calcNtrpDifficultyStats 재사용)
function renderDashboardNtrpDifficulty(matches) {
  var el = document.getElementById("dashboard-ntrp-difficulty");
  if (!el) return;
  el.innerHTML = "";

  var stats = calcNtrpDifficultyStats(matches);
  if (stats.analyzedCount === 0) {
    el.appendChild(createStatsEmpty("NTRP 분석 데이터가 없습니다."));
    return;
  }

  function line(label, g) {
    var rate = (typeof g.winRate === "number") ? (g.winRate + "%") : "-";
    return createStatCard(label, g.total + "경기 · " + rate);
  }

  var grid = document.createElement("div");
  grid.className = "stat-card-grid";
  grid.appendChild(line("우리팀 우세", stats.favored));
  grid.appendChild(line("동급", stats.even));
  grid.appendChild(line("우리팀 열세", stats.underdog));
  el.appendChild(grid);
}

// 대시보드: 전력 열세 경기 분석(경기 수·승률·승리 수 + 가장 큰 열세 승리)을 그린다.
// (기존 calcNtrpUpsetStats 재사용)
function renderDashboardNtrpUpset(matches) {
  var el = document.getElementById("dashboard-ntrp-upset");
  if (!el) return;
  el.innerHTML = "";

  var stats = calcNtrpUpsetStats(matches);
  var u = stats.underdog;

  if (u.total === 0) {
    el.appendChild(createStatsEmpty("전력 열세로 분석된 경기가 없습니다."));
    return;
  }

  var grid = document.createElement("div");
  grid.className = "stat-card-grid";
  grid.appendChild(createStatCard("전력 열세 경기", u.total + "경기"));
  grid.appendChild(createStatCard("전력 열세 승률",
    (typeof u.winRate === "number") ? (u.winRate + "%") : "-"));
  grid.appendChild(createStatCard("전력 열세 승리", u.wins + "회"));
  el.appendChild(grid);

  // 가장 큰 전력 열세 승리: 존재할 때만 표시
  if (stats.biggestUpsetWin) {
    var a = stats.biggestUpsetWin.analysis;
    var m = stats.biggestUpsetWin.match;
    var box = document.createElement("div");
    box.className = "dashboard-upset-highlight";

    var title = document.createElement("div");
    title.className = "dashboard-upset-title";
    title.textContent = "가장 큰 전력 열세 승리";
    box.appendChild(title);

    var diffLine = document.createElement("div");
    diffLine.className = "dashboard-upset-diff is-favored";
    diffLine.textContent = "전력차 " + formatNtrpDifference(a.ntrpDifference);
    box.appendChild(diffLine);

    var scoreText = scoreToText(m); // "6 : 4" 또는 ""
    if (scoreText !== "") {
      var scoreLine = document.createElement("div");
      scoreLine.className = "dashboard-upset-score";
      scoreLine.textContent = scoreText;
      box.appendChild(scoreLine);
    }
    el.appendChild(box);
  }
}

// 대시보드의 최근 경기 요약을 그린다. (최근 우선 정렬 후 앞 5건)
function renderDashboardRecent(matches) {
  var el = document.getElementById("dashboard-recent");
  if (!el) return;
  el.innerHTML = "";

  var recent = sortMatchesByRecent(matches).slice(0, 5);
  if (recent.length === 0) {
    el.appendChild(createStatsEmpty("최근 경기가 없습니다."));
    return;
  }

  recent.forEach(function (match) {
    el.appendChild(createRecentMatchLine(match));
  });
}

// 대시보드 전체를 그린다.
function renderDashboard() {
  var matches = loadMatches();
  var summaryEl = document.getElementById("dashboard-summary");
  var recentEl = document.getElementById("dashboard-recent");

  var recentTitle = document.getElementById("dashboard-recent-title");

  // NTRP 섹션 요소들 (제목 + 컨테이너) — 빈 상태에서 함께 숨긴다.
  var ntrpSections = [
    { title: "dashboard-ntrp-title", body: "dashboard-ntrp" },
    { title: "dashboard-ntrp-difficulty-title", body: "dashboard-ntrp-difficulty" },
    { title: "dashboard-ntrp-upset-title", body: "dashboard-ntrp-upset" }
  ];
  function setNtrpSectionsHidden(hidden) {
    ntrpSections.forEach(function (s) {
      var t = document.getElementById(s.title);
      var b = document.getElementById(s.body);
      if (t) t.hidden = hidden;
      if (b) {
        b.hidden = hidden;
        if (hidden) b.innerHTML = "";
      }
    });
  }

  // 기록이 하나도 없으면: 요약 자리에 시작 안내(+이동 버튼), 최근 경기·NTRP 영역은 숨긴다.
  if (matches.length === 0) {
    if (summaryEl) {
      summaryEl.innerHTML = "";
      summaryEl.appendChild(createDashboardEmpty());
    }
    if (recentEl) {
      recentEl.innerHTML = "";
    }
    if (recentTitle) {
      recentTitle.hidden = true;
    }
    setNtrpSectionsHidden(true);
    return;
  }

  if (recentTitle) {
    recentTitle.hidden = false;
  }
  setNtrpSectionsHidden(false);

  renderDashboardSummary(matches);
  renderDashboardNtrpSummary(matches);
  renderDashboardNtrpDifficulty(matches);
  renderDashboardNtrpUpset(matches);
  renderDashboardRecent(matches);
}

/*
  [백업/복원] UI 계층
  - 백업: 현재 데이터를 JSON 파일로 다운로드
  - 복원: 파일 선택 → 검증 → 확인 → 저장 → 화면 갱신
  - 검증 실패/취소/오류 시 기존 localStorage 데이터를 건드리지 않는다.
*/

// 데이터 관리 영역의 안내 메시지를 표시한다.
function showBackupMessage(text, type) {
  var el = document.getElementById("data-manage-message");
  if (!el) return;
  el.textContent = text;
  el.classList.remove("is-success", "is-error");
  el.classList.add(type === "success" ? "is-success" : "is-error");
}

// 타임스탬프(ms)를 YYYYMMDD 문자열로 변환한다. (백업 파일명용)
function formatDateStampFromTime(ms) {
  var d = new Date(ms);
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, "0");
  var day = String(d.getDate()).padStart(2, "0");
  return "" + y + m + day;
}

// 타임스탬프(ms)를 YYYY-MM-DD 문자열로 변환한다. (화면 표시용)
function formatDateFromTime(ms) {
  var s = formatDateStampFromTime(ms);
  return s.slice(0, 4) + "-" + s.slice(4, 6) + "-" + s.slice(6, 8);
}

// 데이터 백업: JSON 파일 다운로드 + 마지막 백업 시각 기록.
function downloadBackup() {
  try {
    var data = createBackupData();
    var json = JSON.stringify(data, null, 2);
    var blob = new Blob([json], { type: "application/json" });
    var url = URL.createObjectURL(blob);

    var a = document.createElement("a");
    a.href = url;
    a.download = "tennis-match-backup-" + formatDateStampFromTime(data.exportedAt) + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // 마지막 백업 시각 기록 후 상태 표시 갱신
    saveLastBackupAt(data.exportedAt);
    renderBackupStatus();
    showBackupMessage("백업 파일을 다운로드했습니다.", "success");
  } catch (e) {
    console.warn("백업 오류:", e);
    showBackupMessage("백업 중 오류가 발생했습니다.", "error");
  }
}

// 선택한 파일 내용(text)으로 복원을 수행한다.
function handleRestoreFromText(text) {
  var data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    showBackupMessage("올바른 테니스 경기 백업 파일이 아닙니다.", "error");
    return;
  }

  var result = validateBackupData(data);
  if (!result.ok) {
    showBackupMessage("올바른 테니스 경기 백업 파일이 아닙니다.", "error");
    return;
  }

  // 검증 통과 후에만 확인 → 저장 (여기까지 localStorage는 변경되지 않았음)
  var confirmed = window.confirm("현재 저장된 테니스 경기 기록을 백업 파일의 데이터로 교체합니다. 계속하시겠습니까?");
  if (!confirmed) {
    showBackupMessage("복원을 취소했습니다.", "success");
    return;
  }

  // 원자적 저장 (실패 시 내부에서 롤백)
  var saved = restoreBackup(data);
  if (!saved.ok) {
    showBackupMessage("복원 중 오류가 발생하여 기존 데이터를 유지했습니다.", "error");
    return;
  }

  // 성공 후에만 화면 갱신 (목록·통계·대시보드) + 자동완성 목록 + 제목 갱신
  fillNameDatalists();
  refreshViews();
  renderBackupStatus();
  renderUsernameTitle();
  // NTRP 관련: 복원된 Master 목록과 내 NTRP 설정 UI도 즉시 갱신
  if (typeof renderOpponentMasterList === "function") renderOpponentMasterList();
  if (typeof renderMyNtrp === "function") renderMyNtrp();
  showBackupMessage("데이터를 복원했습니다.", "success");
}

// 마지막 백업 시각과 7일 경과 백업 권장 안내를 표시한다.
function renderBackupStatus() {
  var statusEl = document.getElementById("last-backup-status");
  var noticeEl = document.getElementById("backup-notice");
  if (!statusEl || !noticeEl) return;

  var raw = loadLastBackupAt();
  var lastAt = raw != null ? Number(raw) : NaN;

  if (isNaN(lastAt) || lastAt <= 0) {
    statusEl.textContent = "아직 데이터 백업을 하지 않았습니다.";
  } else {
    statusEl.textContent = "마지막 백업: " + formatDateFromTime(lastAt);
  }

  // 경기 기록이 있고, (백업한 적 없거나) 마지막 백업 후 7일 이상 지났으면 권장 안내
  var hasMatches = loadMatches().length > 0;
  var sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  var overdue = isNaN(lastAt) || lastAt <= 0 || (Date.now() - lastAt >= sevenDaysMs);

  if (hasMatches && overdue && !isNaN(lastAt) && lastAt > 0) {
    noticeEl.textContent = "최근 백업 후 7일이 지났습니다. 데이터를 백업해 주세요.";
    noticeEl.hidden = false;
  } else {
    noticeEl.textContent = "";
    noticeEl.hidden = true;
  }
}

/*
  [사용자명] UI 계층
  - 제목을 "{사용자명}의 게임로그"로 표시 (textContent로 안전하게)
  - 최초 실행 시 사용자명이 없으면 입력 오버레이 표시
  - 개발자의 한마디 아래 "사용자명 수정" 버튼으로 인라인 수정
*/

// 저장된 사용자명으로 대시보드 제목을 갱신한다. (없으면 빈 문자열)
function renderUsernameTitle() {
  var el = document.getElementById("app-title-user");
  if (!el) return;
  var name = loadUsername();
  el.textContent = (name && name.trim() !== "") ? (name + "의 게임로그") : "게임로그";
  // 경기 입력 화면의 "나" 이름도 사용자명과 함께 갱신 (함수 없거나 요소 없으면 내부 가드로 무시)
  if (typeof updateNtrpHints === "function") updateNtrpHints();
}

// 최초 실행: 사용자명이 없으면 입력 오버레이를 표시한다.
function setupUsernameSetup() {
  var overlay = document.getElementById("username-setup");
  var input = document.getElementById("username-input");
  var startButton = document.getElementById("username-start-button");
  var messageEl = document.getElementById("username-setup-message");
  if (!overlay || !input || !startButton) return;

  var existing = loadUsername();
  if (existing && existing.trim() !== "") {
    overlay.hidden = true; // 이미 저장되어 있으면 바로 Dashboard
    return;
  }

  // 사용자명 없음 → 입력 오버레이 표시
  overlay.hidden = false;
  if (messageEl) messageEl.textContent = "";

  function trySave() {
    var value = input.value.trim();
    if (value === "") {
      if (messageEl) messageEl.textContent = "사용자명을 입력해주세요.";
      return;
    }
    saveUsername(value);
    overlay.hidden = true;
    renderUsernameTitle();
  }

  startButton.addEventListener("click", trySave);
  // 엔터로도 시작할 수 있게
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      trySave();
    }
  });
  input.focus();
}

// 사용자명 수정 UI를 연결한다.
function setupUsernameEdit() {
  var editButton = document.getElementById("username-edit-button");
  var form = document.getElementById("username-edit-form");
  var currentValue = document.getElementById("username-current-value");
  var input = document.getElementById("username-edit-input");
  var saveButton = document.getElementById("username-save-button");
  var cancelButton = document.getElementById("username-cancel-button");
  var messageEl = document.getElementById("username-edit-message");
  if (!editButton || !form) return;

  // "사용자명 수정" 버튼 → 현재 값 채우고 폼 표시
  editButton.addEventListener("click", function () {
    var name = loadUsername() || "";
    if (currentValue) currentValue.textContent = name;
    if (input) input.value = name;
    if (messageEl) messageEl.textContent = "";
    form.hidden = false;
    editButton.hidden = true;
    if (input) input.focus();
  });

  // 저장
  if (saveButton && input) {
    saveButton.addEventListener("click", function () {
      var value = input.value.trim();
      if (value === "") {
        if (messageEl) messageEl.textContent = "사용자명을 입력해주세요.";
        return;
      }
      saveUsername(value);
      renderUsernameTitle();     // 제목 즉시 변경
      form.hidden = true;
      editButton.hidden = false;
    });
  }

  // 취소: 기존 사용자명 유지
  if (cancelButton) {
    cancelButton.addEventListener("click", function () {
      form.hidden = true;
      editButton.hidden = false;
    });
  }
}

// 데이터 관리 버튼과 파일 입력에 이벤트를 연결한다.
function setupDataManage() {
  var backupButton = document.getElementById("backup-button");
  var restoreButton = document.getElementById("restore-button");
  var restoreFile = document.getElementById("restore-file");

  if (backupButton) {
    backupButton.addEventListener("click", downloadBackup);
  }

  // "데이터 복원" 버튼 → 숨은 파일 선택창 열기
  if (restoreButton && restoreFile) {
    restoreButton.addEventListener("click", function () {
      restoreFile.value = ""; // 같은 파일 재선택도 인식되도록 초기화
      restoreFile.click();
    });

    restoreFile.addEventListener("change", function () {
      var file = restoreFile.files && restoreFile.files[0];
      if (!file) return;

      var reader = new FileReader();
      reader.onload = function () {
        handleRestoreFromText(String(reader.result));
      };
      reader.onerror = function () {
        showBackupMessage("파일을 읽는 중 오류가 발생했습니다.", "error");
      };
      reader.readAsText(file);
    });
  }
}

// 페이지가 준비되면 초기화한다.
document.addEventListener("DOMContentLoaded", function () {
  ensureSchemaVersion(); // 스키마 버전이 없으면 기록 (Task 3)
  setupTabs();
  activateTab("dashboard");

  // Task 5: 경기 입력 폼 초기화
  setDefaultDate();
  fillNameDatalists();
  setupScoreInputs();

  // Task 6: 폼 저장 로직 연결
  setupMatchForm();

  // Task 7: 경기 목록 초기 렌더링
  renderMatchList();

  // Task 12: 통계 초기 렌더링
  renderStats();

  // Task 13: 대시보드 초기 렌더링 (첫 화면)
  renderDashboard();

  // 데이터 백업/복원 버튼 연결 + 마지막 백업 상태 표시
  setupDataManage();
  renderBackupStatus();

  // 사용자명: 제목 표시 + 최초 입력 + 수정 UI 연결
  renderUsernameTitle();
  setupUsernameSetup();
  setupUsernameEdit();

  // 상대방 Master + NTRP: 관리 UI 연결 + 경기 입력 NTRP 힌트 연결
  setupOpponentMaster();
  setupMyNtrp();
  setupNtrpHints();
});

// 파일이 정상적으로 연결되었는지 콘솔에 표시
console.log("테니스 복식 기록 앱 - 파일 로드 완료");
