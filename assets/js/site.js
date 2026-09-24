/* ==========================================================================
 * HHU VoiceEnhance 官网 · 公共交互层  site.js
 * 依赖：store.js（需先加载）
 * ========================================================================== */
(function (global) {
    'use strict';

    var Site = {};

    function $(sel, ctx) { return (ctx || document).querySelector(sel); }
    function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

    /* ------------------------------------------------------------------ *
     * Toast
     * ------------------------------------------------------------------ */
    var Toast = {
        container: null,
        queue: [],
        max: 3,

        ensure: function () {
            if (this.container) return this.container;
            this.container = document.getElementById('toastContainer');
            if (!this.container) {
                this.container = document.createElement('div');
                this.container.id = 'toastContainer';
                this.container.className = 'toast-container';
                document.body.appendChild(this.container);
            }
            return this.container;
        },

        show: function (message, type, duration) {
            var el = this.ensure();
            var text = String(message == null ? '' : message).slice(0, 120);

            while (this.queue.length >= this.max) {
                var old = this.queue.shift();
                if (old && old.parentNode) old.parentNode.removeChild(old);
            }

            var node = document.createElement('div');
            node.className = 'toast' + (type && type !== 'info' ? ' ' + type : '');

            var icon = '';
            if (type === 'success') {
                icon = '<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';
            } else if (type === 'error') {
                icon = '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>';
            } else if (type === 'warning') {
                icon = '<svg viewBox="0 0 24 24"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>';
            }

            node.innerHTML = icon + '<span></span>';
            node.lastChild.textContent = text;
            el.appendChild(node);
            this.queue.push(node);

            setTimeout(() => this.hide(node), duration || 2600);
        },

        hide: function (node) {
            if (!node || !node.parentNode) return;
            node.style.animation = 'toastOut 0.22s cubic-bezier(0.4, 0, 0.2, 1) forwards';
            setTimeout(function () {
                if (node.parentNode) node.parentNode.removeChild(node);
                var idx = Toast.queue.indexOf(node);
                if (idx > -1) Toast.queue.splice(idx, 1);
            }, 220);
        },

        success: function (m, d) { this.show(m, 'success', d); },
        error: function (m, d) { this.show(m, 'error', d); },
        warning: function (m, d) { this.show(m, 'warning', d); },
        info: function (m, d) { this.show(m, 'info', d); }
    };

    Site.toast = Toast;

    /* ------------------------------------------------------------------ *
     * 顶栏
     * ------------------------------------------------------------------ */
    function initHeader() {
        var header = $('.site-header');
        if (!header) return;

        var onScroll = function () {
            if (window.scrollY > 12) header.classList.add('is-scrolled');
            else header.classList.remove('is-scrolled');
        };
        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll();

        // 当前页高亮
        var path = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
        $$('.nav-link').forEach(function (link) {
            var href = (link.getAttribute('href') || '').toLowerCase();
            if (href === path || (path === '' && href === 'index.html')) link.classList.add('active');
        });

        // 移动端抽屉
        var toggle = $('.nav-toggle');
        var drawer = $('#navDrawer');
        if (toggle && drawer) {
            toggle.addEventListener('click', function () {
                var open = drawer.classList.toggle('open');
                document.body.classList.toggle('no-scroll', open);
                toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
            });
            $$('a', drawer).forEach(function (a) {
                a.addEventListener('click', function () {
                    drawer.classList.remove('open');
                    document.body.classList.remove('no-scroll');
                });
            });
        }
    }

    function escapeHtml(str) {
        if (str == null) return '';
        return String(str).replace(/[&<>"']/g, function (s) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s];
        });
    }

    /* ------------------------------------------------------------------ *
     * 滚动入场
     * ------------------------------------------------------------------ */
    function initReveal() {
        var nodes = $$('.reveal');
        if (!nodes.length) return;

        if (!('IntersectionObserver' in window)) {
            nodes.forEach(function (n) { n.classList.add('in'); });
            return;
        }

        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;
                entry.target.classList.add('in');
                io.unobserve(entry.target);
            });
        }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

        nodes.forEach(function (n) { io.observe(n); });
    }

    /* ------------------------------------------------------------------ *
     * 数字滚动
     * ------------------------------------------------------------------ */
    function initCounters() {
        var nodes = $$('[data-count]');
        if (!nodes.length) return;

        var run = function (node) {
            var target = parseFloat(node.getAttribute('data-count')) || 0;
            var decimals = parseInt(node.getAttribute('data-decimals') || '0', 10);
            var duration = 1300;
            var start = performance.now();

            var tick = function (now) {
                var p = Math.min((now - start) / duration, 1);
                var eased = 1 - Math.pow(1 - p, 3);
                var value = target * eased;
                node.textContent = decimals > 0
                    ? value.toFixed(decimals)
                    : Math.round(value).toLocaleString('zh-CN');
                if (p < 1) requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
        };

        if (!('IntersectionObserver' in window)) { nodes.forEach(run); return; }

        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (e) {
                if (!e.isIntersecting) return;
                run(e.target);
                io.unobserve(e.target);
            });
        }, { threshold: 0.4 });

        nodes.forEach(function (n) { io.observe(n); });
    }

    /* ------------------------------------------------------------------ *
     * FAQ 手风琴
     * ------------------------------------------------------------------ */
    function initFaq() {
        $$('.faq-item').forEach(function (item) {
            var q = $('.faq-q', item);
            if (!q) return;
            q.addEventListener('click', function () {
                var isOpen = item.classList.contains('open');
                var group = item.closest('[data-faq-group]');
                if (group) {
                    $$('.faq-item', group).forEach(function (sib) { sib.classList.remove('open'); });
                }
                item.classList.toggle('open', !isOpen);
                q.setAttribute('aria-expanded', !isOpen ? 'true' : 'false');
            });
        });
    }

    /* ------------------------------------------------------------------ *
     * 声波条渲染
     * ------------------------------------------------------------------ */
    function buildWaves(selector, jitter) {
        $$(selector).forEach(function (box) {
            var count = parseInt(box.getAttribute('data-bars') || '48', 10);
            box.innerHTML = '';
            for (var i = 0; i < count; i++) {
                var bar = document.createElement('span');
                bar.className = 'wave-bar';
                var base = Math.sin((i / count) * Math.PI) * 0.6 + 0.4;
                var noise = jitter === false ? 0 : (Math.random() * 0.85 + 0.15);
                var h = Math.max(14, Math.min(100, (base * (jitter === false ? 0.9 : noise) + 0.3) * 100));
                bar.style.height = h + '%';
                bar.style.animationDelay = (i * 0.045) + 's';
                box.appendChild(bar);
            }
        });
    }

    Site.buildWaves = buildWaves;

    /* ------------------------------------------------------------------ *
     * Tab 切换（通用）
     * ------------------------------------------------------------------ */
    function initTabs() {
        $$('[data-tabs]').forEach(function (group) {
            var tabs = $$('.tab', group);
            tabs.forEach(function (tab) {
                tab.addEventListener('click', function () {
                    tabs.forEach(function (t) {
                        t.classList.remove('active');
                        t.setAttribute('aria-selected', 'false');
                    });
                    tab.classList.add('active');
                    tab.setAttribute('aria-selected', 'true');
                    var custom = tab.getAttribute('data-on-tab');
                    if (custom && typeof global[custom] === 'function') global[custom](tab.getAttribute('data-value'));
                });
            });
        });
    }

    /* ------------------------------------------------------------------ *
     * 页脚年份
     * ------------------------------------------------------------------ */
    function initFooterYear() {
        $$('[data-year]').forEach(function (n) { n.textContent = new Date().getFullYear(); });
    }

    /* ------------------------------------------------------------------ *
     * 表单校验辅助
     * ------------------------------------------------------------------ */
    Site.fieldError = function (fieldEl, message) {
        if (!fieldEl) return;
        var wrap = fieldEl.closest('.field');
        if (!wrap) return;
        wrap.classList.add('has-error');
        fieldEl.classList.add('invalid');
        var err = $('.err', wrap);
        if (err) err.textContent = message;
    };

    Site.clearErrors = function (scope) {
        $$('.field.has-error', scope || document).forEach(function (f) {
            f.classList.remove('has-error');
            $$('.invalid', f).forEach(function (i) { i.classList.remove('invalid'); });
        });
    };

    Site.buttonLoading = function (btn, loading, loadingText) {
        if (!btn) return;
        if (loading) {
            if (!btn.dataset.originalHtml) btn.dataset.originalHtml = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner"></span><span>' + (loadingText || '处理中…') + '</span>';
        } else {
            btn.disabled = false;
            if (btn.dataset.originalHtml) btn.innerHTML = btn.dataset.originalHtml;
        }
    };

    /* ------------------------------------------------------------------ *
     * 初始化
     * ------------------------------------------------------------------ */
    Site.init = function (options) {
        options = options || {};
        initHeader();
        initFooterYear();
        initFaq();
        initTabs();
        if (options.waves !== false) buildWaves('.wave-box');
        initReveal();
        initCounters();
    };

    global.Site = Site;
})(window);
