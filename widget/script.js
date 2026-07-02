define(['jquery'], function ($) {
  'use strict';

  var APP_URL = 'https://deduplicate.upsoft.app';
  var BACKEND_URL = 'https://api.deduplicate.upsoft.app';
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
      var entity = msg.type === 'lead' ? 'leads' : msg.type === 'company' ? 'companies' : 'contacts';
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
    // The account's API key. We fill it without any user action: prefer a manually
    // entered settings value (backward compatible), otherwise fetch it once from the
    // backend by subdomain (the backend only returns it to this account's own amo
    // page — see /auth/widget-key). Until it arrives the SPA still authorizes via
    // the X-Account-Subdomain header, so a slow/failed fetch never blocks the app.
    var cachedKey = '';
    var keyResolved = false;

    function subdomain() {
      try { return self.system().subdomain || ''; } catch (e) { return ''; }
    }

    function settingsKey() {
      try { return self.get_settings().api_key || ''; } catch (e) { return ''; }
    }

    // Resolves the API key (once) and calls cb(). Never blocks: on any error it
    // proceeds with an empty key and the SPA falls back to subdomain auth.
    function ensureKey(cb) {
      if (keyResolved) { cb(); return; }
      var manual = settingsKey();
      if (manual) { cachedKey = manual; keyResolved = true; cb(); return; }
      var sub = subdomain();
      if (!sub) { keyResolved = true; cb(); return; }
      $.ajax({ url: BACKEND_URL + '/auth/widget-key', method: 'GET', data: { subdomain: sub }, dataType: 'json' })
        .done(function (resp) { if (resp && resp.key) cachedKey = resp.key; })
        .always(function () { keyResolved = true; cb(); });
    }

    function appUrl(full) {
      // view=full → the complete app (advanced settings page / left-menu page);
      // view=mini → compact key-management card (the cramped marketplace popup).
      return APP_URL + '/?account=' + encodeURIComponent(subdomain()) +
        '&key=' + encodeURIComponent(cachedKey) +
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
    // ever injecting a second iframe. We resolve the API key first so the iframe
    // is created once, already carrying the key (no reload needed).
    function mountWithRetry(attempts) {
      ensureKey(function () {
        if (mount()) return;
        if (attempts <= 0) return;
        setTimeout(function () { mountWithRetry(attempts - 1); }, 300);
      });
    }

    // amoCRM mandates a settings field, which it renders as a text input. We have
    // no real setting (the key is fetched automatically), so hide that native
    // input row — only our iframe should show in the settings popup. Retries a few
    // times since the form may still be rendering. (Same approach as other widgets.)
    function hideNativeSettingsField(attempts) {
      var $input = $('input[name="info"]');
      if ($input.length) {
        $input.hide();
        // Hide the whole field row too — amoCRM's wrapper class varies by build,
        // so try the known ones and fall back to the input's parent.
        var $row = $input.closest('.widget_settings_block__item_field, .widget_settings_block__item, .control, .input__wrapper, .field');
        if ($row.length) $row.hide(); else $input.parent().hide();
        return;
      }
      if (attempts <= 0) return;
      setTimeout(function () { hideNativeSettingsField(attempts - 1); }, 200);
    }

    // ── Background auto-merge ────────────────────────────────────────────────
    // When auto-merge is enabled (per entity type, in the widget settings), the
    // backend hands out a "run now" lease on a schedule; we do the actual work
    // here — scan via the backend, then run amoCRM's STILL native merge in this
    // session for each group. So auto-merge is a real merge, but only advances
    // while amoCRM is open (the backend simply pauses the schedule otherwise).
    // The backend lease ensures only ONE open tab runs a given type at a time.
    function startAutoRunner() {
      if (window.__dedupAutoRunner) return;
      window.__dedupAutoRunner = true;
      var sub = subdomain();
      if (!sub) return; // can't authenticate without it

      function autoApi(path, method, data) {
        var headers = { 'X-Account-Subdomain': sub };
        if (cachedKey) headers['Authorization'] = 'Bearer ' + cachedKey;
        // Wrap the jqXHR in a native Promise: amoCRM's bundled jQuery is old, and
        // its jqXHR has no .catch() (added only in jQuery 3). Promise.resolve adopts
        // the thenable, so the whole chain gets real .then()/.catch().
        return Promise.resolve($.ajax({
          url: BACKEND_URL + '/auto' + path,
          method: method,
          data: data ? JSON.stringify(data) : undefined,
          contentType: 'application/json; charset=UTF-8',
          dataType: 'json',
          headers: headers
        }));
      }

      // Diagnostics hook — no-op. Flip the body to console.log(...) temporarily
      // if you need to trace the auto-runner; left silent in production.
      function dlog() {}

      function pollScan(jobId) {
        return autoApi('/jobs/' + encodeURIComponent(jobId), 'GET', null).then(function (job) {
          if (job.status === 'done') return job;
          if (job.status === 'error') throw new Error(job.error || 'scan failed');
          return new Promise(function (r) { setTimeout(r, 2000); })
            .then(function () { return pollScan(jobId); });
        });
      }

      // Merge every group of one type, one at a time, via the native merge.
      function mergeGroups(type, groups) {
        var entity = type === 'lead' ? 'leads' : type === 'company' ? 'companies' : 'contacts';
        var merged = 0, failed = 0, i = 0;
        function step() {
          if (i >= groups.length) return Promise.resolve({ merged: merged, failed: failed });
          var g = groups[i++];
          var items = (g && g.items) || [];
          if (items.length < 2) return step();
          var ids = items.map(function (it) { return String(it.id); });
          var mainId = ids[0];
          return nativeMerge(entity, mainId, ids).then(function () {
            merged++;
            var dupSnapshot = items.slice(1).map(function (it) { return { id: it.id, name: it.name || '' }; });
            return autoApi('/merge/log', 'POST', {
              type: type,
              mainId: Number(mainId),
              duplicateIds: ids.slice(1).map(Number),
              mainName: items[0].name || '',
              duplicates: dupSnapshot
            }).catch(function () {});
          }, function () { failed++; }).then(step);
        }
        return step();
      }

      function runOne(type) {
        var token = null;
        var hb = null;  // heartbeat interval, keeps the lease alive during the run
        function stopHb() { if (hb) { clearInterval(hb); hb = null; } }

        return autoApi('/claim', 'POST', { type: type }).then(function (resp) {
          dlog('claim', type, resp);
          if (!resp || !resp.run) return null;        // disabled, not due, or busy
          token = resp.token;
          dlog('run started:', type, '(token ' + token + ')');
          // Keep the lease alive while we work (scan + merge can take minutes).
          hb = setInterval(function () {
            autoApi('/heartbeat', 'POST', { type: type, token: token }).catch(function () {});
          }, 45000);

          return autoApi('/find-all-duplicates', 'POST', { type: type })
            .then(function (s) { dlog('scan job started:', type, s); return pollScan(s.jobId); })
            .then(function (job) {
              var n = (job.groups || []).length;
              dlog('scan done:', type, '— duplicate groups:', n, '(scanned', job.scanned, 'records)');
              return mergeGroups(type, job.groups || []);
            })
            .then(function (r) {
              dlog('merge done:', type, '— merged', r.merged, 'failed', r.failed);
              return autoApi('/complete', 'POST', { type: type, token: token, merged: r.merged, failed: r.failed });
            });
        }).then(function () { stopHb(); }, function (e) {
          stopHb();
          dlog('ERROR in run', type, '—', (e && e.message) || e);
          // Always release the lease so the schedule isn't stuck on this tab.
          if (token) {
            return autoApi('/complete', 'POST', {
              type: type, token: token, merged: 0, failed: 0,
              error: (e && e.message) || 'auto run failed'
            }).catch(function () {});
          }
        });
      }

      var busy = false;
      function tick() {
        if (busy) return;
        busy = true;
        // Contacts first (lead grouping can depend on contact duplicates), then
        // companies, then leads. Start from Promise.resolve() so even a synchronous
        // throw inside runOne is caught here and never leaves `busy` stuck.
        Promise.resolve()
          .then(function () { return runOne('contact'); })
          .then(function () { return runOne('company'); })
          .then(function () { return runOne('lead'); })
          .then(function () { busy = false; }, function () { busy = false; });
      }

      // Claim immediately on open — so a due run starts the moment the user enters
      // amoCRM ("men kirdim") — then poll once a minute. Cadence is still governed
      // by the backend (claim returns run:false until the interval elapses, and a
      // not-due account just gets run:false instantly).
      tick();
      setInterval(tick, 60000);
    }

    // ── Duplicate prevention (block save) ────────────────────────────────────
    // When enabled (contact settings → «Блокировать создание дублей»), intercept
    // the contact card's Save click, check the entered phone/email against the
    // backend, and if a match exists show a popup with a link and keep the save
    // blocked. This hooks amoCRM's own DOM Save button (no public API for it), so
    // it's defensive: on any uncertainty it lets the save through rather than
    // trapping the user.
    function startDuplicateGuard() {
      if (window.__dedupPreventGuard) return;
      window.__dedupPreventGuard = true;
      var sub = subdomain();
      if (!sub) return;

      function preventApi(path, method, data) {
        var headers = { 'X-Account-Subdomain': sub };
        if (cachedKey) headers['Authorization'] = 'Bearer ' + cachedKey;
        return Promise.resolve($.ajax({
          url: BACKEND_URL + path,
          method: method,
          data: data ? JSON.stringify(data) : undefined,
          contentType: 'application/json; charset=UTF-8',
          dataType: 'json',
          headers: headers
        }));
      }

      var cfg = { contact: false, company: false };
      // Install the interceptor if prevention is on for contacts or companies.
      preventApi('/api/prevent-config', 'GET', null).then(function (c) {
        cfg.contact = !!(c && c.contact);
        cfg.company = !!(c && c.company);
        if (cfg.contact || cfg.company) installGuard();
      }).catch(function () {});

      var allowNext = false;

      // Which entity card are we on: 'contact' | 'company' | null.
      function cardType() {
        var s = location.pathname + location.hash;
        if (s.indexOf('/contacts/') !== -1) return 'contact';
        if (s.indexOf('/companies/') !== -1) return 'company';
        return null;
      }

      function currentEntityId(type) {
        var re = type === 'company' ? /companies\/detail\/(\d+)/ : /contacts\/detail\/(\d+)/;
        var m = (location.pathname + location.hash).match(re);
        return m ? m[1] : '';
      }

      // Find the clicked Save button (by visible text) within the card.
      function saveButtonFrom(target) {
        var el = target;
        for (var i = 0; el && i < 6; i++) {
          var tag = (el.tagName || '').toLowerCase();
          if (tag === 'button' || (el.className && String(el.className).indexOf('button-input') !== -1)) {
            var txt = (el.textContent || '').trim().toLowerCase();
            if (txt.indexOf('сохранить') !== -1 || txt === 'save') return el;
          }
          el = el.parentNode;
        }
        return null;
      }

      var EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
      function looksLikePhone(v) {
        return /^[+\d\s()\-]+$/.test(v) && v.replace(/\D/g, '').length >= 6;
      }
      function inputMeta(inp) {
        return ((inp.name || '') + ' ' + (inp.className || '') + ' ' + (inp.type || '') +
          ' ' + (inp.getAttribute('data-code') || '') + ' ' + (inp.placeholder || '')).toLowerCase();
      }

      // Scope the search to the edited card (not the whole page), so an unrelated
      // phone elsewhere (search bar, another panel) isn't picked up.
      function fieldScope(btn) {
        var s = btn.closest && (
          btn.closest('.card-holder, .card_holder, .js-card, .linked-form, .js-linked-form') ||
          btn.closest('[class*="card-fields"]') ||
          btn.closest('form'));
        return s || document;
      }

      // Pull the entered phone/email from the card. Prefers inputs explicitly
      // marked as phone/email (name/class/type), then falls back to value shape.
      function extractValues(btn) {
        var scope = fieldScope(btn);
        var inputs = scope.querySelectorAll('input');
        var phone = '', email = '';
        for (var i = 0; i < inputs.length; i++) {
          var inp = inputs[i];
          var v = (inp.value || '').trim();
          if (!v) continue;
          var meta = inputMeta(inp);
          if (!email && (meta.indexOf('email') !== -1 || EMAIL_RE.test(v))) email = v;
          if (!phone && (meta.indexOf('phone') !== -1 || inp.type === 'tel')) phone = v;
        }
        // Fallback: no field explicitly marked phone → take a phone-shaped value.
        if (!phone) {
          for (var j = 0; j < inputs.length; j++) {
            var val = (inputs[j].value || '').trim();
            if (val && !EMAIL_RE.test(val) && looksLikePhone(val)) { phone = val; break; }
          }
        }
        // Card name (title) — used when the account compares by name (e.g. companies).
        // It lives in the card header, outside the fields scope, so query the document.
        var name = '';
        var nameEl = document.querySelector('.js-card-name input, .js-card-name textarea, ' +
          '[class*="card-name"] input, [class*="card-name"] textarea, #card_name_holder input');
        if (nameEl) name = (nameEl.value || '').trim();
        return { phone: phone, email: email, name: name };
      }

      function removeModal() {
        var old = document.getElementById('dedup-prevent-overlay');
        if (old && old.parentNode) old.parentNode.removeChild(old);
      }

      function ensureModalStyle() {
        if (document.getElementById('dedup-prevent-style')) return;
        var st = document.createElement('style');
        st.id = 'dedup-prevent-style';
        st.textContent =
          '#dedup-prevent-overlay{position:fixed;inset:0;z-index:1000000;background:rgba(12,16,24,.55);' +
          'display:flex;align-items:center;justify-content:center;animation:dedupFade .15s ease-out;}' +
          '@keyframes dedupFade{from{opacity:0}to{opacity:1}}' +
          '#dedup-prevent-overlay .dp-modal{width:400px;max-width:calc(100vw - 32px);background:#fff;border-radius:14px;' +
          'box-shadow:0 24px 70px rgba(0,0,0,.35);font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;' +
          'overflow:hidden;animation:dedupPop .2s ease-out;}' +
          '@keyframes dedupPop{from{opacity:0;transform:translateY(-12px) scale(.97)}to{opacity:1;transform:none}}' +
          '#dedup-prevent-overlay .dp-head{display:flex;align-items:center;gap:10px;padding:15px 16px;border-bottom:1px solid #f2f2f2;}' +
          '#dedup-prevent-overlay .dp-ic{width:24px;height:24px;flex:0 0 auto;border-radius:50%;background:#ffe9dd;color:#ff6a2b;' +
          'display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;}' +
          '#dedup-prevent-overlay .dp-title{flex:1;font-size:15px;font-weight:600;color:#1a1a1a;}' +
          '#dedup-prevent-overlay .dp-close{cursor:pointer;color:#b6b6b6;font-size:22px;line-height:1;padding:0 2px;}' +
          '#dedup-prevent-overlay .dp-close:hover{color:#666;}' +
          '#dedup-prevent-overlay .dp-sub{padding:12px 16px 3px;font-size:12px;color:#8a8a8a;}' +
          '#dedup-prevent-overlay .dp-list{padding:4px 8px 12px;max-height:260px;overflow:auto;}' +
          '#dedup-prevent-overlay .dp-row{display:flex;align-items:center;gap:8px;padding:9px 10px;border-radius:8px;' +
          'color:#2b7cff;text-decoration:none;font-size:13px;}' +
          '#dedup-prevent-overlay .dp-row:hover{background:#f4f8ff;}' +
          '#dedup-prevent-overlay .dp-arrow{margin-left:auto;color:#c6c6c6;}';
        (document.head || document.body).appendChild(st);
      }

      function showDupModal(dups, type) {
        removeModal();
        ensureModalStyle();
        var title = type === 'company' ? 'Компания уже существует' : 'Контакт уже существует';
        var sub = type === 'company' ? 'Найдены компании с такими же данными:' : 'Найдены контакты с такими же данными:';
        var rows = dups.map(function (d) {
          var label = (d.name || ('#' + d.id)).replace(/</g, '&lt;');
          return '<a class="dp-row" href="' + d.url + '" target="_blank" rel="noopener">' +
            '<span>' + label + '</span><span class="dp-arrow">&#8599;</span></a>';
        }).join('');
        var overlay = document.createElement('div');
        overlay.id = 'dedup-prevent-overlay';
        overlay.innerHTML =
          '<div class="dp-modal">' +
            '<div class="dp-head">' +
              '<span class="dp-ic">!</span>' +
              '<span class="dp-title">' + title + '</span>' +
              '<span class="dp-close" id="dedup-prevent-close">&times;</span>' +
            '</div>' +
            '<div class="dp-sub">' + sub + '</div>' +
            '<div class="dp-list">' + rows + '</div>' +
          '</div>';
        document.body.appendChild(overlay);
        // Close on backdrop click or the × button.
        overlay.addEventListener('click', function (e) { if (e.target === overlay) removeModal(); });
        var close = document.getElementById('dedup-prevent-close');
        if (close) close.onclick = removeModal;
      }

      function installGuard() {
        document.addEventListener('click', function (e) {
          // Re-dispatched click after a clean check → let it reach amoCRM.
          if (allowNext) { allowNext = false; return; }
          var btn = saveButtonFrom(e.target);
          if (!btn) return;
          var type = cardType();
          if (!type || !cfg[type]) return; // not on a guarded card
          var vals = extractValues(btn);
          if (!vals.phone && !vals.email && !vals.name) return; // nothing to check → allow save
          // Block amoCRM's own handlers until we know it's not a duplicate.
          e.preventDefault();
          e.stopImmediatePropagation();
          preventApi('/api/check-duplicate', 'POST', {
            type: type, phone: vals.phone, email: vals.email, name: vals.name, excludeId: currentEntityId(type)
          }).then(function (resp) {
            var dups = (resp && resp.duplicates) || [];
            if (dups.length) {
              showDupModal(dups, type);        // keep the save blocked
            } else {
              removeModal(); allowNext = true; btn.click(); // clean → let it save
            }
          }, function () {
            removeModal(); allowNext = true; btn.click();   // on error, never trap the user
          });
        }, true); // capture phase: run before amoCRM's own click handlers
      }
    }

    this.callbacks = {
      // Widget settings popup (in amoCRM settings → integrations).
      settings: function () {
        hideNativeSettingsField(15);
        return true;
      },

      // Called once on load. Return true to allow render.
      init: function () {
        startDedupGuard();
        startMergeBridge();
        ensureKey(function () {
          startAutoRunner();      // background auto-merge loop
          startDuplicateGuard();  // block-on-save duplicate prevention
        });
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
