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
  schemaVersion: "tennis_schema_version"
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
  return {
    matchId: createMatchId(),
    createdAt: createCreatedAt(),
    date: formData.date,
    type: MATCH_TYPE_DOUBLES,
    venue: normalizeName(formData.venue),
    partner: normalizeName(formData.partner),
    opponent1: normalizeName(formData.opponent1),
    opponent2: normalizeName(formData.opponent2),
    result: formData.result, // "W" 또는 "L"
    score: formData.score,
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
  return {
    matchId: existingMatch.matchId,     // 유지
    createdAt: existingMatch.createdAt, // 유지
    date: formData.date,
    type: MATCH_TYPE_DOUBLES,
    venue: normalizeName(formData.venue),
    partner: normalizeName(formData.partner),
    opponent1: normalizeName(formData.opponent1),
    opponent2: normalizeName(formData.opponent2),
    result: formData.result,
    score: formData.score,
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
// 반환 예: 3승 4경기 -> 75 (숫자), 0경기 -> "-"
function calcWinRate(wins, total) {
  if (!total || total <= 0) {
    return "-";
  }
  return Math.round((wins / total) * 100);
}

// 경기 배열에서 승(W)/패(L) 개수를 센다. { wins, losses } 반환.
function countResults(matches) {
  var wins = 0;
  var losses = 0;
  (matches || []).forEach(function (m) {
    if (m.result === "W") {
      wins++;
    } else if (m.result === "L") {
      losses++;
    }
  });
  return { wins: wins, losses: losses };
}

// 전체 통계: 총 경기 수, 승, 패, 승률.
// 반환 예: { total: 4, wins: 3, losses: 1, winRate: 75 }
function calcTotals(matches) {
  var list = Array.isArray(matches) ? matches : [];
  var counts = countResults(list);
  var total = list.length;
  return {
    total: total,
    wins: counts.wins,
    losses: counts.losses,
    winRate: calcWinRate(counts.wins, total)
  };
}

// 최근 n경기 성적. 최근 우선 정렬 후 앞에서 n개를 집계한다.
// 경기 수가 n보다 적으면 있는 만큼만 계산한다.
// 반환 예: { count: 5, wins: 3, losses: 2, winRate: 60 }
function calcRecent(matches, n) {
  var sorted = sortMatchesByRecent(matches);
  var recent = sorted.slice(0, n);
  var counts = countResults(recent);
  return {
    count: recent.length,
    wins: counts.wins,
    losses: counts.losses,
    winRate: calcWinRate(counts.wins, recent.length)
  };
}

// 현재 연승/연패. 최근 경기부터 같은 결과가 연속되는 개수를 센다.
// 반환: { type: "win" | "loss" | "none", count: 숫자 }
//   - type "win"  => count 연승
//   - type "loss" => count 연패
//   - 경기가 없으면 { type: "none", count: 0 }
function calcStreak(matches) {
  var sorted = sortMatchesByRecent(matches);
  if (sorted.length === 0) {
    return { type: "none", count: 0 };
  }

  var firstResult = sorted[0].result; // 가장 최근 경기 결과
  var count = 0;

  for (var i = 0; i < sorted.length; i++) {
    if (sorted[i].result === firstResult) {
      count++;
    } else {
      break; // 결과가 바뀌면 멈춤
    }
  }

  var type = firstResult === "W" ? "win" : (firstResult === "L" ? "loss" : "none");
  return { type: type, count: count };
}

// 월별 통계: 경기 날짜의 YYYY-MM으로 그룹화해 월별 경기 수와 승률을 계산한다.
// 최근 월이 위로 오도록 내림차순 정렬한 배열을 반환한다.
// 반환 예: [ { month: "2026-09", total: 3, wins: 2, losses: 1, winRate: 67 }, ... ]
function calcMonthly(matches) {
  var list = Array.isArray(matches) ? matches : [];
  var groups = {}; // { "2026-09": { total, wins, losses } }

  list.forEach(function (m) {
    var date = m.date || "";
    var month = date.slice(0, 7); // "YYYY-MM"
    if (month === "") {
      return;
    }
    if (!groups[month]) {
      groups[month] = { total: 0, wins: 0, losses: 0 };
    }
    groups[month].total++;
    if (m.result === "W") {
      groups[month].wins++;
    } else if (m.result === "L") {
      groups[month].losses++;
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
      winRate: calcWinRate(g.wins, g.total)
    };
  });

  result.sort(function (a, b) {
    if (a.month > b.month) return -1;
    if (a.month < b.month) return 1;
    return 0;
  });

  return result;
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
      winRate: calcWinRate(g.wins, g.total)
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

// [내부 공통] 특정 이름 그룹에 경기 한 건의 결과(W/L)를 반영한다.
function addResultToGroup(groups, name, result) {
  if (!groups[name]) {
    groups[name] = { total: 0, wins: 0, losses: 0 };
  }
  groups[name].total++;
  if (result === "W") {
    groups[name].wins++;
  } else if (result === "L") {
    groups[name].losses++;
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

// 승/패 버튼 동작을 설정한다.
// - 버튼을 누르면 그 버튼만 선택 표시(is-selected)하고, 숨은 input(result)에 W/L을 저장한다.
function setupResultButtons() {
  var resultButtons = document.querySelectorAll(".result-button");
  var resultInput = document.getElementById("input-result");

  resultButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      resultButtons.forEach(function (b) {
        b.classList.remove("is-selected");
      });
      button.classList.add("is-selected");
      if (resultInput) {
        resultInput.value = button.dataset.result; // "W" 또는 "L"
      }
    });
  });
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
    score: document.getElementById("input-score").value,
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

  // 승/패 버튼 선택 해제 + 숨은 결과값 비우기
  document.querySelectorAll(".result-button").forEach(function (b) {
    b.classList.remove("is-selected");
  });
  var resultInput = document.getElementById("input-result");
  if (resultInput) {
    resultInput.value = "";
  }
}

// 현재 수정 중인 경기의 matchId. 신규 입력 모드면 null.
var editingMatchId = null;

// 저장(제출) 시 실행. 수정 모드면 갱신, 아니면 신규 등록한다.
function handleSaveMatch() {
  var formData = readMatchForm();

  // --- 필수 항목 검증 (날짜, 경기 결과) ---
  if (formData.date === "") {
    showFormMessage("경기 날짜를 입력해주세요.", "error");
    return;
  }
  if (formData.result !== "W" && formData.result !== "L") {
    showFormMessage("경기 결과(승/패)를 선택해주세요.", "error");
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
  document.getElementById("input-score").value = match.score || "";
  document.getElementById("input-duration").value = match.duration || "";
  document.getElementById("input-memo").value = match.memo || "";

  // 승/패 버튼 상태 반영
  var resultInput = document.getElementById("input-result");
  if (resultInput) {
    resultInput.value = match.result || "";
  }
  document.querySelectorAll(".result-button").forEach(function (b) {
    if (b.dataset.result === match.result) {
      b.classList.add("is-selected");
    } else {
      b.classList.remove("is-selected");
    }
  });
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

// 승/패 코드(W/L)를 사람이 읽기 쉬운 문구로 바꾼다.
function resultToLabel(result) {
  if (result === "W") return "승리";
  if (result === "L") return "패배";
  return "";
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
  // 승/패에 따라 색 구분 클래스 부여 (텍스트도 함께 표시)
  resultEl.className = "match-result " + (match.result === "W" ? "is-win" : "is-loss");
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
  card.appendChild(createInfoRow("스코어", match.score || ""));
  card.appendChild(createInfoRow("시간", match.duration || ""));
  card.appendChild(createInfoRow("메모", match.memo || ""));

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

  // 정렬된 순서대로 카드 추가
  matches.forEach(function (match) {
    listEl.appendChild(createMatchCard(match));
  });
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

// 최근 n경기 결과를 "3승 2패" 형태로 바꾼다.
function recentToText(recent) {
  if (!recent || recent.count === 0) {
    return "-";
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
  grid.appendChild(createStatCard("승 / 패", totals.wins + " / " + totals.losses));
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
  table.appendChild(createTableHead(["월", "경기", "승", "패", "승률"]));

  var tbody = document.createElement("tbody");
  rows.forEach(function (r) {
    tbody.appendChild(createTableRow([
      r.month,
      String(r.total),
      String(r.wins),
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
  table.appendChild(createTableHead([firstColumnLabel, "경기", "승", "패", "승률"]));

  var tbody = document.createElement("tbody");
  rows.forEach(function (r) {
    tbody.appendChild(createTableRow([
      r.name,
      String(r.total),
      String(r.wins),
      String(r.losses),
      formatWinRate(r.winRate)
    ]));
  });
  table.appendChild(tbody);
  el.appendChild(table);
}

// 통계 탭 전체를 그린다. 기록이 없으면 전체 안내만 표시한다.
function renderStats() {
  var matches = loadMatches();

  renderOverallStats(matches);
  renderMonthlyStats(matches);
  renderNameStatsTable("stats-partner", calcByPartner(matches), "파트너", "표시할 파트너 통계가 없습니다.");
  renderNameStatsTable("stats-opponent", calcByOpponent(matches), "상대", "표시할 상대 통계가 없습니다.");
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
  grid.appendChild(createStatCard("승 / 패", totals.wins + " / " + totals.losses));
  grid.appendChild(createStatCard("승률", formatWinRate(totals.winRate)));
  grid.appendChild(createStatCard("연승/연패", streakToText(streak)));

  el.appendChild(grid);
}

// 최근 경기 한 건을 간단한 요약 줄로 만든다. (값은 textContent로 안전)
function createRecentMatchLine(match) {
  var line = document.createElement("div");
  line.className = "recent-line";

  // 승/패 배지
  var badge = document.createElement("span");
  badge.className = "recent-badge " + (match.result === "W" ? "is-win" : "is-loss");
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

  // 기록이 하나도 없으면: 요약 자리에 시작 안내(+이동 버튼), 최근 경기 영역은 숨긴다.
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
    return;
  }

  if (recentTitle) {
    recentTitle.hidden = false;
  }
  renderDashboardSummary(matches);
  renderDashboardRecent(matches);
}

// 페이지가 준비되면 초기화한다.
document.addEventListener("DOMContentLoaded", function () {
  ensureSchemaVersion(); // 스키마 버전이 없으면 기록 (Task 3)
  setupTabs();
  activateTab("dashboard");

  // Task 5: 경기 입력 폼 초기화
  setDefaultDate();
  fillNameDatalists();
  setupResultButtons();

  // Task 6: 폼 저장 로직 연결
  setupMatchForm();

  // Task 7: 경기 목록 초기 렌더링
  renderMatchList();

  // Task 12: 통계 초기 렌더링
  renderStats();

  // Task 13: 대시보드 초기 렌더링 (첫 화면)
  renderDashboard();
});

// 파일이 정상적으로 연결되었는지 콘솔에 표시
console.log("테니스 복식 기록 앱 - 파일 로드 완료");
