import { nanoid } from "nanoid"
import storage from "~/util/storage"
import { Typeof } from "~/util/util"

// 所有表格列数据
const globColumns = import.meta.glob('~/columns/*.js', { eager: true });

export const useColumns = defineStore('useColumns', {
    state() {
        return {
            show: false,
            columns: {
                home: []
            }
        }
    },
    actions: {
        // 初始化
        async initColumns(name) {
            const columns = this.columns[name];
            
            if(columns && !columns.length) {
                const data = globColumns[`/src/columns/${name}Columns.js`].default;
                if(storage.has(name)) {
                    const local = storage.get(name, []);
                    
                    data.forEach(item => {
                        local.forEach(v => {
                            if(item.label === v.label) {
                                item.sort = v.sort;
                                item.id = v.id;
                                item.width = v.width;
                                item.minWidth = v.minWidth;
                                item.show = Typeof('boolean', v.show) ? v.show : true;
                                item.fixed = v.fixed;
                            }
                        })
                    })
                    
                    this.columns[name] = data.sort((a, b) => a.sort - b.sort);
                } else {
                    this.columns[name] = data.map((item, index) => {
                        item.sort = index + 1;
                        item.id = nanoid();
                        item.width = item.width || '';
                        item.minWidth = item.minWidth || '';
                        item.show = Typeof('boolean', item.show) ? item.show : true;
                        if(typeof item.fixed === 'undefined') item.fixed = false;
                        return item;
                    });
                    storage.set(name, this.columns[name]);
                }
            }
        },
        // 更新columns
        updateColumns(name, data) {
            if(this.columns[name]) {
                data.forEach((item, index) => {
                    item.sort = index+1;
                })
                storage.set(name, data);
                this.columns[name] = data;
                this.updateShow(false)
            }
        },
        // 隐藏/显示弹出层
        updateShow(is) {
            this.show = is;
        }
    }
})

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useColumns, import.meta.hot));
}
