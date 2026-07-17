import { createRouter, createWebHistory, createWebHashHistory } from 'vue-router'
import routes from './routes'

export default createRouter({
    history: import.meta.env.DEV ? createWebHistory(import.meta.env.BASE_URL) : createWebHashHistory(import.meta.env.BASE_URL),
    routes
})
