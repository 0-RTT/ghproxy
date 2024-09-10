const path_match = [
    /^(?:https?:\/\/)?github\.com\/.+?\/.+?\/(?:releases|archive)\/.*(\?.*)?$/i,
    /^(?:https?:\/\/)?github\.com\/.+?\/.+?\/(?:blob|raw)\/.*(\?.*)?$/i,
    /^(?:https?:\/\/)?github\.com\/.+?\/.+?\/(?:info|git-).*$/i,
    /^(?:https?:\/\/)?raw\.(?:githubusercontent|github)\.com\/.+?\/.+?\/.+?\/.+(\?.*)?$/i,
    /^(?:https?:\/\/)?gist\.(?:githubusercontent|github)\.com\/.+?\/.+?\/.+(\?.*)?$/i,
    /^(?:https?:\/\/)?github\.com\/.+?\/.+?\/tags.*(\?.*)?$/i
  ];
  
  function checkUrl(url) {
    return path_match.some(pattern => pattern.test(url));
  }
  
  function constructUrl(req) {
    const rawPath = req.pathname.substring(1);
    const matches = /^(http:|https:)?\/{0,2}(.*)/.exec(rawPath);
    if (matches && matches.length >= 3) {
      const path = matches[2];
      let fullurl = `https://${path}${req.search}`;
      if (fullurl.includes('/blob/')) {
        fullurl = fullurl.replace('/blob/', '/raw/');
      }
      return checkUrl(fullurl) ? fullurl : null;
    }
    return null;
  }
  
  async function proxy(url, req) {
    const response = await fetch(url, {
      method: req.method,
      headers: req.headers,
      body: req.method === 'POST' ? req.body : null,
      redirect: 'follow'
    });
  
    return new Response(response.body, {
      status: response.status,
      headers: response.headers
    });
  }
  
  async function handleRequest(req) {
    const url = new URL(req.url);
    if (url.pathname === '/') {
      return Response.redirect('https://github.com/0-RTT/ghproxy-go', 301);
    }
    const fullurl = constructUrl(url);
    if (!fullurl) {
      return new Response('Invalid input.', { status: 403 });
    }
    return proxy(fullurl, req);
  }
  
  addEventListener('fetch', event => {
    event.respondWith(handleRequest(event.request));
  });
