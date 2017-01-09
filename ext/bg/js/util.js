/*
 * Copyright (C) 2016  Alex Yatskov <alex@foosoft.net>
 * Author: Alex Yatskov <alex@foosoft.net>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */


function kanjiLinks(options) {
    let result = '';
    for (const c of options.fn(this)) {
        if (isKanji(c)) {
            result += Handlebars.templates['kanji-link.html']({kanji: c}).trim();
        } else {
            result += c;
        }
    }

    return result;
}

function isKanji(c) {
    const code = c.charCodeAt(0);
    return code >= 0x4e00 && code < 0x9fb0 || code >= 0x3400 && code < 0x4dc0;
}

function promiseCallback(promise, callback) {
    return promise.then(result => {
       callback({result});
    }).catch(error => {
        console.log(error);
        callback({error});
    });
}

function sortTermDefs(definitions) {
    return definitions.sort((v1, v2) => {
        const sl1 = v1.source.length;
        const sl2 = v2.source.length;
        if (sl1 > sl2) {
            return -1;
        } else if (sl1 < sl2) {
            return 1;
        }

        const s1 = v1.score;
        const s2 = v2.score;
        if (s1 > s2) {
            return -1;
        } else if (s1 < s2) {
            return 1;
        }

        const rl1 = v1.reasons.length;
        const rl2 = v2.reasons.length;
        if (rl1 < rl2) {
            return -1;
        } else if (rl1 > rl2) {
            return 1;
        }

        return v2.expression.localeCompare(v1.expression);
    });
}

function undupeTermDefs(definitions) {
    const definitionGroups = {};
    for (const definition of definitions) {
        const definitionExisting = definitionGroups[definition.id];
        if (!definitionGroups.hasOwnProperty(definition.id) || definition.expression.length > definitionExisting.expression.length) {
            definitionGroups[definition.id] = definition;
        }
    }

    const definitionsUnique = [];
    for (const key in definitionGroups) {
        definitionsUnique.push(definitionGroups[key]);
    }

    return definitionsUnique;
}

function groupTermDefs(definitions) {
    const groups = {};
    for (const definition of definitions) {
        const key = [definition.source, definition.expression].concat(definition.reasons);
        if (definition.reading) {
            key.push(definition.reading);
        }

        const group = groups[key];
        if (group) {
            group.push(definition);
        } else {
            groups[key] = [definition];
        }
    }

    const results = [];
    for (const key in groups) {
        const groupDefs = groups[key];
        const firstDef = groupDefs[0];
        results.push({
            definitions: groupDefs,
            expression: firstDef.expression,
            reading: firstDef.reading,
            reasons: firstDef.reasons,
            score: groupDefs.reduce((x, y) => x > y ? x : y, Number.MIN_SAFE_INTEGER),
            source: firstDef.source,
        });
    }

    return sortTermDefs(results);
}

function buildDictTag(name) {
    return sanitizeTag({name, category: 'dictionary', order: 100});
}

function buildTag(name, meta) {
    const tag = {name};
    const symbol = name.split(':')[0];
    for (const prop in meta[symbol] || {}) {
        tag[prop] = meta[symbol][prop];
    }

    return sanitizeTag(tag);
}

function sanitizeTag(tag) {
    tag.name = tag.name || 'untitled';
    tag.category = tag.category || 'default';
    tag.notes = tag.notes || '';
    tag.order = tag.order || 0;
    return tag;
}

function splitField(field) {
    return field.length === 0 ? [] : field.split(' ');
}

function sortTags(tags) {
    return tags.sort((v1, v2) => {
        const order1 = v1.order;
        const order2 = v2.order;
        if (order1 < order2) {
            return -1;
        } else if (order1 > order2) {
            return 1;
        }

        const name1 = v1.name;
        const name2 = v2.name;
        if (name1 < name2) {
            return -1;
        } else if (name1 > name2) {
            return 1;
        }

        return 0;
    });
}

function formatField(field, definition, mode) {
    const markers = [
        'audio',
        'character',
        'dictionary',
        'expression',
        'expression-furigana',
        'glossary',
        'glossary-list',
        'kunyomi',
        'onyomi',
        'reading',
        'sentence',
        'tags',
        'url',
    ];

    for (const marker of markers) {
        let value = definition[marker] || null;
        switch (marker) {
            case 'expression':
                if (mode === 'term_kana' && definition.reading) {
                    value = definition.reading;
                }
                break;
            case 'expression-furigana':
                if (mode === 'term_kana' && definition.reading) {
                    value = definition.reading;
                } else {
                    value = `<ruby>${definition.expression}<rt>${definition.reading}</rt></ruby>`;
                }
                break;
            case 'reading':
                if (mode === 'term_kana') {
                    value = null;
                }
                break;
            case 'glossary-list':
                if (definition.glossary) {
                    if (definition.glossary.length > 1) {
                        value = '<ol style="white-space: pre; text-align: left; overflow-x: auto;">';
                        for (const gloss of definition.glossary) {
                            value += `<li>${gloss}</li>`;
                        }
                        value += '</ol>';
                    } else {
                        value = `<p style="white-space: pre; overflow-x: auto;">${definition.glossary.join('')}</p>`;
                    }
                }
                break;
            case 'tags':
                if (definition.tags) {
                    value = definition.tags.map(t => t.name);
                }
                break;
        }

        if (value !== null && typeof(value) !== 'string') {
            value = value.join(', ');
        }

        field = field.replace(`{${marker}}`, value || '');
    }

    return field;
}

function loadJson(url) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.addEventListener('load', () => resolve(xhr.responseText));
        xhr.addEventListener('error', () => reject('failed to execute network request'));
        xhr.open('GET', url);
        xhr.send();
    }).then(responseText => {
        try {
            return JSON.parse(responseText);
        }
        catch (e) {
            return Promise.reject('invalid JSON response');
        }
    });
}

function loadJsonInt(url) {
    return loadJson(chrome.extension.getURL(url));
}

function importJsonDb(indexUrl, indexLoaded, termsLoaded, kanjiLoaded) {
    const indexDir = indexUrl.slice(0, indexUrl.lastIndexOf('/'));
    return loadJson(indexUrl).then(index => {
        if (!index.title || !index.version || !index.revision) {
            return Promise.reject('unrecognized dictionary format');
        }

        if (indexLoaded !== null) {
            return indexLoaded(
                index.title,
                index.version,
                index.revision,
                index.tagMeta || {},
                index.termBanks > 0,
                index.kanjiBanks > 0
            ).then(() => index);
        }

        return index;
    }).then(index => {
        const loaders = [];
        const banksTotal = index.termBanks + index.kanjiBanks;
        let banksLoaded = 0;

        for (let i = 1; i <= index.termBanks; ++i) {
            const bankUrl = `${indexDir}/term_bank_${i}.json`;
            loaders.push(() => loadJson(bankUrl).then(entries => termsLoaded(
                index.title,
                entries,
                banksTotal,
                banksLoaded++
            )));
        }

        for (let i = 1; i <= index.kanjiBanks; ++i) {
            const bankUrl = `${indexDir}/kanji_bank_${i}.json`;
            loaders.push(() => loadJson(bankUrl).then(entries => kanjiLoaded(
                index.title,
                entries,
                banksTotal,
                banksLoaded++
            )));
        }

        let chain = Promise.resolve();
        for (const loader of loaders) {
            chain = chain.then(loader);
        }

        return chain;
    });
}
