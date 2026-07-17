import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { inspect } from 'node:util'

const roamingPath = process.env.APPDATA || join(process.cwd(), 'data');
const appConfigDir = join(roamingPath, 'js.win.tool', 'node_logs');

const NUMERIC_ROTATE_NAME = /^bridge_.+\.log\.\d+$/;

const pruneBridgeLogArtifacts = () => {
    let removed = 0;
    try {
        if (!existsSync(appConfigDir)) {
            mkdirSync(appConfigDir, { recursive: true });
            return removed;
        }
        const now = Date.now();
        const maxAgeMs = 15 * 24 * 60 * 60 * 1000;
        
        for (const name of readdirSync(appConfigDir)) {
            const full = join(appConfigDir, name);
            let st;
            try { st = statSync(full); } catch { continue; }
            if (!st.isFile()) continue;
            
            if (NUMERIC_ROTATE_NAME.test(name)) {
                unlinkSync(full);
                removed += 1;
                continue;
            }
            if (!name.startsWith('bridge_') || !name.endsWith('.log')) continue;
            if (now - st.mtimeMs > maxAgeMs) {
                unlinkSync(full);
                removed += 1;
            }
        }
    } catch { /* 清理失败不阻塞 */ }
    return removed;
};

const prunedOnLoad = pruneBridgeLogArtifacts();

function getLogMeta() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const padMs = (n) => String(n).padStart(3, '0');
    
    const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const timeStr = `${dateStr} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${padMs(d.getMilliseconds())}`;
    const logFilePath = join(appConfigDir, `bridge_${dateStr}.log`);
    return { timeStr, logFilePath };
}

/**
 * 核心日志写入函数：改成同步顺序落盘，彻底防止死锁时日志丢失！
 */
function writeLog(level, message, meta = {}) {
    const { timeStr, logFilePath } = getLogMeta();
    
    const pureMeta = {};
    if (meta && typeof meta === 'object') {
        Object.keys(meta).forEach(key => {
            if (typeof key !== 'symbol') pureMeta[key] = meta[key];
        });
    }
    
    // 直接扁平展开元数据串，不要再生成带缩进的 inspect 结构
    let metaStr = '';
    if (Object.keys(pureMeta).length) {
        try {
            metaStr = ' ' + JSON.stringify(pureMeta);
        } catch {
            metaStr = ' ' + inspect(pureMeta, { breakLength: Infinity, depth: 2, colors: false });
        }
    }
    
    // 完美的单行格式化，与你原先的日志对齐
    const logLine = `[${level.toUpperCase()}] ${timeStr}：${message}${metaStr}\n`;
    
    // 1. 同步控制台流
    if (level === 'error') console.error(logLine.trim());
    else if (level === 'warn') console.warn(logLine.trim());
    else console.log(logLine.trim());
    
    // 改用 appendFileSync。即使主线程接下来进入死循环，日志也会在这一行立刻强制落盘
    try {
        appendFileSync(logFilePath, logLine, 'utf8');
    } catch (e) {
        // 防止磁盘满崩溃
    }
}

const handleLogArgs = (level) => (first, ...rest) => {
    let message = '[log]';
    let meta = {};
    
    if (first instanceof Error) {
        message = first.stack || first.message;
        meta = rest[0] && typeof rest[0] === 'object' ? { ...rest[0] } : {};
    } else if (typeof first === 'object' && first !== null) {
        const { message: msgVal, msg, ...restMeta } = first;
        message = msgVal ?? msg ?? '[object]';
        meta = { ...restMeta };
        if (rest[0] && typeof rest[0] === 'object') {
            meta = { ...meta, ...rest[0] };
        }
    } else {
        message = String(first);
        if (rest[0] && typeof rest[0] === 'object' && !(rest[0] instanceof Error)) {
            meta = { ...rest[0] };
        } else if (rest.length > 0) {
            meta = rest.reduce((acc, cur, idx) => ({ ...acc, [`param_${idx}`]: cur }), {});
        }
    }
    
    writeLog(level, message, meta);
};

const logger = {
    info: handleLogArgs('info'),
    warn: handleLogArgs('warn'),
    error: handleLogArgs('error'),
    debug: handleLogArgs('debug'),
};

export function logBridgeStartup(meta = {}) {
    const removed = pruneBridgeLogArtifacts();
    logger.info('桥接进程启动', {
        pid: process.pid,
        logDir: appConfigDir,
        platform: process.platform,
        prunedLogFiles: prunedOnLoad + removed,
        ...meta,
    });
}

export default logger;
