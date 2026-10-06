# Book Check — Setup Guide

Use your **@sjps.edu.hk** account for steps 1–3.

## 1. Google Sheet + Apps Script

1. Create a new Google Sheet (e.g. "Book Check").
2. **Extensions › Apps Script**. Replace the contents of `Code.gs` with `Code.gs` from this folder. Save.
3. In the function dropdown at the top, choose **setupSheet** and click **Run**. Allow the permissions.
   This creates the `Books` tab (with 3 sample rows, Condition dropdown and the `2026-27` column) and the `ScanLog` tab.
4. Delete the sample rows and enter your books. Keep BookIDs lowercase, e.g. `5a260001`.

## 2. Google sign-in (OAuth Client ID)

1. Go to <https://console.cloud.google.com> › create a project (e.g. "Book Check").
2. **APIs & Services › OAuth consent screen** (Google Auth Platform): App name "Book Check", User type **Internal**. Save.
3. **Clients › Create client** › Application type **Web application**.
   - Authorised JavaScript origins: `https://<your-github-username>.github.io`
   - (No redirect URI needed.)
4. Copy the **Client ID** (ends with `.apps.googleusercontent.com`).

> If the school blocks creating Cloud projects, do this step with a personal Gmail and choose User type **External**, then **Publish app**. Sign-in is still limited to @sjps.edu.hk by the code.

## 3. Deploy the API

1. In Apps Script, paste the Client ID into `CONFIG.CLIENT_ID` at the top of `Code.gs`. Save.
2. **Deploy › New deployment** › type **Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
3. Copy the **Web app URL** (ends with `/exec`).

> After any later change to `Code.gs`: **Deploy › Manage deployments › Edit (pencil) › Version: New version › Deploy**. The URL stays the same.

## 4. Web page (GitHub Pages)

1. In `index.html`, fill in `CONFIG.CLIENT_ID` and `CONFIG.API_URL`.
2. Put it in your GitHub repo, e.g. `school-tools/book-check/index.html`.
3. Repo **Settings › Pages** › Source: `main` branch, `/ (root)`.
4. Open `https://<username>.github.io/school-tools/book-check/` on an iPhone.
   Tip: in Safari, **Share › Add to Home Screen** for one-tap access.

## Barcode labels

The scanner reads **Code 128** (recommended), Code 39 and QR codes. It deliberately ignores ISBN/EAN barcodes, so a book's own barcode won't be picked up by mistake.

## How results are recorded

| Scan result | Shown to teacher | Sheet |
|---|---|---|
| Book belongs to this class | ✓ green + high beep | timestamp in the year column |
| Already scanned this year | "Already checked" amber | unchanged |
| Book belongs to another class | "Belongs to 5B" amber | timestamp written (book was found) |
| ID not in list | "Not in the book list" red | nothing |

Every scan is also logged in `ScanLog` with the teacher's email.
Books with Condition **Lost** are not counted as expected.
