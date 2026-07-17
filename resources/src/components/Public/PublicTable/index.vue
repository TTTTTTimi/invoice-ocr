<!-- public-table -->
<!-- 2023-02-28 14:57 -->
<template>
    <!--    @cell-mouse-enter="cellMouse ? cellMouseEvent : null"-->
    <!--    @cell-mouse-leave="cellMouse ? cellMouseEvent : null"-->
    <div class="public-table" :style="{ '--cell-mouse-color': cellMouseColor }">
        <el-table ref="elTableRef"
            :key="key"
            :max-height="maxHeight"
            :border="border"
            :data="data"
            :size="size" :stripe="stripe"
            :highlight-current-row="highlightCurrentRow" scrollbar-always-on flexible :row-key="rowKey"
            :row-class-name="rowClassName" :cell-class-name="cellClassName" :table-layout="tableLayout"
            :show-summary="showSummary" :sum-text="sumText" :summary-method="summaryMethod"
            :expand-row-keys="expandRowKeys" :default-sort="defaultSort" :span-method="spanMethod"
            @current-change="tableCurrentChange" @header-click="headerClick" @row-click="rowClick"
            @row-dblclick="rowDblclick" @row-contextmenu="rowContextmenu" @cell-click="cellClick"
            @cell-contextmenu="cellContextmenu" @selection-change="selectionChange" @select="selectChange"
            @select-all="selectAllChange" @expand-change="expandChange" v-loading="loading">
            <el-table-column type="expand" v-if="expandShow" :fixed="expandFixed">
                <template #default="scope">
                    <slot name="expand" v-bind="scope" />
                </template>
            </el-table-column>
            <el-table-column type="selection" :fixed="selectionFixed" :selectable="selectable" v-if="selectionShow" />
            <el-table-column type="index" label="序号" v-bind="tableIndexDispose" v-if="indexShow" :fixed="indexFixed" />
            <template v-for="(item, index) in columns" :key="`table_col_${index}`">
                <el-table-column v-bind="item" v-if="columnShow(item.show)">
                    <template #header="{ column, $index }">
                        <template v-if="item.labelSlot">
                            <slot :name="item.labelSlot" :column="column" :row="item" :$index="$index" />
                        </template>
                        <template v-else>{{ item.label }}</template>
                    </template>
                    <template #default="{ row, $index }">
                        <template v-if="!item.slot">
                            <template v-if="!item.render">
                                {{ item.formatter ? item.formatter({ row, column: item, $index }) : (row[item.prop] || '-') }}
                            </template>
                            <template v-else>
                                <render-dom :column="item" :row="row" :index="$index" :render="item.render" />
                            </template>
                        </template>
                        <template v-else>
                            <slot :name="item.slot" :column="item" :row="row" :$index="$index" />
                        </template>
                    </template>
                </el-table-column>
            </template>
            <template #empty v-if="emptyImageShow">
                <slot name="empty">
                    <el-empty description="暂无数据" />
                </slot>
            </template>
        </el-table>
    </div>

    <div class="mt-2" v-if="forms">
        <el-pagination
            :size="size"
            background
            hide-on-single-page
            v-model:page-size="form.pageSize"
            v-model:current-page="form.pageNum"
            :page-sizes="paginationPageSizes"
            layout="total, ->, sizes, prev, pager, next"
            :total="form.total"
            @size-change="_size => $emit('size-change', 'limit', _size)"
            @current-change="current => $emit('current-change', 'pageNo', current)"
        />
    </div>
</template>

<script setup>
    import { computed, nextTick, ref, toRefs, watch } from 'vue'
    import { paginationPageSizes } from "~/config"
    import RenderDom from "./renderDom"
    // import Sortable from 'sortablejs'

    /**
     * @name table表格
     * @description 配置即可。展示方式为：slot > render > formatter > prop
     * @property { String } maxHeight 表格最大高度
     * @property { Boolean } loading 加载loading
     * @property { Boolean } sortable 拖动排序
     * @property { Function } rowClassName 行样式
     * @property { Boolean } cellMouse 单元格hover时填充背景色
     * @property { String } cellMouseColor 单元格hover时填充背景色值(默认为var(--el-color-info-light-9))
     * @property { String } size - "large" | "default" | "small"    大小。(默认small)
     * @property { Object } forms    分页项 *必传项
     * @property { Array } columns    配置项 *必传项
     * @property { Array } data    数据源 *必传项
     * @property { Boolean } border    边框(默认为true)
     * @property { Boolean } expandShow    是否显示展开列(默认为false)
     * @property { String, Boolean, null } expandFixed - true | "left" | "right" | null  展开列定位(默认为null)
     * @property { Boolean } selectionShow    是否显示选择列(默认为false)
     * @property { String, Boolean, null } selectionFixed - true | "left" | "right" | null  选择列定位(默认为null)
     * @property { Boolean } indexShow    是否显示序号列(默认为true)
     * @property { String, Boolean, null } indexFixed - true | "left" | "right" | null  选择列定位(默认为null)
     * @property { String } rowKey    每行key关键字(默认为id)
     * @property { Array } expandRowKeys    默认展开数据的keys，关键字为rowKey的集合，此字段只有当expandShow为true时才能使用
     * @property { Object } defaultSort    添加默认可静态排序的字段，如：{ order: "ascending" | "descending", id: "ascending" | "descending" }
     * @property { Boolean } showSummary    显示总计
     * @property { String } sumText    第一列默认字符，如：总计
     * @property { String } tableLayout    表格布局(默认fixed)
     * @property { Function } spanMethod    跨行 | 跨列方法
     * @property { Function } summaryMethod    自定义总计方法。参数为：{ row, column, rowIndex, columnIndex }
     * @example <public-table :loading="loading" border cell-mouse :columns="columns" :data="data" :forms="forms" />
     * */

    defineOptions({
        name: 'PublicTable'
    })

    const renderHeader = (...ev) => {
        console.log(ev);
    }

    const props = defineProps({
        forms: {
            type: [Object, null, undefined],
            default: null
        },
        maxHeight: String,
        loading: Boolean,
        // sortable: Boolean,
        rowClassName: Function,
        cellClassName: Function,
        cellMouse: Boolean,
        emptyImageShow: {
            type: Boolean,
            default: true
        },
        highlightCurrentRow: {
            type: Boolean,
            default: true
        },
        cellMouseColor: {
            type: String,
            default: 'var(--el-color-info-light-9)'
        },
        size: {
            type: String,
            default: 'default'
        },
        stripe: {
            type: Boolean,
            default: false
        },
        data: {
            type: Array,
            default: () => ([]),
            required: true
        },
        columns: {
            type: Array,
            default: () => ([]),
            required: true
        },
        border: {
            type: Boolean,
            default: true
        },
        expandShow: {
            type: Boolean,
            default: false
        },
        expandFixed: {
            type: [String, Boolean, null],
            default: null
        },
        selectionShow: {
            type: Boolean,
            default: false
        },
        selectionFixed: {
            type: [String, Boolean, null],
            default: null
        },
        selectable: {
            type: Function,
            default: () => true
        },
        indexShow: {
            type: Boolean,
            default: true
        },
        indexFixed: {
            type: [String, Boolean, null],
            default: true
        },
        indexDispose: {
            type: Object,
            default: () => ({
                width: '55px'
            })
        },
        rowKey: {
            type: String,
            default: 'id'
        },
        expandRowKeys: {
            type: Array,
            default: () => ([])
        },
        defaultSort: {
            type: Object,
            default: () => ({})
        },
        showSummary: Boolean,
        sumText: String,
        tableLayout: {
            type: String,
            default: 'fixed'
        },
        spanMethod: Function,
        summaryMethod: Function
    });

    const emit = defineEmits([
        'selection-change',
        'select',
        'select-all',
        'expand-change',
        'row-click',
        'row-dblclick',
        'row-contextmenu',
        'cell-click',
        'cell-contextmenu',
        'table-current-change',
        'header-click',
        'size-change',
        'current-change',
        // 'sortable-table'
    ])

    const elTableRef = ref();
    // const { cellMouse, loading, sortable, data, indexDispose, rowKey } = toRefs(props);
    const { loading, indexDispose, data, columns, forms } = toRefs(props);
    const tableIndexDispose = computed(() => Object.assign({
        width: 55
    }, indexDispose.value));

    // form
    const form = ref({
        total: 0
    });

    // key
    const key = ref(Date.now());

    // 判断每次loading时滚动到顶部
    watch(loading, now => {
        now && elTableRef.value.setScrollTop(0)
    })

    watch(data, now => {
        if(now.length) {
            columns.value.forEach(v => {
                if(v?.autoWidth && (v.prop || v.formatter) && !v?.slot && !v?.render) {
                    const arr = [];

                    const dom = createDomGetWidth(v.label, {
                        'font-weight': 'bold',
                        'font-size': '16px'
                    });
                    arr.push(dom.offsetWidth);
                    dom.remove();

                    now.forEach((_v, i) => {
                        const dom = createDomGetWidth(v.prop ? _v[v.prop] : v.formatter({ row: _v, column: v, $index: i }));
                        arr.push(dom.offsetWidth);
                        dom.remove();
                    })

                    v.width = Math.max(...arr) + 20;
                    v.minWidth = 0;
                }
            })
        }
    })

    watch(forms, now => {
        if (now) {
            form.value.pageNum = now?.pageReq?.pageNum || now?.pageNum || now?.pageReq?.pageNo || now?.pageNo;
            form.value.pageSize = now?.pageReq?.pageSize || now?.pageSize || now?.pageReq?.limit || now?.limit;
            form.value.total = now.total;
        }
    }, { deep: true })

    // check列是否展示
    const columnShow = s => typeof s === 'undefined' || (typeof s === 'boolean' && s);

    // 创建dom获取宽度
    const createDomGetWidth = (text, styles = {}) => {
        const dom = document.createElement('span');
        dom.style['white-space'] = 'nowrap';
        dom.style['word-wrap'] = 'normal';
        dom.style['word-break'] = 'normal';
        dom.style['display'] = 'inline-block';
        dom.style['position'] = 'fixed';
        dom.style['top'] = '-9999px';
        dom.style['left'] = '-9999px';
        dom.style['z-index'] = 0;
        dom.style['visibility'] = 'hidden';
        dom.style['opacity'] = 0;
        if(styles && Object.keys(styles).length) {
            Object.keys(styles).forEach(v => {
                dom.style[v] = styles[v];
            })
        }

        dom.innerText = text;
        document.body.appendChild(dom);
        return dom
    }

    // 进入单元格
    // const cellMouseEvent = (row, column, cell, ev) => {
    //     const changeFnName = ev.type === 'mouseenter' ? 'add' : 'remove';
    //     cell.parentNode.childNodes.forEach(el => el.classList[changeFnName]('bg-primary'));
    //     const domList = elTableRef.value.$el.getElementsByClassName(column.id);
    //     [...domList].forEach(el => el.classList[changeFnName]('bg-primary'))
    // }

    // 选择项发生变化时
    const selectionChange = selection => emit('selection-change', selection);

    // 手动勾选数据行
    const selectChange = (selection, row) => emit('select', selection, row);

    // 手动勾选全选
    const selectAllChange = selection => emit('select-all', selection);

    // 展开行或关闭时触发
    const expandChange = (row, expandedRows) => emit('expand-change', { row, expandedRows });

    // 点击单元格
    const tableCurrentChange = (currentRow, oldRow) => emit('table-current-change', { currentRow, oldRow });

    // 点击单元格
    const cellClick = (row, column, event) => emit('cell-click', { row, column, event });

    // 鼠标右键点击单元格
    const cellContextmenu = (row, column, event) => emit('cell-contextmenu', { row, column, event });

    // 点击某一行
    const rowClick = (row, column, event) => emit('row-click', { row, column, event });

    // 双击击某一行
    const rowDblclick = (row, column, event) => emit('row-dblclick', { row, column, event });

    // 鼠标右键点击某一行
    const rowContextmenu = (row, column, event) => emit('row-contextmenu', { row, column, event });

    // 某一列头部点击
    const headerClick = (column, event) => emit('header-click', { column, event });

    // 清空选择
    const clearSelection = () => elTableRef.value.clearSelection();

    // 返回当前选中的行
    const getSelectionRows = () => elTableRef.value.getSelectionRows();

    // 多选表格
    const toggleRowSelection = (row, selected) => elTableRef.value.toggleRowSelection(row, selected);

    // 多选表格,切换全选和全不选
    const toggleAllSelection = () => elTableRef.value.toggleAllSelection();

    // 可拓展
    const toggleRowExpansion = (row, expanded) => elTableRef.value.toggleRowExpansion(row, expanded);

    // 重新布局
    const doLayout = () => elTableRef.value.doLayout();

    // 滚动到
    const scrollTo = (options, yCoord) => elTableRef.value.scrollTo(options, yCoord);

    // 排序
    // const dragColumn = () => {
    //     if(sortable.value && data.value.every(v => !v.children)) {
    //         let _sortable;
    //         const tbody = elTableRef.value.$el.querySelector('.el-table__body-wrapper tbody');
    //         const opt = {
    //             animation: 150,
    //             onEnd: function ({ oldIndex, newIndex }) {
    //                 if(oldIndex === newIndex) return;
    //                 if(rowKey.value) {
    //                     const target = data.value[oldIndex];
    //                     data.value.splice(oldIndex, 1);
    //                     data.value.splice(newIndex, 0, target);
    //                 }
    //                 emit('sortable-table', { oldIndex, newIndex, data: data.value });
    //             }
    //         }
    //         _sortable = Sortable.create(tbody, opt)
    //     }
    // }

    // 重新布局
    const refresh = () => {
        nextTick(() => {
            key.value++;
        })
        console.log('我刷新了', key.value)
    }

    defineExpose({
        clearSelection,
        getSelectionRows,
        toggleRowSelection,
        toggleAllSelection,
        toggleRowExpansion,
        doLayout,
        scrollTo,
        refresh
    })

    // 注册拖动
    // onMounted(dragColumn)
</script>

<style scoped lang="scss">
    .public-table {
        @apply w-full relative;
        
        .el-table {
            //--el-table-row-hover-bg-color: var(--el-color-primary-light-9);
            @apply w-full;
            
            .table-column-title {
                //@apply flex items-start;
                
            }
            //position: absolute;
            //z-index: 2;
            :deep(.el-scrollbar) {
                --el-scrollbar-opacity: 0.6;
                --el-scrollbar-bg-color: var(--el-color-primary);
                --el-scrollbar-hover-bg-color: var(--el-color-primary-dark-2);
            }
        }
    }
</style>
