/**
 * tsp.js - TSP 최적경로 알고리즘 (순수 JS, 외부 의존 없음)
 * Nearest Neighbor + 2-opt 개선
 */

/**
 * Haversine 공식으로 두 좌표 간 직선거리 계산 (km)
 */
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371; // 지구 반지름 (km)
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * 거리 행렬 생성
 * @param {Array<{lat: number, lng: number}>} points - 좌표 배열
 * @returns {number[][]} 거리 행렬
 */
function buildDistanceMatrix(points) {
  const n = points.length;
  const matrix = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = haversineDistance(points[i].lat, points[i].lng, points[j].lat, points[j].lng);
      matrix[i][j] = d;
      matrix[j][i] = d;
    }
  }
  return matrix;
}

/**
 * 경로 총 거리 계산
 */
function routeDistance(route, distMatrix) {
  let total = 0;
  for (let i = 0; i < route.length - 1; i++) {
    total += distMatrix[route[i]][route[i + 1]];
  }
  return total;
}

/**
 * Nearest Neighbor 알고리즘으로 초기 경로 생성
 * 출발지(0번)와 목적지(마지막)는 고정, 경유지만 순서 결정
 * @param {number[][]} distMatrix - 거리 행렬
 * @param {number} startIdx - 출발지 인덱스
 * @param {number} endIdx - 목적지 인덱스
 * @param {number[]} waypointIndices - 경유지 인덱스 배열
 * @returns {number[]} 방문 순서 (출발지 → 경유지들 → 목적지)
 */
function nearestNeighbor(distMatrix, startIdx, endIdx, waypointIndices) {
  if (waypointIndices.length === 0) return [startIdx, endIdx];

  const visited = new Set();
  const route = [startIdx];
  let current = startIdx;

  const remaining = new Set(waypointIndices);

  while (remaining.size > 0) {
    let nearest = -1;
    let nearestDist = Infinity;
    for (const idx of remaining) {
      const d = distMatrix[current][idx];
      if (d < nearestDist) {
        nearestDist = d;
        nearest = idx;
      }
    }
    route.push(nearest);
    remaining.delete(nearest);
    current = nearest;
  }

  route.push(endIdx);
  return route;
}

/**
 * 2-opt 개선: 경유지 구간에서 교차 경로 제거
 * 출발지(첫 번째)와 목적지(마지막)는 고정
 * @param {number[]} route - 현재 경로
 * @param {number[][]} distMatrix - 거리 행렬
 * @returns {number[]} 개선된 경로
 */
function twoOpt(route, distMatrix) {
  const n = route.length;
  if (n <= 4) return route; // 경유지 2개 이하면 개선 불필요

  let improved = true;
  let bestRoute = [...route];
  let bestDist = routeDistance(bestRoute, distMatrix);

  while (improved) {
    improved = false;
    // 출발지(0)와 목적지(n-1)는 고정 → i는 1부터, j는 n-2까지
    for (let i = 1; i < n - 2; i++) {
      for (let j = i + 1; j < n - 1; j++) {
        // i~j 구간 뒤집기
        const newRoute = [...bestRoute];
        let left = i, right = j;
        while (left < right) {
          [newRoute[left], newRoute[right]] = [newRoute[right], newRoute[left]];
          left++;
          right--;
        }
        const newDist = routeDistance(newRoute, distMatrix);
        if (newDist < bestDist - 0.0001) {
          bestRoute = newRoute;
          bestDist = newDist;
          improved = true;
        }
      }
    }
  }

  return bestRoute;
}

/**
 * Or-opt 개선: 경유지 1~3개를 빼서 더 좋은 위치에 삽입
 * 2-opt가 못 찾는 "노드 재배치" 최적화를 수행
 * 출발지(첫 번째)와 목적지(마지막)는 고정
 * @param {number[]} route - 현재 경로
 * @param {number[][]} distMatrix - 거리 행렬
 * @returns {number[]} 개선된 경로
 */
function orOpt(route, distMatrix) {
  const n = route.length;
  if (n <= 4) return route; // 경유지 2개 이하면 개선 불필요

  let bestRoute = [...route];
  let bestDist = routeDistance(bestRoute, distMatrix);
  let improved = true;

  while (improved) {
    improved = false;
    // segLen: 이동할 연속 노드 수 (1개, 2개, 3개)
    for (let segLen = 1; segLen <= Math.min(3, n - 3); segLen++) {
      for (let i = 1; i <= n - 1 - segLen; i++) {
        // i ~ i+segLen-1 구간의 노드를 빼서 다른 위치에 삽입 시도
        const segment = bestRoute.slice(i, i + segLen);
        const remaining = [...bestRoute.slice(0, i), ...bestRoute.slice(i + segLen)];

        // 삽입 가능한 위치: 1 ~ remaining.length-1 (출발/목적지 사이)
        for (let j = 1; j < remaining.length; j++) {
          if (j === i) continue; // 원래 위치면 건너뜀
          const newRoute = [...remaining.slice(0, j), ...segment, ...remaining.slice(j)];
          const newDist = routeDistance(newRoute, distMatrix);
          if (newDist < bestDist - 0.0001) {
            bestRoute = newRoute;
            bestDist = newDist;
            improved = true;
          }
        }
      }
    }
  }

  return bestRoute;
}

/**
 * TSP 최적경로 계산 메인 함수
 * @param {Object} start - 출발지 { lat, lng, address }
 * @param {Object} end - 목적지 { lat, lng, address }
 * @param {Array<Object>} waypoints - 경유지 [{ lat, lng, address, memo }]
 * @returns {{ order: number[], totalDistance: number, orderedWaypoints: Array }}
 *   order: 경유지의 최적 방문 순서 (0-based, waypoints 배열 내 인덱스)
 *   totalDistance: 총 거리 (km)
 *   orderedWaypoints: 순서대로 정렬된 경유지 배열
 */
function solveTSP(start, end, waypoints) {
  if (waypoints.length === 0) {
    return {
      order: [],
      totalDistance: haversineDistance(start.lat, start.lng, end.lat, end.lng),
      orderedWaypoints: []
    };
  }

  // 전체 포인트 배열: [출발지, 경유지1, 경유지2, ..., 목적지]
  const points = [
    { lat: start.lat, lng: start.lng },
    ...waypoints.map(w => ({ lat: w.lat, lng: w.lng })),
    { lat: end.lat, lng: end.lng }
  ];

  const startIdx = 0;
  const endIdx = points.length - 1;
  const waypointIndices = waypoints.map((_, i) => i + 1); // 1 ~ n

  // 거리 행렬 생성
  const distMatrix = buildDistanceMatrix(points);

  // Nearest Neighbor 초기 경로
  let route = nearestNeighbor(distMatrix, startIdx, endIdx, waypointIndices);

  // 2-opt 개선
  route = twoOpt(route, distMatrix);

  // Or-opt 개선 (노드 재배치)
  route = orOpt(route, distMatrix);

  // 결과 정리
  const totalDistance = routeDistance(route, distMatrix);
  // route에서 출발지(0)와 목적지(마지막) 제외 → 경유지 순서
  const waypointOrder = route.slice(1, -1).map(idx => idx - 1); // 0-based waypoints 인덱스
  const orderedWaypoints = waypointOrder.map(i => waypoints[i]);

  return {
    order: waypointOrder,
    totalDistance,
    orderedWaypoints
  };
}
