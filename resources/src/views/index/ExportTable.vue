<!-- ExportTable -->
<!-- 2026-07-10 12:48:43 -->
<template>
    <el-dialog
        title="编辑"
        top="5dvh"
        width="70vw"
        draggable
        destroy-on-close
        :close-on-click-modal="false"
        class="ExportTable"
        v-model="exportTable.show">
        
        <el-form inline>
            <el-form-item label="购买方名称" class="!mr-4.5">
                <el-input placeholder="购买方名称" v-model.trim="exportTable.forms.buyerName" />
            </el-form-item>
            <el-form-item label="开票月份" class="!mr-4.5">
                <el-date-picker
                    clearable
                    placeholder="请选择"
                    type="month"
                    value-format="YYYY-MM"
                    v-model="exportTable.forms.date"
                    @clear="exportTable.forms.date = ''"
                />
            </el-form-item>
            <el-form-item class="!mr-4.5">
                <el-button type="primary" :loading="exportTable.forms.loading" @click="exportSearch()">搜索</el-button>
            </el-form-item>
        </el-form>
        
        <div style="height: 50dvh" v-loading="exportTable.forms.loading">
            <el-auto-resizer>
                <template #default="{ height, width }">
                    <el-table-v2
                        border
                        :columns="columns"
                        :data="exportTable.data"
                        :width="width"
                        :height="height"
                        :footer-height="exportTable.data.length ? 40 : 0"
                        fixed
                        @scroll="onTableScroll">
                        <template v-if="exportTable.data.length" #footer>
                            <div class="export-table-v2-footer">
                                <div class="export-table-v2-footer__main">
                                    <div
                                        class="export-table-v2-footer__inner"
                                        :style="{ transform: `translateX(-${scrollLeft}px)` }">
                                        <div
                                            v-for="col in scrollColumns"
                                            :key="col.key"
                                            class="export-table-v2-footer__cell"
                                            :style="{ width: `${col.width}px` }">
                                            {{ summaryByKey[col.key] }}
                                        </div>
                                    </div>
                                </div>
                                <div
                                    v-if="rightFixedColumns.length"
                                    class="export-table-v2-footer__right"
                                    :style="{ width: `${rightFixedWidth}px` }">
                                    <div
                                        v-for="col in rightFixedColumns"
                                        :key="col.key"
                                        class="export-table-v2-footer__cell"
                                        :style="{ width: `${col.width}px` }">
                                        {{ summaryByKey[col.key] }}
                                    </div>
                                </div>
                            </div>
                        </template>
                        <template #empty>
                            <div
                                class="export-table-v2-empty"
                                :style="{ paddingRight: `${rightFixedWidth}px` }">
                                <el-empty description="暂无数据" />
                            </div>
                        </template>
                    </el-table-v2>
                </template>
            </el-auto-resizer>
        </div>
        
        <template #footer>
            <div>
                <el-button @click="exportTable.show = false">取消</el-button>
                <el-button type="danger" @click="exportData">导出</el-button>
            </div>
        </template>
    </el-dialog>
</template>

<script setup>
    import { os } from "@neutralinojs/lib";
    import { useCommon } from '~/store/common'
    
    // store
    const store = useCommon(),
        { exportTable } = storeToRefs(store),
        { exportSearch, exportData } = store;
    
    // columns — el-table-v2 每列必须设置 width（不能用 Table V1 的 minWidth 代替）
    const columns = [
        { title: '文件类型', key: 'type', dataKey: 'type', width: 90 },
        { title: '发票类型', key: 'invoiceType', dataKey: 'invoiceType', width: 180 },
        { title: '发票号码', key: 'invoiceNumber', dataKey: 'invoiceNumber', width: 200 },
        { title: '开票日期', key: 'invoiceDate', dataKey: 'invoiceDate', width: 110 },
        { title: '税务局', key: 'taxBureau', dataKey: 'taxBureau', width: 110 },
        { title: '购买方名称', key: 'buyerName', dataKey: 'buyerName', width: 260 },
        { title: '销售方名称', key: 'sellerName', dataKey: 'sellerName', width: 260 },
        { title: '金额', key: 'amount', dataKey: 'amount', width: 110 },
        { title: '税率/征收率', key: 'taxRate', dataKey: 'taxRate', width: 120, cellRenderer: ({ cellData }) => `${cellData}%` },
        { title: '税额', key: 'taxAmount', dataKey: 'taxAmount', width: 110 },
        { title: '价税合计', key: 'totalAmount', dataKey: 'totalAmount', width: 110 },
        { title: '开票人', key: 'issuer', dataKey: 'issuer', width: 110 },
        { title: '创建时间', key: 'createdAt', dataKey: 'createdAt', width: 160 },
        { title: '更新时间', key: 'updatedAt', dataKey: 'updatedAt', width: 160 },
        {
            title: '文件',
            key: 'path',
            dataKey: 'path',
            width: 100,
            fixed: 'right',
            cellRenderer: ({ cellData }) => {
                return h(ElLink, {
                    type: 'primary',
                    underline: 'always',
                    disabled: !cellData,
                    class: '!text-3',
                    onClick: () => openFocusFile(cellData)
                }, () => '查看文件地址')
            }
        }
    ]
    
    const scrollColumns = columns.filter(col => col.fixed !== 'right' && col.fixed !== 'left')
    const rightFixedColumns = columns.filter(col => col.fixed === 'right')
    const rightFixedWidth = rightFixedColumns.reduce((sum, col) => sum + col.width, 0)
    
    const SUMMARY_KEYS = ['amount', 'taxAmount', 'totalAmount']
    const scrollLeft = ref(0)
    
    const sumField = (data, key) => {
        if (!data?.length) return ''
        const total = data.reduce((prev, row) => prev + (Number(row[key]) || 0) * 100, 0) / 100
        return `¥ ${total}`
    }
    
    const summaryByKey = computed(() => {
        const data = exportTable.value.data
        return columns.reduce((map, col, index) => {
            if (index === 0) {
                map[col.key] = '合计'
            } else if (SUMMARY_KEYS.includes(col.dataKey)) {
                map[col.key] = sumField(data, col.dataKey)
            } else {
                map[col.key] = ''
            }
            return map
        }, {})
    })
    
    const onTableScroll = ({ scrollLeft: left }) => {
        scrollLeft.value = left
    }
    
    // 查看当前文件
    const openFocusFile = async filepath => {
        const winPath = filepath.replace(/\//g, '\\');
        await os.execCommand(`explorer.exe /select,"${winPath}"`);
    }
</script>

<style scoped lang="scss">
    .ExportTable {
        :deep(.el-table-v2__empty) {
            display: flex;
            align-items: center;
            justify-content: center;
            right: 0;
        }
        
        .export-table-v2-empty {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 100%;
            height: 100%;
        }
        
        :deep(.el-table-v2__footer) {
            background: var(--el-fill-color-lighter);
            border-top: var(--el-table-border, 1px solid var(--el-border-color-lighter));
        }
        
        .export-table-v2-footer {
            display: flex;
            height: 100%;
            
            &__main {
                flex: 1;
                min-width: 0;
                overflow: hidden;
                padding-inline-end: var(--el-table-scrollbar-size, 6px);
            }
            
            &__right {
                flex-shrink: 0;
                display: flex;
                background-color: var(--el-bg-color);
                box-shadow: var(--el-table-fixed-right-column, -2px 0 4px rgba(0, 0, 0, 0.06));
            }
            
            &__inner {
                display: flex;
                height: 100%;
                align-items: center;
            }
            
            &__cell {
                flex-shrink: 0;
                height: 100%;
                display: flex;
                align-items: center;
                padding: 0 8px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                font-size: 13px;
                font-weight: 600;
                color: var(--el-text-color-primary);
                box-sizing: border-box;
            }
        }
    }
</style>