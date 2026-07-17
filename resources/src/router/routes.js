export default [
    {
        path: '/',
        name: 'home',
        component: () => import('~/views/index/index'),
        meta: { title: '发票管理' }
    }
]