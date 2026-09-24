/* ==========================================================================
 * HHU VoiceEnhance 静态站点 · 数据层  store.js
 * --------------------------------------------------------------------------
 * GitHub Pages 版本说明：
 *   - 无后端、无网络请求，页面内容全部来自 data.js 中的静态数据；
 *   - 站点为纯展示型静态页，无任何后端交互，
 *     页面上所有功能打开即可使用；
 *   - 方法签名与开发版保持一致，均返回 Promise<{data, error}>，
 *     便于后续接回真实服务端时页面无需改动。
 * ========================================================================== */
(function (global) {
    'use strict';

    var Store = {
        mode: 'static'
    };

    /* ---------------------------- 工具 ---------------------------- */
    Store.utils = {
        escapeHtml: function (str) {
            if (str == null) return '';
            return String(str).replace(/[&<>"']/g, function (s) {
                return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s];
            });
        },
        uuid: function () {
            var hex = 'abcdef0123456789', out = '';
            for (var i = 0; i < 32; i++) out += hex[Math.floor(Math.random() * 16)];
            return out;
        }
    };

    function ok(data) { return Promise.resolve({ data: data, error: null }); }
    function fail(message, code) {
        return Promise.resolve({ data: null, error: { message: message, code: code || 'ERROR' } });
    }
    function db() {
        return global.VE_DATA || { products: [], news: [] };
    }
    function delay(value) {
        // 轻微延迟，让页面加载态不至于一闪而过
        return new Promise(function (resolve) { setTimeout(function () { resolve(value); }, 60); });
    }

    /* ---------------------------- 产品服务 ---------------------------- */
    Store.products = {
        list: function (options) {
            options = options || {};
            var rows = db().products.slice();
            if (options.category && options.category !== 'all') {
                rows = rows.filter(function (p) { return p.category === options.category; });
            }
            rows.sort(function (a, b) { return (a.sort || 99) - (b.sort || 99); });
            return delay(ok(rows));
        },
        get: function (id) {
            var hit = db().products.filter(function (p) { return p.id === id; })[0];
            return hit ? ok(hit) : fail('未找到该产品', 'NOT_FOUND');
        }
    };

    /* ---------------------------- 项目动态 ---------------------------- */
    Store.news = {
        list: function (options) {
            options = options || {};
            var rows = db().news.slice().sort(function (a, b) {
                return String(b.date).localeCompare(String(a.date));
            });
            if (options.limit > 0) rows = rows.slice(0, options.limit);
            return delay(ok(rows));
        }
    };

    /* ------------------------------------------------------------------ *
     * 联系留言
     * 静态站点没有服务端，这里把留言保存在访问者本机浏览器（localStorage），
     * 仅用于演示交互流程；正式部署（含 app.py 后端）时写入 MySQL。
     * ------------------------------------------------------------------ */
    var MSG_KEY = 've_static_messages';

    function readLocalMessages() {
        try {
            return JSON.parse(global.localStorage.getItem(MSG_KEY) || '[]');
        } catch (e) {
            return [];
        }
    }

    Store.messages = {
        create: function (payload) {
            if (!payload || !payload.name || !payload.content) {
                return fail('请填写姓名与需求描述', 'INVALID');
            }
            var record = {
                id: Store.utils.uuid(),
                name: payload.name,
                phone: payload.phone || '',
                company: payload.company || '',
                subject: payload.subject || '业务咨询',
                content: payload.content,
                status: 'pending',
                created_at: new Date().toISOString()
            };
            try {
                var all = readLocalMessages();
                all.unshift(record);
                global.localStorage.setItem(MSG_KEY, JSON.stringify(all.slice(0, 50)));
            } catch (e) { /* 隐私模式下不可写，忽略即可 */ }
            return delay(ok(record));
        },
        listMine: function () {
            return ok(readLocalMessages());
        }
    };

    global.Store = Store;
})(window);
