const http = require('http');
const fs = require('fs/promises');
const path = require('path');
const { pathToFileURL } = require('url');

const rootDir = path.resolve(__dirname, '..');
const i18nDir = path.join(rootDir, 'js', 'i18n');
const toolsDir = __dirname;
const port = Number(process.env.PORT || 4174);

const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8'
};

function sendJson(res, status, body) {
    const json = JSON.stringify(body);
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(json)
    });
    res.end(json);
}

function sendText(res, status, body, contentType = 'text/plain; charset=utf-8') {
    res.writeHead(status, {
        'Content-Type': contentType,
        'Content-Length': Buffer.byteLength(body)
    });
    res.end(body);
}

function isLanguage(value) {
    return /^[a-z]{2,8}(-[a-z0-9]{2,8})?$/i.test(value || '');
}

function isSourceJson(value) {
    return /^[a-z0-9_.-]+\.json$/i.test(value || '') && !value.endsWith('.min.json');
}

function languageDir(lang) {
    if (!isLanguage(lang)) {
        throw new Error('Invalid language code.');
    }

    return path.join(i18nDir, lang);
}

function sourceFile(lang, file) {
    if (!isSourceJson(file)) {
        throw new Error('Invalid JSON file name.');
    }

    const resolved = path.join(languageDir(lang), file);

    if (!resolved.startsWith(languageDir(lang))) {
        throw new Error('Invalid file path.');
    }

    return resolved;
}

function minFileName(file) {
    return file.replace(/\.json$/i, '.min.json');
}

async function readBody(req) {
    const chunks = [];

    for await (const chunk of req) {
        chunks.push(chunk);
    }

    if (!chunks.length) {
        return {};
    }

    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function itemCount(value) {
    if (Array.isArray(value)) {
        return value.length;
    }

    if (value && typeof value === 'object') {
        return Object.keys(value).length;
    }

    return 1;
}

async function getManifest() {
    const dirents = await fs.readdir(i18nDir, { withFileTypes: true });
    const languages = [];

    for (const dirent of dirents) {
        if (!dirent.isDirectory()) {
            continue;
        }

        const lang = dirent.name;
        const files = await fs.readdir(path.join(i18nDir, lang));
        const jsonFiles = [];

        for (const file of files.filter(isSourceJson).sort()) {
            const filePath = sourceFile(lang, file);
            let count = 0;
            let valid = true;

            try {
                const parsed = JSON.parse(await fs.readFile(filePath, 'utf8'));
                count = itemCount(parsed);
            } catch {
                valid = false;
            }

            jsonFiles.push({
                name: file,
                minName: minFileName(file),
                path: path.relative(rootDir, filePath).replace(/\\/g, '/'),
                count,
                valid
            });
        }

        languages.push({ code: lang, files: jsonFiles });
    }

    return { root: path.relative(rootDir, i18nDir).replace(/\\/g, '/'), languages };
}

async function readJson(lang, file) {
    const filePath = sourceFile(lang, file);
    const raw = await fs.readFile(filePath, 'utf8');
    return {
        lang,
        file,
        path: path.relative(rootDir, filePath).replace(/\\/g, '/'),
        data: JSON.parse(raw),
        raw
    };
}

async function saveJson(lang, file, data) {
    const filePath = sourceFile(lang, file);
    JSON.parse(JSON.stringify(data));
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(data, null, 4)}\n`, 'utf8');
    return filePath;
}

async function minifyJson(lang, file) {
    const sourcePath = sourceFile(lang, file);
    const data = JSON.parse(await fs.readFile(sourcePath, 'utf8'));
    const targetPath = path.join(path.dirname(sourcePath), minFileName(file));
    await fs.writeFile(targetPath, JSON.stringify(data), 'utf8');
    return path.relative(rootDir, targetPath).replace(/\\/g, '/');
}

async function minifyLanguage(lang) {
    const dir = languageDir(lang);
    const files = (await fs.readdir(dir)).filter(isSourceJson).sort();
    const written = [];

    for (const file of files) {
        written.push(await minifyJson(lang, file));
    }

    return written;
}

async function createLanguage(lang, baseLang = 'en') {
    const targetDir = languageDir(lang);

    try {
        await fs.access(targetDir);
        throw new Error(`Language "${lang}" already exists.`);
    } catch (error) {
        if (error.code !== 'ENOENT') {
            throw error;
        }
    }

    const baseDir = languageDir(baseLang);
    await fs.mkdir(targetDir, { recursive: true });

    const files = (await fs.readdir(baseDir)).filter((file) => file.endsWith('.json')).sort();

    for (const file of files) {
        await fs.copyFile(path.join(baseDir, file), path.join(targetDir, file));
    }

    return files.map((file) => `js/i18n/${lang}/${file}`);
}

async function serveStatic(req, res, pathname) {
    const route = pathname === '/' ? '/i18n-manager.html' : pathname;
    const filePath = path.resolve(toolsDir, `.${route}`);

    if (!filePath.startsWith(toolsDir)) {
        sendText(res, 403, 'Forbidden');
        return;
    }

    try {
        const body = await fs.readFile(filePath);
        sendText(res, 200, body, mimeTypes[path.extname(filePath)] || 'application/octet-stream');
    } catch {
        sendText(res, 404, 'Not found');
    }
}

async function route(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = decodeURIComponent(url.pathname);

    try {
        if (req.method === 'GET' && pathname === '/api/i18n') {
            sendJson(res, 200, await getManifest());
            return;
        }

        if (req.method === 'GET' && pathname === '/api/file') {
            sendJson(res, 200, await readJson(url.searchParams.get('lang'), url.searchParams.get('file')));
            return;
        }

        if (req.method === 'POST' && pathname === '/api/file') {
            const body = await readBody(req);
            await saveJson(body.lang, body.file, body.data);
            sendJson(res, 200, { ok: true, file: `js/i18n/${body.lang}/${body.file}` });
            return;
        }

        if (req.method === 'POST' && pathname === '/api/minify') {
            const body = await readBody(req);
            const files = body.lang === 'all'
                ? (await getManifest()).languages.flatMap((language) => language.files.map((file) => [language.code, file.name]))
                : (body.file ? [[body.lang, body.file]] : (await minifyLanguage(body.lang)).map((file) => file));

            if (body.lang === 'all') {
                const written = [];
                for (const [lang, file] of files) {
                    written.push(await minifyJson(lang, file));
                }
                sendJson(res, 200, { ok: true, files: written });
                return;
            }

            if (body.file) {
                sendJson(res, 200, { ok: true, files: [await minifyJson(body.lang, body.file)] });
                return;
            }

            sendJson(res, 200, { ok: true, files });
            return;
        }

        if (req.method === 'POST' && pathname === '/api/language') {
            const body = await readBody(req);
            sendJson(res, 200, { ok: true, files: await createLanguage(body.lang, body.baseLang || 'en') });
            return;
        }

        await serveStatic(req, res, pathname);
    } catch (error) {
        sendJson(res, 400, { ok: false, error: error.message });
    }
}

http.createServer(route).listen(port, () => {
    const url = `http://localhost:${port}`;
    console.log(`i18n manager running at ${url}`);
    console.log(`Repo: ${rootDir}`);
    console.log(`Open: ${pathToFileURL(path.join(toolsDir, 'i18n-manager.html')).href} is served through ${url}`);
});
