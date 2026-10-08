// Netlify functions run outside Next.js, where the real `server-only` package would throw on import.
// The function bundle (scripts/build-functions.mjs) aliases it to this empty module.
// The guard stays fully active inside the Next.js app itself.
export {}
