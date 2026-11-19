# Jin Assessment Studio — web version

The same app as the desktop version, running in the browser. It works on GitHub Pages (or any static web host) with no server code.

## Where your data goes

- Your work is saved automatically **in the browser on the computer you're using** (IndexedDB). Nothing is uploaded to GitHub or anywhere else.
- If you open the site on **another computer**, in **another browser**, or in a **private/incognito window**, it starts empty.
- To move your work, click **Save backup** to get a `.jasbackup` file. Copy the file to the other computer, open the site there and click **Restore backup**.
- Backups work in both directions between this web version and the desktop app.
- If you clear this site's data or browsing history, the saved work is deleted. Save backups regularly.
- **Settings → Automatic snapshots** keeps recent copies in the browser: one each time the site opens, and one before every restore.

## Put it on GitHub Pages

1. Create a new repository on GitHub. It must be public for free GitHub Pages.
2. Upload **everything in this folder**: `index.html`, `.nojekyll`, `css/`, `js/`, `assets/`, `fonts/` and `vendor/`. `index.html` must sit at the top level of the repository. Uploading through the web page skips hidden files, so you may need to create `.nojekyll` yourself with **Add file → Create new file**. It can stay empty.
3. Go to **Settings → Pages**. Under *Build and deployment*, choose **Deploy from a branch**, branch **main**, folder **/ (root)**, then click **Save**.
4. After a minute or two the site appears at `https://<your-username>.github.io/<repository-name>/`.

## Exports in the browser

| Feature | In the browser |
|---|---|
| Word (.docx), Excel (.xlsx), backup | Chrome and Edge ask where to save. Other browsers save to the Downloads folder. |
| PDF (exam, answer key, TOS) | The print dialog opens. Set the destination to **Save as PDF**. Chrome and Edge add the footer and page numbers. |
| Print | The normal print dialog. |
| Import PDF, Word, Excel, text, images | Works the same as in the desktop app. |

Opening `index.html` by double-clicking it (a `file://` address) is not supported, because PDF import needs a web address. Use the GitHub Pages link instead.
