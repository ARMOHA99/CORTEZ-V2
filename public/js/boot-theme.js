    (function () {
      try {
        if (localStorage.getItem('cortez.theme') === 'light') document.documentElement.setAttribute('data-theme', 'light');
      } catch (e) {}
    })();