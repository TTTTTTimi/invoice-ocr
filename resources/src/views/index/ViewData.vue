<!-- ViewData -->
<!-- 2026-07-10 09:01:38 -->
<template>
    <el-card shadow="hover" class="ViewData" style="--el-card-padding: 18px">
        <div class="mb-4.5 flex items-center">
            <el-button type="primary" size="small" plain class="mr-2" @click="updateShow(true)">列设置</el-button>
            <p class="text-3.5">本次扫描到：<span class="font-bold text-primary">{{ currentScanTotal }}</span> 张发票，已处理 <span class="font-bold text-danger">{{ handleScanCount }}</span> 张</p>
        </div>
        
        <PublicTable
            max-height="72dvh"
            show-summary
            :summary-method="getSummaries"
            :loading="forms.loading"
            :data="data"
            :forms="forms"
            :columns="columns.home"
            @size-change="commonSearch"
            @current-change="commonSearch">
            <template #btn="{ row }">
                <el-space>
                    <el-link type="primary" underline="always" class="!text-3" @click="updateItem(row)">编辑</el-link>
                    <el-link type="danger" underline="always" class="!text-3" @click="deleteItem(row)">删除</el-link>
                </el-space>
            </template>
        </PublicTable>
        
<!--        <el-image-viewer-->
<!--            v-if="showViewer"-->
<!--            :url-list="imageViewer"-->
<!--            :scale="0.75"-->
<!--            teleported-->
<!--            close-on-press-escape-->
<!--            @close="showViewer = false"-->
<!--        />-->
    </el-card>
</template>

<script setup>
    import { useCommon } from '~/store/common'
    import { useColumns } from '~/store/columns'
    
    // store
    const store = useCommon(),
        { forms, data, currentScanTotal, handleScanCount } = storeToRefs(store),
        { init, commonSearch, updateItem, deleteItem } = store;
    
    const columnsStore = useColumns(),
        { columns } = storeToRefs(columnsStore),
        { updateShow } = columnsStore;
    
    // ref
    // const showViewer = ref(false)
    // const imageViewer = ref([]);
    
    // 查看标注图
    // const openFileMarkImage = async (image) => {
    //     if (!image) return;
    //
    //     try {
    //         const arrayBuffer = await filesystem.readBinaryFile(image);
    //         const blob = new Blob([arrayBuffer], { type: 'image/jpeg' });
    //         const objectUrl = URL.createObjectURL(blob);
    //         imageViewer.value = [objectUrl];
    //         showViewer.value = true;
    //         console.log("发票大图通过底层读取完美加载成功！", objectUrl);
    //     }
    //     catch (err) {
    //
    //     }
    // }
    
    // 合计（按字段名汇总，避免列顺序变化后算错）
    const getSummaries = ({ columns, data }) => {
        const moneyKeys = new Set(['amount', 'taxAmount', 'totalAmount']);
        return columns.map((column, index) => {
            if (index === 0) return '合计';
            const key = column.property;
            if (!moneyKeys.has(key) || !data?.length) return '';
            const sum = ('sumPrecise' in Math) ? Math.sumPrecise(data.map(row => Number(row[key]))) : data.reduce((prev, row) => {
                const n = +row[key];
                prev += (n * 100);
                return prev;
            }, 0) / 100;
            return `¥ ${sum.toFixed(2)}`;
        });
    }
    
    onMounted(init)
</script>

<style scoped lang="scss">
    .ViewData {
    
    }
</style>