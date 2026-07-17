import { name, version } from '~/config.js'

class Storage {
    key = [name, 'V'+version, import.meta.env.MODE].join("_");
    
    /**
     * 获取storage
     * @param { string } key
     * @param { any } defaultValue
     * @param { Object } storage
     * @return any
     * */
    get(key, defaultValue = null, storage = localStorage) {
        if(storage.getItem([this.key, key].join('_').toUpperCase())) {
            return JSON.parse(decodeURIComponent(storage.getItem([this.key, key].join('_').toUpperCase())));
        }
        return defaultValue;
    }
    
    /**
     * 设置storage
     * @param { string } key
     * @param { any } value
     * @param { Object } storage
     * @return boolean
     * */
    set(key, value, storage = localStorage) {
        storage.setItem([this.key, key].join('_').toUpperCase(), encodeURIComponent(JSON.stringify(value)));
        return true
    }
    
    /**
     * 删除storage
     * @param { string } key
     * @param { Object } storage
     * @return boolean
     * */
    remove(key, storage = localStorage) {
        storage.removeItem([this.key, key].join('_').toUpperCase());
        return true
    }
    
    /**
     * 清空storage
     * @param { Object } storage
     * @return boolean
     * */
    clear(storage = localStorage) {
        storage.clear();
        return true
    }
    
    /**
     * check本地是否存在某个Key
     * @param { string } key
     * @param { Object } storage
     * @return boolean
     * */
    has(key, storage = localStorage) {
        const _key = [this.key, key].join('_').toUpperCase();
        return Object.keys(storage).some(_ => _ === _key);
    }
}

export default new Storage()
