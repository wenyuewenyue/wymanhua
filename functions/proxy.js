export async function onRequest(context) {
  const reqUrl = new URL(context.request.url);
  const target = reqUrl.searchParams.get('url');
  const corsHeaders = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, HEAD, POST, OPTIONS',
    'access-control-allow-headers': '*'
  };
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (!target) {
    return new Response(JSON.stringify({ error: 'Missing url param' }), {
      status: 400,
      headers: { ...corsHeaders, 'content-type': 'application/json' }
    });
  }
  try {
    const tUrl = new URL(target);
    const referer = reqUrl.searchParams.get('referer') || (tUrl.origin + '/');
    const headers = new Headers({
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
      'Referer': referer,
      'Accept': '*/*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
    });
    if (reqUrl.searchParams.get('platform')) {
      headers.set('platform', reqUrl.searchParams.get('platform'));
      headers.set('webp', '1');
      headers.set('region', '1');
    }
    const resp = await fetch(target, { method: 'GET', headers, redirect: 'follow' });
    const outHeaders = new Headers(resp.headers);
    Object.entries(corsHeaders).forEach(([k, v]) => outHeaders.set(k, v));
    outHeaders.delete('content-security-policy');
    outHeaders.delete('x-frame-options');
    return new Response(resp.body, { status: resp.status, headers: outHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 502,
      headers: { ...corsHeaders, 'content-type': 'application/json' }
    });
  }
}
