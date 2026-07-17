/**
 * Bun OCR 服务 WebSocket 监听（后台驻留友好：可见性暂停心跳 + 断线退避重连）
 */
export default class OcrListener {
    constructor(options = {}) {
        this.url = options.url || 'ws://localhost:13888/ws';
        this.pingInterval = options.pingInterval || 30000;
        this.pongTimeout = options.pongTimeout || 15000;
        this.reconnectInterval = options.reconnectInterval || 3000;
        this.reconnectMax = options.reconnectMax || 30000;

        this.socket = null;
        this.events = {};
        this.status = 'closed';
        this.paused = false;
        this.reconnectAttempt = 0;
        this.reconnectTimer = null;

        this.pingTimer = null;
        this.pongTimer = null;

        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', () => this._onVisibilityChange());
        }

        this.connect();
    }

    _onVisibilityChange() {
        if (document.hidden) {
            this.paused = true;
            this._clearTimers();
            return;
        }
        this.paused = false;
        this.reconnectAttempt = 0;
        if (this.status !== 'open') {
            this._scheduleReconnect(0);
        } else {
            this._startHeartbeat();
        }
    }

    connect() {
        if (this.status === 'destroyed') return;
        if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
            return;
        }

        this.status = 'connecting';
        this._trigger('statusChange', this.status);

        this.socket = new WebSocket(this.url);

        this.socket.onopen = () => {
            this.status = 'open';
            this.reconnectAttempt = 0;
            console.log('🚀 [OcrListener] 已连接 OCR 服务');
            this._trigger('statusChange', this.status);
            this._trigger('open');
            this._startHeartbeat();
        };

        this.socket.onmessage = (event) => {
            this._startHeartbeat();
            try {
                const res = JSON.parse(event.data);
                if (res.type === 'pong') return;
                this._trigger('message', res);
                if (res.type === 'invoice_ocr_success') {
                    this._trigger('invoiceSuccess', { data: res.data, time: res.time });
                }
            } catch {
                if (event.data === 'pong') return;
                this._trigger('error', event.data);
            }
        };

        this.socket.onclose = () => {
            this._clearTimers();
            if (this.status === 'destroyed') return;
            this.status = 'closed';
            this._trigger('statusChange', this.status);
            this._trigger('close');
            this._scheduleReconnect();
        };

        this.socket.onerror = () => {
            this._trigger('error', new Error('WebSocket error'));
            if (this.socket) this.socket.close();
        };
    }

    _scheduleReconnect(delay) {
        if (this.status === 'destroyed' || this.reconnectTimer) return;
        const ms = delay ?? Math.min(
            this.reconnectMax,
            this.reconnectInterval * Math.pow(1.6, this.reconnectAttempt++)
        );
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            if (this.status === 'closed' && !this.paused) this.connect();
        }, ms);
    }

    _startHeartbeat() {
        this._clearTimers();
        if (this.status !== 'open' || this.paused) return;

        this.pingTimer = setTimeout(() => {
            if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
            this.socket.send(JSON.stringify({ type: 'ping' }));
            this.pongTimer = setTimeout(() => {
                if (this.socket) this.socket.close();
            }, this.pongTimeout);
        }, this.pingInterval);
    }

    _clearTimers() {
        if (this.pingTimer) clearTimeout(this.pingTimer);
        if (this.pongTimer) clearTimeout(this.pongTimer);
        this.pingTimer = null;
        this.pongTimer = null;
    }

    on(eventName, callback) {
        if (!this.events[eventName]) this.events[eventName] = [];
        this.events[eventName].push(callback);
        return this;
    }

    emit(eventName, data = {}) {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
        this.socket.send(JSON.stringify({ type: eventName, ...data }));
        return true;
    }

    destroy() {
        this.status = 'destroyed';
        this._clearTimers();
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        if (this.socket) this.socket.close();
        this.events = {};
    }

    _trigger(eventName, data) {
        (this.events[eventName] || []).forEach(cb => {
            try { cb(data); } catch (e) { console.error(e); }
        });
    }
}
