import { defineConfig, presetAttributify, presetIcons, presetUno, transformerDirectives, transformerVariantGroup } from 'unocss'

export default defineConfig({
    presets: [
        presetUno(), // 默认预设（必须）
        presetAttributify(),
        presetIcons({
            scale: 1.2, // 图标缩放比例
            warn: true  // 未找到图标时警告
        })
    ],
    transformers: [
        transformerDirectives(),
        transformerVariantGroup()
    ],
    theme: {
        colors: {
            primary: '#008DFF',
            info: '#909399',
            warning: '#e6a23c',
            danger: '#f56c6c',
            success: '#67c23a'
        }
    },
    rules: [
        // 自定义规则（示例：添加圆角变体）
        [/^r-(\d+|circle)$/, ([, d]) => ({ 'border-radius': d === 'circle' ? '50%' : `${d}px` })],
    ],
    shortcuts: {
        'flex-center': 'flex justify-center items-center',
        'text-single-line': 'whitespace-nowrap overflow-hidden text-ellipsis'
    },
    // 屏蔽这个错误的数字图标
    blocklist: ['1', 'i-1'],
    safelist: [
        ...(['#409EFF', '#f5916c', '#f81717', '#67C23A', '#F56C6C', '#909399'].map(c => `bg-${c}`))
    ]
})
