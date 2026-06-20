define(['jquery'], function ($) {
  'use strict';

  var APP_URL = 'https://deduplicate.upsoft.app';
  var FRAME_CLASS = 'dedup-frame';
  var WRAP_CLASS = 'dedup-wrap';
  // ─────────────────────────────────────────────────────────────

  // Bulletproof dedup: no matter how many times render() fires, how many times
  // the script loads, or how many work-area containers amoCRM creates, keep at
  // most ONE iframe alive. Runs once per page.
  function startDedupGuard() {
    if (window.__dedupGuardStarted) return;
    window.__dedupGuardStarted = true;
    setInterval(function () {
      var wraps = $('.' + WRAP_CLASS);
      if (wraps.length > 1) {
        // Keep the last (most-recently rendered, in the active view); drop the rest.
        wraps.slice(0, wraps.length - 1).remove();
      }
    }, 800);
  }

  var CustomWidget = function () {
    var self = this;

    function appUrl(full) {
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
      // view=full → the complete app (advanced settings page / left-menu page);
      // view=mini → compact key-management card (the cramped marketplace popup).
      return APP_URL + '/?account=' + encodeURIComponent(subdomain) +
        '&key=' + encodeURIComponent(apiKey) +
        '&view=' + (full ? 'full' : 'mini');
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
    // Returns { $area, settings }. `settings` is true for the settings-popup
    // container, false for the full left-menu page — they need different heights.
    function findArea() {
      var code = widgetCode();
      if (code) {
        var wa = $('#work-area-' + code);
        if (wa.length) return { $area: wa.first(), settings: false };   // widget page
        var sb = $('#widget_settings_block_' + code);
        if (sb.length) return { $area: sb.first(), settings: true };    // settings popup
      }
      // The settings popup's real container is the .widget_settings_block__controls
      // class — it appears more than once, so .first() picks a single node.
      var ctrl = $('.widget_settings_block__controls');
      if (ctrl.length) return { $area: ctrl.first(), settings: true };
      var any = $('[id^="work-area-"]');                                // generic fallback
      if (any.length) return { $area: any.first(), settings: false };
      return { $area: $(), settings: false };
    }

    // Mount EXACTLY ONE iframe. amoCRM fires render() multiple times, so before
    // injecting we remove any existing .dedup-frame anywhere in the DOM — this
    // makes a second (stacked) iframe impossible. In the settings popup we keep
    // the iframe short so amoCRM's "Save" button stays reachable below it; on the
    // full page we use 85vh. Returns false until the container is in the DOM.
    function mount() {
      var found = findArea();
      var $area = found.$area;
      if (!$area.length) return false;            // container not ready yet
      // Already exactly one wrapper, sitting in this container → nothing to do.
      if ($('.' + WRAP_CLASS).length === 1 && $area.find('.' + WRAP_CLASS).length === 1) {
        return true;
      }
      $('.' + WRAP_CLASS).remove();               // remove only OUR content, not amoCRM's
      var height = found.settings ? 'min-height:420px;height:420px;' : 'min-height:85vh;';
      // APPEND (not .html) so we never wipe amoCRM's own controls — the settings
      // container holds the "Save" button, which .html() would destroy.
      $area.append(
        '<div class="' + WRAP_CLASS + '">' +
        '<iframe class="' + FRAME_CLASS + '" src="' + appUrl(!found.settings) + '" ' +
        'style="width:100%;' + height + 'border:none;display:block;" ' +
        'allow="clipboard-write"></iframe>' +
        '</div>'
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

      // Fires when the widget's page in the Settings section (advanced_settings
      // location) is opened. Mount the full app into its work-area, same as render.
      advancedSettings: function () {
        mountWithRetry(20);
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
