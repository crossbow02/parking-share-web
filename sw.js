// 설치 조건용 최소 서비스 워커.
// 같은 사이트 파일은 항상 서버에 새 버전이 있는지 확인(no-cache)해서 업데이트가 바로 반영되게 함.
// 앱스크립트(외부) 요청은 건드리지 않음.
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }));
});
