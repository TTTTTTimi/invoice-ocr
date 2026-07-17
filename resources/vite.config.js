import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import Icons from 'unplugin-icons/vite'
import IconsResolver from 'unplugin-icons/resolver'
import Components from 'unplugin-vue-components/vite'
import AutoImport from 'unplugin-auto-import/vite'
import VitePluginCompression from 'vite-plugin-compression'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import { createStyleImportPlugin } from 'vite-plugin-style-import'
import Unocss from "unocss/vite"
import boxen from 'boxen'
import gradientString from 'gradient-string'
import { version, name } from './package.json'

// https://vitejs.dev/config/
export default ({ mode, command }) => {
    const MODE_VARS = loadEnv(mode, process.cwd());
    
    const time = Date.now(),
        r = Math.round(Math.random() * time),
        v = ['v', version].join(''),
        date = new Date(),
        y = date.getFullYear(),
        m = date.getMonth() + 1,
        d = date.getDate(),
        H = date.getHours(),
        M = date.getMinutes(),
        S = date.getSeconds(),
        formatVal = d => d < 10 ? `0${ d }` : d,
        runTime = [[y, formatVal(m), formatVal(d)].join('-'), [formatVal(H), formatVal(M), formatVal(S)].join(':')].join(' ');
    
    // 是否打包正式包
    const prod = mode === 'production';
    let arrStr = [];
    const modeTypes = {
        'VITE_NAME': '当前模式',
        'VITE_APP_API': '接口地址'
    }
    Object.entries(MODE_VARS).forEach(([key, value]) => {
        if (modeTypes[key]) {
            arrStr.push(`${ modeTypes[key] }: ${ value }`);
        }
    })
    const str = gradientString('red', 'magenta').multiline(
        `配置信息\n${ arrStr.join('\n') }\n版本号: ${ version }\n运行模式: ${ mode }\n运行时间: ${ runTime }`
    )
    console.log(boxen(str, {
        borderColor: 'red',
        borderStyle: 'round',
        margin: 2,
        padding: 1,
        title: `💠  vite.config.js  💠 `,
        titleAlignment: 'center',
    }))
    
    return defineConfig({
        base: MODE_VARS.VITE_BASE_URL,
        plugins: [
            vue(),
            AutoImport({
                // 自动导入 Vue 相关函数，如：ref, reactive, toRef 等
                imports: ['vue', 'vue-router', 'pinia', 'vue-i18n'],
                dirs: ['src/store'],
                // 自动导入 Element 相关函数
                resolvers: [
                    ElementPlusResolver(),
                    // 自动导入图标组件
                    IconsResolver({
                        prefix: 'i'
                    })
                ],
                dts: path.resolve(__dirname, 'auto-imports.d.ts'),
            }),
            Components({
                resolvers: [
                    // 自动导入 Element 组件
                    ElementPlusResolver(),
                    // 自动注册图标组件
                    IconsResolver({
                        enabledCollections: ['ep']
                    })
                ],
                dts: path.resolve(__dirname, 'components.d.ts')
            }),
            // icon自动引入
            Icons({
                autoInstall: true
            }),
            // 自动导入样式，防止element-plus使用ElMessage、ElMessageBox、ElNotification、ElLoading Api时无样式
            createStyleImportPlugin({
                resolves: [ElementPlusResolver()],
                libs: [
                    {
                        libraryName: 'element-plus',
                        esModule: true,
                        resolveStyle: name => `element-plus/theme-chalk/${name}.css`
                    }
                ]
            }),
            Unocss(),
            // 删除正式版打包后的console
            VitePluginCompression({
                verbose: true,
                disable: false,
                threshold: 10240,
                algorithm: 'gzip',
                ext: '.gz',
                success: () => {
                    const color = 'red';
                    const str = gradientString(color, 'magenta').multiline(
                        `打包完成!\n${ MODE_VARS.VITE_NAME }版\nVersion: ${ version }\nBuild Time: ${ runTime }`
                    )
                    
                    console.log(boxen(str, {
                        borderColor: color,
                        borderStyle: 'round',
                        margin: 2,
                        padding: 1,
                        title: `💠  ${ name.toUpperCase() }  💠 `,
                        titleAlignment: 'center',
                    }))
                }
            })
        ],
        define: {
            'process.env': { TINY_MODE: 'pc' }
        },
        css: {
            preprocessorOptions: {
                scss: {
                    silenceDeprecations: ['legacy-js-api']
                }
            }
            // preprocessorOptions: {
            //     scss: {
            //         api: 'modern-compiler',
            //         additionalData: '@use "~/assets/styles/mixin.scss" as *; \n'
            //     }
            // }
        },
        resolve: {
            alias: {
                '~/': `${ path.resolve(__dirname, 'src') }/`
            },
            // 文件引入忽略后缀名
            extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.vue', '.sass', '.scss', '.css']
        },
        server: {
            host: true,
            // port: 8000,
            proxy: {
                '/api': {
                    target: MODE_VARS.VITE_APP_API,
                    ws: true,
                    changeOrigin: true,
                    secure: true,
                    rewrite: path => path.replace(/^\/api/, '')
                }
            }
        },
        esbuild: {
            drop: prod ? ['console', 'debugger'] : [],
        },
        build: {
            // outDir: 'gen',
            targets: ['es2015'],
            minify: 'terser',
            cssMinify: 'esbuild',
            chunkSizeWarningLimit: 1500,
            rollupOptions: {
                output: {
                    chunkFileNames: `js/[name]-[hash]-${ v }-${ time }-${ r }.js`,
                    entryFileNames: `js/[name]-[hash]-${ v }-${ time }-${ r }.js`,
                    assetFileNames: (assetInfo) => {
                        const ext = assetInfo.name?.split('.').pop()?.toLowerCase() ?? '';
                        const fileName = `[name]-[hash]-${ v }-${ time }-${ r }.[ext]`;
                        return ext === 'css' ? `css/${ fileName }` : `assets/${ fileName }`;
                    },
                    manualChunks(id) {
                        if (id.includes('node_modules')) {
                            const arr = id.toString().split('node_modules/');
                            return arr[arr.length - 1].split('/')[0].toString()
                        }
                    }
                }
            }
        }
    })
}
