# Deployment Guide for Vinyl Player

## Prerequisites
- A GitHub repository containing the project files.
- A Vercel account linked to the repository.
- Ensure the `vercel.json` file is present in the project root (it already is).

## Steps
1. **Commit your changes**
   ```bash
   git add .
   git commit -m "Fix chapter extraction, enlarge UI, prepare for deployment"
   ```
2. **Push to GitHub**
   ```bash
   git push origin main
   ```
3. **Import the repository in Vercel**
   - Go to the Vercel dashboard → *New Project* → *Import Git Repository*.
   - Select the repository you just pushed.
   - Vercel will detect the project as a static site.
4. **Configure Build Settings**
   - Build Command: `npm run build` (if you have a build script) or leave empty for static files.
   - Output Directory: `.` (project root) because the app is just static HTML/JS.
5. **Deploy**
   - Click *Deploy*.
   - Vercel will serve the site with the headers defined in `vercel.json`.

## Important Configuration
- The `vercel.json` includes the required **COOP** and **COEP** headers for `ffmpeg.wasm` (even though we now use MP4Box, these headers are still needed for any future WebAssembly usage).
- It also adds a MIME type header for `.wasm` files so browsers load them correctly.

## Verify Deployment
- After deployment, open the provided Vercel URL.
- Load an M4B file and check that the chapter list appears (now larger) and that the UI logs show the extraction process.
- If you see "No chapters found", open the browser console to view the logs displayed in the chapter menu.

## Troubleshooting
- **CORS errors**: Ensure the file is served from the same origin (Vercel does this automatically).
- **Missing `.wasm` files**: Verify they are present in the `js/` folder and that the MIME type header is applied.
- **Cache issues**: Clear the browser cache or open the site in an incognito window.

You can now share the Vercel URL with others; the application will work online.
