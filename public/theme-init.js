(function () {
  var storageKey = 'zongrui-theme-preference';
  var lightColor = '#ffffff';
  var darkColor = '#111315';
  var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function readPreference() {
    try {
      var value = window.localStorage.getItem(storageKey);
      return value === 'system' || value === 'light' || value === 'dark' ? value : 'light';
    } catch (_error) {
      return 'light';
    }
  }

  function apply(preference) {
    var resolved = preference === 'system'
      ? (media && media.matches ? 'dark' : 'light')
      : preference;
    var root = document.documentElement;
    root.dataset.theme = resolved;
    root.dataset.themePreference = preference;
    root.dataset.resolvedTheme = resolved;
    root.style.colorScheme = resolved;
    var themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.setAttribute('content', resolved === 'dark' ? darkColor : lightColor);
  }

  apply(readPreference());

  if (media && media.addEventListener) {
    media.addEventListener('change', function () {
      if (document.documentElement.dataset.themePreference === 'system') apply('system');
    });
  }
})();
