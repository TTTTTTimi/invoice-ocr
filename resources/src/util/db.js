import dayjs from "dayjs";
import Dexie from 'dexie';

// 1. 创建数据库（✨ 核心优化：在 entry 上建立二级索引，允许使用文件名做高效率查删）
const db = new Dexie('InvoiceDatabase');
db.version(1).stores({
    invoices: '++id, entry'
});

// ==================== ➕ 增 ====================
export const addInvoice = async (entry) => {
    // 防御校验：严禁写入空的、不合法的文件名
    if (!entry || typeof entry !== 'string') {
        return { code: -1, data: null, msg: '数据插入失败: entry 参数必须为非空字符串' };
    }
    
    try {
        // 保持结构纯净，仅写入自增 id、entry 和创建时间
        const id = await db.invoices.add({
            entry,
            createdAt: dayjs().format('YYYY-MM-DD HH:mm:ss')
        });
        return { code: 200, data: id, msg: '操作成功' };
    } catch (error) {
        console.error("插入失败:", error);
        return { code: -1, data: null, msg: `数据插入失败: ${error.message}` };
    }
}

// ==================== ❌ 删 ====================
export const deleteInvoice = async (entry) => {
    try {
        if (entry) {
            // ✨ 核心修复：由于主键是 id 数字，按 entry 字符串文件名删除时必须使用 where 匹配
            const deleteCount = await db.invoices.where('entry').equals(entry).delete();
            
            if (deleteCount === 0) {
                return { code: 0, data: null, msg: '未查找到匹配该文件名的记录' };
            }
        } else {
            // 参数为空时，高性能一键全清
            await db.invoices.clear();
        }
        
        return { code: 200, data: null, msg: '操作成功' };
    } catch (error) {
        console.error("删除失败:", error);
        return { code: -1, data: null, msg: `数据删除失败: ${error.message}` };
    }
}

// ==================== 🔍 查 ====================
export const findInvoice = async (entry) => {
    if (!entry) {
        return { code: -1, data: null, msg: '查询参数 entry 不能为空' };
    }
    
    try {
        // ✨ 核心修复：按 entry 字符串查询时，通过 where 检索匹配的第一条记录
        const result = await db.invoices.where('entry').equals(entry).first();
        
        return result
            ? { code: 200, data: result, msg: '操作成功' }
            : { code: 0, data: null, msg: '未查找到数据' };
    } catch (error) {
        console.error("查找失败:", error);
        return { code: -1, data: null, msg: `数据查找失败: ${error.message}` };
    }
}
