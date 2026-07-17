import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { queryInvoices, insertInvoice, exportInvoices, updateInvoice, deleteInvoice } from './db'
import { cleanCroppedInvoiceFields } from './parse-invoice'
import logger, { logBridgeStartup } from './log'

// 恢复并监听标准输入流 (stdin)
process.stdin.resume();
process.stdin.setEncoding('utf8');

const url = new URL('./PaddleOCR/PaddleOCR-json.exe', import.meta.url);
const OCR_EXE_PATH = fileURLToPath(url);
const OCR_DIR_PATH = dirname(OCR_EXE_PATH);

(async () => {
    try {
        // 先触发启动日志打印
        logBridgeStartup({ version: '1.0.0' });
        // 打印挂载日志 (此时事件循环正常，异步 Bun.write 能够畅通无阻地写入磁盘)
        logger.info('正在挂载离线 OCR 引擎', { path: OCR_EXE_PATH });
        console.log(`[OCR] 正在挂载离线 OCR 引擎: ${OCR_EXE_PATH}`);
        
        // 成功拉起子进程（保持高精度参数移入 config_ch.txt 的干净状态）
        const ocrProcess = Bun.spawn([OCR_EXE_PATH], {
            cwd: OCR_DIR_PATH,
            stdin: "pipe",
            stdout: "pipe",
            stderr: "inherit"
        });

        // 彻底丢弃复杂的 TransformStream 管道
        const lineReader = ocrProcess.stdout
            .pipeThrough(new TextDecoderStream())
            .getReader();
        
        logger.info('正在清空引擎启动日志缓存');
        while (true) {
            // 现在 await 明确处于 async 作用域内，Bun 编译器能够完美识别并成功编译
            const { value, done } = await lineReader.read();
            if (done) break;
            const trimmed = value.trim();
            if (!trimmed) continue;
            logger.info('离线引擎就绪', { preview: trimmed.substring(0, 30) });
            break;
        }
        
        // 模块级超级缓冲区
        let ocrDataBuffer = "";

        // 处理ocr当前数量
        const state = new Proxy(
            { current: 0 }, // 原始数据
            {
                set(target, property, value) {
                    // 如果值没有变，不重复触发广播
                    if (target[property] === value) return true;
                    
                    // 更新内存中的实际值
                    target[property] = value;
                    
                    // 如果是 current 发生了改变，自动进行全局广播
                    if (property === "current") {
                        // console.log(`[自动广播] current 变更为: ${value}`);
                        
                        // 确保服务已经启动后再广播
                        if (globalThis.server) {
                            globalThis.server.publish("global-current", JSON.stringify({
                                type: "state_changed",
                                time: new Date().toISOString(),
                                data: value
                            }));
                        }
                    }
                    return true;
                }
            }
        );

        // 单引擎 OCR 必须串行：Promise.all 并发会抢同一 stdin/stdout，导致字段结果串台
        let ocrChain = Promise.resolve();
        const OCR_TIMEOUT_MS = 45_000;

        // 空白/无效切片不送引擎，直接按「未识别到文字」返回
        function emptyOcrResult() {
            return { code: 101, data: [] };
        }
        
        function isValidOcrInput(imagePathOrBase64, isBase64) {
            if (!imagePathOrBase64) return false;
            if (isBase64) return String(imagePathOrBase64).length >= 64;
            return true;
        }

        // OCR 识别逻辑（工业级全自动滑窗闭环版）
        const encoder = new TextEncoder();
        async function recognizeOffline(imagePathOrBase64, isBase64 = false) {
            if (!isValidOcrInput(imagePathOrBase64, isBase64)) return emptyOcrResult();
            
            const run = async () => {
                const task = isBase64
                    ? { "image_base64": imagePathOrBase64 }
                    : { "image_path": imagePathOrBase64 };
                
                const payload = encoder.encode(JSON.stringify(task) + "\n");
                ocrProcess.stdin.write(payload);
                ocrProcess.stdin.flush();
                
                ocrDataBuffer = "";
                const startedAt = Date.now();
                
                while (true) {
                    if (Date.now() - startedAt > OCR_TIMEOUT_MS) {
                        ocrDataBuffer = "";
                        throw new Error("OCR 识别超时");
                    }
                    
                    const { value, done } = await lineReader.read();
                    if (done) throw new Error("OCR 引擎进程已退出");
                    if (!value) continue;
                    
                    ocrDataBuffer += value;
                    if (ocrDataBuffer.length > 8_000_000) {
                        ocrDataBuffer = "";
                        throw new Error("OCR 缓冲溢出");
                    }
                    
                    const jsonStartIdx = ocrDataBuffer.indexOf('{');
                    if (jsonStartIdx === -1) {
                        ocrDataBuffer = "";
                        continue;
                    }
                    
                    const potentialJson = ocrDataBuffer.substring(jsonStartIdx).trim();
                    
                    try {
                        const json = JSON.parse(potentialJson);
                        if (json && typeof json.code === 'number') {
                            const texts = Array.isArray(json.data)
                                ? json.data.map(item => item?.text ?? '').filter(Boolean)
                                : [];
                            console.log(`📊 数据包响应码: ${json.code}`, `数据: ${JSON.stringify(texts)}`);
                            logger.debug('OCR 单次识别完成', { code: json.code, texts });
                            ocrDataBuffer = "";
                            // 100=有字，101=无字，其它 code 也视为本次任务结束
                            return {
                                code: json.code,
                                data: Array.isArray(json.data) ? json.data : []
                            };
                        }
                    } catch {
                        // 半包 JSON，继续读流
                    }
                }
            };
            
            const prev = ocrChain;
            let release;
            ocrChain = new Promise((resolve) => { release = resolve; });
            await prev;
            try {
                return await run();
            } finally {
                release();
            }
        }

        // 公共回复函数保持不变...
        const corsHeaders = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        };
        
        const sendReply = (data = {}, status = 200) => {
            const responseBody = Object.assign({
                code: status,
                data: null,
                msg: '操作成功'
            }, data);
            
            return Response.json(responseBody, {
                status: status,
                headers: corsHeaders
            });
        }

        // 服务端启动与路由
        globalThis.server = Bun.serve({
            port: 13888,
            async fetch(req, server) {
                const url = new URL(req.url);
                const path = url.pathname;
                
                // 无论任何路径，只要是 OPTIONS 请求，直接全量拦截并返回 204
                if (req.method === "OPTIONS") {
                    return new Response(null, {
                        status: 204,
                        headers: corsHeaders
                    });
                }
                
                // 动态路由分发
                try {
                    // 基础根路径 / 健康检查
                    if (path === '/' || path === '/api/health') {
                        return sendReply({
                            code: 200,
                            data: {
                                ok: true,
                                ocrAlive: ocrProcess.exitCode === null,
                                time: new Date().toISOString()
                            }
                        });
                    }
                    
                    // websocket链接
                    if (path === "/ws") {
                        const upgraded = server.upgrade(req, { data: { joinedAt: Date.now() } });
                        if (upgraded) return undefined;
                        return new Response("Upgrade failed", { status: 400 });
                    }
                    
                    // OCR 接口
                    if (path === '/api/ocr') {
                        if (req.method !== 'POST') {
                            return sendReply({ code: 405, msg: '请求方法不允许' }, 405);
                        }
                        
                        try {
                            const { images } = await req.json();
                            if (!images || !images.length) {
                                logger.warn('OCR 请求 images 为空');
                                return sendReply({ code: -1, data: null, msg: 'images 参数不能为空' });
                            }
                            
                            logger.info('OCR 批次开始', { count: images.length });
                            
                            let result = [];
                            
                            for (let imageItem of images) {
                                // 🚨 完美解构前端上传的 9 张局部小图与 1 张大图
                                const {
                                    entry_image,          // 留置原地，绝对不参与后面的 recognizeOffline 识别
                                    invoiceType_image,    // 抬头（新增）
                                    invoiceNumber_image,  // 号码
                                    invoiceDate_image,    // 日期（新增）
                                    buyerName_image,      // 购买方
                                    sellerName_image,     // 销售方
                                    amount_image,         // 金额
                                    taxAmount_image,      // 税额
                                    totalAmount_image,    // 价税合计
                                    issuer_image,         // 开票人
                                    ...args
                                } = imageItem;
                                
                                logger.info('OCR 单票开始', {
                                    entry: args.entry,
                                    annotatedPath: args.annotatedPath || '',
                                    isRailwayInvoice: !!imageItem.isRailwayInvoice
                                });
                                
                                try {
                                    // 🛠️ 1. 单引擎串行识别 9 个切片（禁止 Promise.all，避免结果串台）
                                    const typeOcr = await recognizeOffline(invoiceType_image, true);
                                    const numberOcr = await recognizeOffline(invoiceNumber_image, true);
                                    const dateOcr = await recognizeOffline(invoiceDate_image, true);
                                    const buyerOcr = await recognizeOffline(buyerName_image, true);
                                    const sellerOcr = sellerName_image
                                        ? await recognizeOffline(sellerName_image, true)
                                        : null;
                                    const amountOcr = await recognizeOffline(amount_image, true);
                                    const taxAmountOcr = await recognizeOffline(taxAmount_image, true);
                                    const totalAmountOcr = await recognizeOffline(totalAmount_image, true);
                                    const issuerOcr = await recognizeOffline(issuer_image, true);
                                    
                                    const extractText = (ocrRes) => {
                                        if (!ocrRes || typeof ocrRes.code !== 'number') return [];
                                        if (ocrRes.code === 100 && Array.isArray(ocrRes.data)) {
                                            return ocrRes.data.map(_ => String(_?.text || '').trim()).filter(Boolean);
                                        }
                                        return [];
                                    };
                                    
                                    // 🛠️ 2. 字段级语义清洗（号码/日期/购销方/金额/铁路票）
                                    const structuredInvoice = cleanCroppedInvoiceFields({
                                        typeTexts: extractText(typeOcr),
                                        numTexts: extractText(numberOcr),
                                        dateTexts: extractText(dateOcr),
                                        buyerTexts: extractText(buyerOcr),
                                        sellerTexts: extractText(sellerOcr),
                                        amtTexts: extractText(amountOcr),
                                        taxTexts: extractText(taxAmountOcr),
                                        totalTexts: extractText(totalAmountOcr),
                                        issuerTexts: extractText(issuerOcr)
                                    }, !!imageItem.isRailwayInvoice);
                                    
                                    console.log('裁切识别出的数据：', structuredInvoice);
                                    logger.info('OCR 字段清洗完成', {
                                        entry: args.entry,
                                        invoiceNumber: structuredInvoice.invoiceNumber,
                                        invoiceDate: structuredInvoice.invoiceDate
                                    });
                                    
                                    state.current++;
                                    
                                    // 🛠️ 3. 字段融合并保存至 Bun SQLite
                                    // annotatedPath 由前端落盘后传入，此处只入库路径；不改动 invoices.db 存储位置
                                    const finalInvoiceData = {
                                        ...args,
                                        entry: args.entry || "",
                                        taxBureau: structuredInvoice.taxBureau || "",
                                        ...structuredInvoice,
                                        annotatedPath: args.annotatedPath || ""
                                    };
                                    
                                    const dbResult = insertInvoice(finalInvoiceData);
                                    if (!dbResult.success) {
                                        console.error("⚠️ 本地 SQLite 写入受阻，具体原因为:", dbResult.error);
                                        logger.error('OCR 入库失败', {
                                            entry: finalInvoiceData.entry,
                                            invoiceNumber: finalInvoiceData.invoiceNumber,
                                            error: dbResult.error
                                        });
                                    } else {
                                        logger.info('OCR 入库成功', {
                                            entry: finalInvoiceData.entry,
                                            invoiceNumber: finalInvoiceData.invoiceNumber,
                                            annotatedPath: finalInvoiceData.annotatedPath,
                                            lastInsertRowId: dbResult.lastInsertRowId
                                        });
                                    }
                                    
                                    result.push(finalInvoiceData);
                                } catch (ocrSingleError) {
                                    console.error(`处理单张发票切片流时崩溃: ${imageItem.entry}`, ocrSingleError);
                                    logger.error('OCR 单票异常', {
                                        entry: imageItem.entry,
                                        error: ocrSingleError?.message || String(ocrSingleError)
                                    });
                                    result.push({ error: true, msg: `切片流识别异常: ${ocrSingleError.message}` });
                                }
                            }
                            
                            logger.info('OCR 批次结束', { count: images.length, success: result.filter(r => !r.error).length });
                            return sendReply({ code: 200, data: result, msg: "操作成功" });
                            
                        } catch (e) {
                            console.error('❌ OCR 路由核心大闸彻底崩溃： ', e);
                            logger.error('OCR 路由崩溃', { error: e?.message || String(e) });
                            return sendReply({ code: -1, msg: `识别故障: ${e.message}` }, 500);
                        }
                    }
                    
                    // 查询本地数据接口
                    if (path === '/api/query') {
                        if (req.method !== 'GET') {
                            return sendReply({ code: 405, msg: '请求方法不允许' }, 405);
                        }
                        
                        const buyerName = url.searchParams.get('buyerName') || '';
                        const invoiceNumber = url.searchParams.get('invoiceNumber') || '';
                        const date = url.searchParams.get('date') || '';
                        const pageNoStr = url.searchParams.get('pageNo');
                        const limitStr = url.searchParams.get('limit');
                        
                        const pageNo = parseInt(pageNoStr, 10);
                        const limit = parseInt(limitStr, 10);
                        
                        if (!pageNo || !limit || isNaN(pageNo) || isNaN(limit)) {
                            return sendReply({ code: -1, msg: 'pageNo 或 limit 参数不可为空或0' });
                        }
                        
                        logger.info('查询发票', { buyerName, invoiceNumber, date, pageNo, limit });
                        const { list, total } = queryInvoices({ buyerName, invoiceNumber, date, pageNo, limit });
                        logger.info('查询发票完成', { total, pageSize: list.length });
                        return sendReply({
                            code: 200,
                            data: list,
                            total
                        });
                    }
                    
                    // 更新数据
                    if(path === '/api/update') {
                        if (req.method !== 'POST') {
                            return sendReply({ code: 405, msg: '请求方法不允许' }, 405);
                        }
                        
                        const data = await req.json();
                        
                        if(!data.invoiceNumber) {
                            return sendReply({ code: -1, data: null, msg: '发票号码不可为空' })
                        }
                        
                        Object.keys(data).forEach(key => {
                            data[key] = data[key].toString();
                        })
                        
                        logger.info('更新发票', { id: data.id, invoiceNumber: data.invoiceNumber });
                        const result = updateInvoice(data.id, data);
                        
                        if(result.success) {
                            logger.info('更新发票成功', { id: data.id, changes: result.changes });
                            return sendReply({ data: result.changes })
                        }
                        else {
                            logger.error('更新发票失败', { id: data.id, error: result.error });
                            return sendReply({ code: -1, msg: '数据更新失败' })
                        }
                    }
                    
                    // 导出数据
                    if(path === '/api/export') {
                        if (req.method !== 'GET') {
                            return sendReply({ code: 405, msg: '请求方法不允许' }, 405);
                        }
                        
                        const buyerName = url.searchParams.get('buyerName') || '';
                        const date = url.searchParams.get('date') || '';
                        
                        logger.info('导出发票查询', { buyerName, date });
                        const { list, total } = exportInvoices({ buyerName, date });
                        logger.info('导出发票查询完成', { total });
                        
                        return sendReply({
                            code: 200,
                            data: list,
                            total
                        });
                    }
                    
                    // 删除数据
                    if(path === '/api/delete') {
                        if (req.method !== 'GET') {
                            return sendReply({ code: 405, msg: '请求方法不允许' }, 405);
                        }
                        
                        const id = url.searchParams.get('id') || '';
                        
                        if(!id) {
                            return sendReply({ code: -1, msg: 'id 参数不可为空' })
                        }
                        
                        logger.info('删除发票', { id });
                        const result = deleteInvoice(id);
                        if (result.success) {
                            logger.info('删除发票成功', { id, changes: result.changes });
                        } else {
                            logger.error('删除发票失败', { id, error: result.error });
                        }
                        
                        return sendReply(result.success ? {
                            data: result.changes,
                            msg: '删除成功'
                        } : {
                            code: -1,
                            msg: '删除失败'
                        })
                    }
                    
                    // 404 页面
                    return sendReply({ code: 404, msg: '接口不存在' }, 404);
                }
                catch (e) {
                    // 全局异常捕获，确保即使后端业务报错，也会带上跨域头返回给前端
                    logger.error('HTTP 全局异常', { error: e?.message || String(e), path });
                    return sendReply({ code: 600, msg: `服务器内部错误: ${e.message}` }, 500);
                }
            },
            websocket: {
                open(ws) {
                    ws.subscribe("global-current");
                    logger.info('WebSocket 已连接');
                    ws.send(JSON.stringify({ type: 'connected', time: new Date().toISOString(), data: state.current }));
                },
                message(ws, message) {
                    try {
                        const parsed = JSON.parse(message);
                        
                        // ✨ 新增：收到前端心跳包，原路返回 pong
                        if (parsed.type === "ping") {
                            ws.send(JSON.stringify({ type: "pong", time: new Date().toISOString() }));
                            return; // 拦截心跳，不向下走 OCR 的广播逻辑
                        }
                        // 重置当前处理参数
                        if(parsed.type === 'state_reset') {
                            state.current = 0;
                            logger.info('OCR 进度已重置');
                        }
                    } catch (e) {
                        // 兼容非 JSON 的纯文本心跳包处理（可选）
                        if (message === "ping") {
                            ws.send("pong");
                            return;
                        }
                    }
                },
                close(ws) {
                    ws.unsubscribe("global-current");
                    logger.info('WebSocket 已断开');
                }
            }
        });
        
        logBridgeStartup({ port: server.port, ocrExe: OCR_EXE_PATH });
        logger.info(`服务已开启 http://localhost:${server.port}`);
        
        process.on('uncaughtException', (err) => {
            console.error('❌ 未捕获异常（服务保持运行）:', err);
            logger.error('未捕获异常', { error: err?.message || String(err), stack: err?.stack });
        });
        process.on('unhandledRejection', (reason) => {
            console.error('❌ 未捕获 Promise 拒绝（服务保持运行）:', reason);
            logger.error('未捕获 Promise 拒绝', { reason: String(reason) });
        });
        
        ocrProcess.exited.then((code) => {
            console.error(`⚠️ OCR 子进程已退出，code=${code}。HTTP/WS 仍可用，但识别请求会失败，请重启应用。`);
            logger.error('OCR 子进程已退出', { code });
        }).catch(() => {});
        
        process.on("exit", () => {
            ocrProcess.kill();
        });
    } catch (err) {
        logger.error('OCR 引擎启动初始化失败', { error: err.message, stack: err.stack });
    }
})();
