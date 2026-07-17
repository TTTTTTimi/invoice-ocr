<!-- ViewScan -->
<!-- 2026-07-10 09:27:39 -->
<template>
    <el-card shadow="hover" class="ViewScan" style="--el-card-padding: 18px">
        <el-input placeholder="选择文件夹" readonly v-model="inputDir">
            <template #append>
                <el-button @click="changeOpenDir()">选择文件夹</el-button>
            </template>
        </el-input>
    </el-card>
</template>

<script setup>
    import { filesystem, os, storage } from "@neutralinojs/lib"
    // import dayjs from "dayjs"
    // import { nanoid } from "nanoid"
    import * as pdfjsLib from "pdfjs-dist"
    import PDFWorker from 'pdfjs-dist/build/pdf.worker.mjs?worker'
    import { useCommon } from '~/store/common'
    import { addInvoice, findInvoice } from "~/util/db"
    
    try {
        pdfjsLib.GlobalWorkerOptions.workerPort = new PDFWorker()
    } catch (e) {
        console.error('初始化本地 Worker 失败:', e);
        $neu.log?.(`[扫描] 初始化 PDF Worker 失败 ${e?.message || e}`, 'error');
    }
    
    // store
    const store = useCommon(),
        { inputDir, currentScanTotal, handleScanCount } = storeToRefs(store),
        { commonSearch, uploadImagesOCR } = store;
    
    // 落盘地址
    // const getDataPath = async (fileName) => {
    //     const local = await os.getPath('cache');
    //     const path = [local, 'invoice', fileName].join('/');
    //     return await filesystem.getNormalizedPath(path)
    // }
    
    // 坐标计算：宽固定缩放到 2048 后，偏移只跟宽度成比例；上区锚顶、下区锚底
    const getAlignedRegions = (W, H) => {
        const s = W / 2048; // 勿用 H/standardH，否则高票会把底框抬进明细区
        
        const top = (xRatio, y0, wRatio, h0) => ({
            x: W * xRatio, y: y0 * s, w: W * wRatio, h: h0 * s
        });
        const bottom = (xRatio, fromBottom, wRatio, h0) => {
            const h = h0 * s;
            const y = Math.max(0, Math.min(H - fromBottom * s, H - h));
            return { x: W * xRatio, y, w: W * wRatio, h };
        };
        
        return {
            // 上方 5 个区域（号码/日期为初值，随后墨迹贴齐）
            invoiceType_image:   top(0.28, 35, 0.40, 280), // 标题+红章（含税务局）
            invoiceNumber_image: top(0.775, 100, 0.20, 52),
            invoiceDate_image:   top(0.775, 160, 0.16, 48),
            buyerName_image:     top(0.055, 320, 0.446, 180),
            sellerName_image:    top(0.530, 320, 0.444, 180),
            
            // 下方 4 个区域（金额/税额初值，随后相对价税合计向上贴齐）
            totalAmount_image:   bottom(0.70, 385, 0.18, 48), // 价税合计（小写）：略左移、收窄，避免偏右过宽
            taxAmount_image:     bottom(0.865, 455, 0.12, 50),
            amount_image:        bottom(0.65, 455, 0.15, 50),
            issuer_image:        bottom(0.145, 115, 0.20, 55)
        };
    };
    
    // 铁路电子客票：按样例框比例截取（号码左上；票价中左；开票人=乘客姓名；购买方名/税号底栏；销售方=中国铁路集团）
    const getRailwayRegions = (W, H) => {
        const box = (xRatio, yRatio, wRatio, hRatio) => ({
            x: W * xRatio,
            y: H * yRatio,
            w: W * wRatio,
            h: H * hRatio
        });
        const price = box(0.088, 0.412, 0.145, 0.070); // 票价 ¥xxx
        return {
            invoiceType_image:   box(0.220, 0.010, 0.560, 0.120), // 标题+红章（含税务局）
            invoiceNumber_image: box(0.035, 0.095, 0.320, 0.055), // 左上 发票号码
            invoiceDate_image:   box(0.700, 0.095, 0.265, 0.055), // 右上 开票日期
            issuer_image:        box(0.340, 0.530, 0.100, 0.060), // 乘客姓名 → 开票人
            buyerName_image:     box(0.030, 0.730, 0.380, 0.070), // 底栏 购买方名称
            amount_image:        { ...price },
            totalAmount_image:   { ...price }
        };
    };
    
    // 按列扫描深色文字行，把框贴到墨迹上（修正号码/日期；合计金额/税额随版式上下漂移）
    const refineRegionsByInk = (canvas, regions) => {
        const W = canvas.width;
        const H = canvas.height;
        const s = W / 2048;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        
        const rowScores = (x, w, y0, y1) => {
            const xi = Math.max(0, Math.floor(x));
            const yi = Math.max(0, Math.floor(y0));
            const wi = Math.max(1, Math.min(Math.floor(w), W - xi));
            const hi = Math.max(1, Math.min(Math.floor(y1 - y0), H - yi));
            const { data } = ctx.getImageData(xi, yi, wi, hi);
            const scores = new Float32Array(hi);
            for (let row = 0; row < hi; row++) {
                let dark = 0;
                const base = row * wi * 4;
                for (let col = 0; col < wi; col++) {
                    const i = base + col * 4;
                    const r = data[i], g = data[i + 1], b = data[i + 2];
                    if (r < 85 && g < 85 && b < 85 && Math.abs(r - g) < 30) dark++;
                }
                scores[row] = dark / wi;
            }
            const smoothed = new Float32Array(hi);
            for (let i = 0; i < hi; i++) {
                const a = scores[Math.max(0, i - 1)];
                const b = scores[i];
                const c = scores[Math.min(hi - 1, i + 1)];
                smoothed[i] = (a + b + c) / 3;
            }
            return { scores: smoothed, y0: yi };
        };
        
        const findBands = (scores, y0, thr, minH, maxH) => {
            const bands = [];
            let i = 0;
            while (i < scores.length) {
                if (scores[i] >= thr) {
                    let j = i;
                    while (j < scores.length && scores[j] >= thr * 0.45) j++;
                    const bh = j - i;
                    if (bh >= minH && bh <= maxH) {
                        let sum = 0, peak = 0;
                        for (let k = i; k < j; k++) {
                            sum += scores[k];
                            if (scores[k] > peak) peak = scores[k];
                        }
                        bands.push({ a: y0 + i, b: y0 + j - 1, v: sum / bh, peak });
                    }
                    i = j;
                } else {
                    i++;
                }
            }
            return bands;
        };
        
        const avgInk = (scores, y0, yA, yB) => {
            const i0 = Math.max(0, Math.floor(yA - y0));
            const i1 = Math.min(scores.length, Math.ceil(yB - y0));
            if (i1 <= i0) return 0;
            let sum = 0;
            for (let i = i0; i < i1; i++) sum += scores[i];
            return sum / (i1 - i0);
        };
        
        const alignTop = (a, h, pad = 8) => Math.max(0, Math.min(H - h, a - pad));
        // 墨迹带垂直居中，避免价税合计/税额框顶边切字或整体偏下
        const alignMid = (a, b, h) => Math.max(0, Math.min(H - h, Math.round((a + b) / 2 - h / 2)));
        
        const snapHeader = (key, yMin, yMax, thr) => {
            const r = regions[key];
            const { scores, y0 } = rowScores(r.x, r.w, yMin, yMax);
            const bands = findBands(scores, y0, thr, 3 * s, 42 * s);
            if (!bands.length) return;
            if (key === 'invoiceNumber_image') {
                r.y = alignTop(bands[0].a, r.h, 6 * s);
            } else {
                const numBottom = regions.invoiceNumber_image.y + regions.invoiceNumber_image.h * 0.6;
                const band = bands.find(b => b.a >= numBottom) || bands[bands.length - 1];
                r.y = alignTop(band.a, r.h, 6 * s);
            }
        };
        snapHeader('invoiceNumber_image', 70 * s, 165 * s, 0.018);
        snapHeader('invoiceDate_image', 145 * s, 250 * s, 0.015);
        
        // 价税合计（小写）：在底栏右侧找最稳墨迹，居中贴齐并微调水平位置
        {
            const r = regions.totalAmount_image;
            const x0 = W * 0.68, w0 = W * 0.22;
            const yMin = H - 480 * s, yMax = H - 260 * s;
            const { scores, y0 } = rowScores(x0, w0, yMin, yMax);
            const bands = findBands(scores, y0, 0.014, 3 * s, 45 * s)
                .filter(b => b.peak >= 0.016);
            if (bands.length) {
                // 取搜索窗内偏下、但避开最底部干扰的最强带
                const target = H - 390 * s;
                const band = bands.reduce((best, b) => {
                    const cy = (b.a + b.b) / 2;
                    const score = b.peak - Math.abs(cy - target) / (200 * s);
                    const bestCy = (best.a + best.b) / 2;
                    const bestScore = best.peak - Math.abs(bestCy - target) / (200 * s);
                    return score > bestScore ? b : best;
                });
                r.y = alignMid(band.a, band.b, r.h);
                // 水平：在该行向左收到数字墨迹起始处附近
                const rowY = Math.max(y0, Math.floor((band.a + band.b) / 2 - 12 * s));
                const rowH = Math.max(16 * s, Math.min(36 * s, band.b - band.a + 16 * s));
                const { data } = ctx.getImageData(Math.floor(x0), Math.floor(rowY), Math.floor(w0), Math.floor(rowH));
                const ww = Math.floor(w0), hh = Math.floor(rowH);
                let left = -1;
                for (let col = 0; col < ww && left < 0; col++) {
                    let dark = 0;
                    for (let row = 0; row < hh; row++) {
                        const i = (row * ww + col) * 4;
                        const R = data[i], G = data[i + 1], B = data[i + 2];
                        if (R < 85 && G < 85 && B < 85 && Math.abs(R - G) < 30) dark++;
                    }
                    if (dark / hh >= 0.08) left = col;
                }
                if (left >= 0) {
                    r.x = Math.max(W * 0.62, x0 + left - 16 * s);
                    r.w = Math.min(W * 0.96 - r.x, Math.max(W * 0.14, w0 - left + 28 * s));
                } else {
                    r.x = W * 0.70;
                    r.w = W * 0.18;
                }
            }
        }
        
        // 合计金额：价税合计上方最靠下的一条墨迹
        {
            const r = regions.amount_image;
            const x = W * 0.65, w = W * 0.15;
            const totalY = regions.totalAmount_image.y;
            const { scores, y0 } = rowScores(x, w, Math.max(0, totalY - 950 * s), totalY - 12 * s);
            const bands = findBands(scores, y0, 0.014, 3 * s, 40 * s);
            if (bands.length) {
                const band = bands.reduce((best, b) => (b.a > best.a ? b : best));
                r.y = alignMid(band.a, band.b, r.h);
            } else {
                r.y = Math.max(0, totalY - 70 * s);
            }
            r.x = x;
            r.w = w;
        }
        
        // 合计税额：与金额同属「合计」行 → 强制与金额齐平；仅在税额明显更高（异形票）时才单独贴齐
        {
            const r = regions.taxAmount_image;
            const x = W * 0.865, w = W * 0.12;
            const totalY = regions.totalAmount_image.y;
            const amountY = regions.amount_image.y;
            const amountH = regions.amount_image.h;
            const { scores, y0 } = rowScores(x, w, Math.max(0, totalY - 950 * s), totalY - 12 * s);
            const bands = findBands(scores, y0, 0.018, 3 * s, 40 * s)
                .filter(b => b.peak >= 0.022 && b.v >= 0.014);
            const hejiInk = avgInk(scores, y0, amountY, amountY + amountH);
            const hejiEmpty = hejiInk < 0.01;
            
            if (hejiEmpty) {
                r.y = amountY;
            } else if (bands.length) {
                const band = bands.reduce((best, b) => (b.a > best.a ? b : best));
                const bandY = alignMid(band.a, band.b, amountH);
                // 与金额行接近则齐平，避免税额框单独偏高/偏低
                r.y = Math.abs(bandY - amountY) <= 36 * s ? amountY : bandY;
            } else {
                r.y = amountY;
            }
            r.x = x;
            r.w = w;
            r.h = amountH;
        }
        
        return regions;
    };
    
    // 铁路客票版式探测（PDF 文本 / 图片浅蓝底启发式）
    const detectRailwayInvoice = (pageText, canvas) => {
        const t = String(pageText || '').replace(/\s+/g, '');
        if (t.includes('铁路电子客票') || t.includes('电子客票号')) return true;
        if (!canvas) return false;
        // 铁路票常见浅蓝底：抽样中心偏上区域，B 通道明显高于 R
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const w = Math.min(120, canvas.width);
        const h = Math.min(80, Math.floor(canvas.height * 0.2));
        const x = Math.floor((canvas.width - w) / 2);
        const y = Math.floor(canvas.height * 0.08);
        const { data } = ctx.getImageData(x, y, w, h);
        let rSum = 0, bSum = 0, n = w * h;
        for (let i = 0; i < data.length; i += 4) {
            rSum += data[i];
            bSum += data[i + 2];
        }
        return (bSum / n) - (rSum / n) > 18;
    };
    
    // 数据抽取：支持在大图上绘制调试黄框，且不污染 OCR 切片
    const cropAllRegions = (mainCanvas, options = {}) => {
        const W = mainCanvas.width;
        const H = mainCanvas.height;
        const isRailway = !!options.isRailway;
        // 铁路票用专用比例框；普通票走锚点+墨迹贴齐
        const dbAlignedRegions = isRailway
            ? getRailwayRegions(W, H)
            : refineRegionsByInk(mainCanvas, getAlignedRegions(W, H));
        
        // 1. 建立一张专门用来打框标记的“大图画布”，将原始图像 1:1 复制过来
        const visualCanvas = document.createElement('canvas');
        const visualContext = visualCanvas.getContext('2d');
        visualCanvas.width = W;
        visualCanvas.height = H;
        visualContext.drawImage(mainCanvas, 0, 0);
        
        // 2. 在“大图画布”上用高亮黄色线条将矩阵框圈起来
        visualContext.strokeStyle = "#FFCC00"; // 标准财务荧光黄边框
        visualContext.lineWidth = 4;           // 设置粗细为 4 像素，确保在 2048 分辨率下清晰可见
        visualContext.lineJoin = "round";      // 圆角边框过渡
        
        Object.keys(dbAlignedRegions).forEach(key => {
            const region = dbAlignedRegions[key];
            // 在大图上绘制发票检测黄框
            visualContext.strokeRect(region.x, region.y, region.w, region.h);
        });
        
        // 3. 将打好黄框的发票大图转换为 Base64 塞入 entry_image 字段
        const outputOcrPayload = {
            entry_image: visualCanvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, ''),
            isRailwayInvoice: isRailway,
            sellerName_image: '' // 默认空；普通票下面会覆盖
        };
        
        // 4. 建立微型裁剪画布进行局部小图截取（注意：必须从干净的 mainCanvas 上截取，防止黄线干扰 OCR 识别率）
        const cropCanvas = document.createElement('canvas');
        const cropContext = cropCanvas.getContext('2d');
        
        Object.keys(dbAlignedRegions).forEach(key => {
            const region = dbAlignedRegions[key];
            cropCanvas.width = region.w;
            cropCanvas.height = region.h;
            cropContext.imageSmoothingEnabled = true;
            cropContext.imageSmoothingQuality = 'high';
            cropContext.clearRect(0, 0, region.w, region.h);
            
            // 从没有任何线条污染的干净主画布上提取无损 OCR 数据片
            cropContext.drawImage(
                mainCanvas,
                region.x, region.y, region.w, region.h,
                0, 0, region.w, region.h
            );
            outputOcrPayload[key] = cropCanvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
        });
        
        return outputOcrPayload;
    };
    
    // PDF处理
    const convertPdfToOcrFields = async (arrayBuffer) => {
        const absoluteCMapUrl = new URL('/cmaps/', window.location.origin).href;
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer, cMapUrl: absoluteCMapUrl, cMapPacked: true }).promise;
        const page = await pdf.getPage(1);
        
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(it => it.str || '').join('');
        
        const unscaledViewport = page.getViewport({ scale: 1.0 });
        const targetWidth = 2048;
        const optimalScale = targetWidth / unscaledViewport.width;
        const viewport = page.getViewport({ scale: optimalScale });
        
        const mainCanvas = document.createElement('canvas');
        const mainContext = mainCanvas.getContext('2d');
        mainCanvas.width = viewport.width;
        mainCanvas.height = viewport.height;
        
        mainContext.imageSmoothingEnabled = true;
        mainContext.imageSmoothingQuality = 'high';
        await page.render({ canvasContext: mainContext, viewport: viewport }).promise;
        
        const isRailway = detectRailwayInvoice(pageText, mainCanvas);
        return cropAllRegions(mainCanvas, { isRailway });
    };
    
    // 图片处理
    const convertImageToOcrFields = (arrayBuffer) => {
        return new Promise((resolve, reject) => {
            const blob = new Blob([arrayBuffer]);
            const url = URL.createObjectURL(blob);
            const img = new Image();
            img.onload = () => {
                URL.revokeObjectURL(url);
                const targetWidth = 2048;
                const optimalScale = targetWidth / img.naturalWidth;
                const targetHeight = img.naturalHeight * optimalScale;
                
                const mainCanvas = document.createElement('canvas');
                const mainContext = mainCanvas.getContext('2d');
                mainCanvas.width = targetWidth;
                mainCanvas.height = targetHeight;
                
                mainContext.imageSmoothingEnabled = true;
                mainContext.imageSmoothingQuality = 'high';
                mainContext.drawImage(img, 0, 0, targetWidth, targetHeight);
                
                const isRailway = detectRailwayInvoice('', mainCanvas);
                resolve(cropAllRegions(mainCanvas, { isRailway }));
            };
            img.onerror = (err) => { URL.revokeObjectURL(url); reject(err); };
            img.src = url;
        });
    };
    
    // 将 Base64 字符串保存为本地文件
    // const saveBase64ToFile = async (base64Data, targetPath) => {
    //     try {
    //         // 自动检查并创建父级文件夹
    //         // 兼容斜杠和反斜杠，切出文件夹路径
    //         const folderPath = targetPath.substring(0, Math.max(targetPath.lastIndexOf('/'), targetPath.lastIndexOf('\\')));
    //         if (folderPath) {
    //             try {
    //                 await filesystem.createDirectory(folderPath);
    //             } catch (dirErr) {
    //                 // 如果因为已存在或其他非致命原因报错，可以忽略
    //             }
    //         }
    //         // 剥离 Base64 的 Mime 头部（预防部分图片含有 data:image/jpeg;base64,）
    //         const pureBase64 = base64Data.replace(/^data:.*?;base64,/, "");
    //
    //         const binaryString = window.atob(pureBase64);
    //         const len = binaryString.length;
    //
    //         const bytes = new Uint8Array(len);
    //         for (let i = 0; i < len; i++) {
    //             bytes[i] = binaryString.charCodeAt(i);
    //         }
    //
    //         await filesystem.writeBinaryFile(targetPath, bytes.buffer);
    //
    //         console.log(`文件成功保存至: ${targetPath}`);
    //         return { success: true, path: targetPath };
    //     } catch (error) {
    //         console.error("保存 Base64 文件失败:", error);
    //         return { success: false, error: error.message };
    //     }
    // }
    
    // 初始化设置扫描文件夹
    const initScanDir = async () => {
        try {
            if(window.taskTimer) {
                clearInterval(window.taskTimer);
                window.taskTimer = null;
            }
            
            inputDir.value = await storage.getData('scanDir');
            
            if(inputDir.value){
                await scanDir(inputDir.value);
                window.taskTimer = setInterval(() => {
                    scanDir(inputDir.value);
                }, 5000)
            }
        }
        catch (e) {}
    }
    
    // 扫描文件夹
    const scanDir = async (entry) => {
        await $neu.log(`[扫描] 开始目录=${entry}`, 'info');
        const arr = await filesystem.readDirectory(entry, { recursive: true });
        const files = arr.filter(_ => _.type === 'FILE');
        const images = [];
        await $neu.log(`[扫描] 文件总数=${files.length}`, 'info');
        
        for (let i = 0, len = files.length; i < len; i++) {
            const item = files[i];
            const ext = item.entry.toLowerCase().split(/\./g).at(-1);
            
            // 1. === 处理 PDF 文件 ===
            if (ext === 'pdf') {
                try {
                    if ((await findInvoice(item.entry)).code === 200) continue;
                    
                    const pdfPath = await filesystem.getNormalizedPath(item.path);
                    const binaryData = await filesystem.readBinaryFile(pdfPath);
                    
                    // 转换并生成全套 db 对齐裁剪图
                    const imageFields = await convertPdfToOcrFields(binaryData);
                    
                    images.push({ ...item, ...imageFields, type: ext, annotatedPath: '' });
                } catch (pdfError) {
                    console.error(`处理 PDF 文件 ${item.entry} 时出错:`, pdfError);
                    await $neu.log(`[扫描] PDF 失败 entry=${item.entry} err=${pdfError?.message || pdfError}`, 'error');
                }
            }
            
            // 2. === 处理图片文件（PNG/JPG/JPEG）===
            if (ext === 'png' || ext === 'jpg' || ext === 'jpeg') {
                try {
                    if ((await findInvoice(item.entry)).code === 200) continue;
                    
                    const imagePath = await filesystem.getNormalizedPath(item.path);
                    const binaryData = await filesystem.readBinaryFile(imagePath);
                    
                    // 利用临时 Blob 将图片转为 2048 像素并进行高精字段裁剪
                    const imageFields = await convertImageToOcrFields(binaryData);
                    
                    // 将解构后的数据塞进数组，此时图片的输出格式与 PDF 变得完全一样！
                    images.push({ ...item, ...imageFields, type: ext, annotatedPath: '' });
                } catch (err) {
                    console.error(`处理图片文件 ${item.entry} 时出错:`, err);
                    await $neu.log(`[扫描] 图片失败 entry=${item.entry} err=${err?.message || err}`, 'error');
                }
            }
        }
        
        // 3. 统一上传与本地状态更新流
        currentScanTotal.value = images.length;
        await $neu.log(`[扫描] 待 OCR 数量=${images.length}`, 'info');
        
        if (images.length) {
            // for (let i = 0, len = images.length; i < len; i++) {
            //     const item = images[i];
            //     const filename = `${[nanoid(), dayjs().format('YYYYMMDDHHmmssSSS')].join('_')}.jpg`;
            //     const targetPath = await getDataPath(filename);
            //     const result = await saveBase64ToFile(item.entry_image, targetPath);
            //     item.annotatedPath = result.success ? targetPath : '';
            // }
            //
            // console.log('images: ', images);
            
            // 将包含全套字段裁剪图的对象数组发送给 Bun 后端
            const result = await uploadImagesOCR({ images });
            const isCode = result.code === 200;
            if (isCode) {
                for (let i = 0, len = images.length; i < len; i++) {
                    const item = images[i];
                    await addInvoice(item.entry);
                }
                await $neu.log(`[扫描] OCR 成功并写入本地索引 count=${images.length}`, 'info');
            } else {
                await $neu.log(`[扫描] OCR 失败 msg=${result.msg}`, 'error');
            }
            $message[isCode ? 'success' : 'error'](result.msg);
            
            handleScanCount.value = 0;
            currentScanTotal.value = 0;
            
            return isCode;
        }
        await $neu.log('[扫描] 无新发票需处理', 'info');
        return false;
    }
    
    // 选择文件夹
    const changeOpenDir = async () => {
        const entry = await os.showFolderDialog('选择发票文件夹');
        
        if (entry) {
            inputDir.value = entry;
            await $neu.log(`[扫描] 用户选择目录=${entry}`, 'info');
            
            await storage.setData('scanDir', entry);
            
            const isCode = await scanDir(entry);
            
            isCode && commonSearch();
            await initScanDir();
        }
    }
    
    onMounted(initScanDir)
</script>

<style scoped lang="scss">
    .ViewScan {
    
    }
</style>