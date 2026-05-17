const state = {
    manifest: null,
    lang: null,
    file: null,
    data: null,
    rawMode: false,
    dirty: false
};

const els = {
    languageList: document.getElementById('languageList'),
    fileList: document.getElementById('fileList'),
    fileCount: document.getElementById('fileCount'),
    fileTitle: document.getElementById('fileTitle'),
    filePath: document.getElementById('filePath'),
    editor: document.getElementById('editor'),
    status: document.getElementById('status'),
    rawBtn: document.getElementById('rawBtn'),
    validateBtn: document.getElementById('validateBtn'),
    minifyLanguageBtn: document.getElementById('minifyLanguageBtn'),
    minifyAllBtn: document.getElementById('minifyAllBtn'),
    saveBtn: document.getElementById('saveBtn'),
    reloadBtn: document.getElementById('reloadBtn'),
    newLanguageForm: document.getElementById('newLanguageForm'),
    newLanguageInput: document.getElementById('newLanguageInput')
};

function showStatus(message, isError = false) {
    els.status.textContent = message;
    els.status.classList.toggle('error', isError);
    els.status.hidden = false;
}

function clearStatus() {
    els.status.hidden = true;
}

async function api(path, options = {}) {
    const response = await fetch(path, {
        headers: { 'Content-Type': 'application/json' },
        ...options
    });
    const body = await response.json();

    if (!response.ok || body.ok === false) {
        throw new Error(body.error || 'Request failed.');
    }

    return body;
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
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

function markDirty() {
    state.dirty = true;
    els.saveBtn.disabled = false;
}

function setClean() {
    state.dirty = false;
    els.saveBtn.disabled = !state.data;
}

function selectedLanguage() {
    return state.manifest?.languages.find((language) => language.code === state.lang);
}

function selectedFile() {
    return selectedLanguage()?.files.find((file) => file.name === state.file);
}

function renderNav() {
    els.languageList.innerHTML = '';
    els.fileList.innerHTML = '';

    for (const language of state.manifest.languages) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `nav-item${language.code === state.lang ? ' active' : ''}`;
        button.innerHTML = `<span>${language.code}</span><small>${language.files.length}</small>`;
        button.addEventListener('click', () => selectLanguage(language.code));
        els.languageList.appendChild(button);
    }

    const language = selectedLanguage();
    const files = language?.files || [];
    els.fileCount.textContent = `${files.length} JSON`;

    for (const file of files) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `nav-item${file.name === state.file ? ' active' : ''}`;
        button.innerHTML = `<span>${file.name}</span><small>${file.valid ? file.count : 'invalid'}</small>`;
        button.addEventListener('click', () => selectFile(file.name));
        els.fileList.appendChild(button);
    }
}

function renderHeader() {
    const file = selectedFile();
    els.fileTitle.textContent = state.file || 'Select a file';
    els.filePath.textContent = file?.path || (state.lang ? `js/i18n/${state.lang}` : 'js/i18n');
    els.rawBtn.textContent = state.rawMode ? 'Form view' : 'Raw JSON';
    els.saveBtn.disabled = !state.data || !state.dirty;
    els.validateBtn.disabled = !state.data;
    els.minifyLanguageBtn.disabled = !state.lang;
}

function keyFromPath(path) {
    if (!path.length) {
        return 'Root';
    }

    return String(path[path.length - 1]);
}

function pathLabel(path) {
    return path.length ? path.join('.') : 'root';
}

function valueAt(path) {
    return path.reduce((current, key) => current[key], state.data);
}

function updateAt(path, value) {
    if (!path.length) {
        state.data = value;
        return;
    }

    const parent = valueAt(path.slice(0, -1));
    parent[path[path.length - 1]] = value;
}

function removeAt(path) {
    const parent = valueAt(path.slice(0, -1));
    const key = path[path.length - 1];

    if (Array.isArray(parent)) {
        parent.splice(Number(key), 1);
    } else {
        delete parent[key];
    }
}

function renameKey(path, nextKey) {
    const parent = valueAt(path.slice(0, -1));
    const oldKey = path[path.length - 1];

    if (!nextKey || nextKey === oldKey || Array.isArray(parent)) {
        return;
    }

    if (Object.prototype.hasOwnProperty.call(parent, nextKey)) {
        showStatus(`"${nextKey}" already exists at ${pathLabel(path.slice(0, -1))}.`, true);
        return;
    }

    parent[nextKey] = parent[oldKey];
    delete parent[oldKey];
    markDirty();
    renderEditor();
}

function coerceValue(value, currentValue) {
    if (typeof currentValue === 'number') {
        const parsed = Number(value);
        return Number.isNaN(parsed) ? currentValue : parsed;
    }

    if (typeof currentValue === 'boolean') {
        return value === 'true';
    }

    if (currentValue === null) {
        return value === '' ? null : value;
    }

    return value;
}

function makePrimitiveField(path, value) {
    const row = document.createElement('div');
    row.className = 'field-row';

    const labelWrap = document.createElement('div');
    labelWrap.className = 'field-label';

    const label = document.createElement('label');
    label.textContent = keyFromPath(path);
    labelWrap.appendChild(label);

    const helper = document.createElement('div');
    helper.className = 'field-path';
    helper.textContent = pathLabel(path);
    labelWrap.appendChild(helper);

    if (!Array.isArray(valueAt(path.slice(0, -1)))) {
        label.contentEditable = 'true';
        label.title = 'Edit key name';
        label.addEventListener('blur', () => renameKey(path, label.textContent.trim()));
        label.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                label.blur();
            }
        });
    }

    const controlWrap = document.createElement('div');
    let control;

    if (typeof value === 'boolean') {
        control = document.createElement('select');
        control.innerHTML = '<option value="true">true</option><option value="false">false</option>';
        control.value = String(value);
    } else {
        control = document.createElement('textarea');
        control.value = value === null ? '' : String(value);
    }

    control.addEventListener('input', () => {
        updateAt(path, coerceValue(control.value, value));
        markDirty();
    });
    controlWrap.appendChild(control);

    const actions = document.createElement('div');
    actions.className = 'field-actions';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'danger';
    remove.textContent = 'x';
    remove.title = 'Remove field';
    remove.addEventListener('click', () => {
        removeAt(path);
        markDirty();
        renderEditor();
    });
    actions.appendChild(remove);

    row.append(labelWrap, controlWrap, actions);
    return row;
}

function defaultValueForAdd(container) {
    if (Array.isArray(container)) {
        return container.length && typeof container[0] === 'object' ? clone(container[0]) : '';
    }

    return '';
}

function addField(path) {
    const container = valueAt(path);

    if (Array.isArray(container)) {
        container.push(defaultValueForAdd(container));
    } else {
        let key = 'newField';
        let index = 1;

        while (Object.prototype.hasOwnProperty.call(container, key)) {
            key = `newField${index}`;
            index += 1;
        }

        container[key] = '';
    }

    markDirty();
    renderEditor();
}

function makeContainer(path, value) {
    const template = document.getElementById(Array.isArray(value) ? 'arrayTemplate' : 'objectTemplate');
    const node = template.content.firstElementChild.cloneNode(true);
    const title = node.querySelector('h3');
    const meta = node.querySelector('span');
    const add = node.querySelector('button');
    const body = node.querySelector('.block-body');

    title.textContent = keyFromPath(path);
    meta.textContent = `${Array.isArray(value) ? 'Array' : 'Object'} - ${itemCount(value)} item${itemCount(value) === 1 ? '' : 's'}`;
    add.textContent = Array.isArray(value) ? 'Add item' : 'Add field';
    add.addEventListener('click', () => addField(path));

    Object.entries(value).forEach(([key, child]) => {
        body.appendChild(makeNode([...path, key], child));
    });

    return node;
}

function makeNode(path, value) {
    if (value && typeof value === 'object') {
        const wrapper = document.createElement('div');

        if (path.length) {
            const row = document.createElement('div');
            row.className = 'field-row';

            const labelWrap = document.createElement('div');
            labelWrap.className = 'field-label';
            const label = document.createElement('label');
            label.textContent = keyFromPath(path);
            const helper = document.createElement('div');
            helper.className = 'field-path';
            helper.textContent = pathLabel(path);
            labelWrap.append(label, helper);

            const summary = document.createElement('div');
            summary.className = 'field-path';
            summary.textContent = Array.isArray(value) ? `Array - ${value.length} items` : `Object - ${Object.keys(value).length} items`;

            const actions = document.createElement('div');
            actions.className = 'field-actions';
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'danger';
            remove.textContent = 'x';
            remove.title = 'Remove section';
            remove.addEventListener('click', () => {
                removeAt(path);
                markDirty();
                renderEditor();
            });
            actions.appendChild(remove);

            row.append(labelWrap, summary, actions);
            wrapper.appendChild(row);
        }

        wrapper.appendChild(makeContainer(path, value));
        return wrapper;
    }

    return makePrimitiveField(path, value);
}

function renderRawEditor() {
    els.editor.className = 'editor';
    els.editor.innerHTML = '';

    const textarea = document.createElement('textarea');
    textarea.className = 'raw-editor';
    textarea.value = JSON.stringify(state.data, null, 4);
    textarea.addEventListener('input', () => {
        try {
            state.data = JSON.parse(textarea.value);
            markDirty();
            showStatus('Raw JSON is valid.');
        } catch (error) {
            showStatus(error.message, true);
            els.saveBtn.disabled = true;
        }
    });

    els.editor.appendChild(textarea);
}

function renderEditor() {
    renderHeader();

    if (!state.data) {
        els.editor.className = 'editor empty-state';
        els.editor.innerHTML = '<p>Choose a language and JSON file to start editing.</p>';
        return;
    }

    if (state.rawMode) {
        renderRawEditor();
        return;
    }

    els.editor.className = 'editor';
    els.editor.innerHTML = '';
    els.editor.appendChild(makeNode([], state.data));
}

async function loadManifest(keepSelection = true) {
    state.manifest = await api('/api/i18n');

    if (!keepSelection || !selectedLanguage()) {
        state.lang = state.manifest.languages[0]?.code || null;
    }

    if (!keepSelection || !selectedFile()) {
        state.file = selectedLanguage()?.files[0]?.name || null;
    }

    renderNav();
    renderHeader();
}

async function loadCurrentFile() {
    if (!state.lang || !state.file) {
        renderEditor();
        return;
    }

    clearStatus();
    const body = await api(`/api/file?lang=${encodeURIComponent(state.lang)}&file=${encodeURIComponent(state.file)}`);
    state.data = body.data;
    setClean();
    renderNav();
    renderEditor();
}

async function selectLanguage(lang) {
    state.lang = lang;
    state.file = selectedLanguage()?.files[0]?.name || null;
    await loadCurrentFile();
}

async function selectFile(file) {
    state.file = file;
    await loadCurrentFile();
}

async function saveCurrentFile() {
    if (!state.data || !state.lang || !state.file) {
        return;
    }

    await api('/api/file', {
        method: 'POST',
        body: JSON.stringify({ lang: state.lang, file: state.file, data: state.data })
    });
    setClean();
    await loadManifest(true);
    showStatus(`Saved js/i18n/${state.lang}/${state.file}.`);
}

async function minify(body) {
    const result = await api('/api/minify', {
        method: 'POST',
        body: JSON.stringify(body)
    });
    showStatus(`Generated ${result.files.length} minified file${result.files.length === 1 ? '' : 's'}.`);
}

function validateCurrent() {
    try {
        JSON.parse(JSON.stringify(state.data));
        showStatus('JSON is valid.');
    } catch (error) {
        showStatus(error.message, true);
    }
}

els.rawBtn.addEventListener('click', () => {
    state.rawMode = !state.rawMode;
    clearStatus();
    renderEditor();
});

els.validateBtn.addEventListener('click', validateCurrent);
els.saveBtn.addEventListener('click', () => saveCurrentFile().catch((error) => showStatus(error.message, true)));
els.minifyLanguageBtn.addEventListener('click', () => minify({ lang: state.lang }).catch((error) => showStatus(error.message, true)));
els.minifyAllBtn.addEventListener('click', () => minify({ lang: 'all' }).catch((error) => showStatus(error.message, true)));
els.reloadBtn.addEventListener('click', () => loadManifest(true).then(loadCurrentFile).catch((error) => showStatus(error.message, true)));

els.newLanguageForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const lang = els.newLanguageInput.value.trim();
    const baseLang = state.lang || 'en';

    if (!lang) {
        return;
    }

    try {
        await api('/api/language', {
            method: 'POST',
            body: JSON.stringify({ lang, baseLang })
        });
        els.newLanguageInput.value = '';
        state.lang = lang;
        state.file = 'translations.json';
        await loadManifest(true);
        await loadCurrentFile();
        showStatus(`Created js/i18n/${lang} from ${baseLang}.`);
    } catch (error) {
        showStatus(error.message, true);
    }
});

loadManifest(false)
    .then(loadCurrentFile)
    .catch((error) => showStatus(error.message, true));
