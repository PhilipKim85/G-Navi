/**
 * map.js - Kakao Maps 지도 표시, 마커/경로 렌더링
 */

let _map = null;
let _markers = [];
let _polyline = null;
let _infowindow = null;

/**
 * 카카오맵 사용 가능 여부
 */
function isKakaoMapAvailable() {
  return !!(window.kakao && kakao.maps);
}

/**
 * 지도 초기화
 */
function initMap() {
  const container = document.getElementById('map-container');
  if (!container) return;

  if (!isKakaoMapAvailable()) {
    container.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#888;flex-direction:column;gap:8px;">
      <div style="font-size:2rem;">&#128506;</div>
      <div>카카오맵 없이 실행 중 (Nominatim 지오코딩)</div>
      <div style="font-size:0.85rem;">경로 순서는 정상 계산됩니다</div>
    </div>`;
    return;
  }

  const options = {
    center: new kakao.maps.LatLng(CONFIG.DEFAULT_CENTER.lat, CONFIG.DEFAULT_CENTER.lng),
    level: CONFIG.DEFAULT_ZOOM
  };
  _map = new kakao.maps.Map(container, options);
  _infowindow = new kakao.maps.InfoWindow({ zIndex: 1 });

  // 지도 컨트롤 추가
  _map.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.RIGHT);
}

/**
 * 모든 마커/경로 제거
 */
function clearMap() {
  if (!isKakaoMapAvailable() || !_map) return;
  _markers.forEach(m => m.setMap(null));
  _markers = [];
  if (_polyline) {
    _polyline.setMap(null);
    _polyline = null;
  }
  if (_infowindow) _infowindow.close();
}

/**
 * 마커 이미지 생성 (번호 또는 S/E 표시)
 */
function createMarkerImage(label, color) {
  // SVG 마커 생성
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="46" viewBox="0 0 36 46">
    <path d="M18 0C8.06 0 0 8.06 0 18c0 13.5 18 28 18 28s18-14.5 18-28C36 8.06 27.94 0 18 0z" fill="${color}" stroke="#fff" stroke-width="1.5"/>
    <text x="18" y="22" text-anchor="middle" fill="#fff" font-size="${label.length > 1 ? 11 : 14}" font-weight="bold" font-family="Arial">${label}</text>
  </svg>`;
  const encoded = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  return new kakao.maps.MarkerImage(
    encoded,
    new kakao.maps.Size(36, 46),
    { offset: new kakao.maps.Point(18, 46) }
  );
}

/**
 * 단일 마커 추가
 */
function addMarker(lat, lng, label, color, infoContent) {
  const position = new kakao.maps.LatLng(lat, lng);
  const image = createMarkerImage(label, color);
  const marker = new kakao.maps.Marker({
    map: _map,
    position: position,
    image: image
  });

  if (infoContent) {
    kakao.maps.event.addListener(marker, 'click', () => {
      _infowindow.setContent(`<div style="padding:8px 12px;font-size:13px;min-width:150px;">${infoContent}</div>`);
      _infowindow.open(_map, marker);
    });
  }

  _markers.push(marker);
  return marker;
}

/**
 * 경로 결과를 지도에 표시
 * @param {Object} start - 출발지 { lat, lng, address }
 * @param {Object} end - 목적지 { lat, lng, address }
 * @param {Array} orderedWaypoints - 순서대로 정렬된 경유지
 */
function displayRoute(start, end, orderedWaypoints) {
  if (!isKakaoMapAvailable() || !_map) return;
  clearMap();

  const path = [];

  // 출발지 마커
  addMarker(start.lat, start.lng, 'S', '#2DB400',
    `<strong>출발</strong><br>${escapeHtml(start.address)}`);
  path.push(new kakao.maps.LatLng(start.lat, start.lng));

  // 경유지 마커 (번호순)
  orderedWaypoints.forEach((wp, i) => {
    if (wp.lat && wp.lng) {
      const num = i + 1;
      const memo = wp.memo ? `<br><span style="color:#666">${escapeHtml(wp.memo)}</span>` : '';
      addMarker(wp.lat, wp.lng, String(num), '#3B82F6',
        `<strong>${num}</strong> ${escapeHtml(wp.address)}${memo}`);
      path.push(new kakao.maps.LatLng(wp.lat, wp.lng));
    }
  });

  // 목적지 마커
  addMarker(end.lat, end.lng, 'E', '#EF4444',
    `<strong>도착</strong><br>${escapeHtml(end.address)}`);
  path.push(new kakao.maps.LatLng(end.lat, end.lng));

  // 경로 라인
  if (path.length >= 2) {
    _polyline = new kakao.maps.Polyline({
      map: _map,
      path: path,
      strokeWeight: 4,
      strokeColor: '#3B82F6',
      strokeOpacity: 0.7,
      strokeStyle: 'solid'
    });
  }

  // 전체 경로가 보이도록 지도 범위 조정
  fitBounds(path);
}

/**
 * 경유지 없이 출발지/목적지만 표시
 */
function displayPoints(start, end, waypoints) {
  if (!isKakaoMapAvailable() || !_map) return;
  clearMap();
  const path = [];

  if (start && start.lat) {
    addMarker(start.lat, start.lng, 'S', '#2DB400',
      `<strong>출발</strong><br>${escapeHtml(start.address)}`);
    path.push(new kakao.maps.LatLng(start.lat, start.lng));
  }

  if (waypoints) {
    waypoints.forEach((wp, i) => {
      if (wp.lat && wp.lng) {
        const memo = wp.memo ? `<br><span style="color:#666">${escapeHtml(wp.memo)}</span>` : '';
        addMarker(wp.lat, wp.lng, String(i + 1), '#3B82F6',
          `${escapeHtml(wp.address)}${memo}`);
        path.push(new kakao.maps.LatLng(wp.lat, wp.lng));
      }
    });
  }

  if (end && end.lat) {
    addMarker(end.lat, end.lng, 'E', '#EF4444',
      `<strong>도착</strong><br>${escapeHtml(end.address)}`);
    path.push(new kakao.maps.LatLng(end.lat, end.lng));
  }

  if (path.length > 0) fitBounds(path);
}

/**
 * 모든 포인트가 보이도록 지도 범위 조정
 */
function fitBounds(latLngArray) {
  if (!_map || latLngArray.length === 0) return;
  const bounds = new kakao.maps.LatLngBounds();
  latLngArray.forEach(ll => bounds.extend(ll));
  _map.setBounds(bounds, 50);
}

/**
 * 현재 지도 상태 정보 반환 (인쇄용 지도 렌더링에 사용)
 */
function getMapState() {
  if (!_map) return null;
  const center = _map.getCenter();
  return {
    centerLat: center.getLat(),
    centerLng: center.getLng(),
    level: _map.getLevel()
  };
}

/**
 * HTML 이스케이프
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
