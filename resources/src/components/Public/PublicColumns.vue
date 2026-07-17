<!-- PublicColumns -->
<!-- 2026-04-18 08:32:54 -->
<template>
    <el-dialog
        :title="`【${title}】列设置`"
        top="5dvh"
        draggable
        destroy-on-close
        :close-on-click-modal="false"
        class="PublicColumns"
        v-model="show">
        <VueDraggable v-model="data" :animation="150" handle=".drag-handle">
            <div
                class="flex items-center w-full b-(1 solid [var(--el-border-color)]) rd-1 p-2 mb-2 select-none"
                v-for="(item, index) in data"
                :key="item.id">
                <span class="text-(3 info) cursor-move drag-handle">::</span>
                <div class="flex-1 grid grid-cols-[30px_100px_1fr_1fr_1fr_auto] gap-col-2 px-2">
                    <span class="text-3 flex items-center">{{ index+1 }}</span>
                    <span class="text-3 flex items-center">{{ item.label }}</span>
                    <el-input size="small" placeholder="宽度" v-model="item.width">
                        <template #suffix>px</template>
                    </el-input>
                    <el-input size="small" placeholder="最小宽度" v-model="item.minWidth">
                        <template #suffix>px</template>
                    </el-input>
                    <el-select size="small" placeholder="悬浮" v-model="item.fixed">
                        <el-option label="不悬浮" :value="false" />
                        <el-option label="左侧" value="left" />
                        <el-option label="右侧" value="right" />
                    </el-select>
                    <el-switch inactive-text="不显示" active-text="显示" size="small" v-model="item.show" />
                </div>
                <span class="text-(3 info) cursor-move drag-handle">::</span>
            </div>
        </VueDraggable>
        
        <template #footer>
            <el-button @click="updateShow(false)">取消</el-button>
            <el-button type="primary" @click="updateColumns(name, data)">确定</el-button>
        </template>
    </el-dialog>
</template>

<script setup>
    import { VueDraggable } from 'vue-draggable-plus'
    import { useColumns } from '~/store/columns'
    import { CloneObject } from "~/util/util";
    
    defineOptions({
        name: "PublicColumns"
    })
    
    // route
    const route = useRoute();
    
    // name
    const name = computed(() => route.name.replace(/home\-/mg, ''));
    
    // title
    const title = computed(() => route.meta?.title);
    
    // store
    const store = useColumns(),
        { show, columns } = storeToRefs(store),
        { initColumns, updateColumns, updateShow } = store;
    
    // ref
    const data = ref([]);
    
    watch(show, now => {
        const _name = route.name.replace(/home\-/mg, '');
        
        initColumns(_name);
        if(now) {
            data.value = CloneObject([...columns.value[_name]]);
        }
    }, { immediate: true });
</script>

<style scoped lang="scss">
    .PublicColumns {
    
    }
</style>