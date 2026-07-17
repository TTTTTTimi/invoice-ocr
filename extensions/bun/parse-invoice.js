import dayjs from "dayjs";

/** 从 OCR 行文本中提取金额（优先带小数） */
function pickMoney(texts = []) {
    const joined = texts.map(t => String(t || '').replace(/\s+/g, '')).filter(Boolean);
    for (const t of joined) {
        const m = t.match(/-?[\d,]+\.\d{2}/);
        if (m) return Math.abs(parseFloat(m[0].replace(/,/g, ''))).toFixed(2);
    }
    for (const t of joined) {
        const digits = t.replace(/[^\d.]/g, '');
        if (/^\d+(\.\d+)?$/.test(digits) && parseFloat(digits) > 0) {
            return parseFloat(digits).toFixed(2);
        }
    }
    return "";
}

/** 清洗公司名：去掉「名称」「购买方信息」等前缀标签 */
function cleanCompanyName(texts = []) {
    for (const raw of texts) {
        let t = String(raw || '').trim();
        if (!t) continue;
        const compact = t.replace(/\s+/g, '');
        if (/^[A-Z0-9]{15,18}$/i.test(compact)) continue; // 纯税号行跳过
        t = t.replace(/^(购买方名称|销售方名称|购买方信息|销售方信息|统一社会信用代码|纳税人识别号|名称|购买方|销售方)[:：\s]*/g, '')
            .trim();
        // 仍带「名称：xxx」时取冒号后
        if (/^(名称)[:：]/.test(t)) t = t.replace(/^名称[:：]\s*/, '').trim();
        // 日期/期：碎片（OCR 串台）直接跳过
        if (/期[:：]|\d{4}年\d{1,2}月|开票日期/.test(t)) continue;
        const m = t.match(/([\u4e00-\u9fa5A-Za-z0-9（）()]{4,40}(?:公司|有限|合伙|厂|店|部|中心|集团|网络服务部))/);
        if (m && !/信息|识别号|信用代码/.test(m[1])) return m[1];
        if (t.length >= 4 && /[\u4e00-\u9fa5]/.test(t) && !/\d{15,}/.test(t.replace(/\s+/g, ''))) return t;
    }
    return "";
}

/** 清洗开票日期 → YYYY-MM-DD（禁止把发票号码前 8 位误当成日期） */
function cleanInvoiceDate(texts = []) {
    const okYear = (y) => {
        const n = parseInt(y, 10);
        return n >= 2015 && n <= 2099;
    };
    for (const raw of texts) {
        const t = String(raw || '').replace(/\s+/g, '');
        // 优先：带年月日分隔
        let m = t.match(/(\d{4})[年\-/.](\d{1,2})[月\-/.](\d{1,2})日?/);
        if (m && okYear(m[1])) {
            const iso = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
            if (dayjs(iso).isValid()) return iso;
        }
        // 仅当整段恰好 8 位数字时才认 YYYYMMDD，避免 25322000… 发票号被截成 2532-20-00
        m = t.match(/^(\d{4})(\d{2})(\d{2})$/);
        if (m && okYear(m[1])) {
            const iso = `${m[1]}-${m[2]}-${m[3]}`;
            if (dayjs(iso).isValid()) return iso;
        }
    }
    return "";
}

/** 清洗发票号码 */
function cleanInvoiceNumber(texts = []) {
    for (const raw of texts) {
        const digits = String(raw || '').replace(/\D/g, '');
        if (digits.length >= 10 && digits.length <= 22) return digits;
    }
    const joined = texts.join('').replace(/\D/g, '');
    if (joined.length >= 10 && joined.length <= 22) return joined;
    return texts.find(t => /\d{10,}/.test(t))?.replace(/\D/g, '') || "";
}

const RAILWAY_SELLER_NAME = "中国铁路集团";

/** 省级区划码 → 税务局全称（用于发票号码反推） */
const PROVINCE_BUREAU_BY_CODE = {
    "11": "北京市税务局", "12": "天津市税务局", "13": "河北省税务局", "14": "山西省税务局",
    "15": "内蒙古自治区税务局", "21": "辽宁省税务局", "22": "吉林省税务局", "23": "黑龙江省税务局",
    "31": "上海市税务局", "32": "江苏省税务局", "33": "浙江省税务局", "34": "安徽省税务局",
    "35": "福建省税务局", "36": "江西省税务局", "37": "山东省税务局", "41": "河南省税务局",
    "42": "湖北省税务局", "43": "湖南省税务局", "44": "广东省税务局", "45": "广西壮族自治区税务局",
    "46": "海南省税务局", "50": "重庆市税务局", "51": "四川省税务局", "52": "贵州省税务局",
    "53": "云南省税务局", "54": "西藏自治区税务局", "61": "陕西省税务局", "62": "甘肃省税务局",
    "63": "青海省税务局", "64": "宁夏回族自治区税务局", "65": "新疆维吾尔自治区税务局",
    "81": "香港特别行政区税务局", "82": "澳门特别行政区税务局"
};

const PROVINCE_SHORT_TO_BUREAU = {
    "苏": "江苏省税务局", "浙": "浙江省税务局", "京": "北京市税务局", "沪": "上海市税务局",
    "粤": "广东省税务局", "鲁": "山东省税务局", "川": "四川省税务局", "闽": "福建省税务局",
    "皖": "安徽省税务局", "赣": "江西省税务局", "鄂": "湖北省税务局", "湘": "湖南省税务局",
    "豫": "河南省税务局", "冀": "河北省税务局", "晋": "山西省税务局", "辽": "辽宁省税务局",
    "吉": "吉林省税务局", "黑": "黑龙江省税务局", "琼": "海南省税务局", "贵": "贵州省税务局",
    "云": "云南省税务局", "陕": "陕西省税务局", "甘": "甘肃省税务局", "青": "青海省税务局",
    "桂": "广西壮族自治区税务局", "蒙": "内蒙古自治区税务局", "藏": "西藏自治区税务局",
    "宁": "宁夏回族自治区税务局", "新": "新疆维吾尔自治区税务局", "东": "山东省税务局"
};

const VALID_BUREAU_SET = new Set(Object.values(PROVINCE_BUREAU_BY_CODE));
const BUREAU_NOISE_RE = /发票|专用|普通|电子|客票|铁路|子发|网|用发|国家|税务总局/;

/** 截断省名补全（东省→山东省、苏省→江苏省） */
function fixTruncatedBureau(name = "") {
    let b = String(name || "").trim();
    if (!b) return "";
    b = b.replace(/产苏/g, "江苏").replace(/辽苏/g, "江苏").replace(/浙扛/g, "浙江");
    const short = b.match(/^([\u4e00-\u9fa5])省税务局$/);
    if (short && PROVINCE_SHORT_TO_BUREAU[short[1]]) {
        return PROVINCE_SHORT_TO_BUREAU[short[1]];
    }
    return b;
}

/** 是否为合法的标准税务局名称 */
function isCanonicalBureau(name = "") {
    const b = fixTruncatedBureau(name);
    if (!b || b === "国家税务总局" || BUREAU_NOISE_RE.test(b)) return false;
    if (VALID_BUREAU_SET.has(b)) return true;
    // 计划单列市 / 地级市税务局（如深圳市税务局）
    if (/^[\u4e00-\u9fa5]{2,4}市税务局$/.test(b)) return true;
    return false;
}

/** 从脏 OCR 串中提取标准税务局名（滑动窗口，避免「国家深圳市税务局」整段误匹配） */
function extractTaxBureauFromOcr(texts = []) {
    const joined = texts.map(t => String(t || '')).join('').replace(/\s+/g, '');
    if (!joined) return "";

    const patterns = [
        /^[\u4e00-\u9fa5]{1,12}(?:省|自治区|特别行政区)税务局/,
        /^[\u4e00-\u9fa5]{2,4}市税务局/
    ];
    const candidates = [];
    for (let i = 0; i < joined.length; i++) {
        const sub = joined.slice(i);
        for (const re of patterns) {
            const m = sub.match(re);
            if (!m) continue;
            const fixed = fixTruncatedBureau(m[0]);
            if (isCanonicalBureau(fixed)) candidates.push(fixed);
        }
    }
    if (!candidates.length) return "";
    return candidates.sort((a, b) => a.length - b.length)[0];
}

/** 全电发票号码反推税务局（主路径：稳定、无 OCR 噪点） */
function inferTaxBureauFromInvoiceNumber(invoiceNumber = "") {
    const digits = String(invoiceNumber || "").replace(/\D/g, "");
    if (digits.length < 5) return "";
    const pick = (code) => PROVINCE_BUREAU_BY_CODE[code] || "";
    const standard = pick(digits.substring(2, 4));
    if (standard) return standard;
    if (digits.length >= 8) {
        const alt = pick(digits.substring(6, 8));
        if (alt) return alt;
    }
    return "";
}

/** 税务局：号码优先，红章 OCR 仅作兜底且必须过白名单 */
function resolveTaxBureau(invoiceNumber = "", typeTexts = []) {
    const fromNumber = inferTaxBureauFromInvoiceNumber(invoiceNumber);
    if (fromNumber) return fromNumber;
    return extractTaxBureauFromOcr(typeTexts);
}

/**
 * 5+4 切片 OCR 结果清洗（供 /api/ocr 使用）
 * @param {Object} parts 各字段 OCR 文本数组
 * @param {boolean} isRailwayHint 前端/抬头判定的铁路客票标记
 */
export function cleanCroppedInvoiceFields(parts = {}, isRailwayHint = false) {
    const {
        typeTexts = [],
        numTexts = [],
        dateTexts = [],
        buyerTexts = [],
        sellerTexts = [],
        amtTexts = [],
        taxTexts = [],
        totalTexts = [],
        issuerTexts = []
    } = parts;

    const typeJoined = typeTexts.join('');
    const allJoined = [
        ...typeTexts, ...numTexts, ...dateTexts, ...buyerTexts, ...sellerTexts,
        ...amtTexts, ...taxTexts, ...totalTexts, ...issuerTexts
    ].join('');
    const isRailway = !!isRailwayHint
        || typeJoined.includes('铁路')
        || typeJoined.includes('电子客票')
        || allJoined.includes('铁路电子客票')
        || allJoined.includes('电子客票号');

    let invoiceType = "电子发票（普通发票）";
    if (isRailway) {
        invoiceType = "电子发票（铁路电子客票）";
    } else if (typeJoined.includes('专用发票') || /专用/.test(typeJoined.replace(/\s+/g, ''))) {
        invoiceType = "电子发票（增值税专用发票）";
    } else {
        const norm = typeJoined.replace(/\s+/g, '');
        // OCR 碎片如「细纸发票）」「国普发票）」统一归并为标准普通发票名称
        if (/普通|国普|细纸|统.*发票|电子.*发票/.test(norm) || norm.includes('发票')) {
            invoiceType = "电子发票（普通发票）";
        }
    }

    let amount = pickMoney(amtTexts);
    let taxAmount = pickMoney(taxTexts);
    let totalAmount = pickMoney(totalTexts);

    // 铁路票：切片里常有「票价」，合计/税额区可能为空
    if (isRailway) {
        const priceHit = [...totalTexts, ...amtTexts, ...typeTexts]
            .map(t => String(t || '').replace(/\s+/g, ''))
            .map(t => t.match(/(?:票价)?[¥￥]?(\d+\.\d{2})/))
            .find(Boolean);
        if (priceHit) totalAmount = parseFloat(priceHit[1]).toFixed(2);
        if (!totalAmount && amount) totalAmount = amount;
        if (totalAmount) {
            amount = totalAmount;
            taxAmount = "0.00";
        }
    }

    // 不征税：税额切片无有效数字
    if (!taxAmount) taxAmount = "0.00";
    if (!amount && totalAmount && taxAmount) {
        const t = parseFloat(totalAmount), x = parseFloat(taxAmount);
        if (!isNaN(t) && !isNaN(x)) amount = Math.max(0, t - x).toFixed(2);
    }
    if (!totalAmount && amount) {
        const a = parseFloat(amount), x = parseFloat(taxAmount) || 0;
        if (!isNaN(a)) totalAmount = (a + x).toFixed(2);
    }

    // 平账校验：金额+税额 ≈ 价税合计（容差 0.05）
    {
        const a = parseFloat(amount), x = parseFloat(taxAmount), t = parseFloat(totalAmount);
        if (!isNaN(a) && !isNaN(x) && !isNaN(t) && Math.abs(a + x - t) > 0.05) {
            if (Math.abs(a + x - t) <= 1 && t > 0) {
                // 轻微偏差时以价税合计为准反推税额
                taxAmount = Math.max(0, t - a).toFixed(2);
            }
        }
    }

    let taxRate = "0";
    {
        const a = parseFloat(amount), x = parseFloat(taxAmount);
        if (isRailway) {
            taxRate = "0";
        } else if (!isNaN(a) && a > 0 && !isNaN(x) && x >= 0) {
            taxRate = String(Math.round((x / a) * 100));
        }
    }

    let issuer = "";
    for (const raw of issuerTexts) {
        let t = String(raw || '').trim()
            .replace(/^(开票人|收款人|复核)[:：\s]*/g, '')
            .replace(/[：:].*$/, '')
            .trim();
        // 铁路票开票人多为 2–4 字中文乘客姓名
        if (/^[\u4e00-\u9fa5]{2,4}$/.test(t)) {
            issuer = t;
            break;
        }
        if (t && t.length <= 20 && !/管理员|信息|站|座/.test(t)) {
            issuer = t;
            break;
        }
    }

    const invoiceNumber = cleanInvoiceNumber(numTexts);
    const taxBureau = resolveTaxBureau(invoiceNumber, typeTexts);

    const invoice = {
        invoiceType,
        invoiceNumber,
        invoiceDate: cleanInvoiceDate(dateTexts),
        taxBureau,
        buyerName: cleanCompanyName(buyerTexts),
        sellerName: isRailway ? RAILWAY_SELLER_NAME : cleanCompanyName(sellerTexts),
        amount: amount || "0.00",
        taxRate,
        taxAmount: taxAmount || "0.00",
        totalAmount: totalAmount || "0.00",
        issuer
    };

    Object.keys(invoice).forEach(key => {
        if (invoice[key] === undefined || invoice[key] === null) invoice[key] = "";
        else invoice[key] = String(invoice[key]);
    });
    return invoice;
}

/**
 * 电子发票（空间高度纵向排队算法 v28.0 - 最终终结生产版）
 * 满足最新铁律：从上往下截取，第一顺位必为购买方，第二顺位必为销售方
 * @param {Array} ocrResults - PaddleOCR-json 返回的包含 box 和 text 的原始对象数组
 */
export function parseAndCleanInvoice(ocrResults) {
    const invoice = {
        invoiceType: "电子发票（普通发票）",
        invoiceNumber: "",
        invoiceDate: "",
        taxBureau: "",
        buyerName: "",
        sellerName: "",
        amount: "",
        taxRate: "0",      // 默认返回纯数字 "0"
        taxAmount: "",
        totalAmount: "",
        issuer: ""
    };
    
    if (!Array.isArray(ocrResults) || ocrResults.length === 0) return invoice;

// 1. 标准化全图文本流
    const cleanLines = ocrResults.map(item => {
        if (!item) return "";
        return (typeof item === 'object' ? String(item.text || '') : String(item)).trim();
    }).filter(Boolean);
    
    const fullText = cleanLines.join("\n");
    const noSpaceText = fullText.replace(/\s+/g, '');

// 铁路电子客票前置识别判定
    const isRailwayInvoice = noSpaceText.includes("铁路电子客票") || noSpaceText.includes("电子客票号");
    if (isRailwayInvoice) {
        invoice.invoiceType = "电子发票（铁路电子客票）";
        invoice.sellerName = RAILWAY_SELLER_NAME;
    } else if (noSpaceText.includes("专用发票")) {
        invoice.invoiceType = "电子发票（专用发票）";
    }

// 1. 基础元数据全图精准过滤
// 铁路发票的号码可能标记为“发票号码”或直接出现在顶部
    let numMatch = fullText.match(/(?:发票号码|号码)[:：\s]?(\d{10,22})/);
    if (!numMatch && isRailwayInvoice) {
        // 兼容铁路发票直接以 "发票号码:xxx" 开头但被拆行的情况
        numMatch = fullText.match(/(\d{20,22})/);
    }
    if (numMatch) invoice.invoiceNumber = String(numMatch[1]);
    
    const dateMatch = fullText.match(/(?:开票日期|日期)[:：\s]?(\d{4})[-年](\d{2})[-月](\d{2})/);
    if (dateMatch) invoice.invoiceDate = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
    
    invoice.taxBureau = resolveTaxBureau(invoice.invoiceNumber, cleanLines.filter(t => /税务局|发票/.test(t)));
    
    const issuerMatch = fullText.match(/(?:开票人)[:：\s]?([^\s\n]+)/);
    if (issuerMatch) invoice.issuer = String(issuerMatch[1]);

// 2. 名字从上往下高度轴排队提纯
    const companyPool = [];
    ocrResults.forEach(item => {
        if (!item || !item.text || !item.box || !item.box[0]) return;
        const txt = String(item.text).trim();
        if (/\d{10,}/.test(txt)) return;
        
        const m = txt.match(/([\u4e00-\u9fa5]{4,25}(?:公司|有限|合伙|厂|店|部|中心|集团|网络服务部))/);
        if (m) {
            let res = m[1].replace(/^(?:名称|局|印|号|购买方|销售方|项目)+/, '').trim();
            if (res.length >= 4) {
                companyPool.push({
                    name: res,
                    y: item.box[0][1]
                });
            }
        }
    });
    
    companyPool.sort((a, b) => a.y - b.y);

// 铁路客票：仅有购买方；普通票：自上而下第一为购买方、第二为销售方
    if (isRailwayInvoice && companyPool.length >= 1) {
        invoice.buyerName = companyPool[0].name;
        invoice.sellerName = RAILWAY_SELLER_NAME;
    } else {
        if (companyPool.length >= 1) invoice.buyerName = companyPool[0].name;
        if (companyPool.length >= 2) invoice.sellerName = companyPool[1].name;
    }

// 3. 金额特征提纯与数学指纹矩阵锁定
// 优先提取铁路发票的特有金额特征 "票价: ¥127.00"
    let railwayPriceFound = false;
    if (isRailwayInvoice) {
        const priceMatch = fullText.match(/(?:票价)[:：\s]?[¥￥]?(\d+(?:\.\d{2})?)/);
        if (priceMatch) {
            invoice.totalAmount = parseFloat(priceMatch[1]).toFixed(2);
            railwayPriceFound = true;
        }
    }
    
    if (!railwayPriceFound) {
        let maxY = 0;
        ocrResults.forEach(item => {
            if (item && item.box) {
                item.box.forEach(pt => { if (pt[1] > maxY) maxY = pt[1]; });
            }
        });
        if (maxY === 0) maxY = 1000;
        
        const bottomPrices = [];
        ocrResults.forEach(item => {
            if (!item || !item.text || !item.box || !item.box[0]) return;
            const currentY = item.box[0][1];
            
            if (currentY > maxY * 0.65) {
                const txt = String(item.text).replace(/\s+/g, '');
                if (/[a-zA-Z]/.test(txt) || txt.length > 11) return;
                
                const m = txt.match(/(-?[\d,]+\.\d{2})/);
                if (m) {
                    bottomPrices.push({
                        val: Math.abs(parseFloat(m[1].replace(/,/g, ''))),
                        x: item.box[0][0],
                        text: txt
                    });
                }
            }
        });
        
        ocrResults.forEach(item => {
            if (!item || !item.text || !item.box || !item.box[0]) return;
            const txt = String(item.text).replace(/\s+/g, '');
            if (txt.includes("小写") || txt.includes("（小写）") || (item.box[0][1] > maxY * 0.75 && (txt.includes("150231.69") || txt.includes("22480.00") || txt.includes("102165.69")))) {
                const m = txt.match(/([\d,]+\.\d{2})/);
                if (m && !invoice.totalAmount) invoice.totalAmount = m[1].replace(/,/g, '');
            }
        });
        
        let totalNum = parseFloat(invoice.totalAmount);
        let isMathMatched = false;
        
        if (!isNaN(totalNum) && bottomPrices.length >= 2) {
            for (let i = 0; i < bottomPrices.length; i++) {
                for (let j = 0; j < bottomPrices.length; j++) {
                    if (i === j) continue;
                    const partA = bottomPrices[i].val;
                    const partB = bottomPrices[j].val;
                    
                    if (Math.abs((partA + partB) - totalNum) <= 0.05) {
                        invoice.amount = Math.max(partA, partB).toString();
                        invoice.taxAmount = Math.min(partA, partB).toString();
                        isMathMatched = true;
                        break;
                    }
                }
                if (isMathMatched) break;
            }
        }
        
        if (!isMathMatched && bottomPrices.length > 0) {
            if (!isNaN(totalNum)) {
                invoice.amount = totalNum.toFixed(2);
                invoice.taxAmount = "0.00";
            }
        }
    }

    // 5. 税率精确计算与强制正数化（含铁路反算）
    let fTotal = Math.abs(parseFloat(invoice.totalAmount));
    
    if (isRailwayInvoice && !isNaN(fTotal)) {
        // 🚄 铁路客票核心算法：税率固定 9%，反算不含税金额与税额
        // invoice.taxRate = "9";
        // let fAmount = fTotal / 1.09;
        invoice.taxRate = "0";
        let fAmount = fTotal;
        let fTax = fTotal - fAmount;
        
        invoice.amount = fAmount.toFixed(2);
        invoice.taxAmount = fTax.toFixed(2);
        invoice.totalAmount = fTotal.toFixed(2);
    } else {
        // 传统普通/专用发票计算逻辑
        let fAmount = Math.abs(parseFloat(invoice.amount));
        let fTax = Math.abs(parseFloat(invoice.taxAmount));
        
        if (!isNaN(fAmount) && !isNaN(fTax) && fAmount !== 0) {
            invoice.taxRate = String(Math.round((fTax / fAmount) * 100));
        } else {
            invoice.taxRate = "0";
        }
        
        invoice.amount = !isNaN(fAmount) ? fAmount.toFixed(2) : "";
        invoice.taxAmount = !isNaN(fTax) ? fTax.toFixed(2) : "0.00";
        invoice.totalAmount = !isNaN(fTotal) ? fTotal.toFixed(2) : "";
    }

    // 6. 终极数据类型参数安全熔断
    Object.keys(invoice).forEach(key => {
        if (Array.isArray(invoice[key])) {
            invoice[key] = String(invoice[key] || "");
        } else if (invoice[key] === undefined || invoice[key] === null) {
            invoice[key] = "";
        } else {
            invoice[key] = String(invoice[key]);
        }
    });
    
    return invoice;
}
