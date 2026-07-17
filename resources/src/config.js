import packageConfig from '../package.json'

// 项目名
export const name = packageConfig.name;

// 项目版本
export const version = packageConfig.version;

// 模式
export const mode = {
    dev: import.meta.env.MODE === 'development',
    test: import.meta.env.MODE === 'testing',
    prod: import.meta.env.MODE === 'production',
    devOrTest: import.meta.env.MODE !== 'production',
    mode: import.meta.env.MODE
}

// 项目名（展示文案见 i18n common.app.title）
export const title = '发票工具';

// 缓存本地数据常量
export const storeVars = {
    TOKEN: 'utoken'
}

// 默认加载数据条数
export const defaultLimit = 15;

// 请求体headers参数
export const axiosHeader = {
    [storeVars.TOKEN]: '',
    ctype: 'web'
}

// 开发时菜单栏权限开关
export const menuDevPower = false;

// 分页配置
export const paginationPageSizes = [10, 15, 20, 25, 30, 35, 40, 45, 50, 100];

export default {
    // 模式
    mode,
    // name
    name,
    // version
    version,
    // 项目名
    title,
    // 缓存本地数据常量
    storeVars,
    // 默认加载数据条数
    defaultLimit,
    // 请求体headers参数
    axiosHeader,
    // 开发时菜单栏权限开关
    menuDevPower,
    // 分页配置
    paginationPageSizes
}
