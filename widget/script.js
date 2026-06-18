define(['jquery'], function ($) {
  'use strict';

  var APP_URL = 'https://deduplicate.upsoft.app';
  var WIDGET_VERSION = '1.0.7';
  var FRAME_CLASS = 'dedup-frame';
  // ─────────────────────────────────────────────────────────────

  // Bulletproof dedup: no matter how many times render() fires, how many times
  // the script loads, or how many work-area containers amoCRM creates, keep at
  // most ONE iframe alive. Runs once per page.
  function startDedupGuard() {
    if (window.__dedupGuardStarted) return;
    window.__dedupGuardStarted = true;
    setInterval(function () {
      var frames = $('iframe.' + FRAME_CLASS);
      if (frames.length > 1) {
        // Keep the last (most-recently rendered, in the active view); drop the rest.
        frames.slice(0, frames.length - 1).remove();
      }
    }, 800);
  }

  var CustomWidget = function () {
    var self = this;

    function appUrl() {
      var subdomain = '';
      try {
        subdomain = self.system().subdomain || '';
      } catch (e) {}
      // The API key is configured in the widget settings (field "API key") and
      // passed to the iframe, which sends it as a Bearer token on every request.
      var apiKey = '';
      try {
        apiKey = self.get_settings().api_key || '';
      } catch (e) {}
      return APP_URL + '/?account=' + encodeURIComponent(subdomain) +
        '&key=' + encodeURIComponent(apiKey);
    }

    function widgetCode() {
      var code = '';
      try { code = self.get_settings().widget_code || ''; } catch (e) {}
      if (!code) {
        try { code = (self.params && self.params.widget_code) || ''; } catch (e) {}
      }
      return code;
    }

    // Locate the mount container, returning EXACTLY ONE element. amoCRM uses
    // different containers per location:
    //   • left-menu widget page → #work-area-<code>
    //   • settings popup        → #widget_settings_block_<code>
    // We try unique IDs only (never the .widget_settings_block__controls class,
    // which matches multiple nodes and was the source of the duplicate iframe).
    function findArea() {
      var code = widgetCode();
      var sels = [];
      if (code) {
        sels.push('#work-area-' + code);              // widget_page (left menu)
        sels.push('#widget_settings_block_' + code);   // settings popup (id form)
      }
      // The settings popup's real container is the .widget_settings_block__controls
      // class — it appears more than once, so .first() picks a single node (this
      // multi-match was the duplicate-iframe cause in the old code).
      sels.push('.widget_settings_block__controls');
      sels.push('[id^="work-area-"]');                 // generic fallback
      for (var i = 0; i < sels.length; i++) {
        var $a = $(sels[i]).first();
        if ($a.length) return $a;
      }
      return $();
    }

    // Mount EXACTLY ONE iframe. amoCRM fires render() multiple times, so before
    // injecting we remove any existing .dedup-frame anywhere in the DOM — this
    // makes a second (stacked) iframe impossible regardless of how often render
    // runs or how many work-area containers exist. Returns true once mounted,
    // false if the container isn't in the DOM yet (so polling keeps trying).
    function mount() {
      var $area = findArea();
      if (!$area.length) return false;            // container not ready yet
      // Already exactly one frame, sitting in this container → nothing to do.
      if ($('iframe.dedup-frame').length === 1 && $area.find('iframe.dedup-frame').length === 1) {
        return true;
      }
      $('iframe.dedup-frame').remove();           // wipe any stray/duplicate frames
      // Visible version badge so we can confirm which script version amoCRM
      // actually loaded (the widget linter forbids logging to the dev tools).
      $area.html(
        '<div style="font:11px/1.4 sans-serif;color:#9aa;padding:2px 0 6px;">widget v' + WIDGET_VERSION + '</div>' +
        '<iframe class="dedup-frame" src="' + appUrl() + '" ' +
        'style="width:100%;min-height:85vh;border:none;display:block;" ' +
        'allow="clipboard-write"></iframe>'
      );
      return true;
    }

    // On a normal page load the work-area is created slightly after render()
    // fires, so poll for it briefly. The dedup guard in mount() keeps this from
    // ever injecting a second iframe.
    function mountWithRetry(attempts) {
      if (mount()) return;
      if (attempts <= 0) return;
      setTimeout(function () { mountWithRetry(attempts - 1); }, 300);
    }

    this.callbacks = {
      // Widget settings popup (in amoCRM settings → integrations).
      settings: function () {
        return true;
      },

      // Called once on load. Return true to allow render.
      init: function () {
        startDedupGuard();
        return true;
      },

      bind_actions: function () {
        return true;
      },

      // Main render. Fires (sometimes more than once) for each location the
      // widget is shown in. We don't gate on system().area — we just look for the
      // work-area container and mount once if/when it appears. Polling handles the
      // page-load timing (container not ready yet) so it no longer needs a
      // disable→enable cycle, and the dedup guard prevents a second iframe.
      render: function () {
        mountWithRetry(20);   // ~6s of polling
        return true;
      },

      // Called when the user installs / saves the integration.
      onSave: function () {
        return true;
      },

      destroy: function () {},

      contacts: {
        selected: function () {}
      },
      leads: {
        selected: function () {}
      }
    };

    return this;
  };

  return CustomWidget;
});
