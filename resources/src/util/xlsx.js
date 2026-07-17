import { filesystem, os } from '@neutralinojs/lib'
import dayjs from "dayjs"
import * as XLSX from 'xlsx-js-style'

/**
 * 纯前端：将 JSON 数组转为 Excel 并通过 Neutralinojs API 落地保存
 * @param {Array<Object>} list - 后端返回的全量发票原始数组
 * @param {string} [fileName='发票明细报表'] - 默认文件名提示
 */
export async function exportToExcel(list, fileName) {
    if (!list || list.length === 0) {
        throw new Error('grid没有可导出的数据');
    }
    
    try {
        // 1. 自动定位桌面路径并规范化
        const desktop = await os.getPath('desktop');
        const selectedPath = await filesystem.getNormalizedPath([desktop, fileName || `${fileName || '发票明细报表'}_${dayjs().format('YYYYMMDDHHmmss')}.xlsx`].join('/'));
        
        // 2. 数据映射定义
        const headerMapping = {
            entry: "文件名", type: "文件类型", invoiceType: "发票类型", invoiceNumber: "发票号码",
            invoiceDate: "开票日期", taxBureau: "税务局", buyerName: "购买方名称",
            sellerName: "销售方名称",
            amount: "金额", taxRate: "税率", taxAmount: "税额", totalAmount: "价税合计",
            issuer: "开票人", createdAt: "录入时间", updatedAt: "更新时间", path: "文件路径"
        };
        
        // 初始化合计数据
        let totalAmount = 0;
        let totalTaxAmount = 0;
        let totalSumAmount = 0;
        
        const cleanedData = list.map(row => {
            const item = {};
            
            totalAmount += parseFloat(row.amount) || 0;
            totalTaxAmount += parseFloat(row.taxAmount) || 0;
            totalSumAmount += parseFloat(row.totalAmount) || 0;
            
            for (const key in headerMapping) {
                let value = row[key] || '';
                
                if (key === 'taxRate' && value !== '') {
                    const rawRate = String(value);
                    if (!rawRate.includes('%')) {
                        const numRate = parseFloat(rawRate);
                        if (numRate < 1 && numRate > 0) {
                            value = `${(numRate * 100).toFixed(0)}%`;
                        } else {
                            value = `${rawRate.replace(/[^0-9.]/g, '')}%`;
                        }
                    }
                }
                
                item[headerMapping[key]] = value;
            }
            return item;
        });
        
        // 在数组末尾追加物理合计行对象
        const totalRow = {};
        for (const key in headerMapping) {
            totalRow[headerMapping[key]] = '';
        }
        totalRow[headerMapping['entry']] = '合计';
        totalRow[headerMapping['amount']] = `¥ ${totalAmount.toFixed(2)}`;
        totalRow[headerMapping['taxAmount']] = `¥ ${totalTaxAmount.toFixed(2)}`;
        totalRow[headerMapping['totalAmount']] = `¥ ${totalSumAmount.toFixed(2)}`;
        
        cleanedData.push(totalRow);
        
        // 3. 构建 Excel 内存对象
        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.json_to_sheet(cleanedData);
        
        // 4. 遍历表头（第一行），设置文字加大、加粗、靠左及居中
        const range = XLSX.utils.decode_range(worksheet['!ref']);
        for (let col = range.s.c; col <= range.e.c; col++) {
            const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col }); // 第一行，r 为 0
            const cell = worksheet[cellAddress];
            
            if (cell) {
                cell.s = {
                    font: { name: '微软雅黑', sz: 14, bold: true, color: { rgb: "000000" } },
                    alignment: {
                        horizontal: "left",
                        vertical: "center"
                    }
                };
            }
        }
        
        // 为表格最后一行（合计行）注入特定的文本高亮加粗样式（靠左 + vertical居中）
        const lastRowIndex = range.e.r;
        for (let col = range.s.c; col <= range.e.c; col++) {
            const cellAddress = XLSX.utils.encode_cell({ r: lastRowIndex, c: col });
            const cell = worksheet[cellAddress];
            if (cell) {
                cell.s = {
                    font: { name: '微软雅黑', sz: 11, bold: true, color: { rgb: "000000" } }, // 加粗
                    alignment: {
                        horizontal: "left",    // 文字及数据一律严格靠左对齐
                        vertical: "center"     // 配合行高垂直方向绝对居中
                    }
                };
            }
        }
        
        // 5. 表头行与合计行行高分别独立配置
        worksheet['!rows'] = [];
        worksheet['!rows'][0] = { hpt: 30 };            // 表头行高设为 30
        worksheet['!rows'][lastRowIndex] = { hpt: 30 }; // 将底部的合计行高同样设定为 30
        
        // 全表动态扫描自适应列宽
        const colWidths = [];
        for (let col = range.s.c; col <= range.e.c; col++) {
            let maxCharLength = 10;
            for (let row = range.s.r; row <= range.e.r; row++) {
                const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
                const cell = worksheet[cellAddress];
                if (cell && cell.v !== undefined && cell.v !== null) {
                    const cellValue = String(cell.v);
                    let currentLength = 0;
                    for (let i = 0; i < cellValue.length; i++) {
                        if (cellValue.charCodeAt(i) > 255) {
                            currentLength += 2.1;
                        } else {
                            currentLength += 1.0;
                        }
                    }
                    if (currentLength > maxCharLength) {
                        maxCharLength = currentLength;
                    }
                }
            }
            colWidths.push({ wch: Math.ceil(maxCharLength + 3) });
        }
        worksheet['!cols'] = colWidths;
        
        XLSX.utils.book_append_sheet(workbook, worksheet, "发票明细");
        
        // 6. 编译为二进制字节流数组
        const excelBuffer = XLSX.write(workbook, {
            bookType: 'xlsx',
            type: 'array'
        });
        
        // 7. 使用 Neutralino 原生物理文件系统 API 落地写盘
        await filesystem.writeBinaryFile(selectedPath, excelBuffer);
        
        console.log(`💾 纯前端样式导出成功，文件已落地到: ${selectedPath}`);
        return { success: true, msg: `发票报表已成功导出至桌面！` };
    } catch (error) {
        console.error("❌ 纯前端原生导出崩溃:", error);
        throw new Error(`文件系统写入失败: ${error.message}`);
    }
}
