<!-- ViewSearch -->
<!-- 2026-07-10 09:01:30 -->
<template>
    <el-card shadow="hover" class="ViewSearch my-2" style="--el-card-padding: 18px;">
        <el-form inline>
            <el-form-item label="购买方名称">
                <el-input placeholder="购买方名称" v-model.trim="forms.buyerName" />
            </el-form-item>
            <el-form-item label="发票号码">
                <el-input placeholder="发票号码" v-model.trim="forms.invoiceNumber" />
            </el-form-item>
            <el-form-item label="开票月份">
                <el-date-picker
                    clearable
                    placeholder="请选择"
                    type="month"
                    value-format="YYYY-MM"
                    v-model="forms.date"
                    @clear="forms.date = ''"
                />
            </el-form-item>
            <el-form-item>
                <el-button type="primary" :loading="forms.loading" @click="commonSearch()">搜索</el-button>
            </el-form-item>
            <br>
            <el-form-item>
                <el-button type="primary" plain @click="updateExportTable()">导出</el-button>
            </el-form-item>
        </el-form>
    </el-card>
</template>

<script setup>
    import { useCommon } from '~/store/common'
    
    // store
    const store = useCommon(),
        { forms } = storeToRefs(store),
        { commonSearch, updateExportTable } = store;
</script>

<style scoped lang="scss">
    .ViewSearch {
        :deep(.el-card__body) {
            @apply \!pb-0;
        }
        :deep(.el-form-item) {
            @apply \!mr-4.5;
        }
    }
</style>