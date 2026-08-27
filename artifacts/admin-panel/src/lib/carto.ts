// CARTO tile istekleri API proxy üzerinden gider — anahtar tarayıcıya açılmaz.
// Backend GET /api/map/tiles/{z}/{x}/{y} isteği alır, şifreli anahtarı çözer
// ve CARTO'ya iletir. Subdomain seçimi de proxy tarafında yapılır.
export const CARTO_LIGHT_TILE_URL = "/api/map/tiles/{z}/{x}/{y}";
