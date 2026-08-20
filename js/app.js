/**
 * app.js - G-Navi 앱 초기화 및 이벤트 바인딩
 */

// 상태
let _startCoords = null;
let _endCoords = null;
let _waypointItems = []; // 파싱된 주소 목록 [{address, memo}]
let _geocodedWaypoints = []; // 지오코딩 완료 [{lat, lng, address, memo, error}]

/**
 * 현재 선택된 출발/도착 모드
 */
function getDestMode() {
  return document.querySelector('input[name="dest-mode"]:checked').value;
}

/**
 * 앱 초기화 (Kakao Maps 로드 완료 후 호출)
 */
function initApp() {
  initMap();
  bindEvents();
  loadSavedSettings();
  // 기본 출발지 설정
  document.getElementById('input-start').value = CONFIG.DEFAULT_START;
}

/**
 * 이벤트 바인딩
 */
function bindEvents() {
  // 출발지 검색
  document.getElementById('btn-search-start').addEventListener('click', searchStart);
  document.getElementById('input-start').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') searchStart();
  });

  // 출발/도착 모드 변경
  document.querySelectorAll('input[name="dest-mode"]').forEach(radio => {
    radio.addEventListener('change', onDestModeChange);
  });

  // 목적지 검색
  document.getElementById('btn-search-end').addEventListener('click', searchEnd);
  document.getElementById('input-end').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') searchEnd();
  });

  // 엑셀 업로드
  document.getElementById('input-excel').addEventListener('change', handleExcelUpload);

  // 드래그앤드롭
  const dropZone = document.getElementById('drop-zone');
  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', handleDrop);

  // 수동 주소 추가
  document.getElementById('btn-add-address').addEventListener('click', addManualAddress);
  document.getElementById('input-manual-address').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addManualAddress();
  });

  // 경로 계산
  document.getElementById('btn-calculate').addEventListener('click', calculateRoute);

  // 엑셀 양식 다운로드
  document.getElementById('btn-template').addEventListener('click', downloadTemplate);

  // 경유지 초기화
  document.getElementById('btn-clear-waypoints').addEventListener('click', clearWaypoints);

  // 이동수단 변경 시 혼합 모드 설명 표시
  document.querySelectorAll('input[name="transport"]').forEach(radio => {
    radio.addEventListener('change', () => {
      document.getElementById('mixed-desc').style.display =
        radio.value === 'MIXED' ? '' : 'none';
    });
  });
}

/**
 * 출발/도착 모드 변경 시 UI 갱신
 */
function onDestModeChange() {
  const mode = getDestMode();
  const startInputGroup = document.getElementById('start-input-group');
  const endInputGroup = document.getElementById('end-input-group');
  const excelBothDesc = document.getElementById('excel-both-desc');
  const excelDestDesc = document.getElementById('excel-dest-desc');
  const endStatus = document.getElementById('end-status');

  // 모두 숨김
  startInputGroup.style.display = 'none';
  endInputGroup.style.display = 'none';
  excelBothDesc.style.display = 'none';
  excelDestDesc.style.display = 'none';
  endStatus.textContent = '';

  switch (mode) {
    case 'roundtrip':
      // 출발지 입력만 표시, 목적지 = 출발지
      startInputGroup.style.display = '';
      if (_startCoords) {
        _endCoords = { ..._startCoords };
        endStatus.textContent = `목적지: ${_startCoords.address} (출발지 동일)`;
        endStatus.className = 'form-text text-success';
      }
      break;

    case 'excel-both':
      // 출발지/목적지 모두 엑셀에서
      excelBothDesc.style.display = '';
      updateExcelBothPreview();
      break;

    case 'excel-dest':
      // 출발지 입력 + 목적지는 엑셀 마지막
      startInputGroup.style.display = '';
      excelDestDesc.style.display = '';
      updateExcelDestPreview();
      break;

    case 'manual':
      // 출발지/목적지 각각 입력
      startInputGroup.style.display = '';
      endInputGroup.style.display = '';
      break;
  }

  // 출발지 상태 복원 (출발지 입력 표시 모드)
  if (mode !== 'excel-both') {
    const startStatus = document.getElementById('start-status');
    if (_startCoords) {
      startStatus.textContent = `확인: ${_startCoords.address}`;
      startStatus.className = 'form-text text-success';
    } else {
      startStatus.textContent = '';
      startStatus.className = 'form-text text-muted';
    }
  }

  saveSettings();
}

/**
 * 엑셀 기준 출발/도착 미리보기
 */
function updateExcelBothPreview() {
  if (getDestMode() !== 'excel-both') return;

  const valid = _geocodedWaypoints.filter(w => !w.error);
  const excelStartStatus = document.getElementById('excel-start-status');
  const endStatus = document.getElementById('end-status');

  if (valid.length >= 2) {
    const first = valid[0];
    const last = valid[valid.length - 1];
    excelStartStatus.textContent = `출발: ${first.originalAddress || first.address}`;
    excelStartStatus.className = 'form-text text-success';
    endStatus.textContent = `도착: ${last.originalAddress || last.address}`;
    endStatus.className = 'form-text text-success';
  } else if (valid.length === 1) {
    excelStartStatus.textContent = `${valid[0].originalAddress || valid[0].address}`;
    excelStartStatus.className = 'form-text text-warning';
    endStatus.textContent = '엑셀 주소가 2건 이상 필요합니다';
    endStatus.className = 'form-text text-warning';
  } else {
    excelStartStatus.textContent = '엑셀 파일을 먼저 업로드하세요';
    excelStartStatus.className = 'form-text text-muted';
    endStatus.textContent = '';
  }
}

/**
 * 엑셀 마지막 주소를 목적지로 미리보기
 */
function updateExcelDestPreview() {
  if (getDestMode() !== 'excel-dest') return;

  const valid = _geocodedWaypoints.filter(w => !w.error);
  const endStatus = document.getElementById('end-status');

  if (valid.length >= 1) {
    const last = valid[valid.length - 1];
    endStatus.textContent = `목적지: ${last.originalAddress || last.address} (엑셀 마지막)`;
    endStatus.className = 'form-text text-success';
  } else {
    endStatus.textContent = '엑셀 파일을 먼저 업로드하세요';
    endStatus.className = 'form-text text-muted';
  }
}

/**
 * 엑셀 관련 미리보기 통합 갱신
 */
function updateExcelPreview() {
  const mode = getDestMode();
  if (mode === 'excel-both') updateExcelBothPreview();
  else if (mode === 'excel-dest') updateExcelDestPreview();
}

/**
 * 출발지 검색 → 후보 목록 표시
 */
async function searchStart() {
  const address = document.getElementById('input-start').value.trim();
  if (!address) { showToast('출발지 주소를 입력해주세요.'); return; }

  const statusEl = document.getElementById('start-status');
  const candidatesEl = document.getElementById('start-candidates');
  statusEl.textContent = '검색 중...';
  statusEl.className = 'form-text text-muted';
  candidatesEl.style.display = 'none';

  try {
    const candidates = await searchAddressCandidates(address);
    if (candidates.length === 0) {
      statusEl.textContent = '검색 결과가 없습니다.';
      statusEl.className = 'form-text text-danger';
      return;
    }
    if (candidates.length === 1) {
      // 결과가 1개면 바로 선택
      selectStartCandidate(candidates[0]);
      return;
    }
    // 후보 목록 표시
    renderCandidates(candidatesEl, candidates, selectStartCandidate);
    statusEl.textContent = `${candidates.length}건 검색됨 - 선택하세요`;
    statusEl.className = 'form-text text-primary';
  } catch (err) {
    statusEl.textContent = err.message;
    statusEl.className = 'form-text text-danger';
  }
}

/**
 * 출발지 후보 선택
 */
function selectStartCandidate(candidate) {
  _startCoords = { lat: candidate.lat, lng: candidate.lng, address: candidate.address };
  document.getElementById('input-start').value = candidate.address;
  document.getElementById('start-status').textContent = `확인: ${candidate.address}`;
  document.getElementById('start-status').className = 'form-text text-success';
  document.getElementById('start-candidates').style.display = 'none';

  // 왕복 모드면 목적지도 갱신
  if (getDestMode() === 'roundtrip') {
    _endCoords = { ..._startCoords };
    document.getElementById('end-status').textContent = `목적지: ${_endCoords.address} (출발지 동일)`;
    document.getElementById('end-status').className = 'form-text text-success';
  }

  updateMapPreview();
  saveSettings();
}

/**
 * 목적지 검색 → 후보 목록 표시
 */
async function searchEnd() {
  const address = document.getElementById('input-end').value.trim();
  if (!address) { showToast('목적지 주소를 입력해주세요.'); return; }

  const statusEl = document.getElementById('end-status');
  const candidatesEl = document.getElementById('end-candidates');
  statusEl.textContent = '검색 중...';
  statusEl.className = 'form-text text-muted';
  candidatesEl.style.display = 'none';

  try {
    const candidates = await searchAddressCandidates(address);
    if (candidates.length === 0) {
      statusEl.textContent = '검색 결과가 없습니다.';
      statusEl.className = 'form-text text-danger';
      return;
    }
    if (candidates.length === 1) {
      selectEndCandidate(candidates[0]);
      return;
    }
    renderCandidates(candidatesEl, candidates, selectEndCandidate);
    statusEl.textContent = `${candidates.length}건 검색됨 - 선택하세요`;
    statusEl.className = 'form-text text-primary';
  } catch (err) {
    statusEl.textContent = err.message;
    statusEl.className = 'form-text text-danger';
  }
}

/**
 * 목적지 후보 선택
 */
function selectEndCandidate(candidate) {
  _endCoords = { lat: candidate.lat, lng: candidate.lng, address: candidate.address };
  document.getElementById('input-end').value = candidate.address;
  document.getElementById('end-status').textContent = `확인: ${candidate.address}`;
  document.getElementById('end-status').className = 'form-text text-success';
  document.getElementById('end-candidates').style.display = 'none';
  updateMapPreview();
}

/**
 * 후보 목록 렌더링
 */
function renderCandidates(container, candidates, onSelect) {
  container.innerHTML = candidates.map((c, i) => {
    const name = c.placeName ? `<div class="candidate-name">${escapeHtml(c.placeName)}</div>` : '';
    return `<div class="search-candidate-item" data-index="${i}">
      ${name}
      <div class="candidate-addr">${escapeHtml(c.address)}</div>
    </div>`;
  }).join('');

  container.style.display = '';

  // 클릭 이벤트
  container.querySelectorAll('.search-candidate-item').forEach(item => {
    item.addEventListener('click', () => {
      const idx = parseInt(item.dataset.index);
      onSelect(candidates[idx]);
    });
  });
}

/**
 * 엑셀 파일 업로드 처리
 */
async function handleExcelUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  await loadExcelFile(file);
}

/**
 * 드래그앤드롭 처리
 */
async function handleDrop(e) {
  e.preventDefault();
  document.getElementById('drop-zone').classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (!file) return;
  if (!file.name.match(/\.xlsx?$/i)) {
    showToast('엑셀 파일(.xlsx)만 지원합니다.');
    return;
  }
  await loadExcelFile(file);
}

/**
 * 엑셀 파일 로드 공통
 */
async function loadExcelFile(file) {
  const statusEl = document.getElementById('waypoint-status');
  statusEl.textContent = '파일 읽는 중...';

  try {
    const items = await parseExcelFile(file);
    _waypointItems = items;
    statusEl.textContent = `${items.length}건 로드 완료. 지오코딩 중...`;

    // 지오코딩
    _geocodedWaypoints = await geocodeMultiple(items, (current, total) => {
      statusEl.textContent = `지오코딩 ${current}/${total}건...`;
    });

    const errorCount = _geocodedWaypoints.filter(w => w.error).length;
    const successCount = _geocodedWaypoints.length - errorCount;
    statusEl.textContent = `완료: ${successCount}건 성공${errorCount > 0 ? `, ${errorCount}건 실패` : ''}`;

    renderWaypointList();
    updateMapPreview();
    updateExcelPreview();
  } catch (err) {
    statusEl.textContent = err.message;
  }
}

/**
 * 수동 주소 추가
 */
async function addManualAddress() {
  const input = document.getElementById('input-manual-address');
  const address = input.value.trim();
  if (!address) return;

  const statusEl = document.getElementById('waypoint-status');
  statusEl.textContent = '주소 확인 중...';

  try {
    const coords = await geocodeAddress(address);
    _waypointItems.push({ address, memo: '' });
    _geocodedWaypoints.push({ ...coords, memo: '', originalAddress: address, error: null });
    input.value = '';
    statusEl.textContent = `${_geocodedWaypoints.filter(w => !w.error).length}건 등록됨`;
    renderWaypointList();
    updateMapPreview();
    updateExcelPreview();
  } catch (err) {
    statusEl.textContent = err.message;
  }
}

/**
 * 경유지 목록 렌더링
 */
function renderWaypointList() {
  const list = document.getElementById('waypoint-preview-list');
  if (_geocodedWaypoints.length === 0) {
    list.innerHTML = '<div class="text-muted small text-center p-2">경유지가 없습니다</div>';
    return;
  }

  list.innerHTML = _geocodedWaypoints.map((wp, i) => {
    const statusIcon = wp.error
      ? '<span class="text-danger" title="주소 변환 실패">&#10008;</span>'
      : '<span class="text-success">&#10004;</span>';
    const memo = wp.memo ? ` <span class="text-muted small">(${escapeHtml(wp.memo)})</span>` : '';
    return `<div class="waypoint-item d-flex align-items-center gap-2 py-1 px-2 border-bottom">
      ${statusIcon}
      <span class="small flex-fill">${escapeHtml(wp.originalAddress || wp.address)}${memo}</span>
      <button class="btn btn-sm btn-outline-danger py-0 px-1" onclick="removeWaypoint(${i})" title="삭제">&times;</button>
    </div>`;
  }).join('');
}

/**
 * 경유지 삭제
 */
function removeWaypoint(index) {
  _waypointItems.splice(index, 1);
  _geocodedWaypoints.splice(index, 1);
  renderWaypointList();
  updateMapPreview();
  updateExcelPreview();
  document.getElementById('waypoint-status').textContent =
    `${_geocodedWaypoints.filter(w => !w.error).length}건 등록됨`;
}

/**
 * 경유지 초기화
 */
function clearWaypoints() {
  _waypointItems = [];
  _geocodedWaypoints = [];
  renderWaypointList();
  updateMapPreview();
  updateExcelPreview();
  document.getElementById('waypoint-status').textContent = '';
  document.getElementById('input-excel').value = '';
}

/**
 * 지도 미리보기 갱신 (경로 계산 전)
 */
function updateMapPreview() {
  const validWaypoints = _geocodedWaypoints.filter(w => !w.error);
  displayPoints(_startCoords, _endCoords, validWaypoints);
}

/**
 * 경로 계산 실행
 */
async function calculateRoute() {
  const mode = getDestMode();
  let startPoint, endPoint, waypoints;
  const valid = _geocodedWaypoints.filter(w => !w.error);

  switch (mode) {
    case 'roundtrip':
      // 출발지=목적지 왕복
      if (!_startCoords) { showToast('출발지를 먼저 검색해주세요.'); return; }
      startPoint = _startCoords;
      endPoint = { ..._startCoords };
      waypoints = valid;
      break;

    case 'excel-both':
      // 엑셀 첫 번째=출발, 마지막=도착
      if (valid.length < 2) { showToast('엑셀 주소가 2건 이상 필요합니다.'); return; }
      startPoint = valid[0];
      endPoint = valid[valid.length - 1];
      waypoints = valid.slice(1, -1);
      break;

    case 'excel-dest':
      // 출발지 직접 입력 + 엑셀 마지막=도착
      if (!_startCoords) { showToast('출발지를 먼저 검색해주세요.'); return; }
      if (valid.length === 0) { showToast('경유지를 추가해주세요.'); return; }
      startPoint = _startCoords;
      endPoint = valid[valid.length - 1];
      waypoints = valid.slice(0, -1);
      break;

    case 'manual':
      // 출발지/목적지 각각 직접 입력
      if (!_startCoords) { showToast('출발지를 먼저 검색해주세요.'); return; }
      if (!_endCoords) { showToast('목적지를 검색해주세요.'); return; }
      startPoint = _startCoords;
      endPoint = _endCoords;
      waypoints = valid;
      break;
  }

  const btn = document.getElementById('btn-calculate');
  btn.disabled = true;
  btn.textContent = '계산 중...';

  try {
    // TSP 계산
    const result = solveTSP(startPoint, endPoint, waypoints);

    // 이동수단
    const transport = document.querySelector('input[name="transport"]:checked').value;

    // 구간 분할
    const segments = buildRouteSegments(startPoint, endPoint, result.orderedWaypoints, transport);

    // 지도 표시
    displayRoute(startPoint, endPoint, result.orderedWaypoints);

    // 패널 렌더링
    renderRoutePanel(startPoint, endPoint, result.orderedWaypoints, result.totalDistance, segments);

    // 결과 패널 표시
    document.getElementById('route-panel').classList.remove('d-none');
  } catch (err) {
    showToast('경로 계산 오류: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '경로 계산';
  }
}

/**
 * 설정 저장 (localStorage)
 */
function saveSettings() {
  try {
    localStorage.setItem('gnavi-start', document.getElementById('input-start').value);
    localStorage.setItem('gnavi-dest-mode', getDestMode());
  } catch { /* 무시 */ }
}

/**
 * 설정 복원
 */
function loadSavedSettings() {
  try {
    const savedStart = localStorage.getItem('gnavi-start');
    if (savedStart) document.getElementById('input-start').value = savedStart;

    const savedMode = localStorage.getItem('gnavi-dest-mode');
    if (savedMode) {
      const radio = document.getElementById({
        'roundtrip': 'mode-roundtrip',
        'excel-both': 'mode-excel-both',
        'excel-dest': 'mode-excel-dest',
        'manual': 'mode-manual'
      }[savedMode]);
      if (radio) {
        radio.checked = true;
        onDestModeChange();
      }
    } else {
      // 기본 모드 UI 적용
      onDestModeChange();
    }
  } catch { /* 무시 */ }
}

/**
 * 설정 모달 열기
 */
function openSettings() {
  const modal = document.getElementById('settings-modal');
  // 현재 값 채우기
  document.getElementById('setting-js-key').value =
    localStorage.getItem('gnavi-kakao-key') || CONFIG.KAKAO_API_KEY || '';
  document.getElementById('setting-rest-key').value =
    localStorage.getItem('gnavi-rest-key') || CONFIG.KAKAO_REST_KEY || '';
  document.getElementById('setting-default-start').value =
    localStorage.getItem('gnavi-default-start') || CONFIG.DEFAULT_START || '';
  modal.style.display = 'flex';
}

/**
 * 설정 모달 닫기
 */
function closeSettings() {
  document.getElementById('settings-modal').style.display = 'none';
}

/**
 * 설정 저장 후 새로고침
 */
function saveSettingsModal() {
  const jsKey = document.getElementById('setting-js-key').value.trim();
  const restKey = document.getElementById('setting-rest-key').value.trim();
  const defaultStart = document.getElementById('setting-default-start').value.trim();

  if (jsKey) localStorage.setItem('gnavi-kakao-key', jsKey);
  if (restKey) localStorage.setItem('gnavi-rest-key', restKey);
  if (defaultStart) localStorage.setItem('gnavi-default-start', defaultStart);

  showToast('설정이 저장되었습니다. 새로고침합니다...');
  setTimeout(() => location.reload(), 500);
}
