define(['jquery'], function ($) {
  'use strict';

  var APP_URL = 'https://memotrek.app';
  // ─────────────────────────────────────────────────────────────

  var CustomWidget = function () {
    var self = this;

    function appUrl() {
      var subdomain = '';
      try {
        subdomain = self.system().subdomain || '';
      } catch (e) {}
      return APP_URL + '/?account=' + encodeURIComponent(subdomain);
    }

    function renderIframe($container) {
      $container.html(
        '<iframe src="' + appUrl() + '" ' +
        'style="width:100%;min-height:85vh;border:none;display:block;" ' +
        'allow="clipboard-write"></iframe>'
      );
    }

    this.callbacks = {
      // Widget settings popup (in amoCRM settings → integrations).
      settings: function () {
        return true;
      },

      // Called once on load. Return true to allow render.
      init: function () {
        return true;
      },

      bind_actions: function () {
        return true;
      },

      // Main render. Fires for each location the widget is shown in.
      render: function () {
        var area = '';
        try {
          area = self.system().area;
        } catch (e) {}

        // Full-page tab in the left menu.
        if (area === 'widget_page' || area === 'settings') {
          var code = self.get_settings().widget_code;
          // amoCRM mounts the widget page into #work-area-<widget_code>.
          var $area = $('#work-area-' + code);
          if (!$area.length) {
            // Fallback container used by some amoCRM versions.
            $area = $('.widget_settings_block__controls, #widget_settings_block_' + code);
          }
          if ($area.length) {
            renderIframe($area);
          }
        }
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
