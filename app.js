(function () {
  var $ = function (id) { return document.getElementById(id); };
  var KEY = 'parkshare.v1';

  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }
  var S = load();

  // 링크로 설정 전달: ?u=...&t=...&who=...  (배우자 폰 설정용). 적용 후 주소창에서 제거
  var q = new URLSearchParams(location.search);
  if (q.get('u') || q.get('t')) {
    ['u', 't', 'who', 'fl', 'rad'].forEach(function (k) { if (q.get(k)) S[k] = q.get(k); });
    save(S);
    history.replaceState(null, '', location.pathname);
  }

  function api(params) {
    var qs = new URLSearchParams(Object.assign({ token: S.t }, params)).toString();
    return fetch(S.u + '?' + qs, { redirect: 'follow' }).then(function (r) { return r.json(); });
  }

  function dist(a, b, c, d) { // 미터 (haversine)
    var R = 6371000, rad = Math.PI / 180;
    var dLat = (c - a) * rad, dLng = (d - b) * rad;
    var x = Math.sin(dLat / 2) ** 2 + Math.cos(a * rad) * Math.cos(c * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  }

  function getPos() {
    return new Promise(function (res, rej) {
      if (!navigator.geolocation) return rej(new Error('이 브라우저는 위치를 지원하지 않아요'));
      navigator.geolocation.getCurrentPosition(res, rej,
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
    });
  }

  function floorsList() {
    return (S.fl || 'B2,B3,B4').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
  }

  function showLast() {
    api({ action: 'latest' }).then(function (r) {
      var l = r && r.latest;
      if (!l) { $('last').hidden = true; return; }
      $('last').hidden = false;
      $('lastFloor').textContent = l.floor || '층 미입력';
      $('lastInfo').textContent = l.time + ' · ' + l.who;
      $('lastMap').href = 'https://maps.google.com/?q=' + l.lat + ',' + l.lng;
    }).catch(function () {});
  }

  // ── 메인 흐름: 위치 → 집 안/밖 판단 → 저장 (집 안이면 층 선택) ──
  function run() {
    $('setup').hidden = true;
    $('run').hidden = false;
    $('floorBox').hidden = true;
    $('retry').hidden = true;
    $('msg').className = 'big';
    $('msg').textContent = '위치 확인 중…';
    $('sub').textContent = '';

    getPos().then(function (pos) {
      var lat = pos.coords.latitude, lng = pos.coords.longitude;
      var id = String(Date.now());
      var hasHome = S.hlat && S.hlng;
      var inHome = hasHome && dist(lat, lng, +S.hlat, +S.hlng) <= (+S.rad || 150);

      return api({ action: 'park', id: id, who: S.who || '', lat: lat, lng: lng, mode: inHome ? 'home' : 'auto' })
        .then(function (r) {
          if (!r || !r.ok) throw new Error('서버 저장 실패 (URL/토큰 확인)');
          if (!inHome) {
            $('msg').className = 'big ok';
            $('msg').textContent = '✓ 주차 위치 자동 저장';
            $('sub').textContent = '정확도 약 ' + Math.round(pos.coords.accuracy) + 'm';
            showLast();
          } else {
            $('msg').textContent = '집 근처예요';
            $('sub').textContent = '층을 선택하세요 (위치는 이미 저장됨)';
            var box = $('floors'); box.innerHTML = '';
            floorsList().forEach(function (f) {
              var b = document.createElement('button');
              b.textContent = f;
              b.onclick = function () {
                b.disabled = true;
                api({ action: 'floor', id: id, floor: f }).then(function (r2) {
                  if (!r2 || !r2.ok) throw 0;
                  $('floorBox').hidden = true;
                  $('msg').className = 'big ok';
                  $('msg').textContent = '✓ ' + f + ' 저장 완료';
                  $('sub').textContent = '';
                  showLast();
                }).catch(function () { b.disabled = false; $('sub').textContent = '저장 실패 – 다시 눌러주세요'; });
              };
              box.appendChild(b);
            });
            $('floorBox').hidden = false;
            showLast(); // 새 기록(층 미입력)으로 '가장 최근 주차' 카드 갱신
          }
        });
    }).catch(function (e) {
      $('msg').textContent = '실패';
      $('sub').textContent = (e && e.code === 1)
        ? '위치 권한이 거부됐어요. 주소창 자물쇠 → 권한 → 위치 → 허용'
        : ((e && e.message) || '위치를 가져오지 못했어요');
      $('retry').hidden = false;
    });
  }

  // ── 설정 화면 ──
  function openSetup() {
    $('run').hidden = true;
    $('setup').hidden = false;
    $('u').value = S.u || ''; $('t').value = S.t || ''; $('who').value = S.who || '';
    $('fl').value = S.fl || 'B2,B3,B4'; $('rad').value = S.rad || '150';
    $('homeInfo').textContent = S.hlat ? '집 위치 설정됨' : '집 위치 미설정 (설정 전에는 항상 자동 저장만 됩니다)';
  }
  $('setHome').onclick = function () {
    $('homeInfo').textContent = '위치 확인 중…';
    getPos().then(function (p) {
      S.hlat = p.coords.latitude; S.hlng = p.coords.longitude; save(S);
      $('homeInfo').textContent = '집 위치 설정됨 ✓';
    }).catch(function () { $('homeInfo').textContent = '위치를 가져오지 못했어요 (권한 확인)'; });
  };
  $('save').onclick = function () {
    S.u = $('u').value.trim(); S.t = $('t').value.trim(); S.who = $('who').value.trim();
    S.fl = $('fl').value.trim(); S.rad = $('rad').value.trim();
    save(S);
    start();
  };

  $('toSetup').onclick = openSetup;
  $('again').onclick = function () {
    if (window.PARK_AUTO || confirm('지금 위치를 새 주차 위치로 기록할까요?')) run();
  };
  $('retry').onclick = run;

  function start() {
    if (!S.u || !S.t) { openSetup(); return; }
    showLast();
    // ?view=1 이면 기록 없이 조회만
    if (!window.PARK_AUTO) return; // 확인용 앱은 열어도 기록하지 않음
    run();
  }
  start();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register(window.PARK_SW || 'sw.js').catch(function () {});
})();
