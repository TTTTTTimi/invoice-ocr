const {
    existsSync,
    mkdirSync,
    statSync,
    readFileSync,
    readdirSync,
    copyFileSync,
    rmSync
} = require('fs')
const { join, dirname } = require('path')

const neuConfig = JSON.parse(
    readFileSync(join(__dirname, 'neutralino.config.json'), 'utf8')
)

// 创建updater文件夹
const createUpdaterDir = () => {
    const updaterDir = join(__dirname, 'updater')

    if (!existsSync(updaterDir)) mkdirSync(updaterDir)
}

// 是否复制该文件
const shouldCopyFile = (absPath) => {
    try {
        if (statSync(absPath).isDirectory()) return true
    } catch {
        return false
    }
    const lower = absPath.toLowerCase().replace(/\\/g, '/'); // 统一转换为正斜杠处理
    
    // 如果是 PaddleOCR 目录下的任何文件，直接放行
    if (lower.includes('/paddleocr/')) {
        return true;
    }
    
    // 其余常规文件依然只拷贝 .exe 和 .neu
    return lower.endsWith('.exe') || lower.endsWith('.neu')
}

// 拷贝文件树
const copyFilteredTree = (srcRoot, destRoot) => {
    if (!existsSync(srcRoot)) {
        console.error('Source not found:', srcRoot)
        process.exit(1)
    }
    
    const walk = (srcDir, destDir) => {
        const entries = readdirSync(srcDir, { withFileTypes: true })
        for (const ent of entries) {
            const srcPath = join(srcDir, ent.name)
            const destPath = join(destDir, ent.name)
            
            if (ent.isDirectory()) {
                // 【核心修复 2】：只要是目录，在递归向下走之前，先确保创建目标父级结构
                mkdirSync(destDir, { recursive: true })
                walk(srcPath, destPath)
            }
            else if (ent.isFile() && shouldCopyFile(srcPath)) {
                mkdirSync(dirname(destPath), { recursive: true })
                copyFileSync(srcPath, destPath)
            }
        }
    }
    
    walk(srcRoot, destRoot)
}

// copy文件
const copyFiles = (isTest = false) => {
    const dir = join(__dirname, 'dist', '发票工具')
    createUpdaterDir();
    const filesDir = `${neuConfig.version}+${isTest ? 'test' : 'all'}`;
    const targetDir = join(__dirname, 'updater', filesDir)
    if (existsSync(targetDir)) {
        try {
            rmSync(targetDir, {
                recursive: true,
                force: true,
                maxRetries: 5,
                retryDelay: 100
            })
        } catch (e) {
            console.error("无法删除目录，请确保没有程序占用它。", e);
        }
    }
    mkdirSync(targetDir, { recursive: true });
    copyFilteredTree(dir, targetDir);
    
    console.log(`已将可用文件挪到 updater/${filesDir} 文件夹中，请前往该文件夹中查看`)
}

// 正式调用
copyFiles(false)
