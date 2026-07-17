<!-- Update -->
<!-- 2026-07-10 09:49:35 -->
<template>
    <el-dialog
        title="编辑"
        top="5dvh"
        width="600px"
        draggable
        destroy-on-close
        :close-on-click-modal="false"
        class="Update"
        v-model="update.show">
        
        <el-form ref="formRef" label-width="130px" :model="update.forms" :rules="rules">
            <el-form-item label="发票类型">
                <el-select placeholder="请选择" v-model="update.forms.invoiceType">
                    <el-option label="电子发票（普通发票）" value="电子发票（普通发票）" />
                    <el-option label="电子发票（专用发票）" value="电子发票（专用发票）" />
                </el-select>
            </el-form-item>
            <el-form-item label="发票号码" prop="invoiceNumber">
                <el-input placeholder="请输入" v-model.trim="update.forms.invoiceNumber" />
            </el-form-item>
            <el-form-item label="开票日期">
                <el-date-picker
                    class="!w-full"
                    type="date"
                    value-format="YYYY-MM-DD"
                    placeholder="请选择"
                    v-model="update.forms.invoiceDate"
                />
            </el-form-item>
            <el-form-item label="税务局">
                <el-input placeholder="请输入" v-model.trim="update.forms.taxBureau" />
            </el-form-item>
            <el-form-item label="购买方名称">
                <div class="w-full grid grid-cols-[1fr_auto] gap-col-2">
                    <el-input placeholder="请输入" v-model.trim="update.forms.buyerName" />
                    <el-link type="primary" class="!text-3" @click="changeExchange('buyerName', 'sellerName')">与[销售方名称]互换</el-link>
                </div>
            </el-form-item>
            <el-form-item label="销售方名称">
                <div class="w-full grid grid-cols-[1fr_auto] gap-col-2">
                    <el-input placeholder="请输入" v-model.trim="update.forms.sellerName" />
                    <el-link type="primary" class="!text-3" @click="changeExchange('sellerName', 'buyerName')">与[购买方名称]互换</el-link>
                </div>
            </el-form-item>
            <el-form-item label="金额">
                <el-input-number :min="0" :step="0.01" controls-position="right" placeholder="请输入" v-model="update.forms.amount">
                    <template #prefix>¥</template>
                </el-input-number>
            </el-form-item>
            <el-form-item label="税率/征收率">
                <el-input-number controls-position="right" placeholder="请输入" v-model="update.forms.taxRate">
                    <template #suffix>%</template>
                </el-input-number>
            </el-form-item>
            <el-form-item label="税额">
                <el-input-number :min="0" :step="0.01" controls-position="right" placeholder="请输入" v-model="update.forms.taxAmount">
                    <template #prefix>¥</template>
                </el-input-number>
            </el-form-item>
            <el-form-item label="价税合计">
                <el-input-number :min="0" :step="0.01" controls-position="right" placeholder="请输入" v-model="update.forms.totalAmount">
                    <template #prefix>¥</template>
                </el-input-number>
            </el-form-item>
            <el-form-item label="开票人">
                <el-input placeholder="请输入" v-model.trim="update.forms.issuer" />
            </el-form-item>
        </el-form>
        
        <template #footer>
            <div>
                <el-button @click="update.show = false">取消</el-button>
                <el-button type="primary" @click="confirmUpdate(formRef)">确定</el-button>
            </div>
        </template>
    </el-dialog>
</template>

<script setup>
    import { useCommon } from '~/store/common'
    
    // ref dom
    const formRef = useTemplateRef('formRef');
    
    // store
    const store = useCommon(),
        { update } = storeToRefs(store),
        { confirmUpdate } = store;
    
    // rules
    const rules = {
        invoiceNumber: [
            { required: true, trigger: 'blur', message: '请输入发票号码' },
            { pattern: /\d+/, trigger: 'blur', message: '发票号码为纯数字' }
        ]
    }
    
    // 互换
    const changeExchange = (attr1, attr2) => {
        const _text = update.value.forms[attr1];
        update.value.forms[attr1] = update.value.forms[attr2];
        update.value.forms[attr2] = _text;
    }
    
    watchEffect(() => {
        if (!update.value || !update.value.forms) {
            return;
        }
        
        const { amount = 0, taxRate = 0 } = update.value.forms;
        
        // 2. 只有当用户确实录入了数量（q > 0），才允许触发级联公式自动计算
        update.value.forms.taxAmount = +((amount * 100) * (taxRate / 100) / 100).toFixed(2);
        const taxAmount = update.value.forms.taxAmount;
        update.value.forms.totalAmount = +(((taxAmount * 100) + (amount * 100)) / 100).toFixed(2);
    });

</script>

<style scoped lang="scss">
    .Update {
    
    }
</style>