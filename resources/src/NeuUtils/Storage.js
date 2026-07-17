import { storage } from '@neutralinojs/lib'
import { version, mode } from '~/config.js'

// key
const commonKey = [mode.mode, `v${version.split(/\./mg).join('-')}`].join('_').toUpperCase();

class Storage {
    constructor () {}
    
    // 获取数据
    async get(key, defaultValue = null) {
        key = [commonKey, key].join('_').toUpperCase();
        const data = JSON.parse(await storage.getData(key));
        if(!Object.keys(data).length || !(await this.hasKey(key))) return defaultValue;
        return data
    }
    
    // 设置数据
    async set(key, value) {
        key = [commonKey, key].join('_').toUpperCase();
        
        if(typeof value === 'object') {
            try {
                value = JSON.stringify(value);
                await storage.setData(key, value);
            } catch(e) {
                console.error(e);
            }
        }
    }
    
    // 删除数据
    async remove(key) {
        key = [commonKey, key].join('_').toUpperCase();
        await storage.removeData(key);
    }
    
    // 清除所有数据,会删除存储目录
    async clear() {
        await storage.clear();
    }
    
    // 获取存储的所有keys
    async getKeys() {
        return await storage.getKeys();
    }
    
    // 是否存在该key
    async hasKey(key) {
        key = [commonKey, key].join('_').toUpperCase();
        const keys = await this.getKeys();
        return keys.includes(key)
    }
}

export default new Storage();