<template>
    <el-config-provider :locale="zhCn">
        <router-view />
    </el-config-provider>
</template>

<script setup>
    import { extensions } from '@neutralinojs/lib'
    import { ElNotification, ElMessage, ElMessageBox, ElLoading } from "element-plus"
    import { zhCn } from "element-plus/es/locales"
    import Log from '~/NeuUtils/Log'
    
    // log日志
    const log = new Log();
    
    // 向顶级window添加快捷提示实例
    Object.assign(window, {
        $message: ElMessage,
        $notice: ElNotification,
        $messageBox: ElMessageBox,
        $loading: ElLoading.service,
        $log: console.log,
        $error: console.error,
        $warn: console.warn,
        taskTimer: null,
        $neu: {
            logStoragePath: log.filepath(),
            log: async (msg, type) => await log.log(msg, type)
        }
    });
    
    onMounted(() => {
        extensions.getStats()
            .then((stats) => {
                $neu.log(`扩展已挂载 ${JSON.stringify(stats)}`, 'info')
            })
            .catch((err) => {
                $neu.log(`扩展挂载失败 ${JSON.stringify(err)}`, 'error')
            })
    })
</script>

<style lang="scss">
    @use "./assets/styles/style";
    
    body {
        min-height: 100dvh;
        background: var(--el-bg-color-page);
    }
</style>