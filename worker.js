const PREFIX = '/';
const MAX_REDIRECTS = 10;

const PREFLIGHT_INIT = {
    status: 204,
    headers: new Headers({
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,POST,PUT,PATCH,TRACE,DELETE,HEAD,OPTIONS',
        'access-control-max-age': '1728000',
    }),
};

const GITHUB_PATTERNS = [
    /^(?:https?:\/\/)?github\.com\/.+?\/.+?\/(?:releases|archive)\/.*$/i,
    /^(?:https?:\/\/)?github\.com\/.+?\/.+?\/(?:blob|raw)\/.*$/i,
    /^(?:https?:\/\/)?github\.com\/.+?\/.+?\/(?:info|git-).*$/i,
    /^(?:https?:\/\/)?raw\.(?:githubusercontent|github)\.com\/.+?\/.+?\/.+?\/.+$/i,
    /^(?:https?:\/\/)?gist\.(?:githubusercontent|github)\.com\/.+?\/.+?\/.+$/i,
    /^(?:https?:\/\/)?github\.com\/.+?\/.+?\/tags.*$/i
];

function checkUrl(url) {
    return GITHUB_PATTERNS.some(pattern => pattern.test(url));
}

function makeRes(body, status = 200, headers = {}) {
    headers['access-control-allow-origin'] = '*';
    return new Response(body, {status, headers});
}

function newUrl(urlStr) {
    try {
        return new URL(urlStr);
    } catch (err) {
        console.error(`Invalid URL: ${urlStr}`, err);
        return null;
    }
}

addEventListener('fetch', e => {
    const ret = fetchHandler(e)
        .catch(err => makeRes('cfworker error:\n' + err.stack, 502));
    e.respondWith(ret);
});

async function fetchHandler(e, redirectCount = 0) {
    if (redirectCount > MAX_REDIRECTS) {
        return makeRes('Too many redirects', 502);
    }

    const req = e.request;
    const urlStr = req.url;
    const urlObj = new URL(urlStr);
    let path = urlObj.searchParams.get('q');

    if (urlObj.pathname === '/') {
        return Response.redirect('https://jiasu.in', 301);
    }

    path = urlObj.href.substr(urlObj.origin.length + PREFIX.length).replace(/^https?:\/+/, 'https://');
    
    if (checkUrl(path)) {
        if (path.search(GITHUB_PATTERNS[1]) === 0) {
            path = path.replace('/blob/', '/raw/');
        }
        return httpHandler(req, path);
    }

    return new Response('404 Not Found', {status: 404});
}

function httpHandler(req, pathname) {
    const reqHdrRaw = req.headers;

    if (req.method === 'OPTIONS' && reqHdrRaw.has('access-control-request-headers')) {
        return new Response(null, PREFLIGHT_INIT);
    }

    const reqHdrNew = new Headers(reqHdrRaw);

    if (pathname.search(/^https?:\/\//) !== 0) {
        pathname = 'https://' + pathname;
    }
    const urlObj = newUrl(pathname);

    const reqInit = {
        method: req.method,
        headers: reqHdrNew,
        redirect: 'manual',
        body: req.body
    };
    return proxy(urlObj, reqInit);
}

async function proxy(urlObj, reqInit, redirectCount = 0) {
    if (redirectCount > MAX_REDIRECTS) {
        return makeRes('Too many redirects', 502);
    }

    const res = await fetch(urlObj.href, reqInit);
    const resHdrOld = res.headers;
    const resHdrNew = new Headers(resHdrOld);

    if (resHdrNew.has('location')) {
        const location = resHdrNew.get('location');
        if (checkUrl(location)) {
            resHdrNew.set('location', PREFIX + location);
        } else {
            reqInit.redirect = 'follow';
            return proxy(newUrl(location), reqInit, redirectCount + 1);
        }
    }

    resHdrNew.set('access-control-expose-headers', '*');
    resHdrNew.set('access-control-allow-origin', '*');
    resHdrNew.delete('content-security-policy');
    resHdrNew.delete('content-security-policy-report-only');
    resHdrNew.delete('clear-site-data');

    return new Response(res.body, {
        status: res.status,
        headers: resHdrNew,
    });
}
