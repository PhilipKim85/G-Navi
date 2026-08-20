/**
 * route-panel.js - 경로 결과 패널 UI + 경로표 출력
 */

// 현재 경로 계산 결과 상태
let _routeState = null;

/**
 * 경로 결과 패널 렌더링
 */
function renderRoutePanel(start, end, orderedWaypoints, totalDistance, segments) {
  _routeState = { start, end, orderedWaypoints, totalDistance, segments };

  const panel = document.getElementById('route-panel');
  const transport = document.querySelector('input[name="transport"]:checked').value;
  const transportLabel = { 'CAR': '자동차', 'PUBLICTRANSIT': '대중교통', 'FOOT': '도보', 'MIXED': '혼합' }[transport] || transport;

  let html = `
    <div class="route-summary mb-3">
      <div class="d-flex justify-content-between align-items-center mb-2">
        <strong>경로 결과</strong>
        <span class="badge bg-primary">${transportLabel}</span>
      </div>
      <div class="text-muted small">
        경유지 ${orderedWaypoints.length}곳 | 총 직선거리 약 ${totalDistance.toFixed(1)}km
      </div>
    </div>
    <div class="route-list mb-3">
  `;

  // 출발지
  html += `<div class="route-item route-start">
    <span class="route-badge bg-success">S</span>
    <span class="route-address">${escapeHtml(start.address)}</span>
  </div>`;

  // 경유지 (드래그 정렬용)
  html += `<div id="waypoint-list">`;
  orderedWaypoints.forEach((wp, i) => {
    const displayAddr = wp.originalAddress || wp.address;
    const memo = wp.memo ? `<span class="route-memo text-muted">${escapeHtml(wp.memo)}</span>` : '';
    const segLabel = segments.length > 1
      ? `<span class="badge bg-secondary badge-seg">${findSegmentLabel(i, segments)}</span>`
      : '';
    html += `<div class="route-item route-waypoint" data-index="${i}" draggable="true">
      <span class="route-badge bg-primary">${i + 1}</span>
      <span class="route-address">${escapeHtml(displayAddr)}${memo}</span>
      ${segLabel}
      <span class="route-drag-handle" title="드래그하여 순서 변경">&#x2630;</span>
    </div>`;
  });
  html += `</div>`;

  // 목적지
  html += `<div class="route-item route-end">
    <span class="route-badge bg-danger">E</span>
    <span class="route-address">${escapeHtml(end.address)}</span>
  </div>`;

  html += `</div>`; // .route-list

  // 구간별 네이버 길찾기 버튼
  html += `<div class="share-section mb-3">`;
  if (segments.length === 1) {
    html += `<div class="d-flex gap-1 mb-1">
      <button class="btn btn-success btn-sm flex-fill" onclick="openNaverMap(0)">
        네이버 길찾기</button>
      <button class="btn btn-outline-success btn-sm" onclick="copySegmentLink(0)">복사</button>
      <button class="btn btn-outline-dark btn-sm" onclick="showQRCode(0)">QR</button>
    </div>`;
  } else {
    segments.forEach((seg, i) => {
      const wpLabels = seg.waypoints.map((_, j) => {
        const globalIdx = orderedWaypoints.indexOf(seg.waypoints[j]);
        return globalIdx >= 0 ? `${globalIdx + 1}` : '?';
      }).join('\u2192');
      const startLabel = seg.start === start ? 'S' : orderedWaypoints.indexOf(seg.start) >= 0 ? `${orderedWaypoints.indexOf(seg.start) + 1}` : '?';
      const endLabel = seg.end === end ? 'E' : orderedWaypoints.indexOf(seg.end) >= 0 ? `${orderedWaypoints.indexOf(seg.end) + 1}` : '?';
      html += `<div class="segment-group mb-2">
        <div class="small text-muted mb-1">${seg.label}: ${startLabel}\u2192${wpLabels ? wpLabels + '\u2192' : ''}${endLabel}</div>
        <div class="d-flex gap-1">
          <button class="btn btn-success btn-sm flex-fill" onclick="openNaverMap(${i})">
            ${seg.label} 길찾기</button>
          <button class="btn btn-outline-success btn-sm" onclick="copySegmentLink(${i})">복사</button>
          <button class="btn btn-outline-dark btn-sm" onclick="showQRCode(${i})">QR</button>
        </div>
      </div>`;
    });
  }
  html += `</div>`;
  html += `<div class="text-muted small mb-2" style="font-size:0.75rem;">※ 대중교통은 경유지 입력 길찾기가 불가능합니다</div>`;

  // 경로표 출력 / 이메일 버튼
  html += `<div class="d-flex gap-2 mb-2">
    <button class="btn btn-outline-secondary btn-sm flex-fill" onclick="printRouteSheet()">
      경로표 인쇄</button>
    <button class="btn btn-outline-success btn-sm flex-fill" onclick="exportRouteExcel()">
      경로표 엑셀</button>
  </div>
  <button class="btn btn-outline-primary btn-sm w-100" onclick="emailAllSegments()">
    전체 경로 이메일 보내기</button>`;

  panel.innerHTML = html;

  // 드래그 정렬 이벤트 설정
  setupDragSort();
}

/**
 * 경유지가 어느 구간에 속하는지 찾기
 */
function findSegmentLabel(waypointIndex, segments) {
  if (!_routeState) return '';
  const wp = _routeState.orderedWaypoints[waypointIndex];
  for (const seg of segments) {
    if (seg.waypoints.includes(wp)) return seg.label;
  }
  return '';
}

/**
 * 카카오맵 네비 열기
 */
function openKakaoNavi(segIndex) {
  if (!_routeState) return;
  const seg = _routeState.segments[segIndex];
  if (seg && seg.url) {
    window.open(seg.url, '_blank');
  }
}

/**
 * 네이버 지도 길찾기 열기
 */
function openNaverMap(segIndex) {
  if (!_routeState) return;
  const seg = _routeState.segments[segIndex];
  if (seg && seg.naverUrl) {
    window.open(seg.naverUrl, '_blank');
  }
}

/**
 * 구간 링크 복사
 */
async function copySegmentLink(segIndex) {
  if (!_routeState) return;
  const seg = _routeState.segments[segIndex];
  if (!seg) return;
  const ok = await copyToClipboard(seg.naverUrl || seg.url);
  if (ok) {
    showToast(`${seg.label} 링크가 복사되었습니다.`);
  }
}

/**
 * 경로표 인쇄 (1페이지: 경로표+QR, 2페이지: 카카오맵 직접 렌더링)
 */
async function printRouteSheet() {
  if (!_routeState) return;
  const { start, end, orderedWaypoints, totalDistance, segments } = _routeState;
  const transport = document.querySelector('input[name="transport"]:checked').value;
  const transportLabel = { 'CAR': '자동차', 'PUBLICTRANSIT': '대중교통', 'FOOT': '도보', 'MIXED': '혼합' }[transport] || transport;
  const dateStr = new Date().toLocaleDateString('ko-KR');

  showToast('인쇄 준비 중...');

  // 구간별 QR 코드 이미지 생성
  const qrImages = [];
  for (const seg of segments) {
    const qrUrl = seg.naverUrl || seg.url;
    try {
      const dataUrl = await generateQRDataURL(qrUrl);
      qrImages.push(dataUrl);
    } catch {
      qrImages.push('');
    }
  }

  const printWin = window.open('', '_blank');
  let html = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>현장조사 경로표</title>
    <style>
      body { font-family: 'Malgun Gothic', sans-serif; margin: 20px; font-size: 13px; }
      h2 { margin-bottom: 5px; }
      .meta { color: #666; margin-bottom: 15px; }
      table { border-collapse: collapse; width: 100%; margin-bottom: 15px; }
      th, td { border: 1px solid #333; padding: 6px 10px; text-align: left; }
      th { background: #f0f0f0; }
      .center { text-align: center; }
      .segments { margin-top: 15px; }
      .seg-item { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; padding: 8px; border: 1px solid #ddd; border-radius: 6px; }
      .seg-info { flex: 1; font-size: 12px; }
      .seg-info strong { font-size: 13px; }
      .seg-qr img { width: 90px; height: 90px; }
      .seg-qr-label { font-size: 10px; color: #666; text-align: center; }
      @page { margin: 10mm; }
    </style></head><body>
    <h2>현장조사 경로표</h2>
    <div class="meta">${dateStr} | 이동수단: ${transportLabel} | 경유지: ${orderedWaypoints.length}곳 | 직선거리: 약 ${totalDistance.toFixed(1)}km</div>
    <table>
      <thead><tr><th class="center" style="width:50px">순서</th><th>주소</th><th style="width:120px">메모</th><th class="center" style="width:60px">구간</th></tr></thead>
      <tbody>
        <tr><td class="center"><strong>S</strong></td><td>${escapeHtml(start.address)}</td><td>출발</td><td></td></tr>`;

  orderedWaypoints.forEach((wp, i) => {
    const seg = findSegmentLabel(i, segments);
    const printAddr = wp.originalAddress || wp.address;
    html += `<tr><td class="center"><strong>${i + 1}</strong></td><td>${escapeHtml(printAddr)}</td><td>${escapeHtml(wp.memo || '')}</td><td class="center">${seg}</td></tr>`;
  });

  html += `<tr><td class="center"><strong>E</strong></td><td>${escapeHtml(end.address)}</td><td>도착</td><td></td></tr>
      </tbody></table>`;

  // 정적 지도 (마커 포함)
  html += `<div style="margin-bottom:15px;">
    <strong>경로 지도</strong>
    <div id="staticMap" style="width:100%;height:400px;margin-top:8px;border:1px solid #ddd;"></div>
  </div>`;

  // 구간별 네비게이션 + QR 코드
  html += `<div class="segments"><strong>구간별 네이버 길찾기 (QR 스캔)</strong>`;
  segments.forEach((seg, i) => {
    const route = [escapeHtml(seg.start.address)];
    seg.waypoints.forEach(wp => route.push(escapeHtml(wp.address)));
    route.push(escapeHtml(seg.end.address));

    html += `<div class="seg-item">
      <div class="seg-info">
        <strong>${seg.label}</strong><br>
        ${route.join(' &rarr; ')}
      </div>`;
    if (qrImages[i]) {
      html += `<div class="seg-qr">
        <img src="${qrImages[i]}" alt="QR">
        <div class="seg-qr-label">스마트폰 스캔</div>
      </div>`;
    }
    html += `</div>`;
  });
  html += `</div>`;

  // 카카오 SDK 로드 + 정적 지도 렌더링 스크립트
  const jsKey = localStorage.getItem('kakaoApiKey') || CONFIG.KAKAO_API_KEY;
  const allPoints = [
    { lat: start.lat, lng: start.lng, label: 'S' },
    ...orderedWaypoints.map((wp, i) => ({ lat: wp.lat, lng: wp.lng, label: String(i + 1) })),
    { lat: end.lat, lng: end.lng, label: 'E' }
  ];
  const markersJson = JSON.stringify(allPoints);

  html += `
  <script src="//dapi.kakao.com/v2/maps/sdk.js?appkey=${jsKey}&autoload=false"><\/script>
  <script>
    kakao.maps.load(function() {
      var points = ${markersJson};
      var markers = points.map(function(p) {
        return { position: new kakao.maps.LatLng(p.lat, p.lng), text: p.label };
      });
      // 모든 좌표의 중심점 계산
      var sumLat = 0, sumLng = 0;
      points.forEach(function(p) { sumLat += p.lat; sumLng += p.lng; });
      var centerLat = sumLat / points.length;
      var centerLng = sumLng / points.length;

      var staticMap = new kakao.maps.StaticMap(
        document.getElementById('staticMap'),
        {
          center: new kakao.maps.LatLng(centerLat, centerLng),
          level: 7,
          marker: markers
        }
      );
    });
  <\/script>`;

  html += `</body></html>`;
  printWin.document.write(html);
  printWin.document.close();

  // 카카오 SDK 로드 + 지도 렌더링 + QR 로드 후 인쇄
  printWin.onload = () => setTimeout(() => printWin.print(), 1500);
}

/**
 * QR 코드를 data URL로 생성
 */
function generateQRDataURL(text) {
  return new Promise((resolve, reject) => {
    if (typeof QRCode === 'undefined') { reject('QRCode 미로드'); return; }
    const tempDiv = document.createElement('div');
    tempDiv.style.position = 'absolute';
    tempDiv.style.left = '-9999px';
    document.body.appendChild(tempDiv);

    new QRCode(tempDiv, {
      text: text,
      width: 180,
      height: 180,
      colorDark: '#000000',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M
    });

    // QRCode.js는 canvas로 생성
    setTimeout(() => {
      const canvas = tempDiv.querySelector('canvas');
      const dataUrl = canvas ? canvas.toDataURL('image/png') : '';
      document.body.removeChild(tempDiv);
      if (dataUrl) resolve(dataUrl);
      else reject('QR 생성 실패');
    }, 100);
  });
}

/**
 * 경로표 엑셀 출력
 */
function exportRouteExcel() {
  if (!_routeState) return;
  const { start, end, orderedWaypoints, totalDistance, segments } = _routeState;
  const transport = document.querySelector('input[name="transport"]:checked').value;
  const transportLabel = { 'CAR': '자동차', 'PUBLICTRANSIT': '대중교통', 'FOOT': '도보', 'MIXED': '혼합' }[transport] || transport;

  const rows = [];
  rows.push({ '순서': 'S', '주소': start.address, '메모': '출발', '구간': '' });
  orderedWaypoints.forEach((wp, i) => {
    rows.push({
      '순서': i + 1,
      '주소': wp.address,
      '메모': wp.memo || '',
      '구간': findSegmentLabel(i, segments)
    });
  });
  rows.push({ '순서': 'E', '주소': end.address, '메모': '도착', '구간': '' });

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch: 6 }, { wch: 45 }, { wch: 15 }, { wch: 8 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '경로표');

  const dateStr = new Date().toISOString().split('T')[0];
  XLSX.writeFile(wb, `경로표_${transportLabel}_${dateStr}.xlsx`);
}

/**
 * 드래그앤드롭 순서 변경
 */
function setupDragSort() {
  const list = document.getElementById('waypoint-list');
  if (!list) return;

  let dragItem = null;

  list.addEventListener('dragstart', (e) => {
    dragItem = e.target.closest('.route-waypoint');
    if (dragItem) {
      dragItem.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    }
  });

  list.addEventListener('dragend', (e) => {
    if (dragItem) {
      dragItem.classList.remove('dragging');
      dragItem = null;
      // 순서 변경 후 재계산
      recalculateFromPanel();
    }
  });

  list.addEventListener('dragover', (e) => {
    e.preventDefault();
    const afterElement = getDragAfterElement(list, e.clientY);
    if (dragItem) {
      if (afterElement) {
        list.insertBefore(dragItem, afterElement);
      } else {
        list.appendChild(dragItem);
      }
    }
  });
}

function getDragAfterElement(container, y) {
  const items = [...container.querySelectorAll('.route-waypoint:not(.dragging)')];
  return items.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) {
      return { offset, element: child };
    }
    return closest;
  }, { offset: -Infinity }).element;
}

/**
 * 패널에서 수동 순서 변경 후 재계산
 */
function recalculateFromPanel() {
  if (!_routeState) return;
  const list = document.getElementById('waypoint-list');
  const items = list.querySelectorAll('.route-waypoint');
  const newOrder = [];
  items.forEach(item => {
    const idx = parseInt(item.dataset.index);
    newOrder.push(_routeState.orderedWaypoints[idx]);
  });

  // 거리 재계산
  const allPoints = [_routeState.start, ...newOrder, _routeState.end];
  let dist = 0;
  for (let i = 0; i < allPoints.length - 1; i++) {
    dist += haversineDistance(allPoints[i].lat, allPoints[i].lng, allPoints[i + 1].lat, allPoints[i + 1].lng);
  }

  const transport = document.querySelector('input[name="transport"]:checked').value;
  const segments = buildRouteSegments(_routeState.start, _routeState.end, newOrder, transport);

  // 지도 갱신
  displayRoute(_routeState.start, _routeState.end, newOrder);
  // 패널 갱신
  renderRoutePanel(_routeState.start, _routeState.end, newOrder, dist, segments);
}

// 현재 QR 모달에 표시 중인 구간 인덱스
let _currentQRSegIndex = -1;

/**
 * QR 코드 모달 표시
 */
function showQRCode(segIndex) {
  if (!_routeState) return;
  const seg = _routeState.segments[segIndex];
  if (!seg) return;

  _currentQRSegIndex = segIndex;
  const modal = document.getElementById('qr-modal');
  const container = document.getElementById('qr-code-container');
  const title = document.getElementById('qr-modal-title');
  const desc = document.getElementById('qr-modal-desc');

  // 제목/설명
  title.textContent = `${seg.label} QR 코드`;
  desc.textContent = '스마트폰으로 스캔하면 네이버 지도 길찾기가 열립니다';

  // 기존 QR 제거 후 새로 생성 (네이버맵 URL 사용)
  container.innerHTML = '';
  new QRCode(container, {
    text: seg.naverUrl || seg.url,
    width: 200,
    height: 200,
    colorDark: '#000000',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.M
  });

  modal.style.display = 'flex';
}

/**
 * QR 모달 닫기
 */
function closeQRModal() {
  document.getElementById('qr-modal').style.display = 'none';
  _currentQRSegIndex = -1;
}

/**
 * 현재 QR 구간을 이메일로 보내기
 */
function emailQRCode() {
  if (!_routeState || _currentQRSegIndex < 0) return;
  const seg = _routeState.segments[_currentQRSegIndex];
  if (!seg) return;

  const subject = encodeURIComponent(`[G-Navi] ${seg.label} 네비게이션 링크`);
  const body = encodeURIComponent(
    `현장조사 경로 - ${seg.label}\n\n` +
    `아래 링크를 스마트폰에서 열면 네이버 지도 길찾기가 시작됩니다:\n${seg.naverUrl || seg.url}\n\n` +
    `출발: ${seg.start.address}\n도착: ${seg.end.address}`
  );
  window.open(`mailto:?subject=${subject}&body=${body}`);
}

/**
 * 전체 경로를 이메일로 보내기
 */
function emailAllSegments() {
  if (!_routeState) return;
  const { start, end, orderedWaypoints, segments } = _routeState;
  const dateStr = new Date().toLocaleDateString('ko-KR');

  let bodyText = `현장조사 경로표 (${dateStr})\n`;
  bodyText += `출발: ${start.address}\n`;
  bodyText += `경유지: ${orderedWaypoints.length}곳\n`;
  bodyText += `도착: ${end.address}\n\n`;

  // 경유지 목록
  bodyText += `=== 방문 순서 ===\n`;
  orderedWaypoints.forEach((wp, i) => {
    const addr = wp.originalAddress || wp.address;
    bodyText += `${i + 1}. ${addr}${wp.memo ? ' (' + wp.memo + ')' : ''}\n`;
  });

  // 구간별 링크
  bodyText += `\n=== 카카오맵 네비 링크 ===\n`;
  bodyText += `(스마트폰에서 링크를 터치하면 카카오맵이 열립니다)\n\n`;
  segments.forEach(seg => {
    bodyText += `[${seg.label}]\n${seg.naverUrl || seg.url}\n\n`;
  });

  const subject = encodeURIComponent(`[G-Navi] 현장조사 경로표 (${dateStr})`);
  const body = encodeURIComponent(bodyText);
  window.open(`mailto:?subject=${subject}&body=${body}`);
}

/**
 * 토스트 메시지 표시
 */
function showToast(message) {
  let toast = document.getElementById('g-navi-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'g-navi-toast';
    toast.className = 'toast-message';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
}
