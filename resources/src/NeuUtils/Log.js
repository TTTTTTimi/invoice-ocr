import { filesystem, os } from "@neutralinojs/lib"
import dayjs from "dayjs"
import storage from './Storage'

class Log {
    constructor(options) {
        this.options = {
            dirName: 'app_logs',
            logFileSize: 10,
            retentionDays: 15,
            log: false
        };
        Object.assign(this.options, options);
        this._lastPruneAt = 0;
        
        // 文件路径
        this.filepath = async () => {
            const cache = await os.getPath('data');
            return await filesystem.getUnnormalizedPath(`${ cache }/${ window?.NL_APPID }/${ this.options.dirName }`);
        }
        
        // 规定打印类型
        this.types = ['info', 'warn', 'error'];
        
        // 初始化
        this.init()
    }
    
    // 创建文件夹
    async init() {
        const path = await this.filepath();
        console.log(`🚀 当前LOG日志日志存储在: ${path}`)
        try {
            const stats = await filesystem.getStats(path);
            if(!stats.isDirectory) await filesystem.createDirectory(path);
        } catch (error) {
            if(error.code === 'NE_FS_NOPATHE') await filesystem.createDirectory(path);
        }
        await this.pruneOldLogs();
        this._lastPruneAt = Date.now();
    }

    /** 删除超过 retentionDays 的 debug_YYYY-MM-DD_*.log，并清理对应 storage 键 */
    async pruneOldLogs() {
        const days = this.options.retentionDays;
        const cutoff = dayjs().subtract(days, 'day').startOf('day');
        const dir = await this.filepath();
        let entries;
        try {
            entries = await filesystem.readDirectory(dir);
        } catch {
            return;
        }
        const fileDateRe = /^debug_(\d{4}-\d{2}-\d{2})_\d+\.log$/;
        for (const { entry, type } of entries) {
            if (type !== 'FILE') continue;
            const m = entry.match(fileDateRe);
            if (!m) continue;
            if (dayjs(m[1]).startOf('day').isBefore(cutoff)) {
                const fullPath = await filesystem.getUnnormalizedPath(`${dir}/${entry}`);
                try {
                    await filesystem.remove(fullPath);
                } catch {
                    /* ignore */
                }
            }
        }
        try {
            const storageKeys = await storage.getKeys();
            const keyRe = /_LOG_(\d{4}-\d{2}-\d{2})$/i;
            for (const fullKey of storageKeys) {
                const m = fullKey.match(keyRe);
                if (!m) continue;
                const dateStr = m[1];
                if (dayjs(dateStr).startOf('day').isBefore(cutoff)) {
                    await storage.remove(`log_${dateStr}`);
                }
            }
        } catch {
            /* ignore */
        }
    }
    
    // 判断类型
    isTypes(type) {
        return this.types.includes(type.toLowerCase());
    }
    
    // 获取文件下标
    async getFileIndex(name) {
        try {
            if (await storage.hasKey(name)) {
                const data = await storage.get(name);
                return data?.index ?? 1;
            }
            await storage.set(name, { index: 1 });
            return 1;
        } catch (e) {
            await storage.set(name, { index: 1 });
            return 1;
        }
    }
    
    // 打印
    async log(message, type = 'info') {
        if(typeof message === 'object') {
            message = JSON.stringify(message);
        }

        if (Date.now() - this._lastPruneAt > 86400000) {
            this._lastPruneAt = Date.now();
            await this.pruneOldLogs();
        }

        const dateDay = dayjs();
        const date = dateDay.format('YYYY-MM-DD');
        const savedAt = dateDay.format('YYYY-MM-DD HH:mm:ss.SSS');
        const index = await this.getFileIndex(`log_${date}`);
        const filepath = await this.filepath();
        
        type = (this.isTypes(type) ? type : 'info').toUpperCase();
        
        const msg = `[${type}] ${savedAt} ${message} \n`
        
        const path = await filesystem.getUnnormalizedPath(`${filepath}/debug_${date}_${index}.log`);
        await filesystem.appendFile(path, msg);
        // 是否在控制台也实时打印
        this.options.log && console.log(msg);
        const { size } = await filesystem.getStats(path);
        if (size / 1024 / 1024 >= this.options.logFileSize) {
            const rec = await storage.get(`log_${date}`);
            const idx = rec?.index ?? index;
            await storage.set(`log_${date}`, { index: idx + 1 });
        }
    }
}

export default Log;