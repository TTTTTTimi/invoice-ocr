import { Database } from "bun:sqlite"
import dayjs from "dayjs"
// import { existsSync, unlinkSync } from "node:fs" // 暂不启用：删除时清理标注图文件
import path from "node:path"
import logger from "./log"

const EXE_PATH = process.execPath;

const IS_COMPILED = !EXE_PATH.endsWith("bun") && !EXE_PATH.endsWith("bun.exe");
const ROOT_DIR = IS_COMPILED
    ? path.join(path.dirname(EXE_PATH), "..")
    : process.cwd();

const DB_PATH = path.join(ROOT_DIR, "invoices.db");

logger.info('正在连接数据库', { path: DB_PATH, isCompiled: IS_COMPILED });
console.log(`[Database] 正在连接数据库，绝对路径为: ${DB_PATH}`);

const db = new Database(DB_PATH);

// 初始化表结构（保持一致）
db.run(`
    CREATE TABLE IF NOT EXISTS invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entry TEXT,
        path TEXT,
        type TEXT,
        invoiceType TEXT,
        invoiceNumber TEXT UNIQUE,
        invoiceDate TEXT,
        taxBureau TEXT,
        buyerName TEXT,
        sellerName TEXT,
        amount TEXT,
        taxRate TEXT,
        taxAmount TEXT,
        totalAmount TEXT,
        issuer TEXT,
        annotatedPath TEXT,
        createdAt TEXT,
        updatedAt TEXT
    )
`);

// 迁移：移除已废弃的购销方统一识别号列；补齐标注图路径列
try {
    const columns = db.query("PRAGMA table_info(invoices)").all().map(c => c.name);
    if (columns.includes("buyerTaxId")) db.run("ALTER TABLE invoices DROP COLUMN buyerTaxId");
    if (columns.includes("sellerTaxId")) db.run("ALTER TABLE invoices DROP COLUMN sellerTaxId");
    if (!columns.includes("annotatedPath")) db.run("ALTER TABLE invoices ADD COLUMN annotatedPath TEXT");
} catch (e) {
    console.warn("数据库列迁移跳过:", e.message);
    logger.warn('数据库列迁移跳过', { error: e.message });
}

// 1. 增 (Insert)
export function insertInvoice(invoiceData) {
    const sql = `
        INSERT INTO invoices (
            entry, path, type, invoiceType, invoiceNumber, invoiceDate,
            taxBureau, buyerName, sellerName,
            amount, taxRate, taxAmount, totalAmount, issuer, annotatedPath,
            createdAt, updatedAt
        ) VALUES (
            $entry, $path, $type, $invoiceType, $invoiceNumber, $invoiceDate,
            $taxBureau, $buyerName, $sellerName,
            $amount, $taxRate, $taxAmount, $totalAmount, $issuer, $annotatedPath,
            $createdAt, $updatedAt
        )
    `;
    
    try {
        const params = {};
        for (const key in invoiceData) {
            params[`$${key}`] = invoiceData[key];
        }
        
        // 自动注入当前的标准本地时间
        const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
        params["$createdAt"] = now;
        params["$updatedAt"] = now;
        if (params["$annotatedPath"] === undefined) params["$annotatedPath"] = "";
        
        const result = db.run(sql, params);
        logger.info('insertInvoice 成功', {
            entry: invoiceData.entry,
            invoiceNumber: invoiceData.invoiceNumber,
            annotatedPath: params["$annotatedPath"] || '',
            lastInsertRowId: result.lastInsertRowId
        });
        return { success: true, lastInsertRowId: result.lastInsertRowId };
    } catch (error) {
        logger.error('insertInvoice 失败', {
            entry: invoiceData?.entry,
            invoiceNumber: invoiceData?.invoiceNumber,
            error: error.message
        });
        return { success: false, error: error.message };
    }
}

// 2. 删 (Delete)
/**
 * 根据 ID 移除发票记录（支持根据业务单号降级兼容）
 * @param {number|string} id - 如果是数字/对象，则优先处理
 */
export function deleteInvoice(id) {
    try {
        const numericId = parseInt(id, 10);
        if (isNaN(numericId)) {
            return { success: false, error: "删除失败：无效的 ID 格式" };
        }

        const row = db.prepare("SELECT annotatedPath FROM invoices WHERE id = ?").get(numericId);
        const sql = "DELETE FROM invoices WHERE id = ?";
        const statement = db.prepare(sql);
        const result = statement.run(numericId);

        // 暂不启用：删除库记录后同步清理标注图本地文件
        // const annotatedPath = row?.annotatedPath;
        // if (annotatedPath && typeof annotatedPath === "string" && existsSync(annotatedPath)) {
        //     try {
        //         unlinkSync(annotatedPath);
        //         logger.info('标注图本地文件已删除', { id: numericId, annotatedPath });
        //     } catch (fileErr) {
        //         console.warn("标注图本地文件删除失败:", fileErr.message);
        //         logger.warn('标注图本地文件删除失败', { id: numericId, annotatedPath, error: fileErr.message });
        //     }
        // }

        logger.info('deleteInvoice 成功', { id: numericId, changes: result.changes, annotatedPath: row?.annotatedPath || '' });
        return { success: true, changes: result.changes };
    } catch (error) {
        logger.error('deleteInvoice 失败', { id, error: error.message });
        return { success: false, error: error.message };
    }
}

// 3. 改 (Update)
/**
 * 针对 bun:sqlite 优化的发票更新函数
 * @param {number|string} id - 数据库自增主键 ID
 * @param {Object} updateData - 前端传过来的新数据
 */
export function updateInvoice(id, updateData) {
    try {
        // 1. 强制类型转换
        const numericId = parseInt(id, 10);
        if (isNaN(numericId)) {
            return { success: false, error: "更新失败：传入的 ID 不是有效的数字格式" };
        }
        
        // 2. 核心安全校验：检查是否企图修改发票号码 (invoiceNumber)
        if (updateData.hasOwnProperty('invoiceNumber')) {
            const newInvoiceNumber = updateData.invoiceNumber;
            
            if (newInvoiceNumber && String(newInvoiceNumber).trim() !== '') {
                // 使用 bun:sqlite 标准的问号占位符
                const conflictSql = "SELECT 1 FROM invoices WHERE invoiceNumber = ? AND id != ? LIMIT 1";
                
                // Bun.js 标准写法：先 prepare，再使用 .get() 获取单条结果
                const query = db.prepare(conflictSql);
                const existing = query.get(newInvoiceNumber, numericId);
                
                if (existing) {
                    return { success: false, error: `修改失败：发票号码 [${newInvoiceNumber}] 在数据库中已存在，不允许重复录入` };
                }
            }
        }
        
        // 3. 动态过滤掉不允许直接覆写的字段
        const fields = Object.keys(updateData).filter(key => {
            return key !== 'id' && key !== 'createdAt' && key !== 'updatedAt';
        });
        
        if (fields.length === 0) {
            return { success: true, changes: 0, message: "没有需要更新的有效字段" };
        }
        
        // 4. 动态拼接 SQL 子句
        const setClause = [...fields.map(field => `${field} = ?`), "updatedAt = ?"].join(", ");
        const sql = `UPDATE invoices SET ${setClause} WHERE id = ?`;
        
        // 5. 严格按照问号顺序组装参数数组
        const params = [];
        fields.forEach(field => {
            params.push(updateData[field]);
        });
        
        // 自动注入当前最新的更新时间
        params.push(dayjs().format("YYYY-MM-DD HH:mm:ss"));
        // 传入 WHERE id = ?
        params.push(numericId);
        
        // 6. 执行更新
        // Bun.js 标准写法：先 prepare，再使用 .run() 执行更新
        const statement = db.prepare(sql);
        const result = statement.run(...params);
        
        // bun:sqlite 的 .run() 会直接返回 { success: true, changes: 1, lastInsertRowid: ... }
        if (result.changes === 0) {
            logger.warn('updateInvoice 无变更', { id: numericId });
            return { success: false, error: `未找到 ID 为 [${numericId}] 的记录，或数据未发生改变` };
        }

        logger.info('updateInvoice 成功', { id: numericId, changes: result.changes, fields });
        return { success: true, changes: result.changes };
        
    } catch (error) {
        console.error("Bun SQLite 运行时引发异常:", error.message);
        logger.error('updateInvoice 异常', { id, error: error.message });
        return { success: false, error: error.message };
    }
}

// 4. 查 (Select)
/**
 * 条件分页查询发票（修复版：完美匹配数据库格式 + 新增发票号码查询）
 * @param {string} [buyerName] - 购买方名称（模糊查询）
 * @param {string} [invoiceNumber] - 发票号码（模糊查询）
 * @param {string} [date] - 开票日期的年份或月份，例如: "2025", "2025-07"
 * @param {number} [pageNo=1] - 当前页码
 * @param {number} [limit=20] - 每页条数
 */
export function queryInvoices({ buyerName, invoiceNumber, date, pageNo = 1, limit = 20 } = {}) {
    let whereClause = " WHERE 1=1";
    const params = {};
    
    // 1. 购买方名称模糊查询
    if (buyerName) {
        whereClause += " AND buyerName LIKE $buyerName";
        params["$buyerName"] = `%${buyerName}%`;
    }
    
    // 2. 发票号码模糊查询与安全熔断
    if (invoiceNumber) {
        // 强制转换为字符串并修剪空格，防止传入数字或其他类型触发报错
        const cleanInvoiceNumber = String(invoiceNumber).trim();
        if (cleanInvoiceNumber.length > 0) {
            whereClause += " AND invoiceNumber LIKE $invoiceNumber";
            params["$invoiceNumber"] = `%${cleanInvoiceNumber}%`;
        }
    }
    
    // 3. 开票日期月份或年份查询（完美契合数据库中的 YYYY-MM 和 YYYY 格式）
    if (date) {
        const d = dayjs(date);
        if (d.isValid()) {
            const hasMonth = date.includes('-'); // 检查传入条件中是否带有 "-"
            if (hasMonth) {
                // 传入 "2025-07" 时，去匹配数据库中 invoiceDate 包含 "2025-07" 的记录
                whereClause += " AND invoiceDate LIKE $invoiceDate";
                params["$invoiceDate"] = `%${d.format("YYYY-MM")}%`;
            } else {
                // 传入 "2025" 时，去匹配数据库中 invoiceDate 包含 "2025" 的记录
                whereClause += " AND invoiceDate LIKE $invoiceDate";
                params["$invoiceDate"] = `%${d.format("YYYY")}%`;
            }
        } else {
            // 降级防御：如果传入非标准字符，降级为直接的前后模糊查询
            whereClause += " AND invoiceDate LIKE $invoiceDate";
            params["$invoiceDate"] = `%${date}%`;
        }
    }
    
    // 安全抓取数字，阻断数字计算产生 NaN 导致的 500 崩溃
    const safePageNo = parseInt(pageNo, 10) || 1;
    const safeLimit = parseInt(limit, 10) || 20;
    const offset = (safePageNo - 1) * safeLimit;
    
    try {
        // 1. 查询当前筛选条件下的总数据条数（前端分页器必填项）
        const countSql = `SELECT COUNT(*) as total FROM invoices ${whereClause}`;
        const countResult = db.query(countSql).get(params);
        const total = countResult ? countResult.total : 0;
        
        // 2. 查询当前页的数据列表
        let selectSql = `SELECT * FROM invoices ${whereClause} ORDER BY createdAt DESC LIMIT $limit OFFSET $offset`;
        
        // 混入分页计算所需要的参数
        const queryParams = { ...params, $limit: safeLimit, $offset: offset };
        const list = db.query(selectSql).all(queryParams);

        logger.info('queryInvoices 完成', {
            total,
            pageNo: safePageNo,
            limit: safeLimit,
            listSize: list.length
        });
        // 返回标准的分页包装对象
        return { list, total };
    } catch (dbError) {
        console.error("❌ SQLite 数据库底层执行崩溃:", dbError);
        logger.error('queryInvoices 异常', { error: dbError?.message || String(dbError) });
        throw dbError; // 将错误上抛给路由层 try...catch
    }
}

/**
 * 条件全量查询发票（去掉分页限制）
 * @param {string} [buyerName] - 购买方名称（模糊查询）
 * @param {string} [date] - 开票日期的年份或月份，例如: "2025", "2025-07"
 */
export function exportInvoices({ buyerName, date } = {}) {
    let whereClause = " WHERE 1=1";
    const params = {};
    
    // 1. 购买方名称模糊查询
    if (buyerName) {
        whereClause += " AND buyerName LIKE $buyerName";
        params["$buyerName"] = `%${buyerName}%`;
    }
    
    // 2. 开票日期月份或年份查询
    if (date) {
        const d = dayjs(date);
        if (d.isValid()) {
            const hasMonth = date.includes('-');
            if (hasMonth) {
                whereClause += " AND invoiceDate LIKE $invoiceDate";
                params["$invoiceDate"] = `%${d.format("YYYY-MM")}%`;
            } else {
                whereClause += " AND invoiceDate LIKE $invoiceDate";
                params["$invoiceDate"] = `%${d.format("YYYY")}%`;
            }
        } else {
            whereClause += " AND invoiceDate LIKE $invoiceDate";
            params["$invoiceDate"] = `%${date}%`;
        }
    }
    
    try {
        // 3. 移除 LIMIT 和 OFFSET，直接全量排序查询
        let selectSql = `SELECT * FROM invoices ${whereClause} ORDER BY createdAt DESC`;
        
        const list = db.query(selectSql).all(params);
        
        // 4. 执行查询并直接返回包含所有结果的数组
        return { list, total: list.length };
    } catch (dbError) {
        console.error("❌ SQLite 数据库底层执行崩溃:", dbError);
        throw dbError;
    }
}
