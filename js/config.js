/**
 * config.js - G-Navi 설정
 * 배포 시 이 파일의 API 키와 기본값만 수정하면 됩니다.
 */
const CONFIG = {
  // Kakao Maps API 키 (https://developers.kakao.com 에서 발급)
  KAKAO_API_KEY: '38f0e104d51d9fc131690180b5371947',

  // Kakao REST API 키 (정적 지도 이미지용)
  KAKAO_REST_KEY: '4694002d439181ea4dd484c516c33226',

  // 기본 출발지 주소
  DEFAULT_START: '서울특별시 강남구 학동로 426',  // 강남구청

  // 기본 지도 중심 좌표 (강남구청)
  DEFAULT_CENTER: { lat: 37.5172, lng: 127.0473 },

  // 기본 줌 레벨
  DEFAULT_ZOOM: 5,

  // 카카오맵 경유지 최대 개수 (URL Scheme 제한)
  KAKAO_MAX_WAYPOINTS: 3,

  // 혼합 모드: 도보/대중교통 전환 기준 직선거리 (km)
  MIXED_WALK_THRESHOLD: 1.2,
};
