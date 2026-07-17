import { os } from "@neutralinojs/lib"

// 查看当前文件
const openFocusFile = async (filepath, type) => {
    try {
        if(type === 'view') {
            const winPath = filepath.replace(/\//g, '\\');
            await os.execCommand(`explorer.exe /select,"${winPath}"`);
        }
        else {
            await os.open(filepath)
        }
    }
    catch (e) {
        $message.warning('文件查找失败，源文件可能被删除')
    }
}

export default [
    { label: '文件类型', prop: 'type', minWidth: 90 },
    { label: '发票类型', prop: 'invoiceType', minWidth: 210 },
    { label: '发票号码', prop: 'invoiceNumber', minWidth: 200 },
    { label: '开票日期', prop: 'invoiceDate', minWidth: 110 },
    { label: '税务局', prop: 'taxBureau', minWidth: 110 },
    { label: '购买方名称', prop: 'buyerName', minWidth: 320 },
    { label: '销售方名称', prop: 'sellerName', minWidth: 320 },
    { label: '金额', prop: 'amount', minWidth: 110 },
    { label: '税率/征收率', formatter: ({ row }) => `${row['taxRate']}%`, minWidth: 120 },
    { label: '税额', prop: 'taxAmount', minWidth: 110 },
    { label: '价税合计', prop: 'totalAmount', minWidth: 110 },
    { label: '开票人', prop: 'issuer', minWidth: 110 },
    { label: '创建时间', prop: 'createdAt', minWidth: 160 },
    { label: '更新时间', prop: 'updatedAt', minWidth: 160 },
    // {
    //     label: '查看标注图',
    //     render: ({ row }) => {
    //         return h(ElLink, {
    //             type: 'primary',
    //             underline: 'always',
    //             disabled: !row.path,
    //             class: '!text-3',
    //             onClick: () => openFileMarkImage(row.annotatedPath)
    //         }, () => '查看标注图')
    //     },
    //     minWidth: 100,
    //     fixed: 'right'
    // },
    {
        label: '文件',
        render: ({ row }) => {
            return h(ElSpace, null, () => [
                h(ElLink, {
                    type: 'primary',
                    underline: 'always',
                    disabled: !row.path,
                    class: '!text-3',
                    onClick: () => openFocusFile(row.path, 'view')
                }, () => '查看地址'),
                h(ElLink, {
                    type: 'primary',
                    underline: 'always',
                    disabled: !row.path,
                    class: '!text-3',
                    onClick: () => openFocusFile(row.path, 'open')
                }, () => '打开')
            ])
        },
        minWidth: 110,
        fixed: 'right'
    },
    { label: '操作', fixed: 'right', slot: 'btn', minWidth: 90 }
]