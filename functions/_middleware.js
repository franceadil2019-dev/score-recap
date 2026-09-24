export async function onRequest(context) {
  const { request, next } = context;
  const url = new URL(request.url);

  // 1. إصلاح مسارات التقارير التي تحتوي على Slug لتصبح /report/12345
  if (url.pathname.startsWith('/report/')) {
    const segments = url.pathname.split('/').filter(Boolean);
    if (segments.length > 2) {
      const fixtureId = segments[1];
      if (/^\d+$/.test(fixtureId)) {
        url.pathname = `/report/${fixtureId}`;
        const newRequest = new Request(url.toString(), request);
        return next(newRequest);
      }
    }
  }

  // 2. تنفيذ الطلب وتمريره للكود الأصلي
  const response = await next();

  // 3. تحويل أي إعادة توجيه نسبي (مثل "/") إلى رابط مطلق لمنع خطأ Cloudflare
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    const location = response.headers.get("Location");
    if (location && location.startsWith("/")) {
      const absoluteUrl = new URL(location, request.url).href;
      const newHeaders = new Headers(response.headers);
      newHeaders.set("Location", absoluteUrl);

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders
      });
    }
  }

  return response;
}
