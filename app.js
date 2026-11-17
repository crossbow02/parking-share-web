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

  var VERSION = '2026.11.17-2';

  // 집: "집 B3" / 외부: "야외" (캘린더 제목과 같은 규칙)
  function label(o) {
    return o.mode === 'home' ? '집 ' + (o.floor || '층 미입력') : (o.floor || '야외');
  }

  function showHistory() {
    api({ action: 'history', n: 10 }).then(function (r) {
      if (!r || !r.ok || !r.rows || !r.rows.length) { $('hist').hidden = true; return; }
      var ul = $('histList'); ul.innerHTML = '';
      r.rows.forEach(function (o) {
        var li = document.createElement('li');
        var link = document.createElement('a');
        link.href = 'https://maps.google.com/?q=' + o.lat + ',' + o.lng;
        link.target = '_blank'; link.rel = 'noopener';
        link.textContent = String(o.time).substr(5, 11) + ' · ' + (o.who || '') + ' · ' + label(o);
        li.appendChild(link);
        ul.appendChild(li);
      });
      $('hist').hidden = false;
    }).catch(function () { $('hist').hidden = true; });
  }

  function showLast() {
    function fail(title, info) {
      $('last').hidden = false;
      $('lastFloor').textContent = title;
      $('lastInfo').textContent = info;
      $('lastMap').hidden = true;
    }
    api({ action: 'latest' }).then(function (r) {
      if (!r || !r.ok) {
        fail('불러오기 실패', r && r.error === 'unauthorized'
          ? '토큰이 서버와 달라요. ⚙ 설정의 토큰과 앱스크립트 속성 TOKEN을 확인하세요.'
          : '서버 응답 오류: ' + ((r && r.error) || '알 수 없음'));
        return;
      }
      var l = r.latest;
      if (!l) { fail('기록 없음', '아직 저장된 주차 기록이 없어요.'); return; }
      $('last').hidden = false;
      $('lastMap').hidden = false;
      $('lastFloor').textContent = label(l);
      $('lastInfo').textContent = l.time + ' · ' + l.who;
      $('lastMap').href = 'https://maps.google.com/?q=' + l.lat + ',' + l.lng;
      showHistory();
    }).catch(function () {
      fail('불러오기 실패', '네트워크 또는 웹 앱 URL을 확인하세요.');
    });
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

      var d = hasHome ? Math.round(dist(lat, lng, +S.hlat, +S.hlng)) : null;
      var rad = +S.rad || 150;

      return api({ action: 'park', id: id, who: S.who || '', lat: lat, lng: lng, mode: inHome ? 'home' : 'auto' })
        .then(function (r) {
          if (!r || !r.ok) throw new Error('서버 저장 실패 (URL/토큰 확인)');

          // 층 버튼은 항상 만들어 두고, 집 근처면 바로 보여주고 아니면 수동 버튼으로 열기
          var box = $('floors'); box.innerHTML = '';
          var old = $('manualFloor'); if (old) old.remove();
          floorsList().forEach(function (f) {
            var b = document.createElement('button');
            b.textContent = f;
            b.onclick = function () {
              b.disabled = true;
              api({ action: 'floor', id: id, floor: f, mode: 'home' }).then(function (r2) {
                if (!r2 || !r2.ok) throw 0;
                $('floorBox').hidden = true;
                $('msg').className = 'big ok';
                $('msg').textContent = '✓ 집 ' + f + ' 저장 완료';
                $('sub').textContent = '';
                showLast();
              }).catch(function () { b.disabled = false; $('sub').textContent = '저장 실패 – 다시 눌러주세요'; });
            };
            box.appendChild(b);
          });
          showLast();

          if (inHome) {
            $('msg').textContent = '집 근처예요';
            $('sub').textContent = '층을 선택하세요 (위치는 이미 저장됨)';
            $('floorBox').hidden = false;
          } else {
            $('msg').className = 'big ok';
            $('msg').textContent = '✓ 주차 위치 자동 저장';
            $('sub').textContent = (hasHome
              ? '집까지 약 ' + d + 'm (집 반경 ' + rad + 'm 밖)'
              : '집 위치가 설정되지 않았어요 (⚙ 설정)') + ' · 정확도 약 ' + Math.round(pos.coords.accuracy) + 'm';
            var m = document.createElement('button');
            m.id = 'manualFloor'; m.className = 'sec'; m.textContent = '🏠 집에 주차했어요 (층 입력)';
            m.onclick = function () {
              m.remove();
              $('msg').className = 'big';
              $('msg').textContent = '층을 선택하세요';
              $('floorBox').hidden = false;
            };
            $('run').insertBefore(m, $('retry'));
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

  $('ver').textContent = '버전 ' + VERSION;

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
