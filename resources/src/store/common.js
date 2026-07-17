import dayjs from "dayjs";
import { apiDelete, apiExport, apiOcr, apiQuery, apiUpdate } from "~/api/invoice"
import { defaultLimit } from "~/config";
import { deleteInvoice } from "~/util/db"
import { useInvoiceExportSearchForms, useInvoiceSearchForms, useInvoiceUpdateForms } from "./init"
import { exportToExcel } from '~/util/xlsx'

// 公共
export const useCommon = defineStore('useCommon', {
    state() {
        return {
            inputDir: '',
            forms: useInvoiceSearchForms(),
            data: [],
            update: {
                show: false,
                forms: useInvoiceUpdateForms()
            },
            exportTable: {
                show: false,
                forms: useInvoiceExportSearchForms(),
                data: []
            },
            currentScanTotal: 0,
            handleScanCount: 0,
            backendOnline: true
        }
    },
    actions: {
        // 初始化
        async init(silent = false) {
            this.forms.loading = true;
            try {
                await $neu.log(`[查询] 开始 pageNo=${this.forms.pageNo} limit=${this.forms.limit}`, 'info');
                const result = await apiQuery(this.forms);
                if (result.code === 200) {
                    this.data = result.data;
                    this.forms.total = result.total;
                    this.backendOnline = true;
                    await $neu.log(`[查询] 成功 total=${result.total} size=${result.data?.length ?? 0}`, 'info');
                } else {
                    await $neu.log(`[查询] 业务失败 code=${result.code} msg=${result.msg}`, 'warn');
                }
            } catch (err) {
                this.backendOnline = false;
                await $neu.log(`[查询] 异常 ${err?.msg || err?.message || err}`, 'error');
                if (!silent) {
                    $message.warning(err?.msg || '查询失败，请确认 OCR 服务是否运行');
                }
            } finally {
                this.forms.loading = false;
            }
        },
        // 搜索
        commonSearch(attr = 'pageNo', num = 1) {
            this.forms[attr] = num;
            this.init()
        },
        // ocr识别
        async uploadImagesOCR(data) {
            const count = data?.images?.length ?? 0;
            await $neu.log(`[OCR] 上传开始 count=${count}`, 'info');
            try {
                const result = await apiOcr(data);
                await $neu.log(`[OCR] 上传结束 code=${result.code} msg=${result.msg}`, result.code === 200 ? 'info' : 'error');
                return result;
            } catch (err) {
                await $neu.log(`[OCR] 上传异常 ${err?.msg || err?.message || err}`, 'error');
                throw err;
            }
        },
        // 编辑
        updateItem(item) {
            const whiteAttr = ['amount', 'taxRate', 'taxAmount', 'totalAmount'];
            
            Object.keys(item).forEach(key => {
                if(whiteAttr.includes(key)) {
                    item[key] = +item[key];
                }
            })

            $neu.log(`[编辑] 打开表单 invoiceNumber=${item.invoiceNumber} id=${item.id}`, 'info');
            
            Object.assign(this.update, {
                show: true,
                forms: {
                    ...useInvoiceUpdateForms(),
                    ...item
                }
            })
        },
        // 确定编辑
        confirmUpdate(formRef) {
            formRef.validate(async valid => {
                if(valid) {
                    await $neu.log(`[编辑] 提交 id=${this.update.forms.id} invoiceNumber=${this.update.forms.invoiceNumber}`, 'info');
                    const result = await apiUpdate(this.update.forms);
                    const isCode = result.code === 200;
                    await $neu.log(`[编辑] 结果 code=${result.code} msg=${result.msg}`, isCode ? 'info' : 'error');
                    $message[isCode ? 'success' : 'error'](result.msg);
                    isCode && this.init();
                    this.update.show = !isCode;
                }
                else {
                    await $neu.log('[编辑] 表单校验未通过', 'warn');
                    $message.warning('请检查数据')
                }
            })
        },
        // 导出
        updateExportTable() {
            Object.assign(this.exportTable, {
                show: true,
                forms: useInvoiceExportSearchForms(),
                data: []
            })
        },
        // 导出搜索
        async exportSearch() {
            this.exportTable.forms.loading = true;
            await $neu.log(`[导出查询] 开始 buyerName=${this.exportTable.forms.buyerName || ''} date=${this.exportTable.forms.date || ''}`, 'info');
            const result = await apiExport(this.exportTable.forms);
            if(result.code === 200) {
                this.exportTable.data = result.data;
                this.exportTable.forms.total = result.total;
                await $neu.log(`[导出查询] 成功 total=${result.total}`, 'info');
            } else {
                await $neu.log(`[导出查询] 失败 code=${result.code} msg=${result.msg}`, 'error');
            }
            this.exportTable.forms.loading = false;
        },
        // 确定导出
        async exportData() {
            const fileName = this.exportTable.forms.date ? `发票明细报表_${dayjs(this.exportTable.forms.date).format('YYYYMM')}` : '';
            await $neu.log(`[导出] 开始写 Excel rows=${this.exportTable.data?.length ?? 0} fileName=${fileName || '默认'}`, 'info');
            const result = await exportToExcel(this.exportTable.data, fileName);
            await $neu.log(`[导出] ${result.success ? '成功' : '失败'}`, result.success ? 'info' : 'error');
            $message[result.success ? 'success' : 'error'](result.success ? '导出成功' : '导出失败');
            this.exportTable.show = !result.success;
        },
        // 删除
        deleteItem(row) {
            $messageBox.confirm(`确定删除【${row.invoiceNumber}】？`, '提示', {
                type: 'warning'
            })
                .then(async () => {
                    await $neu.log(`[删除] 确认 id=${row.id} invoiceNumber=${row.invoiceNumber} entry=${row.entry}`, 'info');
                    return await apiDelete({ id: row.id });
                })
                .then(async result => {
                    const isCode = result.code === 200;
                    isCode && await deleteInvoice(row.entry);
                    await $neu.log(`[删除] 结果 code=${result.code} msg=${result.msg}`, isCode ? 'info' : 'error');
                    $message[isCode ? 'success' : 'error'](result.msg);
                    isCode && this.init();
                })
                .catch(() => {})
        }
    }
})

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useCommon, import.meta.hot));
}