/**
 * geocoder.js - 주소 → 좌표 변환 (Kakao REST API 우선, Nominatim 폴백)
 */

/**
 * Kakao REST API - 주소 검색
 */
async function geocodeAddressKakaoREST(address) {
  const restKey = CONFIG.KAKAO_REST_KEY;
  if (!restKey) throw new Error('Kakao REST API 키 미설정');

  const url = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(address)}&size=1`;
  const res = await fetch(url, {
    headers: { 'Authorization': `KakaoAK ${restKey}` }
  });

  if (!res.ok) throw new Error('Kakao 주소검색 API 오류');

  const data = await res.json();
  if (data.documents && data.documents.length > 0) {
    const doc = data.documents[0];
    // 도로명주소 우선
    const displayAddr = (doc.road_address && doc.road_address.address_name)
      ? doc.road_address.address_name
      : doc.address_name || address;
    return {
      lat: parseFloat(doc.y),
      lng: parseFloat(doc.x),
      address: displayAddr
    };
  }

  throw new Error('주소 검색 결과 없음');
}

/**
 * Kakao REST API - 키워드 검색 (건물명, 약식 주소 등)
 */
async function geocodeKeywordKakaoREST(address) {
  const restKey = CONFIG.KAKAO_REST_KEY;
  if (!restKey) throw new Error('Kakao REST API 키 미설정');

  const url = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(address)}&size=1`;
  const res = await fetch(url, {
    headers: { 'Authorization': `KakaoAK ${restKey}` }
  });

  if (!res.ok) throw new Error('Kakao 키워드검색 API 오류');

  const data = await res.json();
  if (data.documents && data.documents.length > 0) {
    const doc = data.documents[0];
    return {
      lat: parseFloat(doc.y),
      lng: parseFloat(doc.x),
      address: doc.road_address_name || doc.address_name || address
    };
  }

  throw new Error('키워드 검색 결과 없음');
}

/**
 * Kakao JS SDK 지오코딩 (SDK 로드된 경우 사용)
 */
function geocodeAddressKakaoSDK(address) {
  return new Promise((resolve, reject) => {
    if (!window.kakao || !kakao.maps || !kakao.maps.services) {
      reject(new Error('Kakao Maps API 미로드'));
      return;
    }
    const geocoder = new kakao.maps.services.Geocoder();
    geocoder.addressSearch(address, (result, status) => {
      if (status === kakao.maps.services.Status.OK && result.length > 0) {
        const r = result[0];
        const displayAddr = (r.road_address && r.road_address.address_name)
          ? r.road_address.address_name
          : r.address_name || address;
        resolve({
          lat: parseFloat(r.y),
          lng: parseFloat(r.x),
          address: displayAddr
        });
      } else {
        reject(new Error(`주소를 찾을 수 없습니다: ${address}`));
      }
    });
  });
}

/**
 * Nominatim용 주소 정제 - 단계별로 점점 간략화
 * 반환: 시도할 주소 배열 (구체적 → 간략)
 */
function cleanAddressForNominatim(address) {
  let cleaned = address;

  // 1) 맨 끝 괄호가 인명이면 제거: (홍길동), (김영웅) 등
  cleaned = cleaned.replace(/\s*\([가-힣]{2,4}\)\s*$/, '');

  // 2) 괄호 안 법정동/아파트명 제거: (봉방동), (칠금동, 현대1차아파트)
  cleaned = cleaned.replace(/\s*\([^)]*\)\s*/g, ' ');

  // 3) 동·호수 제거: 106동 308호, 가동 102호, 나동, 5층 등
  cleaned = cleaned.replace(/\s+\d+층\b/, '');
  cleaned = cleaned.replace(/\s+[가-힣]?동\s+\d+호\b/, '');
  cleaned = cleaned.replace(/\s+\d+동\s+\d+호\b/, '');
  cleaned = cleaned.replace(/\s+\d+호\b/, '');
  cleaned = cleaned.replace(/\s+[가-힣]동\b/, '');
  cleaned = cleaned.replace(/\s+\d+동\b/, '');

  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // 단계별 시도 목록: 정제된 전체 → 점점 간략화
  const candidates = [cleaned];

  // 도로명+번호까지만 추출 (예: 충청북도 충주시 중앙탑길 118-1)
  const roadMatch = cleaned.match(/^(.+?[로길]\s+\d+[-\d]*)/);
  if (roadMatch && roadMatch[1] !== cleaned) {
    candidates.push(roadMatch[1]);
  }

  // 시도 제거 버전 (예: 충주시 봉황6길 4)
  const noProvince = cleaned.replace(/^[가-힣]+도\s+/, '');
  if (noProvince !== cleaned) {
    candidates.push(noProvince);
  }

  // 면/읍 제거 버전 (예: 충청북도 충주시 미력리사지길 56)
  const noMyeon = cleaned.replace(/\s+[가-힣]+[면읍]\s+/, ' ');
  if (noMyeon !== cleaned && !candidates.includes(noMyeon)) {
    candidates.push(noMyeon);
  }

  // 도로명만 (번호 없이) - 최후의 수단 (예: 충주시 봉황6길)
  const roadOnly = cleaned.match(/^(.+?[로길])\s+\d/);
  if (roadOnly) {
    const cityAndRoad = roadOnly[1].replace(/^[가-힣]+도\s+/, '');
    if (!candidates.includes(cityAndRoad)) {
      candidates.push(cityAndRoad);
    }
  }

  return candidates;
}

/**
 * Nominatim (OpenStreetMap) 폴백 지오코딩
 * 무료, API 키 불필요, 한국 주소 지원
 */
async function geocodeAddressNominatim(address) {
  const candidates = cleanAddressForNominatim(address);

  for (const candidate of candidates) {
    const url = `https://nominatim.openstreetmap.org/search?` +
      `q=${encodeURIComponent(candidate)}&format=json&limit=1&countrycodes=kr&accept-language=ko`;

    const res = await fetch(url, {
      headers: { 'User-Agent': 'G-Navi/1.0 (local field survey tool)' }
    });

    if (!res.ok) continue;

    const data = await res.json();
    if (data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
        address: data[0].display_name ? data[0].display_name.split(',').slice(0, 3).join(', ') : address
      };
    }

    // Nominatim 요청 간격 준수
    if (candidates.indexOf(candidate) < candidates.length - 1) {
      await new Promise(r => setTimeout(r, 1100));
    }
  }

  throw new Error(`주소를 찾을 수 없습니다: ${address}`);
}

/**
 * 단일 주소를 좌표로 변환
 * 우선순위: Kakao REST 주소검색 → Kakao REST 키워드검색 → Kakao SDK → Nominatim
 * @param {string} address - 도로명주소
 * @returns {Promise<{lat: number, lng: number, address: string}>}
 */
async function geocodeAddress(address) {
  // 1단계: Kakao REST API 주소 검색 (가장 정확)
  if (CONFIG.KAKAO_REST_KEY) {
    try {
      return await geocodeAddressKakaoREST(address);
    } catch { /* 실패 시 다음 단계 */ }

    // 2단계: Kakao REST API 키워드 검색 (건물명, 약식 주소)
    try {
      return await geocodeKeywordKakaoREST(address);
    } catch { /* 실패 시 다음 단계 */ }
  }

  // 3단계: Kakao JS SDK (지도 SDK가 로드된 경우)
  if (window.kakao && kakao.maps && kakao.maps.services) {
    try {
      return await geocodeAddressKakaoSDK(address);
    } catch { /* 실패 시 다음 단계 */ }
  }

  // 4단계: Nominatim 폴백
  return await geocodeAddressNominatim(address);
}

/**
 * 여러 주소를 순차적으로 좌표 변환 (API 부하 방지)
 * @param {Array<{address: string, memo: string}>} items - 주소 목록
 * @param {function} onProgress - 진행 콜백 (current, total)
 * @returns {Promise<Array<{lat, lng, address, memo, originalAddress, error}>>}
 */
async function geocodeMultiple(items, onProgress) {
  const results = [];
  for (let i = 0; i < items.length; i++) {
    try {
      const coords = await geocodeAddress(items[i].address);
      results.push({
        ...coords,
        memo: items[i].memo || '',
        originalAddress: items[i].address,
        error: null
      });
    } catch (err) {
      results.push({
        lat: null,
        lng: null,
        address: items[i].address,
        memo: items[i].memo || '',
        originalAddress: items[i].address,
        error: err.message
      });
    }
    if (onProgress) onProgress(i + 1, items.length);
    // API 부하 방지 딜레이
    if (i < items.length - 1) {
      await new Promise(r => setTimeout(r, 100));
    }
  }
  return results;
}

/**
 * 주소 검색 후보 목록 반환 (최대 5건)
 * Kakao REST API 주소검색 + 키워드검색 결합
 * @param {string} query - 검색어
 * @returns {Promise<Array<{lat, lng, address, placeName}>>}
 */
async function searchAddressCandidates(query) {
  const candidates = [];
  const restKey = CONFIG.KAKAO_REST_KEY;

  if (restKey) {
    // 주소 검색 (도로명/지번)
    try {
      const url = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(query)}&size=5`;
      const res = await fetch(url, {
        headers: { 'Authorization': `KakaoAK ${restKey}` }
      });
      if (res.ok) {
        const data = await res.json();
        (data.documents || []).forEach(doc => {
          const addr = (doc.road_address && doc.road_address.address_name)
            ? doc.road_address.address_name
            : doc.address_name;
          candidates.push({
            lat: parseFloat(doc.y),
            lng: parseFloat(doc.x),
            address: addr,
            placeName: ''
          });
        });
      }
    } catch { /* 무시 */ }

    // 키워드 검색 (건물명, 장소명)
    try {
      const url = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}&size=5`;
      const res = await fetch(url, {
        headers: { 'Authorization': `KakaoAK ${restKey}` }
      });
      if (res.ok) {
        const data = await res.json();
        (data.documents || []).forEach(doc => {
          const addr = doc.road_address_name || doc.address_name;
          // 중복 제거
          if (!candidates.some(c => c.address === addr)) {
            candidates.push({
              lat: parseFloat(doc.y),
              lng: parseFloat(doc.x),
              address: addr,
              placeName: doc.place_name || ''
            });
          }
        });
      }
    } catch { /* 무시 */ }
  }

  return candidates.slice(0, 8);
}
