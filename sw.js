// 설치 가능 조건용 최소 서비스 워커 (오프라인 캐시 없음, 항상 네트워크 사용)
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function (e) { e.respondWith(fetch(e.request)); });
// auto-publish test: web/ 변경은 커밋 시 공개 저장소로 자동 게시됨
