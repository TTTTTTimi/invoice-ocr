// 数据类型
export const Typeof = (isType, data) => {
    let type = Object.prototype.toString.call(data);
    type = type.substring(8, type.length - 1).toLowerCase();
    return type === isType.toLowerCase();
}

// 对象深拷贝
export const CloneObject = (obj, hash = new WeakMap()) => {
    if (obj === null) return null;
    if (typeof obj !== "object") return obj;
    if (obj instanceof Date) return new Date(obj);
    if (obj instanceof RegExp) return new RegExp(obj);
    if (hash.has(obj)) return hash.get(obj); // 处理循环引用
    
    let cloneObj = Array.isArray(obj) ? [] : {};
    hash.set(obj, cloneObj); // 存储原对象和克隆对象的对应关系
    
    for (let key in obj) {
        if (obj.hasOwnProperty(key)) {
            cloneObj[key] = CloneObject(obj[key], hash);
        }
    }
    return cloneObj;
}
