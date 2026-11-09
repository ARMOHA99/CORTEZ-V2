    (function () {
      var meta = document.querySelector('meta[name="release"]');
      var own = meta && meta.content ? String(meta.content).trim() : '';
      if (!own || own.length < 6) return;
      window.__CORTEZ_BOOT_RELEASE__ = own;
      var busy = false;
      var LAST_KEY = 'cortez.release';

      function cleanCaches() {
        var jobs = [];
        /* إلغاء أي Service Worker قديم: هو سبب بقاء الموقع على كود قديم */
        if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
          jobs.push(
            navigator.serviceWorker.getRegistrations()
              .then(function (regs) {
                return Promise.all(regs.map(function (reg) {
                  return reg.unregister().catch(function () {});
                }));
              })
              .catch(function () {})
          );
        }
        if (window.caches && window.caches.keys) {
          jobs.push(
            window.caches.keys()
              .then(function (keys) {
                return Promise.all(keys.map(function (key) { return window.caches.delete(key).catch(function () {}); }));
              })
              .catch(function () {})
          );
        }
        return Promise.all(jobs).catch(function () {});
      }

      function hardReload(next) {
        if (busy) return;
        busy = true;
        try { localStorage.setItem(LAST_KEY, String(next)); } catch (e) {}
        try { sessionStorage.setItem('cortez.reloaded', String(next)); } catch (e) {}
        var go = function () {
          try {
            var url = new URL(window.location.href);
            url.searchParams.set('_v', String(next));
            window.location.replace(url.toString());
          } catch (e) { window.location.reload(); }
        };
        cleanCaches().then(go, go);
        setTimeout(go, 2200);
      }

      function check() {
        if (busy) return;
        fetch('/api/public/version', { cache: 'no-store', credentials: 'same-origin' })
          .then(function (res) { return res.ok ? res.json() : null; })
          .then(function (data) {
            if (!data || !data.release || String(data.release) === own) return;
            try { if (sessionStorage.getItem('cortez.reloaded') === String(data.release)) return; } catch (e) {}
            var el = document.activeElement;
            var typing = el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
            if (typing) { setTimeout(function () { hardReload(String(data.release)); }, 1500); return; }
            hardReload(String(data.release));
          })
          .catch(function () {});
      }

      /* أول زيارة بعد أي نشر: الخادم أعطى إصدارًا جديدًا عن آخر إصدار عمل عليه المتصفح.
         نمسح الكاش والـ Service Worker القديم مرة واحدة ثم نعيد التحميل بكود جديد. */
      var previous = '';
      try { previous = localStorage.getItem(LAST_KEY) || ''; } catch (e) {}
      try { localStorage.setItem(LAST_KEY, own); } catch (e) {}
      if (previous && previous !== own) {
        cleanCaches().then(function () {
          if (document.readyState === 'complete' || document.readyState === 'interactive') {
            var url = new URL(window.location.href);
            url.searchParams.set('_v', own);
            window.location.replace(url.toString());
          } else {
            window.addEventListener('load', function () {
              var url = new URL(window.location.href);
              url.searchParams.set('_v', own);
              window.location.replace(url.toString());
            });
          }
        });
        return;
      }

      /* لو الصفحة تعمل بكود قديم (بطاقة الإصدار لا تطابق إصدار الخادم)
         نمسح الكاش ونعيد التحميل مرة واحدة لكل جلسة حتى يتعافى الجميع. */
      function detectStaleBundle() {
        var label = document.getElementById('release-label');
        if (!label || busy) return;
        var shown = String(label.textContent || '').trim();
        var expected = 'v' + own.slice(0, 7);
        if (shown === expected) return;
        var onceKey = 'cortez.stale.' + own;
        try {
          if (sessionStorage.getItem(onceKey)) return;
          sessionStorage.setItem(onceKey, '1');
        } catch (e) {}
        hardReload(own);
      }
      setTimeout(detectStaleBundle, 9000);

      setTimeout(check, 3000);
      setInterval(check, 20000);
      document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') check(); });
      window.addEventListener('focus', check);
      window.addEventListener('online', check);
      window.__cortezVersionGuard = { check: check, own: own, reload: hardReload };

      /* تحديث ملف الـ Service Worker نفسه */
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
        navigator.serviceWorker.getRegistrations()
          .then(function (regs) { regs.forEach(function (r) { if (r.update) r.update().catch(function () {}); }); })
          .catch(function () {});
      }
    })();