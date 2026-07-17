<!-- index -->
<!-- 2026-07-10 09:01:08 -->
<template>
    <div class="index p-2">
        <!-- 扫描 -->
        <ViewScan />
        <!-- 搜索 -->
        <ViewSearch />
        <!-- 数据 -->
        <ViewData />
        <!-- 编辑 -->
        <Update />
        <!-- 导出 -->
        <ExportTable />
        <!-- 列设置 -->
        <PublicColumns />
    </div>
</template>

<script setup>
    import ViewScan from "./ViewScan"
    import ViewSearch from "./ViewSearch"
    import ViewData from "./ViewData"
    import Update from "./Update"
    import ExportTable from "./ExportTable"
    import OcrListener from "~/util/socket"
    import { useCommon } from '~/store/common'
    
    // store
    const store = useCommon(),
        { handleScanCount, currentScanTotal } = storeToRefs(store),
        { commonSearch } = store;
    
    // socket
    const socket = new OcrListener({
        url: 'ws://localhost:13888/ws',
        pingInterval: 30000
    });

    const refreshIfVisible = () => {
        if (!document.hidden) commonSearch();
    };

    onMounted(() => {
        socket.on('open', refreshIfVisible);
        socket.on('message', ev => {
            if (ev.type === 'connected') {
                handleScanCount.value = ev.data;
            }
            if (ev.type === 'state_changed') {
                handleScanCount.value = ev.data;
                if (currentScanTotal.value === ev.data) {
                    socket.emit('state_reset');
                    commonSearch();
                }
            }
        });
        document.addEventListener('visibilitychange', refreshIfVisible);
    });

    onUnmounted(() => {
        document.removeEventListener('visibilitychange', refreshIfVisible);
        socket.destroy();
    });
</script>

<style scoped lang="scss">
    .index {
    
    }
</style>