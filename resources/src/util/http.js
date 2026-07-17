/**
 * 生产级 Fetch 网络请求封装（支持超时、终止、自动传参）
 * @param {string} url - 相对路由，例如 '/api/query'
 * @param {Object} [data={}] - 传参对象
 * @param {Object} [params={}] - GET传参对象
 * @param {string} [method='POST'] - 请求方法 GET 或 POST
 * @param {number} [timeout=10000] - 超时时间（毫秒），默认 10 秒
 * @param {AbortController} [controller] - 外部传入的控制器，用于手动取消请求
 */
const send = ({ url, data = {}, params = {}, method = 'POST', timeout = 10000, controller }) => {
    const activeMethod = method.toUpperCase();
    const baseURL = `http://localhost:13888`;
    
    // 1. 处理请求路径的拼接（去除多余的斜杠）
    const cleanUrl = url.startsWith('/') ? url : `/${url}`;
    let finalURL = `${baseURL}${cleanUrl}`;
    
    // 2. 初始化标准 Fetch 配置项
    const options = {
        method: activeMethod,
        headers: { 'Content-Type': 'application/json' }
    };
    
    // 3. 关联 AbortController 控制器（优先使用外部传入的，否则内部自动建一个）
    const activeController = controller || new AbortController();
    options.signal = activeController.signal;
    
    // 4. 根据请求方法分发处理参数
    if (activeMethod === 'GET') {
        const queryParams = new URLSearchParams(params).toString();
        if (queryParams) {
            finalURL += `?${queryParams}`;
        }
    } else {
        // POST/PUT/DELETE 等方法一律注入 Body
        options.body = JSON.stringify(data);
    }
    
    // 5. 启动自维护的超时定时器
    const timeoutId = setTimeout(() => {
        activeController.abort();
    }, timeout);
    
    // 6. 执行真实的 Fetch 物理请求
    return fetch(finalURL, options)
        .then(res => {
            if (!res.ok) {
                throw new Error(`HTTP 异常! 状态码: ${res.status}`);
            }
            return res.json();
        })
        .catch(error => {
            if (error.name === 'AbortError') {
                return Promise.reject({ code: -2, msg: `请求已被中断（用户手动取消或未能满在 ${timeout}ms 内响应）` });
            }
            const msg = String(error?.message || '');
            const offline = /Failed to fetch|NetworkError|ERR_CONNECTION_REFUSED|ECONNREFUSED/i.test(msg);
            return Promise.reject({
                code: -1,
                msg: offline ? '本地 OCR 服务未连接（可能已休眠），请切回前台或重启应用' : (msg || '网络连接失败')
            });
        })
        .finally(() => {
            // 坚决清除定时器，杜绝内存泄漏
            clearTimeout(timeoutId);
        });
};

export default send;
