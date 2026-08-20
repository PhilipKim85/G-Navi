/**
 * share.js - 카카오맵 공유 링크 생성 + 구간 분할
 */

/**
 * 카카오맵 길찾기 URL 생성 (이동수단별 경로 검색)
 * rt 형식: 좌표를 직접 전달하여 자동 검색 실행
 */
function buildKakaoNaviUrl(start, end, waypoints, transport) {
  const sName = encodeURIComponent(start.address || '출발지');
  const eName = encodeURIComponent(end.address || '도착지');

  // 이동수단 → 카카오맵 target 파라미터
  const targetMap = { 'CAR': 'car', 'PUBLICTRANSIT': 'transit', 'FOOT': 'walk' };
  const target = targetMap[transport] || 'car';

  // 좌표를 소수점 6자리로 정리
  const fix = (n) => Number(n).toFixed(6);

  // rt 좌표: 출발lat,출발lng,도착lat,도착lng
  const rt = `${fix(start.lat)},${fix(start.lng)},${fix(end.lat)},${fix(end.lng)}`;

  const url = `https://map.kakao.com/?map_type=TYPE_MAP&target=${target}&rt=${rt}&rt1=${sName}&rt2=${eName}`;

  return url;
}

/**
 * 카카오맵 모바일 앱 URL (QR 코드용)
 * by: CAR, PUBLICTRANSIT, FOOT
 */
function buildKakaoAppUrl(start, end, waypoints, transport) {
  // 카카오맵 앱의 by 값: CAR, PUBLICTRANSIT, FOOT (대문자 그대로)
  let url = `kakaomap://route?sp=${start.lat},${start.lng}&ep=${end.lat},${end.lng}&by=${transport}`;
  waypoints.forEach((wp, i) => {
    if (wp.lat && wp.lng) {
      url += `&v${i + 1}=${wp.lat},${wp.lng}`;
    }
  });
  return url;
}

/**
 * 경유지를 구간별로 분할 (카카오맵 경유지 최대 3개 제한)
 * @param {Object} start - 출발지
 * @param {Object} end - 목적지
 * @param {Array} waypoints - 전체 경유지 (순서대로)
 * @param {'CAR'|'FOOT'} transport - 이동수단
 * @returns {Array<{label, start, end, waypoints, url}>} 구간 목록
 */
function buildRouteSegments(start, end, waypoints, transport) {
  const isTransit = transport === 'PUBLICTRANSIT';
  const isMixed = transport === 'MIXED';
  const segments = [];

  if (waypoints.length === 0) {
    const actualTransport = isMixed ? 'PUBLICTRANSIT' : transport;
    segments.push({
      label: '전체',
      segmentNum: 1,
      start: start,
      end: end,
      waypoints: [],
      url: buildKakaoNaviUrl(start, end, [], actualTransport),
      appUrl: buildKakaoAppUrl(start, end, [], actualTransport),
      naverUrl: buildNaverMapUrl(start, end, [], actualTransport)
    });
    return segments;
  }

  if (isTransit) {
    // 대중교통: 연속 구간으로 분할 (S→1, 1→2, 2→3, ..., N→E)
    const allStops = [start, ...waypoints, end];
    for (let i = 0; i < allStops.length - 1; i++) {
      const segStart = allStops[i];
      const segEnd = allStops[i + 1];
      segments.push({
        label: `${i + 1}구간`,
        segmentNum: i + 1,
        start: segStart,
        end: segEnd,
        waypoints: [],
        url: buildKakaoNaviUrl(segStart, segEnd, [], transport),
        appUrl: buildKakaoAppUrl(segStart, segEnd, [], transport),
        naverUrl: buildNaverMapUrl(segStart, segEnd, [], transport)
      });
    }
    return segments;
  }

  if (isMixed) {
    // 혼합 모드: 거리 기준으로 도보/대중교통 자동 판단
    const threshold = CONFIG.MIXED_WALK_THRESHOLD || 1.2;
    const allStops = [start, ...waypoints, end];

    // 1단계: 각 구간의 이동수단 결정
    const segModes = [];
    for (let i = 0; i < allStops.length - 1; i++) {
      const dist = haversineDistance(allStops[i].lat, allStops[i].lng, allStops[i + 1].lat, allStops[i + 1].lng);
      segModes.push({ from: i, to: i + 1, mode: dist <= threshold ? 'FOOT' : 'PUBLICTRANSIT', dist });
    }

    // 2단계: 연속된 도보 구간을 하나로 묶음 (경유지 포함)
    let i = 0;
    let segNum = 1;
    while (i < segModes.length) {
      if (segModes[i].mode === 'FOOT') {
        // 연속 도보 구간 찾기
        let j = i;
        while (j < segModes.length && segModes[j].mode === 'FOOT') j++;
        // i~j-1 까지 도보 구간 → 하나로 묶음
        const segStart = allStops[segModes[i].from];
        const segEnd = allStops[segModes[j - 1].to];
        const segWaypoints = [];
        for (let k = segModes[i].from + 1; k < segModes[j - 1].to; k++) {
          segWaypoints.push(allStops[k]);
        }
        segments.push({
          label: `${segNum}구간 (도보)`,
          segmentNum: segNum,
          start: segStart,
          end: segEnd,
          waypoints: segWaypoints,
          url: buildKakaoNaviUrl(segStart, segEnd, segWaypoints, 'FOOT'),
          appUrl: buildKakaoAppUrl(segStart, segEnd, segWaypoints, 'FOOT'),
          naverUrl: buildNaverMapUrl(segStart, segEnd, segWaypoints, 'FOOT')
        });
        segNum++;
        i = j;
      } else {
        // 대중교통 구간 (1:1)
        const segStart = allStops[segModes[i].from];
        const segEnd = allStops[segModes[i].to];
        segments.push({
          label: `${segNum}구간 (대중교통)`,
          segmentNum: segNum,
          start: segStart,
          end: segEnd,
          waypoints: [],
          url: buildKakaoNaviUrl(segStart, segEnd, [], 'PUBLICTRANSIT'),
          appUrl: buildKakaoAppUrl(segStart, segEnd, [], 'PUBLICTRANSIT'),
          naverUrl: buildNaverMapUrl(segStart, segEnd, [], 'PUBLICTRANSIT')
        });
        segNum++;
        i++;
      }
    }
    return segments;
  }

  // 자동차/도보: 경유지를 MAX_WP개씩 묶어서 구간 분할
  const MAX_WP = CONFIG.KAKAO_MAX_WAYPOINTS;
  let segStart = start;
  let wpIdx = 0;
  let segNum = 1;

  while (wpIdx < waypoints.length) {
    const remaining = waypoints.length - wpIdx;

    if (remaining <= MAX_WP) {
      const segWaypoints = waypoints.slice(wpIdx, wpIdx + remaining);
      segments.push({
        label: `${segNum}구간`,
        segmentNum: segNum,
        start: segStart,
        end: end,
        waypoints: segWaypoints,
        url: buildKakaoNaviUrl(segStart, end, segWaypoints, transport),
        appUrl: buildKakaoAppUrl(segStart, end, segWaypoints, transport),
        naverUrl: buildNaverMapUrl(segStart, end, segWaypoints, transport)
      });
      wpIdx += remaining;
    } else {
      const segWaypoints = waypoints.slice(wpIdx, wpIdx + MAX_WP);
      const segEnd = waypoints[wpIdx + MAX_WP];
      segments.push({
        label: `${segNum}구간`,
        segmentNum: segNum,
        start: segStart,
        end: segEnd,
        waypoints: segWaypoints,
        url: buildKakaoNaviUrl(segStart, segEnd, segWaypoints, transport),
        appUrl: buildKakaoAppUrl(segStart, segEnd, segWaypoints, transport),
        naverUrl: buildNaverMapUrl(segStart, segEnd, segWaypoints, transport)
      });
      segStart = segEnd;
      wpIdx += MAX_WP + 1;
    }
    segNum++;
  }

  return segments;
}

/**
 * 네이버 지도 길찾기 URL 생성 (자동 검색 실행됨)
 */
function buildNaverMapUrl(start, end, waypoints, transport) {
  // 네이버 지도 이동수단: car, transit, walk
  const modeMap = { 'CAR': 'car', 'PUBLICTRANSIT': 'transit', 'FOOT': 'walk' };
  const mode = modeMap[transport] || 'car';

  // 좌표를 소수점 6자리로 정리
  const fix = (n) => Number(n).toFixed(6);

  const sName = encodeURIComponent(start.address || '출발지');
  const eName = encodeURIComponent(end.address || '도착지');

  // 경유지 파라미터 (자동차/도보만, 출발/도착/경유지 순서)
  let viaParam = '';
  if (waypoints.length > 0) {
    const vias = waypoints.filter(wp => wp.lat && wp.lng).map(wp => {
      const name = encodeURIComponent(wp.address || '경유지');
      return `${fix(wp.lng)},${fix(wp.lat)},${name}`;
    }).join('/');
    if (vias) viaParam = `/${vias}`;
  }

  const url = `https://map.naver.com/v5/directions/${fix(start.lng)},${fix(start.lat)},${sName}/${fix(end.lng)},${fix(end.lat)},${eName}${viaParam}/-/${mode}?c=15,0,0,0,dh`;

  return url;
}

/**
 * 공유 링크를 클립보드에 복사
 */
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // fallback
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  }
}
