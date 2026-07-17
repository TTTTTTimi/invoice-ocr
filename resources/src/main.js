import { init, extensions, events, app } from '@neutralinojs/lib'
import { createApp } from 'vue'
import pinia from "./store"
import router from "./router"
import App from './App.vue'
import components from './components'
import 'virtual:uno.css'

const vueApp = createApp(App);

// 向仓库挂载router
pinia.use(store => {
    store.$router = markRaw(router);
})

const startApp = async () => {
    init();
    
    vueApp
        .use(pinia)
        .use(router)
        .use(components)
        .mount('#app');
    
    await extensions.getStats();
    
    await events.on('windowClose', async () => {
        console.log("主窗口关闭，正在通知并清理后台扩展进程...");
        await app.exit();
    });
}

startApp()
