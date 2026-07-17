import http from '~/util/http'

// 搜索
export const apiQuery = (data = {}) => {
    return http({
        url: 'api/query',
        method: 'get',
        params: data
    })
}

// OCR识别
export const apiOcr = (data = {}) => {
    return http({
        url: 'api/ocr',
        method: 'post',
        data,
        timeout: 3 * 60 * 1000
    })
}

// 编辑
export const apiUpdate = (data = {}) => {
    return http({
        url: 'api/update',
        method: 'post',
        data
    })
}

// 导出数据
export const apiExport = (data = {}) => {
    return http({
        url: 'api/export',
        method: 'get',
        params: data
    })
}

// 删除数据
export const apiDelete = (data = {}) => {
    return http({
        url: 'api/delete',
        method: 'get',
        params: data
    })
}