# Search Practice — Setup Guide

A practice search engine ("Super Search") for P2 "Super Searchers" Lesson 2.
Students search for **"What colour is the recycling bin for paper in Hong Kong?"** and meet fake results,
scam pop-ups and fake forms. The teacher dashboard shows who fell for which trap.

- Student page: `index.html`. Students pick their class (2A–2E) and class number (1–30). They never enter a name.
- Teacher page: `teacher.html`, which needs an @sjps.edu.hk Google sign-in.
- Without an Apps Script URL, both pages run in **demo mode**: practice is saved only in that browser, so you can try it yourself first.

Use your **@sjps.edu.hk** account for steps 1–2.

## 1. Google Sheet + Apps Script

1. Create a new Google Sheet (e.g. "Search Practice").
2. **Extensions › Apps Script**. Replace the contents of `Code.gs` with `Code.gs` from this folder. Save.
3. In the function dropdown, choose **setupSheet** and click **Run**. Allow the permissions.
   This creates the `Log` and `Archive` tabs.

The Google sign-in Client ID is the same one Book Check uses, so you don't need a new one.

## 2. Deploy the API

1. **Deploy › New deployment** › type **Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
2. Copy the **Web app URL** (ends with `/exec`).

> After any later change to `Code.gs`: **Deploy › Manage deployments › Edit (pencil) › Version: New version › Deploy**. The URL stays the same.

## 3. Web pages

1. Paste the Web app URL into `CONFIG.API_URL` in **both** `index.html` and `teacher.html`.
2. Push to GitHub. The pages are then at:
   - Students: `https://ewong1237.github.io/school-tools/search-practice/`
   - Teacher: `https://ewong1237.github.io/school-tools/search-practice/teacher.html`
3. On the teacher page, **Show QR for students** puts a big QR code on the projector.

## In the lesson

1. Open the teacher page on the classroom computer and choose the class.
2. Students scan the QR code, choose their class and number, and start the mission.
3. Students get **no feedback** when they fall for a trap. Scam pages say "Thank you!" just like real ones.
4. For the debrief, switch to **Class view (projector)**. It shows class totals only, without class numbers.
5. Afterwards, click **Clear this class**. The data moves to the `Archive` tab.

## What is on the results page

| Result | What it is | What happens |
|---|---|---|
| Super Bins Shop *(Sponsored)* | Advert | Shop page. "Buy now" leads to a form asking for name, phone and address |
| Kids Prize Club *(Sponsored)* | Scam | Quiz says the paper bin is **green**, then asks for name, school, class, phone, address and birthday |
| HK Bin Facts | Fake information | Looks official ("✓ Checked by experts") but says paper goes in the **yellow** bin. Has a "Share with friends" button, a "You win a FREE iPad!" pop-up after 4 s and a free-iPad banner |
| Hong Kong Waste Reduction Website | **Real** EPD page | Opens the real page in a new Safari tab. The paper slot is **blue**, shown in the photos under "What to recycle?" |
| KidsAsk | Forum | Children's answers: green, brown, "my mum says blue but not sure" |
| Funny Videos | Off-topic | Pressing play shows "Your iPad has (3) viruses!", and "Clean Now" leads to a form asking for name and phone |

A "You win a FREE iPad!" pop-up also appears 12 seconds after the results page first opens.
"CLAIM NOW" leads to a form asking for name, phone, address and school. The small ✕ in the corner is the safe choice.

Searches must contain **paper** plus **bin**, **recycling** or **colour** (small spelling mistakes are fine).
Other searches show "did not match any good results".

## Privacy

- **What students type into the fake forms is never saved or sent.** Only *which boxes* were filled is recorded (e.g. "phone, address").
- Students are identified only by class and class number.
- What students type into the **search box** is recorded, so you can see their keywords.
- The Sheet stays in your Google Drive. Only signed-in @sjps.edu.hk accounts can read the data through the teacher page.

## What the Sheet records (`Log` tab)

| Type | Site | Detail |
|---|---|---|
| join | | |
| search | ok / no (keywords found?) | the search words |
| open | website opened | |
| popup_show / popup_tap / popup_close | ipad, virus, banner | page it appeared on |
| typed | website | which box: name, school, class, phone, address, birthday |
| submit | website | boxes that were filled |
| share | facts | (shared the fake information) |
| play | video | |
| answer | where they found it | colour chosen |
