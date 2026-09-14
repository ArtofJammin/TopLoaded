import { HttpError } from './http.js';
// Never fetch or embed submitted URLs. Known photo hosts only; this is not a
// malware verdict on their contents or redirects. Staff open links deliberately.
export function photoLinks(value = '') {
  const fail = () => { throw new HttpError(400, 'Use up to five HTTPS photo links from Google Photos/Drive, Imgur, Dropbox, OneDrive, iCloud or Postimages; one per line, 500 characters each.'); };
  if (typeof value !== 'string') fail();
  const links = value.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (links.length > 5) fail();
  return links.map(s => {
    let u; try { u = new URL(s); } catch { fail(); }
    const hosts = ['photos.app.goo.gl','photos.google.com','drive.google.com','imgur.com','www.imgur.com','i.imgur.com','dropbox.com','www.dropbox.com','1drv.ms','onedrive.live.com','icloud.com','www.icloud.com','postimg.cc','i.postimg.cc'];
    if (s.length > 500 || /[\s\u0000-\u001f\u007f]/.test(s) || /%0[ad]/i.test(s) || u.protocol !== 'https:' || u.username || u.password || u.port || !hosts.includes(u.hostname)) fail();
    return u.href;
  });
}
