var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
var OPENCODE_BASE = 'https://opencode.ai/zen/v1/chat/completions';
var OPENCODE_MODEL = 'deepseek-v4-flash-free';
var OPENCODE_TOKEN = 'public';
var OPENCODE_HEADERS = {
    'User-Agent': 'opencode/1.17.13 ai-sdk/provider-utils/4.0.23 runtime/bun/1.3.14',
    'x-opencode-client': 'cli',
    'x-opencode-project': 'global',
};
function opencodeFallback(res, body) {
    return __awaiter(this, void 0, void 0, function () {
        var parsed, opencodeResponse, text, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 3, , 4]);
                    parsed = JSON.parse(body);
                    parsed.model = OPENCODE_MODEL;
                    return [4 /*yield*/, fetch(OPENCODE_BASE, {
                            method: 'POST',
                            headers: __assign({ 'Content-Type': 'application/json', Authorization: "Bearer ".concat(OPENCODE_TOKEN) }, OPENCODE_HEADERS),
                            body: JSON.stringify(parsed),
                        })];
                case 1:
                    opencodeResponse = _b.sent();
                    return [4 /*yield*/, opencodeResponse.text()];
                case 2:
                    text = _b.sent();
                    res.setHeader('Content-Type', 'application/json');
                    res.setHeader('Access-Control-Allow-Origin', '*');
                    res.statusCode = opencodeResponse.ok ? opencodeResponse.status : 502;
                    res.end(text);
                    return [3 /*break*/, 4];
                case 3:
                    _a = _b.sent();
                    res.statusCode = 502;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: 'Both Mistral and OpenCode failed' }));
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    });
}
function devProxyPlugin() {
    return {
        name: 'dev-proxy',
        configureServer: function (server) {
            var _this = this;
            // Register as early as possible so Vite's indexHtmlFallback / static
            // middlewares don't swallow /api/* or /__proxy requests. Returning a
            // post-hook from configureServer would run *after* Vite's internals,
            // which is too late for the default provider's /api/chat path.
            server.middlewares.use('/api/chat', function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var body, chunk, e_1_1, mistralApiKey, mistralResponse, text, _a;
                var _b, req_1, req_1_1;
                var _c, e_1, _d, _e;
                return __generator(this, function (_f) {
                    switch (_f.label) {
                        case 0:
                            // CORS preflight — let the dev server (and Cloudflare in prod) be reachable
                            // from any origin while developing.
                            if (req.method === 'OPTIONS') {
                                res.setHeader('Access-Control-Allow-Origin', '*');
                                res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
                                res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
                                res.statusCode = 204;
                                res.end();
                                return [2 /*return*/];
                            }
                            if (req.method !== 'POST') {
                                res.statusCode = 405;
                                res.setHeader('Allow', 'POST, OPTIONS');
                                res.end('Method not allowed');
                                return [2 /*return*/];
                            }
                            body = '';
                            _f.label = 1;
                        case 1:
                            _f.trys.push([1, 6, 7, 12]);
                            _b = true, req_1 = __asyncValues(req);
                            _f.label = 2;
                        case 2: return [4 /*yield*/, req_1.next()];
                        case 3:
                            if (!(req_1_1 = _f.sent(), _c = req_1_1.done, !_c)) return [3 /*break*/, 5];
                            _e = req_1_1.value;
                            _b = false;
                            chunk = _e;
                            body += chunk;
                            _f.label = 4;
                        case 4:
                            _b = true;
                            return [3 /*break*/, 2];
                        case 5: return [3 /*break*/, 12];
                        case 6:
                            e_1_1 = _f.sent();
                            e_1 = { error: e_1_1 };
                            return [3 /*break*/, 12];
                        case 7:
                            _f.trys.push([7, , 10, 11]);
                            if (!(!_b && !_c && (_d = req_1.return))) return [3 /*break*/, 9];
                            return [4 /*yield*/, _d.call(req_1)];
                        case 8:
                            _f.sent();
                            _f.label = 9;
                        case 9: return [3 /*break*/, 11];
                        case 10:
                            if (e_1) throw e_1.error;
                            return [7 /*endfinally*/];
                        case 11: return [7 /*endfinally*/];
                        case 12:
                            mistralApiKey = process.env.MISTRAL_API_KEY;
                            if (!mistralApiKey) return [3 /*break*/, 18];
                            _f.label = 13;
                        case 13:
                            _f.trys.push([13, 17, , 18]);
                            return [4 /*yield*/, fetch('https://api.mistral.ai/v1/chat/completions', {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        Authorization: "Bearer ".concat(mistralApiKey),
                                    },
                                    body: body,
                                })];
                        case 14:
                            mistralResponse = _f.sent();
                            if (!mistralResponse.ok) return [3 /*break*/, 16];
                            return [4 /*yield*/, mistralResponse.text()];
                        case 15:
                            text = _f.sent();
                            res.setHeader('Content-Type', 'application/json');
                            res.setHeader('Access-Control-Allow-Origin', '*');
                            res.statusCode = mistralResponse.status;
                            res.end(text);
                            return [2 /*return*/];
                        case 16: return [3 /*break*/, 18];
                        case 17:
                            _a = _f.sent();
                            return [3 /*break*/, 18];
                        case 18: 
                        // Phase 2: Fallback to OpenCode
                        return [4 /*yield*/, opencodeFallback(res, body)];
                        case 19:
                            // Phase 2: Fallback to OpenCode
                            _f.sent();
                            return [2 /*return*/];
                    }
                });
            }); });
            server.middlewares.use('/api/fetch', function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var url, target, response, text, _a;
                var _b, _c;
                return __generator(this, function (_d) {
                    switch (_d.label) {
                        case 0:
                            url = new URL((_b = req.url) !== null && _b !== void 0 ? _b : '/', "http://".concat((_c = req.headers.host) !== null && _c !== void 0 ? _c : 'localhost'));
                            target = url.searchParams.get('url');
                            if (!target) {
                                res.statusCode = 400;
                                res.setHeader('Content-Type', 'application/json');
                                res.end(JSON.stringify({ error: 'Missing url query param' }));
                                return [2 /*return*/];
                            }
                            _d.label = 1;
                        case 1:
                            _d.trys.push([1, 4, , 5]);
                            return [4 /*yield*/, fetch(target)];
                        case 2:
                            response = _d.sent();
                            return [4 /*yield*/, response.text()];
                        case 3:
                            text = _d.sent();
                            res.setHeader('Access-Control-Allow-Origin', '*');
                            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
                            res.statusCode = response.ok ? 200 : response.status;
                            res.end(text);
                            return [3 /*break*/, 5];
                        case 4:
                            _a = _d.sent();
                            res.statusCode = 502;
                            res.setHeader('Content-Type', 'application/json');
                            res.end(JSON.stringify({ error: 'Proxy fetch failed' }));
                            return [3 /*break*/, 5];
                        case 5: return [2 /*return*/];
                    }
                });
            }); });
            server.middlewares.use('/__proxy', function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var url, target, response, text, _a;
                var _b, _c;
                return __generator(this, function (_d) {
                    switch (_d.label) {
                        case 0:
                            url = new URL((_b = req.url) !== null && _b !== void 0 ? _b : '/', "http://".concat((_c = req.headers.host) !== null && _c !== void 0 ? _c : 'localhost'));
                            target = url.searchParams.get('url');
                            if (!target) {
                                res.statusCode = 400;
                                res.setHeader('Content-Type', 'application/json');
                                res.end(JSON.stringify({ error: 'Missing url query param' }));
                                return [2 /*return*/];
                            }
                            _d.label = 1;
                        case 1:
                            _d.trys.push([1, 4, , 5]);
                            return [4 /*yield*/, fetch(target)];
                        case 2:
                            response = _d.sent();
                            return [4 /*yield*/, response.text()];
                        case 3:
                            text = _d.sent();
                            res.setHeader('Access-Control-Allow-Origin', '*');
                            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
                            res.statusCode = response.ok ? 200 : response.status;
                            res.end(text);
                            return [3 /*break*/, 5];
                        case 4:
                            _a = _d.sent();
                            res.statusCode = 502;
                            res.setHeader('Content-Type', 'application/json');
                            res.end(JSON.stringify({ error: 'Proxy fetch failed' }));
                            return [3 /*break*/, 5];
                        case 5: return [2 /*return*/];
                    }
                });
            }); });
        },
    };
}
export default defineConfig({
    plugins: [react(), devProxyPlugin()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    build: {
        target: 'es2022',
        sourcemap: true,
        rollupOptions: {
            output: {
                manualChunks: {
                    reactflow: ['@xyflow/react'],
                    rough: ['roughjs'],
                },
            },
        },
    },
    define: {
        __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
    },
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: ['./tests/setup.ts'],
    },
});
