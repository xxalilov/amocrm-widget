define(['jquery'], function ($) {
  'use strict';

  var APP_URL = 'https://deduplicate.upsoft.app';
  var FRAME_CLASS = 'dedup-frame';
  var WRAP_CLASS = 'dedup-wrap';
  // ─────────────────────────────────────────────────────────────

  // ── Native (штатный) merge over amoCRM's own frontend AJAX endpoints ──
  // amoCRM's real merge ("Поиск дублей → Объединить") is NOT in the public
  // OAuth REST API — it's a session-based frontend flow:
  //   1) POST /ajax/merge/{contacts|leads}/info/  id[]=A&id[]=B
  //   2) POST /ajax/merge/{contacts|leads}/save    result_element[...]  → job_id
  //   3) GET  /ajax/v1/multiactions/status?...job_id=...  (poll until status=2)
  // These need the logged-in session cookie and can ONLY run here (the widget
  // is same-origin with the amoCRM page). The iframe SPA is on another origin,
  // so it asks us to merge via postMessage and we report the result back.

  function htmlUnescape(s) {
    if (typeof s !== 'string') return s;
    return s.replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
            .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  }

  function mergeAjax(url, method, data) {
    return $.ajax({
      url: url,
      method: method,
      data: data,
      dataType: 'json',
      contentType: 'application/x-www-form-urlencoded; charset=UTF-8',
      headers: { 'X-Requested-With': 'XMLHttpRequest' }
    });
  }

  // Pick a scalar value for a single-value field: prefer the surviving (main)
  // record, then any value amoCRM pre-selected, then the first non-empty one —
  // so a field filled only on a duplicate is never lost.
  function pickSingle(perEl, mainKey) {
    function firstVal(el) {
      var vs = (perEl[el] && perEl[el].values) || [];
      return vs.length ? vs[0].value : null;
    }
    var mv = firstVal(mainKey);
    if (mv != null && mv !== '') return mv;
    var el, vs, i;
    for (el in perEl) {
      vs = perEl[el].values || [];
      for (i = 0; i < vs.length; i++) if (vs[i].selected) return vs[i].value;
    }
    for (el in perEl) {
      var v = firstVal(el);
      if (v != null && v !== '') return v;
    }
    return null;
  }

  // Build the urlencoded `save` body from the info/ response. Multi-value fields
  // (email/phone, linked leads/contacts/tags) are UNION-ed across all records so
  // no data is lost; single-value fields take the surviving record's value.
  function buildMergeBody(resp, mainId, ids) {
    var parts = [];
    function push(k, v) { parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(v)); }

    var i;
    for (i = 0; i < ids.length; i++) push('id[]', ids[i]);

    var fields = resp.compare_fields || {};
    var values = resp.compare_values || {};
    var mainKey = String(mainId);
    var field;

    for (field in fields) {
      if (!fields.hasOwnProperty(field)) continue;
      var perEl = values[field] || {};
      var el, seen, arr, j;

      // Linked tags: union of tag ids.
      if (field === 'TAGS') {
        seen = {};
        for (el in perEl) {
          arr = perEl[el].values || [];
          for (j = 0; j < arr.length; j++) {
            var tid = arr[j].value;
            if (tid != null && !seen[tid]) { seen[tid] = 1; push('result_element[TAGS][]', tid); }
          }
        }
        continue;
      }

      // Linked entities: value is a { id: {...} } map; union the ids.
      if (field === 'CONTACTS' || field === 'LEADS') {
        seen = {};
        for (el in perEl) {
          arr = perEl[el].values || [];
          for (j = 0; j < arr.length; j++) {
            var obj = arr[j].value;
            if (obj && typeof obj === 'object') {
              for (var oid in obj) {
                if (obj.hasOwnProperty(oid) && !seen[oid]) { seen[oid] = 1; push('result_element[' + field + '][]', oid); }
              }
            } else if (obj != null && !seen[obj]) {
              seen[obj] = 1; push('result_element[' + field + '][]', obj);
            }
          }
        }
        continue;
      }

      // Custom fields (cfv_<id>). Multi-value (email/phone) → union & dedupe;
      // otherwise a single value from the surviving record.
      if (field.indexOf('cfv_') === 0) {
        var num = field.slice(4);
        var multi = false;
        var collected = [];
        var valSeen = {};
        for (el in perEl) {
          arr = perEl[el].values || [];
          for (j = 0; j < arr.length; j++) {
            var raw = arr[j].value;
            if (typeof raw === 'string' && raw.indexOf('VALUE') !== -1) {
              var json = htmlUnescape(raw);
              try {
                var parsed = JSON.parse(json);
                multi = true;
                var dk = (parsed.VALUE == null ? '' : String(parsed.VALUE)).toLowerCase();
                if (!valSeen[dk]) { valSeen[dk] = 1; collected.push(json); }
                continue;
              } catch (e) {}
            }
            collected.push(raw);
          }
        }
        if (multi) {
          for (j = 0; j < collected.length; j++) push('result_element[cfv][' + num + '][]', collected[j]);
        } else {
          var sv = pickSingle(perEl, mainKey);
          if (sv != null) push('result_element[cfv][' + num + ']', sv);
        }
        continue;
      }

      // Creation date: amoCRM keeps the EARLIEST across all records (the entity
      // has existed since then), regardless of which record survives.
      if (field === 'DATE_CREATE') {
        var minDate = null;
        for (el in perEl) {
          arr = perEl[el].values || [];
          for (j = 0; j < arr.length; j++) {
            var dv = arr[j].value;
            if (dv && (minDate === null || String(dv) < minDate)) minDate = String(dv);
          }
        }
        if (minDate != null) push('result_element[DATE_CREATE]', minDate);
        continue;
      }

      // Scalar fields: NAME, MAIN_USER_ID, PRICE, STATUS, COMPANY_UID…
      var sval = pickSingle(perEl, mainKey);
      if (sval != null) push('result_element[' + field + ']', sval);
    }

    push('result_element[ID]', mainId);
    return parts.join('&');
  }

  function pollMerge(jobId, tries) {
    var url = '/ajax/v1/multiactions/status?request[multiactions][status][0][job_id]=' + encodeURIComponent(jobId);
    return mergeAjax(url, 'GET', null).then(function (resp) {
      var st = null;
      try { st = resp.response.multiactions.status.data[0]; } catch (e) {}
      if (st && Number(st.status) === 2) return st;       // done
      if (tries <= 0) return st || {};                     // stop polling gracefully
      return new Promise(function (r) { setTimeout(r, 1200); })
        .then(function () { return pollMerge(jobId, tries - 1); });
    });
  }

  // Run one native merge: entity = 'contacts' | 'leads'; ids includes mainId.
  function nativeMerge(entity, mainId, ids) {
    var base = '/ajax/merge/' + entity;
    var idData = '';
    for (var i = 0; i < ids.length; i++) {
      idData += (i ? '&' : '') + 'id[]=' + encodeURIComponent(ids[i]);
    }
    return mergeAjax(base + '/info/', 'POST', idData).then(function (info) {
      if (!info || info.status !== 'success' || !info.response) {
        throw new Error('merge info failed');
      }
      var body = buildMergeBody(info.response, mainId, ids);
      return mergeAjax(base + '/save', 'POST', body);
    }).then(function (saveResp) {
      var jobId = null;
      try { jobId = saveResp.response.multiactions.set.data[0].job_id; } catch (e) {}
      if (!jobId) throw new Error('merge save: no job id');
      return pollMerge(jobId, 40);
    });
  }

  // Bridge: the iframe SPA posts { source:'dedup-spa', action:'merge', reqId,
  // type, mainId, ids }; we run the native merge and reply { source:'dedup-host',
  // reqId, ok, error }. Registered once per page.
  function startMergeBridge() {
    if (window.__dedupMergeBridge) return;
    window.__dedupMergeBridge = true;
    window.addEventListener('message', function (ev) {
      if (ev.origin !== APP_URL) return;
      var msg = ev.data;
      if (!msg || msg.source !== 'dedup-spa' || msg.action !== 'merge') return;
      function reply(ok, error) {
        try { ev.source.postMessage({ source: 'dedup-host', reqId: msg.reqId, ok: ok, error: error || null }, APP_URL); } catch (e) {}
      }
      var entity = msg.type === 'lead' ? 'leads' : 'contacts';
      var mainId = String(msg.mainId || '');
      var ids = (msg.ids || []).map(String);
      if (!mainId || ids.length < 2) { reply(false, 'bad request'); return; }
      nativeMerge(entity, mainId, ids)
        .then(function () { reply(true); })
        .catch(function (e) { reply(false, (e && e.message) || 'merge failed'); });
    });
  }

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
        startMergeBridge();
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
