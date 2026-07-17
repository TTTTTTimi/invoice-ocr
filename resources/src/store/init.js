import { defaultLimit } from "~/config"

// 公共查询
export const commonAttrs = (isKey = true) => {
    return Object.assign({
        pageNo: 1,
        limit: defaultLimit,
        total: 0,
        loading: false
    }, isKey ? { key: '' } : {})
}

// 搜索
export const useInvoiceSearchForms = () => {
    return {
        ...commonAttrs(false),
        buyerName: '',
        invoiceNumber: '',
        date: ''
    }
}

// 导出搜索
export const useInvoiceExportSearchForms = () => {
    return {
        buyerName: '',
        date: '',
        total: 0,
        loading: false
    }
}

// 编辑
export const useInvoiceUpdateForms = () => {
    return {
        id: '',
        entry: "",
        path: "",
        type: "",
        invoiceType: "",
        invoiceNumber: "",
        invoiceDate: "",
        taxBureau: "",
        buyerName: "",
        sellerName: "",
        amount: 0,
        taxRate: 0,
        taxAmount: 0,
        totalAmount: 0,
        issuer: "",
        createdAt: "",
        updatedAt: ""
    }
}